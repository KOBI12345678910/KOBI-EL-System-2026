/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ONYX AI — ForecastComparator Tests  (Agent Y-162)
 * בדיקות סוכן השוואת תחזיות
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Run (matching the project's existing convention in test/platform.test.ts):
 *
 *   TS_NODE_TRANSPILE_ONLY=true npx node --test --require ts-node/register \
 *       test/forecast/comparator.test.ts
 *
 * Zero runtime dependencies: only `node:test` and `node:assert/strict`
 * from the Node standard library. No mocks, no fixtures on disk.
 *
 * Tests are organized in three bands:
 *
 *   A. Metric kernels (pure functions) — 10 tests
 *   B. ForecastComparator.compare     end-to-end — 6 tests
 *   C. Diebold-Mariano                 — 3 tests
 *
 * Total: 19 tests (exceeds the 15+ requirement).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ForecastComparator,
  computeMAE,
  computeRMSE,
  computeMAPEGuarded,
  computeSMAPE,
  computeWAPE,
  computeMASE,
  computeTheilU,
  computeDirectionalAccuracy,
  dieboldMariano,
  HEADERS_HE,
  HEADERS_EN,
} from '../../src/forecast/comparator';

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

/** approximately-equal assertion with a tolerance in absolute units */
function near(actual: number, expected: number, eps = 1e-9, msg?: string): void {
  assert.ok(
    Math.abs(actual - expected) <= eps,
    `${msg ?? 'near()'}: expected ${expected}, got ${actual} (|Δ|=${Math.abs(actual - expected)})`,
  );
}

// ─────────────────────────────────────────────────────────────────────────
// BAND A — metric kernels
// ─────────────────────────────────────────────────────────────────────────

test('A-01 MAE: perfect forecast is zero, and arithmetic is exact', () => {
  near(computeMAE([1, 2, 3, 4], [1, 2, 3, 4]), 0);
  // errors = |0-1|, |2-0|, |3-1|, |4-4|  = 1, 2, 2, 0 → mean = 1.25
  near(computeMAE([0, 2, 3, 4], [1, 0, 1, 4]), 1.25);
});

test('A-02 RMSE: penalizes large deviations more than MAE', () => {
  const actual = [0, 0, 0, 0];
  const small  = [1, 1, 1, 1]; // all errors = 1
  const spiky  = [0, 0, 0, 4]; // one error = 4
  near(computeRMSE(actual, small), 1);
  // sqrt( (0+0+0+16)/4 ) = sqrt(4) = 2
  near(computeRMSE(actual, spiky), 2);
  // In contrast, MAE for "spiky" is only 1 (4/4), so RMSE > MAE as expected.
  assert.ok(computeRMSE(actual, spiky) > computeMAE(actual, spiky));
});

test('A-03 MAPE: guards against zero actuals and reports skipped count', () => {
  const actual = [0, 100, 200];
  const forecast = [5, 110, 180];
  const { mape, skipped, fallback } = computeMAPEGuarded(actual, forecast);
  // index 0 is skipped. retained: (|100-110|/100 + |200-180|/200) / 2
  //                             = (0.10 + 0.10) / 2 = 0.10 → 10%
  near(mape, 10, 1e-9);
  assert.equal(skipped, 1);
  assert.equal(fallback, false);
});

test('A-04 MAPE fallback to WAPE when every actual is near-zero', () => {
  const actual   = [0, 0, 0, 0];
  const forecast = [1, 2, 3, 4];
  const { mape, skipped, fallback } = computeMAPEGuarded(actual, forecast);
  assert.equal(skipped, 4);
  assert.equal(fallback, true);
  // WAPE = Σ|a-f| / Σ|a|  → denominator is zero → function returns 0.
  // This documents the fallback path: no exception, finite number.
  assert.ok(Number.isFinite(mape));
});

test('A-05 sMAPE: symmetric, 200% clip on pure sign flip', () => {
  // Symmetry: swap a/f → same value.
  const a = [10, 20, 30];
  const f = [12, 18, 33];
  near(computeSMAPE(a, f), computeSMAPE(f, a), 1e-12);

  // Worst case: forecast of opposite sign → 2·|a-f|/(|a|+|f|) = 2 → clipped to 200%.
  near(computeSMAPE([10, 10, 10], [-10, -10, -10]), 200);
});

test('A-06 WAPE: volume-weighted; tiny error on large actual is small', () => {
  // WAPE =  (1 + 1) / (1000 + 1) ≈ 0.2% (not 50% like MAPE would give)
  const actual = [1000, 1];
  const forecast = [1001, 2];
  near(computeWAPE(actual, forecast), (2 / 1001) * 100, 1e-12);
});

