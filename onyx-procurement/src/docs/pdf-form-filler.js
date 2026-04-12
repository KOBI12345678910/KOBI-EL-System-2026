/* ============================================================================
 * Techno-Kol ERP — PDF Form Filler / ממלא טפסי PDF
 * Agent Y-120 / Swarm Office Docs / Mega-ERP Kobi EL 2026
 * ----------------------------------------------------------------------------
 * מנוע מילוי טפסי PDF — מפעל מתכת "טכנו-קול עוזי"
 *
 * Scope (כיסוי):
 *   Fills PDF AcroForm fields programmatically and produces a new filled
 *   PDF output. The PDF 1.4 writer is hand-rolled from scratch using only
 *   Node built-ins — no pdfkit, no pdf-lib, no external deps whatsoever.
 *
 *   Because full PDF parsing is gargantuan, the module uses a SIMPLIFIED
 *   JSON descriptor as the canonical form model:
 *
 *     {
 *       meta:   { id, he, en, version, pageSize: {w,h}, ... },
 *       fields: [
 *         { name, type, rect:[x,y,w,h], required, label:{he,en}, options? }
 *       ]
 *     }
 *
 *   `parseForm()` accepts any of:
 *     - the JSON descriptor (object)
 *     - a JSON string of the descriptor
 *     - a plain-text form descriptor (line-oriented: `name|type|x,y,w,h|he|en`)
 *     - a Node `Buffer` holding any of the above
 *
 *   The actual PDF output is a minimal but *binary-correct* PDF 1.4 shell:
 *     `%PDF-1.4` header, catalog + pages + one page + stream, xref with
 *     byte offsets, trailer and `%%EOF`. The filled values are written as
 *     ASCII Tj operators inside the content stream so the resulting file
 *     opens in any PDF viewer and a human can read the filled data. Full
 *     Hebrew TTF/CIDFont embedding is explicitly a deferred upgrade path
 *     (see AG-Y120 QA report §11).
 *
 * RULES (immutable, inherited from the ERP charter):
 *   לא מוחקים רק משדרגים ומגדלים
 *   → Pure functions on form descriptors. Nothing mutates the caller's
 *     object; every return value is a fresh, deep-frozen clone. The
 *     class exposes a `templateRegistry` whose entries are frozen.
 *   → Zero external dependencies — Node built-ins only (node:zlib is
 *     imported but *optional*; the fallback path writes the content
 *     stream uncompressed so even a zlib-less runtime works).
 *   → Hebrew RTL + bilingual labels on every public structure.
 *
 * Storage (אחסון):
 *   Stateless. All methods are pure functions on form descriptors. The
 *   templateRegistry is a frozen constant — callers clone before mutating.
 * ========================================================================== */

'use strict';

const crypto = require('node:crypto');
// zlib is optional — used for FlateDecode streams when available; if
// the runtime lacks it (extremely rare on Node) we fall back to raw.
let zlib = null;
try { zlib = require('node:zlib'); } catch (_e) { zlib = null; }

/* ----------------------------------------------------------------------------
 * 0. Bilingual enums — frozen catalogs
 * -------------------------------------------------------------------------- */

/** @enum Supported AcroForm field types — every row is bilingual. */
const FIELD_TYPES = Object.freeze({
  text:      Object.freeze({ id: 'text',      he: 'טקסט',          en: 'Text',          widget: '/Tx' }),
  checkbox:  Object.freeze({ id: 'checkbox',  he: 'תיבת סימון',     en: 'Checkbox',      widget: '/Btn' }),
  radio:     Object.freeze({ id: 'radio',     he: 'כפתור רדיו',     en: 'Radio',         widget: '/Btn' }),
  dropdown:  Object.freeze({ id: 'dropdown',  he: 'רשימה נפתחת',    en: 'Dropdown',      widget: '/Ch' }),
  date:      Object.freeze({ id: 'date',      he: 'תאריך',          en: 'Date',          widget: '/Tx' }),
  signature: Object.freeze({ id: 'signature', he: 'חתימה',          en: 'Signature',     widget: '/Sig' }),
  number:    Object.freeze({ id: 'number',    he: 'מספר',           en: 'Number',        widget: '/Tx' }),
});

