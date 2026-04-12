/**
 * ONYX CSV Import Wizard — Agent 67
 * ──────────────────────────────────────────────────────────────
 * Full-featured CSV ingestion pipeline for ONYX Procurement:
 *
 *   1. parseCSV(content, opts)           — hand-rolled RFC-4180-ish parser
 *   2. autoDetectDelimiter(sample)       — , / ; / \t
 *   3. autoDetectEncoding(buffer)        — UTF-8 vs Windows-1255 (Hebrew)
 *   4. inferSchema(rows)                 — number / date / string / boolean
 *   5. mapColumns(csvHeaders, target)    — fuzzy header → field mapping
 *   6. validateRows(rows, schema, rules) — per-row validation pipeline
 *   7. importRows(validated, opts)       — batched insert/upsert via Supabase
 *   8. importReport(result)              — human-readable per-row report
 *
 * Supported entities (targetSchema):
 *   - employees
 *   - suppliers
 *   - invoices
 *   - bank_transactions
 *
 * Design principles:
 *   • Zero runtime deps — pure JS, no new packages.
 *   • Never throws on bad CSV — returns `{rows, errors}` instead.
 *   • Windows-1255 (CP1255) decoder is implemented by lookup table
 *     (no `iconv-lite` dependency).
 *   • Validation rules are data-driven so new entities can be added
 *     without touching the validator core.
 *   • Import batches are capped at 100 rows (Supabase recommended).
 *   • Rule: NEVER delete existing rows. Import only performs
 *     insert / upsert — never `delete`.
 */

'use strict';

// ═══════════════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════════════

const DEFAULT_BATCH_SIZE = 100;

const DELIMITERS = [',', ';', '\t', '|'];

// Windows-1255 → Unicode lookup for the 0x80–0xFF range.
// Index = byte - 0x80.  `null` = undefined in CP1255.
// Covers Hebrew letters (0xE0–0xFA), punctuation and Latin chars.
const WIN1255_TO_UNICODE = [
  0x20AC, null,   0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021,
  0x02C6, 0x2030, null,   0x2039, null,   null,   null,   null,
  null,   0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2013, 0x2014,
  0x02DC, 0x2122, null,   0x203A, null,   null,   null,   null,
  0x00A0, 0x00A1, 0x00A2, 0x00A3, 0x20AA, 0x00A5, 0x00A6, 0x00A7,
  0x00A8, 0x00A9, 0x00D7, 0x00AB, 0x00AC, 0x00AD, 0x00AE, 0x00AF,
  0x00B0, 0x00B1, 0x00B2, 0x00B3, 0x00B4, 0x00B5, 0x00B6, 0x00B7,
  0x00B8, 0x00B9, 0x00F7, 0x00BB, 0x00BC, 0x00BD, 0x00BE, 0x00BF,
  0x05B0, 0x05B1, 0x05B2, 0x05B3, 0x05B4, 0x05B5, 0x05B6, 0x05B7,
  0x05B8, 0x05B9, 0x05BA, 0x05BB, 0x05BC, 0x05BD, 0x05BE, 0x05BF,
  0x05C0, 0x05C1, 0x05C2, 0x05C3, 0x05F0, 0x05F1, 0x05F2, 0x05F3,
  0x05F4, null,   null,   null,   null,   null,   null,   null,
  0x05D0, 0x05D1, 0x05D2, 0x05D3, 0x05D4, 0x05D5, 0x05D6, 0x05D7,
  0x05D8, 0x05D9, 0x05DA, 0x05DB, 0x05DC, 0x05DD, 0x05DE, 0x05DF,
  0x05E0, 0x05E1, 0x05E2, 0x05E3, 0x05E4, 0x05E5, 0x05E6, 0x05E7,
  0x05E8, 0x05E9, 0x05EA, null,   null,   0x200E, 0x200F, null,
];

// ═══════════════════════════════════════════════════════════════
//  TARGET SCHEMAS (per-entity field dictionary)
// ═══════════════════════════════════════════════════════════════

