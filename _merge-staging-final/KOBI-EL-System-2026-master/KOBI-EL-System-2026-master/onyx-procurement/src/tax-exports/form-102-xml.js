/**
 * form-102-xml.js — טופס 102 (דיווח חודשי על ניכויי עובדים) in XML.
 * Agent 70 — Tax Authority XML export formats (Wave 2026)
 *
 * Monthly employer withholding report (income tax + social security +
 * health) that must be filed alongside the 15th-of-month payment.
 */

'use strict';

const {
  el, wrap, fields, buildDocument, buildMetaBlock, writeXmlFile,
  isoDate, isoPeriod, amount, integer, requireFields, validateTaxIdField,
} = require('./_xml-common');

const FORM_CODE = '102';
const ROOT_TAG = 'Report102';

// ═══════════════════════════════════════════════════════════════

function buildEmployerBlock(emp = {}) {
  return wrap('Employer', fields({
    EmployerId: emp.employerId,
    EmployerName: emp.employerName,
    DeductionFileNumber: emp.deductionFileNumber,
    BranchCode: emp.branchCode,
    Address: emp.address,
  }));
}

function buildPeriodBlock(period = {}) {
  return wrap('ReportPeriod', fields({
    Year: integer(period.year),
    Month: integer(period.month),
    Period: isoPeriod({ year: period.year, month: period.month }),
  }));
}

function buildIncomeTaxBlock(it = {}) {
  return wrap('IncomeTax', fields({
    EmployeesCount: integer(it.employeesCount),
    TotalGrossWages: amount(it.totalGrossWages),
    TotalTaxWithheld: amount(it.totalTaxWithheld),
  }));
}

function buildBituachLeumiBlock(bl = {}) {
  return wrap('BituachLeumi', fields({
    EmployeePortion: amount(bl.employeePortion),
    EmployerPortion: amount(bl.employerPortion),
    TotalRemitted: amount(bl.totalRemitted ?? ((+bl.employeePortion || 0) + (+bl.employerPortion || 0))),
  }));
}

function buildHealthBlock(h = {}) {
  return wrap('HealthInsurance', fields({
    EmployeePortion: amount(h.employeePortion),
    TotalRemitted: amount(h.totalRemitted ?? h.employeePortion),
  }));
}

function buildSummaryBlock(summary = {}, incomeTax = {}, bituachLeumi = {}, health = {}) {
  const it = +incomeTax.totalTaxWithheld || 0;
  const bl = (+bituachLeumi.employeePortion || 0) + (+bituachLeumi.employerPortion || 0);
  const hl = +health.employeePortion || 0;
  return wrap('Summary', fields({
    TotalIncomeTax: amount(summary.totalIncomeTax ?? it),
    TotalBituachLeumi: amount(summary.totalBituachLeumi ?? bl),
    TotalHealth: amount(summary.totalHealth ?? hl),
    GrandTotal: amount(summary.grandTotal ?? (it + bl + hl)),
    DueDate: summary.dueDate ? isoDate(summary.dueDate) : undefined,
    PaymentReference: summary.paymentReference,
  }));
}

// ═══════════════════════════════════════════════════════════════

function generate(data) {
  if (!data) throw new Error('form-102: data is required');
  const periodStart = data.period ? `${data.period.year}-${String(data.period.month).padStart(2,'0')}-01` : undefined;
  // last day of month
  let periodEnd;
  if (data.period) {
    const y = +data.period.year, m = +data.period.month;
    const last = new Date(y, m, 0).getDate();
    periodEnd = `${y}-${String(m).padStart(2,'0')}-${String(last).padStart(2,'0')}`;
  }

  const meta = buildMetaBlock({
    formCode: FORM_CODE,
    companyId: data.employer?.employerId,
    companyName: data.employer?.employerName,
    taxYear: data.period?.year,
    periodStart,
    periodEnd,
    submissionType: data.submission?.type || 'initial',
    submissionDate: data.submission?.date,
  });

  const inner =
    meta +
    buildEmployerBlock(data.employer) +
    buildPeriodBlock(data.period || {}) +
    buildIncomeTaxBlock(data.incomeTax || {}) +
    buildBituachLeumiBlock(data.bituachLeumi || {}) +
    buildHealthBlock(data.health || {}) +
    buildSummaryBlock(data.summary || {}, data.incomeTax, data.bituachLeumi, data.health);

  return buildDocument(ROOT_TAG, FORM_CODE, inner);
}

function validate(data) {
  const errors = [];
  if (!data) {
    errors.push('form-102: data is required');
    return errors;
  }
  errors.push(...requireFields(data, ['employer', 'period']));
  if (data.employer) {
    errors.push(...requireFields(data.employer, ['employerId', 'employerName'], 'employer.'));
    errors.push(...validateTaxIdField(data.employer, 'employerId', 'employer.'));
  }
  if (data.period) {
    errors.push(...requireFields(data.period, ['year', 'month'], 'period.'));
    if (data.period.month !== undefined) {
      const m = Number(data.period.month);
      if (!(m >= 1 && m <= 12)) errors.push('period.month: must be 1-12');
    }
    if (data.period.year !== undefined) {
      const y = Number(data.period.year);
      if (!(y >= 1990 && y <= 2100)) errors.push('period.year: out of range (1990-2100)');
    }
  }
  if (data.incomeTax?.employeesCount !== undefined && Number(data.incomeTax.employeesCount) < 0) {
    errors.push('incomeTax.employeesCount: must be >= 0');
  }
  return errors;
}

function writeToFile(data, outputPath) {
  const xml = generate(data);
  return writeXmlFile(xml, outputPath);
}

module.exports = {
  FORM_CODE,
  ROOT_TAG,
  generate,
  validate,
  writeToFile,
};