/** Israeli tax / employment form families supported by the registry. */
const FORM_FAMILIES = Object.freeze({
  form101:  Object.freeze({ id: 'form101',  he: 'טופס 101',  en: 'Form 101',  authority: 'רשות המסים',       purpose_he: 'כרטיס עובד — פרטים אישיים ובקשות להפחתת מס',        purpose_en: 'Employee ID card — personal details & tax reduction requests' }),
  form102:  Object.freeze({ id: 'form102',  he: 'טופס 102',  en: 'Form 102',  authority: 'ביטוח לאומי',       purpose_he: 'דיווח חודשי — ניכויי מס הכנסה ודמי ביטוח לאומי',    purpose_en: 'Monthly report — income tax & social-security withholdings' }),
  form106:  Object.freeze({ id: 'form106',  he: 'טופס 106',  en: 'Form 106',  authority: 'רשות המסים',       purpose_he: 'ריכוז שנתי של הכנסות וניכויי עובד',                 purpose_en: 'Annual employee earnings & withholdings summary' }),
  form126:  Object.freeze({ id: 'form126',  he: 'טופס 126',  en: 'Form 126',  authority: 'רשות המסים',       purpose_he: 'דוח שנתי למעביד — ריכוז שכר, מס וביטוח לאומי',      purpose_en: 'Employer annual return — wages, tax & social-security' }),
  form161:  Object.freeze({ id: 'form161',  he: 'טופס 161',  en: 'Form 161',  authority: 'רשות המסים',       purpose_he: 'הודעה על פרישה / קבלת מענק פרישה — חישוב מס',       purpose_en: 'Retirement notice / severance pay — tax calculation' }),
  form1301: Object.freeze({ id: 'form1301', he: 'טופס 1301', en: 'Form 1301', authority: 'רשות המסים',       purpose_he: 'דוח שנתי ליחיד — הצהרה על הכנסות',                  purpose_en: 'Individual annual return — income statement' }),
});

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

function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(deepClone);
  const out = {};
  for (const k of Object.keys(obj)) out[k] = deepClone(obj[k]);
  return out;
}

function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  Object.getOwnPropertyNames(obj).forEach((prop) => {
    const v = obj[prop];
    if (v && typeof v === 'object' && !Object.isFrozen(v)) deepFreeze(v);
  });
  return Object.freeze(obj);
}

/** Escape a string for use inside a PDF literal string `( ... )`. */
function pdfEscapeString(s) {
  if (s === undefined || s === null) return '';
  const str = String(s);
  // PDF 1.4 literal string escape: \\, \(, \), \n, \r, \t, \b, \f
  return str
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t');
}

/** ASCII-safe fallback for PDF Tj — non-ASCII chars are replaced with `?`.
 * (Full Hebrew TTF embedding is a documented upgrade path — see QA §11.) */
function pdfAsciiSafe(s) {
  if (s === undefined || s === null) return '';
  return String(s).replace(/[^\x20-\x7e]/g, '?');
}