const TARGET_SCHEMAS = {
  employees: {
    table: 'employees',
    fields: {
      employee_number:  { type: 'string',  required: true,  unique: true,
                          aliases: ['מספר עובד', 'מס עובד', 'ID עובד', 'employee id', 'emp no', 'emp_number'] },
      first_name:       { type: 'string',  required: true,
                          aliases: ['שם פרטי', 'first', 'first name', 'given name'] },
      last_name:        { type: 'string',  required: true,
                          aliases: ['שם משפחה', 'last', 'last name', 'family name', 'surname'] },
      national_id:      { type: 'string',  required: false, unique: true, checksum: 'israeli_id',
                          aliases: ['ת.ז', 'תז', 'תעודת זהות', 'teudat zehut', 'national id'] },
      email:            { type: 'email',   required: false, unique: true,
                          aliases: ['אימייל', 'מייל', 'דואר אלקטרוני', 'e-mail', 'mail'] },
      phone:            { type: 'phone',   required: false,
                          aliases: ['טלפון', 'נייד', 'סלולר', 'mobile', 'cell'] },
      hire_date:        { type: 'date',    required: false,
                          minDate: '1950-01-01', maxDate: '2099-12-31',
                          aliases: ['תאריך קליטה', 'תאריך תחילת עבודה', 'hire', 'start date', 'from'] },
      salary:           { type: 'number',  required: false, minValue: 0,
                          aliases: ['שכר', 'משכורת', 'salary', 'wage'] },
      department:       { type: 'string',  required: false,
                          aliases: ['מחלקה', 'מדור', 'department', 'dept'] },
      active:           { type: 'boolean', required: false, default: true,
                          aliases: ['פעיל', 'סטטוס', 'active', 'enabled'] },
    },
  },

  suppliers: {
    table: 'suppliers',
    fields: {
      name:             { type: 'string',  required: true,
                          aliases: ['שם ספק', 'שם', 'supplier', 'name', 'vendor'] },
      tax_id:           { type: 'string',  required: true, unique: true, checksum: 'israeli_id',
                          aliases: ['ח.פ', 'חפ', 'ע.מ', 'tax id', 'vat id', 'company number'] },
      email:            { type: 'email',   required: false,
                          aliases: ['אימייל', 'מייל', 'email'] },
      phone:            { type: 'phone',   required: false,
                          aliases: ['טלפון', 'נייד', 'phone'] },
      address:          { type: 'string',  required: false,
                          aliases: ['כתובת', 'address'] },
      city:             { type: 'string',  required: false,
                          aliases: ['עיר', 'city'] },
      payment_terms:    { type: 'number',  required: false, minValue: 0,
                          aliases: ['תנאי תשלום', 'ימי אשראי', 'payment terms', 'credit days'] },
      active:           { type: 'boolean', required: false, default: true,
                          aliases: ['פעיל', 'active'] },
    },
  },

  invoices: {
    table: 'invoices',
    fields: {
      invoice_number:   { type: 'string',  required: true, unique: true,
                          aliases: ['מספר חשבונית', 'חשבונית', 'invoice no', 'invoice number'] },
      supplier_tax_id:  { type: 'string',  required: true,
                          aliases: ['ח.פ ספק', 'ח.פ', 'supplier tax id', 'vendor tax'] },
      invoice_date:     { type: 'date',    required: true,
                          minDate: '2000-01-01', maxDate: '2099-12-31',
                          aliases: ['תאריך חשבונית', 'תאריך', 'invoice date', 'date'] },
      due_date:         { type: 'date',    required: false,
                          minDate: '2000-01-01', maxDate: '2099-12-31',
                          aliases: ['תאריך פרעון', 'due', 'due date'] },
      amount_net:       { type: 'number',  required: true, minValue: 0,
                          aliases: ['סכום ללא מעמ', 'נטו', 'net', 'amount net', 'subtotal'] },
      vat_amount:       { type: 'number',  required: false, minValue: 0,
                          aliases: ['מעמ', 'מע"מ', 'vat', 'vat amount'] },
      amount_total:     { type: 'number',  required: true, minValue: 0,
                          aliases: ['סכום כולל', 'סה"כ', 'total', 'amount total', 'gross'] },
      currency:         { type: 'string',  required: false, default: 'ILS',
                          aliases: ['מטבע', 'currency', 'ccy'] },
      status:           { type: 'string',  required: false, default: 'pending',
                          aliases: ['סטטוס', 'status'] },
    },
  },

  bank_transactions: {
    table: 'bank_transactions',
    fields: {
      transaction_date: { type: 'date',    required: true,
                          minDate: '2000-01-01', maxDate: '2099-12-31',
                          aliases: ['תאריך', 'תאריך תנועה', 'תאריך ערך', 'date', 'transaction date', 'value date'] },
      description:      { type: 'string',  required: true,
                          aliases: ['תיאור', 'פרטים', 'description', 'narrative'] },
      amount:           { type: 'number',  required: true,
                          aliases: ['סכום', 'amount'] },
      balance_after:    { type: 'number',  required: false,
                          aliases: ['יתרה', 'יתרה לאחר תנועה', 'balance', 'balance after'] },
      reference_number: { type: 'string',  required: false, unique: true,
                          aliases: ['אסמכתא', 'מס תנועה', 'reference', 'reference number'] },
      counterparty:     { type: 'string',  required: false,
                          aliases: ['צד שכנגד', 'שם המעביר', 'counterparty', 'payee'] },
    },
  },
};