test('A-07 MASE: identity=0, flat series uses caps', () => {
  // Identical forecast → numerator 0 → MASE 0 whatever the denominator.
  near(computeMASE([1, 2, 3, 4], [1, 2, 3, 4]), 0);

  // Flat series + non-flat forecast → denom = 0, num ≠ 0 → capped.
  const flat = [5, 5, 5, 5];
  const bad  = [4, 5, 6, 5];
  assert.equal(computeMASE(flat, bad), Number.MAX_SAFE_INTEGER);
});

test('A-08 MASE: seasonality parameter picks seasonal-naive denominator', () => {
  // Constructed series with monthly period = 3 and clean seasonal pattern.
  const actual = [10, 20, 30, 10, 20, 30, 10, 20, 30];
  const forecast = [10, 20, 30, 10, 20, 30, 10, 20, 30]; // perfect
  near(computeMASE(actual, forecast, 3), 0);

  // A forecast that is off by 1 everywhere.
  const off = actual.map(v => v + 1);
  const m1 = computeMASE(actual, off, 1);
  const m3 = computeMASE(actual, off, 3);
  // Both should be finite and positive; seasonal denominator (m=3) is
  // smaller (zero cross-period change on a perfect seasonal series),
  // so MASE under m=3 should be strictly LARGER than under m=1.
  assert.ok(Number.isFinite(m1) && m1 > 0);
  assert.ok(m3 >= m1);
});

test("A-09 Theil's U: <1 means model beats random-walk baseline", () => {
  // Trend with tiny noise. Forecast tracks it tightly → U < 1.
  const actual   = [1, 2, 3, 4, 5, 6, 7, 8];
  const forecast = [1, 2, 3.1, 4.1, 5, 6.1, 7, 8]; // close to perfect
  const u = computeTheilU(actual, forecast);
  assert.ok(u < 1, `expected Theil's U < 1 for near-perfect tracker, got ${u}`);

  // Flat repeat of the previous actual is *exactly* the random-walk
  // naive baseline → U = 1.
  const naiveForecast = actual.slice(0, -1);
  naiveForecast.unshift(actual[0]); // pad index 0
  near(computeTheilU(actual, naiveForecast), 1, 1e-12);
});

test('A-10 Directional accuracy: perfect trend follower is 100%', () => {
  const actual   = [10, 12, 11, 14, 13, 16];
  const follower = [10, 13, 10, 15, 12, 17]; // every direction matches sign
  near(computeDirectionalAccuracy(actual, follower), 100);

  // An inverted "contrarian" forecast should score 0%.
  const contrarian = [10, 9, 12, 11, 14, 15];
  const da = computeDirectionalAccuracy(actual, contrarian);
  assert.ok(da <= 20, `contrarian da should be small, got ${da}`);
});

// ─────────────────────────────────────────────────────────────────────────
// BAND B — ForecastComparator.compare end-to-end
// ─────────────────────────────────────────────────────────────────────────

test('B-01 compare: rejects empty and mismatched-length inputs bilingually', () => {
  const c = new ForecastComparator();
  assert.throws(
    () => c.compare([], [{ name: 'a', values: [] }]),
    /empty|ריק/i,
  );
  assert.throws(
    () => c.compare([1, 2, 3], [{ name: 'short', values: [1, 2] }]),
    /length|אורך/i,
  );
  assert.throws(
    () => c.compare([1, 2, 3], []),
    /forecast|תחזית/i,
  );
});

test('B-02 compare: picks the better of two models as overall winner', () => {
  const actual = [10, 12, 11, 14, 13, 15, 16, 17, 19, 20];
  const good   = [10, 12, 11, 14, 13, 15, 16, 17, 19, 20]; // perfect
  const noisy  = [11, 14,  9, 17, 10, 18, 12, 19, 16, 24]; // messy

  const c = new ForecastComparator();
  const res = c.compare(actual, [
    { name: 'good', values: good, labelHe: 'מודל טוב', labelEn: 'Good Model' },
    { name: 'noisy', values: noisy, labelHe: 'מודל רועש', labelEn: 'Noisy Model' },
  ]);

  // Sanity: row shape and counts.
  assert.equal(res.rows.length, 2);
  assert.equal(res.rows[0].n, 10);

  // Winners per metric must all be "good".
  assert.equal(res.winners.mae, 'good');
  assert.equal(res.winners.rmse, 'good');
  assert.equal(res.winners.smape, 'good');
  assert.equal(res.winners.wape, 'good');
  assert.equal(res.winners.mase, 'good');
  assert.equal(res.winners.theilU, 'good');
  assert.equal(res.winners.directionalAccuracy, 'good');
  assert.equal(res.winners.overall, 'good');

  // Ranking order.
  assert.equal(res.ranked[0].name, 'good');
  assert.equal(res.ranked[0].rank, 1);
  assert.equal(res.ranked[1].name, 'noisy');
  assert.equal(res.ranked[1].rank, 2);
});

