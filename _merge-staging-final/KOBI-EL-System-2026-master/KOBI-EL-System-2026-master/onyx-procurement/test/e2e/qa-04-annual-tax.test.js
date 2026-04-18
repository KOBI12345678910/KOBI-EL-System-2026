/**
 * QA-04 Scenario 5 — Annual Tax Full Flow (end-to-end)
 * ------------------------------------------------------------------
 * Flow under test:
 *   Collect data -> compute fiscal year totals -> build Form 1320 ->
 *   export payload -> list reports.
 *
 * Edge cases audited:
 *   - Generating a form with no profile → 412
 *   - Generating with unknown form type → 400
 *   - Generating before fiscal year computed → 412
 *   - Re-generating overwrites the draft (no dup rows)
 *   - Voided invoices excluded from totals
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildFullApp,
  startServer,
  request,
  recordFinding,
} = require('./qa-04-harness');

async function newCtx() {
  const ctx = buildFullApp({
    company_tax_profile: [],
    fiscal_years: [],
    projects: [],
    customers: [],
    customer_invoices: [],
    customer_payments: [],
    tax_invoices: [],
    chart_of_accounts: [],
    annual_tax_reports: [],
  });
  await startServer(ctx);
  return ctx;
}

async function seedProfile(ctx) {
  const res = await request(ctx.server, 'PUT', '/api/vat/profile', {
    legal_name: 'טכנו כל עוזי בע"מ',
    company_id: '514000001',
    vat_file_number: '514000001',
    tax_file_number: '937100200',
    company_name: 'טכנו כל עוזי',
    address_street: 'רחוב הרצל 10',
    address_city: 'תל אביב',
    address_postal: '6701101',
    phone: '03-1234567',
    email: 'office@technokol.co.il',
    fiscal_year_end_month: 12,
    accounting_method: 'accrual',
  });
  assert.equal(res.status, 200);
}

async function seedBusinessYear(ctx, year = 2025) {
  // Create a project so Form 1320 revenueByProject has something to show
  let res = await request(ctx.server, 'POST', '/api/projects', {
    name: `Project ${year}`,
    fiscal_year: year,
    status: 'completed',
  });
  assert.ok(res.status === 201 || res.status === 200);
  const projectId = res.body.project.id;

  // Create a customer
  res = await request(ctx.server, 'POST', '/api/customers', {
    name: 'לקוח ראשי',
    tax_id: '111222333',
    email: 'client@example.co.il',
    active: true,
  });
  assert.ok(res.status === 201 || res.status === 200);
  const customerId = res.body.customer.id;

  // Seed a few customer invoices — 3 real + 1 voided
  const invoices = [
    { net_amount: 100000, vat_amount: 17000, gross_amount: 117000,
      invoice_date: `${year}-03-15`, invoice_number: 'INV-Y1', customer_id: customerId,
      customer_name: 'לקוח ראשי', project_id: projectId, status: 'issued' },
    { net_amount: 50000, vat_amount: 8500, gross_amount: 58500,
      invoice_date: `${year}-06-20`, invoice_number: 'INV-Y2', customer_id: customerId,
      customer_name: 'לקוח ראשי', project_id: projectId, status: 'paid' },
    { net_amount: 200000, vat_amount: 34000, gross_amount: 234000,
      invoice_date: `${year}-11-01`, invoice_number: 'INV-Y3', customer_id: customerId,
      customer_name: 'לקוח ראשי', project_id: projectId, status: 'issued' },
    { net_amount: 999999, vat_amount: 170000, gross_amount: 1169999,
      invoice_date: `${year}-12-31`, invoice_number: 'INV-VOID', customer_id: customerId,
      customer_name: 'לקוח ראשי', project_id: projectId, status: 'voided' },
  ];
  for (const inv of invoices) {
    res = await request(ctx.server, 'POST', '/api/customer-invoices', inv);
    assert.equal(res.status, 201);
  }

  // Seed input tax invoices
  const taxInputs = [
    { direction: 'input', net_amount: 30000, vat_amount: 5100, is_asset: false,
      invoice_date: `${year}-04-01`, invoice_number: 'SUP-1', status: 'ok' },
    { direction: 'input', net_amount: 15000, vat_amount: 2550, is_asset: true,
      invoice_date: `${year}-07-15`, invoice_number: 'SUP-2', status: 'ok' },
  ];
  for (const ti of taxInputs) {
    res = await request(ctx.server, 'POST', '/api/vat/invoices', ti);
    assert.equal(res.status, 201);
  }

  return { projectId, customerId };
}

test('QA-04 / annual-tax / happy path — profile → data → compute FY → generate 1320 → list', async () => {
  const ctx = await newCtx();
  try {
    await seedProfile(ctx);
    await seedBusinessYear(ctx, 2025);

    // Compute fiscal year 2025
    let res = await request(ctx.server, 'POST', '/api/fiscal-years/2025/compute', {});
    if (res.status !== 200) {
      recordFinding({
        scenario: 'annual-tax-full-flow',
        severity: 'critical',
        title: 'Fiscal year compute endpoint failed',
        observed: `status=${res.status}, body=${JSON.stringify(res.body)}`,
        expected: '200 with fiscal_year.total_revenue',
        repro: 'POST /api/fiscal-years/2025/compute',
        impact: 'Cannot produce annual tax reports.',
      });
    }
    assert.equal(res.status, 200);
    const fy = res.body.fiscal_year;
    // Revenue should be 100k + 50k + 200k = 350k (voided excluded)
    if (fy.total_revenue !== 350000) {
      recordFinding({
        scenario: 'annual-tax-full-flow',
        severity: 'critical',
        title: 'Fiscal year total_revenue is wrong (voided leaked or aggregation broken)',
        observed: `total_revenue=${fy.total_revenue}`,
        expected: '350000',
        repro: 'Seed 3 active + 1 voided invoice, POST /compute',
        impact: 'Annual tax return wrong — audit risk.',
      });
    }
    assert.equal(fy.total_revenue, 350000);
    if (fy.total_cogs !== 30000) {
      recordFinding({
        scenario: 'annual-tax-full-flow',
        severity: 'high',
        title: 'Fiscal year total_cogs mis-computed (asset purchase leaked)',
        observed: `total_cogs=${fy.total_cogs}`,
        expected: '30000 (asset purchase must NOT be in COGS)',
        repro: 'Seed 1 regular + 1 asset input invoice, POST /compute',
        impact: 'Gross profit wrong, corporate tax line wrong.',
      });
    }
    assert.equal(fy.total_cogs, 30000);
    assert.equal(fy.gross_profit, 320000);

    // Generate Form 1320
    res = await request(ctx.server, 'POST', '/api/annual-tax/2025/forms/1320/generate', {});
    if (res.status !== 200) {
      recordFinding({
        scenario: 'annual-tax-full-flow',
        severity: 'critical',
        title: 'Form 1320 generation failed',
        observed: `status=${res.status}, body=${JSON.stringify(res.body)}`,
        expected: '200 with report.payload',
        repro: 'POST /annual-tax/2025/forms/1320/generate',
        impact: 'Cannot file annual tax return.',
      });
    }
    assert.equal(res.status, 200);
    const report = res.body.report;
    assert.equal(report.form_type, '1320');
    assert.equal(report.status, 'draft');
    assert.ok(report.payload);
    // computed_totals must have corporate_tax at 23% of 320000 = 73600
    if (report.computed_totals.corporate_tax !== 73600) {
      recordFinding({
        scenario: 'annual-tax-full-flow',
        severity: 'high',
        title: 'Corporate tax on Form 1320 uses wrong rate',
        observed: `corporate_tax=${report.computed_totals.corporate_tax}`,
        expected: '73600 (= 23% of 320000)',
        repro: 'Follow annual-tax happy path, inspect computed_totals',
        impact: 'Tax under/over-payment.',
      });
    }
    assert.equal(report.computed_totals.corporate_tax, 73600);

    // Re-generate — should NOT create duplicate rows (upsert)
    res = await request(ctx.server, 'POST', '/api/annual-tax/2025/forms/1320/generate', {});
    assert.equal(res.status, 200);
    const list = await request(ctx.server, 'GET', '/api/annual-tax/2025/forms');
    assert.equal(list.status, 200);
    if (list.body.reports.length !== 1) {
      recordFinding({
        scenario: 'annual-tax-full-flow',
        severity: 'high',
        title: 'Re-generating Form 1320 creates duplicate rows',
        observed: `reports.length=${list.body.reports.length}`,
        expected: '1',
        repro: 'Generate /1320 twice -> list',
        impact: 'Auditor sees 3 drafts for the same year, doesn\'t know which is signed.',
      });
    }
    assert.equal(list.body.reports.length, 1);
  } finally {
    await ctx.close();
  }
});

test('QA-04 / annual-tax / negative — generate without profile returns 412', async () => {
  const ctx = await newCtx();
  try {
    const res = await request(ctx.server, 'POST', '/api/annual-tax/2025/forms/1320/generate', {});
    if (res.status !== 412) {
      recordFinding({
        scenario: 'annual-tax-full-flow',
        severity: 'high',
        title: 'Form generation did not require company tax profile',
        observed: `status=${res.status}`,
        expected: '412 Precondition Failed',
        repro: 'POST /annual-tax/2025/forms/1320/generate with empty company_tax_profile',
        impact: 'Form generated with no identity — file rejected.',
      });
    }
    assert.equal(res.status, 412);
  } finally {
    await ctx.close();
  }
});

test('QA-04 / annual-tax / negative — unknown form type returns 400', async () => {
  const ctx = await newCtx();
  try {
    await seedProfile(ctx);
    await seedBusinessYear(ctx, 2025);
    await request(ctx.server, 'POST', '/api/fiscal-years/2025/compute', {});
    const res = await request(ctx.server, 'POST', '/api/annual-tax/2025/forms/BOGUS/generate', {});
    if (res.status !== 400) {
      recordFinding({
        scenario: 'annual-tax-full-flow',
        severity: 'medium',
        title: 'Unknown form type did not return 400',
        observed: `status=${res.status}`,
        expected: '400 Bad Request',
        repro: 'POST /annual-tax/2025/forms/BOGUS/generate',
        impact: 'Hidden forms could slip through a typo attack.',
      });
    }
    assert.equal(res.status, 400);
  } finally {
    await ctx.close();
  }
});

test('QA-04 / annual-tax / negative — generate before FY compute returns 412', async () => {
  const ctx = await newCtx();
  try {
    await seedProfile(ctx);
    // Do NOT compute fiscal year 2025
    const res = await request(ctx.server, 'POST', '/api/annual-tax/2025/forms/1320/generate', {});
    if (res.status !== 412) {
      recordFinding({
        scenario: 'annual-tax-full-flow',
        severity: 'high',
        title: 'Form generated without first computing fiscal year',
        observed: `status=${res.status}`,
        expected: '412 Precondition Failed — fiscal year not computed',
        repro: 'Profile present, /compute skipped, POST /generate',
        impact: 'Form 1320 payload shows null profit/tax values.',
      });
    }
    assert.equal(res.status, 412);
  } finally {
    await ctx.close();
  }
});
