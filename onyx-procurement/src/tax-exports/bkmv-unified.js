/**
 * bkmv-unified.js — מבנה אחיד / BKMVDATA + INI.TXT (Israel Tax Authority).
 * Agent 216 — Income Tax regulation 36 (תקנות מס הכנסה ניהול פנקסי חשבונות).
 *
 * Generates the *one-file-on-demand* a tax inspector requests during an audit.
 * Two artifacts are produced:
 *   • BKMVDATA.TXT — fixed-width Windows-1255 records (8 record types)
 *   • INI.TXT     — companion descriptor: which record types & how many of each
 *
 * This generator lives in PARALLEL to:
 *   • src/vat/pcn836.js          (PCN836, win-1255 fixed-width, A/B/C/D/Z)
 *   • src/tax-exports/_xml-common (XML namespace generators)
 *   • src/tax/form-builders.js   (annual-return JSON builders, structural reference)
 *
 * Spec reference: gov.il / רשות המסים — מבנה אחיד לקובץ נתונים, regulation 36.
 * This is a SIMPLIFIED reference implementation. Cross-check field widths and
 * codes against the official PDF before serving to a real inspector.
 *
 * Eight record types implemented:
 *   A100  — File header / business identification
 *   B100  — תנועות יומן (general journal lines)
 *   B110  — כרטסת חשבונות (account ledger / chart of accounts entries)
 *   C100  — חשבוניות מכר (sales invoices, output direction)
 *   D110  — חשבוניות רכש (purchase invoices, input direction)
 *   D120  — קבלות (receipts / cash payments)
 *   M100  — רשומות מלאי (inventory items / movements)
 *   Z900  — Trailer / control-totals
 *
 * Plus INI.TXT — describes which records the file actually contains.
 *
 * Usage:
 *   const bkmv = require('./bkmv-unified');
 *   const out  = bkmv.buildUnifiedFile({ companyProfile, fiscalYear, journal,
 *                                        ledger, salesInvoices, purchaseInvoices,
 *                                        receipts, inventory });
 *   fs.writeFileSync('BKMVDATA.TXT', out.bkmvBuffer);
 *   fs.writeFileSync('INI.TXT',      out.iniBuffer);
 */

'use strict';

const crypto = require('crypto');
const iconv = require('iconv-lite');

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

const ENCODING = 'windows-1255';
const LINE_TERMINATOR = '\r\n';

// Per-type record total widths (excluding LINE_TERMINATOR).
// Field tables below MUST sum to these values; validateFile asserts.
const RECORD_WIDTHS = {
  A100: 261,
  B100: 373,
  B110: 278,
  C100: 286,
  D110: 218,
  D120: 207,
  M100: 232,
  Z900:  64,
};

// Fixed signature chars used inside each record's first column.
const RECORD_CODES = Object.keys(RECORD_WIDTHS);

// ═══════════════════════════════════════════════════════════════
// Field formatters — byte-aware (Windows-1255 is 1 byte/char)
// ═══════════════════════════════════════════════════════════════

/** Encode a JS string to a windows-1255 byte buffer of exactly `width` bytes. */
function fmtTextBytes(value, width) {
  const buf = iconv.encode(String(value || ''), ENCODING);
  if (buf.length >= width) return buf.slice(0, width);
  const padded = Buffer.alloc(width, 0x20); // space-pad
  buf.copy(padded, 0, 0, buf.length);
  return padded;
}

/** Right-justified numeric integer, zero-padded, fixed width. */
function fmtInt(value, width) {
  const n = Math.round(Number(value || 0));
  const sign = n < 0 ? '-' : '';
  const digits = Math.abs(n).toString();
  const room = sign ? width - 1 : width;
  return iconv.encode(sign + digits.padStart(room, '0').slice(-room), ENCODING);
}

/**
 * Amount in agorot (cents): value × 100, sign-prefixed, zero-padded.
 * width includes the sign byte if the value is negative.
 */
function fmtAmount(value, width) {
  const cents = Math.round(Math.abs(Number(value || 0)) * 100);
  const sign = Number(value) < 0 ? '-' : '';
  const room = sign ? width - 1 : width;
  const str = cents.toString().padStart(room, '0').slice(-room);
  return iconv.encode(sign + str, ENCODING);
}

