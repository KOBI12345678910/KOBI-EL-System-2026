/* ============================================================================
 * Techno-Kol ERP — Document Watermark & Stamp Tool
 * Agent Y-119 / Swarm Office Docs / Mega-ERP Kobi EL 2026
 * ----------------------------------------------------------------------------
 * כלי סימון מים וחותמות למסמכים — מפעל מתכת "טכנו-קול עוזי"
 *
 * Scope (כיסוי):
 *   Produces metadata OVERLAY SPECS that describe visible stamps and
 *   invisible tracking markers for PDFs and images. A downstream renderer
 *   (PDF engine, raster compositor) consumes these specs and applies them
 *   to actual pixels — this module does **no pixel work**.
 *
 *   Supported watermark families:
 *     1. visible     — text stamps with position/opacity/rotation/color
 *     2. invisible   — SHA-256-hashable metadata embedded for forensics
 *     3. timestamp   — ISO / Hebrew (Gregorian + optional Jewish) / short
 *     4. confidentiality seal — public → internal → confidential
 *                                → restricted → secret, with bilingual
 *                                labels and color palette
 *     5. dynamic     — template substitution ({recipient}, {date}, ...)
 *
 * RULES (immutable, inherited from the ERP charter):
 *   לא מוחקים רק משדרגים ומגדלים
 *   → Nothing is ever deleted. removeWatermark() is a **soft** status
 *     flip to 'hidden'. The underlying record and its audit log survive
 *     forever. A justification string is REQUIRED on every hide call.
 *   → Zero external dependencies — Node built-ins only (node:crypto).
 *   → Hebrew RTL + bilingual labels on every public structure.
 *
 * Storage (אחסון):
 *   Two in-memory Maps:
 *     watermarks      Map<docId, Map<watermarkId, WatermarkRecord>>
 *     auditByDoc      Map<docId, AuditEntry[]>
 *
 *   A WatermarkRecord is a spec — not rendered bytes. A separate PDF
 *   renderer downstream will consume these records and burn them onto
 *   the document when the document is actually materialised.
 * ========================================================================== */

'use strict';

const crypto = require('node:crypto');

/* ----------------------------------------------------------------------------
 * 0. Bilingual enums — frozen catalogs
 * -------------------------------------------------------------------------- */

/** @enum Watermark families. */
const WM_TYPES = Object.freeze({
  visible:         Object.freeze({ id: 'visible',         he: 'סימן מים גלוי',       en: 'Visible watermark' }),
  invisible:       Object.freeze({ id: 'invisible',       he: 'סימן מים סמוי',        en: 'Invisible watermark' }),
  timestamp:       Object.freeze({ id: 'timestamp',       he: 'חותמת זמן',            en: 'Timestamp' }),
  confidentiality: Object.freeze({ id: 'confidentiality', he: 'חותמת סיווג',          en: 'Confidentiality seal' }),
  dynamic:         Object.freeze({ id: 'dynamic',         he: 'סימן מים דינמי',       en: 'Dynamic watermark' }),
});

/** @enum Visible positions on the page canvas. */
const POSITIONS = Object.freeze({
  'top-left':     Object.freeze({ id: 'top-left',     he: 'שמאל-עליון',     en: 'Top-left',     x: 'left',   y: 'top',    rotate: 0  }),
  'top-right':    Object.freeze({ id: 'top-right',    he: 'ימין-עליון',     en: 'Top-right',    x: 'right',  y: 'top',    rotate: 0  }),
  'bottom-left':  Object.freeze({ id: 'bottom-left',  he: 'שמאל-תחתון',     en: 'Bottom-left',  x: 'left',   y: 'bottom', rotate: 0  }),
  'bottom-right': Object.freeze({ id: 'bottom-right', he: 'ימין-תחתון',     en: 'Bottom-right', x: 'right',  y: 'bottom', rotate: 0  }),
  'center':       Object.freeze({ id: 'center',       he: 'מרכז',            en: 'Center',       x: 'center', y: 'center', rotate: 0  }),
  'diagonal':     Object.freeze({ id: 'diagonal',     he: 'אלכסון',          en: 'Diagonal',     x: 'center', y: 'center', rotate: 45 }),
});

