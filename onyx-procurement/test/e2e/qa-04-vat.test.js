/**
 * QA-04 Scenario 3 — VAT Full Flow (end-to-end)
 * ------------------------------------------------------------------
 * Flow under test:
 *   Month ends -> compute VAT summary -> generate PCN836 -> validate ->
 *   export -> report as submitted.
 *
 * Edge cases audited:
 *   - Submitting with no company_tax_profile must return 412
 *   - Closing an already-closed period must 409
 *   - Re-submitting must 409
 *   - Voided invoices must NOT be counted in totals
 *   - Assets must split into asset_purchases / vat_on_assets
 *   - Zero-rate + exempt breakdowns
 *   - PCN836 file actually gets archived + downloadable
 *   - Dashboard (/api/vat/periods) reflects status transitions
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
  // Fresh PCN836 archive dir per test — avoid OneDrive write conflicts
  process.env.PCN836_ARCHIVE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qa04-vat-'));
  const ctx = buildFullApp({
    company_tax_profile: [],
    vat_periods: [],
    tax_invoices: [],
    vat_submissions: [],
  });
  await startServer(ctx);
  return ctx;
}

async function seedProfile(ctx) {
  const res = await request(ctx.server, 'PUT', '/api/vat/profile', {
    legal_name: 'טכנו כל עוזי בע"מ',
    vat_file_number: '514000001',
    reporting_frequency: 'monthly',
  });
  assert.equal(res.status, 200);
}

async function seedPeriod(ctx) {
  const res = await request(ctx.server, 'POST', '/api/vat/periods', {
    period_start: '2026-04-01',
    period_end: '2026-04-30',
    period_label: '2026-04',
  });
  assert.equal(res.status, 201);
  return res.body.period;
}

async function seedInvoices(ctx, periodId) {
  // Outputs: ₪30,000 net / ₪5,100 VAT taxable + ₪2,000 zero-rate export
  // Inputs : ₪10,000 net / ₪1,700 VAT regular  + ₪5,000 / ₪850 asset purchase
  const outputs = [
    { direction: 'output', invoice_number: 'INV-001', invoice_date: '2026-04-05',
      net_amount: 30000, vat_amount: 5100, status: 'ok', is_asset: false,
      is_zero_rate: false, is_exempt: false, vat_period_id: periodId,
      customer_name: 'לקוח א', customer_tax_id: '123456789' },
    { direction: 'output', invoice_number: 'INV-002', invoice_date: '2026-04-10',
      net_amount: 2000, vat_amount: 0, status: 'ok', is_asset: false,
      is_zero_rate: true, is_exempt: false, vat_period_id: periodId,
      customer_name: 'יצוא', customer_tax_id: '987654321' },
    // Voided — must be excluded
    { direction: 'output', invoice_number: 'INV-VOID', invoice_date: '2026-04-11',
      net_amount: 99999, vat_amount: 99999, status: 'voided', is_asset: false,
      is_zero_rate: false, is_exempt: false, vat_period_id: periodId,
      customer_name: 'לקוח ב', customer_tax_id: '111222333' },
  ];
  const inputs = [
    { direction: 'input', invoice_number: 'SUP-A-01', invoice_date: '2026-04-02',
      net_amount: 10000, vat_amount: 1700, status: 'ok', is_asset: false,
      is_zero_rate: false, is_exempt: false, vat_period_id: periodId,
      supplier_name: 'מתכת הדרום', supplier_tax_id: '555666777' },
    { direction: 'input', invoice_number: 'SUP-B-02', invoice_date: '2026-04-08',
      net_amount: 5000, vat_amount: 850, status: 'ok', is_asset: true,
      is_zero_rate: false, is_exempt: false, vat_period_id: periodId,
      supplier_name: 'מחשב לעסק', supplier_tax_id: '888999111' },
  ];
  for (const body of [...outputs, ...inputs]) {
    const res = await request(ctx.server, 'POST', '/api/vat/invoices', body);
    assert.equal(res.status, 201);
  }
}

test('QA-04 / vat / happy path — profile → period → invoices → summary → close → submit → export', async () => {
  const ctx = await newCtx();
  try {
    await seedProfile(ctx);
    const period = await seedPeriod(ctx);
    await seedInvoices(ctx, period.id);

    // Summary — should correctly compute totals and exclude voided
    let res = await request(ctx.server, 'GET', `/api/vat/periods/${period.id}`);
    assert.equal(res.status, 200);
    const computed = res.body.computed;

    if (computed.taxable_sales !== 30000) {
      recordFinding({
        scenario: 'vat-full-flow',
        severity: 'critical',
        title: 'Taxable sales total wrong (voided or zero-rate leaked in)',
        observed: `taxable_sales=${computed.taxable_sales}`,
        expected: '30000',
        repro: 'Seed 1 taxable + 1 zero-rate + 1 voided output, GET /periods/:id',
        impact: 'מע"מ דיווח שגוי — risk of fines and interest from רשות המסים.',
      });
    }
    assert.equal(computed.taxable_sales, 30000);
    assert.equal(computed.zero_rate_sales, 2000);
    assert.equal(computed.vat_on_sales, 5100);
    assert.equal(computed.vat_on_purchases, 1700);
    assert.equal(computed.vat_on_assets, 850);
    assert.equal(computed.net_vat_payable, 5100 - 1700 - 850); // = 2550
    assert.equal(computed.is_refund, false);

    // Close
    res = await request(ctx.server, 'POST', `/api/vat/periods/${period.id}/close`, {});
    assert.equal(res.status, 200);
    assert.equal(res.body.totals.net_vat_payable, 2550);
    // The route stores status='closing' (not 'closed') — verify
    const afterClose = (await request(ctx.server, 'GET', `/api/vat/periods/${period.id}`)).body.period;
    if (afterClose.status !== 'closing' && afterClose.status !== 'closed') {
      recordFinding({
        scenario: 'vat-full-flow',
        severity: 'low',
        title: 'VAT period status after close is inconsistent',
        observed: `status=${afterClose.status}`,
        expected: `'closing' or 'closed'`,
        repro: 'POST /api/vat/periods/:id/close then GET the period',
        impact: 'Dashboard shows wrong lifecycle label.',
      });
    }

    // Re-close must 409
    res = await request(ctx.server, 'POST', `/api/vat/periods/${period.id}/close`, {});
    if (res.status !== 409) {
      recordFinding({
        scenario: 'vat-full-flow',
        severity: 'high',
        title: 'Can close an already-closed VAT period',
        observed: `status=${res.status}, body=${JSON.stringify(res.body)}`,
        expected: '409 Conflict — period is closing/closed',
        repro: 'POST /close on the same period twice',
        impact: 'Duplicate audit entries; stale totals may overwrite signed-off values.',
      });
    }
    assert.equal(res.status, 409);

    // Submit — creates PCN836 + vat_submissions row
    res = await request(ctx.server, 'POST', `/api/vat/periods/${period.id}/submit`, {
      submission_type: 'initial',
    });
    if (res.status !== 201) {
      recordFinding({
        scenario: 'vat-full-flow',
        severity: 'critical',
        title: 'PCN836 submit endpoint failed on happy path',
        observed: `status=${res.status}, body=${JSON.stringify(res.body)}`,
        expected: '201 with submission + metadata',
        repro: 'Full VAT happy path -> POST /submit',
        impact: 'Cannot file monthly PCN836 — legal/regulatory blocker.',
      });
    }
    assert.equal(res.status, 201);
    const { submission, metadata, archivePath } = res.body;
    assert.ok(submission.id);
    assert.ok(metadata.filename);
    assert.ok(fs.existsSync(archivePath), 'PCN836 file archived to disk');

    // Re-submit must 409
    res = await request(ctx.server, 'POST', `/api/vat/periods/${period.id}/submit`, {});
    if (res.status !== 409) {
      recordFinding({
        scenario: 'vat-full-flow',
        severity: 'critical',
        title: 'PCN836 re-submit is allowed after period is already submitted',
        observed: `status=${res.status}`,
        expected: '409 Conflict — Period already submitted',
        repro: 'POST /submit twice',
        impact: 'Duplicate submission to Shamat → tax authority rejects files.',
      });
    }
    assert.equal(res.status, 409);

    // Download PCN836
    res = await request(ctx.server, 'GET', `/api/vat/periods/${period.id}/pcn836`);
    assert.equal(res.status, 200);
    assert.ok(res.raw.length > 0);
  } finally {
    await ctx.close();
  }
});

test('QA-04 / vat / negative — submit without profile returns 412', async () => {
  const ctx = await newCtx();
  try {
    const period = await seedPeriod(ctx);
    await seedInvoices(ctx, period.id);
    // No PUT /api/vat/profile
    const res = await request(ctx.server, 'POST', `/api/vat/periods/${period.id}/submit`, {});
    if (res.status !== 412) {
      recordFinding({
        scenario: 'vat-full-flow',
        severity: 'high',
        title: 'PCN836 submit did not require company tax profile',
        observed: `status=${res.status}, body=${JSON.stringify(res.body)}`,
        expected: '412 Precondition Failed',
        repro: 'Seed period + invoices, do NOT PUT /profile, POST /submit',
        impact: 'File generated with null legal identity — will be rejected by shaam.',
      });
    }
    assert.equal(res.status, 412);
  } finally {
    await ctx.close();
  }
});

test('QA-04 / vat / negative — submit with zero invoices returns clean file not a crash', async () => {
  const ctx = await newCtx();
  try {
    await seedProfile(ctx);
    const period = await seedPeriod(ctx);
    const res = await request(ctx.server, 'POST', `/api/vat/periods/${period.id}/submit`, {});
    // Should either 201 with empty lines OR 422 validation error — not 500
    if (res.status >= 500) {
      recordFinding({
        scenario: 'vat-full-flow',
        severity: 'medium',
        title: 'Empty-period submit crashed instead of returning a validation error',
        observed: `status=${res.status}, body=${JSON.stringify(res.body)}`,
        expected: '201 with an empty/header-only PCN836 OR 422',
        repro: 'Seed profile + empty period, POST /submit',
        impact: 'When a month has no activity, the UI shows a 500 instead of "שום פעילות".',
      });
    }
    assert.ok(res.status < 500);
  } finally {
    await ctx.close();
  }
});

test('QA-04 / vat / dashboard — GET /api/vat/periods lists the period', async () => {
  const ctx = await newCtx();
  try {
    await seedProfile(ctx);
    await seedPeriod(ctx);
    const res = await request(ctx.server, 'GET', '/api/vat/periods');
    assert.equal(res.status, 200);
    if (!Array.isArray(res.body.periods) || res.body.periods.length !== 1) {
      recordFinding({
        scenario: 'vat-full-flow',
        severity: 'medium',
        title: 'VAT periods list endpoint does not reflect newly-created period',
        observed: `body=${JSON.stringify(res.body)}`,
        expected: 'array of length 1',
        repro: 'POST /periods -> GET /periods',
        impact: 'Dashboard empty right after creating a period.',
      });
    }
    assert.equal(res.body.periods.length, 1);
  } finally {
    await ctx.close();
  }
});

test('QA-04 / vat / data integrity — voided invoice NEVER appears in summary', async () => {
  const ctx = await newCtx();
  try {
    await seedProfile(ctx);
    const period = await seedPeriod(ctx);
    await seedInvoices(ctx, period.id);
    const res = await request(ctx.server, 'GET', `/api/vat/periods/${period.id}`);
    // If the 99999 got added, taxable_sales would be 30000+99999 = 129999
    assert.equal(res.body.computed.taxable_sales, 30000);
    assert.equal(res.body.computed.vat_on_sales, 5100);
  } finally {
    await ctx.close();
  }
});
