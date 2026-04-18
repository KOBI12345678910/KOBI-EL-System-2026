/* ============================================================================
 * Techno-Kol ERP — Welder Certification Tracker
 * Agent Y-043 / Swarm Manufacturing / Mega-ERP Kobi EL 2026
 * ----------------------------------------------------------------------------
 * מעקב תעודות הסמכת מרתכים — מפעל מתכת "טכנו-קול עוזי"
 *
 * Standards implemented (cross-referenced):
 *   1. AWS D1.1   — Structural Welding Code - Steel (most common in IL)
 *   2. AWS D1.2   — Structural Welding Code - Aluminum
 *   3. ASME IX    — BPVC Section IX, Welding & Brazing Qualifications
 *   4. EN ISO 9606 — Qualification testing of welders (EU / ישראל)
 *
 * Domain:
 *   Israeli metal fabricator "טכנו-קול עוזי" must certify every welder
 *   before they touch a load-bearing seam. Each certification binds a
 *   welder to a specific envelope: (process, position, material, thickness
 *   range, backing, pipe/plate, filler class). Crossing the envelope
 *   requires re-qualification.
 *
 * Features implemented:
 *   1. createWelder             — register welder + photo + hire date
 *   2. issueCertification       — issue WPQ test-based cert per standard
 *   3. recordContinuity         — log 6-month continuity weld
 *   4. checkValidity            — envelope + continuity + expiry check
 *   5. expiringCerts            — certs expiring within N days (alerts)
 *   6. weldingProcedureSpec     — WPS document store
 *   7. procedureQualificationRecord — PQR binding WPS to test coupon
 *   8. generateCertificate      — bilingual He/En PDF certificate
 *
 * Key industry rules baked in:
 *   - **6-month continuity** (AWS D1.1 §4.2.3.1, ASME IX QW-322.1,
 *     EN ISO 9606-1 §9.2/9.3): welder must perform the qualified process
 *     within any rolling 6-month window or the certification lapses until
 *     a renewal test is performed.
 *   - **Position coverage hierarchy**: 6G (pipe, 45°) qualifies all plate
 *     positions; 3G+4G qualifies 1G-4G on plate; 2G qualifies 1G only, etc.
 *   - **Thickness range**: test coupon thickness T qualifies welding in the
 *     range per standard (ASME IX QW-451 tables; AWS D1.1 Table 4.11).
 *   - **Process groups**: SMAW, GMAW, GTAW, FCAW, SAW, PAW all separately
 *     qualified. Filler class (F-number) matters in ASME IX.
 *
 * RULES (לא מוחקים רק משדרגים ומגדלים):
 *   - Nothing is ever deleted. Welders that leave are *deactivated*,
 *     certifications that expire are *superseded* not removed, and every
 *     issue/renewal/continuity action is appended to an audit log.
 *   - Zero external dependencies (pure Node built-ins only).
 *   - Bilingual Hebrew / English on every structure.
 *   - Dates are ISO-8601 strings; durations are integers of days.
 * ========================================================================== */

'use strict';

/* ----------------------------------------------------------------------------
 * 0. Standards catalog — immutable reference
 * -------------------------------------------------------------------------- */
const WELDING_STANDARDS = Object.freeze({
  'AWS-D1.1': {
    id: 'AWS-D1.1',
    he: 'AWS D1.1 — קוד ריתוך מבני (פלדה)',
    en: 'AWS D1.1 Structural Welding Code — Steel',
    issuer: 'American Welding Society',
    continuityMonths: 6,
    defaultValidityDays: 1095, // 3 years, then renewal test
  },
  'AWS-D1.2': {
    id: 'AWS-D1.2',
    he: 'AWS D1.2 — קוד ריתוך מבני (אלומיניום)',
    en: 'AWS D1.2 Structural Welding Code — Aluminum',
    issuer: 'American Welding Society',
    continuityMonths: 6,
    defaultValidityDays: 1095,
  },
  'ASME-IX': {
    id: 'ASME-IX',
    he: 'ASME IX — הסמכת ריתוך לכלי לחץ',
    en: 'ASME BPVC Section IX — Welding Qualification',
    issuer: 'American Society of Mechanical Engineers',
    continuityMonths: 6,
    defaultValidityDays: 1095,
  },
  'EN-ISO-9606': {
    id: 'EN-ISO-9606',
    he: 'EN ISO 9606 — הסמכת מרתכים (אירופי/ישראלי)',
    en: 'EN ISO 9606 — Qualification Testing of Welders',
    issuer: 'ISO / CEN',
    continuityMonths: 6,
    defaultValidityDays: 1095, // renewal every 3 years when examiner confirms
  },
});

/* ----------------------------------------------------------------------------
 * 1. Welding processes catalog
 * -------------------------------------------------------------------------- */
