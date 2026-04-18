/**
 * legacy-migration.js — Legacy Data Migration Utilities
 * Agent-68 — ONYX Procurement, Techno-Kol Uzi El
 *
 * Purpose
 * ───────
 * Import historical business data from legacy systems that Techno-Kol Uzi
 * likely used before migrating to ONYX:
 *
 *   1. Excel (XLS/XLSX)       — unstructured sheets, Hebrew headers, merged cells
 *   2. Hashavshevet (חשבשבת)  — Windows and ERP CSV exports
 *   3. Priority ERP           — XML and CSV exports
 *   4. Generic CSV            — fallback for any other system
 *
 * Design Principles
 * ─────────────────
 *   - NO DELETES. Ever. Audit-log everything. Rollback on failure.
 *   - Pure functions where possible; side-effects isolated to commit phase.
 *   - Deterministic transforms: the same input file → the same output rows.
 *   - Hermetic testing: all detection, parsing, mapping, transform, and
 *     validation steps run WITHOUT requiring a live Supabase client.
 *   - Hebrew-first: Hebrew column headers, Hebrew encodings (CP1255 / UTF-8),
 *     Hebrew date strings, and Gregorian ↔ Hebrew date safeguards.
 *
 * Import Pipeline (7-stage)
 * ─────────────────────────
 *   [1] Parse       — file → raw rows (sheet-aware, sheet-wide)
 *   [2] Map         — raw rows → canonical schema (per entity type)
 *   [3] Transform   — dates, currency, encoding, numeric normalization
 *   [4] Validate    — Israeli ID / HP / VAT / checksums / invoice integrity
 *   [5] Dry-run     — preview result, no writes
 *   [6] Commit      — transactional insert via Supabase
 *   [7] Audit+Roll  — write audit rows; rollback on any commit error
 *
 * Public API
 * ──────────
 *   detectLegacySystem(file)
 *   migrateLegacyData(file, system, { supabase, dryRun })
 *   generateMigrationReport(result)
 *
 * And granular helpers for each stage (exported for tests):
 *   parseExcelLegacy, parseHashavshevet, parsePriority, parseGenericCsv
 *   mapSchema, transformRow, validateRow
 *   validateIsraeliId, validateIsraeliCompanyId, validateInvoiceTotals
 *   normalizeDateGregorian, normalizeAmount
 *
 * This module is deliberately self-contained. It does NOT rely on optional
 * third-party libraries (xlsx, fast-xml-parser, iconv-lite) at runtime —
 * instead it defers to provided stub parsers and can run in "raw-string"
 * mode for tests. In production an adapter may be injected via options.
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════
// Constants — supported legacy systems + canonical entity types
// ═══════════════════════════════════════════════════════════════════════

const LEGACY_SYSTEMS = Object.freeze({
  EXCEL: 'excel',
  HASHAVSHEVET_WIN: 'hashavshevet_win',
  HASHAVSHEVET_ERP: 'hashavshevet_erp',
  PRIORITY: 'priority',
  GENERIC_CSV: 'generic_csv',
  UNKNOWN: 'unknown',
});

const ENTITY_TYPES = Object.freeze({
  INVOICE: 'invoice',
  CREDIT_NOTE: 'credit_note',
  RECEIPT: 'receipt',
  LEDGER_CARD: 'ledger_card',
  INVENTORY_ITEM: 'inventory_item',
  PURCHASE_ORDER: 'purchase_order',
  SUPPLIER: 'supplier',
  CUSTOMER: 'customer',
  UNKNOWN: 'unknown',
});

const STAGES = Object.freeze([
  'parse',
  'map',
  'transform',
  'validate',
  'dry_run',
  'commit',
  'audit_log',
  'rollback',
]);

// VAT rate on the date of migration build (2026). Can be overridden per row.
const DEFAULT_VAT_RATE = 0.18;

// ═══════════════════════════════════════════════════════════════════════
// Hebrew header dictionary — maps legacy Hebrew / English column names
// to canonical ONYX field names. Kept extensible per system.
// ═══════════════════════════════════════════════════════════════════════

const HEADER_ALIAS = Object.freeze({
  // ─── Identifiers ───
  'מספר חשבונית': 'invoice_number',
  'מס חשבונית': 'invoice_number',
  "מס' חשבונית": 'invoice_number',
  'חשבונית': 'invoice_number',
  'invoice no': 'invoice_number',
  'invoice_no': 'invoice_number',
  'invoice number': 'invoice_number',
  'doc number': 'invoice_number',
  'document': 'invoice_number',
  'מסמך': 'invoice_number',

  // ─── Parties ───
  'שם לקוח': 'customer_name',
  'שם הלקוח': 'customer_name',
  'לקוח': 'customer_name',
  'customer': 'customer_name',
  'customer name': 'customer_name',

  'שם ספק': 'supplier_name',
  'שם הספק': 'supplier_name',
  'ספק': 'supplier_name',
  'supplier': 'supplier_name',
  'supplier name': 'supplier_name',
  'vendor': 'supplier_name',

  // ─── Israeli IDs ───
  'ת.ז.': 'tax_id',
  'ת"ז': 'tax_id',
  'תעודת זהות': 'tax_id',
  'ת.ז': 'tax_id',
  'tz': 'tax_id',

  'ח.פ.': 'company_id',
  'ח"פ': 'company_id',
  'חפ': 'company_id',
  'עוסק מורשה': 'company_id',
  'מספר עוסק': 'company_id',
  'company id': 'company_id',
  'vat id': 'company_id',

  // ─── Amounts ───
  'סכום': 'amount_gross',
  'סכום כולל': 'amount_gross',
  'סכום לתשלום': 'amount_gross',
  'total': 'amount_gross',
  'סכום לפני מעמ': 'amount_net',
  'סכום לפני מע"מ': 'amount_net',
  'לפני מעמ': 'amount_net',
  'לפני מע"מ': 'amount_net',
  'subtotal': 'amount_net',
  'net': 'amount_net',
  'מע"מ': 'amount_vat',
  'מעמ': 'amount_vat',
  'vat': 'amount_vat',
  'tax': 'amount_vat',

  // ─── Dates ───
  'תאריך': 'document_date',
  'תאריך חשבונית': 'document_date',
  'תאריך מסמך': 'document_date',
  'date': 'document_date',
  'doc date': 'document_date',

  // ─── Descriptions / meta ───
  'תיאור': 'description',
  'הערות': 'description',
  'description': 'description',
  'notes': 'description',

  // ─── Inventory specifics ───
  'מק"ט': 'sku',
  'מקט': 'sku',
  'קוד פריט': 'sku',
  'sku': 'sku',
  'item code': 'sku',
  'שם פריט': 'item_name',
  'name': 'item_name',
  'item name': 'item_name',
  'כמות': 'quantity',
  'qty': 'quantity',
  'quantity': 'quantity',
  'מחיר': 'unit_price',
  'מחיר יחידה': 'unit_price',
  'price': 'unit_price',
  'unit price': 'unit_price',

  // ─── Receipts / ledger ───
  'סוג תשלום': 'payment_method',
  'אמצעי תשלום': 'payment_method',
  'payment method': 'payment_method',
  'חשבון': 'account',
  'כרטיס': 'account',
  'account': 'account',
  'חובה': 'debit',
  'זכות': 'credit',
  'debit': 'debit',
  'credit': 'credit',
});

// ═══════════════════════════════════════════════════════════════════════
// Utility — normalize header cell for lookup
// ═══════════════════════════════════════════════════════════════════════

function normalizeHeader(raw) {
  if (raw === null || raw === undefined) return '';
  return String(raw)
    .trim()
    .toLowerCase()
    .replace(/[\u200f\u200e]/g, '') // strip LTR/RTL marks
    .replace(/\s+/g, ' ');
}

// Canonical field names — headers that already match one of these pass
// through unchanged. Keeps generic CSV with canonical headers working.
const CANONICAL_FIELDS = new Set([
  'invoice_number',
  'customer_name',
  'supplier_name',
  'tax_id',
  'company_id',
  'amount_gross',
  'amount_net',
  'amount_vat',
  'document_date',
  'description',
  'sku',
  'item_name',
  'quantity',
  'unit_price',
  'payment_method',
  'account',
  'debit',
  'credit',
]);

function resolveHeader(raw) {
  const key = normalizeHeader(raw);
  if (!key) return null;
  // Identity pass-through for canonical snake_case headers
  const snake = key.replace(/\s+/g, '_');
  if (CANONICAL_FIELDS.has(snake)) return snake;
  if (HEADER_ALIAS[key]) return HEADER_ALIAS[key];
  // exact-match on original (preserves Hebrew diacritics)
  const original = String(raw).trim();
  if (HEADER_ALIAS[original]) return HEADER_ALIAS[original];
  // try partial match
  for (const alias of Object.keys(HEADER_ALIAS)) {
    if (key === alias.toLowerCase()) return HEADER_ALIAS[alias];
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════
// detectLegacySystem(file)
// ───────────────────────────────────────────────────────────────────────
// Accepts a "file-like" object: { name, content, mimeType? }.
// `content` may be a Buffer, string, or Uint8Array.
// ═══════════════════════════════════════════════════════════════════════

function detectLegacySystem(file) {
  if (!file || typeof file !== 'object') {
    return LEGACY_SYSTEMS.UNKNOWN;
  }

  const name = String(file.name || '').toLowerCase();
  const content = toText(file.content);
  const head = content.slice(0, 4096);
  const firstLine = (head.split('\n')[0] || '').trim();

  // Priority ERP XML signature — must have actual XML open tag
  if (name.endsWith('.xml') || /^\s*<\?xml/i.test(head) || /<Priority\b/i.test(head)) {
    if (/<(INVOICE|PART|ORDER|CUSTNAME|SUPPLIER|PARTNAME|LOGPART)\b/i.test(head)) {
      return LEGACY_SYSTEMS.PRIORITY;
    }
    if (/^\s*<\?xml/i.test(head)) return LEGACY_SYSTEMS.PRIORITY;
  }

  // Excel — binary signatures or extension
  if (
    name.endsWith('.xls') ||
    name.endsWith('.xlsx') ||
    head.startsWith('PK\u0003\u0004') ||
    head.startsWith('\u00D0\u00CF')
  ) {
    return LEGACY_SYSTEMS.EXCEL;
  }

  // Hashavshevet — content markers OR filename hint
  const hsbMarker =
    /חשבשבת|hashavshevet|HSB|מס' חשב/i.test(head) || /hashavshevet|חשבשבת|hsb/i.test(name);
  if (hsbMarker) {
    if (/erp|ERP|SQL/i.test(head) || /erp/i.test(name)) return LEGACY_SYSTEMS.HASHAVSHEVET_ERP;
    return LEGACY_SYSTEMS.HASHAVSHEVET_WIN;
  }

  // Priority CSV fallback — require UPPERCASE Priority token header (e.g. PARTNAME,
  // ORDNAME, IVNUM) not generic English business words like "invoice_number"
  if (
    name.endsWith('.csv') &&
    /\b(PARTNAME|ORDNAME|IVNUM|CUSTNAME|PARTDES|LOGPART)\b/.test(firstLine)
  ) {
    return LEGACY_SYSTEMS.PRIORITY;
  }

  // Generic CSV
  if (name.endsWith('.csv') || /,/.test(firstLine)) {
    return LEGACY_SYSTEMS.GENERIC_CSV;
  }

  return LEGACY_SYSTEMS.UNKNOWN;
}

function toText(content) {
  if (content === null || content === undefined) return '';
  if (typeof content === 'string') return content;
  if (Buffer && Buffer.isBuffer && Buffer.isBuffer(content)) {
    return content.toString('utf8');
  }
  if (content instanceof Uint8Array) {
    return Buffer.from(content).toString('utf8');
  }
  return String(content);
}

// ═══════════════════════════════════════════════════════════════════════
// Stage 1 — Parsers (one per legacy system)
// Each parser returns: { rows: Array<Record>, meta: {...}, warnings: [] }
// ═══════════════════════════════════════════════════════════════════════

/**
 * parseExcelLegacy — parses a simplified Excel-like text representation.
 *
 * NOTE: We do not bundle xlsx here. Instead, this module accepts Excel
 * content in a normalized text form:
 *
 *     Sheet: <name>
 *     header1\theader2\theader3
 *     r1c1\tr1c2\tr1c3
 *     ...
 *
 * Production callers should pre-convert .xlsx to this form using a
 * pluggable `file.rawSheets` array, each item: { name, rows: [[...]] }.
 * If `file.rawSheets` is present, it's used directly (merged cells resolved).
 */
