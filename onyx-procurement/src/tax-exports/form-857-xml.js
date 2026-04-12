/**
 * form-857-xml.js — טופס 857 (דוח ניכויים של מעסיקים) in XML format.
 * Agent 70 — Tax Authority XML export formats (Wave 2026)
 *
 * Annual employer withholding return. Summarizes all withholdings made
 * by the employer from employees + contractors over the tax year.
 *
 * Usage:
 *   const f857 = require('./form-857-xml');
 *   const xml = f857.generate(data);
 */

'use strict';

const {
  el, wrap, fields, buildDocument, buildMetaBlock, writeXmlFile,
  isoDate, amount, integer, requireFields, validateTaxIdField,
} = require('./_xml-common');

const FORM_CODE = '857';
const ROOT_TAG = 'Report857';

// ═══════════════════════════════════════════════════════════════

function buildEmployerBlock(emp = {}) {
  return wrap('Employer', fields({
    EmployerId: emp.employerId,
    EmployerName: emp.employerName,
    ClassificationCode: emp.classificationCode,
    Address: emp.address,
    ContactName: emp.contactName,
    ContactPhone: emp.contactPhone,
    ContactEmail: emp.contactEmail,
  }));
}

function buildWithholdingRow(row = {}) {
  return wrap('WithholdingRow', fields({
    RowType: row.type || 'employee',     // 'employee' | 'contractor'
    RecipientId: row.recipientId,
    RecipientName: row.recipientName,
    GrossPaid: amount(row.grossPaid),
    TaxWithheld: amount(row.taxWithheld),
    BituachLeumiWithheld: amount(row.bituachLeumi),
    HealthWithheld: amount(row.health),
    NetPaid: amount(row.netPaid),
    PaymentsCount: integer(row.paymentsCount),
  }));
}

function buildWithholdingsBlock(rows = []) {
  const body = rows.map(buildWithholdingRow).join('');
  return wrap('Withholdings', body || '');
}

function buildSummaryBlock(summary = {}, rows = []) {
  // Auto-compute if not provided
  const computedGross = rows.reduce((s, r) => s + (+r.grossPaid || 0), 0);
  const computedTax = rows.reduce((s, r) => s + (+r.taxWithheld || 0), 0);
  const computedBl = rows.reduce((s, r) => s + (+r.bituachLeumi || 0), 0);
  const computedHealth = rows.reduce((s, r) => s + (+r.health || 0), 0);

  return wrap('Summary', fields({
    TotalEmployees: integer(summary.totalEmployees ?? rows.filter(r => (r.type || 'employee') === 'employee').length),
    TotalContractors: integer(summary.totalContractors ?? rows.filter(r => r.type === 'contractor').length),
    TotalGrossPaid: amount(summary.totalGrossPaid ?? computedGross),
    TotalTaxWithheld: amount(summary.totalTaxWithheld ?? computedTax),
    TotalBituachLeumi: amount(summary.totalBituachLeumi ?? computedBl),
    TotalHealth: amount(summary.totalHealth ?? computedHealth),
    TotalRemitted: amount(summary.totalRemitted ?? (computedTax + computedBl + computedHealth)),
  }));
}

// ═══════════════════════════════════════════════════════════════

function generate(data) {
  if (!data) throw new Error('form-857: data is required');
  const meta = buildMetaBlock({
    formCode: FORM_CODE,
    companyId: data.employer?.employerId,
    companyName: data.employer?.employerName,
    taxYear: data.taxYear,
    periodStart: data.periodStart || (data.taxYear ? `${data.taxYear}-01-01` : undefined),
    periodEnd: data.periodEnd || (data.taxYear ? `${data.taxYear}-12-31` : undefined),
    submissionType: data.submission?.type || 'initial',
    submissionDate: data.submission?.date,
  });

  const inner =
    meta +
    buildEmployerBlock(data.employer) +
    buildWithholdingsBlock(data.rows || []) +
    buildSummaryBlock(data.summary || {}, data.rows || []);

  return buildDocument(ROOT_TAG, FORM_CODE, inner);
}

function validate(data) {
  const errors = [];
  if (!data) {
    errors.push('form-857: data is required');
    return errors;
  }
  errors.push(...requireFields(data, ['employer', 'taxYear']));
  if (data.employer) {
    errors.push(...requireFields(data.employer, ['employerId', 'employerName'], 'employer.'));
    errors.push(...validateTaxIdField(data.employer, 'employerId', 'employer.'));
  }
  if (data.rows && !Array.isArray(data.rows)) {
    errors.push('rows: must be an array');
  } else if (Array.isArray(data.rows)) {
    data.rows.forEach((r, i) => {
      if (!r.recipientId) errors.push(`rows[${i}].recipientId: required`);
      if (!r.recipientName) errors.push(`rows[${i}].recipientName: required`);
      if (r.recipientId && !/^\d{7,9}$/.test(String(r.recipientId).trim())) {
        errors.push(`rows[${i}].recipientId: invalid (expected 7-9 digits)`);
      }
      if (r.type && !['employee', 'contractor'].includes(r.type)) {
        errors.push(`rows[${i}].type: must be 'employee' or 'contractor'`);
      }
    });
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
