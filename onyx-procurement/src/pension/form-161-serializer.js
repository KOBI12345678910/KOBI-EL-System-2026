/**
 * Form 161 Serializer — טופס 161 (Income Tax Authority)
 * Techno-Kol Uzi mega-ERP — Israeli payroll compliance module
 * Per AGENT-328 §3.1b + §5 item 7 (HR deep audit, 2026-04-29)
 *
 * Form 161 is the "הודעה על פרישה מעבודה" form an employer files when
 * an employee leaves and severance is paid or credited. The
 * `severance-tracker.js` engine builds the row in JavaScript via
 * `generateForm161()` but never serialises it to:
 *   (a) a PDF the HR officer can print and sign,
 *   (b) a CSV row consumable by the Tax Authority bulk-upload.
 *
 * This module fills that gap. It:
 *   1. Renders the row to a bilingual (HE-RTL + EN) PDF using `pdfkit`.
 *   2. Renders the row to a UTF-8 CSV row (with header) matching the
 *      published "מס הכנסה — דיווח 161 שנת 2026" column order.
 *   3. Renders a JSON envelope ready for the future API submission
 *      client (the API itself is out of scope until the Tax Authority
 *      publishes its bulk-upload v2 endpoint).
 *
 * ZERO additional dependencies beyond `pdfkit` (already present
 * in onyx-procurement for wage-slip PDFs).
 *
 * Project rule: לא מוחקים, רק משדרגים ומגדלים — every serialisation
 * call appends to a `_form161Files` registry on disk metadata-side (the
 * caller persists the file paths via the audit log).
 */

'use strict';

const path = require('node:path');
const fs   = require('node:fs');