function parseExcelLegacy(file) {
  const warnings = [];
  const meta = { sheets: [], mergedCells: 0, formulasResolved: 0 };
  const rows = [];

  const sheets = Array.isArray(file.rawSheets) ? file.rawSheets : sheetsFromText(toText(file.content));
  for (const sheet of sheets) {
    meta.sheets.push(sheet.name || 'Sheet');
    const grid = resolveMergedCells(sheet.rows || [], meta);
    const withFormulas = resolveFormulas(grid, meta);
    const structure = autoDetectSheetStructure(withFormulas);
    if (!structure) {
      warnings.push(`Sheet "${sheet.name}" — could not auto-detect header row`);
      continue;
    }
    const { headerRow, dataStart } = structure;
    const headers = withFormulas[headerRow].map((c) => String(c ?? '').trim());
    for (let r = dataStart; r < withFormulas.length; r++) {
      const record = {};
      let hasValue = false;
      for (let c = 0; c < headers.length; c++) {
        const key = headers[c];
        if (!key) continue;
        const val = withFormulas[r][c];
        if (val !== undefined && val !== null && val !== '') hasValue = true;
        record[key] = val;
      }
      if (hasValue) {
        record.__sheet = sheet.name;
        record.__row = r + 1;
        rows.push(record);
      }
    }
  }

  return { rows, meta, warnings };
}

