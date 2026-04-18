/**
 * QA-02 — Unit tests (edge cases) for tax/form-builders.js
 *
 * Scope:
 *   - Form 1320 (annual return for companies)
 *   - Form 1301 (annual return for individuals)
 *   - Form 6111 (financial statements)
 *   - Form 30א (manufacturer report)
 *
 * Edge cases:
 *   - null / undefined / empty arrays
 *   - negative amounts (credit notes, refunds)
 *   - Extreme values (₪9,999,999.99)
 *   - voided / draft invoices filter correctness
 *   - Float precision on summation
 *   - Missing profile / taxpayer fields
 *   - groupSum behavior for unassigned project
 *
 * ADDITIVE to test/form-builders.test.js — both must pass.
 *
 * Run with: node --test test/unit/qa-02-annual-tax.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  buildForm1320,
  buildForm1301,
  buildForm6111,
  buildForm30A,
} = require(path.resolve(__dirname, '..', '..', 'src', 'tax', 'form-builders.js'));

const FISCAL_YEAR = 2026;

function makeProfile(overrides = {}) {
  return {
    company_id: 'techno-kol-qa',
    legal_name: 'Techno Kol QA Ltd',
    company_name: 'Techno Kol QA',
    vat_file_number: '516000001',
    tax_file_number: '516000001',
    address_street: 'HaMelacha 1',
    address_city: 'Tel Aviv',
    address_postal: '6700000',
    phone: '03-0000000',
    email: 'qa@example.com',
    fiscal_year_end_month: 12,
    accounting_method: 'accrual',
    ...overrides,
  };
}

// ═════════════════════════════════════════════════════════════
// SECTION 1: buildForm1320 — input validation
// ═════════════════════════════════════════════════════════════

describe('QA-02.AT.1 buildForm1320 — validation & edges', () => {
  test('1.01 missing fiscalYear throws', () => {
    assert.throws(
      () => buildForm1320({ profile: makeProfile() }),
      /fiscalYear/,
    );
  });

  test('1.02 missing profile throws', () => {
    assert.throws(
      () => buildForm1320({ fiscalYear: FISCAL_YEAR }),
      /company tax profile/,
    );
  });

  test('1.03 empty invoices → zero revenue, zero COGS', () => {
    const f = buildForm1320({
      fiscalYear: FISCAL_YEAR,
      profile: makeProfile(),
      customerInvoices: [],
      taxInvoices: [],
    });
    assert.equal(f.revenue.salesRevenue, 0);
    assert.equal(f.revenue.totalRevenue, 0);
    assert.equal(f.costOfGoodsSold.totalCogs, 0);
    assert.equal(f.profit.grossProfit, 0);
  });

  test('1.04 voided invoice excluded from revenue', () => {
    const f = buildForm1320({
      fiscalYear: FISCAL_YEAR,
      profile: makeProfile(),
      customerInvoices: [
        { id: 1, net_amount: 1000, status: 'issued' },
        { id: 2, net_amount: 500, status: 'voided' },  // excluded
        { id: 3, net_amount: 2000, status: 'paid' },
      ],
      taxInvoices: [],
    });
    assert.equal(f.revenue.salesRevenue, 3000);
  });

  test('1.05 asset purchases counted separately from COGS', () => {
    const f = buildForm1320({
      fiscalYear: FISCAL_YEAR,
      profile: makeProfile(),
      customerInvoices: [],
      taxInvoices: [
        { direction: 'input', is_asset: false, net_amount: 1000, status: 'received' },
        { direction: 'input', is_asset: true, net_amount: 50000, status: 'received' },
      ],
    });
    assert.equal(f.costOfGoodsSold.purchases, 1000);
    assert.equal(f.assets.fixedAssets, 50000);
  });

  test('1.06 output invoices (direction=output) NOT counted as COGS', () => {
    const f = buildForm1320({
      fiscalYear: FISCAL_YEAR,
      profile: makeProfile(),
      customerInvoices: [],
      taxInvoices: [
        { direction: 'output', is_asset: false, net_amount: 99999, status: 'issued' },
      ],
    });
    assert.equal(f.costOfGoodsSold.purchases, 0);
  });

  test('1.07 voided tax invoice excluded from purchases', () => {
    const f = buildForm1320({
      fiscalYear: FISCAL_YEAR,
      profile: makeProfile(),
      customerInvoices: [],
      taxInvoices: [
        { direction: 'input', is_asset: false, net_amount: 1000, status: 'received' },
        { direction: 'input', is_asset: false, net_amount: 500, status: 'voided' },
      ],
    });
    assert.equal(f.costOfGoodsSold.purchases, 1000);
  });

  test('1.08 revenueByProject groups correctly, unassigned -> _none', () => {
    const f = buildForm1320({
      fiscalYear: FISCAL_YEAR,
      profile: makeProfile(),
      customerInvoices: [
        { id: 1, net_amount: 1000, project_id: 'A', status: 'issued' },
        { id: 2, net_amount: 2000, project_id: 'A', status: 'issued' },
        { id: 3, net_amount: 500,  project_id: 'B', status: 'issued' },
        { id: 4, net_amount: 300,  project_id: null, status: 'issued' },
      ],
      taxInvoices: [],
    });
    assert.equal(f.revenue.revenueByProject.A, 3000);
    assert.equal(f.revenue.revenueByProject.B, 500);
    assert.equal(f.revenue.revenueByProject._none, 300);
  });

  test('1.09 float precision — sum of many 0.1 values', () => {
    const invoices = Array.from({ length: 100 }, (_, i) => ({
      id: i,
      net_amount: 0.1,
      status: 'issued',
    }));
    const f = buildForm1320({
      fiscalYear: FISCAL_YEAR,
      profile: makeProfile(),
      customerInvoices: invoices,
      taxInvoices: [],
    });
    // 100 * 0.1 ≈ 10 but float sum = 9.999999999...
    // Document the float-precision surface: sum may not equal 10 exactly
    assert.ok(Math.abs(f.revenue.salesRevenue - 10) < 1e-9);
  });

  test('1.10 extreme revenue ₪9,999,999.99', () => {
    const f = buildForm1320({
      fiscalYear: FISCAL_YEAR,
      profile: makeProfile(),
      customerInvoices: [
        { id: 1, net_amount: 9_999_999.99, status: 'issued' },
      ],
      taxInvoices: [],
    });
    assert.equal(f.revenue.salesRevenue, 9_999_999.99);
    assert.ok(Number.isFinite(f.profit.grossProfit));
  });

  test('1.11 negative net_amount (credit note) deducted correctly', () => {
    const f = buildForm1320({
      fiscalYear: FISCAL_YEAR,
      profile: makeProfile(),
      customerInvoices: [
        { id: 1, net_amount: 10000, status: 'issued' },
        { id: 2, net_amount: -2000, status: 'issued' }, // credit note
      ],
      taxInvoices: [],
    });
    assert.equal(f.revenue.salesRevenue, 8000);
  });

  test('1.12 amount_outstanding sum used for accounts receivable', () => {
    const f = buildForm1320({
      fiscalYear: FISCAL_YEAR,
      profile: makeProfile(),
      customerInvoices: [
        { id: 1, net_amount: 10000, amount_outstanding: 5000, status: 'issued' },
        { id: 2, net_amount: 20000, amount_outstanding: 10000, status: 'paid' },
        { id: 3, net_amount: 5000, amount_outstanding: 5000, status: 'voided' }, // excluded
      ],
      taxInvoices: [],
    });
    assert.equal(f.assets.accountsReceivable, 15000);
  });

  test('1.13 operatingExpenses.totalExpenses sums individual lines', () => {
    const f = buildForm1320({
      fiscalYear: FISCAL_YEAR,
      profile: makeProfile(),
      totals: {
        salaries: 100000,
        rent: 50000,
        utilities: 20000,
        depreciation: 15000,
        other_expenses: 5000,
      },
      customerInvoices: [],
      taxInvoices: [],
    });
    assert.equal(f.operatingExpenses.totalExpenses, 190000);
  });

  test('1.14 projectCount correctly counted', () => {
    const f = buildForm1320({
      fiscalYear: FISCAL_YEAR,
      profile: makeProfile(),
      projects: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }],
      customerInvoices: [],
      taxInvoices: [],
    });
    assert.equal(f.metadata.projectCount, 3);
  });

  test('1.15 formType and preparedAt are populated', () => {
    const f = buildForm1320({
      fiscalYear: FISCAL_YEAR,
      profile: makeProfile(),
      customerInvoices: [],
      taxInvoices: [],
    });
    assert.equal(f.formType, '1320');
    assert.equal(f.formVersion, '2026');
    assert.ok(f.preparedAt);
    // Should be ISO 8601
    assert.ok(new Date(f.preparedAt).toString() !== 'Invalid Date');
  });
});

// ═════════════════════════════════════════════════════════════
// SECTION 2: buildForm1301 — individual return
// ═════════════════════════════════════════════════════════════

describe('QA-02.AT.2 buildForm1301 — validation & edges', () => {
  test('2.01 missing taxpayer.tax_id throws', () => {
    assert.throws(
      () => buildForm1301({ fiscalYear: FISCAL_YEAR, taxpayer: {} }),
      /tax_id/,
    );
  });

  test('2.02 empty incomeSources -> totalIncome=0', () => {
    const f = buildForm1301({
      fiscalYear: FISCAL_YEAR,
      taxpayer: { tax_id: '000000018', name: 'QA Test' },
      incomeSources: [],
      deductions: [],
      credits: [],
    });
    assert.equal(f.totalIncome, 0);
    assert.equal(f.computation.taxableIncome, 0);
  });

  test('2.03 deductions exceeding income floor taxable at 0', () => {
    const f = buildForm1301({
      fiscalYear: FISCAL_YEAR,
      taxpayer: { tax_id: '000000018' },
      incomeSources: [{ type: 'salary', amount: 50000 }],
      deductions: [{ type: 'pension', amount: 80000 }], // exceeds income
      credits: [],
    });
    assert.equal(f.computation.taxableIncome, 0);
  });

  test('2.04 multiple income sources sum correctly', () => {
    const f = buildForm1301({
      fiscalYear: FISCAL_YEAR,
      taxpayer: { tax_id: '000000018' },
      incomeSources: [
        { type: 'salary', amount: 120000 },
        { type: 'rental', amount: 30000 },
        { type: 'dividend', amount: 5000 },
        { type: 'capital_gain', amount: 10000 },
      ],
      deductions: [{ type: 'pension', amount: 7200 }],
      credits: [{ type: 'personal', amount: 2976 }],
    });
    assert.equal(f.totalIncome, 165000);
    assert.equal(f.totalDeductions, 7200);
    assert.equal(f.totalCredits, 2976);
    assert.equal(f.computation.taxableIncome, 165000 - 7200);
  });

  test('2.05 negative income source (adjustment) subtracted', () => {
    const f = buildForm1301({
      fiscalYear: FISCAL_YEAR,
      taxpayer: { tax_id: '000000018' },
      incomeSources: [
        { type: 'salary', amount: 100000 },
        { type: 'adjustment', amount: -5000 },
      ],
      deductions: [],
      credits: [],
    });
    assert.equal(f.totalIncome, 95000);
  });

  test('2.06 null fields in items coerced to 0', () => {
    const f = buildForm1301({
      fiscalYear: FISCAL_YEAR,
      taxpayer: { tax_id: '000000018' },
      incomeSources: [{ type: 'salary', amount: null }],
      deductions: [{ type: 'pension', amount: undefined }],
      credits: [{ type: 'personal' }],
    });
    assert.equal(f.totalIncome, 0);
    assert.equal(f.totalDeductions, 0);
    assert.equal(f.totalCredits, 0);
  });

  test('2.07 extreme individual income ₪9,999,999.99', () => {
    const f = buildForm1301({
      fiscalYear: FISCAL_YEAR,
      taxpayer: { tax_id: '000000018' },
      incomeSources: [{ type: 'business', amount: 9_999_999.99 }],
      deductions: [],
      credits: [],
    });
    assert.equal(f.totalIncome, 9_999_999.99);
    assert.ok(Number.isFinite(f.computation.taxableIncome));
  });

  test('2.08 formType is "1301"', () => {
    const f = buildForm1301({
      fiscalYear: FISCAL_YEAR,
      taxpayer: { tax_id: '000000018' },
    });
    assert.equal(f.formType, '1301');
  });

  test('2.09 taxpayer.name / address passed through', () => {
    const f = buildForm1301({
      fiscalYear: FISCAL_YEAR,
      taxpayer: { tax_id: '000000018', name: 'QA Person', address: 'Tel Aviv' },
    });
    assert.equal(f.taxpayer.name, 'QA Person');
    assert.equal(f.taxpayer.address, 'Tel Aviv');
  });
});

// ═════════════════════════════════════════════════════════════
// SECTION 3: buildForm6111 — financial statements
// ═════════════════════════════════════════════════════════════

describe('QA-02.AT.3 buildForm6111 — edges', () => {
  test('3.01 empty chart produces empty lines', () => {
    const f = buildForm6111({
      fiscalYear: FISCAL_YEAR,
      profile: makeProfile(),
    });
    assert.deepEqual(f.lines, []);
  });

  test('3.02 accounts without form_6111_line are ignored', () => {
    const f = buildForm6111({
      fiscalYear: FISCAL_YEAR,
      profile: makeProfile(),
      chartOfAccounts: [
        { account_code: '1000', form_6111_line: null },
        { account_code: '1001' }, // missing line
        { account_code: '2000', form_6111_line: '100' },
      ],
    });
    assert.equal(f.lines.length, 1);
    assert.equal(f.lines[0].line, '100');
  });

  test('3.03 accounts grouped by line', () => {
    const f = buildForm6111({
      fiscalYear: FISCAL_YEAR,
      profile: makeProfile(),
      chartOfAccounts: [
        { account_code: '1000', form_6111_line: '100' },
        { account_code: '1001', form_6111_line: '100' },
        { account_code: '2000', form_6111_line: '200' },
      ],
    });
    assert.equal(f.lines.length, 2);
    const line100 = f.lines.find(l => l.line === '100');
    assert.deepEqual(line100.accounts, ['1000', '1001']);
  });

  test('3.04 formType is "6111"', () => {
    const f = buildForm6111({ fiscalYear: FISCAL_YEAR, profile: makeProfile() });
    assert.equal(f.formType, '6111');
  });

  test('3.05 disclaimer string present', () => {
    const f = buildForm6111({ fiscalYear: FISCAL_YEAR, profile: makeProfile() });
    assert.ok(f.disclaimer.includes('REVIEW BEFORE FILING'));
  });
});

// ═════════════════════════════════════════════════════════════
// SECTION 4: buildForm30A — manufacturer
// ═════════════════════════════════════════════════════════════

describe('QA-02.AT.4 buildForm30A — edges', () => {
  test('4.01 empty inputs produce zero-filled structure', () => {
    const f = buildForm30A({
      fiscalYear: FISCAL_YEAR,
      profile: makeProfile(),
    });
    assert.equal(f.production.unitsProduced, 0);
    assert.equal(f.rawMaterials.openingBalance, 0);
    assert.equal(f.finishedGoods.closingBalance, 0);
    assert.equal(f.labor.directLaborCost, 0);
  });

  test('4.02 full values pass through correctly', () => {
    const f = buildForm30A({
      fiscalYear: FISCAL_YEAR,
      profile: makeProfile(),
      production: { units: 5000, soldUnits: 4500, inventoryUnits: 500 },
      rawMaterials: { opening: 10000, purchases: 50000, consumed: 55000, closing: 5000 },
      finishedGoods: { opening: 2000, produced: 5000, sold: 4500, closing: 2500 },
      labor: { direct: 100000, indirect: 40000, totalEmployees: 25, foreignWorkers: 5 },
    });
    assert.equal(f.production.unitsProduced, 5000);
    assert.equal(f.rawMaterials.consumed, 55000);
    assert.equal(f.finishedGoods.sold, 4500);
    assert.equal(f.labor.totalEmployees, 25);
  });

  test('4.03 formType is "30a"', () => {
    const f = buildForm30A({ fiscalYear: FISCAL_YEAR, profile: makeProfile() });
    assert.equal(f.formType, '30a');
  });

  test('4.04 does not throw on missing nested fields', () => {
    assert.doesNotThrow(() => {
      buildForm30A({
        fiscalYear: FISCAL_YEAR,
        profile: makeProfile(),
        production: null,
        rawMaterials: undefined,
        finishedGoods: {},
        labor: {},
      });
    });
  });
});

// ═════════════════════════════════════════════════════════════
// SECTION 5: Corporate Tax Rate 2026 — 23%
// ═════════════════════════════════════════════════════════════

describe('QA-02.AT.5 Corporate tax rate (23% for 2026)', () => {
  // The form builders accept corporate_tax as an input — they do not
  // compute it themselves. Verify that value passes through unchanged
  // (this guards against future refactors that might introduce silent
  // rate transformation).
  test('5.01 corporate_tax passes through unchanged at 23% rate', () => {
    const profit = 1_000_000;
    const corporateTax = Math.round(profit * 0.23); // 230000
    const f = buildForm1320({
      fiscalYear: FISCAL_YEAR,
      profile: makeProfile(),
      totals: {
        profit_before_tax: profit,
        corporate_tax: corporateTax,
        profit_after_tax: profit - corporateTax,
      },
      customerInvoices: [],
      taxInvoices: [],
    });
    assert.equal(f.profit.corporateTax, 230000);
    assert.equal(f.profit.profitAfterTax, 770000);
  });
});
