/**
 * Unit tests for kpi-scorecard.js
 * Agent Y-186 — בדיקות מנוע כרטיס ניקוד מאוזן
 *
 * Run with:
 *   node --test test/reporting/kpi-scorecard.test.js
 *
 * Node built-ins only. No test framework dependencies beyond node:test.
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const scorecardModule = require('../../src/reporting/kpi-scorecard.js');
const {
  KPIScorecard,
  achievement,
  trafficLight,
  assertCategory,
  assertDirection,
  formatValue,
  clamp,
  r4,
  CATEGORIES,
  CATEGORY_LABELS,
  DEFAULT_THRESHOLDS,
  TRAFFIC_LABELS,
  METAL_FAB_BENCHMARKS,
} = scorecardModule;

// ═══════════════════════════════════════════════════════════════════════════
// FIXTURES
// ═══════════════════════════════════════════════════════════════════════════

/** Builds a fresh scorecard pre-loaded with a balanced set of KPIs. */
function buildSampleScorecard() {
  const sc = new KPIScorecard({ name: 'Techno-Kol Uzi 2026-Q1' });

  // Financial
  sc.defineKPI({
    id: 'fin.ebitda_margin',
    category: 'financial',
    target: 0.15,
    actual: 0.12,
    weight: 3,
    direction: 'higher',
    labels: { he: 'שולי EBITDA', en: 'EBITDA margin' },
    unit: 'ratio',
    period: '2026-Q1',
  });
  sc.defineKPI({
    id: 'fin.cash_conversion_days',
    category: 'financial',
    target: 60,
    actual: 72,
    weight: 2,
    direction: 'lower',
    labels: { he: 'ימי המרת מזומן', en: 'Cash conversion cycle' },
    unit: 'days',
    period: '2026-Q1',
  });

  // Customer
  sc.defineKPI({
    id: 'cust.on_time_delivery',
    category: 'customer',
    target: 0.95,
    actual: 0.9,
    weight: 3,
    direction: 'higher',
    labels: { he: 'אספקה בזמן', en: 'On-time delivery' },
    unit: 'ratio',
    period: '2026-Q1',
  });
  sc.defineKPI({
    id: 'cust.complaint_rate',
    category: 'customer',
    target: 0.02,
    actual: 0.015,
    weight: 1,
    direction: 'lower',
    labels: { he: 'שיעור תלונות', en: 'Complaint rate' },
    unit: 'ratio',
    period: '2026-Q1',
  });

  // Internal Process
  sc.defineKPI({
    id: 'proc.scrap_rate',
    category: 'internal_process',
    target: 0.03,
    actual: 0.05,
    weight: 2,
    direction: 'lower',
    labels: { he: 'שיעור גרוטאות', en: 'Scrap rate' },
    unit: 'ratio',
    period: '2026-Q1',
  });
  sc.defineKPI({
    id: 'proc.oee',
    category: 'internal_process',
    target: 0.8,
    actual: 0.75,
    weight: 2,
    direction: 'higher',
    labels: { he: 'OEE', en: 'OEE' },
    unit: 'ratio',
    period: '2026-Q1',
  });

  // Learning & Growth
  sc.defineKPI({
    id: 'lg.training_hours',
    category: 'learning_growth',
    target: 40,
    actual: 42,
    weight: 1,
    direction: 'higher',
    labels: { he: 'שעות הדרכה', en: 'Training hours' },
    unit: 'hours',
    period: '2026-Q1',
  });
  sc.defineKPI({
    id: 'lg.retention',
    category: 'learning_growth',
    target: 0.9,
    actual: 0.93,
    weight: 2,
    direction: 'higher',
    labels: { he: 'שימור עובדים', en: 'Employee retention' },
    unit: 'ratio',
    period: '2026-Q1',
  });

  return sc;
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS — PURE HELPERS
// ═══════════════════════════════════════════════════════════════════════════

test('01 achievement: higher-is-better with actual under target', () => {
  // 90/100 = 0.9
  assert.equal(achievement(90, 100, 'higher'), 0.9);
});

test('02 achievement: higher-is-better with actual over target', () => {
  // 120/100 = 1.2
  assert.equal(achievement(120, 100, 'higher'), 1.2);
});

test('03 achievement: lower-is-better with actual under target (good)', () => {
  // target/actual = 60/40 = 1.5 → clamped to <= 2
  assert.equal(achievement(40, 60, 'lower'), 1.5);
});

test('04 achievement: lower-is-better with actual over target (bad)', () => {
  // 60/80 = 0.75
  assert.equal(achievement(80, 60, 'lower'), 0.75);
});

test('05 achievement: clamps runaway values to 2.0 maximum', () => {
  // 1000/100 would be 10; must clamp to 2
  assert.equal(achievement(1000, 100, 'higher'), 2);
});

test('06 achievement: zero or non-finite inputs are safe', () => {
  assert.equal(achievement(NaN, 100, 'higher'), 0);
  assert.equal(achievement(50, 0, 'higher'), 1); // zero target, positive actual → treated as hit
  assert.equal(achievement(0, 0, 'lower'), 1);
});

test('07 trafficLight: thresholds map score to red/yellow/green', () => {
  assert.equal(trafficLight(0.4), 'red');
  assert.equal(trafficLight(0.59), 'red');
  assert.equal(trafficLight(0.6), 'yellow');
  assert.equal(trafficLight(0.84), 'yellow');
  assert.equal(trafficLight(0.85), 'green');
  assert.equal(trafficLight(1.2), 'green');
});

test('08 trafficLight: accepts custom thresholds', () => {
  const custom = { red: 0.5, yellow: 0.7 };
  assert.equal(trafficLight(0.49, custom), 'red');
  assert.equal(trafficLight(0.5, custom), 'yellow');
  assert.equal(trafficLight(0.75, custom), 'green');
});

test('09 helpers: r4, clamp, formatValue behave correctly', () => {
  assert.equal(r4(1 / 3), 0.3333);
  assert.equal(r4('abc'), 0);
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-1, 0, 10), 0);
  assert.equal(clamp(20, 0, 10), 10);
  assert.equal(formatValue(0.123, 'ratio'), '12.3%');
  assert.match(formatValue(30, 'days', 'he'), /ימים/);
  assert.match(formatValue(30, 'days', 'en'), /days/);
  assert.equal(formatValue(55, 'nps'), '55');
  assert.equal(formatValue(NaN, 'ratio'), '—');
});

