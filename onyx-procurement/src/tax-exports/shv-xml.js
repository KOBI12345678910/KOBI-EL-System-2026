/**
 * shv-xml.js — שומה עצמית (Self-Assessment annual calculation) in XML.
 * Agent 70 — Tax Authority XML export formats (Wave 2026)
 *
 * Self-assessment annual tax calculation. Taxpayer's own computation
 * of the yearly tax liability that accompanies the annual return
 * (usually sent alongside form 1320 or 1301).
 */

'use strict';

const {
  el, wrap, fields, buildDocument, buildMetaBlock, writeXmlFile,
  isoDate, amount, integer, requireFields, validateTaxIdField,
} = require('./_xml-common');

const FORM_CODE = 'SHV';
const ROOT_TAG = 'ReportSelfAssessment';

// ═══════════════════════════════════════════════════════════════

function buildTaxpayerBlock(tp = {}) {
  return wrap('Taxpayer', fields({
    TaxpayerId: tp.taxpayerId,
    TaxpayerName: tp.taxpayerName,
    TaxpayerType: tp.type || 'company',
    AssessmentYear: integer(tp.assessmentYear),
  }));
}

function buildCalculationSection(calc = {}) {
  return wrap('Calculation', fields({
    GrossIncome: amount(calc.grossIncome),
    AllowedExpenses: amount(calc.allowedExpenses),
    NetIncome: amount(calc.netIncome ?? ((+calc.grossIncome || 0) - (+calc.allowedExpenses || 0))),
    CarryForwardLosses: amount(calc.carryForwardLosses),
    TaxableIncome: amount(calc.taxableIncome),
    TaxRate: amount(calc.taxRate),
    GrossTax: amount(calc.grossTax),
    Credits: amount(calc.credits),
    NetTaxLiability: amount(calc.netTaxLiability),
  }));
}

function buildPaymentsSection(payments = {}) {
  return wrap('Payments', fields({
    AdvancePayments: amount(payments.advancePayments),
    WithholdingCredits: amount(payments.withholdingCredits),
    ForeignTaxCredit: amount(payments.foreignTaxCredit),
    TotalPaid: amount(
      (+payments.advancePayments || 0) +
      (+payments.withholdingCredits || 0) +
      (+payments.foreignTaxCredit || 0)
    ),
  }));
}

function buildBalanceSection(balance = {}) {
  return wrap('Balance', fields({
    NetTaxLiability: amount(balance.netTaxLiability),
    TotalPaid: amount(balance.totalPaid),
    BalanceDue: amount(balance.balanceDue),
    RefundDue: amount(balance.refundDue),
    InterestAmount: amount(balance.interestAmount),
    PenaltyAmount: amount(balance.penaltyAmount),
    TotalToRemit: amount(balance.totalToRemit),
  }));
}

function buildAttestationBlock(att = {}) {
  return wrap('Attestation', fields({
    SignedBy: att.signedBy,
    SignedRole: att.signedRole,
    SignedDate: att.signedDate ? isoDate(att.signedDate) : undefined,
    DeclarationText: att.declarationText || 'אני מצהיר כי הפרטים הרשומים נכונים ומלאים',
  }));
}

// ═══════════════════════════════════════════════════════════════

function generate(data) {
  if (!data) throw new Error('shv: data is required');
  const meta = buildMetaBlock({
    formCode: FORM_CODE,
    companyId: data.taxpayer?.taxpayerId,
    companyName: data.taxpayer?.taxpayerName,
    taxYear: data.taxpayer?.assessmentYear || data.taxYear,
    periodStart: data.periodStart,
    periodEnd: data.periodEnd,
    submissionType: data.submission?.type || 'initial',
    submissionDate: data.submission?.date,
  });

  const inner =
    meta +
    buildTaxpayerBlock(data.taxpayer) +
    buildCalculationSection(data.calculation || {}) +
    buildPaymentsSection(data.payments || {}) +
    buildBalanceSection(data.balance || {}) +
    buildAttestationBlock(data.attestation || {});

  return buildDocument(ROOT_TAG, FORM_CODE, inner);
}

function validate(data) {
  const errors = [];
  if (!data) {
    errors.push('shv: data is required');
    return errors;
  }
  errors.push(...requireFields(data, ['taxpayer', 'calculation']));
  if (data.taxpayer) {
    errors.push(...requireFields(data.taxpayer, ['taxpayerId', 'taxpayerName', 'assessmentYear'], 'taxpayer.'));
    errors.push(...validateTaxIdField(data.taxpayer, 'taxpayerId', 'taxpayer.'));
    if (data.taxpayer.type && !['company', 'individual'].includes(data.taxpayer.type)) {
      errors.push("taxpayer.type: must be 'company' or 'individual'");
    }
  }
  if (data.calculation?.taxRate !== undefined) {
    const r = Number(data.calculation.taxRate);
    if (!(r >= 0 && r <= 100)) errors.push('calculation.taxRate: must be 0-100');
  }
  if (data.balance) {
    const bd = Number(data.balance.balanceDue || 0);
    const rd = Number(data.balance.refundDue || 0);
    if (bd > 0 && rd > 0) {
      errors.push('balance: cannot have both balanceDue and refundDue > 0');
    }
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
