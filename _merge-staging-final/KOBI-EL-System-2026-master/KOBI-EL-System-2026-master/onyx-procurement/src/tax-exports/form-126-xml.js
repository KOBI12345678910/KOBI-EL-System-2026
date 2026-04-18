/**
 * form-126-xml.js — טופס 126 (טופס מקדמות / advance payments) in XML.
 * Agent 70 — Tax Authority XML export formats (Wave 2026)
 *
 * Reports tax advances (מקדמות) already paid by the taxpayer against
 * the expected annual liability. Used for both companies and individuals.
 */

'use strict';

const {
  el, wrap, fields, buildDocument, buildMetaBlock, writeXmlFile,
  isoDate, amount, integer, requireFields, validateTaxIdField,
} = require('./_xml-common');

const FORM_CODE = '126';
const ROOT_TAG = 'Report126';

// ═══════════════════════════════════════════════════════════════

function buildTaxpayerBlock(tp = {}) {
  return wrap('Taxpayer', fields({
    TaxpayerId: tp.taxpayerId,
    TaxpayerName: tp.taxpayerName,
    TaxpayerType: tp.type || 'company',   // 'company' | 'individual'
    FileNumber: tp.fileNumber,
    Address: tp.address,
  }));
}

function buildAdvanceInstallment(i = {}) {
  return wrap('Installment', fields({
    InstallmentNo: integer(i.installmentNo),
    DueDate: isoDate(i.dueDate),
    PaymentDate: isoDate(i.paymentDate),
    AssessedAmount: amount(i.assessedAmount),
    PaidAmount: amount(i.paidAmount),
    Reference: i.reference,
    Status: i.status || 'paid',
  }));
}

function buildInstallmentsBlock(items = []) {
  return wrap('Installments', items.map(buildAdvanceInstallment).join(''));
}

function buildSummaryBlock(summary = {}, installments = []) {
  const computedAssessed = installments.reduce((s, x) => s + (+x.assessedAmount || 0), 0);
  const computedPaid = installments.reduce((s, x) => s + (+x.paidAmount || 0), 0);
  return wrap('Summary', fields({
    InstallmentsCount: integer(summary.installmentsCount ?? installments.length),
    TotalAssessed: amount(summary.totalAssessed ?? computedAssessed),
    TotalPaid: amount(summary.totalPaid ?? computedPaid),
    Balance: amount(summary.balance ?? (computedAssessed - computedPaid)),
    NextDueDate: summary.nextDueDate ? isoDate(summary.nextDueDate) : undefined,
  }));
}

// ═══════════════════════════════════════════════════════════════

function generate(data) {
  if (!data) throw new Error('form-126: data is required');
  const meta = buildMetaBlock({
    formCode: FORM_CODE,
    companyId: data.taxpayer?.taxpayerId,
    companyName: data.taxpayer?.taxpayerName,
    taxYear: data.taxYear,
    periodStart: data.periodStart || (data.taxYear ? `${data.taxYear}-01-01` : undefined),
    periodEnd: data.periodEnd || (data.taxYear ? `${data.taxYear}-12-31` : undefined),
    submissionType: data.submission?.type || 'initial',
    submissionDate: data.submission?.date,
  });

  const inner =
    meta +
    buildTaxpayerBlock(data.taxpayer) +
    buildInstallmentsBlock(data.installments || []) +
    buildSummaryBlock(data.summary || {}, data.installments || []);

  return buildDocument(ROOT_TAG, FORM_CODE, inner);
}

function validate(data) {
  const errors = [];
  if (!data) {
    errors.push('form-126: data is required');
    return errors;
  }
  errors.push(...requireFields(data, ['taxpayer', 'taxYear']));
  if (data.taxpayer) {
    errors.push(...requireFields(data.taxpayer, ['taxpayerId', 'taxpayerName'], 'taxpayer.'));
    errors.push(...validateTaxIdField(data.taxpayer, 'taxpayerId', 'taxpayer.'));
    if (data.taxpayer.type && !['company', 'individual'].includes(data.taxpayer.type)) {
      errors.push("taxpayer.type: must be 'company' or 'individual'");
    }
  }
  if (data.installments && !Array.isArray(data.installments)) {
    errors.push('installments: must be an array');
  } else if (Array.isArray(data.installments)) {
    data.installments.forEach((i, idx) => {
      if (i.installmentNo === undefined || i.installmentNo === null) {
        errors.push(`installments[${idx}].installmentNo: required`);
      }
      if (!i.dueDate) errors.push(`installments[${idx}].dueDate: required`);
      if (i.assessedAmount !== undefined && Number(i.assessedAmount) < 0) {
        errors.push(`installments[${idx}].assessedAmount: must be >= 0`);
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
