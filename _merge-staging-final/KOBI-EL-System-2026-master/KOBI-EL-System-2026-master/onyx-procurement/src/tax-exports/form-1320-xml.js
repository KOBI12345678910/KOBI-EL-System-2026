/**
 * form-1320-xml.js — טופס 1320 (דוח שנתי לחברה) in XML format.
 * Agent 70 — Tax Authority XML export formats (Wave 2026)
 *
 * Generates the annual corporate tax return (Report1320) in the XML
 * shape the רשות המסים submission portal accepts. Simulated XSD validation
 * performs structural checks only — before real submission cross-check
 * against the official schema pack and your accountant.
 *
 * Usage:
 *   const f1320 = require('./form-1320-xml');
 *   const xml = f1320.generate(data);
 *   const errors = f1320.validate(data);
 *   const { path, bytes } = f1320.writeToFile(data, '/tmp/1320.xml');
 */

'use strict';

const {
  el, wrap, fields, buildDocument, buildMetaBlock, writeXmlFile,
  isoDate, amount, integer, requireFields, validateTaxIdField,
} = require('./_xml-common');

const FORM_CODE = '1320';
const ROOT_TAG = 'Report1320';

// ═══════════════════════════════════════════════════════════════
// Section builders
// ═══════════════════════════════════════════════════════════════

function buildIncomeSection(income = {}) {
  const inner = fields({
    SalesRevenue: amount(income.sales_revenue),
    ServiceRevenue: amount(income.service_revenue),
    InterestIncome: amount(income.interest_income),
    DividendIncome: amount(income.dividend_income),
    CapitalGains: amount(income.capital_gains),
    OtherIncome: amount(income.other_income),
    TotalIncome: amount(
      (+income.sales_revenue || 0) +
      (+income.service_revenue || 0) +
      (+income.interest_income || 0) +
      (+income.dividend_income || 0) +
      (+income.capital_gains || 0) +
      (+income.other_income || 0)
    ),
  });
  return wrap('Income', inner);
}

function buildExpensesSection(expenses = {}) {
  const inner = fields({
    CostOfGoodsSold: amount(expenses.cogs),
    SalariesAndWages: amount(expenses.salaries),
    Rent: amount(expenses.rent),
    Depreciation: amount(expenses.depreciation),
    Marketing: amount(expenses.marketing),
    ProfessionalFees: amount(expenses.professional_fees),
    InterestExpense: amount(expenses.interest_expense),
    OtherExpenses: amount(expenses.other_expenses),
    TotalExpenses: amount(
      (+expenses.cogs || 0) +
      (+expenses.salaries || 0) +
      (+expenses.rent || 0) +
      (+expenses.depreciation || 0) +
      (+expenses.marketing || 0) +
      (+expenses.professional_fees || 0) +
      (+expenses.interest_expense || 0) +
      (+expenses.other_expenses || 0)
    ),
  });
  return wrap('Expenses', inner);
}

function buildDeductionsSection(deductions = {}) {
  const items = (deductions.items || []).map(item =>
    wrap('DeductionItem', fields({
      Code: item.code,
      Description: item.description,
      Amount: amount(item.amount),
    }))
  ).join('');
  const inner =
    fields({
      CarryForwardLosses: amount(deductions.carry_forward_losses),
      ResearchAndDev: amount(deductions.research_and_dev),
      Donations: amount(deductions.donations),
      TotalDeductions: amount(deductions.total_deductions),
    }) + items;
  return wrap('Deductions', inner);
}

function buildCorporateTaxSection(tax = {}) {
  const inner = fields({
    TaxableIncome: amount(tax.taxable_income),
    TaxRate: amount(tax.tax_rate),
    TaxBeforeCredits: amount(tax.tax_before_credits),
    ForeignTaxCredit: amount(tax.foreign_tax_credit),
    OtherCredits: amount(tax.other_credits),
    TaxPayable: amount(tax.tax_payable),
    AdvancesPaid: amount(tax.advances_paid),
    WithholdingPaid: amount(tax.withholding_paid),
    NetTaxDue: amount(tax.net_tax_due),
  });
  return wrap('CorporateTax', inner);
}

// ═══════════════════════════════════════════════════════════════
// Main generate
// ═══════════════════════════════════════════════════════════════

/**
 * @param {Object} data
 * @param {string} data.companyId          ח"פ
 * @param {string} [data.companyName]
 * @param {string|number} data.taxYear
 * @param {Object} data.income
 * @param {Object} data.expenses
 * @param {Object} [data.deductions]
 * @param {Object} data.corporateTax
 * @param {Object} [data.submission]
 * @returns {string} UTF-8 XML (BOM included)
 */
function generate(data) {
  if (!data) throw new Error('form-1320: data is required');
  const meta = buildMetaBlock({
    formCode: FORM_CODE,
    companyId: data.companyId,
    companyName: data.companyName,
    taxYear: data.taxYear,
    periodStart: data.periodStart || (data.taxYear ? `${data.taxYear}-01-01` : undefined),
    periodEnd: data.periodEnd || (data.taxYear ? `${data.taxYear}-12-31` : undefined),
    submissionType: data.submission?.type || 'initial',
    submissionDate: data.submission?.date,
  });

  const inner =
    meta +
    buildIncomeSection(data.income) +
    buildExpensesSection(data.expenses) +
    buildDeductionsSection(data.deductions) +
    buildCorporateTaxSection(data.corporateTax);

  return buildDocument(ROOT_TAG, FORM_CODE, inner);
}

// ═══════════════════════════════════════════════════════════════
// Validation (simulated XSD — basic structural checks only)
// ═══════════════════════════════════════════════════════════════

function validate(data) {
  const errors = [];
  if (!data) {
    errors.push('form-1320: data is required');
    return errors;
  }
  errors.push(...requireFields(data, ['companyId', 'taxYear', 'income', 'expenses', 'corporateTax']));
  errors.push(...validateTaxIdField(data, 'companyId'));

  if (data.taxYear && (data.taxYear < 1990 || data.taxYear > 2100)) {
    errors.push('taxYear: out of range (1990-2100)');
  }

  if (data.income && typeof data.income !== 'object') {
    errors.push('income: must be an object');
  }
  if (data.expenses && typeof data.expenses !== 'object') {
    errors.push('expenses: must be an object');
  }
  if (data.corporateTax) {
    if (data.corporateTax.tax_rate !== undefined) {
      const r = Number(data.corporateTax.tax_rate);
      if (!(r >= 0 && r <= 100)) errors.push('corporateTax.tax_rate: must be 0-100');
    }
    if (data.corporateTax.tax_payable !== undefined && Number(data.corporateTax.tax_payable) < 0) {
      errors.push('corporateTax.tax_payable: must be >= 0');
    }
  }

  return errors;
}

// ═══════════════════════════════════════════════════════════════
// File writer
// ═══════════════════════════════════════════════════════════════

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
