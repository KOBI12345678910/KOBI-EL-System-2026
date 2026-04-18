/**
 * First Article Inspection (FAI) — AS9102 aerospace standard,
 * adapted for Israeli metal fabrication (Techno-Kol Uzi Mega-ERP).
 *
 * AS9102 reference:
 *   Form 1 — Part Number Accountability
 *   Form 2 — Product Accountability (Raw Material / Specifications / Special Processes)
 *   Form 3 — Characteristic Accountability (Verification / Compatibility Evaluation)
 *
 * Rule of the house:  לא מוחקים רק משדרגים ומגדלים
 *   - Never delete historical FAIs; new revisions are stored as delta FAIs.
 *   - Expired FAIs are marked expired, never removed.
 *
 * Bilingual (HE + EN) because Israeli aerospace suppliers (IAI, Elbit, Rafael,
 * sub-tier metal-fab shops) routinely export to US / EU primes who require
 * AS9102 compliant paperwork in English.
 *
 * Zero external dependencies — only Node.js built-ins.
 *
 * Usage:
 *   const { FAIManager } = require('./src/quality/fai.js');
 *   const mgr = new FAIManager();
 *   const fai = mgr.createFAI({ part, drawing, revision, purchaseOrder, supplier, fairReason });
 *   mgr.extractCharacteristics(drawingMetadata).forEach(c => mgr.addCharacteristic(fai.id, c));
 *   mgr.recordResult(fai.id, charId, { actualValue, toolUsed, date, inspector, result });
 *   const v = mgr.verdict(fai.id);
 *   const pdfs = mgr.generateFormPDFs(fai.id);
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const FAIR_REASONS = Object.freeze([
  'new-part',
  'revision-change',
  'supplier-change',
  'manufacturing-break',
  'customer-request',
]);

const FAIR_REASON_LABELS = Object.freeze({
  'new-part': { he: 'חלק חדש', en: 'New Part' },
  'revision-change': { he: 'שינוי גרסת שרטוט', en: 'Revision Change' },
  'supplier-change': { he: 'החלפת ספק', en: 'Supplier Change' },
  'manufacturing-break': { he: 'הפסקת ייצור > 2 שנים', en: 'Manufacturing Break > 2 Years' },
  'customer-request': { he: 'דרישת לקוח', en: 'Customer Request' },
});

const CHAR_TYPES = Object.freeze([
  'dimension',   // dimensional measurement (bubble note on drawing)
  'note',        // drawing note (e.g., "all edges deburred")
  'material',    // raw-material verification
  'process',     // special process (anodize, heat-treat, NDT)
  'test',        // functional / mechanical test
]);

const RESULT_VALUES = Object.freeze(['accept', 'reject', 'pending']);

// Manufacturing-break window per AS9102 §4.6 — if a part has not been produced
// for this many years, a new FAI is required even if drawing and supplier are
// unchanged.  Default 2 years (configurable per customer PO).
const DEFAULT_MFG_BREAK_YEARS = 2;

// Bilingual form titles — displayed on the rendered PDF headers.
const FORM_LABELS = Object.freeze({
  form1: {
    he: 'טופס 1 — אחריות מספר חלק',
    en: 'Form 1 — Part Number Accountability',
  },
  form2: {
    he: 'טופס 2 — אחריות מוצר (חומר גלם / מפרטים / תהליכים מיוחדים)',
    en: 'Form 2 — Product Accountability (Raw Material / Specifications / Special Processes)',
  },
  form3: {
    he: 'טופס 3 — אחריות מאפיינים (מידות, הערות, בדיקות)',
    en: 'Form 3 — Characteristic Accountability (Dimensions / Notes / Tests)',
  },
});

// Hebrew glossary for metal-fab FAI terms.
const GLOSSARY = Object.freeze({
  FAI: { he: 'בדיקת פריט ראשון', en: 'First Article Inspection' },
  characteristic: { he: 'מאפיין בדיקה', en: 'Characteristic' },
  bubble: { he: 'מספור בועה בשרטוט', en: 'Inspection Bubble' },
  delta: { he: 'FAI חלקי (דלתא)', en: 'Delta FAI' },
  purchaseOrder: { he: 'הזמנת רכש', en: 'Purchase Order' },
  drawing: { he: 'שרטוט', en: 'Drawing' },
  revision: { he: 'גרסת שרטוט', en: 'Drawing Revision' },
  specialProcess: { he: 'תהליך מיוחד', en: 'Special Process' },
  rawMaterial: { he: 'חומר גלם', en: 'Raw Material' },
  nominal: { he: 'ערך נומינלי', en: 'Nominal' },
  tolerance: { he: 'סבולת', en: 'Tolerance' },
  actual: { he: 'ערך בפועל', en: 'Actual Value' },
  tool: { he: 'כלי מדידה', en: 'Measurement Tool' },
  inspector: { he: 'בודק', en: 'Inspector' },
  accept: { he: 'קביל', en: 'Accept' },
  reject: { he: 'נפסל', en: 'Reject' },
  verdict: { he: 'פסיקה כוללת', en: 'Overall Verdict' },
  pass: { he: 'עבר', en: 'PASS' },
  fail: { he: 'נכשל', en: 'FAIL' },
  expiry: { he: 'פקיעת תוקף', en: 'Expiry' },
  mfgBreak: { he: 'הפסקת ייצור', en: 'Manufacturing Break' },
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function nowIso() {
  return new Date().toISOString();
}

function assertNonEmptyString(value, name) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
}

function assertObject(value, name) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
}

function clone(value) {
  if (value === null || typeof value !== 'object') return value;
  return JSON.parse(JSON.stringify(value));
}

/**
 * Parse a tolerance string and produce { lower, upper } absolute bounds.
 * Accepts forms commonly used by draftsmen:
 *   "±0.1"       → symmetric
 *   "+0.1/-0.05" → asymmetric
 *   "+0.2"       → upper only
 *   "-0.05"      → lower only
 *   "H7" / "h6"  → ISO fit (returns null; caller supplies explicit bounds)
 */
