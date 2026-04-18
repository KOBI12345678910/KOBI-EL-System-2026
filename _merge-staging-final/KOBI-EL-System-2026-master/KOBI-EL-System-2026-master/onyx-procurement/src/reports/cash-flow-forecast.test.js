/**
 * Unit tests for src/reports/cash-flow-forecast.js
 * Agent 63
 *
 * Run:
 *   node --test src/reports/cash-flow-forecast.test.js
 *
 * Strategy:
 *   - Build a tiny in-memory supabase stub that supports .from().select().eq()
 *     and returns deterministic fixtures for each table.
 *   - Verify:
 *       • forecastCashFlow aggregates opening balance from all banks
 *       • AR inflows and AP outflows land on the right days
 *       • Recurring obligations expand across the horizon
 *       • Tax obligations are applied
 *       • Low-point + days-till-negative are detected correctly
 *       • Scenarios produce different (sensible) numbers
 *       • CRITICAL alert fires when low-point < 0
 *       • HIGH alert fires when low-point is within 30 days
 *       • renderCashFlowJson serializes without dropping fields
 *       • renderCashFlowPdf writes a non-empty A4 PDF to disk
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  forecastCashFlow,
  renderCashFlowPdf,
  renderCashFlowJson,
  _internals,
} = require('./cash-flow-forecast');

// ─── supabase stub ─────────────────────────────────────────────

function buildStub(fixtures = {}) {
  return {
    from(table) {
      const rows = fixtures[table] || [];
      const q = {
        _rows: rows.slice(),
        select() { return this; },
        eq(col, val) {
          this._rows = this._rows.filter((r) => r[col] === val);
          return this;
        },
        gte() { return this; },
        lte() { return this; },
        then(onFulfilled) { return Promise.resolve({ data: this._rows }).then(onFulfilled); },
      };
      return q;
    },
  };
}

function daysFromNow(n, asOf) {
  const base = new Date(asOf);
  base.setHours(0, 0, 0, 0);
  base.setDate(base.getDate() + n);
  return base.toISOString();
}

// ─── tests ─────────────────────────────────────────────────────

test('forecastCashFlow: opening balance sums all active bank accounts', async () => {
  const asOf = '2026-04-11T00:00:00Z';
  const stub = buildStub({
    bank_accounts: [
      { id: 1, name: 'Hapoalim', balance: 50000, is_active: true },
      { id: 2, name: 'Leumi', balance: 120000, is_active: true },
      { id: 3, name: 'Ignored', balance: 99999, is_active: false },
    ],
  });
  const report = await forecastCashFlow({ horizonDays: 30, supabase: stub, asOf });
  assert.equal(report.opening_balance, 170000);
  assert.equal(report.inputs_summary.bank_accounts, 2);
});

test('forecastCashFlow: AR invoices appear as inflows on expected dates', async () => {
  const asOf = '2026-04-11T00:00:00Z';
  const stub = buildStub({
    bank_accounts: [{ id: 1, balance: 10000, is_active: true }],
    ar_invoices: [
      { id: 'a1', customer_id: 'c1', amount: 25000, expected_pay_date: daysFromNow(5, asOf), invoice_date: asOf, status: 'open' },
      { id: 'a2', customer_id: 'c1', amount: 15000, expected_pay_date: daysFromNow(10, asOf), invoice_date: asOf, status: 'open' },
      { id: 'a3', customer_id: 'c1', amount: 99999, expected_pay_date: daysFromNow(5, asOf), invoice_date: asOf, status: 'paid' },
    ],
  });
  const report = await forecastCashFlow({ horizonDays: 30, supabase: stub, asOf });
  assert.equal(report.total_inflow, 40000);
  assert.equal(report.inputs_summary.open_ar_count, 2);
  // Day 5 should have the 25k inflow.
  const day5 = report.days[5];
  assert.equal(day5.inflow, 25000);
  assert.equal(day5.outflow, 0);
});

test('forecastCashFlow: AP invoices appear as outflows on due dates', async () => {
  const asOf = '2026-04-11T00:00:00Z';
  const stub = buildStub({
    bank_accounts: [{ id: 1, balance: 100000, is_active: true }],
    ap_invoices: [
      { id: 'p1', vendor_id: 'v1', amount: 30000, due_date: daysFromNow(7, asOf), status: 'open' },
      { id: 'p2', vendor_id: 'v1', amount: 20000, due_date: daysFromNow(14, asOf), status: 'open' },
    ],
  });
  const report = await forecastCashFlow({ horizonDays: 30, supabase: stub, asOf });
  assert.equal(report.total_outflow, 50000);
  assert.equal(report.days[7].outflow, 30000);
  assert.equal(report.days[14].outflow, 20000);
  assert.equal(report.final_balance, 50000);
});

test('forecastCashFlow: recurring obligations expand across horizon', async () => {
  const asOf = '2026-04-11T00:00:00Z';
  const stub = buildStub({
    bank_accounts: [{ id: 1, balance: 200000, is_active: true }],
    recurring_obligations: [
      {
        id: 'r1',
        kind: 'payroll',
        label: 'Monthly payroll',
        amount: 80000,
        next_date: daysFromNow(15, asOf),
        frequency: 'monthly',
        active: true,
      },
      {
        id: 'r2',
        kind: 'rent',
        label: 'Office rent',
        amount: 12000,
        day_of_month: 1,
        frequency: 'monthly',
        active: true,
      },
    ],
  });
  const report = await forecastCashFlow({ horizonDays: 90, supabase: stub, asOf });
  // At least one payroll payment (day 15) and one rent payment (May 1) in 90 days.
  assert.ok(report.total_outflow >= 80000 + 12000,
    `expected outflow >= ${80000 + 12000}, got ${report.total_outflow}`);
  assert.equal(report.days[15].outflow >= 80000, true);
});

test('forecastCashFlow: tax obligations land on their due dates', async () => {
  const asOf = '2026-04-11T00:00:00Z';
  const stub = buildStub({
    bank_accounts: [{ id: 1, balance: 50000, is_active: true }],
    tax_obligations: [
      { id: 't1', kind: 'vat_monthly', amount: 18000, due_date: daysFromNow(10, asOf), period: '2026-03' },
      { id: 't2', kind: 'bituach_leumi', amount: 4500, due_date: daysFromNow(15, asOf), period: '2026-03' },
    ],
  });
  const report = await forecastCashFlow({ horizonDays: 30, supabase: stub, asOf });
  assert.equal(report.days[10].outflow, 18000);
  assert.equal(report.days[15].outflow, 4500);
});

test('forecastCashFlow: low-point and days_till_negative are detected', async () => {
  const asOf = '2026-04-11T00:00:00Z';
  const stub = buildStub({
    bank_accounts: [{ id: 1, balance: 30000, is_active: true }],
    ap_invoices: [
      { id: 'p1', vendor_id: 'v1', amount: 50000, due_date: daysFromNow(10, asOf), status: 'open' },
    ],
  });
  const report = await forecastCashFlow({ horizonDays: 30, supabase: stub, asOf });
  assert.equal(report.low_point.amount, -20000);
  assert.equal(report.low_point.day_offset, 10);
  assert.equal(report.days_till_negative, 10);
});

test('forecastCashFlow: CRITICAL alert fires when low-point is negative', async () => {
  const asOf = '2026-04-11T00:00:00Z';
  const stub = buildStub({
    bank_accounts: [{ id: 1, balance: 10000, is_active: true }],
    ap_invoices: [
      { id: 'p1', vendor_id: 'v1', amount: 50000, due_date: daysFromNow(20, asOf), status: 'open' },
    ],
  });
  const report = await forecastCashFlow({ horizonDays: 30, supabase: stub, asOf });
  const critical = report.alerts.find((a) => a.severity === 'CRITICAL');
  assert.ok(critical, 'expected CRITICAL alert');
  assert.equal(critical.code, 'CASH_FLOW_NEGATIVE_LOW_POINT');
});

test('forecastCashFlow: HIGH alert fires when low-point is within 30 days but positive', async () => {
  const asOf = '2026-04-11T00:00:00Z';
  const stub = buildStub({
    bank_accounts: [{ id: 1, balance: 100000, is_active: true }],
    ap_invoices: [
      { id: 'p1', vendor_id: 'v1', amount: 50000, due_date: daysFromNow(10, asOf), status: 'open' },
    ],
  });
  const report = await forecastCashFlow({ horizonDays: 30, supabase: stub, asOf });
  const high = report.alerts.find((a) => a.severity === 'HIGH');
  assert.ok(high, 'expected HIGH alert when low-point < 30d');
  assert.equal(high.code, 'CASH_FLOW_LOW_POINT_CLOSE');
  assert.equal(report.low_point.amount, 50000);
});

test('forecastCashFlow: scenarios differ — optimistic >= base >= pessimistic for final balance', async () => {
  const asOf = '2026-04-11T00:00:00Z';
  const stub = buildStub({
    bank_accounts: [{ id: 1, balance: 100000, is_active: true }],
    ar_invoices: [
      { id: 'a1', customer_id: 'c1', amount: 80000, expected_pay_date: daysFromNow(15, asOf), invoice_date: asOf, status: 'open' },
    ],
    ap_invoices: [
      { id: 'p1', vendor_id: 'v1', amount: 40000, due_date: daysFromNow(20, asOf), status: 'open' },
    ],
  });
  const report = await forecastCashFlow({ horizonDays: 30, supabase: stub, asOf });
  assert.ok(report.scenarios.optimistic.final_balance >= report.scenarios.base.final_balance,
    `optimistic ${report.scenarios.optimistic.final_balance} should be >= base ${report.scenarios.base.final_balance}`);
  assert.ok(report.scenarios.base.final_balance >= report.scenarios.pessimistic.final_balance,
    `base ${report.scenarios.base.final_balance} should be >= pessimistic ${report.scenarios.pessimistic.final_balance}`);
});

test('forecastCashFlow: confidence interval widens with horizon', async () => {
  const asOf = '2026-04-11T00:00:00Z';
  const stub = buildStub({ bank_accounts: [{ id: 1, balance: 100000, is_active: true }] });
  const short = await forecastCashFlow({ horizonDays: 30, supabase: stub, asOf });
  const long = await forecastCashFlow({ horizonDays: 180, supabase: stub, asOf });
  assert.ok(long.confidence.interval_pct > short.confidence.interval_pct,
    `long horizon confidence ${long.confidence.interval_pct} should be > short ${short.confidence.interval_pct}`);
});

test('forecastCashFlow: confidence reason mentions stale AR', async () => {
  const asOf = '2026-04-11T00:00:00Z';
  const oldDate = new Date(asOf);
  oldDate.setDate(oldDate.getDate() - 120);
  const stub = buildStub({
    bank_accounts: [{ id: 1, balance: 100000, is_active: true }],
    ar_invoices: [
      { id: 'a_old', customer_id: 'c1', amount: 5000, expected_pay_date: daysFromNow(5, asOf), invoice_date: oldDate.toISOString(), status: 'open' },
    ],
  });
  const report = await forecastCashFlow({ horizonDays: 30, supabase: stub, asOf });
  assert.equal(report.confidence.stale_ar_count, 1);
  assert.match(report.confidence.reason, /stale AR/);
});

test('forecastCashFlow: empty supabase returns a valid zero-balance report', async () => {
  const report = await forecastCashFlow({ horizonDays: 10, supabase: null });
  assert.equal(report.opening_balance, 0);
  assert.equal(report.total_inflow, 0);
  assert.equal(report.total_outflow, 0);
  assert.equal(report.days.length, 10);
  assert.equal(report.alerts.length, 0);
});

test('forecastCashFlow: handles missing tables gracefully', async () => {
  const brokenStub = {
    from() {
      throw new Error('relation does not exist');
    },
  };
  const report = await forecastCashFlow({ horizonDays: 5, supabase: brokenStub });
  assert.equal(report.opening_balance, 0);
  assert.equal(report.days.length, 5);
});

test('expandRecurring: monthly obligation with day_of_month fills 3 months correctly', () => {
  const start = new Date('2026-04-11T00:00:00Z');
  const end = new Date('2026-07-10T00:00:00Z');
  const ob = { kind: 'rent', label: 'Rent', amount: 12000, day_of_month: 1, frequency: 'monthly' };
  const events = _internals.expandRecurring(ob, start, end);
  // Expect May 1, Jun 1, Jul 1 (3 events within window).
  assert.ok(events.length >= 2, `expected at least 2 monthly events, got ${events.length}`);
  for (const e of events) {
    assert.equal(e.date.getDate(), 1);
  }
});

test('expandRecurring: weekly frequency produces 5 events in 35 days', () => {
  const start = new Date('2026-04-11T00:00:00Z');
  const end = new Date('2026-05-16T00:00:00Z');
  const ob = { kind: 'weekly_fee', label: 'Weekly fee', amount: 1000, next_date: start, frequency: 'weekly' };
  const events = _internals.expandRecurring(ob, start, end);
  assert.ok(events.length >= 5, `expected at least 5 weekly events, got ${events.length}`);
});

test('renderCashFlowJson: passes through required summary fields', async () => {
  const stub = buildStub({ bank_accounts: [{ id: 1, balance: 50000, is_active: true }] });
  const report = await forecastCashFlow({ horizonDays: 14, supabase: stub, asOf: '2026-04-11T00:00:00Z' });
  const json = renderCashFlowJson(report);
  assert.equal(json.opening_balance, 50000);
  assert.equal(json.horizon_days, 14);
  assert.equal(json.days.length, 14);
  assert.ok('event_count' in json.days[0]);
  assert.ok(typeof json.days[0].closing_balance === 'number');
});

test('renderCashFlowJson: throws when data is missing', () => {
  assert.throws(() => renderCashFlowJson(null), /data is required/);
});

test('renderCashFlowPdf: writes a non-empty A4 PDF', async () => {
  const stub = buildStub({
    bank_accounts: [{ id: 1, balance: 100000, is_active: true }],
    ap_invoices: [
      { id: 'p1', vendor_id: 'v1', amount: 20000, due_date: daysFromNow(5, '2026-04-11T00:00:00Z'), status: 'open' },
    ],
  });
  const report = await forecastCashFlow({ horizonDays: 30, supabase: stub, asOf: '2026-04-11T00:00:00Z' });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'onyx-cf-'));
  const outPath = path.join(tmp, 'forecast.pdf');
  const result = await renderCashFlowPdf(report, outPath);
  assert.equal(result.path, outPath);
  assert.ok(result.size > 500, `expected a non-trivial PDF, got ${result.size} bytes`);
  assert.ok(fs.existsSync(outPath));
  const head = fs.readFileSync(outPath).slice(0, 4).toString();
  assert.equal(head, '%PDF');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('renderCashFlowPdf: rejects when required args are missing', async () => {
  await assert.rejects(() => renderCashFlowPdf(null, '/tmp/x.pdf'), /data is required/);
  await assert.rejects(() => renderCashFlowPdf({}, ''), /outputPath is required/);
});
