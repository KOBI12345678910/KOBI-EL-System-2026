/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ONYX AI — Trend Detector — Unit Tests  (Agent Y-154)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Test runner: built-in `node:test` (no external deps).
 *
 * Run (transpile-only, matches the sibling event-store.test.ts pattern):
 *
 *   TS_NODE_TRANSPILE_ONLY=true npx node --test \
 *     --require ts-node/register test/trends/trend-detector.test.ts
 *
 * Motto: "לא מוחקים רק משדרגים ומגדלים" — every existing assertion must
 * continue to pass after any future upgrade of the engine.
 *
 * ─────────────────────────────────────────────────────────────────────────── */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  TrendDetector,
  trendDetector,
  linearRegression,
  mannKendallTest,
  theilSenSlope,
  detectChangePoints,
  classify,
  rSquared,
  summary,
  mean,
  median,
  stdev,
  variance,
  normalCdf,
  normalTwoSidedPValue,
  tTwoSidedPValue,
  rtlNumber,
  __internal,
  TrendPoint,
} from '../../src/trends/trend-detector';

/* ──────────────────────────────────────────────────────────────────────────
 * Fixture helpers
 * ────────────────────────────────────────────────────────────────────────── */

function series(values: number[]): TrendPoint[] {
  return values.map((y, i) => ({ t: i, y }));
}

function perfectUp(n = 10): TrendPoint[] {
  return Array.from({ length: n }, (_, i) => ({ t: i, y: 2 * i + 3 }));
}

function perfectDown(n = 10): TrendPoint[] {
  return Array.from({ length: n }, (_, i) => ({ t: i, y: 50 - 4 * i }));
}

function flatNoisy(n = 20, base = 100): TrendPoint[] {
  // Deterministic pseudo-noise using a LCG — NO Math.random.
  const out: TrendPoint[] = [];
  let x = 1337;
  for (let i = 0; i < n; i++) {
    x = (1103515245 * x + 12345) & 0x7fffffff;
    const noise = ((x % 1000) - 500) / 500; // ~[-1, 1]
    out.push({ t: i, y: base + noise });
  }
  return out;
}

function stepShift(n = 20, firstHalf = 10, secondHalf = 30): TrendPoint[] {
  const out: TrendPoint[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ t: i, y: i < n / 2 ? firstHalf : secondHalf });
  }
  return out;
}

const APPROX = (got: number, want: number, eps = 1e-6): boolean =>
  Math.abs(got - want) <= eps;

/* ══════════════════════════════════════════════════════════════════════════
 * Tests
 * ══════════════════════════════════════════════════════════════════════════ */

test('01 — mean / variance / stdev / median basic sanity', () => {
  const xs = [2, 4, 4, 4, 5, 5, 7, 9];
  assert.equal(mean(xs), 5);
  assert.ok(APPROX(variance(xs), 32 / 7));
  assert.ok(APPROX(stdev(xs), Math.sqrt(32 / 7)));
  assert.equal(median(xs), 4.5);
  // Edge-cases
  assert.equal(mean([]), 0);
  assert.equal(variance([5]), 0);
  assert.equal(stdev([5]), 0);
  assert.equal(median([]), 0);
  assert.equal(median([42]), 42);
});

test('02 — normalCdf and normal two-sided p-value', () => {
  // Known anchors
  assert.ok(APPROX(normalCdf(0), 0.5, 1e-4));
  assert.ok(APPROX(normalCdf(1.96), 0.975, 1e-3));
  assert.ok(APPROX(normalCdf(-1.96), 0.025, 1e-3));
  // Two-sided p at Z = 1.96 should be ~0.05
  assert.ok(APPROX(normalTwoSidedPValue(1.96), 0.05, 1e-3));
  // Symmetry
  assert.ok(APPROX(normalTwoSidedPValue(-2.58), normalTwoSidedPValue(2.58), 1e-9));
});

test('03 — Student t two-sided p-value collapses to Normal for large df', () => {
  const p10000 = tTwoSidedPValue(1.96, 10_000);
  assert.ok(APPROX(p10000, 0.05, 5e-3));
  // df = 1 gives the Cauchy-like fat tail: p(1.96, 1) >> 0.05
  const p1 = tTwoSidedPValue(1.96, 1);
  assert.ok(p1 > 0.1, `expected >0.1, got ${p1}`);
  // Defensive
  assert.equal(tTwoSidedPValue(NaN, 10), 0);
  assert.equal(tTwoSidedPValue(2, 0), 1);
});