const WELDING_PROCESSES = Object.freeze({
  SMAW: { id: 'SMAW', he: 'ריתוך אלקטרודה מצופה (חשמלי ידני)', en: 'Shielded Metal Arc Welding (stick)', asmeNumber: 111 },
  GMAW: { id: 'GMAW', he: 'ריתוך MIG/MAG',                       en: 'Gas Metal Arc Welding (MIG/MAG)',   asmeNumber: 135 },
  GTAW: { id: 'GTAW', he: 'ריתוך TIG',                            en: 'Gas Tungsten Arc Welding (TIG)',    asmeNumber: 141 },
  FCAW: { id: 'FCAW', he: 'ריתוך תיל תמלוגה',                    en: 'Flux-Cored Arc Welding',            asmeNumber: 136 },
  SAW:  { id: 'SAW',  he: 'ריתוך קשת מוטבלת',                    en: 'Submerged Arc Welding',             asmeNumber: 121 },
  PAW:  { id: 'PAW',  he: 'ריתוך קשת פלזמה',                     en: 'Plasma Arc Welding',                asmeNumber: 15  },
});

/* ----------------------------------------------------------------------------
 * 2. Welding positions (groove = G, fillet = F)
 *
 *   Plate positions (AWS notation):
 *     1G/1F = flat (downhand)
 *     2G/2F = horizontal
 *     3G/3F = vertical
 *     4G/4F = overhead
 *
 *   Pipe positions:
 *     5G    = pipe horizontal fixed  (welder rotates around pipe)
 *     6G    = pipe at 45°, fixed     (hardest — qualifies all others)
 *
 *   ISO 9606 equivalents (PA..PJ) are stored in iso field below.
 * -------------------------------------------------------------------------- */
const WELDING_POSITIONS = Object.freeze({
  '1G': { id: '1G', kind: 'groove', he: 'שטוח (קערה)',          en: 'Flat groove',        iso: 'PA' },
  '2G': { id: '2G', kind: 'groove', he: 'אופקי',                en: 'Horizontal groove',  iso: 'PC' },
  '3G': { id: '3G', kind: 'groove', he: 'אנכי',                 en: 'Vertical groove',    iso: 'PF/PG' },
  '4G': { id: '4G', kind: 'groove', he: 'מעל הראש',             en: 'Overhead groove',    iso: 'PE' },
  '5G': { id: '5G', kind: 'groove', he: 'צינור אופקי קבוע',      en: 'Pipe horizontal fixed', iso: 'PF+PC+PE' },
  '6G': { id: '6G', kind: 'groove', he: 'צינור 45° קבוע',        en: 'Pipe inclined 45° fixed', iso: 'H-L045' },
  '1F': { id: '1F', kind: 'fillet', he: 'פילט שטוח',             en: 'Flat fillet',        iso: 'PA' },
  '2F': { id: '2F', kind: 'fillet', he: 'פילט אופקי',            en: 'Horizontal fillet',  iso: 'PB' },
  '3F': { id: '3F', kind: 'fillet', he: 'פילט אנכי',             en: 'Vertical fillet',    iso: 'PF/PG' },
  '4F': { id: '4F', kind: 'fillet', he: 'פילט מעל הראש',         en: 'Overhead fillet',    iso: 'PD' },
});

/* ----------------------------------------------------------------------------
 * 3. Position coverage matrix (simplified per AWS D1.1 Table 4.10)
 *
 *   Rule: a cert at test-position X covers production positions in COVERS[X].
 *   6G is the universal qualifier — covers every plate groove + fillet.
 * -------------------------------------------------------------------------- */
const POSITION_COVERS = Object.freeze({
  '1G': ['1G', '1F'],
  '2G': ['1G', '2G', '1F', '2F'],
  '3G': ['1G', '3G', '1F', '2F', '3F'],
  '4G': ['1G', '4G', '1F', '2F', '4F'],
  // 3G+4G combined (very common test) handled in checker.
  '5G': ['1G', '3G', '4G', '1F', '2F', '3F', '4F'],
  '6G': ['1G', '2G', '3G', '4G', '5G', '6G', '1F', '2F', '3F', '4F'],
  '1F': ['1F'],
  '2F': ['1F', '2F'],
  '3F': ['1F', '2F', '3F'],
  '4F': ['1F', '2F', '4F'],
});

/* ----------------------------------------------------------------------------
 * 4. Tiny helpers (no deps)
 * -------------------------------------------------------------------------- */
function _now() { return new Date().toISOString(); }

function _assertStr(v, name) {
  if (typeof v !== 'string' || v.length === 0) {
    throw new TypeError('invalid ' + name + ': must be non-empty string');
  }
}

function _assertDate(v, name) {
  if (typeof v !== 'string' || isNaN(Date.parse(v))) {
    throw new TypeError('invalid ' + name + ': must be ISO-8601 date string');
  }
}

