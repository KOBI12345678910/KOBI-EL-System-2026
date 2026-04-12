/**
 * PCN836 Encoder — Israel Tax Authority VAT submission format
 * Wave 1.5 — B-09 fix
 *
 * Spec reference: רשות המסים — מבנה קובץ PCN836 (שמ"ת)
 * https://www.gov.il/he/departments/general/hiuv_imut
 *
 * Format: Fixed-width ASCII text, Windows-1255 encoding (Hebrew)
 * Each record = 1 line terminated by CRLF
 * Record types:
 *   A — Header (one per file)
 *   B — Summary (one per period)
 *   C — Input invoice detail
 *   D — Output invoice detail
 *   Z — Trailer (one per file)
 *
 * This encoder is a SIMPLIFIED reference implementation.
 * Before production submission, cross-check against:
 *   1. Official PCN836 spec PDF from רשות המסים
 *   2. Your accountant's validated test file
 *   3. שמ"ת portal dry-run
 */

'use strict';

const crypto = require('crypto');
const iconv = require('iconv-lite');

// ═══ FIELD FORMATTERS ═══

/**
 * Encode a JS string to a windows-1255 Buffer, then pad/truncate to
 * exactly `width` bytes.  This is critical because Hebrew characters
 * occupy 1 byte in windows-1255 but 2+ bytes in UTF-8.
 * For purely-ASCII fields the result is identical to the old
 * string-based padding.
 */
function fmtTextBytes(value, width) {
  const buf = iconv.encode(String(value || ''), 'windows-1255');
  if (buf.length >= width) return buf.slice(0, width);
  const padded = Buffer.alloc(width, 0x20); // 0x20 = space
  buf.copy(padded, 0, 0, Math.min(buf.length, width));
  return padded;
}

/** Pad numeric field to fixed width with leading zeros, amount × 100 (agorot). */
function fmtAmount(value, width) {
  const cents = Math.round(Math.abs(value || 0) * 100);
  const sign = value < 0 ? '-' : '';
  const maxDigits = sign ? width - 1 : width;
  const str = cents.toString().padStart(maxDigits, '0').slice(-maxDigits);
  return (sign + str).padStart(width, '0');
}

/** Pad numeric integer field to fixed width with leading zeros. */
function fmtInt(value, width) {
  return String(Math.round(value || 0)).padStart(width, '0');
}

/** Pad text field to fixed width with trailing spaces (or truncate). */
function fmtText(value, width) {
  const str = String(value || '').slice(0, width);
  return str.padEnd(width, ' ');
}