/** Format date as YYYYMMDD (windows-1255 bytes, fixed 8). */
function fmtDate(value) {
  if (!value) return iconv.encode('00000000', ENCODING);
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return iconv.encode('00000000', ENCODING);
  const y = d.getFullYear().toString().padStart(4, '0');
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return iconv.encode(`${y}${m}${day}`, ENCODING);
}

/** Format current time as HHMM (4 bytes). */
function fmtTime(value) {
  const d = value ? (value instanceof Date ? value : new Date(value)) : new Date();
  if (isNaN(d.getTime())) return iconv.encode('0000', ENCODING);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return iconv.encode(`${h}${m}`, ENCODING);
}

/** Concatenate an array of byte-Buffers into a single Buffer. */
function concatRecord(parts) {
  return Buffer.concat(parts.map(p => Buffer.isBuffer(p) ? p : iconv.encode(String(p), ENCODING)));
}

// ═══════════════════════════════════════════════════════════════
// Record builders — eight types
// ═══════════════════════════════════════════════════════════════

/**
 * A100 — File header + business identification.
 * Identifies the assesee, fiscal year, software, and run timestamp.
 * Width 261.
 */
function buildA100(ctx, runSeq) {
  const parts = [
    fmtTextBytes('A100', 4),
    fmtInt(runSeq, 9),                                 // running sequence (1)
    fmtTextBytes(ctx.companyProfile.vat_file_number || ctx.companyProfile.tax_file_number, 9),
    fmtTextBytes(ctx.fiscalYear, 4),                   // taxYear YYYY
    fmtDate(ctx.companyProfile.fiscal_year_start || `${ctx.fiscalYear}-01-01`),
    fmtDate(ctx.companyProfile.fiscal_year_end   || `${ctx.fiscalYear}-12-31`),
    fmtDate(ctx.runDate),                              // 8 — today
    fmtTime(ctx.runDate),                              // 4 — HHMM
    fmtTextBytes(ctx.companyProfile.legal_name || ctx.companyProfile.company_name, 50),
    fmtTextBytes(ctx.companyProfile.address_street || '', 50),
    fmtTextBytes(ctx.companyProfile.address_city   || '', 30),
    fmtTextBytes(ctx.companyProfile.address_postal || '', 8),
    fmtTextBytes(ctx.companyProfile.phone || '', 15),
    fmtTextBytes(ctx.companyProfile.accounting_method === 'cash' ? '1' : '2', 1), // 1=cash, 2=accrual
    fmtTextBytes('ONYX-PROCUREMENT', 20),              // software name
    fmtTextBytes('1.0', 8),                            // software version
    fmtTextBytes('216', 5),                            // generator agent id
    fmtTextBytes('', 20),                              // reserved
  ];
  return concatRecord(parts);
}

/**
 * B100 — תנועות יומן (general-journal line).
 * One record per gl_lines row inside the fiscal year.
 * Width 373.
 */
function buildB100(line, runSeq) {
  const parts = [
    fmtTextBytes('B100', 4),
    fmtInt(runSeq, 9),
    fmtTextBytes(line.journal_no || line.id || '', 10),  // sequential journal #
    fmtDate(line.date),
    fmtDate(line.value_date || line.date),
    fmtTextBytes(line.account_code || line.account || '', 15),
    fmtTextBytes(line.account_name || '', 50),
    fmtTextBytes(line.counterparty_id || '', 9),         // ח.פ של צד שני
    fmtTextBytes(line.counterparty_name || '', 50),
    fmtTextBytes(line.entity || '', 12),                 // sub-entity (project/dept)
    fmtTextBytes(line.source || '', 20),                 // source-doc type
    fmtTextBytes(line.source_id || '', 20),              // source-doc id
    fmtTextBytes(line.description || line.memo || '', 60),
    fmtAmount(line.debit  || 0, 15),
    fmtAmount(line.credit || 0, 15),
    fmtTextBytes(line.currency || 'ILS', 3),
    fmtAmount(line.fx_to_ils || 1, 12),                  // FX rate to ILS
    fmtTextBytes(line.posted_by || '', 20),              // user ref
    fmtTextBytes(line.batch_id || '', 20),               // batch
    fmtTextBytes(line.ref_branch || '', 5),              // branch / fiscal location
    fmtTextBytes('', 8),                                 // reserved
  ];
  return concatRecord(parts);
}