// ═══════════════════════════════════════════════════════════════
//  1. parseCSV — hand-rolled RFC-4180 parser with escaped quotes
// ═══════════════════════════════════════════════════════════════

/**
 * Parse a CSV document.
 *
 * @param {string|Buffer} content
 * @param {object} [opts]
 * @param {string}  [opts.delimiter]   '", "; ", "\t" or "auto"
 * @param {boolean} [opts.hasHeaders]  default true
 * @param {string}  [opts.encoding]    'utf8' | 'windows-1255' | 'auto'
 * @returns {{headers: string[], rows: object[], meta: object}}
 */
function parseCSV(content, opts = {}) {
  const encoding = opts.encoding || 'auto';
  const hasHeaders = opts.hasHeaders !== false;

  // ── 1. decode bytes → string ──────────────────────────────
  let text;
  if (Buffer.isBuffer(content)) {
    const enc = encoding === 'auto' ? autoDetectEncoding(content) : encoding;
    text = decodeBuffer(content, enc);
  } else {
    text = String(content);
    // Strip UTF-8 BOM if present
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  }

  // ── 2. delimiter detection ────────────────────────────────
  const delimiter =
    (opts.delimiter && opts.delimiter !== 'auto')
      ? opts.delimiter
      : autoDetectDelimiter(text);

  // ── 3. tokenize ───────────────────────────────────────────
  const records = tokenize(text, delimiter);

  if (records.length === 0) {
    return { headers: [], rows: [], meta: { delimiter, encoding, rowCount: 0 } };
  }

  let headers;
  let dataStart;
  if (hasHeaders) {
    headers = records[0].map(h => String(h || '').trim());
    dataStart = 1;
  } else {
    headers = records[0].map((_, i) => `column_${i + 1}`);
    dataStart = 0;
  }

  const rows = [];
  for (let i = dataStart; i < records.length; i++) {
    const rec = records[i];
    // skip blank lines (rec is [""] for an empty line)
    if (rec.length === 1 && rec[0] === '') continue;
    const obj = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = (rec[c] !== undefined) ? rec[c] : '';
    }
    rows.push(obj);
  }

  return {
    headers,
    rows,
    meta: {
      delimiter,
      encoding,
      rowCount: rows.length,
      columnCount: headers.length,
    },
  };
}

/**
 * RFC-4180 state-machine tokenizer. Handles:
 *   • quoted fields ("…")       — only when `"` appears at the START of a field
 *   • escaped quotes ("")       — inside a quoted field
 *   • embedded newlines         — inside a quoted field
 *   • stray quotes in unquoted fields are treated as literal characters
 *     (common in real-world Hebrew data, e.g. `בע"מ`)
 *   • CRLF / LF / CR line endings
 */
function tokenize(text, delim) {
  const records = [];
  let cur = [];
  let field = '';
  let inQuotes = false;
  let fieldStart = true; // true while we haven't consumed any chars for the current field

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    // not in quotes
    if (ch === '"' && fieldStart) {
      inQuotes = true;
      fieldStart = false;
      continue;
    }
    if (ch === delim) {
      cur.push(field);
      field = '';
      fieldStart = true;
      continue;
    }
    if (ch === '\r' && next === '\n') {
      cur.push(field);
      records.push(cur);
      cur = [];
      field = '';
      fieldStart = true;
      i++;
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      cur.push(field);
      records.push(cur);
      cur = [];
      field = '';
      fieldStart = true;
      continue;
    }
    // ordinary character (including a `"` in the middle of a field)
    field += ch;
    fieldStart = false;
  }
  // Flush tail
  if (field.length > 0 || cur.length > 0) {
    cur.push(field);
    records.push(cur);
  }
  return records;
}

// ═══════════════════════════════════════════════════════════════
//  2. autoDetectDelimiter
// ═══════════════════════════════════════════════════════════════