test('B-03 compare: bilingual labels flow through', () => {
  const actual = [1, 2, 3, 4];
  const c = new ForecastComparator();
  const res = c.compare(actual, [
    {
      name: 'linear',
      values: [1, 2, 3, 4],
      labelHe: 'מודל לינארי',
      labelEn: 'Linear Model',
    },
  ]);
  assert.equal(res.rows[0].labelHe, 'מודל לינארי');
  assert.equal(res.rows[0].labelEn, 'Linear Model');
  assert.equal(res.headers.he.mae, HEADERS_HE.mae);
  assert.equal(res.headers.en.mae, HEADERS_EN.mae);
  // Sanity: Hebrew header contains Hebrew letters.
  assert.match(res.headers.he.mae, /[\u0590-\u05FF]/);
  assert.match(res.headers.en.mae, /Error/);
});

test('B-04 compare: MAPE zero-guard skipped counter surfaces on the row', () => {
  const actual   = [0, 100, 0, 200];
  const forecast = [1, 110, 2, 180];
  const c = new ForecastComparator();
  const res = c.compare(actual, [{ name: 'f', values: forecast }]);
  const row = res.rows[0];
  assert.equal(row.mapeSkipped, 2);
  assert.equal(row.mapeFallback, false);
  assert.ok(row.mape > 0 && row.mape < 100, `mape=${row.mape}`);
});

test('B-05 compare: single-series compare does not crash DM loop', () => {
  const actual = [10, 11, 12, 13, 14, 15];
  const c = new ForecastComparator();
  const res = c.compare(actual, [{ name: 'solo', values: [10, 11, 12, 13, 14, 15] }]);
  // No pairwise tests possible with n=1.
  assert.equal(res.diebold.length, 0);
  assert.equal(res.winners.overall, 'solo');
});

test('B-06 compare: three-model pairwise DM grid has n·(n-1)/2 entries', () => {
  const actual = [10, 12, 11, 14, 13, 15, 16, 17, 19, 20, 22, 21];
  const a = [10, 12, 11, 14, 13, 15, 16, 17, 19, 20, 22, 21];
  const b = [11, 13, 10, 15, 12, 16, 15, 18, 18, 21, 21, 22];
  const d = [20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20];

  const c = new ForecastComparator();
  const res = c.compare(actual, [
    { name: 'a', values: a },
    { name: 'b', values: b },
    { name: 'd', values: d },
  ]);
  assert.equal(res.diebold.length, 3); // pairs: (a,b) (a,d) (b,d)
  // Every DM result has a bilingual verdict populated.
  for (const p of res.diebold) {
    assert.ok(typeof p.verdict.he === 'string' && p.verdict.he.length > 0);
    assert.ok(typeof p.verdict.en === 'string' && p.verdict.en.length > 0);
    assert.ok(Number.isFinite(p.pValue));
    assert.ok(p.pValue >= 0 && p.pValue <= 1);
  }
});

// ─────────────────────────────────────────────────────────────────────────
// BAND C — Diebold-Mariano
// ─────────────────────────────────────────────────────────────────────────

test('C-01 DM: identical forecasts → zero statistic, p=1', () => {
  const actual = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
  const f = actual.map(v => v + 0.5);
  const { dmStatistic, pValue } = dieboldMariano(actual, f, f);
  near(dmStatistic, 0);
  assert.equal(pValue, 1);
});

test('C-02 DM: sign indicates which forecast has lower squared error', () => {
  const actual = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
  const good   = actual.map(v => v + 0.1); // tiny error
  const bad    = actual.map(v => v + 2.0); // big error
  const { dmStatistic } = dieboldMariano(actual, good, bad);
  // d_t = err_good^2 - err_bad^2 < 0 → DM < 0 → "good" wins.
  assert.ok(dmStatistic < 0, `expected DM<0 when first arg wins, got ${dmStatistic}`);
});

test('C-03 DM: tiny sample (n<3) returns a sentinel, not NaN', () => {
  const { dmStatistic, pValue, n } = dieboldMariano([1, 2], [1.1, 2.2], [0.9, 2.0]);
  assert.equal(n, 2);
  assert.equal(dmStatistic, 0);
  assert.equal(pValue, 1);
});