/**
 * B110 — כרטסת חשבונות (account ledger / chart-of-accounts row).
 * One record per account in the chart of accounts with year balances.
 * Width 278.
 */
function buildB110(account, runSeq) {
  const parts = [
    fmtTextBytes('B110', 4),
    fmtInt(runSeq, 9),
    fmtTextBytes(account.account_code || account.code, 15),
    fmtTextBytes(account.account_name || account.name || '', 50),
    fmtTextBytes(account.account_type || '', 12),        // asset/liab/equity/revenue/expense
    fmtTextBytes(account.parent_code || '', 15),
    fmtAmount(account.opening_balance || 0, 15),
    fmtAmount(account.total_debit     || 0, 15),
    fmtAmount(account.total_credit    || 0, 15),
    fmtAmount(account.closing_balance || 0, 15),
    fmtTextBytes(account.currency || 'ILS', 3),
    fmtTextBytes(account.form_6111_line || '', 6),       // 6111 mapping
    fmtTextBytes(account.bank_code   || '', 10),
    fmtTextBytes(account.branch_code || '', 6),
    fmtTextBytes(account.bank_account_no || '', 15),
    fmtTextBytes(account.is_active === false ? '0' : '1', 1),
    fmtTextBytes('', 72),                                // reserved
  ];
  return concatRecord(parts);
}

/**
 * C100 — חשבוניות מכר (sales / output invoice).
 * One record per tax_invoice with direction='output'.
 * Width 286.
 */
function buildC100(inv, runSeq) {
  const parts = [
    fmtTextBytes('C100', 4),
    fmtInt(runSeq, 9),
    fmtTextBytes(inv.invoice_number || '', 20),
    fmtDate(inv.invoice_date),
    fmtDate(inv.value_date || inv.invoice_date),
    fmtTextBytes(inv.customer_id || inv.counterparty_id || '', 9),
    fmtTextBytes(inv.customer_name || inv.counterparty_name || '', 50),
    fmtTextBytes(inv.document_type || '320', 3),         // 305=invoice, 320=tax-invoice
    fmtAmount(inv.net_amount || 0, 15),
    fmtAmount(inv.vat_amount || 0, 15),
    fmtAmount(inv.gross_amount || ((+inv.net_amount || 0) + (+inv.vat_amount || 0)), 15),
    fmtTextBytes(inv.currency || 'ILS', 3),
    fmtAmount(inv.fx_to_ils || 1, 12),
    fmtTextBytes(inv.allocation_number || '', 9),        // מספר הקצאה (Reform 2024)
    fmtTextBytes(inv.po_reference || '', 20),
    fmtTextBytes(inv.project_id || '', 12),
    fmtTextBytes(inv.status === 'voided' ? '0' : '1', 1),
    fmtTextBytes(inv.payment_terms || '', 10),
    fmtTextBytes(inv.delivery_method || '', 10),
    fmtTextBytes('', 53),                                // reserved
  ];
  return concatRecord(parts);
}

/**
 * D110 — חשבוניות רכש (purchase / input invoice).
 * One record per tax_invoice with direction='input'.
 * Width 218.
 */
function buildD110(inv, runSeq) {
  const parts = [
    fmtTextBytes('D110', 4),
    fmtInt(runSeq, 9),
    fmtTextBytes(inv.invoice_number || '', 20),
    fmtDate(inv.invoice_date),
    fmtTextBytes(inv.supplier_id || inv.counterparty_id || '', 9),
    fmtTextBytes(inv.supplier_name || inv.counterparty_name || '', 50),
    fmtAmount(inv.net_amount || 0, 15),
    fmtAmount(inv.vat_amount || 0, 15),
    fmtAmount(inv.gross_amount || ((+inv.net_amount || 0) + (+inv.vat_amount || 0)), 15),
    fmtTextBytes(inv.currency || 'ILS', 3),
    fmtAmount(inv.fx_to_ils || 1, 12),
    fmtTextBytes(inv.is_asset ? '1' : '0', 1),
    fmtTextBytes(inv.allocation_number || '', 9),
    fmtTextBytes(inv.po_reference || '', 20),
    fmtTextBytes(inv.status === 'voided' ? '0' : '1', 1),
    fmtTextBytes('', 27),                                // reserved
  ];
  return concatRecord(parts);
}

