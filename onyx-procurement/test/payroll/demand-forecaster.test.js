/**
 * Demand Forecaster — Unit Tests
 * Agent X-11 / Swarm 3 — Kobi's mega-ERP for Techno-Kol Uzi.
 *
 * Covers all six forecasting methods, accuracy metrics, ensemble blending,
 * backtest selection, confidence bands, Israeli seasonality prior, and the
 * public forecast() dispatcher.
 *
 * Run with:   node --test test/payroll/demand-forecaster.test.js
 *       or:   node test/run.js --only demand-forecaster
 *
 * Requires Node >= 16 (node:test + assert/strict).
 *
 * Test data philosophy:
 *   - No randomness — all synthetic series are deterministic.
 *   - Known-truth checks: for a y = slope·t + intercept series the slope
 *     and intercept the model recovers MUST be exact (within 1e-9).
 *   - Seasonal truth checks: a repeated pattern must decompose into that
 *     exact pattern with zero residual.
 *   - Bilingual: a few tests exercise the Hebrew method labels to ensure
 *     they are present and non-empty.
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  forecast,
  ensemble,
  backtest,
  computeMetrics,
  movingAverage,
  weightedMovingAverage,
  exponentialSmoothing,
  simpleExponentialSmoothing,
  holtSmoothing,
  holtWintersAdditive,
  linearTrend,
  decomposeSeasonal,
  decomposeForecast,
  naiveForecast,
  applyIsraeliSeasonality,
  ISRAELI_SEASONALITY_MONTHLY,
  ISRAELI_SEASONALITY_MONTHLY_NORM,
  METHOD_LABELS,
  buildBands,
  defaultMethodList,
} = require(path.resolve(
  __dirname,
  '..',
  '..',
  'src',
  'forecasting',
  'demand-forecaster.js'
));

// ═════════════════════════════════════════════════════════════════════
// Synthetic series generators — all pure, all deterministic
// ═════════════════════════════════════════════════════════════════════

function constantSeries(value, n) {
  return new Array(n).fill(value);
}

function linearSeries(slope, intercept, n) {
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = intercept + slope * i;
  return out;
}

function seasonalAdditive(period, pattern, cycles) {
  // pattern must have length === period
  const out = new Array(period * cycles);
  for (let i = 0; i < out.length; i++) out[i] = pattern[i % period];
  return out;
}

function trendPlusSeason(slope, intercept, period, pattern, cycles) {
  const n = period * cycles;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = intercept + slope * i + pattern[i % period];
  }
  return out;
}

function multiplicativeSeason(trendStart, trendSlope, period, pattern, cycles) {
  const n = period * cycles;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const trend = trendStart + trendSlope * i;
    out[i] = trend * pattern[i % period];
  }
  return out;
}

// Approximate equality helper for floating-point math
function approx(actual, expected, tol, msg) {
  const d = Math.abs(actual - expected);
  if (d > tol) {
    assert.fail(
      `${msg || 'approx'}: expected ${expected}, got ${actual} (|Δ|=${d} > ${tol})`
    );
  }
}

// ═════════════════════════════════════════════════════════════════════
// SECTION 1 — computeMetrics (MAPE / RMSE / MAE / Bias)
// ═════════════════════════════════════════════════════════════════════

describe('DF.1 computeMetrics', () => {
  test('1.01 perfect forecast → all metrics zero', () => {
    const actual = [10, 20, 30, 40, 50];
    const m = computeMetrics(actual, actual.slice());
    assert.equal(m.mape, 0);
    assert.equal(m.rmse, 0);
    assert.equal(m.mae, 0);
    assert.equal(m.bias, 0);
    assert.equal(m.n, 5);
  });

  test('1.02 constant +1 bias produces bias=1, mae=1', () => {
    const actual = [10, 20, 30, 40];
    const pred = [11, 21, 31, 41];
    const m = computeMetrics(actual, pred);
    approx(m.bias, 1, 1e-9, 'bias');
    approx(m.mae, 1, 1e-9, 'mae');
    approx(m.rmse, 1, 1e-9, 'rmse');
  });

  test('1.03 MAPE is scale-free and matches manual calc', () => {
    const actual = [100, 200];
    const pred = [110, 180];           // |10/100|=0.10, |20/200|=0.10
    const m = computeMetrics(actual, pred);
    approx(m.mape, 0.10, 1e-9, 'mape');
  });

  test('1.04 zero actuals are skipped so MAPE stays finite when possible', () => {
    const actual = [0, 100];
    const pred = [5, 110];
    const m = computeMetrics(actual, pred);
    assert.ok(Number.isFinite(m.mape));
    approx(m.mape, 0.10, 1e-9, 'mape only from non-zero point');
  });

  test('1.05 all-zero actuals → mape Infinity, other metrics finite', () => {
    const actual = [0, 0, 0];
    const pred = [1, -1, 2];
    const m = computeMetrics(actual, pred);
    assert.equal(m.mape, Infinity);
    approx(m.bias, 2 / 3, 1e-9, 'bias with all-zero actuals');
  });

  test('1.06 negative bias shows under-forecasting', () => {
    const actual = [100, 100, 100];
    const pred = [90, 80, 70];
    const m = computeMetrics(actual, pred);
    assert.ok(m.bias < 0, 'bias should be negative when forecast < actual');
  });

  test('1.07 length mismatch throws', () => {
    assert.throws(() => computeMetrics([1, 2], [1, 2, 3]), /same length/);
  });
});

// ═════════════════════════════════════════════════════════════════════
// SECTION 2 — Moving averages (simple + weighted)
// ═════════════════════════════════════════════════════════════════════

describe('DF.2 Moving averages', () => {
  test('2.01 simple MA window=3 smooths to tail mean', () => {
    const r = movingAverage([10, 20, 30, 40, 50], 3, { horizon: 2 });
    // tail window mean = (30+40+50)/3 = 40
    approx(r.value, 40, 1e-9, 'tail mean');
    assert.deepEqual(r.predictions, [40, 40]);
  });

  test('2.02 MA predictions are flat', () => {
    const r = movingAverage([1, 2, 3, 4, 5], 2, { horizon: 5 });
    const first = r.predictions[0];
    for (const p of r.predictions) approx(p, first, 1e-12, 'flat');
  });

  test('2.03 MA on constant series returns the constant', () => {
    const r = movingAverage(constantSeries(42, 10), 4, { horizon: 3 });
    for (const p of r.predictions) approx(p, 42, 1e-9, 'constant forecast');
  });

  test('2.04 weighted MA tilts toward the tail', () => {
    // linear weights 1,2,3 → tail dominates: (1·10 + 2·20 + 3·30)/6 = 140/6 ≈ 23.33
    const r = weightedMovingAverage([10, 20, 30], 3, null, { horizon: 1 });
    approx(r.predictions[0], (1 * 10 + 2 * 20 + 3 * 30) / 6, 1e-9, 'wma linear');
  });

  test('2.05 weighted MA with custom weights', () => {
    // custom weights [1,1,1] should match simple MA
    const r = weightedMovingAverage([10, 20, 30], 3, [1, 1, 1], { horizon: 1 });
    approx(r.predictions[0], 20, 1e-9, 'uniform wma == simple MA');
  });

  test('2.06 MA window larger than series throws', () => {
    assert.throws(() => movingAverage([1, 2, 3], 5), /window/);
  });

  test('2.07 MA rejects non-array input', () => {
    assert.throws(() => movingAverage('not an array', 3), /array/);
  });
});

// ═════════════════════════════════════════════════════════════════════
// SECTION 3 — Linear regression on time
// ═════════════════════════════════════════════════════════════════════

describe('DF.3 Linear regression', () => {
  test('3.01 exact slope + intercept recovery on y=2t+5', () => {
    const s = linearSeries(2, 5, 20);
    const r = linearTrend(s);
    approx(r.slope, 2, 1e-9, 'slope');
    approx(r.intercept, 5, 1e-9, 'intercept');
  });

  test('3.02 horizon forecast extrapolates exactly on pure line', () => {
    const s = linearSeries(3, 10, 15);
    const r = linearTrend(s, { horizon: 5 });
    // at index 15 value should be 3*15+10=55
    approx(r.predictions[0], 55, 1e-9, 'next step');
    approx(r.predictions[4], 3 * 19 + 10, 1e-9, 'h=5');
  });

  test('3.03 R² == 1 for a perfectly linear series', () => {
    const s = linearSeries(1, 0, 50);
    const r = linearTrend(s);
    approx(r.r2, 1, 1e-9, 'R² perfect');
  });

  test('3.04 R² ~ 0 for a pure constant, zero slope', () => {
    const s = constantSeries(7, 10);
    const r = linearTrend(s);
    approx(r.slope, 0, 1e-12, 'flat slope');
    // R² defined as 1 when ssTot is 0 (pure constant)
    approx(r.r2, 1, 1e-12, 'R² degenerate');
  });

  test('3.05 < 2 points throws', () => {
    assert.throws(() => linearTrend([5]), /at least 2/);
  });
});

// ═════════════════════════════════════════════════════════════════════
// SECTION 4 — Exponential smoothing (SES / Holt / Holt-Winters)
// ═════════════════════════════════════════════════════════════════════

describe('DF.4 Exponential smoothing', () => {
  test('4.01 SES on constant returns the constant', () => {
    const s = constantSeries(15, 20);
    const r = exponentialSmoothing(s, 0.4, undefined, undefined, undefined, { horizon: 3 });
    assert.equal(r.kind, 'ses');
    for (const p of r.predictions) approx(p, 15, 1e-9, 'ses constant');
  });

  test('4.02 SES tracks level of jumped series', () => {
    const s = [10, 10, 10, 10, 20, 20, 20, 20];
    const r = exponentialSmoothing(s, 0.5, undefined, undefined, undefined, { horizon: 1 });
    assert.ok(r.predictions[0] > 10, 'level should have risen past 10');
    assert.ok(r.predictions[0] <= 20, 'level should not overshoot 20');
  });

  test('4.03 Holt on y=2t+5 recovers trend and extrapolates', () => {
    const s = linearSeries(2, 5, 30);
    // high alpha+beta so it locks onto the line quickly
    const r = exponentialSmoothing(s, 0.9, 0.9, undefined, undefined, { horizon: 3 });
    assert.equal(r.kind, 'holt');
    approx(r.predictions[0], 2 * 30 + 5, 1e-6, 'h=1');
    approx(r.predictions[2], 2 * 32 + 5, 1e-6, 'h=3');
  });

  test('4.04 Holt-Winters recovers a pure additive seasonal series', () => {
    // pattern of length 4, 6 cycles, with no trend
    const pattern = [10, -5, 20, -25];
    const s = seasonalAdditive(4, pattern, 6);       // mean 0 pattern, plus 0 trend
    // center around 100 so MAPE stays finite
    const centred = s.map((v) => v + 100);
    const r = exponentialSmoothing(centred, 0.3, 0.1, 0.4, 4, { horizon: 8 });
    assert.equal(r.kind, 'holt_winters');
    // after burn-in, predicted values should be close to pattern+100
    for (let h = 0; h < 8; h++) {
      const expected = 100 + pattern[(centred.length + h) % 4];
      approx(r.predictions[h], expected, 5, `hw h=${h}`);
    }
  });

  test('4.05 Holt-Winters with too-short series falls back to Holt', () => {
    const s = linearSeries(1, 0, 10);          // 10 points only
    const r = exponentialSmoothing(s, 0.5, 0.2, 0.3, 12, { horizon: 2 });
    assert.equal(r.kind, 'holt', 'should degrade gracefully to Holt');
  });

  test('4.06 invalid alpha (> 1) throws', () => {
    assert.throws(() => exponentialSmoothing([1, 2, 3], 1.5), /alpha/);
  });

  test('4.07 Holt requires >= 2 points', () => {
    assert.throws(() => holtSmoothing([5], 0.5, 0.5), /at least 2/);
  });

  test('4.08 simpleExponentialSmoothing level sequence is monotone for monotone input', () => {
    const s = [1, 2, 3, 4, 5];
    const r = simpleExponentialSmoothing(s, 0.5);
    for (let i = 1; i < r.level.length; i++) {
      assert.ok(r.level[i] >= r.level[i - 1], 'SES level monotone');
    }
  });
});

// ═════════════════════════════════════════════════════════════════════
// SECTION 5 — Seasonal decomposition (additive + multiplicative)
// ═════════════════════════════════════════════════════════════════════

describe('DF.5 Seasonal decomposition', () => {
  test('5.01 additive decomposition recovers pattern exactly', () => {
    const pattern = [-10, 0, 10];          // mean zero
    const s = seasonalAdditive(3, pattern, 8);
    const dec = decomposeSeasonal(s, 3, 'additive');
    approx(dec.seasonalByPhase[0], -10, 1e-9, 'phase 0');
    approx(dec.seasonalByPhase[1], 0, 1e-9, 'phase 1');
    approx(dec.seasonalByPhase[2], 10, 1e-9, 'phase 2');
  });

  test('5.02 additive seasonal is centred (sum ≈ 0)', () => {
    const pattern = [5, -3, 2, -4, 0];     // sum=0 already, but test anyway
    const s = seasonalAdditive(5, pattern, 4);
    const dec = decomposeSeasonal(s, 5, 'additive');
    const total = dec.seasonalByPhase.reduce((a, b) => a + b, 0);
    approx(total, 0, 1e-9, 'additive centred');
  });

  test('5.03 multiplicative decomposition on purely multiplicative series', () => {
    const pattern = [0.9, 1.1, 1.0, 1.0];  // centred around 1
    const s = multiplicativeSeason(100, 0, 4, pattern, 8);
    const dec = decomposeSeasonal(s, 4, 'multiplicative');
    // check geometric mean ≈ 1
    let logSum = 0;
    for (const v of dec.seasonalByPhase) logSum += Math.log(v);
    approx(Math.exp(logSum / 4), 1, 1e-9, 'multiplicative geomean');
  });

  test('5.04 decompose + forecast extends trend + repeats season', () => {
    const pattern = [-5, 0, 5];
    // upward trend + seasonal
    const s = trendPlusSeason(1, 100, 3, pattern, 10);
    const f = decomposeForecast(s, 3, 6, 'additive');
    // next point should be ~ (100 + 30*1) + pattern[30%3] = 130 + (-5) = 125
    const expected = 100 + 1 * 30 + pattern[30 % 3];
    approx(f.predictions[0], expected, 1.5, 'decompose forecast h=1');
  });

  test('5.05 decomposition requires >= 2 full periods', () => {
    assert.throws(() => decomposeSeasonal([1, 2, 3, 4, 5], 6, 'additive'), /2 full periods/);
  });

  test('5.06 odd and even periods both work', () => {
    // period=4 (even)
    const evenS = seasonalAdditive(4, [1, -2, 3, -2], 6);
    assert.doesNotThrow(() => decomposeSeasonal(evenS, 4, 'additive'));
    // period=3 (odd)
    const oddS = seasonalAdditive(3, [1, -2, 1], 6);
    assert.doesNotThrow(() => decomposeSeasonal(oddS, 3, 'additive'));
  });
});

// ═════════════════════════════════════════════════════════════════════
// SECTION 6 — Naive forecasts
// ═════════════════════════════════════════════════════════════════════

describe('DF.6 Naive forecasts', () => {
  test('6.01 last-value naive repeats final observation', () => {
    const r = naiveForecast([3, 7, 11], 4);
    assert.equal(r.mode, 'last');
    assert.deepEqual(r.predictions, [11, 11, 11, 11]);
  });

  test('6.02 seasonal naive period=4 replays last period', () => {
    const r = naiveForecast([1, 2, 3, 4, 5, 6, 7, 8], 4, 4);
    assert.equal(r.mode, 'seasonal');
    assert.deepEqual(r.predictions, [5, 6, 7, 8]);
  });

  test('6.03 seasonal naive wraps for horizons > period', () => {
    const r = naiveForecast([10, 20, 30, 40], 6, 4);
    // h=1..4 replay last period; h=5 replays index 0 of last period; h=6 index 1
    assert.equal(r.predictions.length, 6);
    approx(r.predictions[4], 10, 1e-9, 'wrap h=5');
    approx(r.predictions[5], 20, 1e-9, 'wrap h=6');
  });

  test('6.04 empty series throws', () => {
    assert.throws(() => naiveForecast([], 3), /empty/);
  });
});

// ═════════════════════════════════════════════════════════════════════
// SECTION 7 — Backtest + method selection
// ═════════════════════════════════════════════════════════════════════

describe('DF.7 Backtest', () => {
  test('7.01 backtest runs every applicable method and returns a best', () => {
    const s = linearSeries(2, 5, 40);
    const bt = backtest(s, undefined, { period: 12, holdout: 6 });
    assert.ok(bt.results.length > 0);
    assert.ok(bt.best, 'best method set');
    // On a pure line, linear or holt should win
    assert.ok(
      ['linear', 'holt'].includes(bt.best),
      `expected linear or holt, got ${bt.best}`
    );
  });

  test('7.02 backtest ranks by MAPE ascending', () => {
    const s = linearSeries(1, 10, 30);
    const bt = backtest(s, undefined, { period: 12, holdout: 5 });
    for (let i = 1; i < bt.results.length; i++) {
      const a = Number.isFinite(bt.results[i - 1].mape) ? bt.results[i - 1].mape : Infinity;
      const b = Number.isFinite(bt.results[i].mape) ? bt.results[i].mape : Infinity;
      assert.ok(a <= b, `results sorted by mape: ${a} <= ${b}`);
    }
  });

  test('7.03 backtest skips Holt-Winters on too-short series', () => {
    const bt = backtest(linearSeries(1, 0, 10), undefined, { period: 12, holdout: 2 });
    const hw = bt.results.find((r) => r.method === 'holt_winters');
    assert.equal(hw, undefined, 'HW should be skipped');
  });

  test('7.04 backtest on seasonal series prefers a seasonal method', () => {
    const pattern = [5, -3, 8, -2, 6, -4, 7, -5, 4, -1, 9, -3];   // length 12
    const s = trendPlusSeason(0.5, 100, 12, pattern, 6);         // 72 points
    const bt = backtest(s, undefined, { period: 12 });
    // One of the seasonal methods should be among the top 3
    const top3 = bt.results.slice(0, 3).map((r) => r.method);
    const anySeasonal = top3.some((m) =>
      ['seasonal_add', 'seasonal_mul', 'holt_winters', 'seasonal_naive'].includes(m)
    );
    assert.ok(anySeasonal, `expected a seasonal winner in top3, got ${top3.join(',')}`);
  });
});

// ═════════════════════════════════════════════════════════════════════
// SECTION 8 — Ensemble
// ═════════════════════════════════════════════════════════════════════

describe('DF.8 Ensemble', () => {
  test('8.01 ensemble returns positive weights summing to 1', () => {
    const s = linearSeries(1, 10, 30);
    const e = ensemble(s, 4, { period: 12 });
    const total = Object.values(e.weights).reduce((a, b) => a + b, 0);
    approx(total, 1, 1e-9, 'weights sum to 1');
    for (const w of Object.values(e.weights)) {
      assert.ok(w > 0, 'weights positive');
    }
  });

  test('8.02 ensemble prediction is within the range of its members', () => {
    const s = linearSeries(2, 0, 40);
    const e = ensemble(s, 3, { period: 12 });
    for (let h = 0; h < 3; h++) {
      let min = Infinity, max = -Infinity;
      for (const m of e.members) {
        if (m.predictions[h] < min) min = m.predictions[h];
        if (m.predictions[h] > max) max = m.predictions[h];
      }
      assert.ok(
        e.predictions[h] >= min - 1e-9 && e.predictions[h] <= max + 1e-9,
        `ensemble h=${h} within [${min}, ${max}], got ${e.predictions[h]}`
      );
    }
  });

  test('8.03 ensemble includes confidence bands', () => {
    const s = linearSeries(1, 10, 24);
    const e = ensemble(s, 3, { period: 12 });
    assert.ok(e.confidence_bands);
    assert.equal(e.confidence_bands.lower_95.length, 3);
    assert.equal(e.confidence_bands.upper_95.length, 3);
    for (let h = 0; h < 3; h++) {
      assert.ok(e.confidence_bands.lower_95[h] <= e.predictions[h]);
      assert.ok(e.confidence_bands.upper_95[h] >= e.predictions[h]);
      // 95% band should be wider than 80% band
      const w95 = e.confidence_bands.upper_95[h] - e.confidence_bands.lower_95[h];
      const w80 = e.confidence_bands.upper_80[h] - e.confidence_bands.lower_80[h];
      assert.ok(w95 >= w80, '95% band wider than 80%');
    }
  });
});

// ═════════════════════════════════════════════════════════════════════
// SECTION 9 — Public forecast() dispatcher
// ═════════════════════════════════════════════════════════════════════

describe('DF.9 forecast() dispatcher', () => {
  test('9.01 auto mode picks a method and fills envelope', () => {
    const s = linearSeries(3, 5, 30);
    const f = forecast(s, 4);
    assert.ok(f.method_used);
    assert.equal(f.predictions.length, 4);
    assert.ok(f.confidence_bands);
    assert.ok(f.accuracy);
    assert.ok(typeof f.method_he === 'string' && f.method_he.length > 0, 'Hebrew label');
  });

  test('9.02 forcing method=holt on a linear series produces sharp forecast', () => {
    const s = linearSeries(2, 0, 20);
    const f = forecast(s, 3, 'holt', { alphaHolt: 0.9, betaHolt: 0.9 });
    assert.equal(f.method_used, 'holt');
    // predictions should be increasing
    assert.ok(f.predictions[1] > f.predictions[0]);
    assert.ok(f.predictions[2] > f.predictions[1]);
  });

  test('9.03 ensemble method on seasonal series', () => {
    const pattern = [10, -5, 15, -20];
    const s = trendPlusSeason(0.3, 100, 4, pattern, 10);
    const f = forecast(s, 8, 'ensemble', { period: 4 });
    assert.equal(f.method_used, 'ensemble');
    assert.ok(f.weights);
    assert.ok(Object.keys(f.weights).length > 0);
  });

  test('9.04 forecast rejects non-positive horizon', () => {
    assert.throws(() => forecast([1, 2, 3], 0), /horizon/);
    assert.throws(() => forecast([1, 2, 3], -1), /horizon/);
  });

  test('9.05 forecast rejects non-array series', () => {
    assert.throws(() => forecast(null, 3), /array/);
  });

  test('9.06 forecast rejects NaN in series', () => {
    assert.throws(() => forecast([1, 2, NaN, 4], 3), /finite/);
  });

  test('9.07 unknown method name throws', () => {
    const s = linearSeries(1, 0, 20);
    assert.throws(() => forecast(s, 3, 'nope'), /not applicable/);
  });

  test('9.08 bilingual labels exist for every method key', () => {
    for (const key of defaultMethodList()) {
      assert.ok(METHOD_LABELS[key], `label exists for ${key}`);
      assert.ok(METHOD_LABELS[key].he && METHOD_LABELS[key].he.length > 0, `Hebrew for ${key}`);
      assert.ok(METHOD_LABELS[key].en && METHOD_LABELS[key].en.length > 0, `English for ${key}`);
    }
    // ensemble label
    assert.ok(METHOD_LABELS.ensemble.he);
    assert.ok(METHOD_LABELS.ensemble.en);
  });
});

// ═════════════════════════════════════════════════════════════════════
// SECTION 10 — Confidence bands
// ═════════════════════════════════════════════════════════════════════

describe('DF.10 Confidence bands', () => {
  test('10.01 bands widen as horizon grows (√h behaviour)', () => {
    const bands = buildBands([100, 100, 100, 100, 100], 10);
    const w0 = bands.upper_95[0] - bands.lower_95[0];
    const w4 = bands.upper_95[4] - bands.lower_95[4];
    assert.ok(w4 > w0, 'later horizons have wider bands');
  });

  test('10.02 zero sigma produces zero-width bands', () => {
    const bands = buildBands([50, 50], 0);
    approx(bands.upper_95[0], 50, 1e-9, 'upper');
    approx(bands.lower_95[0], 50, 1e-9, 'lower');
  });

  test('10.03 80% band is narrower than 95% band', () => {
    const bands = buildBands([10, 20, 30], 5);
    for (let h = 0; h < 3; h++) {
      const w80 = bands.upper_80[h] - bands.lower_80[h];
      const w95 = bands.upper_95[h] - bands.lower_95[h];
      assert.ok(w80 < w95, `80% narrower than 95% at h=${h}`);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════
// SECTION 11 — Israeli seasonality prior
// ═════════════════════════════════════════════════════════════════════

describe('DF.11 Israeli seasonality', () => {
  test('11.01 prior array length is 12', () => {
    assert.equal(ISRAELI_SEASONALITY_MONTHLY.length, 12);
    assert.equal(ISRAELI_SEASONALITY_MONTHLY_NORM.length, 12);
  });

  test('11.02 normalised prior has mean ≈ 1', () => {
    const sum = ISRAELI_SEASONALITY_MONTHLY_NORM.reduce((a, b) => a + b, 0);
    approx(sum / 12, 1, 1e-9, 'normalised mean');
  });

  test('11.03 Q4 (Oct/Nov/Dec) is above 1', () => {
    // indexes 9,10,11
    assert.ok(ISRAELI_SEASONALITY_MONTHLY_NORM[9] > 1, 'October uplift');
    assert.ok(ISRAELI_SEASONALITY_MONTHLY_NORM[10] > 1, 'November uplift');
    assert.ok(ISRAELI_SEASONALITY_MONTHLY_NORM[11] > 1, 'December uplift');
  });

  test('11.04 March (Passover) and August and September are below 1', () => {
    assert.ok(ISRAELI_SEASONALITY_MONTHLY_NORM[2] < 1, 'March dip');
    assert.ok(ISRAELI_SEASONALITY_MONTHLY_NORM[7] < 1, 'August dip');
    assert.ok(ISRAELI_SEASONALITY_MONTHLY_NORM[8] < 1, 'September dip');
  });

  test('11.05 applyIsraeliSeasonality multiplies per month', () => {
    const flat = [100, 100, 100, 100];   // 4 months
    // start at October (index 9)
    const tilted = applyIsraeliSeasonality(flat, 9);
    // Oct, Nov, Dec, Jan
    assert.ok(tilted[0] > 100, 'Oct > 100');
    assert.ok(tilted[1] > 100, 'Nov > 100');
    assert.ok(tilted[2] > 100, 'Dec > 100');
    approx(tilted[3], 100 * ISRAELI_SEASONALITY_MONTHLY_NORM[0], 1e-9, 'Jan');
  });

  test('11.06 applyIsraeliSeasonality rejects non-array', () => {
    assert.throws(() => applyIsraeliSeasonality('nope', 0), /array/);
  });
});

// ═════════════════════════════════════════════════════════════════════
// SECTION 12 — Realistic Israeli-demand scenario end-to-end
// ═════════════════════════════════════════════════════════════════════

describe('DF.12 Realistic Israeli demand scenarios', () => {
  test('12.01 monthly revenue with Q4 spike — ensemble forecasts next year', () => {
    // 3 years of monthly data, upward trend + the Israeli seasonal prior
    const base = 200;
    const slope = 5;   // 5k/month growth
    const history = [];
    for (let year = 0; year < 3; year++) {
      for (let m = 0; m < 12; m++) {
        const trend = base + slope * (year * 12 + m);
        const seasonal = ISRAELI_SEASONALITY_MONTHLY_NORM[m];
        history.push(trend * seasonal);
      }
    }
    // Forecast 12 months ahead
    const f = forecast(history, 12, 'ensemble', { period: 12 });
    assert.equal(f.predictions.length, 12);
    // December forecast (index 11 of the new year) should be highest region
    const dec = f.predictions[11];
    const aug = f.predictions[7];
    assert.ok(dec > aug, 'Dec peak > Aug trough');
    const sep = f.predictions[8];
    assert.ok(sep < dec, 'Sep trough < Dec peak');
  });

  test('12.02 auto-select picks a seasonal method on seasonal data', () => {
    const base = 500;
    const history = [];
    for (let year = 0; year < 4; year++) {
      for (let m = 0; m < 12; m++) {
        history.push(base * ISRAELI_SEASONALITY_MONTHLY_NORM[m]);
      }
    }
    const f = forecast(history, 6, undefined, { period: 12 });
    const seasonalMethods = [
      'seasonal_add',
      'seasonal_mul',
      'holt_winters',
      'seasonal_naive',
    ];
    assert.ok(
      seasonalMethods.includes(f.method_used),
      `expected a seasonal method, got ${f.method_used}`
    );
  });

  test('12.03 constant history → constant forecast (naive / MA wins)', () => {
    const history = constantSeries(1000, 30);
    const f = forecast(history, 5);
    for (const p of f.predictions) approx(p, 1000, 1e-6, 'constant forecast');
  });

  test('12.04 short history (< one period) still produces a forecast via fallback', () => {
    const history = [100, 110, 120, 130, 140];
    // period=12 but only 5 points — HW/seasonal will be skipped, but something wins
    const f = forecast(history, 2, undefined, { period: 12 });
    assert.equal(f.predictions.length, 2);
    assert.ok(Number.isFinite(f.predictions[0]));
    assert.ok(f.method_used);
  });
});