function sheetsFromText(text) {
  if (!text) return [];
  const sheets = [];
  const blocks = text.split(/\nSheet:\s*/).filter(Boolean);
  if (blocks.length === 1 && !/^Sheet:/i.test(text)) {
    // no sheet markers — treat whole text as single sheet
    const grid = text
      .split(/\r?\n/)
      .filter((l) => l.length > 0)
      .map((line) => line.split(/\t|,/));
    sheets.push({ name: 'Sheet1', rows: grid });
    return sheets;
  }
  for (const block of blocks) {
    const [first, ...rest] = block.split(/\r?\n/);
    const name = first.trim() || 'Sheet';
    const grid = rest.filter((l) => l.length > 0).map((line) => line.split(/\t|,/));
    sheets.push({ name, rows: grid });
  }
  return sheets;
}

function resolveMergedCells(grid, meta) {
  // Simple rule: if a cell is blank and the cell immediately above (same
  // column) has a value AND the current row has other values, inherit it.
  // Tracks merged-cell resolutions in meta.mergedCells.
  const out = grid.map((row) => row.slice());
  for (let r = 1; r < out.length; r++) {
    const row = out[r];
    const hasAnyValue = row.some((c) => c !== '' && c !== null && c !== undefined);
    if (!hasAnyValue) continue;
    for (let c = 0; c < row.length; c++) {
      if ((row[c] === '' || row[c] === null || row[c] === undefined) && out[r - 1][c]) {
        row[c] = out[r - 1][c];
        meta.mergedCells += 1;
      }
    }
  }
  return out;
}