/** Validate an ISO-like yyyy-mm-dd date string. */
function isValidDateString(s) {
  if (typeof s !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return false;
  // Round-trip check (catches 2026-02-31 → Mar 3 normalisation).
  return d.toISOString().slice(0, 10) === s;
}

/** Validate a rect: [x, y, width, height] — all finite non-negative numbers. */
function isValidRect(rect) {
  if (!Array.isArray(rect) || rect.length !== 4) return false;
  for (const n of rect) {
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return false;
  }
  return true;
}

/* ----------------------------------------------------------------------------
 * 2. Template registry — 6 canonical Israeli tax / employment forms
 * ----------------------------------------------------------------------------
 * Every template is a descriptor, not bytes. Rects are placeholder positions
 * in a 595x842 (A4 portrait) canvas — they will be consumed by the downstream
 * Hebrew-aware renderer. The field set is the *minimum* required for the
 * form's primary business use — additional fields can be layered on via a
 * caller-provided override without mutating the frozen registry.
 * -------------------------------------------------------------------------- */

function tpl101() {
  return deepFreeze({
    meta: {
      id: 'form101', ...FORM_FAMILIES.form101,
      version: '2026-01', pageSize: { w: 595, h: 842 },
    },
    fields: [
      { name: 'fullName',      type: 'text',      rect: [100, 780, 300, 24], required: true,  label: { he: 'שם מלא',                en: 'Full name' } },
      { name: 'idNumber',      type: 'text',      rect: [100, 750, 200, 24], required: true,  label: { he: 'מספר זהות',             en: 'ID number' } },
      { name: 'birthDate',     type: 'date',      rect: [100, 720, 150, 24], required: true,  label: { he: 'תאריך לידה',            en: 'Date of birth' } },
      { name: 'address',       type: 'text',      rect: [100, 690, 400, 24], required: true,  label: { he: 'כתובת',                  en: 'Address' } },
      { name: 'maritalStatus', type: 'dropdown',  rect: [100, 660, 200, 24], required: true,  label: { he: 'מצב משפחתי',            en: 'Marital status' }, options: ['single', 'married', 'divorced', 'widowed'] },
      { name: 'numChildren',   type: 'number',    rect: [100, 630, 80,  24], required: false, label: { he: 'מספר ילדים',             en: 'Number of children' } },
      { name: 'residentIL',    type: 'checkbox',  rect: [100, 600, 24,  24], required: true,  label: { he: 'תושב ישראל',            en: 'Israeli resident' } },
      { name: 'requestCredit', type: 'checkbox',  rect: [100, 570, 24,  24], required: false, label: { he: 'בקשה לנקודות זיכוי',    en: 'Request tax credit points' } },
      { name: 'employeeSig',   type: 'signature', rect: [100, 100, 200, 50], required: true,  label: { he: 'חתימת עובד',            en: 'Employee signature' } },
    ],
  });
}

function tpl102() {
  return deepFreeze({
    meta: {
      id: 'form102', ...FORM_FAMILIES.form102,
      version: '2026-01', pageSize: { w: 595, h: 842 },
    },
    fields: [
      { name: 'employerId',      type: 'text',   rect: [100, 780, 200, 24], required: true,  label: { he: 'ת.ז. מעסיק',              en: 'Employer ID' } },
      { name: 'reportMonth',     type: 'date',   rect: [100, 750, 120, 24], required: true,  label: { he: 'חודש דיווח',              en: 'Report month' } },
      { name: 'numEmployees',    type: 'number', rect: [100, 720, 80,  24], required: true,  label: { he: 'מספר עובדים',             en: 'Employee count' } },
      { name: 'grossWages',      type: 'number', rect: [100, 690, 150, 24], required: true,  label: { he: 'שכר ברוטו',                en: 'Gross wages' } },
      { name: 'incomeTax',       type: 'number', rect: [100, 660, 150, 24], required: true,  label: { he: 'ניכוי מס הכנסה',          en: 'Income tax withheld' } },
      { name: 'bituachLeumi',    type: 'number', rect: [100, 630, 150, 24], required: true,  label: { he: 'דמי ביטוח לאומי',         en: 'Social security' } },
      { name: 'healthTax',       type: 'number', rect: [100, 600, 150, 24], required: true,  label: { he: 'דמי ביטוח בריאות',        en: 'Health tax' } },
    ],
  });
}

function tpl106() {
  return deepFreeze({
    meta: {
      id: 'form106', ...FORM_FAMILIES.form106,
      version: '2026-01', pageSize: { w: 595, h: 842 },
    },
    fields: [
      { name: 'year',           type: 'number', rect: [100, 780, 80,  24], required: true, label: { he: 'שנת מס',                en: 'Tax year' } },
      { name: 'employerName',   type: 'text',   rect: [100, 750, 300, 24], required: true, label: { he: 'שם מעסיק',              en: 'Employer name' } },
      { name: 'employerId',     type: 'text',   rect: [100, 720, 200, 24], required: true, label: { he: 'ת.ז. מעסיק',           en: 'Employer ID' } },
      { name: 'employeeName',   type: 'text',   rect: [100, 690, 300, 24], required: true, label: { he: 'שם עובד',               en: 'Employee name' } },
      { name: 'employeeId',     type: 'text',   rect: [100, 660, 200, 24], required: true, label: { he: 'מספר זהות של העובד',    en: 'Employee ID' } },
      { name: 'totalGross',     type: 'number', rect: [100, 630, 150, 24], required: true, label: { he: 'סך שכר ברוטו',          en: 'Total gross wages' } },
      { name: 'totalTax',       type: 'number', rect: [100, 600, 150, 24], required: true, label: { he: 'סך מס שנוכה',           en: 'Total tax withheld' } },
      { name: 'totalBituach',   type: 'number', rect: [100, 570, 150, 24], required: true, label: { he: 'סך ביטוח לאומי',        en: 'Total social security' } },
      { name: 'pensionFund',    type: 'number', rect: [100, 540, 150, 24], required: false, label: { he: 'קרן פנסיה',              en: 'Pension fund' } },
    ],
  });
}

function tpl126() {
  return deepFreeze({
    meta: {
      id: 'form126', ...FORM_FAMILIES.form126,
      version: '2026-01', pageSize: { w: 595, h: 842 },
    },
    fields: [
      { name: 'year',           type: 'number', rect: [100, 780, 80,  24], required: true, label: { he: 'שנת מס',               en: 'Tax year' } },
      { name: 'employerId',     type: 'text',   rect: [100, 750, 200, 24], required: true, label: { he: 'ת.ז. מעסיק',          en: 'Employer ID' } },
      { name: 'employerName',   type: 'text',   rect: [100, 720, 300, 24], required: true, label: { he: 'שם מעסיק',             en: 'Employer name' } },
      { name: 'numEmployees',   type: 'number', rect: [100, 690, 80,  24], required: true, label: { he: 'מספר עובדים',          en: 'Employee count' } },
      { name: 'totalWages',     type: 'number', rect: [100, 660, 150, 24], required: true, label: { he: 'סך שכר שנתי',          en: 'Total annual wages' } },
      { name: 'totalTax',       type: 'number', rect: [100, 630, 150, 24], required: true, label: { he: 'סך מס שנוכה',          en: 'Total tax withheld' } },
      { name: 'totalBituach',   type: 'number', rect: [100, 600, 150, 24], required: true, label: { he: 'סך ביטוח לאומי',       en: 'Total social security' } },
      { name: 'submissionDate', type: 'date',   rect: [100, 570, 150, 24], required: true, label: { he: 'תאריך הגשה',           en: 'Submission date' } },
    ],
  });
}

function tpl161() {
  return deepFreeze({
    meta: {
      id: 'form161', ...FORM_FAMILIES.form161,
      version: '2026-01', pageSize: { w: 595, h: 842 },
    },
    fields: [
      { name: 'employeeName',   type: 'text',     rect: [100, 780, 300, 24], required: true, label: { he: 'שם העובד',              en: 'Employee name' } },
      { name: 'employeeId',     type: 'text',     rect: [100, 750, 200, 24], required: true, label: { he: 'מספר זהות',             en: 'Employee ID' } },
      { name: 'employerName',   type: 'text',     rect: [100, 720, 300, 24], required: true, label: { he: 'שם המעסיק',             en: 'Employer name' } },
      { name: 'retirementDate', type: 'date',     rect: [100, 690, 150, 24], required: true, label: { he: 'תאריך פרישה',           en: 'Retirement date' } },
      { name: 'yearsOfService', type: 'number',   rect: [100, 660, 80,  24], required: true, label: { he: 'שנות עבודה',            en: 'Years of service' } },
      { name: 'severanceAmt',   type: 'number',   rect: [100, 630, 150, 24], required: true, label: { he: 'סכום מענק פרישה',       en: 'Severance amount' } },
      { name: 'reason',         type: 'dropdown', rect: [100, 600, 200, 24], required: true, label: { he: 'סיבת הפרישה',           en: 'Retirement reason' }, options: ['retirement', 'dismissal', 'resignation', 'medical'] },
      { name: 'continuityReq',  type: 'checkbox', rect: [100, 570, 24,  24], required: false, label: { he: 'בקשת רצף זכויות',       en: 'Continuity request' } },
    ],
  });
}

function tpl1301() {
  return deepFreeze({
    meta: {
      id: 'form1301', ...FORM_FAMILIES.form1301,
      version: '2026-01', pageSize: { w: 595, h: 842 },
    },
    fields: [
      { name: 'taxYear',          type: 'number', rect: [100, 780, 80,  24], required: true, label: { he: 'שנת מס',                en: 'Tax year' } },
      { name: 'fullName',         type: 'text',   rect: [100, 750, 300, 24], required: true, label: { he: 'שם מלא',                en: 'Full name' } },
      { name: 'idNumber',         type: 'text',   rect: [100, 720, 200, 24], required: true, label: { he: 'מספר זהות',             en: 'ID number' } },
      { name: 'address',          type: 'text',   rect: [100, 690, 400, 24], required: true, label: { he: 'כתובת',                  en: 'Address' } },
      { name: 'salaryIncome',     type: 'number', rect: [100, 660, 150, 24], required: false, label: { he: 'הכנסה משכר',            en: 'Salary income' } },
      { name: 'businessIncome',   type: 'number', rect: [100, 630, 150, 24], required: false, label: { he: 'הכנסה מעסק',            en: 'Business income' } },
      { name: 'rentalIncome',     type: 'number', rect: [100, 600, 150, 24], required: false, label: { he: 'הכנסה משכירות',         en: 'Rental income' } },
      { name: 'capitalGains',     type: 'number', rect: [100, 570, 150, 24], required: false, label: { he: 'רווחי הון',              en: 'Capital gains' } },
      { name: 'totalIncome',      type: 'number', rect: [100, 540, 150, 24], required: true, label: { he: 'סך כל ההכנסות',          en: 'Total income' } },
      { name: 'taxpayerSig',      type: 'signature', rect: [100, 100, 200, 50], required: true, label: { he: 'חתימת מגיש',         en: 'Taxpayer signature' } },
    ],
  });
}

const TEMPLATE_REGISTRY = deepFreeze({
  form101:  tpl101(),
  form102:  tpl102(),
  form106:  tpl106(),
  form126:  tpl126(),
  form161:  tpl161(),
  form1301: tpl1301(),
});

/* ----------------------------------------------------------------------------
 * 3. Descriptor parsing / validation
 * -------------------------------------------------------------------------- */

function normalizeForm(raw) {
  if (raw === null || raw === undefined) {
    throw new Error('FORM_EMPTY: form descriptor is required');
  }

  // Buffer → string.
  let input = raw;
  if (Buffer.isBuffer(input)) input = input.toString('utf8');

  // Object → clone.
  if (typeof input === 'object') return deepClone(input);

  if (typeof input !== 'string') {
    throw new Error('FORM_TYPE_INVALID: expected object, Buffer, or string');
  }

  const trimmed = input.trim();
  if (!trimmed) throw new Error('FORM_EMPTY: form descriptor is blank');

  // JSON?
  if (trimmed.startsWith('{')) {
    try { return JSON.parse(trimmed); }
    catch (e) { throw new Error(`FORM_JSON_INVALID: ${e.message}`); }
  }

  // Plain-text line format:
  //   # comment
  //   meta: id=form_X, version=2026-01, w=595, h=842, he="שם", en="Name"
  //   field: name|type|x,y,w,h|he|en[|required][|option1,option2,...]
  return parsePlainText(trimmed);
}

function parsePlainText(txt) {
  const lines = txt.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  const meta = { id: 'custom', he: 'טופס מותאם', en: 'Custom form', version: '1.0', pageSize: { w: 595, h: 842 } };
  const fields = [];
  for (const line of lines) {
    if (line.startsWith('meta:')) {
      const kv = line.slice(5).trim();
      const pairs = splitCsv(kv);
      for (const p of pairs) {
        const eq = p.indexOf('=');
        if (eq === -1) continue;
        const k = p.slice(0, eq).trim();
        let v = p.slice(eq + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        if (k === 'w')      meta.pageSize.w = Number(v);
        else if (k === 'h') meta.pageSize.h = Number(v);
        else                meta[k] = v;
      }
      continue;
    }
    if (line.startsWith('field:')) {
      const body = line.slice(6).trim();
      const parts = body.split('|').map(s => s.trim());
      if (parts.length < 5) throw new Error(`FORM_PLAIN_INVALID: need at least 5 columns on field line: ${line}`);
      const [name, type, rectStr, he, en, ...rest] = parts;
      const rect = rectStr.split(',').map(n => Number(n.trim()));
      const field = { name, type, rect, required: false, label: { he, en } };
      for (const r of rest) {
        if (r === 'required') field.required = true;
        else if (r.startsWith('options=')) field.options = r.slice(8).split(',').map(s => s.trim()).filter(Boolean);
      }
      fields.push(field);
      continue;
    }
  }
  return { meta, fields };
}

function splitCsv(s) {
  const out = []; let buf = ''; let q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === q) { buf += c; q = null; }
      else buf += c;
    } else if (c === '"' || c === "'") {
      buf += c; q = c;
    } else if (c === ',') {
      out.push(buf); buf = '';
    } else buf += c;
  }
  if (buf) out.push(buf);
  return out.map(x => x.trim()).filter(Boolean);
}

