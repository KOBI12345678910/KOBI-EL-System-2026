/**
 * Tests for src/tax/form-builders.js
 *
 * Israeli annual tax forms: 1320, 6111, 1301, 30א
 * Corporate tax rate: 23% (2026)
 *
 * Fixtures mirror schema in supabase/migrations/005-annual-tax-module.sql
 *
 * Run: node --test test/form-builders.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildForm1320,
  buildForm6111,
  buildForm1301,
  buildForm30A,
} = require('../src/tax/form-builders.js');

// Access private helpers indirectly via module internals for helper tests.
// The helpers are not exported, so we test them through observable behavior
// of the builders (groupSum via revenueByProject, sum via various totals).

// ═══ FIXTURES ═══ (match 005-annual-tax-module.sql)

const FISCAL_YEAR = 2026;

const profile = {
  company_id: 'techno-kol-uzi',
  legal_name: 'Techno Kol Uzi Ltd.',
  company_name: 'Techno Kol',
  vat_file_number: '516123456',
  tax_file_number: '516123456',
  address_street: 'HaMelacha 10',
  address_city: 'Tel Aviv',
  address_postal: '6700000',
  phone: '03-1234567',
  email: 'tax@technokoluzi.co.il',
  fiscal_year_end_month: 12,
  accounting_method: 'accrual',
};

// Customer invoices → ₪1,000,000 revenue (one voided should be excluded)
const customerInvoices = [
  {
    id: 1,
    invoice_number: 'INV-001',
    customer_id: 10,
    customer_name: 'Municipality of Haifa',
    customer_tax_id: '500123456',
    project_id: 'PROJ-A',
    net_amount: 600000,
    vat_amount: 102000,
    gross_amount: 702000,
    amount_outstanding: 100000,
    status: 'issued',
  },
  {
    id: 2,
    invoice_number: 'INV-002',
    customer_id: 11,
    customer_name: 'Ashdod Port Authority',
    customer_tax_id: '500654321',
    project_id: 'PROJ-B',
    net_amount: 400000,
    vat_amount: 68000,
    gross_amount: 468000,
    amount_outstanding: 0,
    status: 'paid',
  },
  {
    // voided: must NOT be counted
    id: 3,
    invoice_number: 'INV-003',
    customer_id: 10,
    customer_name: 'Cancelled Deal',
    customer_tax_id: '500999999',
    project_id: 'PROJ-A',
    net_amount: 50000,
    vat_amount: 8500,
    gross_amount: 58500,
    amount_outstanding: 0,
    status: 'voided',
  },
];

// Tax invoices (input): ₪600,000 COGS + ₪0 assets
const taxInvoices = [
  {
    id: 1,
    direction: 'input',
    is_asset: false,
    net_amount: 350000,
    status: 'received',
  },
  {
    id: 2,
    direction: 'input',
    is_asset: false,
    net_amount: 250000,
    status: 'received',
  },
  {
    // voided: skipped
    id: 3,
    direction: 'input',
    is_asset: false,
    net_amount: 99999,
    status: 'voided',
  },
  {
    // output: skipped
    id: 4,
    direction: 'output',
    is_asset: false,
    net_amount: 1000000,
    status: 'issued',
  },
];

// totals (operating expenses + finalized tax figures supplied by caller)
const totals = {
  salaries: 60000,
  rent: 30000,
  utilities: 10000,
  depreciation: 0,
  other_expenses: 0,
  profit_before_tax: 300000,
  corporate_tax: 69000,           // 23% of 300k (2026 rate)
  profit_after_tax: 231000,
  cash: 150000,
};

const projects = [
  { id: 'PROJ-A', project_code: 'A-2026', name: 'Haifa Bridge', status: 'active' },
  { id: 'PROJ-B', project_code: 'B-2026', name: 'Ashdod Silo', status: 'active' },
];

// ════════════════════════════════════════════════════════════
// Form 1320 — Company annual return
// ════════════════════════════════════════════════════════════
describe('buildForm1320 — Israeli company annual return', () => {

  test('1. ₪1M revenue, ₪600k COGS, operating expenses → correct profit & tax', () => {
    const form = buildForm1320({
      fiscalYear: FISCAL_YEAR,
      profile,
      totals,
      projects,
      customerInvoices,
      taxInvoices,
    });

    assert.equal(form.formType, '1320');
    assert.equal(form.formVersion, '2026');

    // Revenue: 600k + 400k (voided excluded) = 1,000,000
    assert.equal(form.revenue.salesRevenue, 1_000_000);
    assert.equal(form.revenue.totalRevenue, 1_000_000);

    // COGS: 350k + 250k (voided/output excluded) = 600,000
    assert.equal(form.costOfGoodsSold.totalCogs, 600_000);
    assert.equal(form.costOfGoodsSold.purchases, 600_000);

    // Gross profit = 1,000,000 - 600,000 = 400,000
    assert.equal(form.profit.grossProfit, 400_000);

    // Operating profit = 1M - 600k - (60k+30k+10k) = 300,000
    assert.equal(form.profit.operatingProfit, 300_000);

    // Corporate tax 23% = 69,000 (supplied via totals)
    assert.equal(form.profit.corporateTax, 69_000);
    assert.equal(form.profit.profitBeforeTax, 300_000);
    assert.equal(form.profit.profitAfterTax, 231_000);
  });

  test('2. Loss scenario — tax never negative (caller-supplied 0)', () => {
    const lossTotals = {
      ...totals,
      profit_before_tax: -50_000,
      corporate_tax: 0,     // Per Israeli law: company loss → 0 tax (carried forward)
      profit_after_tax: -50_000,
    };

    const form = buildForm1320({
      fiscalYear: FISCAL_YEAR,
      profile,
      totals: lossTotals,
      projects: [],
      customerInvoices: [],
      taxInvoices: [],
    });

    assert.equal(form.profit.profitBeforeTax, -50_000);
    assert.equal(form.profit.corporateTax, 0);
    assert.ok(form.profit.corporateTax >= 0, 'tax must never be negative');
  });

  test('3. No data → structure returned, all zeros', () => {
    const form = buildForm1320({
      fiscalYear: FISCAL_YEAR,
      profile,           // profile required, cannot be omitted
      totals: {},
      projects: [],
      customerInvoices: [],
      taxInvoices: [],
    });

    assert.equal(form.formType, '1320');
    assert.equal(form.revenue.salesRevenue, 0);
    assert.equal(form.revenue.totalRevenue, 0);
    assert.equal(form.costOfGoodsSold.totalCogs, 0);
    assert.equal(form.operatingExpenses.totalExpenses, 0);
    assert.equal(form.profit.grossProfit, 0);
    assert.equal(form.profit.operatingProfit, 0);
    assert.equal(form.profit.corporateTax, 0);
    assert.equal(form.assets.totalAssets, 0);
    assert.equal(form.metadata.projectCount, 0);
    assert.equal(form.metadata.customerInvoiceCount, 0);
  });

  test('3b. Required parameters validated', () => {
    assert.throws(
      () => buildForm1320({ profile, totals: {} }),
      /fiscalYear is required/,
    );
    assert.throws(
      () => buildForm1320({ fiscalYear: FISCAL_YEAR, totals: {} }),
      /company tax profile is required/,
    );
  });

  test('3c. revenueByProject groups by project_id (exercises groupSum)', () => {
    const form = buildForm1320({
      fiscalYear: FISCAL_YEAR,
      profile,
      totals,
      projects,
      customerInvoices,
      taxInvoices,
    });
    // NOTE: groupSum does NOT apply the voided filter — documents current
    // behavior. PROJ-A keeps the voided 50k inside the per-project grouping.
    assert.equal(form.revenue.revenueByProject['PROJ-A'], 650_000);
    assert.equal(form.revenue.revenueByProject['PROJ-B'], 400_000);
  });
});

// ════════════════════════════════════════════════════════════
// Form 6111 — Financial statements (6111 line mapping)
// ════════════════════════════════════════════════════════════
describe('buildForm6111 — chart-of-accounts mapping', () => {

  test('4. Maps chart_of_accounts to 6111 lines', () => {
    const chartOfAccounts = [
      { account_code: '1000', account_name: 'Cash',           account_type: 'asset',   form_6111_line: '100' },
      { account_code: '1100', account_name: 'Bank Hapoalim',  account_type: 'asset',   form_6111_line: '100' },
      { account_code: '4000', account_name: 'Sales Revenue',  account_type: 'revenue', form_6111_line: '200' },
      { account_code: '5000', account_name: 'Materials',      account_type: 'cogs',    form_6111_line: '300' },
    ];

    const form = buildForm6111({
      fiscalYear: FISCAL_YEAR,
      profile,
      chartOfAccounts,
      journalEntries: [],
    });

    assert.equal(form.formType, '6111');
    assert.equal(form.formVersion, '2026');
    assert.equal(form.companyId, profile.company_id);

    // Three distinct lines: 100 (2 accts), 200 (1), 300 (1)
    assert.equal(form.lines.length, 3);

    const line100 = form.lines.find(l => l.line === '100');
    assert.ok(line100, 'line 100 must exist');
    assert.deepEqual(line100.accounts.sort(), ['1000', '1100']);
    assert.equal(line100.balance, 0,
      'BUG DOCUMENTED: balance initialized but never summed from journalEntries');

    const line200 = form.lines.find(l => l.line === '200');
    assert.deepEqual(line200.accounts, ['4000']);

    const line300 = form.lines.find(l => l.line === '300');
    assert.deepEqual(line300.accounts, ['5000']);

    // totals scaffold exists but is all zeros (not wired to data)
    assert.equal(form.totals.totalAssets, 0);
    assert.equal(form.totals.netProfit, 0);
    assert.ok(form.disclaimer.includes('REVIEW BEFORE FILING'));
  });

  test('5. Missing form_6111_line → account is skipped (documented behavior)', () => {
    const chartOfAccounts = [
      { account_code: '1000', account_name: 'Cash',    account_type: 'asset',   form_6111_line: '100' },
      { account_code: '9999', account_name: 'Orphan',  account_type: 'asset' /* no 6111 line */ },
      { account_code: '4000', account_name: 'Revenue', account_type: 'revenue', form_6111_line: '200' },
    ];

    const form = buildForm6111({
      fiscalYear: FISCAL_YEAR,
      profile,
      chartOfAccounts,
    });

    // Documented: accounts without form_6111_line are silently skipped (no error).
    // Only two lines appear, '9999' is dropped.
    assert.equal(form.lines.length, 2);
    const allAccounts = form.lines.flatMap(l => l.accounts);
    assert.ok(!allAccounts.includes('9999'),
      'account with no 6111 mapping must be skipped');
    assert.ok(allAccounts.includes('1000'));
    assert.ok(allAccounts.includes('4000'));
  });
});