/** Format date as YYYYMMDD. */
function fmtDate(dateStr) {
  if (!dateStr) return '00000000';
  const d = new Date(dateStr);
  const y = d.getFullYear().toString().padStart(4, '0');
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}${m}${day}`;
}

/** Format period as YYYYMM. */
function fmtPeriod(dateStr) {
  if (!dateStr) return '000000';
  const d = new Date(dateStr);
  const y = d.getFullYear().toString().padStart(4, '0');
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  return `${y}${m}`;
}

// ═══ RECORD BUILDERS ═══

/**
 * A — Header record
 * 1     record_type        'A'
 * 9     vat_file_number    (reg #)
 * 6     period             YYYYMM
 * 1     period_type        '1'=monthly, '2'=bi-monthly
 * 8     submission_date    YYYYMMDD
 * 1     submission_type    '1'=initial, '2'=amendment
 * 50    company_name
 * 16    reserved
 */
function buildHeaderRecord(ctx) {
  const parts = [
    'A',
    fmtText(ctx.vatFileNumber, 9),
    fmtPeriod(ctx.periodStart),
    ctx.reportingFrequency === 'bi_monthly' ? '2' : '1',
    fmtDate(ctx.submissionDate || new Date()),
    ctx.submissionType === 'amendment' ? '2' : '1',
    fmtText(ctx.companyName, 50),
    fmtText('', 16),
  ];
  return parts.join('');
}

/**
 * B — Summary record (totals)
 */
function buildSummaryRecord(period) {
  const parts = [
    'B',
    fmtAmount(period.taxable_sales, 12),
    fmtAmount(period.vat_on_sales, 11),
    fmtAmount(period.zero_rate_sales, 12),
    fmtAmount(period.exempt_sales, 12),
    fmtAmount(period.taxable_purchases, 12),
    fmtAmount(period.vat_on_purchases, 11),
    fmtAmount(period.asset_purchases, 12),
    fmtAmount(period.vat_on_assets, 11),
    fmtAmount(period.net_vat_payable, 12),
    period.is_refund ? '2' : '1',
    fmtText('', 6),
  ];
  return parts.join('');
}

/**
 * C — Input invoice (purchase)
 * D — Output invoice (sale)
 */
function buildInvoiceRecord(invoice, recordType) {
  const parts = [
    recordType,                                  // 'C' or 'D'
    fmtText(invoice.counterparty_id || '', 9),   // ח.פ של ספק/לקוח
    fmtText(invoice.invoice_number || '', 20),
    fmtDate(invoice.invoice_date),
    fmtAmount(invoice.net_amount, 12),
    fmtAmount(invoice.vat_amount, 11),
    fmtText(invoice.is_asset ? 'Y' : 'N', 1),
    fmtText(invoice.allocation_number || '', 9), // מספר הקצאה (Invoice Reform 2024)
    fmtText('', 5),
  ];
  return parts.join('');
}

/**
 * Z — Trailer record
 */
function buildTrailerRecord(counts, checksum) {
  const parts = [
    'Z',
    fmtInt(counts.total, 9),
    fmtInt(counts.inputs, 9),
    fmtInt(counts.outputs, 9),
    fmtText(checksum.slice(0, 16), 16),
    fmtText('', 16),
  ];
  return parts.join('');
}

// ═══ MAIN ENCODER ═══

/**
 * Build a full PCN836 file for a given VAT period.
 * @param {Object} params
 * @param {Object} params.companyProfile — from company_tax_profile table
 * @param {Object} params.period         — from vat_periods table
 * @param {Array}  params.inputInvoices  — input (purchase) invoices
 * @param {Array}  params.outputInvoices — output (sale) invoices
 * @param {Object} [params.submission]   — { type: 'initial'|'amendment', date: Date }
 * @returns {Object} { content, lines, metadata }
 */
function buildPcn836File({ companyProfile, period, inputInvoices = [], outputInvoices = [], submission = {} }) {
  if (!companyProfile) throw new Error('companyProfile is required');
  if (!period) throw new Error('period is required');
  if (!companyProfile.vat_file_number) throw new Error('companyProfile.vat_file_number is required');

  const ctx = {
    vatFileNumber: companyProfile.vat_file_number,
    companyName: companyProfile.legal_name || companyProfile.company_name,
    reportingFrequency: companyProfile.reporting_frequency,
    periodStart: period.period_start,
    submissionDate: submission.date || new Date(),
    submissionType: submission.type || 'initial',
  };

  const lines = [];
  lines.push(buildHeaderRecord(ctx));
  lines.push(buildSummaryRecord(period));
  for (const inv of inputInvoices) lines.push(buildInvoiceRecord(inv, 'C'));
  for (const inv of outputInvoices) lines.push(buildInvoiceRecord(inv, 'D'));

  const counts = {
    total: lines.length + 1, // +1 for trailer
    inputs: inputInvoices.length,
    outputs: outputInvoices.length,
  };

  const bodyChecksum = crypto.createHash('sha256').update(lines.join('\r\n')).digest('hex');
  lines.push(buildTrailerRecord(counts, bodyChecksum));

  const content = lines.join('\r\n') + '\r\n';

  // BUG-08 fix — encode the entire file to windows-1255 as a Buffer.
  // The Tax Authority expects this encoding; writing as UTF-8 or latin1
  // corrupts Hebrew characters (company name, etc.).
  const buffer = iconv.encode(content, 'windows-1255');
  const fileChecksum = crypto.createHash('sha256').update(buffer).digest('hex');

  return {
    content,       // JS string — for previews, validation, JSON storage
    buffer,        // windows-1255 encoded Buffer — for disk archive & download
    lines,
    metadata: {
      period: period.period_label,
      recordCount: lines.length,
      inputCount: counts.inputs,
      outputCount: counts.outputs,
      fileChecksum,
      bodyChecksum,
      encoding: 'windows-1255',
      filename: `PCN836_${companyProfile.vat_file_number}_${period.period_label.replace(/-/g, '')}.TXT`,
      generatedAt: new Date().toISOString(),
    },
  };
}

/**
 * Validate a PCN836 file before submission — basic sanity checks.
 * @returns {Array<string>} array of error messages (empty if valid)
 */
function validatePcn836File(file) {
  const errors = [];
  if (!file.content) errors.push('Missing content');
  if (!file.metadata) errors.push('Missing metadata');
  if (file.lines?.length < 3) errors.push('Too few records (need at least A, B, Z)');
  if (file.lines?.[0]?.[0] !== 'A') errors.push('First record must be header (A)');
  if (file.lines?.[1]?.[0] !== 'B') errors.push('Second record must be summary (B)');
  if (file.lines?.[file.lines.length - 1]?.[0] !== 'Z') errors.push('Last record must be trailer (Z)');

  // Check each line matches its record-type width (PCN836 spec widths differ per type)
  const RECORD_WIDTHS = { A: 92, B: 113, C: 76, D: 76, Z: 60 };
  if (file.lines?.length > 0) {
    const widthErrors = file.lines
      .map((l, i) => {
        const type = l[0];
        const expected = RECORD_WIDTHS[type];
        if (!expected) return `line ${i}: unknown record type '${type}'`;
        return l.length !== expected ? `line ${i}: width ${l.length}, expected ${expected} for type ${type}` : null;
      })
      .filter(Boolean);
    if (widthErrors.length) errors.push(...widthErrors.slice(0, 5));
  }

  return errors;
}

module.exports = {
  buildPcn836File,
  validatePcn836File,
  // Exposed for testing
  fmtAmount,
  fmtInt,
  fmtText,
  fmtTextBytes,
  fmtDate,
  fmtPeriod,
};
