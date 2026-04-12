/**
 * Unit tests for src/reporting/ltv-calculator.js
 * Agent Y-193 — 2026-04-11
 *
 * Run:
 *   node --test test/reporting/ltv-calculator.test.js
 *
 * 22 test cases, all bilingual assertions covered.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  LTVCalculator,
  DEFAULT_WACC,
  HEALTH_BANDS,
  DAYS_PER_PERIOD,
  _internals,
} = require('../../src/reporting/ltv-calculator');

// ─── fixtures ──────────────────────────────────────────────────

function buildCustomer(overrides = {}) {
  return {
    id: 'C-001',
    name: 'בנייני אלפא בע"מ',
    segment: 'contractor',
    acquisitionDate: '2024-01-15',
    acquisitionCost: 1000,
    churned: false,
    transactions: [
      { id: 'T-1', date: '2024-02-01', revenue: 10000, cost: 7000 }, // margin 3000
      { id: 'T-2', date: '2024-08-01', revenue: 12000, cost: 8000 }, // margin 4000
      { id: 'T-3', date: '2025-02-01', revenue: 15000, cost: 9500 }, // margin 5500
      { id: 'T-4', date: '2025-08-01', revenue: 11000, cost: 7500 }, // margin 3500
    ],
    ...overrides,
  };
}

function buildCohort() {
  // 5 contractors, 1 retail, 2 churned among the contractors
  return [
    buildCustomer({ id: 'C-001', churned: false }),
    buildCustomer({
      id: 'C-002',
      churned: true,
      churnDate: '2025-06-01',
      transactions: [{ id: 'T-1', date: '2024-03-01', revenue: 8000, cost: 6000 }],
    }),
    buildCustomer({
      id: 'C-003',
      churned: false,
      transactions: [
        { id: 'T-1', date: '2024-04-01', revenue: 20000, cost: 14000 },
        { id: 'T-2', date: '2025-04-01', revenue: 22000, cost: 15000 },
      ],
    }),
    buildCustomer({
      id: 'C-004',
      churned: true,
      churnDate: '2024-12-01',
      transactions: [{ id: 'T-1', date: '2024-05-01', revenue: 5000, cost: 4000 }],
    }),
    buildCustomer({ id: 'C-005', churned: false }),
    buildCustomer({
      id: 'C-006',
      segment: 'retail',
      name: 'אדריכלית רינה',
      acquisitionCost: 500,
      churned: false,
      transactions: [
        { id: 'T-1', date: '2024-06-01', revenue: 3000, cost: 2000 },
        { id: 'T-2', date: '2025-06-01', revenue: 3500, cost: 2200 },
      ],
    }),
  ];
}

// ─── 1. constructor ────────────────────────────────────────────

test('constructor: accepts defaults and merges WACC overrides', () => {
  const calc = new LTVCalculator();
  assert.equal(calc.options.period, 'year');
  assert.equal(calc.options.projectedPeriods, 5);
  assert.equal(calc.options.wacc.riskFreeRate, DEFAULT_WACC.riskFreeRate);

  const calc2 = new LTVCalculator({ wacc: { riskFreeRate: 0.05 } });
  assert.equal(calc2.options.wacc.riskFreeRate, 0.05);
  assert.equal(calc2.options.wacc.beta, DEFAULT_WACC.beta);
});

test('constructor: rejects unknown period', () => {
  assert.throws(() => new LTVCalculator({ period: 'fortnight' }), /unknown period/);
});

// ─── 2. historicalLTV ──────────────────────────────────────────

test('historicalLTV: sums gross margin exactly for 4 tx', () => {
  const calc = new LTVCalculator();
  const r = calc.historicalLTV(buildCustomer());
  assert.equal(r.totalMargin, 16000);
  assert.equal(r.totalRevenue, 48000);
  assert.equal(r.totalCost, 32000);
  assert.equal(r.transactionCount, 4);
  assert.equal(r.method, 'historical');
  assert.equal(r.value, r.totalMargin);
});

test('historicalLTV: bilingual label present', () => {
  const calc = new LTVCalculator();
  const r = calc.historicalLTV(buildCustomer());
  assert.equal(r.label.he, 'LTV היסטורי');
  assert.equal(r.label.en, 'Historical LTV');
  assert.ok(r.label.bi.includes('/'));
});

test('historicalLTV: handles zero transactions gracefully', () => {
  const calc = new LTVCalculator();
  const r = calc.historicalLTV({ id: 'empty', transactions: [] });
  assert.equal(r.totalMargin, 0);
  assert.equal(r.transactionCount, 0);
  assert.equal(r.lifespanDays, 0);
  assert.equal(r.firstDate, null);
});

test('historicalLTV: uses supplied margin field when present', () => {
  const calc = new LTVCalculator();
  const r = calc.historicalLTV({
    id: 'C-X',
    acquisitionDate: '2024-01-01',
    transactions: [
      { id: 'T-1', date: '2024-02-01', revenue: 100, cost: 90, margin: 50 },
    ],
  });
  assert.equal(r.totalMargin, 50);
});

test('historicalLTV: rejects non-object input', () => {
  const calc = new LTVCalculator();
  assert.throws(() => calc.historicalLTV(null), /must be an object/);
  assert.throws(() => calc.historicalLTV(42), /must be an object/);
});

// ─── 3. predictiveLTV ──────────────────────────────────────────

test('predictiveLTV: uses explicit cohortChurnRate when supplied', () => {
  const calc = new LTVCalculator({ projectedPeriods: 3 });
  const r = calc.predictiveLTV(buildCustomer(), { cohortChurnRate: 0.2 });
  assert.equal(r.cohortChurnRate, 0.2);
  assert.equal(r.method, 'predictive');
  assert.equal(r.projectedPeriods, 3);
  assert.ok(r.value > 0);
  assert.equal(r.label.he, 'LTV חיזויי (cohort)');
});

test('predictiveLTV: derives churn from cohort array', () => {
  const calc = new LTVCalculator();
  const cohort = buildCohort();
  const customer = cohort[0]; // contractor
  const r = calc.predictiveLTV(customer, { cohort });
  // 5 contractors in the cohortId, 2 churned → 0.4
  assert.equal(r.cohortChurnRate, 0.4);
  assert.ok(r.value > 0);
});

test('predictiveLTV: falls back to defaultChurnRate when cohort empty', () => {
  const calc = new LTVCalculator({ defaultChurnRate: 0.25 });
  const r = calc.predictiveLTV(buildCustomer(), { cohort: [] });
  assert.equal(r.cohortChurnRate, 0.25);
});

test('predictiveLTV: bounded — higher churn yields lower value', () => {
  const calc = new LTVCalculator();
  const low = calc.predictiveLTV(buildCustomer(), { cohortChurnRate: 0.1 });
  const high = calc.predictiveLTV(buildCustomer(), { cohortChurnRate: 0.5 });
  assert.ok(low.value > high.value, 'lower churn must yield higher LTV');
});

test('cohortChurnRate: 2 of 5 contractors churned = 0.4', () => {
  const calc = new LTVCalculator();
  const cohort = buildCohort();
  const rate = calc.cohortChurnRate(cohort, cohort[0]);
  assert.equal(rate, 0.4);
});

// ─── 4. discountedLTV + WACC ───────────────────────────────────

test('computeWACC: equity-only default matches Rf+β·ERP+size', () => {
  const calc = new LTVCalculator();
  const wacc = calc.computeWACC();
  // 0.046 + 1.10 * 0.055 + 0.015 = 0.1215
  assert.equal(wacc, 0.1215);
});

test('computeWACC: applies debt tax shield', () => {
  const calc = new LTVCalculator({
    wacc: { debtWeight: 0.5, costOfDebt: 0.06, taxShield: 0.23 },
  });
  const wacc = calc.computeWACC();
  // 0.5*(0.046+1.1*0.055+0.015) + 0.5*0.06*(1-0.23)
  const expected = 0.5 * 0.1215 + 0.5 * 0.06 * 0.77;
  assert.ok(Math.abs(wacc - expected) < 1e-6, `${wacc} vs ${expected}`);
});

test('discountedLTV: returns per-period breakdown and NPV', () => {
  const calc = new LTVCalculator({ projectedPeriods: 3 });
  const r = calc.discountedLTV(buildCustomer(), { cohortChurnRate: 0.2 });
  assert.equal(r.method, 'discounted');
  assert.equal(r.perPeriod.length, 3);
  assert.ok(r.value > 0);
  assert.ok(r.wacc > 0);
  // discounted value should be smaller than simple sum of cashflows
  const sumCf = r.perPeriod.reduce((s, x) => s + x.cashflow, 0);
  assert.ok(r.value < sumCf, 'discounting must reduce value');
});

test('discountedLTV: bilingual label present', () => {
  const calc = new LTVCalculator();
  const r = calc.discountedLTV(buildCustomer(), { cohortChurnRate: 0.2 });
  assert.equal(r.label.he, 'LTV מהוון (DCF)');
  assert.equal(r.label.en, 'Discounted LTV (DCF)');
});

// ─── 5. segmentLTV ─────────────────────────────────────────────

test('segmentLTV: groups by segment and ranks by predictive total', () => {
  const calc = new LTVCalculator();
  const cohort = buildCohort();
  const segs = calc.segmentLTV(cohort);
  assert.equal(segs.length, 2);
  const contractor = segs.find((s) => s.segment === 'contractor');
  const retail = segs.find((s) => s.segment === 'retail');
  assert.ok(contractor, 'contractor segment exists');
  assert.ok(retail, 'retail segment exists');
  assert.equal(contractor.count, 5);
  assert.equal(retail.count, 1);
  // ranking: contractor has 5 customers → must beat retail
  assert.ok(contractor.totalPredictive > retail.totalPredictive);
  assert.equal(segs[0].segment, 'contractor');
  assert.ok(contractor.label.he.includes('contractor'));
});

// ─── 6. LTV / CAC ratio + health bands ─────────────────────────

test('ltvCacRatio: returns null ratio when CAC missing', () => {
  const calc = new LTVCalculator();
  const r = calc.ltvCacRatio(5000, 0);
  assert.equal(r.ratio, null);
  assert.equal(r.health.band, 'unknown');
  assert.equal(r.health.he, 'לא ידוע');
});

test('healthBand: classifies <1 as bad, 1-3 as ok, 3+ as good', () => {
  const calc = new LTVCalculator();
  assert.equal(calc.healthBand(0.5).band, 'bad');
  assert.equal(calc.healthBand(0.5).he, HEALTH_BANDS.bad.he);
  assert.equal(calc.healthBand(1.5).band, 'ok');
  assert.equal(calc.healthBand(1.5).he, HEALTH_BANDS.ok.he);
  assert.equal(calc.healthBand(4).band, 'good');
  assert.equal(calc.healthBand(4).he, HEALTH_BANDS.good.he);
  // boundary cases
  assert.equal(calc.healthBand(1).band, 'ok');
  assert.equal(calc.healthBand(3).band, 'good');
});

test('ltvCacRatio: accepts an LTV result object as first arg', () => {
  const calc = new LTVCalculator();
  const hist = calc.historicalLTV(buildCustomer());
  const r = calc.ltvCacRatio(hist, 1000);
  assert.equal(r.ltv, hist.value);
  assert.equal(r.cac, 1000);
  assert.equal(r.ratio, round2(hist.value / 1000));
  assert.equal(r.health.band, 'good');
});

// ─── 7. summary ────────────────────────────────────────────────

test('summary: full bilingual report for multi-customer set', () => {
  const calc = new LTVCalculator();
  const cohort = buildCohort();
  const s = calc.summary(cohort);
  assert.equal(s.currency, 'ILS');
  assert.equal(s.customers.length, 6);
  assert.equal(s.segments.length, 2);
  assert.ok(s.totals.historical > 0);
  assert.ok(s.totals.predictive > 0);
  assert.ok(s.totals.discounted > 0);
  assert.equal(s.title.he, 'סיכום ערך חיי לקוח');
  assert.equal(s.title.en, 'Customer Lifetime Value Summary');
  // each customer has the three methods
  for (const c of s.customers) {
    assert.ok(c.historical);
    assert.ok(c.predictive);
    assert.ok(c.discounted);
    assert.ok(c.cohortId);
  }
});

test('summary: totals.avgLtvCac is null when total CAC is zero', () => {
  const calc = new LTVCalculator();
  const s = calc.summary([
    {
      id: 'c1',
      acquisitionDate: '2024-01-01',
      acquisitionCost: 0,
      transactions: [{ id: 't1', date: '2024-02-01', revenue: 100, cost: 50 }],
    },
  ]);
  assert.equal(s.totals.avgLtvCac, null);
});

// ─── 8. internals / deterministic sanity ───────────────────────

test('cohortIdFor: generates YYYY-Qn_segment fallback', () => {
  const id = _internals.cohortIdFor({
    acquisitionDate: '2024-05-10',
    segment: 'contractor',
  });
  assert.equal(id, '2024-Q2_contractor');
});

test('deterministic: calling historicalLTV twice yields identical output', () => {
  const calc = new LTVCalculator();
  const a = calc.historicalLTV(buildCustomer());
  const b = calc.historicalLTV(buildCustomer());
  assert.deepEqual(a, b);
});

// ─── helpers ───────────────────────────────────────────────────

function round2(n) {
  return Math.round(n * 100) / 100;
}