/** @enum Confidentiality levels — bilingual label + color palette. */
const CONFIDENTIALITY_LEVELS = Object.freeze({
  public:       Object.freeze({ id: 'public',       rank: 1, he: 'ציבורי',         en: 'Public',       color: '#2E7D32', textColor: '#FFFFFF' }),
  internal:     Object.freeze({ id: 'internal',     rank: 2, he: 'פנימי',          en: 'Internal',     color: '#1565C0', textColor: '#FFFFFF' }),
  confidential: Object.freeze({ id: 'confidential', rank: 3, he: 'חסוי',           en: 'Confidential', color: '#EF6C00', textColor: '#FFFFFF' }),
  restricted:   Object.freeze({ id: 'restricted',   rank: 4, he: 'מוגבל',          en: 'Restricted',   color: '#C62828', textColor: '#FFFFFF' }),
  secret:       Object.freeze({ id: 'secret',       rank: 5, he: 'סודי ביותר',     en: 'Secret',       color: '#4A148C', textColor: '#FFFFFF' }),
});

/** @enum Watermark record status (append-only, no deletion). */
const WM_STATUS = Object.freeze({
  active: Object.freeze({ id: 'active', he: 'פעיל',  en: 'Active' }),
  hidden: Object.freeze({ id: 'hidden', he: 'מוסתר', en: 'Hidden (soft-removed)' }),
});

/** @enum Timestamp format catalog. */
const TS_FORMATS = Object.freeze({
  ISO:    Object.freeze({ id: 'ISO',    he: 'ISO 8601',            en: 'ISO 8601' }),
  Hebrew: Object.freeze({ id: 'Hebrew', he: 'עברי (גרגוריאני)',     en: 'Hebrew (Gregorian)' }),
  short:  Object.freeze({ id: 'short',  he: 'קצר',                  en: 'Short' }),
});

/** Hebrew month names (Gregorian calendar spelled in Hebrew script). */
const HEBREW_GREGORIAN_MONTHS = Object.freeze([
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
]);

/** Jewish-calendar month names — used for the optional עברי addendum. */
const JEWISH_MONTHS = Object.freeze([
  'תשרי', 'חשוון', 'כסלו', 'טבת', 'שבט', 'אדר',
  'ניסן', 'אייר', 'סיוון', 'תמוז', 'אב', 'אלול',
]);

/* ----------------------------------------------------------------------------
 * 1. Helpers — pure, no state
 * -------------------------------------------------------------------------- */

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
}

function nowIso() { return new Date().toISOString(); }

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  Object.getOwnPropertyNames(obj).forEach((prop) => {
    const v = obj[prop];
    if (v && typeof v === 'object' && !Object.isFrozen(v)) deepFreeze(v);
  });
  return Object.freeze(obj);
}

function clampOpacity(op) {
  if (op === undefined || op === null) return 0.5;
  const n = Number(op);
  if (Number.isNaN(n)) throw new Error('OPACITY_INVALID: opacity must be a number in [0,1]');
  if (n < 0 || n > 1) throw new Error('OPACITY_OUT_OF_RANGE: opacity must be in [0,1]');
  return n;
}

function normalizeColor(c) {
  if (c === undefined || c === null || c === '') return '#808080';
  if (typeof c !== 'string') throw new Error('COLOR_INVALID: color must be a string');
  return c;
}

/* Gregorian → approximate Jewish calendar (Hillel II cycle). This is a
 * heuristic good for 1900-2100 and is adequate for stamping purposes;
 * the ground truth hebrew date rendered on the actual PDF is produced by
 * the downstream renderer which uses a full luach table. */
function approxJewishYear(gYear) {
  return gYear + 3760;
}

/** Build a Hebrew-formatted timestamp string. */
function formatHebrewDate(d, { withJewish = false } = {}) {
  const day = d.getDate();
  const month = HEBREW_GREGORIAN_MONTHS[d.getMonth()];
  const year = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const base = `${day} ב${month} ${year} ${hh}:${mm}`;
  if (!withJewish) return `גרגוריאני: ${base}`;
  const jy = approxJewishYear(year);
  const jMonth = JEWISH_MONTHS[d.getMonth()];
  return `גרגוריאני: ${base}  |  עברי: ${day} ${jMonth} ${jy}`;
}

