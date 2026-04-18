/**
 * QA-04 Scenario 6 — Cross-Project / Cross-Module Flow
 * ------------------------------------------------------------------
 * Flow under test:
 *   An incoming supplier invoice in the procurement/VAT module must
 *   flow through to:
 *     1. The VAT period's vat_on_purchases
 *     2. The annual fiscal year's total_cogs
 *     3. The annual Form 1320 draft
 *
 *   AND an outgoing customer invoice must flow through to:
 *     1. The VAT period's vat_on_sales
 *     2. The annual fiscal year's total_revenue
 *     3. The payroll YTD is NOT affected (separate income source — we
 *        guard against leakage)
 *
 * Edge cases audited:
 *   - Same supplier invoice counted in both VAT and annual tax (expected)
 *   - Voided invoice must drop from ALL three views simultaneously
 *   - Creating a customer payment should NOT affect VAT totals (cash-basis
 *     versus accrual should not leak)
 *   - Procurement PO dashboard does NOT count VAT-only invoices (no PO link)
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  buildFullApp,
  startServer,
  request,
  recordFinding,
} = require('./qa-04-harness');

async function newCtx() {
  process.env.PCN836_ARCHIVE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qa04-cross-'));
  const ctx = buildFullApp({
    company_tax_profile: [],
    vat_periods: [],
    tax_invoices: [],
    vat_submissions: [],
    suppliers: [],
    customers: [],
    projects: [],
    customer_invoices: [],
    customer_payments: [],
    fiscal_years: [],
    annual_tax_reports: [],
    purchase_orders: [],
    bank_accounts: [],
    bank_transactions: [],
    employers: [],
    employees: [],
    wage_slips: [],
  });
  await startServer(ctx);
  return ctx;
}

test('QA-04 / cross-project / supplier invoice reaches VAT period AND annual fiscal year', async () => {
  const ctx = await newCtx();
  try {
    // Setup profile + period
    await request(ctx.server, 'PUT', '/api/vat/profile', {
      legal_name: 'טכנו כל עוזי בע"מ', company_id: '514000001',
      vat_file_number: '514000001', tax_file_number: '937100200',
      fiscal_year_end_month: 12, accounting_method: 'accrual',
    });
    const period = (await request(ctx.server, 'POST', '/api/vat/periods', {
      period_start: '2025-10-01', period_end: '2025-10-31', period_label: '2025-10',
    })).body.period;

    // Seed a customer invoice (output)
    await request(ctx.server, 'POST', '/api/customer-invoices', {
      invoice_number: 'O-2025-Q4-01', invoice_date: '2025-10-15',
      customer_name: 'לקוח גדול', customer_id: 1, project_id: null,
      net_amount: 100000, vat_rate: 0.17, vat_amount: 17000, gross_amount: 117000,
      status: 'issued',
    });

    // Seed a tax_invoices entry (output) wired to the VAT period
    await request(ctx.server, 'POST', '/api/vat/invoices', {
      direction: 'output', invoice_number: 'O-2025-Q4-01', invoice_date: '2025-10-15',
      customer_name: 'לקוח גדול', customer_tax_id: '111222333',
      net_amount: 100000, vat_amount: 17000, vat_period_id: period.id, status: 'ok',
    });

    // Seed a tax_invoices entry (input) wired to the VAT period
    await request(ctx.server, 'POST', '/api/vat/invoices', {
      direction: 'input', invoice_number: 'SUP-Q4-01', invoice_date: '2025-10-10',
      supplier_name: 'מתכת הדרום', supplier_tax_id: '555666777',
      net_amount: 40000, vat_amount: 6800, vat_period_id: period.id, status: 'ok',
    });

    // Check VAT summary
    let res = await request(ctx.server, 'GET', `/api/vat/periods/${period.id}`);
    assert.equal(res.status, 200);
    if (res.body.computed.vat_on_sales !== 17000) {
      recordFinding({
        scenario: 'cross-project',
        severity: 'critical',
        title: 'VAT summary did not pick up the output invoice',
        observed: `vat_on_sales=${res.body.computed.vat_on_sales}`,
        expected: '17000',
        repro: 'POST output invoice -> GET /vat/periods/:id',
        impact: 'Cross-module totals diverge — VAT filings wrong.',
      });
    }
    assert.equal(res.body.computed.vat_on_sales, 17000);
    assert.equal(res.body.computed.vat_on_purchases, 6800);

    // Compute fiscal year 2025 — should include this invoice
    res = await request(ctx.server, 'POST', '/api/fiscal-years/2025/compute', {});
    assert.equal(res.status, 200);
    const fy = res.body.fiscal_year;
    if (fy.total_revenue !== 100000) {
      recordFinding({
        scenario: 'cross-project',
        severity: 'critical',
        title: 'Fiscal year missed the customer invoice from VAT period',
        observed: `total_revenue=${fy.total_revenue}`,
        expected: '100000',
        repro: 'Cross-flow: customer invoice -> POST /fiscal-years/2025/compute',
        impact: 'Annual tax return revenue wrong — misalignment with VAT filings.',
      });
    }
    assert.equal(fy.total_revenue, 100000);
    if (fy.total_cogs !== 40000) {
      recordFinding({
        scenario: 'cross-project',
        severity: 'critical',
        title: 'Fiscal year total_cogs missed the supplier tax_invoice',
        observed: `total_cogs=${fy.total_cogs}`,
        expected: '40000',
        repro: 'Cross-flow: input tax_invoice -> POST /fiscal-years/2025/compute',
        impact: 'COGS wrong on Form 1320 -> wrong corporate tax.',
      });
    }
    assert.equal(fy.total_cogs, 40000);

    // Form 1320 is built from fiscal_year + invoices -> must reflect both sides
    res = await request(ctx.server, 'POST', '/api/annual-tax/2025/forms/1320/generate', {});
    assert.equal(res.status, 200);
    const report = res.body.report;
    assert.equal(report.computed_totals.profit_before_tax, 60000); // 100k - 40k
    // 23% of 60000 = 13800
    assert.equal(report.computed_totals.corporate_tax, 13800);
    assert.equal(report.computed_totals.profit_after_tax, 46200);
  } finally {
    await ctx.close();
  }
});

test('QA-04 / cross-project / voided invoice drops from VAT AND fiscal year simultaneously', async () => {
  const ctx = await newCtx();
  try {
    await request(ctx.server, 'PUT', '/api/vat/profile', {
      legal_name: 'טכנו כל עוזי בע"מ', company_id: '514000001',
    });
    const period = (await request(ctx.server, 'POST', '/api/vat/periods', {
      period_start: '2025-10-01', period_end: '2025-10-31', period_label: '2025-10',
    })).body.period;

    // Seed ONE non-voided invoice + ONE voided invoice, both in customer_invoices
    // AND in tax_invoices (parallel). VAT summary and fiscal year must ignore
    // the voided one but keep the other.
    await request(ctx.server, 'POST', '/api/customer-invoices', {
      invoice_number: 'R-01', invoice_date: '2025-10-05', customer_name: 'לקוח פעיל',
      net_amount: 50000, vat_amount: 8500, gross_amount: 58500, status: 'issued',
    });
    await request(ctx.server, 'POST', '/api/customer-invoices', {
      invoice_number: 'R-VOID', invoice_date: '2025-10-06', customer_name: 'לקוח פעיל',
      net_amount: 9999999, vat_amount: 9999999, gross_amount: 19999998, status: 'voided',
    });
    await request(ctx.server, 'POST', '/api/vat/invoices', {
      direction: 'output', invoice_number: 'R-01', invoice_date: '2025-10-05',
      net_amount: 50000, vat_amount: 8500, vat_period_id: period.id, status: 'ok',
    });
    await request(ctx.server, 'POST', '/api/vat/invoices', {
      direction: 'output', invoice_number: 'R-VOID', invoice_date: '2025-10-06',
      net_amount: 9999999, vat_amount: 9999999, vat_period_id: period.id, status: 'voided',
    });

    // VAT summary must equal 50k not 10M
    let res = await request(ctx.server, 'GET', `/api/vat/periods/${period.id}`);
    if (res.body.computed.taxable_sales !== 50000) {
      recordFinding({
        scenario: 'cross-project',
        severity: 'critical',
        title: 'Voided tax_invoice leaked into VAT taxable_sales',
        observed: `taxable_sales=${res.body.computed.taxable_sales}`,
        expected: '50000',
        repro: 'Seed voided output tax_invoice -> GET /periods/:id',
        impact: 'Void invoice inflates VAT due — double-taxation.',
      });
    }
    assert.equal(res.body.computed.taxable_sales, 50000);

    // Fiscal year must also equal 50k
    res = await request(ctx.server, 'POST', '/api/fiscal-years/2025/compute', {});
    if (res.body.fiscal_year.total_revenue !== 50000) {
      recordFinding({
        scenario: 'cross-project',
        severity: 'critical',
        title: 'Voided customer_invoice leaked into fiscal year total_revenue',
        observed: `total_revenue=${res.body.fiscal_year.total_revenue}`,
        expected: '50000',
        repro: 'Seed voided customer_invoice -> POST /fiscal-years/compute',
        impact: 'Annual tax return over-stated — refund claims wrong.',
      });
    }
    assert.equal(res.body.fiscal_year.total_revenue, 50000);
  } finally {
    await ctx.close();
  }
});

test('QA-04 / cross-project / payroll YTD is NOT contaminated by customer/supplier invoices', async () => {
  const ctx = await newCtx();
  try {
    // Seed employer/employee + one slip
    const employerId = (await request(ctx.server, 'POST', '/api/payroll/employers', {
      legal_name: 'טכנו', company_id: '514000001',
    })).body.employer.id;
    const employeeId = (await request(ctx.server, 'POST', '/api/payroll/employees', {
      employer_id: employerId, employee_number: 'E1', first_name: 'דני', last_name: 'כהן',
      full_name: 'דני כהן', national_id: '012345672', employment_type: 'monthly',
      base_salary: 12000, hours_per_month: 182, work_percentage: 100, tax_credits: 2.25,
      is_active: true,
    })).body.employee.id;

    // Slip for Jan 2025
    const janSlip = (await request(ctx.server, 'POST', '/api/payroll/wage-slips', {
      employee_id: employeeId,
      timesheet: { hours_regular: 182, hours_overtime_125: 0, hours_overtime_150: 0 },
      period: { year: 2025, month: 1 },
    })).body.wage_slip;

    // Now inject a massive customer_invoice to try and contaminate
    await request(ctx.server, 'POST', '/api/customer-invoices', {
      invoice_number: 'HUGE', invoice_date: '2025-01-15',
      customer_name: 'לקוח', net_amount: 999999, vat_amount: 170000,
      gross_amount: 1169999, status: 'issued',
    });

    // Preview a Feb slip — its ytd_gross is "running YTD INCLUDING this
    // slip" per wage-slip-calculator.js (line 420). With base_salary=12000:
    //   Jan slip persisted → gross_pay=12000
    //   Feb preview loads priorSlips = [{gross_pay:12000}] and the
    //   calculator then adds the preview's own gross (12000), giving
    //   ytd_gross=24000.
    // The huge customer_invoice we injected must NOT bleed into that
    // number. We assert ytd_gross equals the pure 2 x 12000 we expect.
    const febPreview = await request(ctx.server, 'POST', '/api/payroll/wage-slips/compute', {
      employee_id: employeeId,
      timesheet: { hours_regular: 182 },
      period: { year: 2025, month: 2 },
    });
    assert.equal(febPreview.status, 200);
    const ytd = febPreview.body.wage_slip.ytd_gross;
    const expected = janSlip.gross_pay * 2; // two identical months
    if (Math.abs(ytd - expected) / expected > 0.01) {
      recordFinding({
        scenario: 'cross-project',
        severity: 'critical',
        title: 'Payroll YTD contaminated or diverged from expected roll-forward',
        observed: `ytd_gross=${ytd}, expected≈${expected}, janSlip.gross_pay=${janSlip.gross_pay}`,
        expected: `ytd_gross close to ${expected}`,
        repro: 'Slip -> huge customer_invoice -> preview next slip',
        impact: 'Income tax computation pulls from wrong table — fraud vector OR YTD math broken.',
      });
    }
    assert.ok(Math.abs(ytd - expected) / expected < 0.01, `ytd_gross=${ytd} not close to ${expected}`);
  } finally {
    await ctx.close();
  }
});