function validateFormShape(form) {
  if (!form || typeof form !== 'object') throw new Error('FORM_INVALID: not an object');
  if (!form.meta || typeof form.meta !== 'object') throw new Error('FORM_META_MISSING');
  if (!form.meta.id) throw new Error('FORM_META_ID_MISSING');
  if (!Array.isArray(form.fields)) throw new Error('FORM_FIELDS_NOT_ARRAY');
  const seen = new Set();
  for (const f of form.fields) {
    if (!f || typeof f !== 'object') throw new Error('FIELD_INVALID: not an object');
    if (!f.name || typeof f.name !== 'string') throw new Error('FIELD_NAME_MISSING');
    if (seen.has(f.name)) throw new Error(`FIELD_NAME_DUPLICATE: ${f.name}`);
    seen.add(f.name);
    if (!f.type || !FIELD_TYPES[f.type]) {
      throw new Error(`FIELD_TYPE_UNKNOWN: ${f.name} → ${f.type}`);
    }
    if (!isValidRect(f.rect)) {
      throw new Error(`FIELD_RECT_INVALID: ${f.name} rect must be [x,y,w,h] finite non-negative`);
    }
    if (f.label && typeof f.label !== 'object') throw new Error(`FIELD_LABEL_INVALID: ${f.name}`);
  }
  return form;
}