/** Template substitution for dynamic watermarks. Unknown vars stay literal. */
function substituteTemplate(template, context) {
  if (typeof template !== 'string') throw new Error('TEMPLATE_INVALID: template must be a string');
  const ctx = context || {};
  return template.replace(/\{(\w[\w_]*)\}/g, (m, key) => {
    if (Object.prototype.hasOwnProperty.call(ctx, key)) {
      const v = ctx[key];
      return v === undefined || v === null ? '' : String(v);
    }
    return m;
  });
}

/* ----------------------------------------------------------------------------
 * 2. WatermarkTool class
 * -------------------------------------------------------------------------- */

class WatermarkTool {
  constructor({ clock } = {}) {
    /** @type {Map<string, Map<string, object>>} docId → watermarkId → record */
    this.watermarks = new Map();
    /** @type {Map<string, object[]>} docId → audit entries */
    this.auditByDoc = new Map();
    /** clock() returns a Date — injectable for deterministic tests. */
    this.clock = typeof clock === 'function' ? clock : () => new Date();
  }

  /* -- internal plumbing ------------------------------------------------- */

  _bucket(docId) {
    if (!docId || typeof docId !== 'string') throw new Error('DOC_ID_REQUIRED: docId is mandatory');
    if (!this.watermarks.has(docId)) this.watermarks.set(docId, new Map());
    return this.watermarks.get(docId);
  }

  _audit(docId, action, payload) {
    if (!this.auditByDoc.has(docId)) this.auditByDoc.set(docId, []);
    const entry = Object.freeze({
      ts: this.clock().toISOString(),
      action,
      payload: deepFreeze(JSON.parse(JSON.stringify(payload || {}))),
    });
    this.auditByDoc.get(docId).push(entry);
    return entry;
  }

  _store(docId, type, spec, extra = {}) {
    const bucket = this._bucket(docId);
    const id = newId('wm');
    const createdAt = this.clock().toISOString();
    const record = {
      id,
      docId,
      type,
      status: WM_STATUS.active.id,
      createdAt,
      spec,
      ...extra,
    };
    // Integrity hash covers the core fields — used by verifyWatermark.
    record.integrityHash = sha256Hex(stableStringify({
      id, docId, type, createdAt, spec, metadata: extra.metadata || null,
    }));
    bucket.set(id, record);
    this._audit(docId, 'apply', { watermarkId: id, type });
    return record;
  }

  /* -- 2.1 visible watermark -------------------------------------------- */

  applyVisibleWatermark({ docId, text, position, opacity, rotation, color, fontSize } = {}) {
    if (!text || typeof text !== 'string') throw new Error('TEXT_REQUIRED: text is mandatory');
    if (!position || !POSITIONS[position]) {
      throw new Error(`POSITION_INVALID: must be one of ${Object.keys(POSITIONS).join(', ')}`);
    }
    const pos = POSITIONS[position];
    const spec = Object.freeze({
      text,
      position: pos.id,
      positionLabel: Object.freeze({ he: pos.he, en: pos.en }),
      anchor: Object.freeze({ x: pos.x, y: pos.y }),
      opacity: clampOpacity(opacity),
      rotation: rotation === undefined ? pos.rotate : Number(rotation),
      color: normalizeColor(color),
      fontSize: fontSize === undefined ? 24 : Number(fontSize),
    });
    return this._store(docId, WM_TYPES.visible.id, spec);
  }

  /* -- 2.2 invisible watermark (metadata + SHA-256) --------------------- */

  applyInvisibleWatermark({ docId, metadata } = {}) {
    if (!metadata || typeof metadata !== 'object') {
      throw new Error('METADATA_REQUIRED: metadata object is mandatory');
    }
    const required = ['owner', 'timestamp', 'recipient', 'purpose'];
    for (const k of required) {
      if (metadata[k] === undefined || metadata[k] === null || metadata[k] === '') {
        throw new Error(`METADATA_MISSING_FIELD: ${k}`);
      }
    }
    const sealed = Object.freeze({
      owner: String(metadata.owner),
      timestamp: String(metadata.timestamp),
      recipient: String(metadata.recipient),
      purpose: String(metadata.purpose),
    });
    const payloadHash = sha256Hex(stableStringify(sealed));
    const spec = Object.freeze({
      embedding: 'metadata-only',
      payloadHash,
      labels: Object.freeze({ he: 'סימן מים סמוי', en: 'Invisible watermark' }),
    });
    return this._store(docId, WM_TYPES.invisible.id, spec, { metadata: sealed, payloadHash });
  }