test('04 — linear regression on a perfect line is exact', () => {
  const p = perfectUp(12);
  const r = linearRegression(p);
  assert.ok(APPROX(r.slope, 2));
  assert.ok(APPROX(r.intercept, 3));
  assert.ok(APPROX(r.rSquared, 1, 1e-10));
  assert.ok(r.pValue < 1e-6); // overwhelmingly significant
  assert.equal(r.n, 12);
});

test('05 — linear regression slope on a perfect downward line', () => {
  const p = perfectDown(8);
  const r = linearRegression(p);
  assert.ok(APPROX(r.slope, -4));
  assert.ok(APPROX(r.intercept, 50));
  assert.ok(APPROX(r.rSquared, 1, 1e-10));
});

test('06 — linear regression edge cases: empty, 1pt, constant y', () => {
  const empty = linearRegression([]);
  assert.equal(empty.slope, 0);
  assert.equal(empty.rSquared, 0);
  assert.equal(empty.pValue, 1);

  const one = linearRegression([{ t: 0, y: 42 }]);
  assert.equal(one.slope, 0);
  assert.equal(one.intercept, 42);
  assert.equal(one.n, 1);

  const flat = linearRegression([
    { t: 0, y: 5 },
    { t: 1, y: 5 },
    { t: 2, y: 5 },
  ]);
  assert.equal(flat.slope, 0);
  assert.equal(flat.intercept, 5);
  // Constant y ⇒ SS_tot = 0 ⇒ convention: r² = 1 (perfect fit of "no variance")
  assert.equal(flat.rSquared, 1);
});

test('07 — rSquared helper and r² in [0,1] for noisy series', () => {
  const p = flatNoisy(40, 100);
  const r = rSquared(p);
  assert.ok(r >= 0 && r <= 1);
  // Flat noise should not explain much
  assert.ok(r < 0.3, `expected small r² for noise, got ${r}`);
});

test('08 — Mann–Kendall detects monotonic uptrend', () => {
  const p = perfectUp(20);
  const mk = mannKendallTest(p);
  assert.equal(mk.direction, 'increasing');
  assert.ok(mk.s > 0);
  assert.ok(mk.pValue < 0.01, `p=${mk.pValue}`);
  assert.ok(mk.tau > 0.9, `tau=${mk.tau}`);
});

test('09 — Mann–Kendall detects monotonic downtrend and handles ties', () => {
  const p = perfectDown(20);
  const mk = mannKendallTest(p);
  assert.equal(mk.direction, 'decreasing');
  assert.ok(mk.s < 0);
  assert.ok(mk.pValue < 0.01);
  assert.ok(mk.tau < -0.9);

  const tied = mannKendallTest([
    { t: 0, y: 5 },
    { t: 1, y: 5 },
    { t: 2, y: 5 },
    { t: 3, y: 5 },
    { t: 4, y: 5 },
  ]);
  assert.equal(tied.s, 0);
  assert.equal(tied.direction, 'no-trend');
});

test('10 — Mann–Kendall returns neutral for n < 3', () => {
  const mk = mannKendallTest([{ t: 0, y: 1 }]);
  assert.equal(mk.direction, 'no-trend');
  assert.equal(mk.pValue, 1);
  assert.equal(mk.n, 1);
});

test('11 — Theil–Sen slope is robust to a single outlier', () => {
  // Perfect line y = x, then one huge outlier at the end.
  const pts: TrendPoint[] = [];
  for (let i = 0; i < 20; i++) pts.push({ t: i, y: i });
  pts.push({ t: 20, y: 9999 });
  const ts = theilSenSlope(pts);
  assert.ok(APPROX(ts.slope, 1, 0.1), `Theil-Sen slope=${ts.slope}`);
  // OLS slope would be badly skewed
  const ols = linearRegression(pts);
  assert.ok(ols.slope > 20, `OLS should be pulled up; got ${ols.slope}`);
  // CI bracketing
  assert.ok(ts.ciLower <= ts.slope);
  assert.ok(ts.ciUpper >= ts.slope);
});

test('12 — Theil–Sen matches OLS on clean linear data', () => {
  const p = perfectUp(30);
  const ts = theilSenSlope(p);
  const ols = linearRegression(p);
  assert.ok(APPROX(ts.slope, ols.slope, 1e-9));
});

test('13 — CUSUM detects a step shift and location is near the break', () => {
  const p = stepShift(30, 10, 40);
  const cps = detectChangePoints(p, 0.6);
  assert.ok(cps.length >= 1, `expected ≥1 change-point, got ${cps.length}`);
  // First detection should land somewhere in the second half (post-shift)
  assert.ok(cps[0].index >= 14, `first CP index=${cps[0].index}`);
  assert.equal(cps[0].direction, 'up');
});