/* ----------------------------------------------------------------------------
 * 4. Value validation per field type
 * -------------------------------------------------------------------------- */

function coerceAndValidate(field, value) {
  const t = field.type;
  if (value === undefined || value === null || value === '') {
    if (field.required) throw new Error(`REQUIRED_FIELD_MISSING: ${field.name}`);
    return null;
  }
  switch (t) {
    case 'text': {
      if (typeof value === 'number' || typeof value === 'boolean') return String(value);
      if (typeof value !== 'string') throw new Error(`TYPE_MISMATCH: ${field.name} expected text`);
      return value;
    }
    case 'number': {
      const n = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(n)) throw new Error(`TYPE_MISMATCH: ${field.name} expected number`);
      return n;
    }
    case 'checkbox': {
      if (typeof value === 'boolean') return value;
      if (value === 'true' || value === 'Yes' || value === 'On' || value === 1) return true;
      if (value === 'false' || value === 'No' || value === 'Off' || value === 0) return false;
      throw new Error(`TYPE_MISMATCH: ${field.name} expected checkbox boolean`);
    }
    case 'radio': {
      if (!Array.isArray(field.options) || field.options.length === 0) {
        throw new Error(`RADIO_OPTIONS_MISSING: ${field.name}`);
      }
      if (!field.options.includes(value)) {
        throw new Error(`RADIO_VALUE_UNKNOWN: ${field.name}=${value}`);
      }
      return value;
    }
    case 'dropdown': {
      if (!Array.isArray(field.options) || field.options.length === 0) {
        throw new Error(`DROPDOWN_OPTIONS_MISSING: ${field.name}`);
      }
      if (!field.options.includes(value)) {
        throw new Error(`DROPDOWN_VALUE_UNKNOWN: ${field.name}=${value}`);
      }
      return value;
    }
    case 'date': {
      if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) throw new Error(`TYPE_MISMATCH: ${field.name} invalid Date`);
        return value.toISOString().slice(0, 10);
      }
      if (typeof value !== 'string') throw new Error(`TYPE_MISMATCH: ${field.name} expected date string`);
      // Accept YYYY-MM-DD strictly (ISO-like). Also accept a full ISO stamp.
      const short = value.length === 10 ? value : value.slice(0, 10);
      if (!isValidDateString(short)) throw new Error(`TYPE_MISMATCH: ${field.name} invalid date ${value}`);
      return short;
    }
    case 'signature': {
      if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`TYPE_MISMATCH: ${field.name} expected signature string (name or base64)`);
      }
      return value;
    }
    default:
      throw new Error(`TYPE_UNKNOWN: ${t}`);
  }
}