// ════════════════════════════════════════════════════════════
// Form 1301 — Individual annual return
// ════════════════════════════════════════════════════════════
describe('buildForm1301 — Israeli individual annual return', () => {

  const taxpayer = {
    name: 'Kobi Eliyahu',
    tax_id: '012345678',
    address: 'Herzl 1, Tel Aviv',
  };

  test('6. Single income source: ₪200k salary, 2.25 credit points', () => {
    // 2026 credit point value ≈ ₪2,976/yr → 2.25 pts ≈ ₪6,696
    const POINT_VALUE_2026 = 2976;
    const creditAmount = POINT_VALUE_2026 * 2.25;

    const form = buildForm1301({
      fiscalYear: FISCAL_YEAR,
      taxpayer,
      incomeSources: [
        { type: 'salary', amount: 200_000, source: 'Techno Kol Uzi Ltd.', tax_withheld: 25_000 },
      ],
      deductions: [],
      credits: [
        { type: 'personal', amount: creditAmount, reference: '2.25 points' },
      ],
    });

    assert.equal(form.formType, '1301');
    assert.equal(form.taxpayer.id, '012345678');
    assert.equal(form.totalIncome, 200_000);
    assert.equal(form.totalDeductions, 0);
    assert.equal(form.computation.taxableIncome, 200_000);
    assert.equal(form.computation.grossIncome, 200_000);
    assert.equal(form.totalCredits, creditAmount);
    assert.equal(form.computation.creditsApplied, creditAmount);
    // NOTE: builder does not actually compute the income-tax bracket.
    // estimatedTaxLiability and finalTaxDue are hard-coded 0 (documented).
    assert.equal(form.computation.estimatedTaxLiability, 0);
    assert.equal(form.computation.finalTaxDue, 0);
  });

  test('7. Two income sources → summed', () => {
    const form = buildForm1301({
      fiscalYear: FISCAL_YEAR,
      taxpayer,
      incomeSources: [
        { type: 'salary',   amount: 180_000, source: 'Techno Kol',         tax_withheld: 22_000 },
        { type: 'business', amount:  70_000, source: 'Freelance Welding',  tax_withheld: 0     },
      ],
      deductions: [],
      credits: [],
    });

    assert.equal(form.totalIncome, 250_000);
    assert.equal(form.incomeSources.length, 2);
    assert.equal(form.computation.taxableIncome, 250_000);
  });

  test('8. Deductions reduce taxable income', () => {
    const form = buildForm1301({
      fiscalYear: FISCAL_YEAR,
      taxpayer,
      incomeSources: [{ type: 'salary', amount: 200_000, source: 'X', tax_withheld: 0 }],
      deductions: [
        { type: 'pension',        amount: 14_000, reference: 'Menorah' },
        { type: 'study_fund',     amount:  7_500, reference: 'Kranot Hishtalmut' },
        { type: 'life_insurance', amount:  3_000, reference: 'Migdal' },
      ],
      credits: [],
    });

    assert.equal(form.totalDeductions, 24_500);
    assert.equal(form.computation.taxableIncome, 175_500); // 200k - 24.5k
  });

  test('8b. Negative taxable income clamped to 0', () => {
    const form = buildForm1301({
      fiscalYear: FISCAL_YEAR,
      taxpayer,
      incomeSources: [{ type: 'salary', amount: 10_000, source: 'X', tax_withheld: 0 }],
      deductions:   [{ type: 'pension', amount: 50_000, reference: 'big' }],
      credits:      [],
    });
    assert.equal(form.computation.taxableIncome, 0,
      'Math.max(0, …) protection must clamp negatives');
  });

  test('8c. Missing tax_id throws', () => {
    assert.throws(
      () => buildForm1301({
        fiscalYear: FISCAL_YEAR,
        taxpayer: { name: 'No ID' },
        incomeSources: [],
      }),
      /tax_id/,
    );
  });
});

