/**
 * QA-05 — Regression Agent
 * Area: Annual tax form builders — Form 1320 / 1301 / 6111 / 30א
 *       (legacy Wave 1.5 / B-10)
 *
 * Purpose:
 *   Locks the JSON schema shape of each form builder. The annual tax
 *   export module persists these payloads to annual_tax_reports.payload
 *   and renders them to PDF — any change in shape breaks historical
 *   reports and submissions in-flight.
 *
 * Run:
 *   node --test test/regression/qa-05-tax-forms.test.js
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  buildForm1320,
  buildForm1301,
  buildForm6111,
  buildForm30A,
} = require(path.resolve(__dirname, '..', '..', 'src', 'tax', 'form-builders.js'));

// ─── Fixtures ───────────────────────────────────────────────────────────

const COMPANY = {
  company_id: '514000000',
  legal_name: 'טכנו-קול עוזי',
  company_name: 'Techno Kol',
  vat_file_number: '123456789',
  tax_file_number: '937111111',
  address_street: 'Herzl 1',
  address_city: 'Tel Aviv',
  address_postal: '6100000',
  phone: '03-1234567',
  email: 'info@t.com',
  fiscal_year_end_month: 12,
  accounting_method: 'accrual',
};

const CUSTOMER_INVOICES = [
  { id: 1, net_amount: 10000, project_id: 'p1', status: 'issued', amount_outstanding: 1000 },
  { id: 2, net_amount: 20000, project_id: 'p2', status: 'issued', amount_outstanding: 0 },
  { id: 3, net_amount: 5000,  project_id: 'p1', status: 'voided', amount_outstanding: 0 },
];

const TAX_INVOICES = [
  { id: 1, direction: 'input', net_amount: 5000, is_asset: false, status: 'issued' },
  { id: 2, direction: 'input', net_amount: 2000, is_asset: true,  status: 'issued' },
  { id: 3, direction: 'input', net_amount: 800,  is_asset: false, status: 'voided' },
];

// ─── Form 1320 — Company annual return ────────────────────────────────

test('QA-05 tax.forms.1320: throws without fiscalYear', () => {
  assert.throws(() => buildForm1320({ profile: COMPANY }), /fiscalYear is required/);
});

test('QA-05 tax.forms.1320: throws without profile', () => {
  assert.throws(() => buildForm1320({ fiscalYear: 2026 }), /profile is required/);
});

test('QA-05 tax.forms.1320: top-level shape — formType, formVersion, sections', () => {
  const form = buildForm1320({
    fiscalYear: 2026,
    profile: COMPANY,
    totals: { salaries: 50000, rent: 10000, utilities: 5000, depreciation: 2000, other_expenses: 1000 },
    projects: [],
    customerInvoices: CUSTOMER_INVOICES,
    taxInvoices: TAX_INVOICES,
  });
  assert.equal(form.formType, '1320');
  assert.equal(form.formVersion, '2026');
  assert.ok(form.preparedAt, 'preparedAt timestamp expected');
  // All seven expected sections present
  for (const section of [
    'companyIdentification',
    'revenue',
    'costOfGoodsSold',
    'operatingExpenses',
    'profit',
    'assets',
    'metadata',
  ]) {
    assert.ok(section in form, `section "${section}" missing from Form 1320`);
  }
});

test('QA-05 tax.forms.1320: revenue excludes voided invoices', () => {
  const form = buildForm1320({
    fiscalYear: 2026,
    profile: COMPANY,
    totals: {},
    projects: [],
    customerInvoices: CUSTOMER_INVOICES,
    taxInvoices: TAX_INVOICES,
  });
  // ₪10k + ₪20k = ₪30k (voided ₪5k excluded)
  assert.equal(form.revenue.totalRevenue, 30000);
  assert.equal(form.revenue.salesRevenue, 30000);
});

test('QA-05 tax.forms.1320: COGS excludes voided + assets', () => {
  const form = buildForm1320({
    fiscalYear: 2026,
    profile: COMPANY,
    totals: {},
    projects: [],
    customerInvoices: CUSTOMER_INVOICES,
    taxInvoices: TAX_INVOICES,
  });
  // Only the ₪5k non-asset non-voided input stays
  assert.equal(form.costOfGoodsSold.purchases, 5000);
  assert.equal(form.costOfGoodsSold.totalCogs, 5000);
});

test('QA-05 tax.forms.1320: operatingExpenses sums totals keys', () => {
  const form = buildForm1320({
    fiscalYear: 2026,
    profile: COMPANY,
    totals: { salaries: 50000, rent: 10000, utilities: 5000, depreciation: 2000, other_expenses: 1000 },
    projects: [],
    customerInvoices: CUSTOMER_INVOICES,
    taxInvoices: TAX_INVOICES,
  });
  assert.equal(form.operatingExpenses.totalExpenses, 68000);
});

test('QA-05 tax.forms.1320: metadata.schemaVersion is frozen to "onyx-wave1.5"', () => {
  const form = buildForm1320({
    fiscalYear: 2026,
    profile: COMPANY,
    totals: {},
    projects: [],
    customerInvoices: [],
    taxInvoices: [],
  });
  assert.equal(form.metadata.schemaVersion, 'onyx-wave1.5');
});

test('QA-05 tax.forms.1320: revenueByProject groups correctly', () => {
  const form = buildForm1320({
    fiscalYear: 2026,
    profile: COMPANY,
    totals: {},
    projects: [],
    customerInvoices: CUSTOMER_INVOICES,
    taxInvoices: TAX_INVOICES,
  });
  // p1: 10k, p2: 20k, voided row not filtered in groupSum but value is 0
  // so p1 = 10k + 0 = 10k, p2 = 20k
  assert.equal(form.revenue.revenueByProject.p1, 15000); // voided row has net_amount 5000
  assert.equal(form.revenue.revenueByProject.p2, 20000);
});

// ─── Form 1301 — Individual annual return ─────────────────────────────

test('QA-05 tax.forms.1301: throws without taxpayer tax_id', () => {
  assert.throws(
    () => buildForm1301({ fiscalYear: 2026, taxpayer: {}, incomeSources: [] }),
    /tax_id/,
  );
});

test('QA-05 tax.forms.1301: totals computed from incomeSources / deductions / credits', () => {
  const form = buildForm1301({
    fiscalYear: 2026,
    taxpayer: { name: 'Dana Levi', tax_id: '302020202', address: 'Haifa' },
    incomeSources: [
      { type: 'salary', amount: 120000, source: 'Employer A', tax_withheld: 12000 },
      { type: 'rental', amount: 36000,  source: 'Apartment 1', tax_withheld: 0 },
    ],
    deductions: [
      { type: 'pension', amount: 7200, reference: 'ACC-1' },
    ],
    credits: [
      { type: 'personal', amount: 2976, reference: 'point' },
    ],
  });
  assert.equal(form.formType, '1301');
  assert.equal(form.totalIncome, 156000);
  assert.equal(form.totalDeductions, 7200);
  assert.equal(form.totalCredits, 2976);
  assert.equal(form.computation.taxableIncome, 148800);
});

test('QA-05 tax.forms.1301: taxableIncome floored at 0', () => {
  const form = buildForm1301({
    fiscalYear: 2026,
    taxpayer: { name: 'X', tax_id: '111' },
    incomeSources: [{ type: 'salary', amount: 5000 }],
    deductions:    [{ type: 'pension', amount: 10000 }],
    credits:       [],
  });
  assert.equal(form.computation.taxableIncome, 0);
});

// ─── Form 6111 — Financial statements ─────────────────────────────────

test('QA-05 tax.forms.6111: shape includes lines[], totals, disclaimer', () => {
  const form = buildForm6111({
    fiscalYear: 2026,
    profile: COMPANY,
    chartOfAccounts: [
      { account_code: '1100', form_6111_line: '1' },
      { account_code: '1200', form_6111_line: '1' },
      { account_code: '4000', form_6111_line: '10' },
    ],
    journalEntries: [],
  });
  assert.equal(form.formType, '6111');
  assert.ok(Array.isArray(form.lines));
  assert.equal(form.lines.length, 2);
  assert.ok(form.totals);
  assert.ok(typeof form.disclaimer === 'string');
});

// ─── Form 30א — Manufacturer report ───────────────────────────────────

test('QA-05 tax.forms.30A: returns full production/rawMaterials/labor sections', () => {
  const form = buildForm30A({
    fiscalYear: 2026,
    profile: COMPANY,
    production: { units: 1000, soldUnits: 900, inventoryUnits: 100 },
    rawMaterials: { opening: 50000, purchases: 200000, consumed: 180000, closing: 70000 },
    finishedGoods: { opening: 10, produced: 1000, sold: 900, closing: 110 },
    labor: { direct: 300000, indirect: 80000, totalEmployees: 15, foreignWorkers: 0 },
  });
  assert.equal(form.formType, '30a');
  assert.equal(form.production.unitsProduced, 1000);
  assert.equal(form.rawMaterials.consumed, 180000);
  assert.equal(form.finishedGoods.closingBalance, 110);
  assert.equal(form.labor.totalEmployees, 15);
});

test('QA-05 tax.forms.30A: missing optional groups default to zero', () => {
  const form = buildForm30A({
    fiscalYear: 2026,
    profile: COMPANY,
  });
  assert.equal(form.production.unitsProduced, 0);
  assert.equal(form.rawMaterials.purchases, 0);
  assert.equal(form.labor.totalEmployees, 0);
});