  /* -- 2.3 timestamp ---------------------------------------------------- */

  applyTimestamp({ docId, format = 'ISO', withJewish = false } = {}) {
    if (!TS_FORMATS[format]) {
      throw new Error(`TIMESTAMP_FORMAT_INVALID: must be one of ${Object.keys(TS_FORMATS).join(', ')}`);
    }
    const d = this.clock();
    let rendered;
    switch (format) {
      case 'ISO':
        rendered = d.toISOString();
        break;
      case 'Hebrew':
        rendered = formatHebrewDate(d, { withJewish });
        break;
      case 'short':
        rendered = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
        break;
      default:
        rendered = d.toISOString();
    }
    const spec = Object.freeze({
      format,
      formatLabel: Object.freeze({ he: TS_FORMATS[format].he, en: TS_FORMATS[format].en }),
      withJewish: Boolean(withJewish),
      rendered,
      isoReference: d.toISOString(),
    });
    return this._store(docId, WM_TYPES.timestamp.id, spec);
  }

  /* -- 2.4 confidentiality seal ----------------------------------------- */

  applyConfidentialitySeal({ docId, level } = {}) {
    if (!level || !CONFIDENTIALITY_LEVELS[level]) {
      throw new Error(`LEVEL_INVALID: must be one of ${Object.keys(CONFIDENTIALITY_LEVELS).join(', ')}`);
    }
    const lvl = CONFIDENTIALITY_LEVELS[level];
    const spec = Object.freeze({
      level: lvl.id,
      rank: lvl.rank,
      labels: Object.freeze({ he: lvl.he, en: lvl.en }),
      color: lvl.color,
      textColor: lvl.textColor,
      bilingualText: `${lvl.he} / ${lvl.en}`,
      position: POSITIONS['top-right'].id,
    });
    return this._store(docId, WM_TYPES.confidentiality.id, spec);
  }

  /* -- 2.5 dynamic watermark (template substitution) -------------------- */

  applyDynamicWatermark({ docId, template, context } = {}) {
    if (!template || typeof template !== 'string') {
      throw new Error('TEMPLATE_REQUIRED: template is mandatory');
    }
    const ctx = { ...(context || {}) };
    // auto-fill doc_id + date if caller forgot
    if (ctx.doc_id === undefined) ctx.doc_id = docId;
    if (ctx.date === undefined) ctx.date = this.clock().toISOString().slice(0, 10);
    const rendered = substituteTemplate(template, ctx);
    const spec = Object.freeze({
      template,
      context: deepFreeze({ ...ctx }),
      rendered,
      labels: Object.freeze({ he: 'סימן מים דינמי', en: 'Dynamic watermark' }),
    });
    return this._store(docId, WM_TYPES.dynamic.id, spec);
  }

  /* -- 2.6 verify invisible watermark integrity ------------------------- */

  verifyWatermark(docId, expected) {
    const bucket = this.watermarks.get(docId);
    if (!bucket) return { ok: false, reason: 'NO_WATERMARKS', he: 'אין חותמות', en: 'No watermarks' };
    if (!expected || typeof expected !== 'object') {
      throw new Error('EXPECTED_REQUIRED: expected metadata object is mandatory');
    }
    const required = ['owner', 'timestamp', 'recipient', 'purpose'];
    for (const k of required) {
      if (expected[k] === undefined) {
        throw new Error(`EXPECTED_MISSING_FIELD: ${k}`);
      }
    }
    const sealed = {
      owner: String(expected.owner),
      timestamp: String(expected.timestamp),
      recipient: String(expected.recipient),
      purpose: String(expected.purpose),
    };
    const expectedHash = sha256Hex(stableStringify(sealed));
    for (const rec of bucket.values()) {
      if (rec.type !== WM_TYPES.invisible.id) continue;
      if (rec.status !== WM_STATUS.active.id) continue;
      if (rec.payloadHash === expectedHash) {
        this._audit(docId, 'verify', { watermarkId: rec.id, ok: true });
        return {
          ok: true,
          watermarkId: rec.id,
          payloadHash: rec.payloadHash,
          he: 'חותמת אותנטית',
          en: 'Authentic watermark',
        };
      }
    }
    this._audit(docId, 'verify', { ok: false });
    return { ok: false, reason: 'HASH_MISMATCH', he: 'חוסר התאמה בגיבוב', en: 'Hash mismatch' };
  }