// ════════════════════════════════════════════════════════════
// Form 30א — Manufacturer report
// ════════════════════════════════════════════════════════════
describe('buildForm30A — manufacturer report', () => {

  test('9. Raw materials 500k, finished goods 300k, labor 200k → structured output', () => {
    const form = buildForm30A({
      fiscalYear: FISCAL_YEAR,
      profile,
      production:    { units: 10_000, soldUnits: 8_500, inventoryUnits: 1_500 },
      rawMaterials:  { opening: 100_000, purchases: 500_000, consumed: 450_000, closing: 150_000 },
      finishedGoods: { opening:  50_000, produced:  300_000, sold:     280_000, closing: 70_000 },
      labor:         { direct:  200_000, indirect:  40_000,  totalEmployees: 12, foreignWorkers: 2 },
    });

    assert.equal(form.formType, '30a');
    assert.equal(form.formVersion, '2026');
    assert.equal(form.companyId, profile.company_id);
    assert.equal(form.fiscalYear, FISCAL_YEAR);

    assert.equal(form.production.unitsProduced, 10_000);
    assert.equal(form.production.unitsSold, 8_500);
    assert.equal(form.production.unitsInInventory, 1_500);

    assert.equal(form.rawMaterials.openingBalance, 100_000);
    assert.equal(form.rawMaterials.purchases, 500_000);
    assert.equal(form.rawMaterials.consumed, 450_000);
    assert.equal(form.rawMaterials.closingBalance, 150_000);

    assert.equal(form.finishedGoods.openingBalance, 50_000);
    assert.equal(form.finishedGoods.produced, 300_000);
    assert.equal(form.finishedGoods.sold, 280_000);
    assert.equal(form.finishedGoods.closingBalance, 70_000);

    assert.equal(form.labor.directLaborCost, 200_000);
    assert.equal(form.labor.indirectLaborCost, 40_000);
    assert.equal(form.labor.totalEmployees, 12);
    assert.equal(form.labor.foreignWorkers, 2);
  });

  test('10. Inventory change calculation (opening + purchases - consumed = closing)', () => {
    const rawMaterials = { opening: 100_000, purchases: 500_000, consumed: 450_000, closing: 150_000 };
    const form = buildForm30A({
      fiscalYear: FISCAL_YEAR,
      profile,
      rawMaterials,
      finishedGoods: { opening: 50_000, produced: 300_000, sold: 280_000, closing: 70_000 },
      labor: {},
    });

    // Raw materials inventory flow identity
    const rmExpectedClosing =
      rawMaterials.opening + rawMaterials.purchases - rawMaterials.consumed;
    assert.equal(rmExpectedClosing, 150_000);
    assert.equal(form.rawMaterials.closingBalance, rmExpectedClosing);

    // Finished goods inventory flow: opening + produced - sold = closing
    const fgExpectedClosing = 50_000 + 300_000 - 280_000;
    assert.equal(fgExpectedClosing, 70_000);
    assert.equal(form.finishedGoods.closingBalance, fgExpectedClosing);

    // NOTE: builder does NOT recompute these identities — it just passes them through.
    // Consistency must be enforced upstream.
  });

  test('10b. Empty inputs → zero-filled structure, no crash', () => {
    const form = buildForm30A({
      fiscalYear: FISCAL_YEAR,
      profile,
    });
    assert.equal(form.production.unitsProduced, 0);
    assert.equal(form.rawMaterials.openingBalance, 0);
    assert.equal(form.finishedGoods.sold, 0);
    assert.equal(form.labor.directLaborCost, 0);
    assert.equal(form.labor.totalEmployees, 0);
  });
});