/**
 * D120 — קבלות (receipt of payment from customer).
 * One record per receipt row.
 * Width 207.
 */
function buildD120(rcpt, runSeq) {
  const parts = [
    fmtTextBytes('D120', 4),
    fmtInt(runSeq, 9),
    fmtTextBytes(rcpt.receipt_number || rcpt.id || '', 20),
    fmtDate(rcpt.receipt_date || rcpt.date),
    fmtTextBytes(rcpt.customer_id || rcpt.counterparty_id || '', 9),
    fmtTextBytes(rcpt.customer_name || rcpt.counterparty_name || '', 50),
    fmtAmount(rcpt.amount || 0, 15),
    fmtTextBytes(rcpt.currency || 'ILS', 3),
    fmtAmount(rcpt.fx_to_ils || 1, 12),
    fmtTextBytes(rcpt.payment_method || '', 3),          // 1=cash 2=check 3=wire 4=credit
    fmtTextBytes(rcpt.bank_code || '', 10),
    fmtTextBytes(rcpt.branch_code || '', 6),
    fmtTextBytes(rcpt.bank_account_no || '', 15),
    fmtTextBytes(rcpt.cheque_number || '', 10),
    fmtDate(rcpt.cheque_due_date || rcpt.receipt_date || rcpt.date),
    fmtTextBytes(rcpt.invoice_reference || '', 20),
    fmtTextBytes('', 5),                                 // reserved
  ];
  return concatRecord(parts);
}

/**
 * M100 — רשומות מלאי (inventory item / opening+closing balance).
 * One record per inventory item or movement.
 * Width 232.
 */
function buildM100(item, runSeq) {
  const parts = [
    fmtTextBytes('M100', 4),
    fmtInt(runSeq, 9),
    fmtTextBytes(item.sku || item.item_code || '', 20),
    fmtTextBytes(item.item_name || item.description || '', 50),
    fmtTextBytes(item.unit || 'EA', 5),                  // unit of measure
    fmtAmount(item.opening_qty || 0, 15),
    fmtAmount(item.closing_qty || 0, 15),
    fmtAmount(item.opening_value || 0, 15),
    fmtAmount(item.closing_value || 0, 15),
    fmtTextBytes(item.currency || 'ILS', 3),
    fmtTextBytes(item.warehouse || '', 10),
    fmtTextBytes(item.category || '', 20),
    fmtTextBytes(item.is_raw_material ? '1' : '0', 1),
    fmtTextBytes(item.barcode || '', 20),
    fmtTextBytes('', 30),                                // reserved
  ];
  return concatRecord(parts);
}

/**
 * Z900 — Trailer / control totals.
 * Last record. Contains record-count and SHA-256 truncated checksum.
 * Width 64.
 */
function buildZ900(totalCount, perTypeCounts, checksum16) {
  const parts = [
    fmtTextBytes('Z900', 4),
    fmtInt(totalCount, 9),
    fmtInt(perTypeCounts.B100 || 0, 7),
    fmtInt(perTypeCounts.C100 || 0, 7),
    fmtInt(perTypeCounts.D110 || 0, 7),
    fmtInt(perTypeCounts.D120 || 0, 7),
    fmtInt(perTypeCounts.M100 || 0, 7),
    fmtTextBytes(checksum16, 16),                        // 16 hex chars from SHA-256
  ];
  return concatRecord(parts);
}

// ═══════════════════════════════════════════════════════════════
// INI.TXT — companion descriptor file
// ═══════════════════════════════════════════════════════════════

/**
 * INI.TXT format (key=value, win-1255, CRLF).
 * Mirrors A100 plus per-record-type counts & total bytes.
 */