function resolveFormulas(grid, meta) {
  const out = grid.map((row) =>
    row.map((cell) => {
      if (typeof cell !== 'string') return cell;
      const t = cell.trim();
      if (!t.startsWith('=')) return cell;
      // Resolve simple =A+B arithmetic on literal numbers
      const expr = t.slice(1).replace(/\s+/g, '');
      if (/^[0-9+\-*/().]+$/.test(expr)) {
        try {
          // eslint-disable-next-line no-new-func
          const val = Function(`"use strict"; return (${expr});`)();
          meta.formulasResolved += 1;
          return val;
        } catch {
          return cell;
        }
      }
      return cell;
    }),
  );
  return out;
}

function autoDetectSheetStructure(grid) {
  // Header row = first row with ≥2 recognisable header tokens AND ≥1
  // non-empty data row beneath it.
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r];
    if (!row || row.length === 0) continue;
    let matched = 0;
    for (const cell of row) {
      if (resolveHeader(cell)) matched += 1;
    }
    if (matched >= 2 && grid[r + 1]) {
      return { headerRow: r, dataStart: r + 1 };
    }
  }
  // Fallback — treat first non-empty row as header
  for (let r = 0; r < grid.length; r++) {
    if (grid[r] && grid[r].some((c) => String(c || '').trim() !== '')) {
      return { headerRow: r, dataStart: r + 1 };
    }
  }
  return null;
}

/**
 * parseHashavshevet — handles both Windows and ERP CSV dialects.
 *
 * Windows flavour: semicolon-delimited, cp1255-encoded, headers in Hebrew,
 * decimal point is ".", date format DD/MM/YYYY.
 *
 * ERP flavour: comma-delimited, utf-8, English-or-Hebrew mixed headers,
 * date format YYYY-MM-DD.
 *
 * We detect the dialect by delimiter + first-line content.
 */
function parseHashavshevet(file) {
  const text = toText(file.content);
  const warnings = [];
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return { rows: [], meta: { dialect: null }, warnings };

  const firstLine = lines[0];
  const delimiter = firstLine.includes(';') && !firstLine.includes('\t') ? ';' : ',';
  const dialect = /erp|ERP|SQL|utf-?8/i.test(firstLine) ? 'erp' : 'win';

  const headerCells = splitCsvLine(firstLine, delimiter);
  const headers = headerCells.map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i], delimiter);
    if (cells.every((c) => c.trim() === '')) continue;
    const record = { __row: i + 1, __source_dialect: `hsb_${dialect}` };
    for (let j = 0; j < headers.length; j++) {
      record[headers[j]] = cells[j] !== undefined ? cells[j].trim() : '';
    }
    rows.push(record);
  }

  return {
    rows,
    meta: { dialect, delimiter, headers },
    warnings,
  };
}

function splitCsvLine(line, delimiter) {
  // CSV-aware split that respects double-quoted fields.
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQ = !inQ;
      }
      continue;
    }
    if (!inQ && ch === delimiter) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * parsePriority — supports either XML or CSV Priority exports.
 */
function parsePriority(file) {
  const text = toText(file.content);
  const warnings = [];
  if (/^\s*</.test(text) || /\.xml$/i.test(String(file.name || ''))) {
    return parsePriorityXml(text, warnings);
  }
  // CSV fallback
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return { rows: [], meta: { format: 'csv' }, warnings };
  const headers = splitCsvLine(lines[0], ',').map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i], ',');
    const record = { __row: i + 1, __source: 'priority_csv' };
    for (let j = 0; j < headers.length; j++) {
      record[headers[j]] = cells[j] !== undefined ? cells[j].trim() : '';
    }
    rows.push(record);
  }
  return { rows, meta: { format: 'csv', headers }, warnings };
}

function parsePriorityXml(text, warnings) {
  // Minimal dependency-free XML walker — extracts top-level record elements
  // such as <INVOICE>, <PART>, <ORDER>, <PARTNAME>, etc.
  const rows = [];
  const recordRegex = /<(INVOICE|PART|ORDER|PARTNAME|CUSTNAME|SUPPLIER|LOGPART)[\s>][\s\S]*?<\/\1>/g;
  let match;
  let idx = 0;
  while ((match = recordRegex.exec(text))) {
    idx += 1;
    const tag = match[1];
    const inner = match[0].slice(match[0].indexOf('>') + 1, -(tag.length + 3));
    const record = { __row: idx, __source: 'priority_xml', __entity: tag };
    const fieldRegex = /<([A-Za-z0-9_]+)>([\s\S]*?)<\/\1>/g;
    let f;
    while ((f = fieldRegex.exec(inner))) {
      record[f[1]] = decodeXmlEntities(f[2].trim());
    }
    rows.push(record);
  }
  if (rows.length === 0) warnings.push('Priority XML — no recognisable records');
  return { rows, meta: { format: 'xml' }, warnings };
}