function parseTolerance(nominal, toleranceStr) {
  if (typeof nominal !== 'number' || !Number.isFinite(nominal)) return null;
  if (typeof toleranceStr !== 'string' || toleranceStr.length === 0) {
    return { lower: nominal, upper: nominal };
  }
  const t = toleranceStr.trim();
  // ISO fits — explicit bounds required from caller.
  if (/^[A-Za-z][0-9]+$/.test(t)) return null;
  // Symmetric ±X  (also accepts +/- or +-)
  const sym = t.match(/^[±]|^\+\/-|^\+-/);
  if (sym) {
    const numStr = t.replace(/^[±]|^\+\/-|^\+-/, '');
    const n = Number(numStr);
    if (!Number.isFinite(n)) return null;
    return { lower: nominal - Math.abs(n), upper: nominal + Math.abs(n) };
  }
  // Asymmetric +X/-Y  (also accepts +X-Y)
  const asym = t.match(/^\+?(-?\d+(?:\.\d+)?)\s*\/\s*([+-]?\d+(?:\.\d+)?)$/);
  if (asym) {
    const a = Number(asym[1]);
    const b = Number(asym[2]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    const upper = a >= 0 ? a : b;
    const lower = a >= 0 ? b : a;
    return { lower: nominal + Math.min(lower, upper), upper: nominal + Math.max(lower, upper) };
  }
  // Single-side +X  or  -X
  const single = t.match(/^([+-]\d+(?:\.\d+)?)$/);
  if (single) {
    const n = Number(single[1]);
    if (!Number.isFinite(n)) return null;
    return n >= 0
      ? { lower: nominal, upper: nominal + n }
      : { lower: nominal + n, upper: nominal };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// FAIManager
// ─────────────────────────────────────────────────────────────────────────────

class FAIManager {
  constructor(options = {}) {
    this._store = new Map();      // id → fai record
    this._seq = 0;
    this._mfgBreakYears = options.mfgBreakYears || DEFAULT_MFG_BREAK_YEARS;
    this._clock = options.clock || (() => new Date());
  }

  // ─── create ────────────────────────────────────────────────────────────────

  createFAI({ part, drawing, revision, purchaseOrder, supplier, fairReason }) {
    assertObject(part, 'part');
    assertNonEmptyString(part.partNumber, 'part.partNumber');
    assertObject(drawing, 'drawing');
    assertNonEmptyString(drawing.drawingNumber, 'drawing.drawingNumber');
    assertNonEmptyString(revision, 'revision');
    assertObject(purchaseOrder, 'purchaseOrder');
    assertNonEmptyString(purchaseOrder.poNumber, 'purchaseOrder.poNumber');
    assertObject(supplier, 'supplier');
    assertNonEmptyString(supplier.supplierCode, 'supplier.supplierCode');
    if (!FAIR_REASONS.includes(fairReason)) {
      throw new Error(
        `fairReason must be one of: ${FAIR_REASONS.join(', ')} (got: ${fairReason})`,
      );
    }

    this._seq += 1;
    const id = `FAI-${String(this._seq).padStart(6, '0')}`;
    const createdAt = nowIso();

    const fai = {
      id,
      createdAt,
      updatedAt: createdAt,
      status: 'draft', // draft → submitted → approved
      fairReason,
      fairReasonLabel: FAIR_REASON_LABELS[fairReason],

      // Form 1 — Part Accountability
      form1: {
        title: FORM_LABELS.form1,
        partNumber: part.partNumber,
        partName: part.partName || '',
        partRevision: part.revision || revision,
        drawingNumber: drawing.drawingNumber,
        drawingRevision: revision,
        additionalChanges: drawing.additionalChanges || [],
        manufacturingProcessRef: part.processRef || '',
        organizationName: supplier.legalName || supplier.supplierCode,
        supplierCode: supplier.supplierCode,
        supplierCagecCode: supplier.cageCode || '',
        poNumber: purchaseOrder.poNumber,
        poLineItem: purchaseOrder.lineItem || '',
        detailFAI: true,
        assemblyFAI: Boolean(part.isAssembly),
        fullFAI: fairReason === 'new-part',
        partialFAI: fairReason !== 'new-part',
        baselinePartNumber: part.baselinePartNumber || '',
        reasonForPartialFAI: fairReason !== 'new-part' ? FAIR_REASON_LABELS[fairReason] : null,
        signatureBlock: { preparedBy: null, preparedDate: null, approvedBy: null, approvedDate: null },
      },

      // Form 2 — Product Accountability
      form2: {
        title: FORM_LABELS.form2,
        materials: [],          // [{ name, specification, certificateOfConformance, heatNumber, ... }]
        specifications: [],     // [{ code, title, revision }]
        specialProcesses: [],   // [{ code, name, processSpec, supplier, approvalStatus }]
        functionalTests: [],    // [{ name, specification, result }]
        signatureBlock: { preparedBy: null, preparedDate: null },
      },

      // Form 3 — Characteristic Accountability
      form3: {
        title: FORM_LABELS.form3,
        characteristics: [],    // [{ id, bubbleNumber, type, description, nominal, tolerance, bounds, result, ... }]
        signatureBlock: { preparedBy: null, preparedDate: null },
      },

      linkage: {
        part,
        drawing,
        revision,
        purchaseOrder,
        supplier,
      },

      // Expiry metadata (AS9102 §4.6)
      expiry: {
        mfgBreakYears: this._mfgBreakYears,
        lastManufacturedAt: purchaseOrder.lastManufacturedAt || createdAt,
        expiresAt: null, // computed lazily
      },

      audit: [
        { at: createdAt, actor: 'system', event: 'created', fairReason },
      ],
    };

    this._store.set(id, fai);
    return clone(fai);
  }

  // ─── Form 2 accessors (raw material / specs / special processes) ──────────

  addMaterial(faiId, material) {
    const fai = this._get(faiId);
    assertObject(material, 'material');
    assertNonEmptyString(material.name, 'material.name');
    fai.form2.materials.push({
      name: material.name,
      specification: material.specification || '',
      certificateOfConformance: material.certificateOfConformance || '',
      heatNumber: material.heatNumber || '',
      lotNumber: material.lotNumber || '',
      supplier: material.supplier || '',
      acceptance: material.acceptance || 'pending',
    });
    this._touch(fai, 'material-added', { name: material.name });
    return clone(fai.form2.materials);
  }

  addSpecialProcess(faiId, proc) {
    const fai = this._get(faiId);
    assertObject(proc, 'process');
    assertNonEmptyString(proc.code, 'process.code');
    fai.form2.specialProcesses.push({
      code: proc.code,
      name: proc.name || proc.code,
      processSpec: proc.processSpec || '',
      supplier: proc.supplier || '',
      approvalStatus: proc.approvalStatus || 'pending',
      certificateNumber: proc.certificateNumber || '',
    });
    this._touch(fai, 'special-process-added', { code: proc.code });
    return clone(fai.form2.specialProcesses);
  }

  addSpecification(faiId, spec) {
    const fai = this._get(faiId);
    assertObject(spec, 'spec');
    assertNonEmptyString(spec.code, 'spec.code');
    fai.form2.specifications.push({
      code: spec.code,
      title: spec.title || '',
      revision: spec.revision || '',
    });
    this._touch(fai, 'specification-added', { code: spec.code });
    return clone(fai.form2.specifications);
  }

  // ─── Form 3 accessors (characteristics) ────────────────────────────────────

  /**
   * Adds a single characteristic to Form 3.  Called internally by
   * extractCharacteristics() but also exposed for manual entry.
   */
  addCharacteristic(faiId, input) {
    const fai = this._get(faiId);
    assertObject(input, 'characteristic');
    const type = input.type || 'dimension';
    if (!CHAR_TYPES.includes(type)) {
      throw new Error(`characteristic.type must be one of: ${CHAR_TYPES.join(', ')}`);
    }
    const nextBubble = fai.form3.characteristics.length + 1;
    const bubble = input.bubbleNumber || nextBubble;
    const nominal = typeof input.nominal === 'number' ? input.nominal : null;
    const tolerance = typeof input.tolerance === 'string' ? input.tolerance : '';
    let bounds = input.bounds || null;
    if (!bounds && nominal !== null && tolerance) {
      bounds = parseTolerance(nominal, tolerance);
    }

    const char = {
      id: `CHR-${String(bubble).padStart(4, '0')}`,
      bubbleNumber: bubble,
      type,
      description: input.description || '',
      descriptionHe: input.descriptionHe || '',
      nominal,
      tolerance,
      bounds,
      units: input.units || 'mm',
      drawingZone: input.drawingZone || '',
      actualValue: null,
      toolUsed: null,
      measuredAt: null,
      inspector: null,
      result: 'pending',
      notes: '',
    };
    fai.form3.characteristics.push(char);
    this._touch(fai, 'characteristic-added', { id: char.id });
    return clone(char);
  }

  /**
   * Auto-extract characteristics from drawing / CAD metadata.
   * Accepts three complementary input shapes (all optional, all merged):
   *
   *   drawingMetadata.bubbles      = [ { number, description, nominal, tolerance, units, zone } ]
   *   drawingMetadata.bomCharacteristics = [ { description, nominal, tolerance, units } ]
   *   drawingMetadata.notes        = [ "All edges deburred", "Remove burrs", ... ]
   *
   * Returns an array of characteristic records (not yet added to any FAI).
   * Caller can then loop through and invoke addCharacteristic().
   */
  extractCharacteristics(drawingMetadata) {
    assertObject(drawingMetadata, 'drawingMetadata');
    const out = [];
    const bubbles = Array.isArray(drawingMetadata.bubbles) ? drawingMetadata.bubbles : [];
    const bom = Array.isArray(drawingMetadata.bomCharacteristics) ? drawingMetadata.bomCharacteristics : [];
    const notes = Array.isArray(drawingMetadata.notes) ? drawingMetadata.notes : [];

    let seq = 0;
    // Pass 1 — inspection bubbles → dimensions
    for (const b of bubbles) {
      seq += 1;
      const nominal = typeof b.nominal === 'number' ? b.nominal : null;
      const tolerance = typeof b.tolerance === 'string' ? b.tolerance : '';
      const bounds = nominal !== null && tolerance ? parseTolerance(nominal, tolerance) : null;
      out.push({
        bubbleNumber: typeof b.number === 'number' ? b.number : seq,
        type: 'dimension',
        description: b.description || `Dimension ${seq}`,
        descriptionHe: b.descriptionHe || '',
        nominal,
        tolerance,
        bounds,
        units: b.units || 'mm',
        drawingZone: b.zone || '',
      });
    }
    // Pass 2 — BOM characteristics (e.g., surface finish, hardness)
    for (const item of bom) {
      seq += 1;
      const nominal = typeof item.nominal === 'number' ? item.nominal : null;
      const tolerance = typeof item.tolerance === 'string' ? item.tolerance : '';
      out.push({
        bubbleNumber: seq,
        type: item.type || 'dimension',
        description: item.description || `BOM char ${seq}`,
        descriptionHe: item.descriptionHe || '',
        nominal,
        tolerance,
        bounds: nominal !== null && tolerance ? parseTolerance(nominal, tolerance) : null,
        units: item.units || '',
        drawingZone: '',
      });
    }
    // Pass 3 — drawing notes → note-type characteristics (no bounds)
    for (const note of notes) {
      seq += 1;
      out.push({
        bubbleNumber: seq,
        type: 'note',
        description: typeof note === 'string' ? note : String(note),
        descriptionHe: '',
        nominal: null,
        tolerance: '',
        bounds: null,
        units: '',
        drawingZone: '',
      });
    }
    return out;
  }

  /**
   * Record a measurement result against an existing characteristic.
   * Also auto-derives the accept/reject verdict from numeric bounds when
   * the caller passes a numeric actualValue and the caller did not supply
   * an explicit `result` — but always honors an explicit `result` first.
   */
  recordResult(faiId, charId, { actualValue, toolUsed, date, inspector, result, notes } = {}) {
    const fai = this._get(faiId);
    assertNonEmptyString(charId, 'charId');
    const char = fai.form3.characteristics.find(c => c.id === charId);
    if (!char) {
      throw new Error(`characteristic ${charId} not found on ${faiId}`);
    }
    let finalResult = result;
    if (!finalResult && typeof actualValue === 'number' && char.bounds) {
      finalResult = actualValue >= char.bounds.lower && actualValue <= char.bounds.upper
        ? 'accept'
        : 'reject';
    }
    if (!finalResult) finalResult = 'pending';
    if (!RESULT_VALUES.includes(finalResult)) {
      throw new Error(`result must be one of: ${RESULT_VALUES.join(', ')}`);
    }
    char.actualValue = actualValue == null ? null : actualValue;
    char.toolUsed = toolUsed || null;
    char.measuredAt = date || nowIso();
    char.inspector = inspector || null;
    char.result = finalResult;
    if (typeof notes === 'string') char.notes = notes;
    this._touch(fai, 'result-recorded', { charId, result: finalResult });
    return clone(char);
  }

  /**
   * Overall verdict for a FAI.
   *   - PASS iff every characteristic on Form 3 has result === 'accept'
   *     AND at least one characteristic exists.
   *   - FAIL iff any characteristic is 'reject'.
   *   - PENDING otherwise (empty or pending-only).
   */
  verdict(faiId) {
    const fai = this._get(faiId);
    const chars = fai.form3.characteristics;
    if (chars.length === 0) {
      return { verdict: 'pending', reason: 'no-characteristics', total: 0, accepted: 0, rejected: 0, pending: 0, label: GLOSSARY.verdict };
    }
    let accepted = 0;
    let rejected = 0;
    let pending = 0;
    for (const c of chars) {
      if (c.result === 'accept') accepted += 1;
      else if (c.result === 'reject') rejected += 1;
      else pending += 1;
    }
    let v = 'pending';
    if (rejected > 0) v = 'fail';
    else if (pending === 0) v = 'pass';
    return {
      verdict: v,
      reason: rejected > 0 ? 'characteristic-rejected' : (pending > 0 ? 'incomplete' : 'all-accepted'),
      total: chars.length,
      accepted,
      rejected,
      pending,
      label: GLOSSARY.verdict,
      labels: { pass: GLOSSARY.pass, fail: GLOSSARY.fail, pending: { he: 'ממתין', en: 'Pending' } },
    };
  }

  // ─── PDF generation (structured payloads for a renderer) ──────────────────

  /**
   * Returns a structured payload object per AS9102 form.  Callers with a real
   * PDF renderer (e.g. pdfkit, puppeteer) can walk this payload and emit the
   * three PDF documents.  Keeping it pure-data avoids pulling heavy deps into
   * this module and keeps it easily testable.
   */
  generateFormPDFs(faiId) {
    const fai = this._get(faiId);
    const v = this.verdict(faiId);
    const expiry = this._computeExpiry(fai);
    const meta = {
      faiId: fai.id,
      createdAt: fai.createdAt,
      status: fai.status,
      fairReason: fai.fairReason,
      fairReasonLabel: fai.fairReasonLabel,
      verdict: v,
      expiry,
      generatedAt: nowIso(),
      bilingual: true,
    };
    return {
      form1: {
        ...meta,
        title: FORM_LABELS.form1,
        header: {
          partNumber: fai.form1.partNumber,
          partName: fai.form1.partName,
          drawingNumber: fai.form1.drawingNumber,
          drawingRevision: fai.form1.drawingRevision,
          supplierCode: fai.form1.supplierCode,
          poNumber: fai.form1.poNumber,
        },
        body: clone(fai.form1),
        footer: { page: '1 of 3' },
      },
      form2: {
        ...meta,
        title: FORM_LABELS.form2,
        header: {
          partNumber: fai.form1.partNumber,
          drawingRevision: fai.form1.drawingRevision,
        },
        body: clone(fai.form2),
        footer: { page: '2 of 3' },
      },
      form3: {
        ...meta,
        title: FORM_LABELS.form3,
        header: {
          partNumber: fai.form1.partNumber,
          drawingRevision: fai.form1.drawingRevision,
          totalCharacteristics: fai.form3.characteristics.length,
        },
        body: clone(fai.form3),
        footer: { page: '3 of 3' },
      },
    };
  }

  // ─── Delta FAI ─────────────────────────────────────────────────────────────

  /**
   * Compute the minimum set of characteristics a delta FAI must re-verify
   * when moving from previousFAI → currentFAI.  Per AS9102 §5.4 a delta FAI
   * covers only the characteristics impacted by the change; unchanged
   * characteristics may reference the baseline FAI.
   *
   * Returns:
   *   {
   *     isDelta: true,
   *     baselineFaiId,
   *     currentFaiId,
   *     changes: {
   *       added:    [ charIds ],
   *       removed:  [ charIds ],
   *       modified: [ { id, field, before, after } ],
   *     },
   *     reinspectionRequired: [ charIds ],   // subset of current characteristics
   *     unchanged: [ charIds ],              // carried forward from baseline
   *   }
   */
  deltaFAI(previousFAI, currentFAI) {
    assertObject(previousFAI, 'previousFAI');
    assertObject(currentFAI, 'currentFAI');

    const prevChars = this._indexChars(previousFAI);
    const currChars = this._indexChars(currentFAI);

    const added = [];
    const removed = [];
    const modified = [];
    const unchanged = [];

    for (const [bubble, prev] of prevChars.entries()) {
      if (!currChars.has(bubble)) {
        removed.push(prev.id);
      }
    }
    for (const [bubble, curr] of currChars.entries()) {
      const prev = prevChars.get(bubble);
      if (!prev) {
        added.push(curr.id);
        continue;
      }
      const diffs = this._diffCharacteristic(prev, curr);
      if (diffs.length === 0) {
        unchanged.push(curr.id);
      } else {
        for (const d of diffs) modified.push({ id: curr.id, ...d });
      }
    }

    const reinspectionRequired = [
      ...added,
      ...modified.map(m => m.id).filter((v, i, a) => a.indexOf(v) === i),
    ];

    // Revision-level change → every characteristic is suspect unless the
    // caller explicitly opts into a narrower re-inspection list.
    const revisionChanged = previousFAI.form1?.drawingRevision !== currentFAI.form1?.drawingRevision;
    const supplierChanged = previousFAI.form1?.supplierCode !== currentFAI.form1?.supplierCode;

    return {
      isDelta: true,
      baselineFaiId: previousFAI.id,
      currentFaiId: currentFAI.id,
      revisionChanged,
      supplierChanged,
      changes: { added, removed, modified },
      reinspectionRequired,
      unchanged,
      note: {
        he: 'FAI דלתא — בדיקה חוזרת רק למאפיינים המושפעים לפי AS9102 §5.4',
        en: 'Delta FAI — re-inspection limited to impacted characteristics per AS9102 §5.4',
      },
    };
  }

  // ─── Expiry tracking ───────────────────────────────────────────────────────

  /**
   * Check whether an FAI is still valid for a given supplier + part
   * combination.  AS9102 §4.6 invalidates an FAI if production has not
   * occurred for more than `mfgBreakYears` (default 2y).
   *
   * Accepts either an faiId or the raw {supplier, part} tuple — if only
   * supplier+part is supplied, the most-recent matching FAI in the store
   * is evaluated.
   */
  trackExpiry(supplierOrId, part) {
    // Form 1: trackExpiry(faiId)
    if (typeof supplierOrId === 'string' && this._store.has(supplierOrId)) {
      return this._computeExpiry(this._store.get(supplierOrId));
    }
    // Form 2: trackExpiry(supplier, part)
    assertObject(supplierOrId, 'supplier');
    assertObject(part, 'part');
    assertNonEmptyString(supplierOrId.supplierCode, 'supplier.supplierCode');
    assertNonEmptyString(part.partNumber, 'part.partNumber');
    const matches = [];
    for (const fai of this._store.values()) {
      if (
        fai.linkage.supplier.supplierCode === supplierOrId.supplierCode &&
        fai.linkage.part.partNumber === part.partNumber
      ) {
        matches.push(fai);
      }
    }
    if (matches.length === 0) {
      return {
        found: false,
        expired: true,
        reason: 'no-fai-on-file',
        supplier: supplierOrId.supplierCode,
        part: part.partNumber,
        label: GLOSSARY.mfgBreak,
      };
    }
    matches.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const latest = matches[0];
    return { found: true, faiId: latest.id, ...this._computeExpiry(latest) };
  }

  // ─── Read-only accessors ───────────────────────────────────────────────────

  getFAI(faiId) {
    return clone(this._get(faiId));
  }

  listFAIs() {
    return [...this._store.values()].map(clone);
  }

  // ─── Internals ─────────────────────────────────────────────────────────────

  _get(faiId) {
    const fai = this._store.get(faiId);
    if (!fai) throw new Error(`FAI not found: ${faiId}`);
    return fai;
  }

  _touch(fai, event, detail = {}) {
    fai.updatedAt = nowIso();
    fai.audit.push({ at: fai.updatedAt, actor: detail.actor || 'system', event, detail });
  }

  _computeExpiry(fai) {
    const now = this._clock();
    const lastMfg = new Date(fai.expiry.lastManufacturedAt);
    const years = this._mfgBreakYears;
    const expiresAt = new Date(lastMfg);
    expiresAt.setFullYear(expiresAt.getFullYear() + years);
    const expired = now > expiresAt;
    const daysRemaining = Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return {
      lastManufacturedAt: fai.expiry.lastManufacturedAt,
      mfgBreakYears: years,
      expiresAt: expiresAt.toISOString(),
      expired,
      daysRemaining,
      reason: expired ? 'manufacturing-break-exceeded' : 'within-window',
      label: GLOSSARY.mfgBreak,
    };
  }

  _indexChars(faiLike) {
    const map = new Map();
    const list = faiLike?.form3?.characteristics || [];
    for (const c of list) {
      const key = c.bubbleNumber != null ? `B${c.bubbleNumber}` : c.id;
      map.set(key, c);
    }
    return map;
  }

  _diffCharacteristic(prev, curr) {
    const diffs = [];
    const fields = ['description', 'nominal', 'tolerance', 'units', 'type'];
    for (const f of fields) {
      if ((prev[f] ?? null) !== (curr[f] ?? null)) {
        diffs.push({ field: f, before: prev[f] ?? null, after: curr[f] ?? null });
      }
    }
    // bounds comparison — deep-compare numeric bounds
    const pb = prev.bounds, cb = curr.bounds;
    if (JSON.stringify(pb) !== JSON.stringify(cb)) {
      diffs.push({ field: 'bounds', before: pb, after: cb });
    }
    return diffs;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  FAIManager,
  FAIR_REASONS,
  FAIR_REASON_LABELS,
  CHAR_TYPES,
  RESULT_VALUES,
  FORM_LABELS,
  GLOSSARY,
  DEFAULT_MFG_BREAK_YEARS,
  // exposed for unit tests
  _internals: { parseTolerance },
};