/**
 * Pick the most likely delimiter by counting occurrences in the
 * first few lines and choosing whichever is most consistent.
 *
 * @param {string} sample  first chunk of CSV text
 * @returns {string}  ',', ';', '\t', or '|'
 */
function autoDetectDelimiter(sample) {
  if (!sample) return ',';
  const lines = sample.split(/\r?\n/).filter(l => l.length > 0).slice(0, 10);
  if (lines.length === 0) return ',';

  let best = ',';
  let bestScore = -1;

  for (const d of DELIMITERS) {
    const counts = lines.map(l => countOutsideQuotes(l, d));
    const total = counts.reduce((a, b) => a + b, 0);
    if (total === 0) continue;

    // Reward consistent counts across lines
    const first = counts[0];
    const consistent = counts.every(c => c === first);
    const score = total + (consistent ? total * 2 : 0);

    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

function countOutsideQuotes(line, delim) {
  let n = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { i++; continue; }
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && ch === delim) n++;
  }
  return n;
}

// ═══════════════════════════════════════════════════════════════
//  3. autoDetectEncoding
// ═══════════════════════════════════════════════════════════════

/**
 * Detect UTF-8 vs Windows-1255 by sniffing the first bytes.
 *
 * Rules (in order):
 *   1. UTF-8 BOM (EF BB BF)         → 'utf8'
 *   2. UTF-16 BOM (FF FE / FE FF)   → 'utf16'
 *   3. Valid UTF-8 byte sequence    → 'utf8'
 *   4. High bytes in Hebrew range of CP1255 → 'windows-1255'
 *   5. Fallback                     → 'utf8'
 *
 * @param {Buffer} buf
 * @returns {'utf8'|'windows-1255'|'utf16le'|'utf16be'}
 */
function autoDetectEncoding(buf) {
  if (!Buffer.isBuffer(buf) || buf.length === 0) return 'utf8';

  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    return 'utf8';
  }
  if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) return 'utf16le';
  if (buf.length >= 2 && buf[0] === 0xFE && buf[1] === 0xFF) return 'utf16be';

  // Sniff first ~4KB
  const sniff = buf.slice(0, Math.min(buf.length, 4096));
  if (isValidUTF8(sniff)) return 'utf8';

  // Count Hebrew-range bytes
  let hebrewCount = 0;
  for (let i = 0; i < sniff.length; i++) {
    if (sniff[i] >= 0xE0 && sniff[i] <= 0xFA) hebrewCount++;
  }
  if (hebrewCount > 2) return 'windows-1255';

  return 'utf8';
}

function isValidUTF8(buf) {
  let i = 0;
  while (i < buf.length) {
    const b = buf[i];
    if (b < 0x80) { i++; continue; }
    let extra;
    if ((b & 0xE0) === 0xC0) extra = 1;
    else if ((b & 0xF0) === 0xE0) extra = 2;
    else if ((b & 0xF8) === 0xF0) extra = 3;
    else return false;
    if (i + extra >= buf.length) return false;
    for (let j = 1; j <= extra; j++) {
      if ((buf[i + j] & 0xC0) !== 0x80) return false;
    }
    i += extra + 1;
  }
  return true;
}

/**
 * Decode a buffer given an encoding string.
 */
function decodeBuffer(buf, encoding) {
  const enc = String(encoding || '').toLowerCase().replace(/[-_]/g, '');
  if (enc === 'utf8' || enc === 'utf') {
    // strip BOM
    const start = (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) ? 3 : 0;
    return buf.slice(start).toString('utf8');
  }
  if (enc === 'utf16le') return buf.slice(2).toString('utf16le');
  if (enc === 'utf16be') {
    // Node has no utf16be decoder; swap bytes then decode as LE
    const swapped = Buffer.alloc(buf.length - 2);
    for (let i = 2; i + 1 < buf.length; i += 2) {
      swapped[i - 2] = buf[i + 1];
      swapped[i - 1] = buf[i];
    }
    return swapped.toString('utf16le');
  }
  if (enc === 'windows1255' || enc === 'cp1255' || enc === 'hebrew') {
    return decodeWin1255(buf);
  }
  // Fallback: treat as utf8
  return buf.toString('utf8');
}

