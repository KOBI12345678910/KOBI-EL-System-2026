/**
 * PCN874 Encoder — Israel Tax Authority MONTHLY VAT SUMMARY
 * Agent 215 (filling gap from Agent 132)
 *
 * Spec reference: רשות המסים — PCN874 — דיווח מע"מ מקוצר חודשי
 * https://www.gov.il/he/departments/general/hiuv_imut
 *
 * Format: Fixed-width ASCII text, Windows-1255 encoding (Hebrew)
 * Each record = 1 line terminated by CRLF
 *
 * Record types:
 *   H — Header   (one per file)
 *   S — Summary  (one per period — aggregated VAT totals)
 *   T — Trailer  (one per file — count + checksum)
 *
 * Submission window: by the 15th of the month FOLLOWING the report period.
 * Source aggregation: vat-routes.js GET /api/vat/periods/:id (computed.* JSON).
 *
 * Structural reference: vat/pcn836.js (sibling — detailed file)
 */

'use strict';

const crypto = require('crypto');
const iconv = require('iconv-lite');

// ═══ FIELD FORMATTERS (mirrored from pcn836.js for behavioural parity) ═══

function fmtTextBytes(value, width) {
  const buf = iconv.encode(String(value || ''), 'windows-1255');
  if (buf.length >= width) return buf.slice(0, width);
  const padded = Buffer.alloc(width, 0x20);
  buf.copy(padded, 0, 0, Math.min(buf.length, width));
  return padded;
}

/** Numeric — amount × 100 (agorot), zero-padded, leading sign for negatives. */
function fmtAmount(value, width) {
  const cents = Math.round(Math.abs(value || 0) * 100);
  const sign = value < 0 ? '-' : '';
  const maxDigits = sign ? width - 1 : width;
  const str = cents.toString().padStart(maxDigits, '0').slice(-maxDigits);
  return (sign + str).padStart(width, '0');
}

function fmtInt(value, width) {
  return String(Math.round(value || 0)).padStart(width, '0');
}

function fmtText(value, width) {
  const str = String(value || '').slice(0, width);
  return str.padEnd(width, ' ');
}

function fmtDate(dateStr) {
  if (!dateStr) return '00000000';
  const d = new Date(dateStr);
  return `${d.getFullYear().toString().padStart(4, '0')}` +
    `${(d.getMonth() + 1).toString().padStart(2, '0')}` +
    `${d.getDate().toString().padStart(2, '0')}`;
}

function fmtPeriod(dateStr) {
  if (!dateStr) return '000000';
  const d = new Date(dateStr);
  return `${d.getFullYear().toString().padStart(4, '0')}` +
    `${(d.getMonth() + 1).toString().padStart(2, '0')}`;
}

// ═══ RECORD BUILDERS ═══

/**
 * H — Header record (width = 80)
 *  1   record_type        'H'
 *  9   vat_file_number
 *  6   period             YYYYMM
 *  1   period_type        '1' monthly (PCN874 is monthly-only)
 *  8   submission_date    YYYYMMDD
 *  1   submission_type    '1' initial / '2' amendment
 *  4   form_version       '0874'
 *  50  company_name
 */
function buildHeaderRecord(ctx) {
  return [
    'H',
    fmtText(ctx.vatFileNumber, 9),
    fmtPeriod(ctx.periodStart),
    '1',
    fmtDate(ctx.submissionDate || new Date()),
    ctx.submissionType === 'amendment' ? '2' : '1',
    '0874',
    fmtText(ctx.companyName, 50),
  ].join('');
}

/**
 * S — Summary record (width = 121)
 * Aggregated totals from vat-routes.js:83 `computed` object.
 * (Spec text says "width = 120" but the listed fields sum to 121 — Agent 215
 *  reconciled by trusting the field layout. WIDTHS.S below is 121.)
 *
 *   1   record_type           'S'
 *  12   taxable_sales
 *  11   vat_on_sales
 *  12   zero_rate_sales
 *  12   exempt_sales
 *  12   taxable_purchases
 *  11   vat_on_purchases
 *  12   asset_purchases
 *  11   vat_on_assets
 *  12   net_vat_payable      (signed; negative = refund due)
 *   1   refund_flag          '1' payable / '2' refund
 *  14   reserved
 */
function buildSummaryRecord(p) {
  return [
    'S',
    fmtAmount(p.taxable_sales, 12),
    fmtAmount(p.vat_on_sales, 11),
    fmtAmount(p.zero_rate_sales, 12),
    fmtAmount(p.exempt_sales, 12),
    fmtAmount(p.taxable_purchases, 12),
    fmtAmount(p.vat_on_purchases, 11),
    fmtAmount(p.asset_purchases, 12),
    fmtAmount(p.vat_on_assets, 11),
    fmtAmount(p.net_vat_payable, 12),
    p.is_refund ? '2' : '1',
    fmtText('', 14),
  ].join('');
}