let PDFDocument = null;
try {
  // pdfkit is a dependency of onyx-procurement — same as wage-slip PDF.
  // Lazy require so consumers that only need CSV/JSON do not pay the
  // load cost.
  // eslint-disable-next-line global-require, import/no-extraneous-dependencies
  PDFDocument = require('pdfkit');
} catch (_e) {
  PDFDocument = null;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const FORM_161 = Object.freeze({
  CURRENT_VERSION: '2026-01',
  CSV_DELIMITER:   ',',
  CSV_NEWLINE:     '\r\n',          // CRLF for Tax Authority compatibility
  CSV_BOM:         '﻿',        // UTF-8 BOM for Hebrew correctness in Excel

  /**
   * Column order for the CSV export. Matches the official
   * 'דיווח 161 — שנת 2026' template published by רשות המסים.
   */
  CSV_COLUMNS: Object.freeze([
    'schema_version',
    'employer_company_id',
    'employer_name',
    'employer_tax_file',
    'employee_id',
    'employee_teudat_zehut',
    'employee_name_hebrew',
    'employee_start_date',
    'employee_end_date',
    'years_employed',
    'last_monthly_salary',
    'reason_code',
    'reason_hebrew',
    'rights_tier',
    'final_month',
    'statutory_severance',
    'fund_balance',
    'employer_top_up',
    'fund_surplus',
    'gross_paid',
    'exempt_ceiling',
    'exempt_amount',
    'taxable_amount',
    'marginal_rate',
    'tax_withheld',
    'net_to_employee',
    'election_recommended',
    'election_cash_now_tax_due',
    'election_pension_deferred_tax',
    'generated_at',
  ]),

  /** Hebrew header row for human-readable export (CSV row 2). */
  CSV_HEADERS_HE: Object.freeze([
    'גרסת טופס',
    'ח.פ מעביד',
    'שם מעביד',
    'תיק ניכויים',
    'מזהה עובד',
    'ת.ז',
    'שם עובד (עברית)',
    'תאריך תחילת עבודה',
    'תאריך סיום עבודה',
    'ותק (שנים)',
    'משכורת חודשית אחרונה',
    'קוד סיבה',
    'סיבה',
    'תקני זכויות',
    'חודש סיום',
    'פיצויים סטטוטוריים',
    'יתרת קרן',
    'השלמה ע"י המעביד',
    'עודף בקרן',
    'ברוטו ששולם',
    'תקרת פטור',
    'סכום פטור',
    'סכום חייב במס',
    'שיעור שולי',
    'מס שנוכה',
    'נטו לעובד',
    'בחירת מסלול מומלצת',
    'מס במזומן עכשיו',
    'מס נדחה (פנסיה)',
    'תאריך הפקה',
  ]),
});

// ═══════════════════════════════════════════════════════════════════════════
// In-memory registry — list of generated files per session
// (caller responsible for persisting in audit log).
// ═══════════════════════════════════════════════════════════════════════════

const _generatedFiles = [];

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function _isoNow() {
  return new Date().toISOString();
}

function _mustHaveRow(form161Row) {
  if (!form161Row || typeof form161Row !== 'object') {
    const e = new Error('form161Row is required | חובה להעביר שורת טופס 161');
    e.code = 'FORM_161_ROW_REQUIRED';
    throw e;
  }
  if (!form161Row.amounts || !form161Row.employee || !form161Row.employer) {
    const e = new Error('form161Row missing required blocks (amounts/employee/employer) | חסרים בלוקים בטופס 161');
    e.code = 'FORM_161_ROW_MALFORMED';
    throw e;
  }
}

function _csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function _flatten(form161Row) {
  const e  = form161Row.employee  || {};
  const er = form161Row.employer  || {};
  const t  = form161Row.termination || {};
  const a  = form161Row.amounts   || {};
  const x  = form161Row.election  || {};
  return {
    schema_version: form161Row.schema || FORM_161.CURRENT_VERSION,

    employer_company_id: er.companyId,
    employer_name:       er.companyName,
    employer_tax_file:   er.taxFileNumber,

    employee_id:           e.id,
    employee_teudat_zehut: e.teudatZehut,
    employee_name_hebrew:  e.nameHebrew,
    employee_start_date:   e.startDate,
    employee_end_date:     e.endDate,

    years_employed:      e.yearsEmployed,
    last_monthly_salary: e.lastMonthlySalary,

    reason_code:    t.reasonCode,
    reason_hebrew:  t.reasonHebrew,
    rights_tier:    t.rightsTier,
    final_month:    t.finalMonth,

    statutory_severance: a.statutorySeverance,
    fund_balance:        a.fundBalance,
    employer_top_up:     a.employerTopUp,
    fund_surplus:        a.fundSurplus,
    gross_paid:          a.grossPaid,
    exempt_ceiling:      a.exemptCeiling,
    exempt_amount:       a.exemptAmount,
    taxable_amount:      a.taxableAmount,
    marginal_rate:       a.marginalRate,
    tax_withheld:        a.taxWithheld,
    net_to_employee:     a.netToEmployee,

    election_recommended:           x.recommended,
    election_cash_now_tax_due:      x.cashNowTaxDue,
    election_pension_deferred_tax:  x.pensionDeferredTax,

    generated_at: form161Row.generatedAt || _isoNow(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. CSV — string serialisation
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Serialise one or many Form 161 rows into a CSV string with
 * UTF-8 BOM, English column-name header, Hebrew header for humans,
 * and CRLF line endings (Tax Authority bulk-upload requirement).
 *
 * @param {object|object[]} rows  one row or an array of rows
 * @param {object} [opts]
 * @param {boolean} [opts.includeHebrewHeader=true]
 * @param {boolean} [opts.includeBom=true]
 * @returns {string} CSV text
 */
function toCsv(rows, opts = {}) {
  const includeHe = opts.includeHebrewHeader !== false;
  const includeBom = opts.includeBom !== false;

  const list = Array.isArray(rows) ? rows : [rows];
  if (list.length === 0) {
    const e = new Error('rows is empty | אין שורות לסיריאליזציה');
    e.code = 'FORM_161_CSV_EMPTY';
    throw e;
  }
  list.forEach(_mustHaveRow);

  const header = FORM_161.CSV_COLUMNS.join(FORM_161.CSV_DELIMITER);
  const headerHe = FORM_161.CSV_HEADERS_HE.map(_csvEscape).join(FORM_161.CSV_DELIMITER);

  const dataLines = list.map((row) => {
    const flat = _flatten(row);
    return FORM_161.CSV_COLUMNS
      .map((col) => _csvEscape(flat[col]))
      .join(FORM_161.CSV_DELIMITER);
  });

  const lines = [];
  if (includeBom) lines.push(FORM_161.CSV_BOM + header);
  else lines.push(header);
  if (includeHe) lines.push(headerHe);
  for (const dl of dataLines) lines.push(dl);

  return lines.join(FORM_161.CSV_NEWLINE) + FORM_161.CSV_NEWLINE;
}

/**
 * Convenience: write the CSV to disk.
 *
 * @param {object|object[]} rows
 * @param {string} outputPath  absolute file path
 * @param {object} [opts]
 * @returns {{ path: string, size: number, rows: number }}
 */
function writeCsv(rows, outputPath, opts = {}) {
  const text = toCsv(rows, opts);
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outputPath, text, { encoding: 'utf8' });
  const size = fs.statSync(outputPath).size;
  const out = {
    path: outputPath,
    size,
    rows: Array.isArray(rows) ? rows.length : 1,
    format: 'csv',
    generated_at: _isoNow(),
  };
  _generatedFiles.push(out);
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. JSON envelope
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Wrap a row into the API envelope expected by the (future) Tax
 * Authority bulk-submission endpoint. The envelope is also a
 * convenient archival record.
 */
function toJsonEnvelope(form161Row) {
  _mustHaveRow(form161Row);
  return {
    formCode: '161',
    formCode_he: 'טופס 161',
    schema: form161Row.schema || FORM_161.CURRENT_VERSION,
    payload: form161Row,
    submission: {
      status:           'pending',
      submission_id:    null,
      submitted_at:     null,
      submitted_by:     null,
      ack_reference:    null,
    },
    generated_at: _isoNow(),
  };
}

/**
 * Write the JSON envelope to disk.
 */
function writeJson(form161Row, outputPath) {
  const env = toJsonEnvelope(form161Row);
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(env, null, 2), 'utf8');
  const size = fs.statSync(outputPath).size;
  const out = { path: outputPath, size, format: 'json', generated_at: env.generated_at };
  _generatedFiles.push(out);
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. PDF
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Render a Form 161 row to a printable bilingual PDF.
 *
 * @param {object} form161Row
 * @param {string} outputPath  absolute file path
 * @returns {Promise<{path,size,format,generated_at}>}
 */
function writePdf(form161Row, outputPath) {
  return new Promise((resolve, reject) => {
    _mustHaveRow(form161Row);
    if (!PDFDocument) {
      const e = new Error('pdfkit not installed | pdfkit חסר ב-onyx-procurement');
      e.code = 'FORM_161_PDFKIT_MISSING';
      return reject(e);
    }

    try {
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const e  = form161Row.employee  || {};
      const er = form161Row.employer  || {};
      const t  = form161Row.termination || {};
      const a  = form161Row.amounts   || {};
      const x  = form161Row.election  || {};

      const doc = new PDFDocument({
        size: 'A4',
        margin: 50,
        info: {
          Title: 'Form 161 / טופס 161 — ' + (e.nameHebrew || e.id || ''),
          Author: er.companyName || 'Techno-Kol Uzi ERP',
          Subject: 'Notice of termination of employment / הודעה על פרישה מעבודה',
          Keywords: 'form 161, severance, פיצויים, פרישה',
          CreationDate: new Date(),
        },
      });

      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      // Helper to format NIS amounts
      const nis = (n) => {
        const num = Number(n || 0);
        return '₪ ' + num.toLocaleString('he-IL', {
          minimumFractionDigits: 2, maximumFractionDigits: 2,
        });
      };

      // ── HEADER ──
      doc.fontSize(18).text('Form 161 — Notice of termination of employment', { align: 'center' });
      doc.moveDown(0.2);
      doc.fontSize(13).text('טופס 161 — הודעה על פרישה מעבודה', { align: 'center' });
      doc.moveDown(0.2);
      doc.fontSize(9).text(
        `Schema: ${form161Row.schema || FORM_161.CURRENT_VERSION}  ·  Generated: ${form161Row.generatedAt || _isoNow()}`,
        { align: 'center' }
      );
      doc.moveDown(1);

      // ── EMPLOYER ──
      doc.fontSize(11).text('EMPLOYER / מעסיק', { underline: true });
      doc.fontSize(10);
      doc.text(`Name / שם: ${er.companyName || ''}`);
      doc.text(`Company ID / ח.פ: ${er.companyId || ''}`);
      doc.text(`Tax File / תיק ניכויים: ${er.taxFileNumber || ''}`);
      doc.moveDown(0.5);

      // ── EMPLOYEE ──
      doc.fontSize(11).text('EMPLOYEE / עובד', { underline: true });
      doc.fontSize(10);
      doc.text(`Name / שם: ${e.nameHebrew || ''}`);
      doc.text(`ID / ת.ז: ${e.teudatZehut || ''}`);
      doc.text(`Internal ID: ${e.id || ''}`);
      doc.text(`Start / תחילת עבודה: ${e.startDate || ''}`);
      doc.text(`End / סיום עבודה: ${e.endDate || ''}`);
      doc.text(`Years employed / ותק: ${e.yearsEmployed != null ? e.yearsEmployed : ''}`);
      doc.text(`Last salary / משכורת אחרונה: ${nis(e.lastMonthlySalary)}`);
      doc.moveDown(0.5);

      // ── TERMINATION ──
      doc.fontSize(11).text('TERMINATION / פרישה', { underline: true });
      doc.fontSize(10);
      doc.text(`Reason / סיבה: ${t.reasonHebrew || ''}  (${t.reasonCode || ''})`);
      doc.text(`Rights tier: ${t.rightsTier || ''}`);
      doc.text(`Final month / חודש סיום: ${t.finalMonth || ''}`);
      doc.moveDown(0.5);

      // ── AMOUNTS ──
      doc.fontSize(11).text('SEVERANCE AMOUNTS / סכומים', { underline: true });
      doc.fontSize(10);
      doc.text(`Statutory severance / פיצויים סטטוטוריים: ${nis(a.statutorySeverance)}`);
      doc.text(`Fund balance / יתרת קרן: ${nis(a.fundBalance)}`);
      doc.text(`Employer top-up / השלמת מעביד: ${nis(a.employerTopUp)}`);
      doc.text(`Fund surplus / עודף בקרן: ${nis(a.fundSurplus)}`);
      doc.text(`Gross paid / סך ששולם: ${nis(a.grossPaid)}`);
      doc.moveDown(0.3);
      doc.text(`Exempt ceiling / תקרת פטור: ${nis(a.exemptCeiling)}`);
      doc.text(`Exempt amount / סכום פטור: ${nis(a.exemptAmount)}`);
      doc.text(`Taxable amount / סכום חייב במס: ${nis(a.taxableAmount)}`);
      doc.text(`Marginal rate / שיעור שולי: ${a.marginalRate != null ? (Number(a.marginalRate) * 100).toFixed(2) + '%' : ''}`);
      doc.text(`Tax withheld / מס שנוכה: ${nis(a.taxWithheld)}`);
      doc.text(`Net to employee / נטו לעובד: ${nis(a.netToEmployee)}`);
      doc.moveDown(0.5);

      // ── ELECTION ──
      doc.fontSize(11).text('SECTION 161 ELECTION / בחירה לפי סעיף 161', { underline: true });
      doc.fontSize(10);
      doc.text(`Recommended / מומלץ: ${x.recommended || 'neutral'}`);
      doc.text(`Cash now — tax due / מס במזומן עכשיו: ${nis(x.cashNowTaxDue)}`);
      doc.text(`Pension continuity — deferred tax / מס נדחה לפנסיה: ${nis(x.pensionDeferredTax)}`);
      doc.moveDown(1);

      // ── SIGNATURES ──
      doc.fontSize(10);
      doc.text('Employer signature / חתימת מעביד: _________________________     Date / תאריך: __________');
      doc.moveDown(0.4);
      doc.text('Employee signature / חתימת עובד:  _________________________     Date / תאריך: __________');
      doc.moveDown(1);

      doc.fontSize(8).fillColor('#666');
      doc.text(
        'Auto-generated by Techno-Kol Uzi ERP. Not a substitute for tax advice. ' +
        'נוצר אוטומטית על-ידי מערכת Techno-Kol Uzi. אינו מהווה תחליף לייעוץ.',
        { align: 'center' }
      );

      doc.end();

      stream.on('finish', () => {
        const size = fs.statSync(outputPath).size;
        const out = { path: outputPath, size, format: 'pdf', generated_at: _isoNow() };
        _generatedFiles.push(out);
        resolve(out);
      });
      stream.on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. orchestration helper — emit all three formats at once
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convenience wrapper that emits PDF + CSV + JSON with stable filenames.
 * Returns whatever artifacts could be produced (PDF will be skipped if
 * pdfkit is unavailable).
 *
 * @param {object} form161Row
 * @param {string} outputDir
 * @param {string} [basename] default = `form161-{employeeId}-{finalMonth}`
 * @returns {Promise<{ pdf?:object, csv:object, json:object }>}
 */
async function emitAll(form161Row, outputDir, basename = null) {
  _mustHaveRow(form161Row);
  const e  = form161Row.employee || {};
  const t  = form161Row.termination || {};
  const safe = (s) => String(s || '').replace(/[^a-zA-Z0-9_-]+/g, '_');
  const stem = basename || `form161-${safe(e.id || e.teudatZehut)}-${safe(t.finalMonth)}`;

  const csv  = writeCsv([form161Row],   path.join(outputDir, stem + '.csv'));
  const json = writeJson(form161Row,    path.join(outputDir, stem + '.json'));

  const out = { csv, json };
  if (PDFDocument) {
    out.pdf = await writePdf(form161Row, path.join(outputDir, stem + '.pdf'));
  } else {
    out.pdf = { skipped: true, reason: 'pdfkit not installed' };
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. registry helpers (audit)
// ═══════════════════════════════════════════════════════════════════════════

function listGeneratedFiles() {
  return _generatedFiles.map((r) => ({ ...r }));
}

function _resetRegistry() {
  _generatedFiles.length = 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  FORM_161,
  toCsv,
  writeCsv,
  toJsonEnvelope,
  writeJson,
  writePdf,
  emitAll,
  listGeneratedFiles,
  _resetRegistry,
};