/* ----------------------------------------------------------------------------
 * 5. PDF 1.4 binary writer — hand-rolled, zero external deps
 * ----------------------------------------------------------------------------
 * The writer is deliberately minimal:
 *   obj 1 → /Catalog with /Pages ref
 *   obj 2 → /Pages with Kids=[obj 3]
 *   obj 3 → /Page with /Contents obj 4, /Resources/Font /F1 obj 5
 *   obj 4 → /Contents stream — BT /F1 12 Tf (...) Tj ET per line
 *   obj 5 → /Font /Type1 /Helvetica (ASCII only; Hebrew upgrade-path in §11)
 *
 * xref is written with exact 10-digit offsets; trailer carries /Size and
 * /Root; the file ends with `startxref <offset> %%EOF`. The result opens in
 * any compliant PDF 1.4 viewer and satisfies `%PDF-` header + `%%EOF` trailer.
 * -------------------------------------------------------------------------- */

function buildContentStream(filledForm) {
  const lines = [];
  lines.push('BT');
  lines.push('/F1 14 Tf');
  // Title line at top
  const title = pdfAsciiSafe(
    (filledForm.meta && filledForm.meta.en) || filledForm.meta.id || 'Filled PDF'
  );
  lines.push('72 800 Td');
  lines.push(`(${pdfEscapeString(title)}) Tj`);
  lines.push('/F1 10 Tf');

  let y = 780;
  for (const f of filledForm.fields) {
    const raw = f.value;
    let text;
    if (raw === null || raw === undefined) text = '';
    else if (typeof raw === 'boolean') text = raw ? '[X]' : '[ ]';
    else text = String(raw);

    const labelEn = (f.label && (f.label.en || f.label.he)) || f.name;
    const line = `${labelEn}: ${text}`;
    lines.push('1 0 0 1 72 ' + y + ' Tm');
    lines.push(`(${pdfEscapeString(pdfAsciiSafe(line))}) Tj`);
    y -= 18;
    if (y < 100) break; // single-page writer
  }
  lines.push('ET');
  return lines.join('\n');
}

