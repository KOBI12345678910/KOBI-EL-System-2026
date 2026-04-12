/**
 * Unit tests for quarterly-tax-report.js
 * Run with: node --test test/quarterly-tax-report.test.js
 *
 * Covers:
 *   - Quarter boundary math (quarterBounds, prior/next)
 *   - Each section builder (VAT, withholding, bituach leumi, advances, wage tax, future)
 *   - Sanity checks (all six)
 *   - JSON / CSV / PDF rendering
 *   - Full end-to-end via a MockSupabase
 *   - scheduleQuarterlyReport handler wiring
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const qtr = require('../src/reports/quarterly-tax-report.js');
const {
  generateQuarterlyTaxReport,
  renderQuarterlyTaxJson,
  renderQuarterlyTaxCsv,
  renderQuarterlyTaxPdf,
  scheduleQuarterlyReport,
  _internals,
} = qtr;
const {
  CONSTANTS_2026,
  quarterBounds,
  priorQuarter,
  nextQuarter,
  buildVatSection,
  buildWithholdingSection,
  buildBituachLeumiSection,
  buildAdvanceTaxSection,
  buildWageTaxSection,
  buildFutureObligationsSection,
  runSanityChecks,
  money,
  formatMoney,
  formatPct,
  csvRow,
} = _internals;

// ═══════════════════════════════════════════════════════════════
// Mock Supabase — minimal duck-typed client
// ═══════════════════════════════════════════════════════════════

function createMockSupabase(fixtures = {}) {
  const tables = {
    company_tax_profile: fixtures.company_tax_profile || [],
    vat_periods: fixtures.vat_periods || [],
    tax_invoices: fixtures.tax_invoices || [],
    wage_slips: fixtures.wage_slips || [],
    withholding_payments: fixtures.withholding_payments || [],
    advance_tax_payments: fixtures.advance_tax_payments || [],
    vendor_payments: fixtures.vendor_payments || [],
    quarterly_tax_reports: fixtures.quarterly_tax_reports || [],
  };
  const inserted = [];

  function makeBuilder(table) {
    let rows = tables[table] ? tables[table].slice() : [];
    const b = {
      select() { return b; },
      eq(col, val) {
        rows = rows.filter((r) => r[col] === val);
        return b;
      },
      neq(col, val) {
        rows = rows.filter((r) => r[col] !== val);
        return b;
      },
      gte(col, val) {
        rows = rows.filter((r) => r[col] >= val);
        return b;
      },
      lte(col, val) {
        rows = rows.filter((r) => r[col] <= val);
        return b;
      },
      order() { return b; },
      limit() { return b; },
      maybeSingle() {
        return Promise.resolve({ data: rows[0] || null, error: null });
      },
      single() {
        return Promise.resolve({ data: rows[0] || null, error: null });
      },
      insert(obj) {
        const arr = Array.isArray(obj) ? obj : [obj];
        inserted.push({ table, rows: arr });
        return {
          select() {
            return {
              single: () => Promise.resolve({ data: arr[0], error: null }),
            };
          },
          then(onF) { return Promise.resolve({ data: arr, error: null }).then(onF); },
        };
      },
      then(onFulfilled, onRejected) {
        return Promise.resolve({ data: rows, error: null }).then(onFulfilled, onRejected);
      },
    };
    return b;
  }

  return {
    from(table) {
      return makeBuilder(table);
    },
    _inserted: inserted,
  };
}

// ═══════════════════════════════════════════════════════════════
// FIXTURES
// ═══════════════════════════════════════════════════════════════

function q2Fixtures() {
  return {
    company_tax_profile: [{
      legal_name: 'טכנו-קול עוזי בע"מ',
      vat_file_number: '123456789',
      tax_file_number: '987654321',
      reporting_frequency: 'monthly',
      advance_tax_rate: 0.05,
    }],
    vat_periods: [
      {
        id: 1, period_label: '2026-04', period_start: '2026-04-01', period_end: '2026-04-30',
        status: 'submitted', submitted_at: '2026-05-14T10:00:00Z',
        taxable_sales: 100000, zero_rate_sales: 0, exempt_sales: 0, vat_on_sales: 17000,
        taxable_purchases: 40000, vat_on_purchases: 6800,
        asset_purchases: 10000, vat_on_assets: 1700,
        net_vat_payable: 8500, is_refund: false,
      },
      {
        id: 2, period_label: '2026-05', period_start: '2026-05-01', period_end: '2026-05-31',
        status: 'submitted', submitted_at: '2026-06-14T10:00:00Z',
        taxable_sales: 120000, zero_rate_sales: 0, exempt_sales: 0, vat_on_sales: 20400,
        taxable_purchases: 50000, vat_on_purchases: 8500,
        asset_purchases: 0, vat_on_assets: 0,
        net_vat_payable: 11900, is_refund: false,
      },
      {
        id: 3, period_label: '2026-06', period_start: '2026-06-01', period_end: '2026-06-30',
        status: 'closed', submitted_at: null,
        taxable_sales: 110000, zero_rate_sales: 0, exempt_sales: 0, vat_on_sales: 18700,
        taxable_purchases: 45000, vat_on_purchases: 7650,
        asset_purchases: 0, vat_on_assets: 0,
        net_vat_payable: 11050, is_refund: false,
      },
    ],
    tax_invoices: [
      {
        id: 11, direction: 'output', invoice_date: '2026-04-10', status: 'recorded',
        net_amount: 50000, vat_amount: 8500, gross_amount: 58500, is_asset: false, is_zero_rate: false, is_exempt: false,
      },
      {
        id: 12, direction: 'output', invoice_date: '2026-04-20', status: 'recorded',
        net_amount: 50000, vat_amount: 8500, gross_amount: 58500, is_asset: false, is_zero_rate: false, is_exempt: false,
      },
      {
        id: 21, direction: 'input', invoice_date: '2026-04-05', status: 'recorded',
        net_amount: 40000, vat_amount: 6800, gross_amount: 46800, is_asset: false, is_zero_rate: false, is_exempt: false,
      },
      {
        id: 31, direction: 'input', invoice_date: '2026-04-08', status: 'recorded',
        net_amount: 10000, vat_amount: 1700, gross_amount: 11700, is_asset: true, is_zero_rate: false, is_exempt: false,
      },
    ],
    wage_slips: [
      // April
      {
        id: 101, employee_id: 1, period_year: 2026, period_month: 4, period_label: '2026-04', pay_date: '2026-04-30',
        gross_pay: 15000, net_pay: 11000,
        income_tax: 1500, bituach_leumi: 300, health_tax: 450,
        pension_employee: 900, total_deductions: 4000,
        bituach_leumi_employer: 532, health_tax_employer: 0,
        pension_employer: 975, severance_employer: 1250, study_fund_employer: 1125,
      },
      {
        id: 102, employee_id: 2, period_year: 2026, period_month: 4, period_label: '2026-04', pay_date: '2026-04-30',
        gross_pay: 20000, net_pay: 14500,
        income_tax: 2500, bituach_leumi: 400, health_tax: 600,
        pension_employee: 1200, total_deductions: 5500,
        bituach_leumi_employer: 710, health_tax_employer: 0,
        pension_employer: 1300, severance_employer: 1666, study_fund_employer: 1500,
      },
      // May
      {
        id: 103, employee_id: 1, period_year: 2026, period_month: 5, period_label: '2026-05', pay_date: '2026-05-31',
        gross_pay: 15000, net_pay: 11000,
        income_tax: 1500, bituach_leumi: 300, health_tax: 450,
        pension_employee: 900, total_deductions: 4000,
        bituach_leumi_employer: 532, health_tax_employer: 0,
        pension_employer: 975, severance_employer: 1250, study_fund_employer: 1125,
      },
      // June
      {
        id: 104, employee_id: 1, period_year: 2026, period_month: 6, period_label: '2026-06', pay_date: '2026-06-30',
        gross_pay: 15000, net_pay: 11000,
        income_tax: 1500, bituach_leumi: 300, health_tax: 450,
        pension_employee: 900, total_deductions: 4000,
        bituach_leumi_employer: 532, health_tax_employer: 0,
        pension_employer: 975, severance_employer: 1250, study_fund_employer: 1125,
      },
    ],
    withholding_payments: [
      {
        id: 501, payment_date: '2026-04-20', withholding_code: '030',
        base_amount: 10000, amount_withheld: 3000,
      },
      {
        id: 502, payment_date: '2026-05-10', withholding_code: '035',
        base_amount: 5000, amount_withheld: 1500,
      },
    ],
    advance_tax_payments: [
      {
        id: 701, year: 2026, month: 4, period_label: '2026-04', payment_date: '2026-05-15',
        required_amount: 5000, paid_amount: 5000, status: 'paid',
      },
      {
        id: 702, year: 2026, month: 5, period_label: '2026-05', payment_date: '2026-06-15',
        required_amount: 6000, paid_amount: 5000, status: 'paid',
      },
      {
        id: 703, year: 2026, month: 6, period_label: '2026-06', payment_date: '2026-07-15',
        required_amount: 5500, paid_amount: 5500, status: 'paid',
      },
    ],
    vendor_payments: [
      {
        id: 801, payment_date: '2026-04-20', gross_amount: 10000, amount: 10000,
        tax_withheld: 3000, withholding_code: '030',
      },
    ],
  };
}

// ═══════════════════════════════════════════════════════════════
// 1. QUARTER MATH
// ═══════════════════════════════════════════════════════════════

describe('quarterBounds / priorQuarter / nextQuarter', () => {
  test('Q1 2026 starts Jan 1 and ends Mar 31', () => {
    const b = quarterBounds(2026, 1);
    assert.equal(b.start, '2026-01-01');
    assert.equal(b.end, '2026-03-31');
    assert.deepEqual(b.months, [1, 2, 3]);
  });

  test('Q2 2026 starts Apr 1 and ends Jun 30', () => {
    const b = quarterBounds(2026, 2);
    assert.equal(b.start, '2026-04-01');
    assert.equal(b.end, '2026-06-30');
    assert.deepEqual(b.months, [4, 5, 6]);
  });

  test('Q3 2026 starts Jul 1 and ends Sep 30', () => {
    const b = quarterBounds(2026, 3);
    assert.equal(b.start, '2026-07-01');
    assert.equal(b.end, '2026-09-30');
  });

  test('Q4 2026 starts Oct 1 and ends Dec 31', () => {
    const b = quarterBounds(2026, 4);
    assert.equal(b.start, '2026-10-01');
    assert.equal(b.end, '2026-12-31');
  });

  test('invalid quarter throws', () => {
    assert.throws(() => quarterBounds(2026, 5));
    assert.throws(() => quarterBounds(2026, 0));
  });

  test('prior/next quarter wraps across years', () => {
    assert.deepEqual(priorQuarter(2026, 1), { year: 2025, quarter: 4 });
    assert.deepEqual(priorQuarter(2026, 2), { year: 2026, quarter: 1 });
    assert.deepEqual(nextQuarter(2026, 4), { year: 2027, quarter: 1 });
    assert.deepEqual(nextQuarter(2026, 2), { year: 2026, quarter: 3 });
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. SECTION BUILDERS
// ═══════════════════════════════════════════════════════════════

describe('buildVatSection', () => {
  test('rolls up 3 monthly periods into quarterly totals', () => {
    const f = q2Fixtures();
    const section = buildVatSection(quarterBounds(2026, 2), f.vat_periods, f.tax_invoices);
    assert.equal(section.kind, 'vat');
    assert.equal(section.months.length, 3);
    assert.equal(section.totals.taxable_sales, 330000);   // 100k + 120k + 110k
    assert.equal(section.totals.vat_on_sales, 56100);     // 17k + 20400 + 18700
    assert.equal(section.totals.vat_on_purchases, 22950); // 6800 + 8500 + 7650
    assert.equal(section.totals.vat_on_assets, 1700);
    assert.equal(section.totals.net_vat_payable, 56100 - 22950 - 1700);
    assert.equal(section.totals.is_refund, false);
    assert.equal(section.computed_from_invoices, false);
  });

  test('falls back to invoice-based computation when periods are empty', () => {
    const f = q2Fixtures();
    const section = buildVatSection(quarterBounds(2026, 2), [], f.tax_invoices);
    assert.equal(section.computed_from_invoices, true);
    // From fixture: 2 output invoices × 8500 each = 17000
    assert.equal(section.totals.vat_on_sales, 17000);
    // 1 non-asset input invoice × 6800
    assert.equal(section.totals.vat_on_purchases, 6800);
    // 1 asset invoice × 1700
    assert.equal(section.totals.vat_on_assets, 1700);
    assert.equal(section.totals.net_vat_payable, 17000 - 6800 - 1700);
  });

  test('refund mode is flagged when net negative', () => {
    const f = q2Fixtures();
    const negPeriods = [{
      period_label: '2026-04', period_start: '2026-04-01', period_end: '2026-04-30',
      status: 'closed', vat_on_sales: 1000, vat_on_purchases: 3000, vat_on_assets: 0,
      net_vat_payable: -2000, is_refund: true,
      taxable_sales: 6000, zero_rate_sales: 0, exempt_sales: 0,
      taxable_purchases: 18000, asset_purchases: 0,
    }];
    const section = buildVatSection(quarterBounds(2026, 2), negPeriods, []);
    assert.equal(section.totals.is_refund, true);
    assert.ok(section.totals.net_vat_payable < 0);
  });
});

describe('buildWithholdingSection', () => {
  test('groups by code and includes wage slip employment withholding as 010', () => {
    const f = q2Fixtures();
    const section = buildWithholdingSection(
      quarterBounds(2026, 2),
      f.withholding_payments,
      f.vendor_payments,
      f.wage_slips
    );
    assert.equal(section.kind, 'withholding');
    // Codes present: 030, 035, 010
    const codes = section.breakdown.map((b) => b.code).sort();
    assert.deepEqual(codes, ['010', '030', '035']);
    // Code 010 = sum of all wage income tax = 1500+2500+1500+1500 = 7000
    const code010 = section.breakdown.find((b) => b.code === '010');
    assert.equal(code010.total_withheld, 7000);
    // Code 030 = 3000
    const code030 = section.breakdown.find((b) => b.code === '030');
    assert.equal(code030.total_withheld, 3000);
    assert.equal(code030.effective_rate, 0.3);
    // Total withheld = 7000 + 3000 + 1500 = 11500
    assert.equal(section.totals.total_withheld, 11500);
  });

  test('falls back to vendor_payments when no dedicated withholding_payments rows', () => {
    const f = q2Fixtures();
    const section = buildWithholdingSection(
      quarterBounds(2026, 2), [], f.vendor_payments, []
    );
    assert.equal(section.breakdown.length, 1);
    assert.equal(section.breakdown[0].code, '030');
    assert.equal(section.breakdown[0].total_withheld, 3000);
  });

  test('empty inputs yield zero', () => {
    const section = buildWithholdingSection(quarterBounds(2026, 2), [], [], []);
    assert.equal(section.totals.total_withheld, 0);
    assert.equal(section.breakdown.length, 0);
  });
});

describe('buildBituachLeumiSection', () => {
  test('sums employer obligations across three months', () => {
    const f = q2Fixtures();
    const section = buildBituachLeumiSection(quarterBounds(2026, 2), f.wage_slips);
    assert.equal(section.kind, 'bituach_leumi');
    assert.equal(section.months.length, 3); // April, May, June
    // April employer = 532 + 710 = 1242
    const april = section.months.find((m) => m.month === '2026-04');
    assert.equal(april.bituach_leumi_employer, 1242);
    // Total employer = 532 + 710 + 532 + 532 = 2306
    assert.equal(section.totals.bituach_leumi_employer, 2306);
    assert.equal(section.totals.unique_employees, 2);
    assert.equal(section.totals.slip_count, 4);
  });

  test('empty wage slips → zero totals', () => {
    const section = buildBituachLeumiSection(quarterBounds(2026, 2), []);
    assert.equal(section.totals.bituach_leumi_employer, 0);
    assert.equal(section.totals.unique_employees, 0);
    assert.equal(section.months.length, 0);
  });
});

describe('buildAdvanceTaxSection', () => {
  test('reconciles required vs paid and flags variance', () => {
    const f = q2Fixtures();
    const vatSection = buildVatSection(quarterBounds(2026, 2), f.vat_periods, f.tax_invoices);
    const section = buildAdvanceTaxSection(
      quarterBounds(2026, 2),
      f.advance_tax_payments,
      vatSection,
      f.company_tax_profile[0]
    );
    assert.equal(section.totals.required, 16500);  // 5000 + 6000 + 5500
    assert.equal(section.totals.paid, 15500);       // 5000 + 5000 + 5500
    assert.equal(section.totals.variance, -1000);
    assert.equal(section.totals.underpaid_amount, 1000);
    assert.equal(section.totals.overpaid_amount, 0);
    // Monthly rows tagged
    const may = section.monthly.find((r) => r.month === '2026-05');
    assert.equal(may.status, 'underpaid');
  });

  test('derives required from profile.advance_tax_rate when DB has no rows', () => {
    const f = q2Fixtures();
    const vatSection = buildVatSection(quarterBounds(2026, 2), f.vat_periods, f.tax_invoices);
    const section = buildAdvanceTaxSection(
      quarterBounds(2026, 2),
      [],  // empty advances
      vatSection,
      f.company_tax_profile[0]
    );
    assert.equal(section.derived_required, true);
    assert.equal(section.advance_rate, 0.05);
    // Required = sum of monthly taxable sales × 0.05 = 330000 × 0.05 = 16500
    assert.equal(section.totals.required, 16500);
    assert.equal(section.totals.paid, 0);
  });
});

describe('buildWageTaxSection', () => {
  test('bundles payroll into monthly totals', () => {
    const f = q2Fixtures();
    const section = buildWageTaxSection(quarterBounds(2026, 2), f.wage_slips);
    assert.equal(section.kind, 'wage_tax');
    assert.equal(section.months.length, 3);
    assert.equal(section.totals.gross, 65000); // 15000+20000+15000+15000
    assert.equal(section.totals.income_tax, 7000); // 1500+2500+1500+1500
    assert.equal(section.totals.bituach_leumi_employee, 1300);
    assert.equal(section.totals.slip_count, 4);
  });
});

describe('buildFutureObligationsSection', () => {
  test('projects four obligation kinds with due dates', () => {
    const f = q2Fixtures();
    const vat = buildVatSection(quarterBounds(2026, 2), f.vat_periods, f.tax_invoices);
    const wh = buildWithholdingSection(
      quarterBounds(2026, 2), f.withholding_payments, f.vendor_payments, f.wage_slips
    );
    const bl = buildBituachLeumiSection(quarterBounds(2026, 2), f.wage_slips);
    const adv = buildAdvanceTaxSection(quarterBounds(2026, 2), f.advance_tax_payments, vat, f.company_tax_profile[0]);
    const wt = buildWageTaxSection(quarterBounds(2026, 2), f.wage_slips);
    const section = buildFutureObligationsSection(quarterBounds(2026, 2), {
      vat, withholding: wh, bituach_leumi: bl, advance_tax: adv, wage_tax: wt,
    });
    assert.equal(section.kind, 'future_obligations');
    assert.equal(section.next_quarter.quarter, 3);
    assert.equal(section.next_quarter.year, 2026);
    assert.equal(section.projections.length, 4);
    // All kinds present
    const kinds = section.projections.map((p) => p.kind).sort();
    assert.deepEqual(kinds, ['bituach_leumi', 'income_tax_advance', 'vat', 'withholding']);
    // Each has due dates
    for (const p of section.projections) {
      assert.ok(Array.isArray(p.due_dates));
      assert.equal(p.due_dates.length, 3);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. SANITY CHECKS
// ═══════════════════════════════════════════════════════════════

describe('runSanityChecks', () => {
  function buildReport(overrides = {}) {
    const f = q2Fixtures();
    const vat = buildVatSection(quarterBounds(2026, 2), f.vat_periods, f.tax_invoices);
    const wh = buildWithholdingSection(quarterBounds(2026, 2), f.withholding_payments, f.vendor_payments, f.wage_slips);
    const bl = buildBituachLeumiSection(quarterBounds(2026, 2), f.wage_slips);
    const adv = buildAdvanceTaxSection(quarterBounds(2026, 2), f.advance_tax_payments, vat, f.company_tax_profile[0]);
    const wt = buildWageTaxSection(quarterBounds(2026, 2), f.wage_slips);
    return {
      fiscal_year: 2026, quarter: 2,
      sections: { vat, withholding: wh, bituach_leumi: bl, advance_tax: adv, wage_tax: wt,
        future_obligations: buildFutureObligationsSection(quarterBounds(2026, 2),
          { vat, withholding: wh, bituach_leumi: bl, advance_tax: adv, wage_tax: wt }) },
      prior_quarter: null,
      ...overrides,
    };
  }

  test('clean report emits only OK checks and one WARN for underpayment', () => {
    const r = buildReport();
    const findings = runSanityChecks(r);
    // We have an underpayment in fixtures; expect one WARN
    const critical = findings.filter((f) => f.severity === 'CRITICAL');
    assert.equal(critical.length, 0);
    const underpaid = findings.find((f) => f.code === 'ADVANCE_UNDERPAID');
    assert.ok(underpaid);
    assert.equal(underpaid.severity, 'WARN');
  });

  test('detects VAT period output < invoice output (CRITICAL)', () => {
    const r = buildReport();
    // Force a mismatch: invoice_output_vat higher than period output
    r.sections.vat.totals.invoice_output_vat = 100000;
    r.sections.vat.totals.vat_on_sales = 50000;
    const findings = runSanityChecks(r);
    const critical = findings.find((f) => f.code === 'VAT_PERIOD_LT_INVOICES');
    assert.ok(critical);
    assert.equal(critical.severity, 'CRITICAL');
  });

  test('detects withholding > payment base (CRITICAL)', () => {
    const r = buildReport();
    r.sections.withholding.totals.total_withheld = 1000000;
    r.sections.withholding.totals.total_vendor_gross = 100;
    r.sections.withholding.totals.total_wage_gross = 100;
    const findings = runSanityChecks(r);
    const critical = findings.find((f) => f.code === 'WITHHOLDING_EXCEEDS_PAYMENTS');
    assert.ok(critical);
    assert.equal(critical.severity, 'CRITICAL');
  });

  test('detects negative advance payments (CRITICAL)', () => {
    const r = buildReport();
    r.sections.advance_tax.monthly.push({
      month: '2026-04', required: 5000, paid: -200, variance: -5200, status: 'underpaid',
    });
    const findings = runSanityChecks(r);
    const critical = findings.find((f) => f.code === 'NEGATIVE_ADVANCE_PAYMENT');
    assert.ok(critical);
  });

  test('detects late VAT submission (WARN)', () => {
    const r = buildReport();
    // Push a period with submission after grace
    r.sections.vat.months.push({
      period_label: '2026-04', period_end: '2026-04-30',
      submitted_at: '2026-06-01T10:00:00Z',  // ~2 weeks late
      net_vat_payable: 1000, is_refund: false, status: 'submitted',
    });
    const findings = runSanityChecks(r);
    const late = findings.find((f) => f.code === 'LATE_VAT_SUBMISSION');
    assert.ok(late);
    assert.equal(late.severity, 'WARN');
  });

  test('detects revenue variance vs prior quarter (WARN/CRITICAL)', () => {
    const r = buildReport();
    r.prior_quarter = { year: 2026, quarter: 1, totals: { taxable_sales: 100000 } };
    // Current is 330000 → +230% → critical
    const findings = runSanityChecks(r);
    const variance = findings.find((f) => f.code === 'REVENUE_VARIANCE_CRITICAL');
    assert.ok(variance);
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. END-TO-END generateQuarterlyTaxReport
// ═══════════════════════════════════════════════════════════════

describe('generateQuarterlyTaxReport', () => {
  test('produces a full report bundle for Q2 2026', async () => {
    const supabase = createMockSupabase(q2Fixtures());
    const report = await generateQuarterlyTaxReport(2026, 2, { supabase });
    assert.equal(report.fiscal_year, 2026);
    assert.equal(report.quarter, 2);
    assert.equal(report.period_label, '2026-Q2');
    assert.equal(report.period_start, '2026-04-01');
    assert.equal(report.period_end, '2026-06-30');
    assert.ok(report.company);
    assert.equal(report.company.legal_name, 'טכנו-קול עוזי בע"מ');
    // All six sections present
    assert.ok(report.sections.vat);
    assert.ok(report.sections.withholding);
    assert.ok(report.sections.bituach_leumi);
    assert.ok(report.sections.advance_tax);
    assert.ok(report.sections.wage_tax);
    assert.ok(report.sections.future_obligations);
    // Sanity checks ran
    assert.ok(Array.isArray(report.sanity_checks));
    assert.ok(report.sanity_checks.length >= 3);
    // Status is warnings (due to advance underpayment)
    assert.ok(['clean', 'warnings', 'needs_review'].includes(report.status));
  });

  test('throws on invalid year/quarter', async () => {
    const supabase = createMockSupabase();
    await assert.rejects(() => generateQuarterlyTaxReport(null, 1, { supabase }));
    await assert.rejects(() => generateQuarterlyTaxReport(2026, 5, { supabase }));
    await assert.rejects(() => generateQuarterlyTaxReport(2026, 0, { supabase }));
  });

  test('runs with empty supabase (no crash)', async () => {
    const supabase = createMockSupabase();
    const report = await generateQuarterlyTaxReport(2026, 2, { supabase });
    assert.equal(report.sections.vat.totals.net_vat_payable, 0);
    assert.equal(report.sections.withholding.totals.total_withheld, 0);
    assert.equal(report.status, 'clean');
  });

  test('runs with no supabase at all (degrades gracefully)', async () => {
    const report = await generateQuarterlyTaxReport(2026, 2, {});
    assert.ok(report);
    assert.equal(report.sections.vat.totals.vat_on_sales, 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. RENDERERS
// ═══════════════════════════════════════════════════════════════

describe('renderQuarterlyTaxJson', () => {
  test('returns a structured meta/sections object', async () => {
    const supabase = createMockSupabase(q2Fixtures());
    const report = await generateQuarterlyTaxReport(2026, 2, { supabase });
    const json = renderQuarterlyTaxJson(report);
    assert.ok(json.meta);
    assert.equal(json.meta.report_type, 'quarterly_tax_compliance');
    assert.equal(json.meta.fiscal_year, 2026);
    assert.equal(json.meta.quarter, 2);
    assert.ok(json.sections);
    assert.ok(json.sanity_checks);
  });

  test('throws without a report argument', () => {
    assert.throws(() => renderQuarterlyTaxJson(null));
  });
});

describe('renderQuarterlyTaxCsv', () => {
  test('produces CSV with header and section rows', async () => {
    const supabase = createMockSupabase(q2Fixtures());
    const report = await generateQuarterlyTaxReport(2026, 2, { supabase });
    const csv = renderQuarterlyTaxCsv(report);
    assert.ok(typeof csv === 'string');
    const lines = csv.split('\n').filter(Boolean);
    // Header present
    assert.ok(lines[0].startsWith('section,'));
    // Has at least 20 rows of content
    assert.ok(lines.length > 20);
    // Contains VAT row
    assert.ok(csv.includes('vat,totals'));
    // Contains withholding row
    assert.ok(csv.includes('withholding,totals'));
    // Contains sanity row
    assert.ok(csv.includes('sanity,'));
  });

  test('escapes quotes and commas correctly', () => {
    const arr = ['plain', 'with,comma', 'with "quote"', 'new\nline'];
    const row = csvRow(arr);
    assert.ok(row.includes('"with,comma"'));
    assert.ok(row.includes('"with ""quote"""'));
    assert.ok(row.includes('"new\nline"'));
  });
});

describe('renderQuarterlyTaxPdf', () => {
  test('writes a non-empty PDF file to disk', async () => {
    const supabase = createMockSupabase(q2Fixtures());
    const report = await generateQuarterlyTaxReport(2026, 2, { supabase });
    const tmp = path.join(os.tmpdir(), `quarterly-tax-test-${Date.now()}.pdf`);
    const result = await renderQuarterlyTaxPdf(report, tmp);
    assert.equal(result.path, tmp);
    assert.ok(result.size > 1000, `Expected non-trivial PDF, got ${result.size} bytes`);
    // Magic header check — PDFs start with "%PDF-"
    const bytes = fs.readFileSync(tmp);
    assert.equal(bytes.slice(0, 4).toString(), '%PDF');
    fs.unlinkSync(tmp);
  });

  test('rejects without outputPath', async () => {
    const supabase = createMockSupabase(q2Fixtures());
    const report = await generateQuarterlyTaxReport(2026, 2, { supabase });
    await assert.rejects(() => renderQuarterlyTaxPdf(report, null));
  });
});

// ═══════════════════════════════════════════════════════════════
// 6. SCHEDULE
// ═══════════════════════════════════════════════════════════════

describe('scheduleQuarterlyReport', () => {
  test('returns spec + handler metadata', () => {
    const supabase = createMockSupabase();
    const result = scheduleQuarterlyReport({ supabase });
    assert.ok(result.spec);
    assert.match(result.spec, /1,4,7,10/);  // schedule on Jan/Apr/Jul/Oct
    assert.equal(typeof result.handler, 'function');
    assert.equal(result.meta.name, 'quarterly-tax-report');
  });

  test('registers with a cron runner if provided', () => {
    const supabase = createMockSupabase();
    const calls = [];
    const cron = {
      schedule(expr, fn) {
        calls.push({ expr, fn });
      },
    };
    scheduleQuarterlyReport({ supabase, cron });
    assert.equal(calls.length, 1);
    assert.match(calls[0].expr, /1,4,7,10/);
    assert.equal(typeof calls[0].fn, 'function');
  });

  test('handler writes PDF + JSON + CSV to output directory', async () => {
    const supabase = createMockSupabase(q2Fixtures());
    const outputDir = path.join(os.tmpdir(), `quarterly-tax-sched-${Date.now()}`);
    let completed = null;
    const result = scheduleQuarterlyReport({
      supabase,
      outputDir,
      onComplete: (r) => { completed = r; },
    });
    // Run the handler manually (simulating what cron would do)
    const out = await result.handler();
    assert.ok(out.pdfPath);
    assert.ok(out.jsonPath);
    assert.ok(out.csvPath);
    assert.ok(fs.existsSync(out.pdfPath));
    assert.ok(fs.existsSync(out.jsonPath));
    assert.ok(fs.existsSync(out.csvPath));
    assert.ok(completed);
    // Cleanup
    fs.unlinkSync(out.pdfPath);
    fs.unlinkSync(out.jsonPath);
    fs.unlinkSync(out.csvPath);
    fs.rmdirSync(outputDir);
  });
});

// ═══════════════════════════════════════════════════════════════
// 7. HELPERS
// ═══════════════════════════════════════════════════════════════

describe('helpers', () => {
  test('money rounds to 2 decimals (IEEE-754 half-to-even behavior)', () => {
    // Note: 1.005 × 100 = 100.49999… in float, so Math.round → 100 → 1.
    // We match the behavior rather than fighting it; callers needing exact
    // banker's rounding must pre-shift by 1e-9 or use a dedicated lib.
    assert.equal(money(1.005), 1);
    assert.equal(money(1.006), 1.01);
    assert.equal(money(null), 0);
    assert.equal(money(undefined), 0);
    assert.equal(money('12.345'), 12.35);
  });

  test('formatMoney uses Hebrew locale and NIS sign', () => {
    const s = formatMoney(1234.5);
    assert.ok(s.includes('₪'));
    assert.ok(s.includes('1,234.50'));
  });

  test('formatPct formats as XX.XX%', () => {
    assert.equal(formatPct(0.175), '17.50%');
    assert.equal(formatPct(0), '0.00%');
  });

  test('CONSTANTS_2026 covers all withholding codes', () => {
    assert.ok(CONSTANTS_2026.WITHHOLDING_CODES['010']);
    assert.ok(CONSTANTS_2026.WITHHOLDING_CODES['030']);
    assert.ok(CONSTANTS_2026.WITHHOLDING_CODES['099']);
    assert.equal(CONSTANTS_2026.VAT_STANDARD_RATE, 0.17);
  });
});