function decodeWin1255(buf) {
  let out = '';
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    if (b < 0x80) {
      out += String.fromCharCode(b);
    } else {
      const cp = WIN1255_TO_UNICODE[b - 0x80];
      out += (cp !== null && cp !== undefined) ? String.fromCharCode(cp) : '?';
    }
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════
//  4. inferSchema — guess types from the data
// ═══════════════════════════════════════════════════════════════

/**
 * Infer a column → type map by sampling every value in every row.
 *
 * @param {object[]} rows
 * @returns {Record<string, 'number'|'date'|'boolean'|'string'>}
 */
function inferSchema(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return {};

  const headers = Object.keys(rows[0]);
  const schema = {};

  for (const h of headers) {
    const votes = { number: 0, date: 0, boolean: 0, string: 0, empty: 0 };
    for (const r of rows) {
      const v = r[h];
      if (v === null || v === undefined || String(v).trim() === '') {
        votes.empty++;
        continue;
      }
      const s = String(v).trim();
      if (isBooleanLike(s))      votes.boolean++;
      else if (isNumberLike(s))  votes.number++;
      else if (isDateLike(s))    votes.date++;
      else                       votes.string++;
    }
    // pick the most frequent non-empty type; fall back to string
    const nonEmpty = rows.length - votes.empty;
    if (nonEmpty === 0) { schema[h] = 'string'; continue; }

    const entries = Object.entries(votes).filter(([k]) => k !== 'empty');
    entries.sort((a, b) => b[1] - a[1]);
    schema[h] = entries[0][1] > 0 ? entries[0][0] : 'string';
  }
  return schema;
}

function isNumberLike(s) {
  // allow: 1,234.56 / 1234.56 / -12 / 12.5% / (leading + sign)
  const cleaned = s.replace(/,/g, '').replace(/[₪$€£]/g, '').replace(/%$/, '').trim();
  if (cleaned === '' || cleaned === '-' || cleaned === '+') return false;
  return /^[+-]?\d+(\.\d+)?$/.test(cleaned);
}

function isDateLike(s) {
  // dd/mm/yyyy, dd-mm-yyyy, yyyy-mm-dd, yyyy/mm/dd, dd.mm.yyyy
  return /^(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})(\s+\d{1,2}:\d{2}(:\d{2})?)?$/.test(s);
}

function isBooleanLike(s) {
  return /^(true|false|yes|no|y|n|1|0|כן|לא|פעיל|לא פעיל)$/i.test(s);
}

// ═══════════════════════════════════════════════════════════════
//  5. mapColumns — fuzzy match CSV headers to target schema
// ═══════════════════════════════════════════════════════════════

/**
 * Map raw CSV headers to fields of a target entity schema.
 *
 * @param {string[]} csvHeaders
 * @param {string|object} targetSchema  entity name or schema object
 * @returns {{mapping: Record<string,string>, unmapped: string[], missingRequired: string[], score: number}}
 */
function mapColumns(csvHeaders, targetSchema) {
  const schema = typeof targetSchema === 'string'
    ? TARGET_SCHEMAS[targetSchema]
    : targetSchema;
  if (!schema || !schema.fields) {
    return { mapping: {}, unmapped: [...csvHeaders], missingRequired: [], score: 0 };
  }

  const mapping = {};
  const usedFields = new Set();
  const unmapped = [];

  for (const header of csvHeaders) {
    const normHeader = normalizeHeader(header);
    if (!normHeader) { unmapped.push(header); continue; }

    let bestField = null;
    let bestScore = 0;

    for (const [fieldName, fieldDef] of Object.entries(schema.fields)) {
      if (usedFields.has(fieldName)) continue;
      const score = scoreFieldMatch(normHeader, fieldName, fieldDef);
      if (score > bestScore) { bestScore = score; bestField = fieldName; }
    }

    // Threshold tiers:
    //   exact / substring (scoreFieldMatch returns 0.85–1.0) → always accept
    //   otherwise require >= 0.82 to reject Jaro-Winkler false positives on
    //   unrelated short tokens (e.g. "some" shouldn't match "hire_date")
    if (bestField && bestScore >= 0.82) {
      mapping[header] = bestField;
      usedFields.add(bestField);
    } else {
      unmapped.push(header);
    }
  }

  // Which required fields are missing?
  const missingRequired = [];
  for (const [fieldName, fieldDef] of Object.entries(schema.fields)) {
    if (fieldDef.required && !usedFields.has(fieldName)) {
      missingRequired.push(fieldName);
    }
  }

  const score = csvHeaders.length
    ? Object.keys(mapping).length / csvHeaders.length
    : 0;

  return { mapping, unmapped, missingRequired, score };
}