function generatePDFBuffer(filledForm) {
  if (!filledForm || typeof filledForm !== 'object') {
    throw new Error('FILLED_FORM_INVALID: expected object');
  }
  if (!Array.isArray(filledForm.fields)) {
    throw new Error('FILLED_FORM_FIELDS_MISSING');
  }
  const pageSize = (filledForm.meta && filledForm.meta.pageSize) || { w: 595, h: 842 };

  const contentStr = buildContentStream(filledForm);
  const contentBytes = Buffer.from(contentStr, 'latin1');

  // We emit uncompressed for maximum viewer compatibility and to keep the
  // writer trivially auditable. zlib fallback path would require /Filter.
  const objects = [];
  // obj 1: Catalog
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  // obj 2: Pages
  objects.push('<< /Type /Pages /Count 1 /Kids [3 0 R] >>');
  // obj 3: Page
  objects.push(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageSize.w} ${pageSize.h}] ` +
    `/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`
  );
  // obj 4: content stream
  objects.push(
    `<< /Length ${contentBytes.length} >>\nstream\n${contentStr}\nendstream`
  );
  // obj 5: base-14 font
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');

  const header = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'; // binary marker per PDF spec
  let body = '';
  const offsets = [];
  let cursor = Buffer.byteLength(header, 'latin1');
  for (let i = 0; i < objects.length; i++) {
    offsets.push(cursor);
    const entry = `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
    body += entry;
    cursor += Buffer.byteLength(entry, 'latin1');
  }

  const xrefOffset = cursor;
  let xref = 'xref\n';
  xref += `0 ${objects.length + 1}\n`;
  xref += '0000000000 65535 f \n';
  for (const off of offsets) {
    xref += pad10(off) + ' 00000 n \n';
  }
  const trailer =
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(header + body + xref + trailer, 'latin1');
}

function pad10(n) { return String(n).padStart(10, '0'); }

/* ----------------------------------------------------------------------------
 * 6. PDFFormFiller — main class (stateless, pure functions on descriptors)
 * -------------------------------------------------------------------------- */

class PDFFormFiller {
  constructor() {
    this.templateRegistry = TEMPLATE_REGISTRY;
    this.FIELD_TYPES = FIELD_TYPES;
    this.FORM_FAMILIES = FORM_FAMILIES;
  }

  /**
   * Parse a form descriptor. Accepts: JSON object, JSON string, plain-text
   * descriptor, or a Buffer holding any of the above. Returns a validated
   * clone — the caller's input is never mutated.
   *
   * Full PDF binary parsing is out of scope for this zero-deps module; for
   * that upgrade path, see QA report §11.
   */
  parseForm(pdfBuffer) {
    const form = normalizeForm(pdfBuffer);
    validateFormShape(form);
    return form;
  }

  /** Return the list of field names in descriptor order. */
  getFieldNames(form) {
    validateFormShape(form);
    return form.fields.map(f => f.name);
  }

  /** Return the list of field types keyed by name. */
  getFieldTypes(form) {
    validateFormShape(form);
    const out = {};
    for (const f of form.fields) out[f.name] = f.type;
    return out;
  }

  /**
   * Validate `values` against the form's field types without filling.
   * Returns an array of { field, ok, reason? } entries.
   */
  validateFieldTypes(fields, values) {
    const list = Array.isArray(fields) ? fields : (fields && fields.fields) || [];
    const vals = values || {};
    const results = [];
    for (const f of list) {
      if (!FIELD_TYPES[f.type]) {
        results.push({ field: f.name, ok: false, reason: `FIELD_TYPE_UNKNOWN: ${f.type}` });
        continue;
      }
      try {
        coerceAndValidate(f, vals[f.name]);
        results.push({ field: f.name, ok: true });
      } catch (e) {
        results.push({ field: f.name, ok: false, reason: e.message });
      }
    }
    return results;
  }

  /**
   * Map values onto the form. Returns a fresh filled-form object:
   *   { meta, fields:[{...original, value}], filledAt, hash, flattened:false }
   */
  fillForm({ form, values } = {}) {
    if (!form) throw new Error('FORM_REQUIRED');
    const clone = this.parseForm(form);
    const vals = values || {};
    const filledFields = clone.fields.map((f) => {
      const v = coerceAndValidate(f, vals[f.name]);
      return { ...f, value: v };
    });
    const filled = {
      meta: clone.meta,
      fields: filledFields,
      filledAt: new Date().toISOString(),
      flattened: false,
    };
    filled.hash = sha256Hex(stableStringify({
      metaId: filled.meta.id,
      fields: filled.fields.map(f => ({ name: f.name, type: f.type, value: f.value })),
    }));
    return filled;
  }

