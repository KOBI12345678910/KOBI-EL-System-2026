/* ============================================================================
 * Techno-Kol ERP — Material Certificate (Mill Cert) Tracker
 * Agent Y-044 / Swarm Manufacturing / Mega-ERP Kobi EL 2026
 * ----------------------------------------------------------------------------
 * מערכת מעקב תעודות חומר (מיל-סרט) — מפעל מתכת "טכנו-קול עוזי"
 *
 * Domain:
 *   Every piece of structural steel, stainless sheet, pipe, tube or
 *   profile that enters the shop floor must be traceable back to the
 *   mill that produced it. The mill issues an **Inspection Certificate**
 *   per EN 10204 — one of four types (2.1, 2.2, 3.1, 3.2) — stating the
 *   heat number, chemistry, mechanical properties and standard the
 *   material conforms to (EN 10025 S355, ASTM A36, A572, A500, AISI
 *   304/316, …).
 *
 *   Israeli steel traders (חברת ברזל, ברזלי, שחם מתכות, מתכות כבירים,
 *   י.ד. ברזל, …) supply the cert PDF together with the delivery note.
 *   We store it, verify it against the declared standard, bind it to
 *   the physical lot we just received, and later generate a
 *   Certificate of Conformance (CoC) for the end customer that bundles
 *   every mill cert touched by the shipment.
 *
 * EN 10204 type cheat-sheet:
 *   2.1 — Declaration of compliance. Non-specific, supplier statement.
 *   2.2 — Test report. Non-specific tests, supplier signature.
 *   3.1 — Inspection certificate, specific testing, signed by mill
 *         QC (independent of production department).
 *   3.2 — Inspection certificate, specific testing, counter-signed by
 *         an external authorised inspector (Lloyd's, TÜV, …).
 *
 * Features implemented:
 *   1. receiveCert              — store a freshly arrived mill cert
 *   2. verifyAgainstStandard    — chemistry + mechanical vs spec
 *   3. associateWithLot         — bind a physical lot to a cert
 *   4. traceByLot               — full upstream trace to the mill cert
 *   5. traceByHeatNumber        — all lots from the same heat
 *   6. searchByStandard         — inventory of certified material
 *   7. alertExpiringInventory   — metals don't expire, but flag >5 y
 *   8. generateCoC              — Certificate of Conformance bundle
 *
 * RULES (לא מוחקים רק משדרגים ומגדלים):
 *   - Nothing is ever deleted. Revised certs stack into history[].
 *   - Lot reassignment keeps the previous binding in the audit log.
 *   - Zero external dependencies (pure Node built-ins only).
 *   - Bilingual Hebrew / English on every structure.
 *   - Chemistry percentages are mass %, elongation is %, strengths MPa.
 * ========================================================================== */

'use strict';

/* ----------------------------------------------------------------------------
 * 0. EN 10204 immutable catalog of certificate types
 * -------------------------------------------------------------------------- */
const EN10204_TYPES = Object.freeze({
  '2.1': Object.freeze({
    id: '2.1',
    he: 'הצהרת התאמה — לא ספציפי',
    en: 'Declaration of compliance (non-specific)',
    specific: false,
    requiresMillSignature: false,
    requiresIndependentInspector: false,
    tier: 1,
  }),
  '2.2': Object.freeze({
    id: '2.2',
    he: 'דוח בדיקה — לא ספציפי',
    en: 'Test report (non-specific)',
    specific: false,
    requiresMillSignature: true,
    requiresIndependentInspector: false,
    tier: 2,
  }),
  '3.1': Object.freeze({
    id: '3.1',
    he: 'תעודת בדיקה ספציפית — חתומה ע"י QC של היצרן',
    en: 'Inspection certificate (specific) — signed by mill QC',
    specific: true,
    requiresMillSignature: true,
    requiresIndependentInspector: false,
    tier: 3,
  }),
  '3.2': Object.freeze({
    id: '3.2',
    he: 'תעודת בדיקה ספציפית — חתומה גם ע"י מפקח חיצוני',
    en: 'Inspection certificate (specific) — counter-signed by independent inspector',
    specific: true,
    requiresMillSignature: true,
    requiresIndependentInspector: true,
    tier: 4,
  }),
});

/* ----------------------------------------------------------------------------
 * 1. Material-standard specification catalog
 *    Values are the *maxima* for chemistry (mass %) and *minima* for
 *    mechanical properties (MPa for strength, % for elongation).
 *    Sources: EN 10025-2:2019, ASTM A36-19, ASTM A572-18, ASTM A500-21,
 *    ASTM A312/A213 (for stainless equivalent grades).
 * -------------------------------------------------------------------------- */