function decodeXmlEntities(str) {
  return String(str)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * parseGenericCsv — permissive CSV parser with auto-delimiter detection.
 */
function parseGenericCsv(file) {
  const text = toText(file.content);
  const warnings = [];
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return { rows: [], meta: {}, warnings };

  const first = lines[0];
  const candidates = [',', ';', '\t', '|'];
  let bestDelim = ',';
  let bestCount = -1;
  for (const d of candidates) {
    const n = splitCsvLine(first, d).length;
    if (n > bestCount) {
      bestCount = n;
      bestDelim = d;
    }
  }
  const headers = splitCsvLine(first, bestDelim).map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i], bestDelim);
    const record = { __row: i + 1, __source: 'generic_csv' };
    for (let j = 0; j < headers.length; j++) {
      record[headers[j]] = cells[j] !== undefined ? cells[j].trim() : '';
    }
    rows.push(record);
  }
  return { rows, meta: { delimiter: bestDelim, headers }, warnings };
}

// ═══════════════════════════════════════════════════════════════════════
// Stage 2 — Map raw → canonical schema
// ═══════════════════════════════════════════════════════════════════════

function mapSchema(rawRows, { entityHint = null } = {}) {
  const mapped = [];
  const unmapped = new Set();
  for (const raw of rawRows) {
    const out = {
      __source_row: raw.__row || null,
      __source_sheet: raw.__sheet || null,
      __entity: entityHint || raw.__entity || null,
    };
    for (const [k, v] of Object.entries(raw)) {
      if (k.startsWith('__')) continue;
      const canonical = resolveHeader(k);
      if (canonical) {
        out[canonical] = v;
      } else {
        unmapped.add(k);
        out[`extra_${normalizeExtraKey(k)}`] = v;
      }
    }
    if (!out.__entity) out.__entity = inferEntity(out);
    mapped.push(out);
  }
  return { mapped, unmappedHeaders: Array.from(unmapped) };
}

