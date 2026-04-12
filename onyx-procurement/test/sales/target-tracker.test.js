/**
 * Sales Target Tracker — Unit Tests
 * Agent Y-21 | Swarm 4 (growth) | Techno-Kol Uzi mega-ERP
 *
 * Covers the public surface of src/sales/target-tracker.js:
 *   01.  setQuota stores and getQuota retrieves
 *   02.  setQuota validates metric
 *   03.  setQuota re-set behaves as upgrade (not delete)
 *   04.  recordSale is append-only with deterministic ids
 *   05.  attainment basic revenue quota
 *   06.  attainment with zero target returns null pct
 *   07.  attainment margin metric
 *   08.  attainment units metric
 *   09.  pacing expected vs actual (working-day fraction)
 *   10.  pacing at period start (0% elapsed)
 *   11.  pacing at period end (100% elapsed)
 *   12.  pacing classification ahead/on_track/behind/critical
 *   13.  teamRollup aggregates direct reports
 *   14.  teamRollup skips members without a quota
 *   15.  leaderboard ordering by actual DESC
 *   16.  leaderboard tiebreak by pct DESC
 *   17.  leaderboard final tiebreak by salespersonId
 *   18.  mid-period hire proration (monthly)
 *   19.  mid-period hire proration (quarterly)
 *   20.  hireDate before period → no proration
 *   21.  hireDate after period  → zero target
 *   22.  historicalTrend across multiple periods
 *   23.  historicalTrend missing quota returns hadQuota:false
 *   24.  alertBelowThreshold returns only below-threshold reps
 *   25.  alertBelowThreshold severity grading
 *   26.  period normalization edge cases
 *   27.  working-day count for Sunday..Thursday week
 *   28.  quarter boundaries correct
 *   29.  year period end-of-year correct
 *   30.  bilingual Hebrew/English labels present
 *   31.  no delete method exists (project rule)
 *   32.  deterministic output (same inputs → same outputs)
 *
 * Run:  node --test onyx-procurement/test/sales/target-tracker.test.js
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const mod = require(path.resolve(
  __dirname, '..', '..', 'src', 'sales', 'target-tracker.js'
));
const { SalesTargetTracker } = mod;

// ── helpers ───────────────────────────────────────────────────────
function freshTracker(nowStr = '2026-04-11') {
  return new SalesTargetTracker({ now: nowStr });
}

const MONTH_APR_2026 = { type: 'month', year: 2026, m: 4 };
const Q2_2026        = { type: 'quarter', year: 2026, q: 2 };
const YEAR_2026      = { type: 'year',  year: 2026 };

// ─────────────────────────────────────────────────────────────────
test('01 setQuota stores and getQuota retrieves', () => {
  const t = freshTracker();
  t.setQuota({
    salespersonId: 'SP_001',
    period: MONTH_APR_2026,
    targetAmount: 100000,
    targetDeals: 10,
    metric: 'revenue',
  });
  const q = t.getQuota('SP_001', MONTH_APR_2026);
  assert.ok(q);
  assert.equal(q.salespersonId, 'SP_001');
  assert.equal(q.metric, 'revenue');
  assert.equal(q.baseTargetAmount, 100000);
  assert.equal(q.targetAmount, 100000);       // no proration
  assert.equal(q.targetDeals, 10);
  assert.equal(q.prorated, false);
  assert.equal(q.period.key, '2026-04');
});

test('02 setQuota validates metric', () => {
  const t = freshTracker();
  assert.throws(() => t.setQuota({
    salespersonId: 'SP_001',
    period: MONTH_APR_2026,
    targetAmount: 100,
    metric: 'bogus',
  }), /metric/);
  assert.throws(() => t.setQuota({
    salespersonId: 'SP_001',
    period: MONTH_APR_2026,
    targetAmount: -5,
    metric: 'revenue',
  }), /non-negative/);
  assert.throws(() => t.setQuota({
    salespersonId: '',
    period: MONTH_APR_2026,
    targetAmount: 100,
  }), /salespersonId/);
});

test('03 setQuota re-set is an upgrade not a delete', () => {
  const t = freshTracker();
  t.setQuota({ salespersonId: 'SP_001', period: MONTH_APR_2026, targetAmount: 100000, metric: 'revenue' });
  t.setQuota({ salespersonId: 'SP_001', period: MONTH_APR_2026, targetAmount: 150000, metric: 'revenue' });
  const q = t.getQuota('SP_001', MONTH_APR_2026);
  assert.equal(q.targetAmount, 150000);
  // history list still only holds one entry per period
  assert.equal(t.listQuotas('SP_001').length, 1);
});

test('04 recordSale is append-only with deterministic ids', () => {
  const t = freshTracker();
  const s1 = t.recordSale({
    salespersonId: 'SP_001',
    amount: 1000, margin: 200, units: 3,
    closedDate: '2026-04-05',
  });
  const s2 = t.recordSale({
    salespersonId: 'SP_001',
    amount: 2000, margin: 500, units: 4,
    closedDate: '2026-04-07',
  });
  assert.equal(s1.id, 'SALE_000001');
  assert.equal(s2.id, 'SALE_000002');
  assert.equal(s1.closedDate, '2026-04-05');
  assert.throws(() => t.recordSale({
    salespersonId: 'SP_001', amount: 1, closedDate: 'bad-date',
  }), /closedDate/);
});

test('05 attainment — basic revenue quota', () => {
  const t = freshTracker();
  t.setQuota({
    salespersonId: 'SP_001',
    period: MONTH_APR_2026,
    targetAmount: 100000,
    targetDeals: 10,
    metric: 'revenue',
  });
  t.recordSale({ salespersonId: 'SP_001', amount: 30000, closedDate: '2026-04-03' });
  t.recordSale({ salespersonId: 'SP_001', amount: 25000, closedDate: '2026-04-07' });
  const a = t.attainment('SP_001', MONTH_APR_2026);
  assert.equal(a.target, 100000);
  assert.equal(a.actual, 55000);
  assert.equal(a.pct, 0.55);
  assert.equal(a.gap, 45000);
  assert.equal(a.deals, 2);
});

test('06 attainment — zero target returns null pct', () => {
  const t = freshTracker();
  t.setQuota({
    salespersonId: 'SP_X',
    period: MONTH_APR_2026,
    targetAmount: 0,
    metric: 'revenue',
  });
  t.recordSale({ salespersonId: 'SP_X', amount: 500, closedDate: '2026-04-02' });
  const a = t.attainment('SP_X', MONTH_APR_2026);
  assert.equal(a.target, 0);
  assert.equal(a.actual, 500);
  assert.equal(a.pct, null);
});

test('07 attainment — margin metric', () => {
  const t = freshTracker();
  t.setQuota({
    salespersonId: 'SP_M',
    period: MONTH_APR_2026,
    targetAmount: 20000,
    metric: 'margin',
  });
  t.recordSale({ salespersonId: 'SP_M', amount: 50000, margin: 8000, closedDate: '2026-04-05' });
  t.recordSale({ salespersonId: 'SP_M', amount: 40000, margin: 7000, closedDate: '2026-04-09' });
  const a = t.attainment('SP_M', MONTH_APR_2026);
  assert.equal(a.actual, 15000);
  assert.equal(a.target, 20000);
  assert.equal(a.pct, 0.75);
});

test('08 attainment — units metric', () => {
  const t = freshTracker();
  t.setQuota({
    salespersonId: 'SP_U',
    period: MONTH_APR_2026,
    targetAmount: 100,
    metric: 'units',
  });
  t.recordSale({ salespersonId: 'SP_U', units: 30, closedDate: '2026-04-04' });
  t.recordSale({ salespersonId: 'SP_U', units: 50, closedDate: '2026-04-08' });
  const a = t.attainment('SP_U', MONTH_APR_2026);
  assert.equal(a.actual, 80);
  assert.equal(a.pct, 0.8);
});

test('09 pacing — expected vs actual using working-day fraction', () => {
  // April 2026 has 22 working days (Sun..Thu). Today is 2026-04-11 (Saturday).
  // Elapsed working days Apr 1..11 = Wed 1, Thu 2, Sun 5, Mon 6, Tue 7,
  // Wed 8, Thu 9 = 7 working days.
  // Fraction = 7/22.
  const t = freshTracker('2026-04-11');
  t.setQuota({
    salespersonId: 'SP_P',
    period: MONTH_APR_2026,
    targetAmount: 220000,    // makes the math clean
    metric: 'revenue',
  });
  t.recordSale({ salespersonId: 'SP_P', amount: 70000, closedDate: '2026-04-05' });
  const pace = t.pacingAnalysis('SP_P', MONTH_APR_2026);
  assert.equal(pace.total, 22);
  assert.equal(pace.elapsed, 7);
  assert.equal(pace.remaining, 15);
  assert.equal(pace.expected, 70000);   // 220000 * 7/22
  assert.equal(pace.actual, 70000);
  assert.ok(Math.abs(pace.pacePct - 1.0) < 1e-6);
  assert.equal(pace.status, 'on_track');
});

test('10 pacing at period start — 0% elapsed', () => {
  const t = freshTracker('2026-03-20');  // before April
  t.setQuota({
    salespersonId: 'SP_P', period: MONTH_APR_2026, targetAmount: 100000, metric: 'revenue',
  });
  const pace = t.pacingAnalysis('SP_P', MONTH_APR_2026);
  assert.equal(pace.elapsed, 0);
  assert.equal(pace.expected, 0);
  assert.equal(pace.pacePct, null);
});

test('11 pacing at period end — 100% elapsed', () => {
  const t = freshTracker('2026-05-15');  // after April
  t.setQuota({
    salespersonId: 'SP_P', period: MONTH_APR_2026, targetAmount: 100000, metric: 'revenue',
  });
  t.recordSale({ salespersonId: 'SP_P', amount: 100000, closedDate: '2026-04-20' });
  const pace = t.pacingAnalysis('SP_P', MONTH_APR_2026);
  assert.equal(pace.elapsed, pace.total);
  assert.equal(pace.expected, 100000);
  assert.equal(pace.actual, 100000);
  assert.equal(pace.pacePct, 1);
  assert.equal(pace.status, 'on_track');
});

test('12 pacing classification ahead/on_track/behind/critical', () => {
  const util = SalesTargetTracker.util;
  assert.equal(util.classifyPace(1.25), 'ahead');
  assert.equal(util.classifyPace(1.10), 'ahead');
  assert.equal(util.classifyPace(1.00), 'on_track');
  assert.equal(util.classifyPace(0.96), 'on_track');
  assert.equal(util.classifyPace(0.90), 'behind');
  assert.equal(util.classifyPace(0.80), 'behind');
  assert.equal(util.classifyPace(0.70), 'critical');
  assert.equal(util.classifyPace(null), 'on_track');
});

test('13 teamRollup aggregates direct reports', () => {
  const t = freshTracker();
  t.addDirectReport('MGR_A', 'SP_001');
  t.addDirectReport('MGR_A', 'SP_002');
  t.setQuota({ salespersonId: 'SP_001', period: MONTH_APR_2026, targetAmount: 100000, metric: 'revenue' });
  t.setQuota({ salespersonId: 'SP_002', period: MONTH_APR_2026, targetAmount: 200000, metric: 'revenue' });
  t.recordSale({ salespersonId: 'SP_001', amount: 80000, closedDate: '2026-04-05' });
  t.recordSale({ salespersonId: 'SP_002', amount: 120000, closedDate: '2026-04-08' });
  const rollup = t.teamRollup('MGR_A', MONTH_APR_2026);
  assert.equal(rollup.members.length, 2);
  assert.equal(rollup.totals.target, 300000);
  assert.equal(rollup.totals.actual, 200000);
  // 200000 / 300000 = 0.6667
  assert.ok(Math.abs(rollup.totals.pct - (200000 / 300000)) < 1e-4);
  assert.equal(rollup.totals.gap, 100000);
});

test('14 teamRollup skips members without a quota', () => {
  const t = freshTracker();
  t.addDirectReport('MGR_B', 'SP_HAS');
  t.addDirectReport('MGR_B', 'SP_NONE');
  t.setQuota({ salespersonId: 'SP_HAS', period: MONTH_APR_2026, targetAmount: 100000, metric: 'revenue' });
  const rollup = t.teamRollup('MGR_B', MONTH_APR_2026);
  assert.equal(rollup.members.length, 1);
  assert.deepEqual(rollup.skipped, ['SP_NONE']);
});

test('15 leaderboard — ordering by actual DESC', () => {
  const t = freshTracker();
  t.setQuota({ salespersonId: 'SP_A', period: MONTH_APR_2026, targetAmount: 100000, metric: 'revenue' });
  t.setQuota({ salespersonId: 'SP_B', period: MONTH_APR_2026, targetAmount: 100000, metric: 'revenue' });
  t.setQuota({ salespersonId: 'SP_C', period: MONTH_APR_2026, targetAmount: 100000, metric: 'revenue' });
  t.recordSale({ salespersonId: 'SP_A', amount: 50000, closedDate: '2026-04-05' });
  t.recordSale({ salespersonId: 'SP_B', amount: 90000, closedDate: '2026-04-05' });
  t.recordSale({ salespersonId: 'SP_C', amount: 70000, closedDate: '2026-04-05' });
  const lb = t.generateLeaderboard(MONTH_APR_2026);
  assert.equal(lb[0].salespersonId, 'SP_B');
  assert.equal(lb[1].salespersonId, 'SP_C');
  assert.equal(lb[2].salespersonId, 'SP_A');
  assert.equal(lb[0].rank, 1);
});

test('16 leaderboard — tiebreak by pct DESC', () => {
  // Two reps tied on actual (80k) but different quotas → different pct.
  const t = freshTracker();
  t.setQuota({ salespersonId: 'SP_HIGH', period: MONTH_APR_2026, targetAmount: 200000, metric: 'revenue' });
  t.setQuota({ salespersonId: 'SP_LOW',  period: MONTH_APR_2026, targetAmount: 100000, metric: 'revenue' });
  t.recordSale({ salespersonId: 'SP_HIGH', amount: 80000, closedDate: '2026-04-05' });
  t.recordSale({ salespersonId: 'SP_LOW',  amount: 80000, closedDate: '2026-04-05' });
  const lb = t.generateLeaderboard(MONTH_APR_2026);
  // Same actual → higher pct wins → SP_LOW (80%) beats SP_HIGH (40%)
  assert.equal(lb[0].salespersonId, 'SP_LOW');
  assert.equal(lb[1].salespersonId, 'SP_HIGH');
  assert.ok(lb[0].pct > lb[1].pct);
});

test('17 leaderboard — final tiebreak by salespersonId ASC', () => {
  const t = freshTracker();
  t.setQuota({ salespersonId: 'SP_Z', period: MONTH_APR_2026, targetAmount: 100000, metric: 'revenue' });
  t.setQuota({ salespersonId: 'SP_A', period: MONTH_APR_2026, targetAmount: 100000, metric: 'revenue' });
  t.setQuota({ salespersonId: 'SP_M', period: MONTH_APR_2026, targetAmount: 100000, metric: 'revenue' });
  // Everyone same actual and same pct → alphabetic
  t.recordSale({ salespersonId: 'SP_Z', amount: 50000, closedDate: '2026-04-05' });
  t.recordSale({ salespersonId: 'SP_A', amount: 50000, closedDate: '2026-04-05' });
  t.recordSale({ salespersonId: 'SP_M', amount: 50000, closedDate: '2026-04-05' });
  const lb = t.generateLeaderboard(MONTH_APR_2026);
  assert.deepEqual(lb.map(r => r.salespersonId), ['SP_A', 'SP_M', 'SP_Z']);
});

test('18 mid-period hire proration — monthly', () => {
  // April 2026 has 22 working days (Sun..Thu).
  // Hire Apr 15 2026 (Wed). Working days 15..30:
  //   Wed15, Thu16, Sun19, Mon20, Tue21, Wed22, Thu23,
  //   Sun26, Mon27, Tue28, Wed29, Thu30 = 12
  // proration = 12/22
  const t = freshTracker();
  t.setQuota({
    salespersonId: 'SP_NEW',
    period: MONTH_APR_2026,
    targetAmount: 220000,
    targetDeals: 22,
    metric: 'revenue',
    hireDate: '2026-04-15',
  });
  const q = t.getQuota('SP_NEW', MONTH_APR_2026);
  assert.equal(q.prorated, true);
  assert.ok(Math.abs(q.prorationFactor - (12 / 22)) < 1e-4);
  assert.equal(q.baseTargetAmount, 220000);
  assert.equal(q.targetAmount, 120000);    // 220000 * 12/22
  assert.equal(q.targetDeals, 12);
});

test('19 mid-period hire proration — quarterly', () => {
  // Q2 2026 = Apr (22) + May (21) + Jun (22) = 65 working days.
  // Hire May 3 2026 (Sunday). Working days May 3..Jun 30:
  //   May: 3..7 (5), 10..14 (5), 17..21 (5), 24..28 (5), 31 (1) = 21
  //   Jun: 1..4 (4), 7..11 (5), 14..18 (5), 21..25 (5), 28..30 (3) = 22
  //   Total = 43
  // proration = 43/65
  const t = freshTracker();
  t.setQuota({
    salespersonId: 'SP_Q',
    period: Q2_2026,
    targetAmount: 650000,
    metric: 'revenue',
    hireDate: '2026-05-03',
  });
  const q = t.getQuota('SP_Q', Q2_2026);
  assert.equal(q.prorated, true);
  const expected = 650000 * (43 / 65);
  assert.ok(Math.abs(q.targetAmount - expected) < 1, `got ${q.targetAmount} vs ${expected}`);
});

test('20 hireDate before period — no proration', () => {
  const t = freshTracker();
  t.setQuota({
    salespersonId: 'SP_OLD',
    period: MONTH_APR_2026,
    targetAmount: 100000,
    metric: 'revenue',
    hireDate: '2025-12-01',
  });
  const q = t.getQuota('SP_OLD', MONTH_APR_2026);
  assert.equal(q.prorated, false);
  assert.equal(q.prorationFactor, 1);
  assert.equal(q.targetAmount, 100000);
});

test('21 hireDate after period end — zero target', () => {
  const t = freshTracker();
  t.setQuota({
    salespersonId: 'SP_FUT',
    period: MONTH_APR_2026,
    targetAmount: 100000,
    metric: 'revenue',
    hireDate: '2026-06-01',
  });
  const q = t.getQuota('SP_FUT', MONTH_APR_2026);
  assert.equal(q.prorationFactor, 0);
  assert.equal(q.targetAmount, 0);
});

test('22 historicalTrend — across multiple periods', () => {
  const t = freshTracker();
  t.setQuota({ salespersonId: 'SP_H', period: { type: 'month', year: 2026, m: 1 }, targetAmount: 100000, metric: 'revenue' });
  t.setQuota({ salespersonId: 'SP_H', period: { type: 'month', year: 2026, m: 2 }, targetAmount: 100000, metric: 'revenue' });
  t.setQuota({ salespersonId: 'SP_H', period: { type: 'month', year: 2026, m: 3 }, targetAmount: 100000, metric: 'revenue' });
  t.recordSale({ salespersonId: 'SP_H', amount:  80000, closedDate: '2026-01-15' });
  t.recordSale({ salespersonId: 'SP_H', amount: 110000, closedDate: '2026-02-18' });
  t.recordSale({ salespersonId: 'SP_H', amount:  95000, closedDate: '2026-03-22' });
  const trend = t.historicalTrend('SP_H', [
    { type: 'month', year: 2026, m: 1 },
    { type: 'month', year: 2026, m: 2 },
    { type: 'month', year: 2026, m: 3 },
  ]);
  assert.equal(trend.length, 3);
  assert.equal(trend[0].actual, 80000);
  assert.equal(trend[1].actual, 110000);
  assert.equal(trend[2].actual, 95000);
  assert.equal(trend[0].pct, 0.8);
  assert.equal(trend[1].pct, 1.1);
});

test('23 historicalTrend — missing quota returns hadQuota:false', () => {
  const t = freshTracker();
  const trend = t.historicalTrend('SP_GHOST', [MONTH_APR_2026]);
  assert.equal(trend[0].hadQuota, false);
  assert.equal(trend[0].target, 0);
  assert.equal(trend[0].pct, null);
});

test('24 alertBelowThreshold returns only below-threshold reps', () => {
  const t = freshTracker('2026-04-11');  // 7/22 working days elapsed → ~31.8% expected
  t.setQuota({ salespersonId: 'SP_OK', period: MONTH_APR_2026, targetAmount: 220000, metric: 'revenue' });
  t.setQuota({ salespersonId: 'SP_BAD', period: MONTH_APR_2026, targetAmount: 220000, metric: 'revenue' });
  t.recordSale({ salespersonId: 'SP_OK',  amount: 80000, closedDate: '2026-04-05' }); // > 70k expected
  t.recordSale({ salespersonId: 'SP_BAD', amount: 30000, closedDate: '2026-04-05' }); // < 70k expected
  const alerts = t.alertBelowThreshold(0.80, MONTH_APR_2026);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].salespersonId, 'SP_BAD');
});

test('25 alertBelowThreshold severity grading', () => {
  const util = SalesTargetTracker.util;
  assert.equal(util.severityFromPace(0.79, 0.80), 'low');    // ratio ~0.99
  assert.equal(util.severityFromPace(0.62, 0.80), 'medium'); // ratio 0.775
  assert.equal(util.severityFromPace(0.45, 0.80), 'high');   // ratio 0.5625
  assert.equal(util.severityFromPace(0.20, 0.80), 'critical'); // ratio 0.25
  assert.equal(util.severityFromPace(0.90, 0.80), 'info');   // above threshold
});

test('26 period normalization edge cases', () => {
  const util = SalesTargetTracker.util;
  assert.throws(() => util.normalizePeriod(null), /period/);
  assert.throws(() => util.normalizePeriod({ type: 'decade', year: 2026 }), /type/);
  assert.throws(() => util.normalizePeriod({ type: 'quarter', year: 2026, q: 5 }), /q/);
  assert.throws(() => util.normalizePeriod({ type: 'month', year: 2026, m: 13 }), /m/);
  assert.equal(util.normalizePeriod({ type: 'year', year: 2026 }).key, '2026');
  assert.equal(util.normalizePeriod({ type: 'quarter', year: 2026, q: 2 }).key, '2026-Q2');
  assert.equal(util.normalizePeriod({ type: 'month', year: 2026, m: 4 }).key, '2026-04');
});

test('27 working-day count for Sunday..Thursday week', () => {
  const util = SalesTargetTracker.util;
  // April 2026: 1=Wed ... 30=Thu. Should be 22 working days.
  const start = new Date(Date.UTC(2026, 3, 1));
  const end   = new Date(Date.UTC(2026, 3, 30));
  assert.equal(util.countWorkingDays(start, end, [0, 1, 2, 3, 4]), 22);
  // Full year 2026 = 365 days, weekly pattern repeats mostly
  const yStart = new Date(Date.UTC(2026, 0, 1));
  const yEnd   = new Date(Date.UTC(2026, 11, 31));
  const wd = util.countWorkingDays(yStart, yEnd, [0, 1, 2, 3, 4]);
  assert.ok(wd >= 260 && wd <= 262, `expected 260-262, got ${wd}`);
});

test('28 quarter boundaries correct', () => {
  const util = SalesTargetTracker.util;
  const { start, end } = util.periodBounds(Q2_2026);
  assert.equal(util.formatDate(start), '2026-04-01');
  assert.equal(util.formatDate(end),   '2026-06-30');
});

test('29 year period end-of-year correct', () => {
  const util = SalesTargetTracker.util;
  const { start, end } = util.periodBounds(YEAR_2026);
  assert.equal(util.formatDate(start), '2026-01-01');
  assert.equal(util.formatDate(end),   '2026-12-31');
});

test('30 bilingual Hebrew/English labels present', () => {
  assert.ok(SalesTargetTracker.LABELS.quota.he);
  assert.ok(SalesTargetTracker.LABELS.quota.en);
  assert.ok(SalesTargetTracker.METRIC_LABELS.revenue.he);
  assert.ok(SalesTargetTracker.METRIC_LABELS.margin.en);
  assert.ok(SalesTargetTracker.STATUS_LABELS.ahead.he);
  assert.ok(SalesTargetTracker.STATUS_LABELS.critical.en);
  assert.ok(SalesTargetTracker.PERIOD_LABELS.month.he);
  assert.ok(SalesTargetTracker.PERIOD_LABELS.quarter.en);
  // instance-level labels
  const t = freshTracker();
  t.setQuota({ salespersonId: 'SP_1', period: MONTH_APR_2026, targetAmount: 100, metric: 'revenue' });
  const q = t.getQuota('SP_1', MONTH_APR_2026);
  assert.ok(q.labels.he);
  assert.ok(q.labels.en);
});

test('31 no delete method exists (project rule)', () => {
  const t = freshTracker();
  const forbidden = ['deleteQuota', 'removeQuota', 'deleteSale', 'removeSale',
                     'deleteDirectReport', 'removeDirectReport', 'clear',
                     'reset', 'wipe', 'drop'];
  for (const name of forbidden) {
    assert.equal(typeof t[name], 'undefined', `forbidden method ${name} exists`);
  }
  assert.equal(typeof t.setQuota,     'function');
  assert.equal(typeof t.recordSale,   'function');
  assert.equal(typeof t.attainment,   'function');
  assert.equal(typeof t.pacingAnalysis, 'function');
  assert.equal(typeof t.teamRollup,   'function');
  assert.equal(typeof t.historicalTrend, 'function');
  assert.equal(typeof t.generateLeaderboard, 'function');
  assert.equal(typeof t.alertBelowThreshold, 'function');
});

test('32 deterministic output — same inputs → same outputs', () => {
  function build() {
    const tr = freshTracker('2026-04-11');
    tr.setQuota({ salespersonId: 'SP_D', period: MONTH_APR_2026, targetAmount: 100000, metric: 'revenue' });
    tr.recordSale({ salespersonId: 'SP_D', amount: 42000, closedDate: '2026-04-03' });
    tr.recordSale({ salespersonId: 'SP_D', amount: 18000, closedDate: '2026-04-08' });
    return tr;
  }
  const a1 = build().attainment('SP_D', MONTH_APR_2026);
  const a2 = build().attainment('SP_D', MONTH_APR_2026);
  assert.deepEqual(a1, a2);
  const p1 = build().pacingAnalysis('SP_D', MONTH_APR_2026);
  const p2 = build().pacingAnalysis('SP_D', MONTH_APR_2026);
  assert.deepEqual(p1, p2);
});