/**
 * T — Trailer record (width = 50)
 *  1   record_type     'T'
 *  9   total_records   (count incl. trailer)
 * 16   body_checksum   (sha256 hex, truncated)
 * 12   net_vat_check   (echo of net_vat_payable for cross-check)
 * 12   reserved
 */
function buildTrailerRecord(counts, checksum, netVat) {
  return [
    'T',
    fmtInt(counts.total, 9),
    fmtText(checksum.slice(0, 16), 16),
    fmtAmount(netVat, 12),
    fmtText('', 12),
  ].join('');
}

// ═══ MAIN ENCODER ═══

/**
 * Build a PCN874 monthly VAT summary file.
 * @param {Object} params
 * @param {Object} params.companyProfile  — company_tax_profile row
 * @param {Object} params.period          — vat_periods row (period_start, period_label)
 * @param {Object} params.computed        — aggregated totals from vat-routes.js:83
 * @param {Object} [params.submission]    — { type: 'initial'|'amendment', date: Date }
 * @returns {Object} { content, buffer, lines, metadata }
 */
function buildPcn874File({ companyProfile, period, computed, submission = {} }) {
  if (!companyProfile) throw new Error('companyProfile is required');
  if (!period) throw new Error('period is required');
  if (!computed) throw new Error('computed totals are required (from vat-routes.js)');
  if (!companyProfile.vat_file_number) throw new Error('companyProfile.vat_file_number is required');

  const ctx = {
    vatFileNumber: companyProfile.vat_file_number,
    companyName: companyProfile.legal_name || companyProfile.company_name,
    periodStart: period.period_start,
    submissionDate: submission.date || new Date(),
    submissionType: submission.type || 'initial',
  };

  const lines = [];
  lines.push(buildHeaderRecord(ctx));
  lines.push(buildSummaryRecord(computed));

  const counts = { total: lines.length + 1 }; // +1 for trailer
  const bodyChecksum = crypto.createHash('sha256').update(lines.join('\r\n')).digest('hex');
  lines.push(buildTrailerRecord(counts, bodyChecksum, computed.net_vat_payable));

  const content = lines.join('\r\n') + '\r\n';
  const buffer = iconv.encode(content, 'windows-1255');
  const fileChecksum = crypto.createHash('sha256').update(buffer).digest('hex');

  return {
    content,
    buffer,
    lines,
    metadata: {
      formCode: 'PCN874',
      period: period.period_label,
      submissionDeadline: computeDeadline(period.period_start),
      recordCount: lines.length,
      fileChecksum,
      bodyChecksum,
      encoding: 'windows-1255',
      filename: `PCN874_${companyProfile.vat_file_number}_${period.period_label.replace(/-/g, '')}.TXT`,
      generatedAt: new Date().toISOString(),
    },
  };
}

/** PCN874 deadline = 15th of the month FOLLOWING period_start. */
function computeDeadline(periodStart) {
  const d = new Date(periodStart);
  // UTC math so the result is timezone-stable. ISO YYYY-MM-DD strings
  // parse to UTC midnight; using getUTC* + Date.UTC keeps us in UTC.
  const deadline = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 15));
  return deadline.toISOString().slice(0, 10);
}

/** Validate a PCN874 file before submission. */
function validatePcn874File(file) {
  const errors = [];
  if (!file.content) errors.push('Missing content');
  if (!file.metadata) errors.push('Missing metadata');
  if (file.lines?.length !== 3) errors.push(`Expected exactly 3 records (H, S, T); got ${file.lines?.length}`);
  if (file.lines?.[0]?.[0] !== 'H') errors.push('First record must be header (H)');
  if (file.lines?.[1]?.[0] !== 'S') errors.push('Second record must be summary (S)');
  if (file.lines?.[2]?.[0] !== 'T') errors.push('Third record must be trailer (T)');

  const WIDTHS = { H: 80, S: 121, T: 50 };
  if (file.lines?.length) {
    file.lines.forEach((l, i) => {
      const t = l[0];
      const exp = WIDTHS[t];
      if (!exp) errors.push(`line ${i}: unknown record type '${t}'`);
      else if (l.length !== exp) errors.push(`line ${i}: width ${l.length}, expected ${exp} for type ${t}`);
    });
  }
  return errors;
}

module.exports = {
  buildPcn874File,
  validatePcn874File,
  computeDeadline,
  // exposed for testing
  fmtAmount,
  fmtInt,
  fmtText,
  fmtTextBytes,
  fmtDate,
  fmtPeriod,
};
