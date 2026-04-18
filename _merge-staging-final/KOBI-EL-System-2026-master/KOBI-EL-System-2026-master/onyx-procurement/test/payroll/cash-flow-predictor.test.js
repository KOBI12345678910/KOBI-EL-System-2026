/**
 * Predictive Cash-Flow Analytics — Unit Tests
 * Agent X-04 — Techno-Kol Uzi ERP / Swarm 3 — 2026-04-11
 *
 * Run with:   node --test test/payroll/cash-flow-predictor.test.js
 *
 * Coverage (15+ synthetic cases):
 *   1.  Module loads and exports public surface
 *   2.  predictCashFlow: empty-inputs degrades gracefully
 *   3.  predictCashFlow: deterministic under fixed seed
 *   4.  predictCashFlow: 30/60/90 horizons all present and monotonic
 *   5.  predictCashFlow: opening balance flows through
 *   6.  predictCashFlow: payroll (25th) appears as outflow
 *   7.  predictCashFlow: NI/tax (15th) + VAT (bi-monthly) appear
 *   8.  predictCashFlow: negative-balance days trigger alerts
 *   9.  estimateClientPaymentDate: uses history avg_days_to_pay
 *  10.  estimateClientPaymentDate: falls back to default when no history
 *  11.  estimateClientPaymentDate: sparse history → low confidence
 *  12.  estimateClientPaymentDate: rich history → high confidence
 *  13.  identifyLiquidityRisk: flags CRITICAL when p10<0 & prob≥0.5
 *  14.  identifyLiquidityRisk: flags HIGH when 0.25≤prob<0.5
 *  15.  backtestModel: returns MAPE/RMSE on ≥14 points
 *  16.  backtestModel: returns null when too few points
 *  17.  seasonal index: DoW/DoM/MoY populated with enough data
 *  18.  Israeli holidays: Pesach window dampens collections
 *  19.  End-of-quarter push: invoices due in last 5 days shift earlier
 *  20.  Monte Carlo: P10 ≤ P50 ≤ P90 invariant holds every day
 *  21.  Client default risk: 100% risk → zero inflow from that client
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const predictor = require(
  path.resolve(__dirname, '..', '..', 'src', 'analytics', 'cash-flow-predictor.js')
);
const {
  predictCashFlow,
  estimateClientPaymentDate,
  identifyLiquidityRisk,
  backtestModel,
  _internals,
} = predictor;

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
const ASOF = '2026-04-11';

function daysFromAsof(n) {
  const d = new Date(ASOF);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d.toISOString();
}

function makeHistorical(nDays, makeRow) {
  const out = [];
  const d = new Date(ASOF);
  d.setHours(0, 0, 0, 0);
  for (let i = 0; i < nDays; i++) {
    const dt = new Date(d);
    dt.setDate(dt.getDate() - (nDays - i));
    out.push(makeRow(i, dt));
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// 1. Module loads and exposes public surface
// ─────────────────────────────────────────────────────────────
test('1) exports: predictor exposes required public API', () => {
  assert.equal(typeof predictCashFlow, 'function');
  assert.equal(typeof estimateClientPaymentDate, 'function');
  assert.equal(typeof identifyLiquidityRisk, 'function');
  assert.equal(typeof backtestModel, 'function');
  assert.ok(_internals, '_internals exposed for tests');
});

// ─────────────────────────────────────────────────────────────
// 2. Empty inputs still return a sane structure
// ─────────────────────────────────────────────────────────────
test('2) predictCashFlow: empty inputs returns full structure', () => {
  const r = predictCashFlow({ asOf: ASOF, openingBalance: 10000, iterations: 100, seed: 1 });
  assert.ok(r.daily_forecast['30']);
  assert.ok(r.daily_forecast['60']);
  assert.ok(r.daily_forecast['90']);
  assert.equal(r.daily_forecast['30'].length, 30);
  assert.equal(r.daily_forecast['60'].length, 60);
  assert.equal(r.daily_forecast['90'].length, 90);
  assert.ok(Array.isArray(r.alerts));
  assert.ok(Array.isArray(r.assumptions));
});

// ─────────────────────────────────────────────────────────────
// 3. Deterministic under fixed seed
// ─────────────────────────────────────────────────────────────
test('3) predictCashFlow: deterministic under fixed seed', () => {
  const base = {
    asOf: ASOF,
    openingBalance: 200000,
    openInvoices: [
      { id: 1, client_id: 'A', amount: 25000, issued_at: daysFromAsof(-5) },
      { id: 2, client_id: 'B', amount: 40000, issued_at: daysFromAsof(-10) },
    ],
    clientHistory: {
      A: { avg_days_to_pay: 35, std_dev_days: 7, n_samples: 20 },
      B: { avg_days_to_pay: 28, std_dev_days: 5, n_samples: 50 },
    },
    payroll: [{ amount: 30000 }],
    taxProfile: { ni_monthly: 4000, income_tax_monthly: 3000, vat_bimonthly: 8000 },
    iterations: 300,
    seed: 12345,
  };
  const r1 = predictCashFlow(base);
  const r2 = predictCashFlow(base);
  assert.deepEqual(r1.daily_forecast['30'].map((b) => b.p50), r2.daily_forecast['30'].map((b) => b.p50));
  assert.deepEqual(r1.daily_forecast['90'].map((b) => b.p10), r2.daily_forecast['90'].map((b) => b.p10));
});

// ─────────────────────────────────────────────────────────────
// 4. 30/60/90 horizons present, offsets strictly increasing
// ─────────────────────────────────────────────────────────────
test('4) daily_forecast has 30/60/90 and strictly increasing offsets', () => {
  const r = predictCashFlow({ asOf: ASOF, openingBalance: 50000, iterations: 100, seed: 7 });
  for (const h of ['30', '60', '90']) {
    const list = r.daily_forecast[h];
    for (let i = 1; i < list.length; i++) {
      assert.equal(list[i].day_offset, list[i - 1].day_offset + 1);
    }
  }
});

// ─────────────────────────────────────────────────────────────
// 5. Opening balance flows through when no events
// ─────────────────────────────────────────────────────────────
test('5) opening balance flows through when no events at all', () => {
  const r = predictCashFlow({ asOf: ASOF, openingBalance: 75000, iterations: 100, seed: 2 });
  // First day P50 should be approximately opening balance (no inflows, no outflows scheduled)
  const first = r.daily_forecast['30'][0];
  assert.equal(first.p50, 75000);
  // Final day also 75000 (no activity)
  const last = r.daily_forecast['30'][29];
  assert.equal(last.p50, 75000);
});

// ─────────────────────────────────────────────────────────────
// 6. Payroll on the 25th appears as outflow in deterministic events
// ─────────────────────────────────────────────────────────────
test('6) Israeli payroll — 25th of the month appears in outflows', () => {
  const asOf = startOfDay('2026-04-11');
  const events = _internals.generateIsraeliOutflows(
    { payroll: [{ amount: 50000 }] },
    asOf,
    _internals.addDays(asOf, 60)
  );
  const payrollEvents = events.filter((e) => e.kind === 'payroll');
  assert.ok(payrollEvents.length >= 1, 'at least one payroll event');
  for (const e of payrollEvents) {
    const d = new Date(e.date);
    // 25th, possibly shifted forward if weekend
    const day = d.getDate();
    assert.ok(day === 25 || day === 26 || day === 27,
      `payroll day should be 25 (or shifted): got ${day}`);
    assert.equal(e.amount, -50000);
  }
});

// ─────────────────────────────────────────────────────────────
// 7. NI/tax on 15th + VAT bi-monthly when taxProfile supplied
// ─────────────────────────────────────────────────────────────
test('7) NI/tax 15th and VAT bi-monthly appear from taxProfile', () => {
  const asOf = startOfDay('2026-04-01');
  const events = _internals.generateIsraeliOutflows(
    { taxProfile: { ni_monthly: 5000, income_tax_monthly: 3000, vat_bimonthly: 12000 } },
    asOf,
    _internals.addDays(asOf, 120)
  );
  const ni = events.filter((e) => e.kind === 'national_insurance');
  const tax = events.filter((e) => e.kind === 'income_tax');
  const vat = events.filter((e) => e.kind === 'vat');
  assert.ok(ni.length >= 3, 'at least 3 NI months in 120 days');
  assert.ok(tax.length >= 3, 'at least 3 income tax months in 120 days');
  assert.ok(vat.length >= 1, 'at least one VAT bi-monthly event');
  // VAT must be in an even month (bi-monthly: Feb/Apr/Jun/Aug/Oct/Dec — month idx odd)
  for (const v of vat) {
    const m = new Date(v.date).getMonth();
    assert.ok(m % 2 === 1, `VAT month should be bi-monthly even month: ${m}`);
  }
});

// ─────────────────────────────────────────────────────────────
// 8. Negative-balance days trigger alerts
// ─────────────────────────────────────────────────────────────
test('8) negative-balance days generate alerts', () => {
  const r = predictCashFlow({
    asOf: ASOF,
    openingBalance: 5000, // deliberately tiny
    payroll: [{ amount: 80000 }],
    taxProfile: { ni_monthly: 5000, income_tax_monthly: 4000, vat_bimonthly: 12000 },
    iterations: 300,
    seed: 99,
  });
  assert.ok(r.alerts.length > 0, 'should have alerts');
  const criticals = r.alerts.filter((a) => a.severity === 'CRITICAL' || a.severity === 'HIGH');
  assert.ok(criticals.length > 0, 'should have at least one CRITICAL or HIGH alert');
});

// ─────────────────────────────────────────────────────────────
// 9. estimateClientPaymentDate uses history
// ─────────────────────────────────────────────────────────────
test('9) estimateClientPaymentDate uses avg_days_to_pay from history', () => {
  const est = estimateClientPaymentDate(
    { id: 'INV-1', client_id: 'X', amount: 10000, issued_at: '2026-04-01' },
    { X: { avg_days_to_pay: 45, std_dev_days: 5, n_samples: 30 } }
  );
  assert.equal(est.avg_days_to_pay, 45);
  assert.equal(est.source, 'history');
  // Expected date = 2026-04-01 + 45 days = 2026-05-16
  assert.equal(est.expected_date, '2026-05-16');
  assert.ok(est.confidence > 0.5, 'confidence > 0.5 with 30 samples and low CV');
});

// ─────────────────────────────────────────────────────────────
// 10. estimateClientPaymentDate — default when no history
// ─────────────────────────────────────────────────────────────
test('10) estimateClientPaymentDate falls back to default when no history', () => {
  const est = estimateClientPaymentDate(
    { id: 'INV-2', client_id: 'unknown', amount: 10000, issued_at: '2026-04-01' },
    {}
  );
  assert.equal(est.source, 'default');
  assert.equal(est.n_samples, 0);
  // default avg = 30
  assert.equal(est.avg_days_to_pay, 30);
  // confidence in the floor band
  assert.ok(est.confidence <= 0.4);
});

// ─────────────────────────────────────────────────────────────
// 11. Sparse history → low_sample source & lower confidence
// ─────────────────────────────────────────────────────────────
test('11) estimateClientPaymentDate: sparse history → low_sample', () => {
  const sparseHistory = {
    Y: { avg_days_to_pay: 40, std_dev_days: 8, n_samples: 2 },
  };
  const est = estimateClientPaymentDate(
    { id: 'INV-3', client_id: 'Y', amount: 5000, issued_at: '2026-04-01', due_date: '2026-05-01' },
    sparseHistory
  );
  assert.equal(est.source, 'low_sample');
  // Falls back to due_date
  assert.equal(est.expected_date, '2026-05-01');
});

// ─────────────────────────────────────────────────────────────
// 12. Rich history → high confidence
// ─────────────────────────────────────────────────────────────
test('12) estimateClientPaymentDate: rich history → high confidence', () => {
  const est = estimateClientPaymentDate(
    { id: 'INV-4', client_id: 'BigClient', amount: 100000, issued_at: '2026-04-01' },
    { BigClient: { avg_days_to_pay: 30, std_dev_days: 2, n_samples: 100 } }
  );
  assert.ok(est.confidence >= 0.8, `rich+low-cv history should give ≥0.8 confidence, got ${est.confidence}`);
});

// ─────────────────────────────────────────────────────────────
// 13. identifyLiquidityRisk flags CRITICAL
// ─────────────────────────────────────────────────────────────
test('13) identifyLiquidityRisk flags CRITICAL when p10<0 & prob≥0.5', () => {
  const fake = {
    daily_forecast: {
      '30': [
        { date: '2026-04-12', day_offset: 1, p10: -50000, p50: -10000, p90: 20000, prob_negative: 0.7 },
        { date: '2026-04-13', day_offset: 2, p10: 10000, p50: 20000, p90: 30000, prob_negative: 0.0 },
      ],
    },
  };
  const risks = identifyLiquidityRisk(fake);
  assert.equal(risks.length, 1);
  assert.equal(risks[0].severity, 'CRITICAL');
});

// ─────────────────────────────────────────────────────────────
// 14. identifyLiquidityRisk flags HIGH for moderate probability
// ─────────────────────────────────────────────────────────────
test('14) identifyLiquidityRisk flags HIGH when 0.25 ≤ prob < 0.5', () => {
  const fake = {
    daily_forecast: {
      '30': [
        { date: '2026-04-12', day_offset: 1, p10: -5000, p50: 10000, p90: 30000, prob_negative: 0.30 },
      ],
    },
  };
  const risks = identifyLiquidityRisk(fake);
  assert.equal(risks.length, 1);
  assert.equal(risks[0].severity, 'HIGH');
});

// ─────────────────────────────────────────────────────────────
// 15. backtestModel on 60 days of synthetic history
// ─────────────────────────────────────────────────────────────
test('15) backtestModel returns MAPE/RMSE on ≥14 points', () => {
  const historical = makeHistorical(60, (_i, d) => ({
    date: d.toISOString(),
    inflow: 10000 + (d.getDay() === 0 ? 5000 : 0), // Sunday = higher
    outflow: 8000,
  }));
  const bt = backtestModel(historical);
  assert.ok(typeof bt.mape === 'number' || bt.mape === null);
  assert.ok(typeof bt.rmse === 'number' || bt.rmse === null);
  assert.ok(bt.n_points > 0);
  assert.equal(bt.total_rows, 60);
  assert.ok(bt.coverage_p10_p90 !== null);
  assert.ok(bt.coverage_p10_p90 >= 0 && bt.coverage_p10_p90 <= 1);
});

// ─────────────────────────────────────────────────────────────
// 16. backtestModel with too few rows returns null
// ─────────────────────────────────────────────────────────────
test('16) backtestModel returns null when < 14 rows', () => {
  const bt = backtestModel([{ date: '2026-04-01', inflow: 100, outflow: 50 }]);
  assert.equal(bt.mape, null);
  assert.equal(bt.rmse, null);
  assert.equal(bt.coverage_p10_p90, null);
  assert.ok(bt.note && bt.note.length > 0);
});

// ─────────────────────────────────────────────────────────────
// 17. seasonal_index populated with enough historical rows
// ─────────────────────────────────────────────────────────────
test('17) seasonal_index populated when historical has ≥ SEASONAL_MIN_SAMPLES', () => {
  const historical = makeHistorical(90, (i, d) => ({
    date: d.toISOString(),
    inflow: 12000 + (d.getDay() * 500),
    outflow: 9000,
  }));
  const r = predictCashFlow({
    asOf: ASOF,
    openingBalance: 100000,
    historical,
    iterations: 100,
    seed: 1,
  });
  assert.equal(r.seasonal_index.n_samples, 90);
  assert.equal(r.seasonal_index.dow.length, 7);
  assert.equal(r.seasonal_index.dom.length, 32);
  assert.equal(r.seasonal_index.moy.length, 12);
  // All DoW values should be finite numbers
  for (const v of r.seasonal_index.dow) {
    assert.ok(Number.isFinite(v));
  }
  // Backtest should be populated
  assert.ok(r.backtest !== null);
});

// ─────────────────────────────────────────────────────────────
// 18. Holiday dampening — Pesach 2026 window detected
// ─────────────────────────────────────────────────────────────
test('18) holidayForDate detects Pesach 2026 window', () => {
  const inside = _internals.holidayForDate('2026-04-05'); // during Pesach 2026 (4/1 – 4/9)
  assert.ok(inside, 'should detect Pesach window');
  assert.equal(inside.name_en, 'Pesach');
  const outside = _internals.holidayForDate('2026-06-15');
  assert.equal(outside, null, 'should NOT detect outside window');
});

// ─────────────────────────────────────────────────────────────
// 19. End-of-quarter push — last 5 days of Q2 (June 26..30)
// ─────────────────────────────────────────────────────────────
test('19) end-of-quarter window detected for last 5 days of Q2 (Jun 26–30)', () => {
  assert.equal(_internals.isEndOfQuarterWindow('2026-06-30'), true);
  assert.equal(_internals.isEndOfQuarterWindow('2026-06-26'), true);
  assert.equal(_internals.isEndOfQuarterWindow('2026-06-25'), false);
  assert.equal(_internals.isEndOfQuarterWindow('2026-06-15'), false);
  // Shift invoice due 6/30 → 6/27
  const shifted = _internals.applyEndOfQuarterPush(new Date('2026-06-30'));
  const offset = Math.round((new Date('2026-06-30') - shifted) / (24 * 60 * 60 * 1000));
  assert.equal(offset, 3);
});

// ─────────────────────────────────────────────────────────────
// 20. Monte Carlo invariant: P10 ≤ P50 ≤ P90 every day
// ─────────────────────────────────────────────────────────────
test('20) Monte Carlo invariant P10 ≤ P50 ≤ P90 holds every day', () => {
  const r = predictCashFlow({
    asOf: ASOF,
    openingBalance: 150000,
    openInvoices: [
      { id: 1, client_id: 'A', amount: 30000, issued_at: daysFromAsof(-3) },
      { id: 2, client_id: 'B', amount: 20000, issued_at: daysFromAsof(-8) },
      { id: 3, client_id: 'C', amount: 45000, issued_at: daysFromAsof(-15) },
    ],
    clientHistory: {
      A: { avg_days_to_pay: 25, std_dev_days: 4, n_samples: 30 },
      B: { avg_days_to_pay: 40, std_dev_days: 8, n_samples: 25 },
      C: { avg_days_to_pay: 60, std_dev_days: 15, n_samples: 10 },
    },
    payroll: [{ amount: 40000 }],
    taxProfile: { ni_monthly: 5000, income_tax_monthly: 4000, vat_bimonthly: 12000 },
    iterations: 500,
    seed: 777,
  });
  for (const h of ['30', '60', '90']) {
    for (const b of r.daily_forecast[h]) {
      assert.ok(b.p10 <= b.p50, `day ${b.date}: p10 > p50 (${b.p10} > ${b.p50})`);
      assert.ok(b.p50 <= b.p90, `day ${b.date}: p50 > p90 (${b.p50} > ${b.p90})`);
      assert.ok(b.prob_negative >= 0 && b.prob_negative <= 1);
    }
  }
});

// ─────────────────────────────────────────────────────────────
// 21. Client default risk 100% → invoices from that client excluded
// ─────────────────────────────────────────────────────────────
test('21) client default_risk=1.0 eliminates all inflow from that client', () => {
  const r = predictCashFlow({
    asOf: ASOF,
    openingBalance: 0,
    openInvoices: [
      { id: 1, client_id: 'BadPayer', amount: 500000, issued_at: daysFromAsof(-5) },
    ],
    clientHistory: {
      BadPayer: { avg_days_to_pay: 30, std_dev_days: 5, default_risk: 1.0, n_samples: 20 },
    },
    iterations: 500,
    seed: 1,
  });
  // Every day should stay at 0 (no inflow, no outflow)
  for (const b of r.daily_forecast['30']) {
    assert.equal(b.p50, 0);
    assert.equal(b.p90, 0);
  }
});

// ─────────────────────────────────────────────────────────────
// 22. scheduledBills explicit AP events reduce balance
// ─────────────────────────────────────────────────────────────
test('22) scheduledBills reduce balance on their due_date', () => {
  const bill_date = daysFromAsof(10);
  const r = predictCashFlow({
    asOf: ASOF,
    openingBalance: 100000,
    scheduledBills: [{ id: 'BILL-1', amount: 30000, due_date: bill_date }],
    iterations: 100,
    seed: 4,
  });
  // Day 9 (before) should still have 100k, day 10+ should drop
  const before = r.daily_forecast['30'][9];
  const after = r.daily_forecast['30'][10];
  assert.equal(before.p50, 100000);
  assert.equal(after.p50, 70000);
});

// ─────────────────────────────────────────────────────────────
// 23. mulberry32 PRNG deterministic + reasonable distribution
// ─────────────────────────────────────────────────────────────
test('23) mulberry32 PRNG is deterministic and approximately uniform', () => {
  const rand1 = _internals.mulberry32(42);
  const rand2 = _internals.mulberry32(42);
  for (let i = 0; i < 100; i++) {
    assert.equal(rand1(), rand2());
  }
  // Mean should be ~0.5
  const rand3 = _internals.mulberry32(12345);
  let sum = 0;
  const N = 5000;
  for (let i = 0; i < N; i++) sum += rand3();
  const mean = sum / N;
  assert.ok(Math.abs(mean - 0.5) < 0.03, `mean should be ~0.5, got ${mean}`);
});

// ─────────────────────────────────────────────────────────────
// 24. randn (Box–Muller) approximately standard normal
// ─────────────────────────────────────────────────────────────
test('24) randn is approximately N(0,1)', () => {
  const rand = _internals.mulberry32(2026);
  const samples = new Array(5000).fill(0).map(() => _internals.randn(rand));
  const mean = samples.reduce((s, x) => s + x, 0) / samples.length;
  const variance = samples.reduce((s, x) => s + (x - mean) * (x - mean), 0) / samples.length;
  assert.ok(Math.abs(mean) < 0.1, `randn mean should be ~0, got ${mean}`);
  assert.ok(Math.abs(variance - 1) < 0.1, `randn variance should be ~1, got ${variance}`);
});

// ─────────────────────────────────────────────────────────────
// 25. Israeli business day: Fri/Sat not business days
// ─────────────────────────────────────────────────────────────
test('25) isBusinessDay: Sun-Thu yes, Fri-Sat no', () => {
  const dates = {
    // 2026-04-12 was Sunday, 13=Mon, ..., 16=Thu, 17=Fri, 18=Sat
    '2026-04-12': true,  // Sun
    '2026-04-13': true,  // Mon
    '2026-04-16': true,  // Thu
    '2026-04-17': false, // Fri
    '2026-04-18': false, // Sat
  };
  for (const [iso, expected] of Object.entries(dates)) {
    assert.equal(
      _internals.isBusinessDay(iso),
      expected,
      `${iso} business-day expected=${expected}`
    );
  }
});

// ─────────────────────────────────────────────────────────────
// 26. buildSeasonalIndex: DoW factor reflects variation
// ─────────────────────────────────────────────────────────────
test('26) seasonal index DoW factor shows weekly pattern', () => {
  // Historical where Sundays have 5× the net
  const historical = makeHistorical(100, (_i, d) => ({
    date: d.toISOString(),
    inflow: d.getDay() === 0 ? 50000 : 10000,
    outflow: 0,
  }));
  const idx = _internals.buildSeasonalIndex(historical);
  // Sunday factor should be the largest
  const sundayFactor = idx.dow[0];
  const otherFactors = idx.dow.slice(1);
  for (const f of otherFactors) {
    assert.ok(sundayFactor >= f, `Sunday DoW factor (${sundayFactor}) should be ≥ ${f}`);
  }
});

// ─────────────────────────────────────────────────────────────
// Helper: startOfDay (mirrors internal but tests the date helper)
// ─────────────────────────────────────────────────────────────
function startOfDay(d) {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  return dt;
}