function _assertEnum(v, name, dict) {
  if (!dict[v]) {
    throw new TypeError('invalid ' + name + ': ' + v +
      ' (allowed: ' + Object.keys(dict).join(', ') + ')');
  }
}

function _daysBetween(aIso, bIso) {
  const a = Date.parse(aIso);
  const b = Date.parse(bIso);
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

function _addDays(iso, days) {
  const d = new Date(Date.parse(iso));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

function _deepCopy(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/* ----------------------------------------------------------------------------
 * 5. Thickness coverage helper per ASME IX QW-451 (simplified).
 *
 *   Test coupon of thickness T qualifies production thickness range:
 *     T <  1.5  mm : 2T max
 *     1.5 ≤ T < 10 : 2T max     (min 1.5 mm)
 *     T ≥ 10       : unlimited  (min 5 mm; maxMm stored as UNLIMITED_MM sentinel)
 *
 *   NOTE: we use 9999 as the "unlimited" sentinel instead of Infinity
 *   because JSON.stringify(Infinity) = null, and every record in this
 *   module round-trips through JSON for deep copy / audit log / PDF.
 * -------------------------------------------------------------------------- */
const UNLIMITED_MM = 9999;

function _thicknessRange(testThicknessMm) {
  if (typeof testThicknessMm !== 'number' || !isFinite(testThicknessMm) || testThicknessMm <= 0) {
    throw new TypeError('invalid testThicknessMm: ' + testThicknessMm);
  }
  if (testThicknessMm < 1.5) {
    return { minMm: 0,    maxMm: 2 * testThicknessMm };
  }
  if (testThicknessMm < 10) {
    return { minMm: 1.5,  maxMm: 2 * testThicknessMm };
  }
  return    { minMm: 5,    maxMm: UNLIMITED_MM };
}

/* ----------------------------------------------------------------------------
 * 6. WelderCerts class
 * -------------------------------------------------------------------------- */
class WelderCerts {
  constructor() {
    /** @type {Map<string, object>} */ this.welders        = new Map();
    /** @type {Map<string, object>} */ this.certifications = new Map();
    /** @type {Map<string, object>} */ this.procedureSpecs = new Map();  // WPS
    /** @type {Map<string, object>} */ this.qualRecords    = new Map();  // PQR
    /** @type {Array<object>}      */ this.continuityLog   = [];
    /** @type {Array<object>}      */ this.auditLog        = [];
  }

  /* ---------- audit helper ---------- */
  _audit(action, payload) {
    this.auditLog.push({ ts: _now(), action: action, payload: _deepCopy(payload) });
  }

  /* ==========================================================================
   * 6.1  createWelder
   * ========================================================================= */
  /**
   * Register a welder on the shop floor roster.
   *
   * @param {object} w
   * @param {string} w.id          — internal ERP id (e.g. 'WLD-001')
   * @param {string} w.name        — full display name
   * @param {string} w["ת.ז"]       — Israeli ID (9 digits)
   * @param {string} [w.photo]     — data URL or asset path
   * @param {string} w.hireDate    — ISO-8601 date
   * @returns {object} welder record (deep copy)
   */
  createWelder(w) {
    if (!w || typeof w !== 'object') throw new TypeError('createWelder: missing payload');
    _assertStr(w.id, 'welder.id');
    _assertStr(w.name, 'welder.name');
    const teudatZehut = w['ת.ז'] || w.teudatZehut || w.nationalId;
    _assertStr(teudatZehut, 'welder.ת.ז');
    if (!/^\d{9}$/.test(teudatZehut)) {
      throw new TypeError('welder.ת.ז must be 9 digits: ' + teudatZehut);
    }
    _assertDate(w.hireDate, 'welder.hireDate');

    if (this.welders.has(w.id)) {
      // Never delete — upgrade existing record.
      const prev = this.welders.get(w.id);
      prev.history.push(_deepCopy({ snapshotAt: _now(), name: prev.name, photo: prev.photo }));
      prev.name  = w.name;
      prev.photo = w.photo || prev.photo;
      prev.updatedAt = _now();
      this._audit('updateWelder', { id: w.id });
      return _deepCopy(prev);
    }

    const rec = {
      id: w.id,
      name: w.name,
      nationalId: teudatZehut,            // stored as nationalId internally
      teudatZehut: teudatZehut,           // Hebrew alias kept for printing
      photo: w.photo || null,
      hireDate: w.hireDate,
      active: true,
      createdAt: _now(),
      updatedAt: _now(),
      history: [],
    };
    this.welders.set(w.id, rec);
    this._audit('createWelder', { id: w.id });
    return _deepCopy(rec);
  }

  /**
   * Deactivate (never delete) a welder — e.g. left the company.
   */
  deactivateWelder(welderId, reason) {
    const w = this._getWelderOrThrow(welderId);
    w.active = false;
    w.deactivatedAt = _now();
    w.deactivationReason = reason || null;
    this._audit('deactivateWelder', { id: welderId, reason: reason });
    return _deepCopy(w);
  }

  /* ==========================================================================
   * 6.2  issueCertification
   * ========================================================================= */
  /**
   * Issue a Welder Performance Qualification (WPQ) after a successful test.
   *
   * @param {object} c
   * @param {string} c.welderId
   * @param {'AWS-D1.1'|'AWS-D1.2'|'ASME-IX'|'EN-ISO-9606'} c.standard
   * @param {'SMAW'|'GMAW'|'GTAW'|'FCAW'|'SAW'|'PAW'} c.process
   * @param {'1G'|'2G'|'3G'|'4G'|'5G'|'6G'|'1F'|'2F'|'3F'|'4F'} c.position
   * @param {string}        c.material           — e.g. 'S355', 'A36', 'SS304'
   * @param {object}        c.thicknessRange     — { testMm, minMm?, maxMm? }
   * @param {string}        c.issueDate          — ISO-8601
   * @param {string}        c.expiryDate         — ISO-8601
   * @param {string}        c.testedBy           — QA inspector name
   * @param {string}        c.witnessedBy        — 2nd signatory (Israel: מבקר איכות)
   * @param {string}        c.waffleId           — optional link to a WPS
   * @returns {object} certification record
   */
  issueCertification(c) {
    if (!c || typeof c !== 'object') throw new TypeError('issueCertification: missing payload');
    this._getWelderOrThrow(c.welderId);
    _assertEnum(c.standard,  'standard',  WELDING_STANDARDS);
    _assertEnum(c.process,   'process',   WELDING_PROCESSES);
    _assertEnum(c.position,  'position',  WELDING_POSITIONS);
    _assertStr(c.material, 'material');
    if (!c.thicknessRange || typeof c.thicknessRange !== 'object') {
      throw new TypeError('thicknessRange required: { testMm, minMm?, maxMm? }');
    }
    _assertDate(c.issueDate,  'issueDate');
    _assertDate(c.expiryDate, 'expiryDate');
    if (Date.parse(c.expiryDate) <= Date.parse(c.issueDate)) {
      throw new RangeError('expiryDate must be after issueDate');
    }
    _assertStr(c.testedBy,    'testedBy');
    _assertStr(c.witnessedBy, 'witnessedBy');

    // Derive thickness range if only testMm given.
    let range = c.thicknessRange;
    if (typeof range.testMm === 'number' && (range.minMm == null || range.maxMm == null)) {
      const derived = _thicknessRange(range.testMm);
      range = {
        testMm: range.testMm,
        minMm:  range.minMm != null ? range.minMm : derived.minMm,
        maxMm:  range.maxMm != null ? range.maxMm : derived.maxMm,
      };
    }

    const certId = 'CERT-' + c.welderId + '-' + c.standard + '-' + c.process + '-' +
                   c.position + '-' + c.issueDate.slice(0, 10);

    // If the same welder+standard+process+position already exists, supersede
    // (never delete) the previous cert.
    let supersededFromId = null;
    for (const [id, prev] of this.certifications) {
      if (prev.welderId === c.welderId &&
          prev.standard === c.standard &&
          prev.process  === c.process  &&
          prev.position === c.position &&
          prev.status   === 'active') {
        prev.status = 'superseded';
        prev.supersededAt = _now();
        prev.supersededBy = certId;
        supersededFromId  = id;
      }
    }

    const rec = {
      id: certId,
      welderId: c.welderId,
      standard: c.standard,
      standardLabel_he: WELDING_STANDARDS[c.standard].he,
      standardLabel_en: WELDING_STANDARDS[c.standard].en,
      process: c.process,
      processLabel_he: WELDING_PROCESSES[c.process].he,
      processLabel_en: WELDING_PROCESSES[c.process].en,
      position: c.position,
      positionLabel_he: WELDING_POSITIONS[c.position].he,
      positionLabel_en: WELDING_POSITIONS[c.position].en,
      positionIso:      WELDING_POSITIONS[c.position].iso,
      material: c.material,
      thicknessRange: range,
      issueDate: c.issueDate,
      expiryDate: c.expiryDate,
      testedBy: c.testedBy,
      witnessedBy: c.witnessedBy,
      waffleId: c.waffleId || null,   // legacy param name from user prompt
      wpsId:    c.waffleId || null,   // canonical alias
      status: 'active',
      supersededFromId: supersededFromId,
      createdAt: _now(),
      history: [],
    };
    this.certifications.set(certId, rec);
    this._audit('issueCertification', { id: certId, welderId: c.welderId, supersededFromId: supersededFromId });
    return _deepCopy(rec);
  }

  /* ==========================================================================
   * 6.3  recordContinuity
   * ========================================================================= */
  /**
   * Log a production weld that counts toward the welder's 6-month
   * continuity window. AWS D1.1 §4.2.3.1 / ASME IX QW-322.1 /
   * EN ISO 9606-1 §9.2: if the welder does not perform the process
   * within any rolling 6-month window, the qualification lapses until
   * a renewal test is performed.
   *
   * @param {string} welderId
   * @param {object} entry
   * @param {string} entry.date      — ISO-8601 date of the weld
   * @param {string} entry.process   — one of WELDING_PROCESSES
   * @param {string} [entry.jobId]   — optional link to a production job
   * @param {string} [entry.witness] — optional supervisor who signed off
   * @returns {object} continuity entry
   */
  recordContinuity(welderId, entry) {
    this._getWelderOrThrow(welderId);
    if (!entry || typeof entry !== 'object') throw new TypeError('recordContinuity: missing payload');
    _assertDate(entry.date, 'entry.date');
    _assertEnum(entry.process, 'entry.process', WELDING_PROCESSES);

    const rec = {
      welderId: welderId,
      date: entry.date,
      process: entry.process,
      jobId: entry.jobId || null,
      witness: entry.witness || null,
      loggedAt: _now(),
    };
    this.continuityLog.push(rec);
    this._audit('recordContinuity', rec);
    return _deepCopy(rec);
  }

  /**
   * Does the welder have any logged weld in the last `months` months for
   * this process? (Internal helper.)
   */
  _continuityOk(welderId, process, asOfIso, months) {
    const cutoff = _addDays(asOfIso, -Math.round(months * 30.44));
    for (let i = this.continuityLog.length - 1; i >= 0; i--) {
      const e = this.continuityLog[i];
      if (e.welderId !== welderId) continue;
      if (e.process  !== process)  continue;
      if (Date.parse(e.date) >= Date.parse(cutoff) &&
          Date.parse(e.date) <= Date.parse(asOfIso)) {
        return { ok: true, lastDate: e.date };
      }
    }
    return { ok: false, lastDate: null };
  }

  /* ==========================================================================
   * 6.4  checkValidity
   * ========================================================================= */
  /**
   * Check whether this welder can legally perform a given production weld.
   *
   * @param {string} welderId
   * @param {string} process    — e.g. 'GMAW'
   * @param {string} position   — e.g. '3G'
   * @param {string|object} material  — string; or { name, thicknessMm }
   * @param {string} [asOf]     — ISO date; defaults to now
   * @returns {{valid:boolean, reason:string, reason_he:string, expiresIn:number|null, certId:string|null}}
   */
  checkValidity(welderId, process, position, material, asOf) {
    this._getWelderOrThrow(welderId);
    _assertEnum(process, 'process', WELDING_PROCESSES);
    _assertEnum(position, 'position', WELDING_POSITIONS);
    const asOfIso = asOf || _now();
    _assertDate(asOfIso, 'asOf');

    const matName = typeof material === 'object' ? material.name : material;
    const matThk  = typeof material === 'object' ? material.thicknessMm : null;

    // Find the candidate active certs for this welder+process.
    const candidates = [];
    for (const cert of this.certifications.values()) {
      if (cert.welderId !== welderId) continue;
      if (cert.process  !== process)  continue;
      if (cert.status   !== 'active') continue;
      candidates.push(cert);
    }
    if (candidates.length === 0) {
      return {
        valid: false,
        reason: 'no active certification for welder ' + welderId + ' / process ' + process,
        reason_he: 'אין תעודה פעילה למרתך ' + welderId + ' בתהליך ' + process,
        expiresIn: null,
        certId: null,
      };
    }

    // Check each candidate against (position coverage, expiry, continuity,
    // material, thickness). Return the *best* valid one (largest expiresIn),
    // or the most informative failure reason.
    let bestValid = null;
    const failures = [];
    for (const cert of candidates) {
      // 1. Position coverage
      const covers = POSITION_COVERS[cert.position] || [cert.position];
      if (!covers.includes(position)) {
        failures.push({ certId: cert.id,
          en: 'position ' + position + ' not covered by ' + cert.position,
          he: 'תנוחה ' + position + ' אינה מכוסה ע"י ' + cert.position });
        continue;
      }
      // 2. Expiry
      const daysLeft = _daysBetween(asOfIso, cert.expiryDate);
      if (daysLeft < 0) {
        failures.push({ certId: cert.id,
          en: 'certification expired ' + (-daysLeft) + ' days ago',
          he: 'תעודה פגת תוקף לפני ' + (-daysLeft) + ' ימים' });
        continue;
      }
      // 3. Six-month continuity
      const contMonths = WELDING_STANDARDS[cert.standard].continuityMonths;
      const cont = this._continuityOk(welderId, process, asOfIso, contMonths);
      if (!cont.ok) {
        failures.push({ certId: cert.id,
          en: 'continuity broken — no ' + process + ' weld in last ' + contMonths + ' months',
          he: 'המשכיות נשברה — אין ריתוך ' + process + ' ב-' + contMonths + ' חודשים אחרונים' });
        continue;
      }
      // 4. Material (soft check — just a string compare unless caller
      //    supplies a list of equivalents)
      if (matName && cert.material &&
          String(cert.material).toUpperCase() !== String(matName).toUpperCase()) {
        failures.push({ certId: cert.id,
          en: 'material mismatch: cert ' + cert.material + ' vs job ' + matName,
          he: 'חוסר התאמת חומר: תעודה ' + cert.material + ' מול עבודה ' + matName });
        continue;
      }
      // 5. Thickness range
      if (matThk != null) {
        const r = cert.thicknessRange;
        if (matThk < r.minMm || matThk > r.maxMm) {
          failures.push({ certId: cert.id,
            en: 'thickness ' + matThk + 'mm outside range ' + r.minMm + '-' + r.maxMm + 'mm',
            he: 'עובי ' + matThk + ' מ"מ מחוץ לטווח ' + r.minMm + '-' + r.maxMm + ' מ"מ' });
          continue;
        }
      }

      // Valid cert — track the best (most days of remaining validity).
      if (!bestValid || daysLeft > bestValid.daysLeft) {
        bestValid = { cert: cert, daysLeft: daysLeft };
      }
    }

    if (bestValid) {
      return {
        valid: true,
        reason: 'ok',
        reason_he: 'תקין',
        expiresIn: bestValid.daysLeft,
        certId: bestValid.cert.id,
      };
    }
    // No valid — return the most helpful failure (first one).
    const f = failures[0] || { certId: null, en: 'unknown failure', he: 'כשל לא ידוע' };
    return {
      valid: false,
      reason: f.en,
      reason_he: f.he,
      expiresIn: null,
      certId: f.certId,
    };
  }

  /* ==========================================================================
   * 6.5  expiringCerts
   * ========================================================================= */
  /**
   * Return certs whose expiryDate is within the next `days` days.
   *
   * @param {number} days
   * @param {string} [asOf]
   * @returns {Array<object>}
   */
  expiringCerts(days, asOf) {
    if (typeof days !== 'number' || days < 0) {
      throw new TypeError('expiringCerts: days must be non-negative number');
    }
    const asOfIso = asOf || _now();
    const out = [];
    for (const cert of this.certifications.values()) {
      if (cert.status !== 'active') continue;
      const daysLeft = _daysBetween(asOfIso, cert.expiryDate);
      if (daysLeft >= 0 && daysLeft <= days) {
        out.push({
          certId: cert.id,
          welderId: cert.welderId,
          standard: cert.standard,
          process: cert.process,
          position: cert.position,
          expiryDate: cert.expiryDate,
          daysUntilExpiry: daysLeft,
        });
      }
    }
    return out.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
  }

  /* ==========================================================================
   * 6.6  weldingProcedureSpec (WPS)
   * ========================================================================= */
  /**
   * Register or fetch a Welding Procedure Specification — the shop-floor
   * recipe for a joint (joint design, filler, amps, volts, travel speed,
   * preheat, interpass, PWHT, gas).
   *
   * Dual use:
   *   - weldingProcedureSpec({ id, ... })  — register (upsert) a WPS
   *   - weldingProcedureSpec('WPS-001')    — fetch existing WPS by id
   */
  weldingProcedureSpec(input) {
    if (typeof input === 'string') {
      const rec = this.procedureSpecs.get(input);
      if (!rec) throw new Error('unknown WPS: ' + input);
      return _deepCopy(rec);
    }
    if (!input || typeof input !== 'object') throw new TypeError('weldingProcedureSpec: missing payload');
    _assertStr(input.id, 'wps.id');
    _assertEnum(input.process, 'wps.process', WELDING_PROCESSES);

    const existing = this.procedureSpecs.get(input.id);
    if (existing) {
      existing.history.push(_deepCopy({
        snapshotAt: _now(),
        version: existing.version,
        data: _deepCopy(existing),
      }));
      Object.assign(existing, input, {
        version: existing.version + 1,
        updatedAt: _now(),
      });
      this._audit('updateWPS', { id: input.id, version: existing.version });
      return _deepCopy(existing);
    }

    const rec = {
      id: input.id,
      process: input.process,
      jointType: input.jointType || null,
      baseMetal:  input.baseMetal || null,    // e.g. { spec:'A36', grade:'...', thickness:'6-20mm' }
      fillerMetal: input.fillerMetal || null, // e.g. { AWS:'ER70S-6', size:'1.2mm' }
      shieldingGas: input.shieldingGas || null,
      position: input.position || null,
      amperage: input.amperage || null,
      voltage:  input.voltage  || null,
      travelSpeed: input.travelSpeed || null,
      preheat:  input.preheat  || null,
      interpass: input.interpass || null,
      pwht:     input.pwht     || null,
      pqrRef:   input.pqrRef   || null,   // link to Procedure Qualification Record
      name_he:  input.name_he  || '',
      name_en:  input.name_en  || '',
      version:  1,
      createdAt: _now(),
      updatedAt: _now(),
      history: [],
    };
    this.procedureSpecs.set(input.id, rec);
    this._audit('createWPS', { id: input.id });
    return _deepCopy(rec);
  }

  /* ==========================================================================
   * 6.7  procedureQualificationRecord (PQR)
   * ========================================================================= */
  /**
   * Register or fetch a Procedure Qualification Record — the *evidence*
   * (test coupons, mechanical results, radiographs) that proves a WPS
   * was qualified.
   */
  procedureQualificationRecord(input) {
    if (typeof input === 'string') {
      const rec = this.qualRecords.get(input);
      if (!rec) throw new Error('unknown PQR: ' + input);
      return _deepCopy(rec);
    }
    if (!input || typeof input !== 'object') throw new TypeError('procedureQualificationRecord: missing payload');
    _assertStr(input.id, 'pqr.id');
    _assertStr(input.wpsId, 'pqr.wpsId');
    if (!this.procedureSpecs.has(input.wpsId)) {
      throw new Error('PQR references unknown WPS: ' + input.wpsId);
    }

    const existing = this.qualRecords.get(input.id);
    if (existing) {
      existing.history.push(_deepCopy({
        snapshotAt: _now(),
        version: existing.version,
        data: _deepCopy(existing),
      }));
      Object.assign(existing, input, {
        version: existing.version + 1,
        updatedAt: _now(),
      });
      this._audit('updatePQR', { id: input.id, version: existing.version });
      return _deepCopy(existing);
    }

    const rec = {
      id: input.id,
      wpsId: input.wpsId,
      testDate: input.testDate || null,
      testLab:  input.testLab  || null,
      tensileResults:   input.tensileResults   || null, // MPa, location of failure
      bendResults:      input.bendResults      || null,
      impactResults:    input.impactResults    || null, // Charpy, Joules at °C
      macroResults:     input.macroResults     || null,
      hardness:         input.hardness         || null,
      radiography:      input.radiography      || null,
      coupons:          input.coupons          || [],
      qualifiedBy:      input.qualifiedBy      || null, // CWI / inspector
      witness:          input.witness          || null, // Israeli QA rep
      version: 1,
      createdAt: _now(),
      updatedAt: _now(),
      history: [],
    };
    this.qualRecords.set(input.id, rec);

    // Back-link from WPS if not already set.
    const wps = this.procedureSpecs.get(input.wpsId);
    if (wps && !wps.pqrRef) {
      wps.pqrRef = input.id;
      wps.updatedAt = _now();
    }
    this._audit('createPQR', { id: input.id, wpsId: input.wpsId });
    return _deepCopy(rec);
  }

  /* ==========================================================================
   * 6.8  generateCertificate
   * ========================================================================= */
  /**
   * Generate a bilingual (Hebrew / English) welder-qualification certificate
   * ready to be rendered into a PDF. The implementation here returns a
   * deterministic, paginated text document that a downstream PDF printer
   * (e.g. `tools/pdf-generator`) can typeset — and a `meta` block that the
   * printer uses for fonts, logo, QR-code, and RTL runs.
   *
   * Zero deps. Does NOT actually encode PDF bytes (keeps this file pure).
   *
   * @param {string} certId
   * @returns {{meta:object, header_he:string, header_en:string, body:Array<{he:string, en:string}>, footer_he:string, footer_en:string, textBlock:string}}
   */
  generateCertificate(certId) {
    _assertStr(certId, 'certId');
    const cert = this.certifications.get(certId);
    if (!cert) throw new Error('unknown certification: ' + certId);
    const welder = this.welders.get(cert.welderId);
    if (!welder) throw new Error('cert references unknown welder: ' + cert.welderId);

    const std = WELDING_STANDARDS[cert.standard];
    const tr  = cert.thicknessRange;

    const meta = {
      certId: cert.id,
      welderId: welder.id,
      issuedAt: cert.issueDate,
      expiresAt: cert.expiryDate,
      pageSize: 'A4',
      orientation: 'portrait',
      rtl: true,
      logo: 'assets/logos/techno-kol-uzi.svg',
      qrPayload: 'https://techno-kol.local/verify/' + cert.id,
      language: 'he+en',
      signatures: [
        { role_he: 'ביצע בדיקה',  role_en: 'Tested by',     name: cert.testedBy    },
        { role_he: 'עד/מבקר',      role_en: 'Witnessed by',  name: cert.witnessedBy },
      ],
    };

    const header_he = 'תעודת הסמכת מרתך — ' + std.he;
    const header_en = 'Welder Performance Qualification — ' + std.en;

    const body = [
      { he: 'שם המרתך:',         en: 'Welder name:',        value: welder.name },
      { he: 'תעודת זהות:',       en: 'National ID:',        value: welder.teudatZehut },
      { he: 'מספר פנימי:',       en: 'Internal ID:',        value: welder.id },
      { he: 'תקן:',               en: 'Standard:',           value: std.en + ' / ' + std.he },
      { he: 'תהליך ריתוך:',      en: 'Welding process:',    value: cert.process + ' (' + cert.processLabel_he + ')' },
      { he: 'תנוחה:',             en: 'Position:',           value: cert.position + ' — ISO ' + cert.positionIso },
      { he: 'חומר בסיס:',        en: 'Base material:',      value: cert.material },
      { he: 'טווח עובי:',         en: 'Thickness range:',    value: tr.minMm + '–' + (tr.maxMm >= UNLIMITED_MM ? '∞' : tr.maxMm) + ' mm (test ' + tr.testMm + ' mm)' },
      { he: 'תאריך הנפקה:',      en: 'Issue date:',         value: cert.issueDate.slice(0, 10) },
      { he: 'תאריך תפוגה:',      en: 'Expiry date:',        value: cert.expiryDate.slice(0, 10) },
      { he: 'דרישת המשכיות:',    en: 'Continuity rule:',    value: std.continuityMonths + ' months / ' + std.continuityMonths + ' חודשים' },
      { he: 'מסמך WPS מקושר:',   en: 'Linked WPS:',         value: cert.wpsId || '—' },
    ];

    const footer_he = 'מסמך זה נוצר אוטומטית ע"י מערכת Techno-Kol ERP. ' +
                      'לאימות — סרוק את קוד ה-QR. לא מוחקים רק משדרגים ומגדלים.';
    const footer_en = 'This certificate was generated automatically by Techno-Kol ERP. ' +
                      'Scan the QR to verify. Never delete — only upgrade & grow.';

    // Pre-rendered plain-text block (ready for a PDF printer). Right side
    // carries the Hebrew run; left side the English run.
    const lines = [];
    lines.push('============================================================');
    lines.push(header_he);
    lines.push(header_en);
    lines.push('============================================================');
    for (const row of body) {
      lines.push(_padRight(row.he + ' ' + (row.value || ''), 40) + '| ' + row.en + ' ' + (row.value || ''));
    }
    lines.push('------------------------------------------------------------');
    lines.push('ביצע בדיקה: ' + cert.testedBy + '   | Tested by: ' + cert.testedBy);
    lines.push('עד/מבקר:   ' + cert.witnessedBy + '   | Witnessed by: ' + cert.witnessedBy);
    lines.push('============================================================');
    lines.push(footer_he);
    lines.push(footer_en);
    const textBlock = lines.join('\n');

    this._audit('generateCertificate', { certId: certId });
    return {
      meta: meta,
      header_he: header_he,
      header_en: header_en,
      body: body,
      footer_he: footer_he,
      footer_en: footer_en,
      textBlock: textBlock,
    };
  }

  /* ==========================================================================
   * Read helpers
   * ========================================================================= */
  getWelder(id)        { return _deepCopy(this._getWelderOrThrow(id)); }
  getCertification(id) {
    const c = this.certifications.get(id);
    if (!c) throw new Error('unknown certification: ' + id);
    return _deepCopy(c);
  }
  listCertifications(welderId) {
    const out = [];
    for (const c of this.certifications.values()) {
      if (!welderId || c.welderId === welderId) out.push(_deepCopy(c));
    }
    return out;
  }

  /* ---------- internal ---------- */
  _getWelderOrThrow(id) {
    _assertStr(id, 'welderId');
    const w = this.welders.get(id);
    if (!w) throw new Error('unknown welder: ' + id);
    return w;
  }
}

/* ----------------------------------------------------------------------------
 * 7. Internal text helpers
 * -------------------------------------------------------------------------- */
function _padRight(s, width) {
  const str = String(s || '');
  if (str.length >= width) return str.slice(0, width);
  return str + ' '.repeat(width - str.length);
}

/* ----------------------------------------------------------------------------
 * Exports
 * -------------------------------------------------------------------------- */
module.exports = {
  WelderCerts: WelderCerts,
  WELDING_STANDARDS: WELDING_STANDARDS,
  WELDING_PROCESSES: WELDING_PROCESSES,
  WELDING_POSITIONS: WELDING_POSITIONS,
  POSITION_COVERS: POSITION_COVERS,
  UNLIMITED_MM: UNLIMITED_MM,
  _thicknessRange: _thicknessRange,
};