const STANDARD_SPECS = Object.freeze({
  /* ---------- Structural carbon / low-alloy steels ---------- */
  'EN 10025 S235': Object.freeze({
    id: 'EN 10025 S235',
    family: 'structural-carbon',
    he: 'פלדה קונסטרוקטיבית S235',
    en: 'Structural steel S235JR',
    chemistryMax: { C: 0.22, Mn: 1.60, P: 0.045, S: 0.045, Si: 0.55, Cu: 0.55, N: 0.012 },
    mechanicalMin: { yieldStrength: 235, tensile: 360, elongation: 26 },
    tensileMax:    720,
  }),
  'EN 10025 S275': Object.freeze({
    id: 'EN 10025 S275',
    family: 'structural-carbon',
    he: 'פלדה קונסטרוקטיבית S275',
    en: 'Structural steel S275JR',
    chemistryMax: { C: 0.25, Mn: 1.60, P: 0.045, S: 0.045, Si: 0.55, Cu: 0.55, N: 0.012 },
    mechanicalMin: { yieldStrength: 275, tensile: 410, elongation: 23 },
    tensileMax:    720,
  }),
  'EN 10025 S355': Object.freeze({
    id: 'EN 10025 S355',
    family: 'structural-carbon',
    he: 'פלדה קונסטרוקטיבית S355',
    en: 'Structural steel S355JR',
    chemistryMax: { C: 0.24, Mn: 1.70, P: 0.045, S: 0.045, Si: 0.55, Cu: 0.55, N: 0.012 },
    mechanicalMin: { yieldStrength: 355, tensile: 470, elongation: 22 },
    tensileMax:    720,
  }),
  'ASTM A36': Object.freeze({
    id: 'ASTM A36',
    family: 'structural-carbon',
    he: 'פלדה קונסטרוקטיבית A36 (ASTM)',
    en: 'ASTM A36 carbon structural steel',
    chemistryMax: { C: 0.26, Mn: 1.03, P: 0.04, S: 0.05, Si: 0.40, Cu: 0.20 },
    mechanicalMin: { yieldStrength: 250, tensile: 400, elongation: 20 },
    tensileMax:    550,
  }),
  'ASTM A572 Gr50': Object.freeze({
    id: 'ASTM A572 Gr50',
    family: 'structural-hsla',
    he: 'פלדה HSLA — A572 Grade 50',
    en: 'ASTM A572 Grade 50 HSLA',
    chemistryMax: { C: 0.23, Mn: 1.35, P: 0.04, S: 0.05, Si: 0.40, Cu: 0.20, Nb: 0.05, V: 0.15 },
    mechanicalMin: { yieldStrength: 345, tensile: 450, elongation: 18 },
    tensileMax:    620,
  }),
  /* ---------- Hollow sections ---------- */
  'ASTM A500 Gr B': Object.freeze({
    id: 'ASTM A500 Gr B',
    family: 'hollow-section',
    he: 'פרופיל חלול A500 Grade B',
    en: 'ASTM A500 Grade B hollow structural section',
    chemistryMax: { C: 0.26, Mn: 1.35, P: 0.035, S: 0.035 },
    mechanicalMin: { yieldStrength: 290, tensile: 400, elongation: 23 },
    tensileMax:    560,
  }),
  /* ---------- Seamless / welded pipe ---------- */
  'EN 10216 P235GH': Object.freeze({
    id: 'EN 10216 P235GH',
    family: 'pressure-pipe',
    he: 'צינור לחץ P235GH',
    en: 'Seamless pressure pipe P235GH',
    chemistryMax: { C: 0.16, Mn: 1.20, P: 0.025, S: 0.020, Si: 0.35, Cr: 0.30, Mo: 0.08, Ni: 0.30, Cu: 0.30 },
    mechanicalMin: { yieldStrength: 235, tensile: 360, elongation: 25 },
    tensileMax:    500,
  }),
  /* ---------- Stainless steels (AISI → ASTM A240) ---------- */
  'AISI 304': Object.freeze({
    id: 'AISI 304',
    family: 'stainless',
    he: 'נירוסטה 304 (אוסטניטית)',
    en: 'AISI 304 austenitic stainless',
    chemistryMax: { C: 0.08, Mn: 2.00, P: 0.045, S: 0.030, Si: 0.75, Cr: 20.0, Ni: 10.5, N: 0.10 },
    chemistryMin: { Cr: 18.0, Ni: 8.0 },
    mechanicalMin: { yieldStrength: 205, tensile: 515, elongation: 40 },
    tensileMax:    900,
  }),
  'AISI 316': Object.freeze({
    id: 'AISI 316',
    family: 'stainless',
    he: 'נירוסטה 316 (עמידה בכלור)',
    en: 'AISI 316 molybdenum-bearing stainless',
    chemistryMax: { C: 0.08, Mn: 2.00, P: 0.045, S: 0.030, Si: 0.75, Cr: 18.0, Ni: 14.0, Mo: 3.00, N: 0.10 },
    chemistryMin: { Cr: 16.0, Ni: 10.0, Mo: 2.00 },
    mechanicalMin: { yieldStrength: 205, tensile: 515, elongation: 40 },
    tensileMax:    900,
  }),
});