function normalizeExtraKey(key) {
  return String(key)
    .replace(/[^a-zA-Z0-9\u0590-\u05ff]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function inferEntity(row) {
  if (row.sku || row.item_name) return ENTITY_TYPES.INVENTORY_ITEM;
  if (row.debit !== undefined || row.credit !== undefined) return ENTITY_TYPES.LEDGER_CARD;
  if (row.payment_method && row.amount_gross) return ENTITY_TYPES.RECEIPT;
  if (row.invoice_number && row.amount_gross) return ENTITY_TYPES.INVOICE;
  return ENTITY_TYPES.UNKNOWN;
}

// ═══════════════════════════════════════════════════════════════════════
// Stage 3 — Transform: dates, currency, encoding normalization
// ═══════════════════════════════════════════════════════════════════════

function transformRow(row) {
  const out = { ...row };
  if (out.document_date !== undefined) {
    out.document_date = normalizeDateGregorian(out.document_date);
  }
  for (const key of ['amount_gross', 'amount_net', 'amount_vat', 'unit_price', 'quantity', 'debit', 'credit']) {
    if (out[key] !== undefined && out[key] !== null && out[key] !== '') {
      out[key] = normalizeAmount(out[key]);
    }
  }
  for (const key of ['customer_name', 'supplier_name', 'description', 'item_name']) {
    if (typeof out[key] === 'string') out[key] = normalizeHebrewText(out[key]);
  }
  if (out.tax_id !== undefined && out.tax_id !== null) {
    out.tax_id = String(out.tax_id).trim().padStart(9, '0');
  }
  if (out.company_id !== undefined && out.company_id !== null) {
    out.company_id = String(out.company_id).trim().padStart(9, '0');
  }
  return out;
}

function normalizeDateGregorian(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);

  const s = String(raw).trim();

  // Reject Hebrew-date markers unless caller explicitly opts in.
  // Hebrew month names are detected; we refuse rather than mis-convert.
  const hebrewMonths = /(תשרי|חשון|כסלו|טבת|שבט|אדר|ניסן|אייר|סיון|תמוז|אב|אלול)/;
  if (hebrewMonths.test(s)) {
    // Return raw with a sentinel — validator will flag it.
    return { __unsupported_hebrew_date: s };
  }

  // DD/MM/YYYY or DD-MM-YYYY
  let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = Number(y) > 50 ? `19${y}` : `20${y}`;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // YYYY-MM-DD or YYYY/MM/DD
  m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // Excel serial date (days since 1899-12-30)
  if (/^\d+(\.\d+)?$/.test(s) && Number(s) > 30000 && Number(s) < 80000) {
    const serial = Number(s);
    const epoch = Date.UTC(1899, 11, 30);
    const ms = epoch + serial * 86400000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

function normalizeAmount(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') return raw;
  let s = String(raw).trim();
  // strip currency symbols, Hebrew shekel, spaces
  s = s.replace(/[₪$€£]/g, '').replace(/ש"ח|שח/g, '').replace(/[,\s]/g, '');
  // handle parentheses as negative
  if (/^\(.+\)$/.test(s)) {
    s = '-' + s.slice(1, -1);
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function normalizeHebrewText(raw) {
  return String(raw).replace(/[\u200f\u200e\u202a-\u202e]/g, '').trim();
}

// ═══════════════════════════════════════════════════════════════════════
// Stage 4 — Validation (Israel-specific)
// ═══════════════════════════════════════════════════════════════════════

function validateIsraeliId(id) {
  if (id === null || id === undefined) return false;
  const str = String(id).replace(/\D/g, '').padStart(9, '0');
  if (str.length !== 9) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let digit = Number(str[i]) * ((i % 2) + 1);
    if (digit > 9) digit -= 9;
    sum += digit;
  }
  return sum % 10 === 0;
}

function validateIsraeliCompanyId(id) {
  if (id === null || id === undefined) return false;
  const str = String(id).replace(/\D/g, '').padStart(9, '0');
  // ח"פ / ע"מ are 9 digits. We accept the same Luhn-like checksum used for ת.ז
  // because the ITA enforces the same algorithm on corporate tax numbers.
  return str.length === 9 && validateIsraeliId(str);
}

function validateInvoiceTotals(row, { vatRate = DEFAULT_VAT_RATE, tolerance = 0.02 } = {}) {
  const net = Number(row.amount_net);
  const vat = Number(row.amount_vat);
  const gross = Number(row.amount_gross);
  const hasNet = Number.isFinite(net);
  const hasVat = Number.isFinite(vat);
  const hasGross = Number.isFinite(gross);

  if (!hasGross && !hasNet) return { ok: false, reason: 'missing_amount' };

  // If gross only, derive net/vat
  if (hasGross && !hasNet && !hasVat) {
    const expectedNet = gross / (1 + vatRate);
    return { ok: true, derived: { amount_net: round2(expectedNet), amount_vat: round2(gross - expectedNet) } };
  }
  // If net only, derive vat/gross
  if (hasNet && !hasGross && !hasVat) {
    const expectedVat = net * vatRate;
    return { ok: true, derived: { amount_vat: round2(expectedVat), amount_gross: round2(net + expectedVat) } };
  }
  // If all three present, check consistency
  if (hasNet && hasVat && hasGross) {
    const diff = Math.abs(net + vat - gross);
    if (diff > tolerance) {
      return { ok: false, reason: 'total_mismatch', diff: round2(diff) };
    }
    return { ok: true };
  }
  // If net + gross but no vat, derive vat
  if (hasNet && hasGross && !hasVat) {
    return { ok: true, derived: { amount_vat: round2(gross - net) } };
  }
  // If vat + gross but no net, derive net
  if (hasVat && hasGross && !hasNet) {
    return { ok: true, derived: { amount_net: round2(gross - vat) } };
  }
  return { ok: true };
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function validateRow(row, { vatRate = DEFAULT_VAT_RATE } = {}) {
  const errors = [];
  const warnings = [];

  if (row.tax_id && !validateIsraeliId(row.tax_id)) {
    errors.push({ field: 'tax_id', code: 'invalid_tz_checksum', value: row.tax_id });
  }
  if (row.company_id && !validateIsraeliCompanyId(row.company_id)) {
    errors.push({ field: 'company_id', code: 'invalid_hp_checksum', value: row.company_id });
  }
  if (row.document_date && typeof row.document_date === 'object' && row.document_date.__unsupported_hebrew_date) {
    errors.push({
      field: 'document_date',
      code: 'hebrew_date_unsupported',
      value: row.document_date.__unsupported_hebrew_date,
    });
  } else if (row.document_date === null) {
    warnings.push({ field: 'document_date', code: 'missing_or_unparsable' });
  }

  if (row.__entity === ENTITY_TYPES.INVOICE || row.__entity === ENTITY_TYPES.CREDIT_NOTE) {
    const t = validateInvoiceTotals(row, { vatRate });
    if (!t.ok) {
      errors.push({ field: 'amount', code: t.reason, detail: t });
    } else if (t.derived) {
      Object.assign(row, t.derived);
      warnings.push({ field: 'amount', code: 'derived', derived: t.derived });
    }
  }

  if (row.__entity === ENTITY_TYPES.INVENTORY_ITEM) {
    if (!row.sku && !row.item_name) {
      errors.push({ field: 'sku', code: 'missing_identifier' });
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

// ═══════════════════════════════════════════════════════════════════════
// Stage 5–7 — Dry-run, commit, audit log, rollback
// ═══════════════════════════════════════════════════════════════════════

async function commitRows(rows, { supabase, runId }) {
  // Group rows by entity → target table
  const groups = groupByEntity(rows);
  const committed = [];
  const committedIds = [];
  try {
    for (const [entity, list] of Object.entries(groups)) {
      const table = entityToTable(entity);
      if (!table) continue;
      const { data, error } = await supabase.from(table).insert(list).select('id');
      if (error) {
        throw Object.assign(new Error(`commit_failed: ${table}`), { cause: error, table });
      }
      committed.push({ table, count: list.length, ids: (data || []).map((d) => d.id) });
      for (const d of data || []) committedIds.push({ table, id: d.id });
    }
    return { committed, committedIds };
  } catch (err) {
    // Rollback — mark committed rows as "migration_rolled_back" via update.
    // Per the hard rule: NO DELETES. We only soft-flag.
    await rollbackCommit(committedIds, supabase, runId);
    throw err;
  }
}

async function rollbackCommit(committedIds, supabase, runId) {
  for (const { table, id } of committedIds) {
    try {
      await supabase
        .from(table)
        .update({ migration_status: 'rolled_back', migration_rolled_back_run: runId })
        .eq('id', id);
    } catch {
      // swallow — rollback is best-effort; audit log will preserve the fact
    }
  }
}

function groupByEntity(rows) {
  const out = {};
  for (const row of rows) {
    const entity = row.__entity || ENTITY_TYPES.UNKNOWN;
    if (!out[entity]) out[entity] = [];
    const clean = { ...row };
    delete clean.__entity;
    delete clean.__source_row;
    delete clean.__source_sheet;
    out[entity].push(clean);
  }
  return out;
}

function entityToTable(entity) {
  switch (entity) {
    case ENTITY_TYPES.INVOICE:
      return 'legacy_invoices';
    case ENTITY_TYPES.CREDIT_NOTE:
      return 'legacy_credit_notes';
    case ENTITY_TYPES.RECEIPT:
      return 'legacy_receipts';
    case ENTITY_TYPES.LEDGER_CARD:
      return 'legacy_ledger_cards';
    case ENTITY_TYPES.INVENTORY_ITEM:
      return 'legacy_inventory_items';
    case ENTITY_TYPES.PURCHASE_ORDER:
      return 'legacy_purchase_orders';
    case ENTITY_TYPES.SUPPLIER:
      return 'legacy_suppliers';
    case ENTITY_TYPES.CUSTOMER:
      return 'legacy_customers';
    default:
      return null;
  }
}

async function writeAuditLog(entry, { supabase }) {
  if (!supabase || typeof supabase.from !== 'function') return { skipped: true };
  try {
    await supabase.from('legacy_migration_audit').insert([entry]);
    return { written: true };
  } catch (err) {
    return { written: false, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// migrateLegacyData(file, system, options)
// The master pipeline. Returns a structured result safe for the caller.
// ═══════════════════════════════════════════════════════════════════════

async function migrateLegacyData(file, system, options = {}) {
  const { supabase = null, dryRun = true, vatRate = DEFAULT_VAT_RATE, entityHint = null } = options;
  const runId = generateRunId();
  const startedAt = new Date().toISOString();
  const result = {
    runId,
    startedAt,
    finishedAt: null,
    system: system || detectLegacySystem(file),
    fileName: file && file.name,
    dryRun,
    stages: {},
    counts: { parsed: 0, mapped: 0, transformed: 0, valid: 0, invalid: 0, committed: 0 },
    errors: [],
    warnings: [],
    sample: [],
    unmappedHeaders: [],
  };

  try {
    // Stage 1 — parse
    const parsed = parseBySystem(file, result.system);
    result.stages.parse = {
      rows: parsed.rows.length,
      meta: parsed.meta,
      warnings: parsed.warnings,
    };
    result.counts.parsed = parsed.rows.length;
    result.warnings.push(...parsed.warnings);
    if (parsed.rows.length === 0) {
      result.errors.push({ stage: 'parse', code: 'no_rows' });
      return finalize(result, startedAt);
    }

    // Stage 2 — map
    const { mapped, unmappedHeaders } = mapSchema(parsed.rows, { entityHint });
    result.stages.map = { rows: mapped.length, unmappedHeaders };
    result.unmappedHeaders = unmappedHeaders;
    result.counts.mapped = mapped.length;

    // Stage 3 — transform
    const transformed = mapped.map((r) => transformRow(r));
    result.stages.transform = { rows: transformed.length };
    result.counts.transformed = transformed.length;

    // Stage 4 — validate
    const validRows = [];
    const invalidRows = [];
    for (const row of transformed) {
      const v = validateRow(row, { vatRate });
      if (v.ok) {
        validRows.push(row);
      } else {
        invalidRows.push({ row, errors: v.errors });
      }
      if (v.warnings.length > 0) {
        result.warnings.push({ row: row.__source_row, warnings: v.warnings });
      }
    }
    result.stages.validate = { valid: validRows.length, invalid: invalidRows.length };
    result.counts.valid = validRows.length;
    result.counts.invalid = invalidRows.length;
    result.sample = validRows.slice(0, 5).map((r) => ({ ...r }));

    if (invalidRows.length > 0) {
      result.errors.push(
        ...invalidRows.slice(0, 50).map((ir) => ({
          stage: 'validate',
          row: ir.row.__source_row,
          errors: ir.errors,
        })),
      );
    }

    // Stage 5 — dry run always computes, commits only if asked
    result.stages.dry_run = {
      wouldCommit: validRows.length,
      byEntity: summaryByEntity(validRows),
    };

    // Stage 6 — commit (optional)
    if (!dryRun && supabase) {
      const committedResult = await commitRows(validRows, { supabase, runId });
      result.stages.commit = committedResult;
      result.counts.committed = committedResult.committed.reduce((a, b) => a + b.count, 0);
    } else {
      result.stages.commit = { skipped: true, reason: dryRun ? 'dry_run' : 'no_supabase' };
    }

    // Stage 7 — audit log
    const auditEntry = {
      run_id: runId,
      started_at: startedAt,
      system: result.system,
      file_name: file && file.name,
      counts: result.counts,
      dry_run: dryRun,
      stages: result.stages,
      errors_count: result.errors.length,
      warnings_count: result.warnings.length,
    };
    result.stages.audit_log = await writeAuditLog(auditEntry, { supabase });
  } catch (err) {
    result.errors.push({
      stage: 'pipeline',
      code: err.code || 'unhandled',
      message: err.message,
      cause: err.cause && err.cause.message,
    });
    result.stages.rollback = { attempted: true, reason: err.message };
  }

  return finalize(result, startedAt);
}

function finalize(result, startedAt) {
  result.finishedAt = new Date().toISOString();
  result.durationMs = Date.parse(result.finishedAt) - Date.parse(startedAt);
  return result;
}

function parseBySystem(file, system) {
  switch (system) {
    case LEGACY_SYSTEMS.EXCEL:
      return parseExcelLegacy(file);
    case LEGACY_SYSTEMS.HASHAVSHEVET_WIN:
    case LEGACY_SYSTEMS.HASHAVSHEVET_ERP:
      return parseHashavshevet(file);
    case LEGACY_SYSTEMS.PRIORITY:
      return parsePriority(file);
    case LEGACY_SYSTEMS.GENERIC_CSV:
      return parseGenericCsv(file);
    default:
      return { rows: [], meta: {}, warnings: [`unsupported_system:${system}`] };
  }
}

function summaryByEntity(rows) {
  const byEntity = {};
  for (const row of rows) {
    const e = row.__entity || 'unknown';
    if (!byEntity[e]) byEntity[e] = 0;
    byEntity[e] += 1;
  }
  return byEntity;
}

function generateRunId() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `legacymig_${ts}_${rand}`;
}

// ═══════════════════════════════════════════════════════════════════════
// generateMigrationReport(result) — human-readable summary
// ═══════════════════════════════════════════════════════════════════════

function generateMigrationReport(result) {
  if (!result || typeof result !== 'object') {
    return { text: '', markdown: '', json: {} };
  }
  const lines = [];
  lines.push(`# Legacy Migration Report — ${result.runId}`);
  lines.push('');
  lines.push(`- System: **${result.system}**`);
  lines.push(`- File: \`${result.fileName || '(unknown)'}\``);
  lines.push(`- Mode: ${result.dryRun ? 'DRY RUN' : 'COMMIT'}`);
  lines.push(`- Started: ${result.startedAt}`);
  lines.push(`- Finished: ${result.finishedAt}`);
  lines.push(`- Duration: ${result.durationMs} ms`);
  lines.push('');
  lines.push('## Counts');
  lines.push(`- Parsed: ${result.counts.parsed}`);
  lines.push(`- Mapped: ${result.counts.mapped}`);
  lines.push(`- Transformed: ${result.counts.transformed}`);
  lines.push(`- Valid: ${result.counts.valid}`);
  lines.push(`- Invalid: ${result.counts.invalid}`);
  lines.push(`- Committed: ${result.counts.committed}`);
  lines.push('');
  if (result.unmappedHeaders.length > 0) {
    lines.push('## Unmapped headers');
    for (const h of result.unmappedHeaders) lines.push(`- ${h}`);
    lines.push('');
  }
  if (result.errors.length > 0) {
    lines.push('## Errors');
    for (const err of result.errors.slice(0, 20)) {
      lines.push(`- [${err.stage}] ${JSON.stringify(err)}`);
    }
    lines.push('');
  }
  if (result.warnings.length > 0) {
    lines.push('## Warnings');
    for (const w of result.warnings.slice(0, 20)) {
      lines.push(`- ${JSON.stringify(w)}`);
    }
    lines.push('');
  }
  const markdown = lines.join('\n');
  const text = markdown.replace(/^#+\s*/gm, '').replace(/\*\*/g, '');
  return { markdown, text, json: result };
}

// ═══════════════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════════════

module.exports = {
  // Constants
  LEGACY_SYSTEMS,
  ENTITY_TYPES,
  STAGES,
  DEFAULT_VAT_RATE,
  HEADER_ALIAS,

  // Public API
  detectLegacySystem,
  migrateLegacyData,
  generateMigrationReport,

  // Stage functions (exported for granular tests)
  parseExcelLegacy,
  parseHashavshevet,
  parsePriority,
  parseGenericCsv,
  parseBySystem,
  mapSchema,
  transformRow,
  validateRow,

  // Validators
  validateIsraeliId,
  validateIsraeliCompanyId,
  validateInvoiceTotals,

  // Normalizers
  normalizeDateGregorian,
  normalizeAmount,
  normalizeHebrewText,
  normalizeHeader,
  resolveHeader,

  // Helpers
  resolveMergedCells,
  resolveFormulas,
  autoDetectSheetStructure,
  splitCsvLine,
  inferEntity,
  entityToTable,
  summaryByEntity,

  // Commit / audit (async)
  commitRows,
  rollbackCommit,
  writeAuditLog,
};