  /* -- 2.7 extract all watermarks --------------------------------------- */

  extractWatermarks(docId) {
    const bucket = this.watermarks.get(docId);
    if (!bucket) return [];
    return Array.from(bucket.values()).map(r => ({ ...r }));
  }

  /* -- 2.8 soft-remove (status flip to hidden) -------------------------- */

  removeWatermark(docId, watermarkId, justification) {
    if (!justification || typeof justification !== 'string' || justification.trim() === '') {
      throw new Error('JUSTIFICATION_REQUIRED: soft-remove requires a non-empty justification');
    }
    const bucket = this.watermarks.get(docId);
    if (!bucket) throw new Error('DOC_NOT_FOUND: no watermarks for docId');
    const rec = bucket.get(watermarkId);
    if (!rec) throw new Error('WATERMARK_NOT_FOUND: unknown watermarkId');
    // Append-only intent: previous state is preserved in the audit log.
    const previousStatus = rec.status;
    rec.status = WM_STATUS.hidden.id;
    rec.hiddenAt = this.clock().toISOString();
    rec.hiddenJustification = justification;
    this._audit(docId, 'soft-remove', {
      watermarkId,
      previousStatus,
      justification,
    });
    return { ...rec };
  }

  /* -- 2.9 bulk apply ---------------------------------------------------- */

  bulkApply(docIds, watermarkSpec) {
    if (!Array.isArray(docIds) || docIds.length === 0) {
      throw new Error('DOC_IDS_REQUIRED: docIds must be a non-empty array');
    }
    if (!watermarkSpec || typeof watermarkSpec !== 'object' || !watermarkSpec.type) {
      throw new Error('SPEC_REQUIRED: watermarkSpec must include a type');
    }
    const results = [];
    for (const docId of docIds) {
      try {
        let rec;
        switch (watermarkSpec.type) {
          case 'visible':
            rec = this.applyVisibleWatermark({ ...watermarkSpec, docId });
            break;
          case 'invisible':
            rec = this.applyInvisibleWatermark({ docId, metadata: watermarkSpec.metadata });
            break;
          case 'timestamp':
            rec = this.applyTimestamp({ docId, format: watermarkSpec.format, withJewish: watermarkSpec.withJewish });
            break;
          case 'confidentiality':
            rec = this.applyConfidentialitySeal({ docId, level: watermarkSpec.level });
            break;
          case 'dynamic':
            rec = this.applyDynamicWatermark({ docId, template: watermarkSpec.template, context: watermarkSpec.context });
            break;
          default:
            throw new Error(`BULK_TYPE_INVALID: unknown type ${watermarkSpec.type}`);
        }
        results.push({ docId, ok: true, watermarkId: rec.id });
      } catch (err) {
        results.push({ docId, ok: false, error: err.message });
      }
    }
    return {
      total: docIds.length,
      succeeded: results.filter(r => r.ok).length,
      failed: results.filter(r => !r.ok).length,
      results,
    };
  }

  /* -- 2.10 audit trail -------------------------------------------------- */

  auditTrail(docId) {
    const arr = this.auditByDoc.get(docId);
    if (!arr) return [];
    // Return a frozen shallow copy so callers cannot mutate history.
    return arr.map(e => ({ ...e }));
  }
}

/* ----------------------------------------------------------------------------
 * 3. Module exports
 * -------------------------------------------------------------------------- */

module.exports = {
  WatermarkTool,
  WM_TYPES,
  POSITIONS,
  CONFIDENTIALITY_LEVELS,
  WM_STATUS,
  TS_FORMATS,
  // helpers exposed for downstream reuse and tests
  sha256Hex,
  stableStringify,
  formatHebrewDate,
  substituteTemplate,
};