// ════════════════════════════════════════════════════════════
// Helpers (tested via observable builder behavior)
// ════════════════════════════════════════════════════════════
describe('helpers — sum() and groupSum()', () => {

  test('11. sum([{a:1},{a:2},{a:3}], "a") === 6 (via tax invoice COGS path)', () => {
    const taxInvoices = [
      { direction: 'input', is_asset: false, net_amount: 1, status: 'ok' },
      { direction: 'input', is_asset: false, net_amount: 2, status: 'ok' },
      { direction: 'input', is_asset: false, net_amount: 3, status: 'ok' },
    ];
    const form = buildForm1320({
      fiscalYear: FISCAL_YEAR,
      profile,
      totals: {},
      customerInvoices: [],
      taxInvoices,
      projects: [],
    });
    assert.equal(form.costOfGoodsSold.totalCogs, 6);
  });

  test('12. sum with filter — voided invoices excluded', () => {
    const customerInvoices = [
      { net_amount: 100, status: 'issued', project_id: 'P1' },
      { net_amount: 200, status: 'paid',   project_id: 'P1' },
      { net_amount: 999, status: 'voided', project_id: 'P1' },  // filtered out
    ];
    const form = buildForm1320({
      fiscalYear: FISCAL_YEAR,
      profile,
      totals: {},
      customerInvoices,
      taxInvoices: [],
      projects: [],
    });
    assert.equal(form.revenue.salesRevenue, 300);
  });

  test('13. groupSum — groups by key', () => {
    const customerInvoices = [
      { net_amount: 100, status: 'issued', project_id: 'ALPHA' },
      { net_amount: 250, status: 'paid',   project_id: 'ALPHA' },
      { net_amount: 400, status: 'issued', project_id: 'BETA'  },
      { net_amount:  50, status: 'issued', project_id: null    }, // → '_none'
    ];
    const form = buildForm1320({
      fiscalYear: FISCAL_YEAR,
      profile,
      totals: {},
      customerInvoices,
      taxInvoices: [],
      projects: [],
    });
    assert.equal(form.revenue.revenueByProject.ALPHA, 350);
    assert.equal(form.revenue.revenueByProject.BETA, 400);
    assert.equal(form.revenue.revenueByProject._none, 50);
  });

  test('13b. sum handles null/undefined arrays → 0', () => {
    const form = buildForm1320({
      fiscalYear: FISCAL_YEAR,
      profile,
      totals: {},
      customerInvoices: undefined,
      taxInvoices: undefined,
      projects: undefined,
    });
    assert.equal(form.revenue.salesRevenue, 0);
    assert.equal(form.costOfGoodsSold.totalCogs, 0);
    assert.equal(form.metadata.projectCount, 0);
    assert.deepEqual(form.revenue.revenueByProject, {});
  });
});