/* ----------------------------------------------------------------------------
 * 2. Known Israeli steel-supplier formats (seed catalogue).
 *    Each supplier tends to use a consistent filename / heat-number
 *    prefix. We normalise so search-by-heat matches regardless of
 *    whitespace or dash style. Non-exhaustive — extend as new suppliers
 *    come online.
 * -------------------------------------------------------------------------- */
const ISRAELI_SUPPLIERS = Object.freeze({
  'חברת ברזל': Object.freeze({
    he: 'חברת ברזל בע"מ',
    en: 'Hevrat Barzel Ltd.',
    heatPrefix: ['HB', 'CB'],
    typicalCertType: '3.1',
    pdfNamePattern: /^CB[-_ ]?\d{6}/i,
  }),
  'ברזלי': Object.freeze({
    he: 'ברזלי מתכות',
    en: 'Barzeli Metals',
    heatPrefix: ['BZ'],
    typicalCertType: '2.2',
    pdfNamePattern: /^BZ[-_ ]?\d{4,}/i,
  }),
  'שחם מתכות': Object.freeze({
    he: 'שחם מתכות',
    en: 'Shaham Metals',
    heatPrefix: ['SH', 'SHM'],
    typicalCertType: '3.1',
    pdfNamePattern: /^SH[M]?[-_ ]?\d{5,}/i,
  }),
  'כבירים': Object.freeze({
    he: 'מתכות כבירים',
    en: 'Kvirim Metals',
    heatPrefix: ['KV', 'KVR'],
    typicalCertType: '3.1',
    pdfNamePattern: /^KV[R]?[-_ ]?\d{5,}/i,
  }),
  'י.ד. ברזל': Object.freeze({
    he: 'י.ד. ברזל',
    en: 'Y.D. Barzel',
    heatPrefix: ['YD'],
    typicalCertType: '2.2',
    pdfNamePattern: /^YD[-_ ]?\d{4,}/i,
  }),
});

/* ----------------------------------------------------------------------------
 * 3. Tiny helpers (no deps)
 * -------------------------------------------------------------------------- */
function _now() { return new Date().toISOString(); }

function _assertStr(v, name) {
  if (typeof v !== 'string' || v.length === 0) {
    throw new TypeError('invalid ' + name + ': must be non-empty string');
  }
}

function _assertNum(v, name) {
  if (typeof v !== 'number' || !isFinite(v) || v < 0) {
    throw new TypeError('invalid ' + name + ': ' + v);
  }
}

function _round(n, decimals) {
  const f = Math.pow(10, decimals || 2);
  return Math.round(n * f) / f;
}