test('10 assertCategory/assertDirection reject bad input', () => {
  assert.throws(() => assertCategory('nope'), /invalid category/);
  assert.throws(() => assertDirection('sideways'), /invalid direction/);
  // Valid ones do not throw
  for (const c of CATEGORIES) assertCategory(c);
  assertDirection('higher');
  assertDirection('lower');
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS — CLASS: defineKPI
// ═══════════════════════════════════════════════════════════════════════════

test('11 defineKPI: creates a new KPI with computed achievement', () => {
  const sc = new KPIScorecard();
  const rec = sc.defineKPI({
    id: 'fin.revenue',
    category: 'financial',
    target: 1000,
    actual: 900,
    weight: 2,
    direction: 'higher',
    labels: { he: 'הכנסות', en: 'Revenue' },
    unit: 'nis',
    period: '2026-Q1',
  });
  assert.equal(rec.id, 'fin.revenue');
  assert.equal(rec.achievement, 0.9);
  assert.equal(rec.trend.length, 1);
  assert.equal(rec.labels.he, 'הכנסות');
  assert.equal(rec.labels.en, 'Revenue');
});

test('12 defineKPI: appends to trend instead of overwriting (never-delete rule)', () => {
  const sc = new KPIScorecard();
  sc.defineKPI({
    id: 'fin.revenue',
    category: 'financial',
    target: 1000,
    actual: 900,
    weight: 2,
    direction: 'higher',
    period: '2026-Q1',
  });
  sc.defineKPI({
    id: 'fin.revenue',
    category: 'financial',
    target: 1000,
    actual: 950,
    weight: 2,
    direction: 'higher',
    period: '2026-Q2',
  });
  sc.defineKPI({
    id: 'fin.revenue',
    category: 'financial',
    target: 1000,
    actual: 1020,
    weight: 2,
    direction: 'higher',
    period: '2026-Q3',
  });
  const rec = sc.getKPI('fin.revenue');
  assert.equal(rec.trend.length, 3);
  assert.equal(rec.trend[0].actual, 900);
  assert.equal(rec.trend[1].actual, 950);
  assert.equal(rec.trend[2].actual, 1020);
  // Latest top-level reflects newest sample
  assert.equal(rec.actual, 1020);
  assert.equal(rec.achievement, 1.02);
});

test('13 defineKPI: validates required fields and types', () => {
  const sc = new KPIScorecard();
  assert.throws(() => sc.defineKPI(null), /expects an object/);
  assert.throws(() => sc.defineKPI({}), /requires a string/);
  assert.throws(
    () =>
      sc.defineKPI({
        id: 'x',
        category: 'bogus',
        target: 1,
        actual: 1,
      }),
    /invalid category/,
  );
  assert.throws(
    () =>
      sc.defineKPI({
        id: 'x',
        category: 'financial',
        target: NaN,
        actual: 1,
      }),
    /target.*finite number/,
  );
  assert.throws(
    () =>
      sc.defineKPI({
        id: 'x',
        category: 'financial',
        target: 1,
        actual: 1,
        weight: -2,
      }),
    /weight.*>= 0/,
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS — computeOverall / traffic lights
// ═══════════════════════════════════════════════════════════════════════════

test('14 computeOverall: weighted average across all KPIs', () => {
  const sc = new KPIScorecard();
  // Two KPIs, weight 1 and 3 respectively.
  // ach1 = 0.5, ach2 = 1.0 → overall = (0.5*1 + 1.0*3)/(1+3) = 3.5/4 = 0.875
  sc.defineKPI({
    id: 'a',
    category: 'financial',
    target: 100,
    actual: 50,
    weight: 1,
    direction: 'higher',
  });
  sc.defineKPI({
    id: 'b',
    category: 'customer',
    target: 100,
    actual: 100,
    weight: 3,
    direction: 'higher',
  });
  const res = sc.computeOverall();
  assert.equal(res.score, 0.875);
  assert.equal(res.trafficLight, 'green');
  assert.equal(res.kpiCount, 2);
  assert.equal(res.totalWeight, 4);
  assert.equal(res.byCategory.financial.score, 0.5);
  assert.equal(res.byCategory.customer.score, 1);
  assert.equal(res.byCategory.internal_process.score, 0);
  assert.equal(res.byCategory.learning_growth.score, 0);
});

test('15 computeOverall + trafficLights: full balanced sample', () => {
  const sc = buildSampleScorecard();
  const res = sc.computeOverall();
  assert.ok(res.score > 0);
  assert.ok(res.score < 2);
  // Every category should have at least one KPI in this fixture.
  for (const c of CATEGORIES) {
    assert.ok(
      res.byCategory[c].kpiCount >= 1,
      `category ${c} should have KPIs`,
    );
    assert.ok(
      ['red', 'yellow', 'green'].includes(res.byCategory[c].trafficLight),
    );
  }
  const tl = sc.trafficLights();
  assert.equal(typeof tl.overall, 'string');
  for (const c of CATEGORIES) {
    assert.ok(['red', 'yellow', 'green'].includes(tl[c]));
  }
});

test('16 computeOverall: empty scorecard returns zero scores without crashing', () => {
  const sc = new KPIScorecard();
  const res = sc.computeOverall();
  assert.equal(res.score, 0);
  assert.equal(res.kpiCount, 0);
  assert.equal(res.totalWeight, 0);
  assert.equal(res.trafficLight, 'red');
});

test('17 computeOverall: honours category labels in output', () => {
  const sc = buildSampleScorecard();
  const res = sc.computeOverall();
  assert.equal(res.byCategory.financial.labels.he, 'פיננסי');
  assert.equal(res.byCategory.financial.labels.en, 'Financial');
  assert.equal(res.byCategory.customer.labels.he, 'לקוח');
  assert.equal(res.byCategory.internal_process.labels.he, 'תהליכי פנים');
  assert.equal(res.byCategory.learning_growth.labels.he, 'למידה וצמיחה');
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS — drillToTrend / benchmarkVsPrior
// ═══════════════════════════════════════════════════════════════════════════

test('18 drillToTrend: returns chronological samples for a KPI', () => {
  const sc = new KPIScorecard();
  sc.defineKPI({
    id: 'cust.nps',
    category: 'customer',
    target: 50,
    actual: 30,
    direction: 'higher',
    period: '2026-Q1',
  });
  sc.defineKPI({
    id: 'cust.nps',
    category: 'customer',
    target: 50,
    actual: 35,
    direction: 'higher',
    period: '2026-Q2',
  });
  sc.defineKPI({
    id: 'cust.nps',
    category: 'customer',
    target: 50,
    actual: 42,
    direction: 'higher',
    period: '2026-Q3',
  });
  const trend = sc.drillToTrend('cust.nps');
  assert.equal(trend.length, 3);
  assert.deepEqual(
    trend.map((t) => t.actual),
    [30, 35, 42],
  );
  assert.deepEqual(
    trend.map((t) => t.period),
    ['2026-Q1', '2026-Q2', '2026-Q3'],
  );
  // Unknown KPI → empty array
  assert.deepEqual(sc.drillToTrend('nope'), []);
});

test('19 benchmarkVsPrior: improvement detected for higher-is-better', () => {
  const sc = new KPIScorecard();
  sc.defineKPI({
    id: 'cust.nps',
    category: 'customer',
    target: 50,
    actual: 30,
    direction: 'higher',
    period: '2026-Q1',
  });
  sc.defineKPI({
    id: 'cust.nps',
    category: 'customer',
    target: 50,
    actual: 42,
    direction: 'higher',
    period: '2026-Q2',
  });
  const b = sc.benchmarkVsPrior('cust.nps');
  assert.equal(b.hasPrior, true);
  assert.equal(b.priorValue, 30);
  assert.equal(b.currentValue, 42);
  assert.equal(b.delta, 12);
  assert.equal(b.pctChange, 0.4);
  assert.equal(b.improved, true);
  assert.equal(b.direction, 'higher');
});

test('20 benchmarkVsPrior: improvement detected for lower-is-better', () => {
  const sc = new KPIScorecard();
  sc.defineKPI({
    id: 'proc.scrap',
    category: 'internal_process',
    target: 0.03,
    actual: 0.05,
    direction: 'lower',
    period: '2026-Q1',
  });
  sc.defineKPI({
    id: 'proc.scrap',
    category: 'internal_process',
    target: 0.03,
    actual: 0.025,
    direction: 'lower',
    period: '2026-Q2',
  });
  const b = sc.benchmarkVsPrior('proc.scrap');
  assert.equal(b.improved, true);
  assert.equal(b.hasPrior, true);
  assert.ok(b.delta < 0);
});

test('21 benchmarkVsPrior: handles unknown KPI and single-sample KPI gracefully', () => {
  const sc = new KPIScorecard();
  const missing = sc.benchmarkVsPrior('does-not-exist');
  assert.equal(missing.hasPrior, false);
  assert.equal(missing.priorValue, null);
  assert.equal(missing.currentValue, null);

  sc.defineKPI({
    id: 'solo',
    category: 'financial',
    target: 10,
    actual: 9,
    direction: 'higher',
  });
  const solo = sc.benchmarkVsPrior('solo');
  assert.equal(solo.hasPrior, false);
  assert.equal(solo.currentValue, 9);
});

test('22 benchmarkAllVsPrior: returns one entry per KPI', () => {
  const sc = buildSampleScorecard();
  const all = sc.benchmarkAllVsPrior();
  assert.equal(all.length, sc.listKPIs().length);
  for (const entry of all) {
    assert.equal(typeof entry.kpiId, 'string');
    assert.equal(typeof entry.hasPrior, 'boolean');
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS — generateReport (bilingual)
// ═══════════════════════════════════════════════════════════════════════════

test('23 generateReport: bilingual Hebrew primary with English secondary', () => {
  const sc = buildSampleScorecard();
  const report = sc.generateReport({ locale: 'he' });
  assert.equal(typeof report, 'string');
  // Hebrew category labels must appear.
  assert.ok(report.includes('פיננסי'), 'financial Hebrew label missing');
  assert.ok(report.includes('לקוח'), 'customer Hebrew label missing');
  assert.ok(report.includes('תהליכי פנים'), 'internal process Hebrew label missing');
  assert.ok(report.includes('למידה וצמיחה'), 'learning & growth Hebrew label missing');
  // English labels must also appear (bilingual).
  assert.ok(report.includes('Financial'));
  assert.ok(report.includes('Customer'));
  assert.ok(report.includes('Internal Process'));
  assert.ok(report.includes('Learning & Growth'));
  // Must include overall score line in Hebrew.
  assert.ok(report.includes('ציון כולל'));
  // Benchmarks appendix on by default.
  assert.ok(
    report.includes('נספח') || report.includes('Appendix'),
    'benchmark appendix missing',
  );
});

test('24 generateReport: English primary still shows Hebrew', () => {
  const sc = buildSampleScorecard();
  const report = sc.generateReport({ locale: 'en' });
  assert.ok(report.includes('Balanced Scorecard'));
  assert.ok(report.includes('Overall'));
  assert.ok(report.includes('Financial'));
  // Hebrew still present as secondary.
  assert.ok(report.includes('פיננסי'));
});

test('25 generateReport: includeBenchmarks=false omits appendix', () => {
  const sc = buildSampleScorecard();
  const withApp = sc.generateReport({ includeBenchmarks: true });
  const noApp = sc.generateReport({ includeBenchmarks: false });
  assert.ok(withApp.length > noApp.length);
  assert.ok(!noApp.includes('נספח'));
  assert.ok(!noApp.includes('Appendix'));
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS — toJSON / benchmarks appendix
// ═══════════════════════════════════════════════════════════════════════════

test('26 toJSON: produces a JSON-serializable snapshot', () => {
  const sc = buildSampleScorecard();
  const snap = sc.toJSON();
  // Round-trip through JSON.stringify must not throw.
  const json = JSON.stringify(snap);
  const parsed = JSON.parse(json);
  assert.equal(parsed.name, 'Techno-Kol Uzi 2026-Q1');
  assert.equal(parsed.kpis.length, sc.listKPIs().length);
  assert.ok(parsed.overall.byCategory.financial);
});

test('27 METAL_FAB_BENCHMARKS: covers all four categories with valid fields', () => {
  assert.ok(METAL_FAB_BENCHMARKS.length >= 12);
  const byCat = {};
  for (const b of METAL_FAB_BENCHMARKS) {
    byCat[b.category] = (byCat[b.category] || 0) + 1;
    // Shape checks
    assert.equal(typeof b.id, 'string');
    assert.ok(CATEGORIES.includes(b.category));
    assert.ok(['higher', 'lower'].includes(b.direction));
    assert.ok(Number.isFinite(b.target));
    assert.ok(Number.isFinite(b.topQuartile));
    assert.equal(typeof b.labels.he, 'string');
    assert.equal(typeof b.labels.en, 'string');
    assert.equal(typeof b.source, 'string');
  }
  for (const c of CATEGORIES) {
    assert.ok(byCat[c] >= 3, `expected >= 3 benchmarks for ${c}, got ${byCat[c] || 0}`);
  }
});

test('28 Custom thresholds override defaults end-to-end', () => {
  const strict = new KPIScorecard({
    thresholds: { red: 0.9, yellow: 0.99 },
  });
  strict.defineKPI({
    id: 'a',
    category: 'financial',
    target: 100,
    actual: 85,
    direction: 'higher',
  });
  // Under the strict regime, 0.85 is red.
  const res = strict.computeOverall();
  assert.equal(res.score, 0.85);
  assert.equal(res.trafficLight, 'red');
});

test('29 Hebrew & English category labels match the spec', () => {
  assert.equal(CATEGORY_LABELS.financial.he, 'פיננסי');
  assert.equal(CATEGORY_LABELS.customer.he, 'לקוח');
  assert.equal(CATEGORY_LABELS.internal_process.he, 'תהליכי פנים');
  assert.equal(CATEGORY_LABELS.learning_growth.he, 'למידה וצמיחה');
  assert.equal(CATEGORY_LABELS.financial.en, 'Financial');
  assert.equal(CATEGORY_LABELS.customer.en, 'Customer');
  assert.equal(CATEGORY_LABELS.internal_process.en, 'Internal Process');
  assert.equal(CATEGORY_LABELS.learning_growth.en, 'Learning & Growth');
  // Traffic-light labels likewise bilingual.
  assert.equal(TRAFFIC_LABELS.red.he, 'אדום');
  assert.equal(TRAFFIC_LABELS.yellow.he, 'צהוב');
  assert.equal(TRAFFIC_LABELS.green.he, 'ירוק');
});

test('30 DEFAULT_THRESHOLDS exposed and sane', () => {
  assert.ok(DEFAULT_THRESHOLDS.red < DEFAULT_THRESHOLDS.yellow);
  assert.ok(DEFAULT_THRESHOLDS.red > 0);
  assert.ok(DEFAULT_THRESHOLDS.yellow < 1);
});