function buildIniBuffer(ctx, perTypeCounts, totalBytes, fileChecksum) {
  const lines = [
    `; INI.TXT — מבנה אחיד companion (regulation 36)`,
    `; generator=onyx-procurement/tax-exports/bkmv-unified.js`,
    `; agent=216`,
    `[FILE]`,
    `Encoding=${ENCODING}`,
    `LineTerminator=CRLF`,
    `TotalBytes=${totalBytes}`,
    `Sha256=${fileChecksum}`,
    `[BUSINESS]`,
    `TaxId=${ctx.companyProfile.vat_file_number || ctx.companyProfile.tax_file_number || ''}`,
    `Name=${ctx.companyProfile.legal_name || ctx.companyProfile.company_name || ''}`,
    `FiscalYear=${ctx.fiscalYear}`,
    `FiscalYearStart=${formatIsoDate(ctx.companyProfile.fiscal_year_start || `${ctx.fiscalYear}-01-01`)}`,
    `FiscalYearEnd=${formatIsoDate(ctx.companyProfile.fiscal_year_end   || `${ctx.fiscalYear}-12-31`)}`,
    `AccountingMethod=${ctx.companyProfile.accounting_method || 'accrual'}`,
    `[RECORDS]`,
    ...RECORD_CODES.map(c => `${c}=${perTypeCounts[c] || 0}`),
    `[GENERATED]`,
    `RunDate=${ctx.runDate.toISOString()}`,
    ``,
  ];
  return iconv.encode(lines.join(LINE_TERMINATOR), ENCODING);
}