function _deepCopy(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/** Normalise a heat number: upper-case, strip spaces / dashes / underscores. */
function _normaliseHeat(heat) {
  if (typeof heat !== 'string') return '';
  return heat.replace(/[\s\-_]+/g, '').toUpperCase();
}

/** Normalise a standard name so "EN10025S355" === "EN 10025 S355". */
function _normaliseStandard(std) {
  if (typeof std !== 'string') return '';
  return std.replace(/\s+/g, ' ').trim();
}

/* ----------------------------------------------------------------------------
 * 4. MaterialCertManager class
 * -------------------------------------------------------------------------- */
class MaterialCertManager {
  constructor() {
    /** @type {Map<string, Cert>} keyed by certId */
    this.certs = new Map();
    /** @type {Map<string, Lot>}  keyed by lotId */
    this.lots = new Map();
    /** @type {Map<string, Set<string>>} heatNumber → Set<certId> */
    this.heatIndex = new Map();
    /** @type {Map<string, Set<string>>} standard    → Set<certId> */
    this.standardIndex = new Map();
    /** @type {Array<AuditEntry>} never-delete audit log */
    this.auditLog = [];
    /** @type {number} monotonically increasing cert counter */
    this._certSeq = 0;
    /** @type {number} monotonically increasing lot counter */
    this._lotSeq = 0;
  }

  /* ---------- audit helper ---------- */
  _audit(action, payload) {
    this.auditLog.push({
      ts: _now(),
      action: action,
      payload: _deepCopy(payload),
    });
  }

  /* ==========================================================================
   * 4.1  receiveCert
   * ========================================================================= */
  /**
   * Register a freshly arrived mill certificate. If the same heat number is
   * received a second time (e.g. revised document) we keep the old record
   * inside history[] — nothing ever gets deleted.
   *
   * @param {object} input
   * @param {'2.1'|'2.2'|'3.1'|'3.2'} input.cert_type
   * @param {string} input.supplier                 — Israeli trader (Hebrew ok)
   * @param {string} input.mill                     — e.g. "ArcelorMittal Ostrava"
   * @param {string} input.heat_number
   * @param {string} input.material_grade           — e.g. "S355JR", "304"
   * @param {string} input.standard                 — e.g. "EN 10025 S355"
   * @param {object} [input.chemistry]              — mass %, see STANDARD_SPECS
   * @param {object} [input.mechanical]             — { yieldStrength, tensile, elongation, hardness, impact }
   * @param {object} [input.dimensions]             — free-form { thickness, width, length, OD, wallThickness, ... }
   * @param {number} [input.quantity]               — number of physical pieces
   * @param {string} [input.inspectorStamp]         — inspector id (required for 3.2)
   * @param {Array<string>} [input.documents]       — array of PDF paths
   * @param {string} [input.issueDate]              — ISO date, defaults to now
   */
  receiveCert(input) {
    if (!input || typeof input !== 'object') {
      throw new TypeError('receiveCert: input object required');
    }
    const type = EN10204_TYPES[input.cert_type];
    if (!type) {
      throw new TypeError('invalid cert_type "' + input.cert_type +
        '" — must be one of ' + Object.keys(EN10204_TYPES).join(', '));
    }
    _assertStr(input.supplier, 'supplier');
    _assertStr(input.mill, 'mill');
    _assertStr(input.heat_number, 'heat_number');
    _assertStr(input.material_grade, 'material_grade');
    _assertStr(input.standard, 'standard');

    // Type 3.2 requires an independent inspector stamp.
    if (type.requiresIndependentInspector && !input.inspectorStamp) {
      throw new Error('EN 10204 type 3.2 requires "inspectorStamp" (independent inspector)');
    }

    if (input.quantity !== undefined) _assertNum(input.quantity, 'quantity');

    const normalizedHeat = _normaliseHeat(input.heat_number);
    const normalizedStd = _normaliseStandard(input.standard);

    // Detect whether we already have a cert for this heat number — if
    // yes, new cert becomes a revision and we push the old one onto the
    // history stack. We NEVER delete the old record.
    let certId;
    let historyFromPrev = [];
    let createdAt = _now();
    const existingCertId = this._findLatestCertIdByHeat(normalizedHeat);
    if (existingCertId) {
      const prev = this.certs.get(existingCertId);
      historyFromPrev = prev.history.concat([_deepCopy(Object.assign({}, prev, { history: undefined }))]);
      createdAt = prev.createdAt;
      certId = existingCertId; // same id, new version
    } else {
      this._certSeq += 1;
      certId = 'CERT-' + String(this._certSeq).padStart(6, '0');
    }

    const chemistry  = input.chemistry  ? _deepCopy(input.chemistry)  : {};
    const mechanical = input.mechanical ? _deepCopy(input.mechanical) : {};
    const dimensions = input.dimensions ? _deepCopy(input.dimensions) : {};
    const documents  = Array.isArray(input.documents) ? input.documents.slice() : [];

    const cert = {
      certId: certId,
      cert_type: input.cert_type,
      cert_type_he: type.he,
      cert_type_en: type.en,
      tier: type.tier,
      supplier: input.supplier,
      supplier_meta: ISRAELI_SUPPLIERS[input.supplier] ? _deepCopy(ISRAELI_SUPPLIERS[input.supplier]) : null,
      mill: input.mill,
      heat_number: input.heat_number,
      heat_number_normalized: normalizedHeat,
      material_grade: input.material_grade,
      standard: normalizedStd,
      chemistry: chemistry,
      mechanical: mechanical,
      dimensions: dimensions,
      quantity: typeof input.quantity === 'number' ? input.quantity : 0,
      inspectorStamp: input.inspectorStamp || null,
      documents: documents,
      issueDate: input.issueDate || _now(),
      receivedAt: _now(),
      createdAt: createdAt,
      updatedAt: _now(),
      version: historyFromPrev.length + 1,
      history: historyFromPrev,
      lots: existingCertId ? this.certs.get(existingCertId).lots.slice() : [],
    };

    this.certs.set(certId, cert);

    // Heat index
    if (!this.heatIndex.has(normalizedHeat)) {
      this.heatIndex.set(normalizedHeat, new Set());
    }
    this.heatIndex.get(normalizedHeat).add(certId);

    // Standard index
    if (!this.standardIndex.has(normalizedStd)) {
      this.standardIndex.set(normalizedStd, new Set());
    }
    this.standardIndex.get(normalizedStd).add(certId);

    this._audit('receiveCert', {
      certId: certId,
      cert_type: cert.cert_type,
      heat_number: cert.heat_number,
      supplier: cert.supplier,
      version: cert.version,
    });
    return cert;
  }

  _findLatestCertIdByHeat(normalizedHeat) {
    const set = this.heatIndex.get(normalizedHeat);
    if (!set || set.size === 0) return null;
    // Return the most recently created cert with that heat
    let latest = null;
    let latestTs = -Infinity;
    for (const id of set) {
      const c = this.certs.get(id);
      if (!c) continue;
      const ts = new Date(c.receivedAt).getTime();
      if (ts > latestTs) {
        latestTs = ts;
        latest = id;
      }
    }
    return latest;
  }

  /* ==========================================================================
   * 4.2  verifyAgainstStandard
   * ========================================================================= */
  /**
   * Compare a stored certificate (or arbitrary cert-shaped object) against a
   * known material-standard spec. Returns a pass/fail report with per-element
   * breakdown. `standardSpec` may be the id of a spec in STANDARD_SPECS, the
   * spec object itself, or falsy → we fall back to the cert's own standard.
   */
  verifyAgainstStandard(cert, standardSpec) {
    if (!cert || typeof cert !== 'object') {
      throw new TypeError('verifyAgainstStandard: cert object required');
    }
    // Resolve spec
    let spec = null;
    if (!standardSpec) {
      spec = STANDARD_SPECS[_normaliseStandard(cert.standard || '')];
    } else if (typeof standardSpec === 'string') {
      spec = STANDARD_SPECS[_normaliseStandard(standardSpec)];
    } else if (typeof standardSpec === 'object') {
      spec = standardSpec;
    }
    if (!spec) {
      return {
        certId: cert.certId || null,
        standard: cert.standard || null,
        pass: false,
        reason_he: 'לא נמצא תקן — אין אפשרות לבצע בדיקה',
        reason_en: 'Unknown standard — cannot verify',
        chemistry_checks: [],
        mechanical_checks: [],
      };
    }

    const chemistry_checks = [];
    // Maxima — any value above the max fails
    if (spec.chemistryMax) {
      for (const el of Object.keys(spec.chemistryMax)) {
        const declared = (cert.chemistry || {})[el];
        const max = spec.chemistryMax[el];
        if (typeof declared !== 'number') {
          chemistry_checks.push({ element: el, kind: 'max', limit: max, actual: null, pass: false, reason: 'missing' });
        } else {
          chemistry_checks.push({
            element: el,
            kind: 'max',
            limit: max,
            actual: declared,
            pass: declared <= max,
            delta: _round(max - declared, 4),
          });
        }
      }
    }
    // Minima — any value below the min fails (e.g. Cr in 304 must be >= 18)
    if (spec.chemistryMin) {
      for (const el of Object.keys(spec.chemistryMin)) {
        const declared = (cert.chemistry || {})[el];
        const min = spec.chemistryMin[el];
        if (typeof declared !== 'number') {
          chemistry_checks.push({ element: el, kind: 'min', limit: min, actual: null, pass: false, reason: 'missing' });
        } else {
          chemistry_checks.push({
            element: el,
            kind: 'min',
            limit: min,
            actual: declared,
            pass: declared >= min,
            delta: _round(declared - min, 4),
          });
        }
      }
    }

    const mechanical_checks = [];
    if (spec.mechanicalMin) {
      for (const prop of Object.keys(spec.mechanicalMin)) {
        const declared = (cert.mechanical || {})[prop];
        const min = spec.mechanicalMin[prop];
        if (typeof declared !== 'number') {
          mechanical_checks.push({ property: prop, kind: 'min', limit: min, actual: null, pass: false, reason: 'missing' });
        } else {
          mechanical_checks.push({
            property: prop,
            kind: 'min',
            limit: min,
            actual: declared,
            pass: declared >= min,
            delta: _round(declared - min, 2),
          });
        }
      }
    }
    if (typeof spec.tensileMax === 'number') {
      const declared = (cert.mechanical || {}).tensile;
      if (typeof declared === 'number') {
        mechanical_checks.push({
          property: 'tensile',
          kind: 'max',
          limit: spec.tensileMax,
          actual: declared,
          pass: declared <= spec.tensileMax,
          delta: _round(spec.tensileMax - declared, 2),
        });
      }
    }

    const chemPass = chemistry_checks.every((c) => c.pass);
    const mechPass = mechanical_checks.every((c) => c.pass);
    const pass = chemPass && mechPass;

    return {
      certId: cert.certId || null,
      standard: spec.id,
      standard_he: spec.he || null,
      standard_en: spec.en || null,
      pass: pass,
      chemistry_pass: chemPass,
      mechanical_pass: mechPass,
      chemistry_checks: chemistry_checks,
      mechanical_checks: mechanical_checks,
      summary_he: pass ? 'התעודה תקינה לפי התקן' : 'התעודה נכשלה בבדיקה מול התקן',
      summary_en: pass ? 'Certificate conforms to standard' : 'Certificate FAILS standard check',
    };
  }

  /* ==========================================================================
   * 4.3  associateWithLot
   * ========================================================================= */
  /**
   * Bind a physical lot to an existing cert. If the lot doesn't exist yet
   * we create it on the fly. Re-binding a lot to a new cert keeps the old
   * binding in the lot's history[].
   *
   * @param {string} certId
   * @param {string|object} lotOrId
   *        string → existing lot id
   *        object → new lot payload { id?, description, quantity, location, weightKg, ... }
   */
  associateWithLot(certId, lotOrId) {
    const cert = this.certs.get(certId);
    if (!cert) throw new Error('unknown cert: ' + certId);

    let lot;
    if (typeof lotOrId === 'string') {
      lot = this.lots.get(lotOrId);
      if (!lot) throw new Error('unknown lot: ' + lotOrId);
    } else if (lotOrId && typeof lotOrId === 'object') {
      const id = lotOrId.id || this._nextLotId();
      lot = this.lots.get(id);
      if (!lot) {
        lot = {
          lotId: id,
          description: lotOrId.description || '',
          quantity: typeof lotOrId.quantity === 'number' ? lotOrId.quantity : 0,
          location: lotOrId.location || '',
          weightKg: typeof lotOrId.weightKg === 'number' ? lotOrId.weightKg : null,
          certId: null,
          createdAt: _now(),
          history: [],
        };
        this.lots.set(id, lot);
      }
    } else {
      throw new TypeError('associateWithLot: lotOrId must be string or object');
    }

    if (lot.certId && lot.certId !== certId) {
      lot.history.push({
        previousCertId: lot.certId,
        rebindingAt: _now(),
      });
    }
    lot.certId = certId;
    lot.updatedAt = _now();

    if (!cert.lots.includes(lot.lotId)) {
      cert.lots.push(lot.lotId);
      cert.updatedAt = _now();
    }

    this._audit('associateWithLot', { certId: certId, lotId: lot.lotId });
    return lot;
  }

  _nextLotId() {
    this._lotSeq += 1;
    return 'LOT-' + String(this._lotSeq).padStart(6, '0');
  }

  /* ==========================================================================
   * 4.4  traceByLot
   * ========================================================================= */
  /**
   * Full upstream trace from a physical lot to the mill cert.
   * Returns a structured object bundling lot → cert → supplier → mill +
   * the conformance verification against the declared standard.
   */
  traceByLot(lotId) {
    const lot = this.lots.get(lotId);
    if (!lot) throw new Error('unknown lot: ' + lotId);
    if (!lot.certId) {
      return {
        lotId: lotId,
        traced: false,
        reason_he: 'המגרש אינו מקושר לתעודה',
        reason_en: 'Lot is not yet associated with a certificate',
      };
    }
    const cert = this.certs.get(lot.certId);
    if (!cert) {
      return {
        lotId: lotId,
        traced: false,
        reason_he: 'התעודה חסרה באינדקס',
        reason_en: 'Certificate missing from index',
      };
    }
    const verification = this.verifyAgainstStandard(cert);

    return {
      lotId: lotId,
      lot: _deepCopy(lot),
      traced: true,
      certId: cert.certId,
      cert_type: cert.cert_type,
      cert_type_he: cert.cert_type_he,
      cert_type_en: cert.cert_type_en,
      heat_number: cert.heat_number,
      supplier: cert.supplier,
      mill: cert.mill,
      material_grade: cert.material_grade,
      standard: cert.standard,
      verification: verification,
      issueDate: cert.issueDate,
      version: cert.version,
    };
  }

  /* ==========================================================================
   * 4.5  traceByHeatNumber
   * ========================================================================= */
  /**
   * Return every lot ever cut from a given heat number (aka "pedigree").
   * Accepts unnormalised heat numbers — "HB-123456" and "hb123456" match.
   */
  traceByHeatNumber(heat) {
    const norm = _normaliseHeat(heat);
    const certIds = this.heatIndex.get(norm);
    if (!certIds || certIds.size === 0) {
      return {
        heat_number: heat,
        found: false,
        certs: [],
        lots: [],
      };
    }
    const certs = [];
    const lots = [];
    for (const certId of certIds) {
      const c = this.certs.get(certId);
      if (!c) continue;
      certs.push({
        certId: c.certId,
        cert_type: c.cert_type,
        supplier: c.supplier,
        mill: c.mill,
        standard: c.standard,
        material_grade: c.material_grade,
        version: c.version,
        issueDate: c.issueDate,
      });
      for (const lotId of c.lots) {
        const l = this.lots.get(lotId);
        if (l) lots.push(_deepCopy(l));
      }
    }
    return {
      heat_number: heat,
      heat_number_normalized: norm,
      found: true,
      certs: certs,
      lots: lots,
    };
  }

  /* ==========================================================================
   * 4.6  searchByStandard
   * ========================================================================= */
  /**
   * Return a lightweight inventory of every cert we hold for a given
   * material standard, plus per-cert total quantity and all linked lots.
   */
  searchByStandard(standard) {
    const norm = _normaliseStandard(standard);
    const ids = this.standardIndex.get(norm);
    if (!ids || ids.size === 0) {
      return {
        standard: standard,
        found: false,
        totalQuantity: 0,
        certs: [],
      };
    }
    const certs = [];
    let totalQty = 0;
    for (const id of ids) {
      const c = this.certs.get(id);
      if (!c) continue;
      totalQty += c.quantity;
      certs.push({
        certId: c.certId,
        cert_type: c.cert_type,
        heat_number: c.heat_number,
        supplier: c.supplier,
        mill: c.mill,
        material_grade: c.material_grade,
        quantity: c.quantity,
        receivedAt: c.receivedAt,
        lots: c.lots.slice(),
      });
    }
    return {
      standard: norm,
      found: true,
      totalQuantity: _round(totalQty, 4),
      certCount: certs.length,
      certs: certs,
    };
  }

  /* ==========================================================================
   * 4.7  alertExpiringInventory
   * ========================================================================= */
  /**
   * Metals don't technically expire — but long-term outdoor storage
   * introduces risks (surface oxidation, lost stamp, rolling stock
   * mixed up). This method flags every cert older than `yearsThreshold`
   * (default 5 years) so the QA department can re-inspect the lot and
   * re-stamp the material before releasing it to production.
   *
   * @param {{ yearsThreshold?: number, referenceDate?: string }} [opts]
   */
  alertExpiringInventory(opts) {
    const yearsThreshold = (opts && typeof opts.yearsThreshold === 'number') ? opts.yearsThreshold : 5;
    const refDate = (opts && opts.referenceDate) ? new Date(opts.referenceDate) : new Date();
    const thresholdMs = yearsThreshold * 365.25 * 24 * 3600 * 1000;

    const flagged = [];
    for (const cert of this.certs.values()) {
      const issueTs = new Date(cert.issueDate || cert.receivedAt).getTime();
      const ageMs = refDate.getTime() - issueTs;
      if (ageMs >= thresholdMs) {
        flagged.push({
          certId: cert.certId,
          heat_number: cert.heat_number,
          supplier: cert.supplier,
          mill: cert.mill,
          standard: cert.standard,
          issueDate: cert.issueDate,
          ageYears: _round(ageMs / (365.25 * 24 * 3600 * 1000), 2),
          lots: cert.lots.slice(),
          action_he: 'יש לבצע בדיקה מחודשת ולחדש חותמת QA',
          action_en: 'Re-inspect and re-stamp before release to production',
        });
      }
    }
    return {
      yearsThreshold: yearsThreshold,
      referenceDate: refDate.toISOString(),
      flagged_count: flagged.length,
      flagged: flagged,
      note_he: 'מתכות אינן פגות תוקף, אך יש לסמן אחסון ממושך לבדיקה חוזרת',
      note_en: 'Metals do not expire, but long-term storage triggers re-inspection',
    };
  }

  /* ==========================================================================
   * 4.8  generateCoC
   * ========================================================================= */
  /**
   * Generate a Certificate of Conformance bundling every mill cert
   * referenced by any lot in a given shipment.
   *
   * @param {object} shipment
   * @param {string} shipment.id
   * @param {string} [shipment.customer]
   * @param {string} [shipment.date]
   * @param {Array<string>} shipment.lotIds
   */
  generateCoC(shipment) {
    if (!shipment || typeof shipment !== 'object') {
      throw new TypeError('generateCoC: shipment object required');
    }
    _assertStr(shipment.id, 'shipment.id');
    if (!Array.isArray(shipment.lotIds) || shipment.lotIds.length === 0) {
      throw new TypeError('shipment.lotIds must be a non-empty array');
    }

    const certIdsSeen = new Set();
    const lotReports = [];
    const failedChecks = [];
    let totalQty = 0;

    for (const lotId of shipment.lotIds) {
      const lot = this.lots.get(lotId);
      if (!lot) {
        failedChecks.push({
          lotId: lotId,
          reason_he: 'מגרש לא קיים',
          reason_en: 'lot not found',
        });
        continue;
      }
      if (!lot.certId) {
        failedChecks.push({
          lotId: lotId,
          reason_he: 'מגרש ללא תעודה מקושרת',
          reason_en: 'lot has no linked certificate',
        });
        continue;
      }
      const cert = this.certs.get(lot.certId);
      if (!cert) {
        failedChecks.push({
          lotId: lotId,
          reason_he: 'התעודה המקושרת חסרה',
          reason_en: 'linked certificate missing',
        });
        continue;
      }

      certIdsSeen.add(cert.certId);
      const verification = this.verifyAgainstStandard(cert);
      if (!verification.pass) {
        failedChecks.push({
          lotId: lotId,
          certId: cert.certId,
          reason_he: 'התעודה נכשלה בבדיקה מול התקן',
          reason_en: 'certificate failed standard verification',
          detail: verification,
        });
      }

      totalQty += (typeof lot.quantity === 'number' ? lot.quantity : 0);

      lotReports.push({
        lotId: lotId,
        description: lot.description,
        quantity: lot.quantity,
        weightKg: lot.weightKg,
        certId: cert.certId,
        cert_type: cert.cert_type,
        cert_type_he: cert.cert_type_he,
        cert_type_en: cert.cert_type_en,
        heat_number: cert.heat_number,
        supplier: cert.supplier,
        mill: cert.mill,
        material_grade: cert.material_grade,
        standard: cert.standard,
        issueDate: cert.issueDate,
        verification: verification,
      });
    }

    // Gather cert summaries (one per unique cert)
    const certSummaries = [];
    for (const certId of certIdsSeen) {
      const c = this.certs.get(certId);
      if (!c) continue;
      certSummaries.push({
        certId: c.certId,
        cert_type: c.cert_type,
        cert_type_he: c.cert_type_he,
        heat_number: c.heat_number,
        supplier: c.supplier,
        mill: c.mill,
        standard: c.standard,
        material_grade: c.material_grade,
        documents: c.documents.slice(),
        inspectorStamp: c.inspectorStamp,
      });
    }

    const coc = {
      coc_id: 'COC-' + shipment.id,
      shipment_id: shipment.id,
      customer: shipment.customer || null,
      issuedAt: _now(),
      shipmentDate: shipment.date || null,
      title_he: 'תעודת התאמה — Certificate of Conformance',
      title_en: 'Certificate of Conformance',
      statement_he: 'אנו מאשרים כי החומר שסופק תואם לדרישות התקנים המצוינים, על בסיס תעודות היצרן הרשומות.',
      statement_en: 'We hereby certify that the material supplied conforms to the quoted standards, based on the mill certificates listed.',
      totalLots: lotReports.length,
      totalQuantity: _round(totalQty, 4),
      totalCerts: certSummaries.length,
      certs: certSummaries,
      lots: lotReports,
      failedChecks: failedChecks,
      allPassed: failedChecks.length === 0,
    };

    this._audit('generateCoC', {
      coc_id: coc.coc_id,
      shipment_id: shipment.id,
      lotCount: lotReports.length,
      certCount: certSummaries.length,
      allPassed: coc.allPassed,
    });

    return coc;
  }
}

/* ----------------------------------------------------------------------------
 * Exports
 * -------------------------------------------------------------------------- */
module.exports = {
  MaterialCertManager: MaterialCertManager,
  EN10204_TYPES: EN10204_TYPES,
  STANDARD_SPECS: STANDARD_SPECS,
  ISRAELI_SUPPLIERS: ISRAELI_SUPPLIERS,
};