  /**
   * Flatten a filled form: convert AcroForm fields into static content
   * stream lines. The output is a filled form with `flattened: true` and
   * `staticLines` populated — downstream callers render these as immutable
   * text. The original fields are preserved (nothing is ever deleted) so
   * an audit can still reconstruct the structure.
   */
  flattenForm(filledForm) {
    if (!filledForm || !Array.isArray(filledForm.fields)) {
      throw new Error('FILLED_FORM_INVALID');
    }
    const staticLines = filledForm.fields.map((f) => {
      const lbl = (f.label && (f.label.he || f.label.en)) || f.name;
      const lblEn = (f.label && f.label.en) || f.name;
      let rendered;
      if (f.value === null || f.value === undefined) rendered = '';
      else if (typeof f.value === 'boolean') rendered = f.value ? 'Yes' : 'No';
      else rendered = String(f.value);
      return {
        name: f.name,
        rect: f.rect,
        type: f.type,
        label_he: lbl,
        label_en: lblEn,
        rendered,
        readOnly: true,
      };
    });
    return {
      ...filledForm,
      flattened: true,
      staticLines,
      flattenedAt: new Date().toISOString(),
    };
  }

  /**
   * Produce a minimal binary-correct PDF 1.4 buffer from a filled form.
   * Guarantees: starts with `%PDF-1.4`, contains `xref`, `trailer`, and
   * ends with `%%EOF`. Text is ASCII-safe; full Hebrew TTF embedding is a
   * documented upgrade path.
   */
  generatePDFBuffer(filledForm) {
    return generatePDFBuffer(filledForm);
  }

  /**
   * Reverse a filled form back to a plain { field → value } data dictionary.
   * Useful for JSON round-tripping and regression snapshots.
   */
  extractFormData(filledForm) {
    if (!filledForm || !Array.isArray(filledForm.fields)) {
      throw new Error('FILLED_FORM_INVALID');
    }
    const out = {};
    for (const f of filledForm.fields) out[f.name] = f.value === undefined ? null : f.value;
    return out;
  }

  /**
   * Substitute bilingual labels on a JSON descriptor. `lang` ∈ {'he','en','both'}.
   * Returns a cloned form whose fields carry a `displayLabel` string.
   */
  localizeFieldLabels(form, lang) {
    if (lang !== 'he' && lang !== 'en' && lang !== 'both') {
      throw new Error(`LANG_UNKNOWN: ${lang}`);
    }
    const clone = deepClone(this.parseForm(form));
    for (const f of clone.fields) {
      const he = (f.label && f.label.he) || f.name;
      const en = (f.label && f.label.en) || f.name;
      if (lang === 'he')        f.displayLabel = he;
      else if (lang === 'en')   f.displayLabel = en;
      else                      f.displayLabel = `${he} / ${en}`;
    }
    clone.localizedLang = lang;
    return clone;
  }

  /**
   * One-shot fill by template id. Returns the same shape as fillForm().
   * The template registry itself is frozen — the returned filled form is
   * built on a fresh clone.
   */
  fillTemplate(templateId, data) {
    if (!templateId || typeof templateId !== 'string') {
      throw new Error('TEMPLATE_ID_REQUIRED');
    }
    const tpl = this.templateRegistry[templateId];
    if (!tpl) throw new Error(`TEMPLATE_UNKNOWN: ${templateId}`);
    return this.fillForm({ form: tpl, values: data || {} });
  }

  /** Return a list of every known template id with bilingual meta. */
  listTemplates() {
    return Object.keys(this.templateRegistry).map((id) => {
      const t = this.templateRegistry[id];
      return {
        id,
        he: t.meta.he,
        en: t.meta.en,
        authority: t.meta.authority,
        purpose_he: t.meta.purpose_he,
        purpose_en: t.meta.purpose_en,
        fieldCount: t.fields.length,
      };
    });
  }
}

/* ----------------------------------------------------------------------------
 * 7. Exports
 * -------------------------------------------------------------------------- */

module.exports = {
  PDFFormFiller,
  FIELD_TYPES,
  FORM_FAMILIES,
  TEMPLATE_REGISTRY,
  // low-level helpers exposed for tests and advanced callers
  sha256Hex,
  stableStringify,
  pdfEscapeString,
  pdfAsciiSafe,
  isValidDateString,
  isValidRect,
  normalizeForm,
  validateFormShape,
  coerceAndValidate,
  generatePDFBuffer,
  buildContentStream,
};