// ════════════════════════════════════════════════════════════
// Rounding & edge cases
// ════════════════════════════════════════════════════════════
describe('rounding and edge cases', () => {

  test('14. Money values survive 2-decimal arithmetic (documents no explicit rounding)', () => {
    // 123.45 + 0.10 + 0.05 = 123.60 exactly — no floating-point drift at this scale
    const customerInvoices = [
      { net_amount: 123.45, status: 'issued', project_id: 'X' },
      { net_amount:   0.10, status: 'issued', project_id: 'X' },
      { net_amount:   0.05, status: 'issued', project_id: 'X' },
    ];
    const form = buildForm1320({
      fiscalYear: FISCAL_YEAR,
      profile,
      totals: {},
      customerInvoices,
      taxInvoices: [],
      projects: [],
    });

    // Round to 2 decimals for comparison because builder does not round internally
    const rounded = Math.round(form.revenue.salesRevenue * 100) / 100;
    assert.equal(rounded, 123.60);
    // BUG DOCUMENTED: builder does NOT explicitly round to 2 decimals.
    // Callers must round before persisting to NUMERIC(14,2) columns.
  });

  test('15. Empty arrays everywhere → no crash', () => {
    assert.doesNotThrow(() => {
      buildForm1320({
        fiscalYear: FISCAL_YEAR,
        profile,
        totals: {},
        projects: [],
        customerInvoices: [],
        taxInvoices: [],
      });
    });

    assert.doesNotThrow(() => {
      buildForm6111({
        fiscalYear: FISCAL_YEAR,
        profile,
        chartOfAccounts: [],
        journalEntries: [],
      });
    });

    assert.doesNotThrow(() => {
      buildForm1301({
        fiscalYear: FISCAL_YEAR,
        taxpayer: { name: 'A', tax_id: '000000000' },
        incomeSources: [],
        deductions: [],
        credits: [],
      });
    });

    assert.doesNotThrow(() => {
      buildForm30A({
        fiscalYear: FISCAL_YEAR,
        profile,
      });
    });
  });

  test('15b. All builders produce ISO preparedAt timestamp', () => {
    const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
    const f1 = buildForm1320({ fiscalYear: FISCAL_YEAR, profile, totals: {}, customerInvoices: [], taxInvoices: [], projects: [] });
    const f2 = buildForm6111({ fiscalYear: FISCAL_YEAR, profile, chartOfAccounts: [] });
    const f3 = buildForm1301({ fiscalYear: FISCAL_YEAR, taxpayer: { tax_id: '1' }, incomeSources: [], deductions: [], credits: [] });
    const f4 = buildForm30A({ fiscalYear: FISCAL_YEAR, profile });
    assert.match(f1.preparedAt, iso);
    assert.match(f2.preparedAt, iso);
    assert.match(f3.preparedAt, iso);
    assert.match(f4.preparedAt, iso);
  });
});