function formatIsoDate(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

// ═══════════════════════════════════════════════════════════════
// Main builder
// ═══════════════════════════════════════════════════════════════

/**
 * Build the BKMVDATA.TXT + INI.TXT pair.
 * @param {Object} params
 * @param {Object} params.companyProfile  — from company_tax_profile
 * @param {string|number} params.fiscalYear
 * @param {Array}  [params.journal]           — gl_lines (B100)
 * @param {Array}  [params.ledger]            — chart-of-accounts rows w/ balances (B110)
 * @param {Array}  [params.salesInvoices]     — tax_invoices direction=output (C100)
 * @param {Array}  [params.purchaseInvoices]  — tax_invoices direction=input  (D110)
 * @param {Array}  [params.receipts]          — receipts table (D120)
 * @param {Array}  [params.inventory]         — inventory snapshot (M100)
 * @param {Date}   [params.runDate]           — defaults to new Date()
 * @returns {{
 *   bkmvBuffer:   Buffer, // BKMVDATA.TXT — windows-1255 encoded
 *   iniBuffer:    Buffer, // INI.TXT      — windows-1255 encoded
 *   bkmvFilename: string,
 *   iniFilename:  string,
 *   metadata:     Object
 * }}
 */
function buildUnifiedFile(params) {
  if (!params) throw new Error('bkmv-unified: params required');
  const { companyProfile, fiscalYear } = params;
  if (!companyProfile) throw new Error('bkmv-unified: companyProfile required');
  if (!fiscalYear)     throw new Error('bkmv-unified: fiscalYear required');
  if (!companyProfile.vat_file_number && !companyProfile.tax_file_number) {
    throw new Error('bkmv-unified: vat_file_number or tax_file_number required');
  }

  const ctx = {
    companyProfile,
    fiscalYear: String(fiscalYear),
    runDate: params.runDate || new Date(),
  };

  const journal          = params.journal          || [];
  const ledger           = params.ledger           || [];
  const salesInvoices    = params.salesInvoices    || [];
  const purchaseInvoices = params.purchaseInvoices || [];
  const receipts         = params.receipts         || [];
  const inventory        = params.inventory        || [];

  const records = [];
  const perTypeCounts = { A100: 0, B100: 0, B110: 0, C100: 0, D110: 0, D120: 0, M100: 0, Z900: 0 };
  let runSeq = 0;

  // 1. A100 header (always exactly one)
  runSeq += 1; perTypeCounts.A100 += 1;
  records.push(buildA100(ctx, runSeq));

  // 2. B100 journal entries
  for (const line of journal) {
    runSeq += 1; perTypeCounts.B100 += 1;
    records.push(buildB100(line, runSeq));
  }

  // 3. B110 ledger / chart-of-accounts
  for (const acc of ledger) {
    runSeq += 1; perTypeCounts.B110 += 1;
    records.push(buildB110(acc, runSeq));
  }

  // 4. C100 sales invoices
  for (const inv of salesInvoices) {
    runSeq += 1; perTypeCounts.C100 += 1;
    records.push(buildC100(inv, runSeq));
  }

  // 5. D110 purchase invoices
  for (const inv of purchaseInvoices) {
    runSeq += 1; perTypeCounts.D110 += 1;
    records.push(buildD110(inv, runSeq));
  }

  // 6. D120 receipts
  for (const r of receipts) {
    runSeq += 1; perTypeCounts.D120 += 1;
    records.push(buildD120(r, runSeq));
  }

  // 7. M100 inventory
  for (const item of inventory) {
    runSeq += 1; perTypeCounts.M100 += 1;
    records.push(buildM100(item, runSeq));
  }

  // 8. Z900 trailer — checksum over body so far (records joined by CRLF).
  const lt = iconv.encode(LINE_TERMINATOR, ENCODING);
  const bodyBuffer = Buffer.concat(
    records.flatMap((r, i) => i === records.length - 1 ? [r] : [r, lt])
  );
  const checksum16 = crypto.createHash('sha256').update(bodyBuffer).digest('hex').slice(0, 16);

  runSeq += 1; perTypeCounts.Z900 += 1;
  records.push(buildZ900(runSeq, perTypeCounts, checksum16));

  const bkmvBuffer = Buffer.concat(
    records.flatMap((r, i) => i === records.length - 1 ? [r, lt] : [r, lt])
  );

  const fileChecksum = crypto.createHash('sha256').update(bkmvBuffer).digest('hex');
  const iniBuffer = buildIniBuffer(ctx, perTypeCounts, bkmvBuffer.length, fileChecksum);

  const taxIdSafe = (companyProfile.vat_file_number || companyProfile.tax_file_number).replace(/\D/g, '');
  return {
    bkmvBuffer,
    iniBuffer,
    bkmvFilename: `BKMVDATA_${taxIdSafe}_${fiscalYear}.TXT`,
    iniFilename:  `INI_${taxIdSafe}_${fiscalYear}.TXT`,
    metadata: {
      encoding: ENCODING,
      lineTerminator: 'CRLF',
      totalRecords: runSeq,
      perTypeCounts,
      bkmvBytes: bkmvBuffer.length,
      iniBytes:  iniBuffer.length,
      fileChecksum,
      bodyChecksum16: checksum16,
      generatedAt: ctx.runDate.toISOString(),
      fiscalYear: ctx.fiscalYear,
      companyId: companyProfile.vat_file_number || companyProfile.tax_file_number,
      generator: 'onyx-procurement/tax-exports/bkmv-unified.js',
      generatorVersion: '1.0.0',
      agent: '216',
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// Validation — structural sanity over the produced buffer
// ═══════════════════════════════════════════════════════════════

/**
 * Validate a generated BKMVDATA buffer. Returns array of error strings (empty = ok).
 * Width-checks every record against RECORD_WIDTHS.
 */
function validateFile(bkmvBuffer) {
  const errors = [];
  if (!Buffer.isBuffer(bkmvBuffer)) {
    errors.push('bkmvBuffer must be a Buffer');
    return errors;
  }
  // Decode back to string in win-1255 for line splitting (1 char = 1 byte).
  const text = iconv.decode(bkmvBuffer, ENCODING);
  const lines = text.split(LINE_TERMINATOR).filter(l => l.length > 0);

  if (lines.length === 0) {
    errors.push('file is empty');
    return errors;
  }
  if (!lines[0].startsWith('A100')) {
    errors.push('first record must be A100');
  }
  if (!lines[lines.length - 1].startsWith('Z900')) {
    errors.push('last record must be Z900');
  }
  // Each record must match its declared width.
  for (let i = 0; i < lines.length; i += 1) {
    const code = lines[i].slice(0, 4);
    const expected = RECORD_WIDTHS[code];
    if (!expected) {
      errors.push(`line ${i}: unknown record code '${code}'`);
      continue;
    }
    if (lines[i].length !== expected) {
      errors.push(`line ${i} (${code}): width ${lines[i].length}, expected ${expected}`);
    }
    if (errors.length > 10) { errors.push('… more errors elided'); break; }
  }
  return errors;
}

// ═══════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════

module.exports = {
  // Main API
  buildUnifiedFile,
  validateFile,
  // Constants
  ENCODING,
  LINE_TERMINATOR,
  RECORD_WIDTHS,
  RECORD_CODES,
  // Per-record builders (testing / advanced reuse)
  buildA100,
  buildB100,
  buildB110,
  buildC100,
  buildD110,
  buildD120,
  buildM100,
  buildZ900,
  buildIniBuffer,
  // Formatters
  fmtTextBytes,
  fmtInt,
  fmtAmount,
  fmtDate,
  fmtTime,
};
