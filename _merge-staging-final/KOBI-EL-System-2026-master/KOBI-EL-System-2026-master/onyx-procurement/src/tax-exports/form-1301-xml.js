/**
 * form-1301-xml.js — טופס 1301 (דוח שנתי ליחיד) in XML format.
 * Agent 70 — Tax Authority XML export formats (Wave 2026)
 *
 * Annual personal income tax return for individuals. Covers salary,
 * self-employed income, investment income, deductions, credit points.
 */

'use strict';

const {
  el, wrap, fields, buildDocument, buildMetaBlock, writeXmlFile,
  isoDate, amount, integer, requireFields, validateTaxIdField,
} = require('./_xml-common');

const FORM_CODE = '1301';
const ROOT_TAG = 'Report1301';

// ═══════════════════════════════════════════════════════════════

function buildIndividualBlock(ind = {}) {
  return wrap('Individual', fields({
    TaxpayerId: ind.taxpayerId,
    FirstName: ind.firstName,
    LastName: ind.lastName,
    DateOfBirth: ind.dateOfBirth ? isoDate(ind.dateOfBirth) : undefined,
    MaritalStatus: ind.maritalStatus,
    Address: ind.address,
    Phone: ind.phone,
    Email: ind.email,
    SpouseId: ind.spouseId,
    SpouseName: ind.spouseName,
    NumChildren: integer(ind.numChildren),
  }));
}

function buildSalaryIncome(s = {}) {
  return wrap('SalaryIncome', fields({
    TotalGross: amount(s.totalGross),
    TaxWithheld: amount(s.taxWithheld),
    BituachLeumiWithheld: amount(s.bituachLeumi),
    HealthWithheld: amount(s.health),
    PensionContribution: amount(s.pensionContribution),
    StudyFundContribution: amount(s.studyFundContribution),
  }));
}

function buildSelfEmployedIncome(se = {}) {
  return wrap('SelfEmployedIncome', fields({
    BusinessRevenue: amount(se.businessRevenue),
    BusinessExpenses: amount(se.businessExpenses),
    NetIncome: amount(se.netIncome ?? ((+se.businessRevenue || 0) - (+se.businessExpenses || 0))),
    AdvancesPaid: amount(se.advancesPaid),
  }));
}

function buildOtherIncome(o = {}) {
  return wrap('OtherIncome', fields({
    InterestIncome: amount(o.interestIncome),
    DividendIncome: amount(o.dividendIncome),
    CapitalGains: amount(o.capitalGains),
    RentalIncome: amount(o.rentalIncome),
    ForeignIncome: amount(o.foreignIncome),
  }));
}

function buildDeductionsBlock(d = {}) {
  return wrap('Deductions', fields({
    Donations: amount(d.donations),
    LifeInsurance: amount(d.lifeInsurance),
    AdditionalPension: amount(d.additionalPension),
    AlimonyPaid: amount(d.alimonyPaid),
    Other: amount(d.other),
  }));
}

function buildCreditPointsBlock(cp = {}) {
  return wrap('CreditPoints', fields({
    BasePoints: amount(cp.basePoints),
    ChildrenPoints: amount(cp.childrenPoints),
    WorkingSpousePoints: amount(cp.workingSpousePoints),
    SingleParentPoints: amount(cp.singleParentPoints),
    TotalPoints: amount(cp.totalPoints),
  }));
}

function buildTaxCalculationBlock(tc = {}) {
  return wrap('TaxCalculation', fields({
    TaxableIncome: amount(tc.taxableIncome),
    GrossTax: amount(tc.grossTax),
    CreditPointsValue: amount(tc.creditPointsValue),
    NetTax: amount(tc.netTax),
    AdvancesAndWithholding: amount(tc.advancesAndWithholding),
    BalanceDue: amount(tc.balanceDue),
    RefundDue: amount(tc.refundDue),
  }));
}

// ═══════════════════════════════════════════════════════════════

function generate(data) {
  if (!data) throw new Error('form-1301: data is required');
  const fullName = [data.individual?.firstName, data.individual?.lastName].filter(Boolean).join(' ');
  const meta = buildMetaBlock({
    formCode: FORM_CODE,
    companyId: data.individual?.taxpayerId,
    companyName: fullName || undefined,
    taxYear: data.taxYear,
    periodStart: data.periodStart || (data.taxYear ? `${data.taxYear}-01-01` : undefined),
    periodEnd: data.periodEnd || (data.taxYear ? `${data.taxYear}-12-31` : undefined),
    submissionType: data.submission?.type || 'initial',
    submissionDate: data.submission?.date,
  });

  const inner =
    meta +
    buildIndividualBlock(data.individual) +
    buildSalaryIncome(data.salaryIncome || {}) +
    buildSelfEmployedIncome(data.selfEmployedIncome || {}) +
    buildOtherIncome(data.otherIncome || {}) +
    buildDeductionsBlock(data.deductions || {}) +
    buildCreditPointsBlock(data.creditPoints || {}) +
    buildTaxCalculationBlock(data.taxCalculation || {});

  return buildDocument(ROOT_TAG, FORM_CODE, inner);
}

function validate(data) {
  const errors = [];
  if (!data) {
    errors.push('form-1301: data is required');
    return errors;
  }
  errors.push(...requireFields(data, ['individual', 'taxYear']));
  if (data.individual) {
    errors.push(...requireFields(data.individual, ['taxpayerId', 'firstName', 'lastName'], 'individual.'));
    errors.push(...validateTaxIdField(data.individual, 'taxpayerId', 'individual.'));
    errors.push(...validateTaxIdField(data.individual, 'spouseId', 'individual.'));
    if (data.individual.maritalStatus &&
        !['single', 'married', 'divorced', 'widowed'].includes(data.individual.maritalStatus)) {
      errors.push("individual.maritalStatus: must be single|married|divorced|widowed");
    }
    if (data.individual.numChildren !== undefined && Number(data.individual.numChildren) < 0) {
      errors.push('individual.numChildren: must be >= 0');
    }
  }
  if (data.taxCalculation) {
    const bd = Number(data.taxCalculation.balanceDue || 0);
    const rd = Number(data.taxCalculation.refundDue || 0);
    if (bd > 0 && rd > 0) {
      errors.push('taxCalculation: cannot have both balanceDue and refundDue > 0');
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