function normalizeHeader(h) {
  return String(h || '')
    .toLowerCase()
    .replace(/[.,_\-()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreFieldMatch(normHeader, fieldName, fieldDef) {
  const candidates = [fieldName, fieldName.replace(/_/g, ' '), ...(fieldDef.aliases || [])]
    .map(normalizeHeader)
    .filter(Boolean);

  let best = 0;
  for (const cand of candidates) {
    if (cand === normHeader) return 1.0;
    if (normHeader.includes(cand) || cand.includes(normHeader)) best = Math.max(best, 0.85);
    const sim = jaroWinkler(normHeader, cand);
    if (sim > best) best = sim;
  }
  return best;
}

/**
 * Jaro-Winkler similarity (0..1). Used for fuzzy header matching.
 */
function jaroWinkler(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;

  const matchDistance = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aMatch = new Array(a.length).fill(false);
  const bMatch = new Array(b.length).fill(false);

  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, b.length);
    for (let j = start; j < end; j++) {
      if (bMatch[j]) continue;
      if (a[i] !== b[j]) continue;
      aMatch[i] = true;
      bMatch[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;

  let t = 0, k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatch[i]) continue;
    while (!bMatch[k]) k++;
    if (a[i] !== b[k]) t++;
    k++;
  }
  t = t / 2;

  const jaro = (matches / a.length + matches / b.length + (matches - t) / matches) / 3;

  // Winkler prefix bonus
  let prefix = 0;
  for (let i = 0; i < Math.min(4, a.length, b.length); i++) {
    if (a[i] === b[i]) prefix++;
    else break;
  }
  return jaro + prefix * 0.1 * (1 - jaro);
}

// ═══════════════════════════════════════════════════════════════
//  6. validateRows — required / typed / checksum / uniqueness
// ═══════════════════════════════════════════════════════════════

/**
 * Validate rows against a target schema.
 *
 * @param {object[]} rows           raw rows (headers as keys)
 * @param {string|object} target    entity name or schema
 * @param {object} [rules]
 *   mapping?:            Record<csvHeader, field>  (from mapColumns)
 *   extraUniqueChecks?:  string[]                  additional field names
 * @returns {{
 *   valid: object[],
 *   invalid: {row:number, errors:string[], original:object}[],
 *   summary: {total:number, valid:number, invalid:number, errorCount:number}
 * }}
 */
function validateRows(rows, target, rules = {}) {
  const schema = typeof target === 'string' ? TARGET_SCHEMAS[target] : target;
  if (!schema || !schema.fields) {
    throw new Error(`validateRows: unknown target schema`);
  }
  const mapping = rules.mapping || null;

  const valid = [];
  const invalid = [];
  const seenUnique = {}; // { fieldName: Set<value> }

  for (const [name, def] of Object.entries(schema.fields)) {
    if (def.unique) seenUnique[name] = new Set();
  }

  rows.forEach((raw, idx) => {
    const errors = [];
    const normalized = {};

    // Step 1 — project raw row → { field: rawValue } via mapping
    const projected = {};
    if (mapping) {
      for (const [header, field] of Object.entries(mapping)) {
        projected[field] = raw[header];
      }
    } else {
      // assume already keyed by field name
      Object.assign(projected, raw);
    }

    // Step 2 — per-field validation
    for (const [fieldName, def] of Object.entries(schema.fields)) {
      let val = projected[fieldName];
      if (val === undefined || val === null) val = '';
      val = typeof val === 'string' ? val.trim() : val;

      const isEmpty = (val === '' || val === null || val === undefined);

      if (def.required && isEmpty) {
        errors.push(`${fieldName}: required`);
        continue;
      }
      if (isEmpty) {
        if (def.default !== undefined) normalized[fieldName] = def.default;
        continue;
      }

      // Type coercion / validation
      const coerced = coerceValue(val, def, fieldName, errors);
      if (coerced === undefined) continue; // error already pushed
      normalized[fieldName] = coerced;

      // Uniqueness
      if (def.unique) {
        const key = String(coerced);
        if (seenUnique[fieldName].has(key)) {
          errors.push(`${fieldName}: duplicate value "${key}"`);
        } else {
          seenUnique[fieldName].add(key);
        }
      }
    }

    if (errors.length === 0) {
      valid.push(normalized);
    } else {
      invalid.push({ row: idx + 1, errors, original: raw });
    }
  });

  const errorCount = invalid.reduce((s, r) => s + r.errors.length, 0);
  return {
    valid,
    invalid,
    summary: {
      total: rows.length,
      valid: valid.length,
      invalid: invalid.length,
      errorCount,
    },
  };
}

function coerceValue(val, def, fieldName, errors) {
  switch (def.type) {
    case 'string': {
      const s = String(val);
      if (def.checksum === 'israeli_id') {
        if (!validateIsraeliId(s)) {
          errors.push(`${fieldName}: failed Israeli ID checksum ("${s}")`);
          return undefined;
        }
      }
      return s;
    }
    case 'number': {
      const cleaned = String(val).replace(/,/g, '').replace(/[₪$€£]/g, '').replace(/%$/, '').trim();
      const n = Number(cleaned);
      if (!Number.isFinite(n)) {
        errors.push(`${fieldName}: not a number ("${val}")`);
        return undefined;
      }
      if (def.minValue !== undefined && n < def.minValue) {
        errors.push(`${fieldName}: must be >= ${def.minValue}`);
        return undefined;
      }
      if (def.maxValue !== undefined && n > def.maxValue) {
        errors.push(`${fieldName}: must be <= ${def.maxValue}`);
        return undefined;
      }
      return n;
    }
    case 'date': {
      const iso = normalizeDate(val);
      if (!iso) {
        errors.push(`${fieldName}: invalid date ("${val}")`);
        return undefined;
      }
      if (def.minDate && iso < def.minDate) {
        errors.push(`${fieldName}: date before ${def.minDate}`);
        return undefined;
      }
      if (def.maxDate && iso > def.maxDate) {
        errors.push(`${fieldName}: date after ${def.maxDate}`);
        return undefined;
      }
      return iso;
    }
    case 'boolean': {
      const s = String(val).toLowerCase().trim();
      if (['true', 'yes', 'y', '1', 'כן', 'פעיל'].includes(s))  return true;
      if (['false', 'no', 'n', '0', 'לא', 'לא פעיל'].includes(s)) return false;
      errors.push(`${fieldName}: invalid boolean ("${val}")`);
      return undefined;
    }
    case 'email': {
      const s = String(val).trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) {
        errors.push(`${fieldName}: invalid email ("${s}")`);
        return undefined;
      }
      return s.toLowerCase();
    }
    case 'phone': {
      // Accept +972… or 0… with 9-10 digits
      const digits = String(val).replace(/[^\d+]/g, '');
      if (!/^(\+?\d{9,15})$/.test(digits)) {
        errors.push(`${fieldName}: invalid phone ("${val}")`);
        return undefined;
      }
      return digits;
    }
    default: {
      return String(val);
    }
  }

  // never reached
  // eslint-disable-next-line no-unreachable
  return undefined;
}

function normalizeDate(str) {
  if (str instanceof Date && !isNaN(str)) return str.toISOString().slice(0, 10);
  const s = String(str || '').trim();
  if (!s) return null;

  // ISO: yyyy-mm-dd or yyyy/mm/dd
  let m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (m) {
    const y = +m[1], mo = +m[2], d = +m[3];
    if (isValidCalDate(y, mo, d)) return `${y}-${p2(mo)}-${p2(d)}`;
    return null;
  }
  // Israeli: dd/mm/yyyy or dd-mm-yyyy or dd.mm.yyyy
  m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
  if (m) {
    let y = +m[3]; if (y < 100) y += 2000;
    const mo = +m[2], d = +m[1];
    if (isValidCalDate(y, mo, d)) return `${y}-${p2(mo)}-${p2(d)}`;
    return null;
  }
  return null;
}

function isValidCalDate(y, m, d) {
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function p2(n) { return String(n).padStart(2, '0'); }

/**
 * Israeli ID / Company number checksum (Luhn-like "תעודת זהות" algorithm).
 * Accepts up to 9 digits; pads with leading zeros.
 *
 * @param {string|number} id
 * @returns {boolean}
 */
function validateIsraeliId(id) {
  let s = String(id || '').replace(/\D/g, '');
  if (s.length === 0 || s.length > 9) return false;
  s = s.padStart(9, '0');
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let d = Number(s[i]) * ((i % 2) + 1);
    if (d > 9) d -= 9;
    sum += d;
  }
  return sum % 10 === 0;
}

// ═══════════════════════════════════════════════════════════════
//  7. importRows — batched insert / upsert via Supabase
// ═══════════════════════════════════════════════════════════════

/**
 * Import validated rows to Supabase in batches of 100.
 * Strictly insert / upsert — NEVER delete.
 *
 * @param {object[]} validated  rows ready to insert
 * @param {object} opts
 *   tableName:   required
 *   supabase:    supabase client (required; a mock is acceptable)
 *   upsert:      boolean (default false)
 *   onConflict:  conflict target for upsert (e.g. 'tax_id')
 *   batchSize:   default 100
 * @returns {Promise<{
 *   inserted:number,
 *   failed:number,
 *   batches:{index:number,size:number,ok:boolean,error?:string}[],
 *   errors:string[],
 *   startedAt:string,
 *   finishedAt:string
 * }>}
 */
async function importRows(validated, opts) {
  const {
    tableName,
    supabase,
    upsert = false,
    onConflict = null,
    batchSize = DEFAULT_BATCH_SIZE,
  } = opts || {};

  if (!tableName) throw new Error('importRows: tableName required');
  if (!supabase)  throw new Error('importRows: supabase client required');
  if (!Array.isArray(validated)) throw new Error('importRows: validated must be an array');

  const result = {
    inserted: 0,
    failed: 0,
    batches: [],
    errors: [],
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };

  if (validated.length === 0) {
    result.finishedAt = new Date().toISOString();
    return result;
  }

  const batches = chunk(validated, batchSize);
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    try {
      const query = supabase.from(tableName);
      let call;
      if (upsert) {
        call = query.upsert(batch, onConflict ? { onConflict } : undefined);
      } else {
        call = query.insert(batch);
      }
      // .select() so we can count returned rows
      const { data, error } = await (call.select ? call.select() : call);

      if (error) {
        result.failed += batch.length;
        result.batches.push({ index: i, size: batch.length, ok: false, error: error.message });
        result.errors.push(`batch ${i}: ${error.message}`);
      } else {
        const inserted = Array.isArray(data) ? data.length : batch.length;
        result.inserted += inserted;
        result.batches.push({ index: i, size: batch.length, ok: true });
      }
    } catch (err) {
      result.failed += batch.length;
      result.batches.push({ index: i, size: batch.length, ok: false, error: err.message });
      result.errors.push(`batch ${i}: ${err.message}`);
    }
  }

  result.finishedAt = new Date().toISOString();
  return result;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ═══════════════════════════════════════════════════════════════
//  8. importReport — summarize a run for humans
// ═══════════════════════════════════════════════════════════════

/**
 * Merge a validation result + import result into a final report.
 *
 * @param {object} result
 *   validation?: output of validateRows
 *   imported?:   output of importRows
 *   entity?:     'employees' | 'suppliers' | ...
 * @returns {object}
 */
function importReport(result) {
  const v = result.validation || { valid: [], invalid: [], summary: {} };
  const imp = result.imported || null;
  const entity = result.entity || 'unknown';

  const perRowErrors = (v.invalid || []).map(r => ({
    row: r.row,
    errors: r.errors,
    original: r.original,
  }));

  return {
    entity,
    generatedAt: new Date().toISOString(),
    validation: {
      total:   v.summary?.total   || 0,
      passed:  v.summary?.valid   || (v.valid ? v.valid.length : 0),
      failed:  v.summary?.invalid || perRowErrors.length,
      errors:  perRowErrors,
    },
    importing: imp ? {
      inserted: imp.inserted || 0,
      failed:   imp.failed || 0,
      batches:  imp.batches || [],
      errors:   imp.errors || [],
      startedAt: imp.startedAt,
      finishedAt: imp.finishedAt,
    } : null,
    summary: summarize(v, imp),
  };
}

function summarize(v, imp) {
  const total = v.summary?.total || 0;
  const passedValidation = v.summary?.valid || 0;
  const failedValidation = v.summary?.invalid || 0;
  const inserted = imp?.inserted || 0;
  const rejected = failedValidation + (imp?.failed || 0);

  return {
    message:
      `Processed ${total} rows → ${passedValidation} passed validation, ` +
      `${failedValidation} rejected. ${imp ? `Inserted ${inserted}, ${imp.failed} failed at DB layer.` : ''}`.trim(),
    totalRows: total,
    accepted: inserted,
    rejected,
  };
}

// ═══════════════════════════════════════════════════════════════
//  EXPORTS
// ═══════════════════════════════════════════════════════════════

module.exports = {
  // Core pipeline
  parseCSV,
  autoDetectDelimiter,
  autoDetectEncoding,
  decodeBuffer,
  inferSchema,
  mapColumns,
  validateRows,
  importRows,
  importReport,
  // Utilities (exported for tests & reuse)
  validateIsraeliId,
  normalizeDate,
  jaroWinkler,
  TARGET_SCHEMAS,
  DEFAULT_BATCH_SIZE,
};