test('14 — CUSUM returns [] for flat noise and for tiny inputs', () => {
  const cps1 = detectChangePoints(flatNoisy(50, 100), 0.2);
  // Strict sensitivity → unlikely to flag pure noise
  assert.ok(cps1.length <= 2, `noise false positives=${cps1.length}`);
  assert.deepEqual(detectChangePoints([], 0.5), []);
  assert.deepEqual(detectChangePoints([{ t: 0, y: 1 }], 0.5), []);
  // Constant series
  assert.deepEqual(
    detectChangePoints(
      series([3, 3, 3, 3, 3, 3]),
      0.8,
    ),
    [],
  );
});

test('15 — classify: uptrend / downtrend / stable / volatile', () => {
  assert.equal(classify(perfectUp(15)), 'uptrend');
  assert.equal(classify(perfectDown(15)), 'downtrend');
  assert.equal(classify(flatNoisy(30, 100)), 'stable');
  // Volatile: large CV with no significant slope
  const volatile: TrendPoint[] = [];
  const pattern = [10, 200, 5, 180, 15, 190, 8, 210, 12, 205, 7, 195];
  for (let i = 0; i < pattern.length; i++) volatile.push({ t: i, y: pattern[i] });
  const cls = classify(volatile);
  assert.ok(cls === 'volatile' || cls === 'stable', `got ${cls}`);
});

test('16 — TrendDetector.analyze produces a full bilingual bundle', () => {
  const td = new TrendDetector();
  const a = td.analyze(perfectUp(14));
  assert.equal(a.classification, 'uptrend');
  assert.ok(a.regression.rSquared > 0.99);
  assert.equal(a.mannKendall.direction, 'increasing');
  assert.ok(a.theilSen.slope > 1.9 && a.theilSen.slope < 2.1);
  // Hebrew summary must contain the RTL mark and the Hebrew label
  assert.ok(a.summaryHe.includes('\u200F'));
  assert.ok(a.summaryHe.includes('מגמת עלייה'));
  // English summary must contain the English label
  assert.ok(a.summaryEn.toLowerCase().includes('uptrend'));
  // n match
  assert.equal(a.n, 14);
});

test('17 — TrendDetector.analyze is pure: does not mutate input', () => {
  const td = trendDetector;
  const input = perfectUp(10);
  const snapshot = JSON.stringify(input);
  td.analyze(input);
  assert.equal(JSON.stringify(input), snapshot);
});

test('18 — analyze is deterministic across runs', () => {
  const td = new TrendDetector();
  const input = [
    ...perfectUp(10),
    ...flatNoisy(10, 50).map((p, i) => ({ t: 10 + i, y: p.y })),
  ];
  const a = td.analyze(input);
  const b = td.analyze(input);
  assert.deepEqual(a.regression, b.regression);
  assert.deepEqual(a.mannKendall, b.mannKendall);
  assert.deepEqual(a.theilSen, b.theilSen);
  assert.deepEqual(a.changePoints, b.changePoints);
  assert.equal(a.summaryHe, b.summaryHe);
  assert.equal(a.summaryEn, b.summaryEn);
});

test('19 — summary() renders both languages correctly', () => {
  const a = trendDetector.analyze(perfectDown(12));
  const { he, en } = summary(a);
  assert.ok(he.includes('מגמת ירידה'));
  assert.ok(en.includes('downtrend'));
  // Numeric content safely embedded
  assert.ok(en.includes('-4'));
});

test('20 — rtlNumber helper wraps with U+200F', () => {
  const s = rtlNumber(3.14);
  assert.ok(s.startsWith('\u200F'));
  assert.ok(s.endsWith('\u200F'));
  assert.ok(s.includes('3.14'));
});

test('21 — __internal.roundTo / clamp / fmt / incompleteBeta', () => {
  assert.equal(__internal.roundTo(1.23456, 2), 1.23);
  assert.equal(__internal.clamp(5, 0, 10), 5);
  assert.equal(__internal.clamp(-5, 0, 10), 0);
  assert.equal(__internal.clamp(15, 0, 10), 10);
  assert.equal(__internal.fmt(Infinity), '+∞');
  assert.equal(__internal.fmt(-Infinity), '-∞');
  assert.equal(__internal.fmt(NaN), 'NaN');
  // I_{0.5}(1,1) should equal 0.5 (beta(1,1) = uniform)
  assert.ok(APPROX(__internal.incompleteBeta(1, 1, 0.5), 0.5, 1e-6));
});
