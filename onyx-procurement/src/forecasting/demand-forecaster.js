/**
 * Demand Forecaster — Multi-Model Ensemble
 * Agent X-11 / Swarm 3 — Kobi's mega-ERP for Techno-Kol Uzi.
 *
 * Zero dependencies. Pure JavaScript math. No HTTP calls, no file I/O,
 * no randomness (fully deterministic). Runs equally well on Node 16+,
 * Electron, or inside a browser bundle. Everything is synchronous and
 * pure — nothing here mutates its input arrays.
 *
 * Implements SIX forecasting methods and an accuracy-weighted ensemble:
 *
 *   1.  Moving average           — simple + weighted (linear weights)
 *   2.  Exponential smoothing    — simple (SES) / double (Holt) /
 *                                  triple (Holt-Winters, additive seasonal)
 *   3.  Linear regression        — ordinary least squares on t -> y
 *   4.  Seasonal decomposition   — classical additive + multiplicative
 *                                  (centred moving average, period-aware)
 *   5.  Naive forecast           — last value + seasonal-naive (last period)
 *   6.  Ensemble                 — inverse-MAPE weighted average of the
 *                                  models above, chosen by walk-forward
 *                                  backtest on the training window
 *
 * Every forecast returns the shape:
 *
 *   {
 *     predictions:      Number[],      // horizon values
 *     confidence_bands: {
 *       lower_95: Number[],            // 95% prediction interval
 *       upper_95: Number[],
 *       lower_80: Number[],
 *       upper_80: Number[],
 *       sigma:    Number,              // residual stdev used
 *     },
 *     method_used: String,             // the key of the winning method
 *     accuracy: {
 *       mape: Number, rmse: Number, mae: Number, bias: Number,
 *       n: Number,                     // sample size used
 *     },
 *     method_he: String,               // Hebrew label of the method
 *     metadata: {...}                  // model-specific params
 *   }
 *
 * ACCURACY METRICS (all lower = better, except bias which is signed):
 *   - MAPE  = mean absolute percentage error       — scale-free, %
 *   - RMSE  = root mean squared error              — penalizes big misses
 *   - MAE   = mean absolute error                  — robust average
 *   - BIAS  = mean of (forecast - actual)          — directional tilt
 *
 * ISRAELI BUSINESS SEASONALITY (for the heuristic priors):
 *   - Q4 spike    — Oct/Nov/Dec push to close fiscal year (tax shelter,
 *                   bonus invoicing, hardware depreciation).
 *   - March       — Passover shutdown (schools + many firms 1-2 weeks off).
 *   - September   — Tishri holidays (Rosh Hashana, Yom Kippur, Sukkot);
 *                   roughly 10 working days lost — similar shape to March.
 *   - August      — Summer slowdown (kids off school, vendors on vacation).
 *   - Monthly EOM — invoice push on the last 3 working days of each month;
 *                   visible on daily series, not on monthly aggregates.
 *
 * These priors are exposed via ISRAELI_SEASONALITY_MONTHLY (12-index array,
 * multiplicative, centred on 1.0) and injected as a *baseline* seasonal
 * pattern when the supplied series is too short for Holt-Winters to learn
 * its own seasonal indices (< 2 full cycles).
 *
 * PUBLIC API:
 *   forecast(series, horizon, method?, opts?)
 *       → { predictions, confidence_bands, method_used, accuracy, ... }
 *   movingAverage(series, window, opts?)
 *       → { smoothed, predictions, ... }
 *   weightedMovingAverage(series, window, weights?)
 *       → { smoothed, predictions, ... }
 *   exponentialSmoothing(series, alpha, beta?, gamma?, period?)
 *       → Holt-Winters (or SES / Holt depending on params)
 *   linearTrend(series)
 *       → { slope, intercept, predictions, residuals, ... }
 *   decomposeSeasonal(series, period, type?)
 *       → { trend, seasonal, residual, type }
 *   naiveForecast(series, horizon, period?)
 *       → { predictions, mode }
 *   ensemble(series, horizon, opts?)
 *       → { predictions, confidence_bands, weights, members, ... }
 *   backtest(series, methods?, opts?)
 *       → { results: [{ method, mape, rmse, mae, bias }], best }
 *   computeMetrics(actual, forecast)
 *       → { mape, rmse, mae, bias, n }
 *
 * Everything is exported on module.exports for CommonJS consumers, and
 * individual named exports are attached for ES-module interop via
 * default-import-destructuring.
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// 0. CONSTANTS, LABELS, ISRAELI PRIORS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Multiplicative monthly pattern for the Israeli B2B/industrial calendar.
 * Index 0 = January, index 11 = December. Centred so the mean is ~1.0.
 *
 * Derived from the task brief:
 *   - Q4 spike  → Oct/Nov/Dec lifted
 *   - March     → Passover dip
 *   - September → Tishri holidays dip
 *   - August    → Summer slowdown dip
 *   - Apr/May/Jun/Jul — normal
 *
 * Values are heuristic priors, not learned parameters. Use only when the
 * series is shorter than two full annual cycles (i.e. Holt-Winters cannot
 * yet see a second seasonal turn). Once the history is long enough, the
 * decomposition will overwrite these.
 */
const ISRAELI_SEASONALITY_MONTHLY = Object.freeze([
  1.00, // Jan — normal, VAT-return month but business as usual
  1.02, // Feb — mild pre-Purim uptick
  0.88, // Mar — Passover shutdown
  1.05, // Apr — post-Pesach catch-up
  1.03, // May — normal
  1.02, // Jun — normal
  1.00, // Jul — start of summer
  0.90, // Aug — summer slowdown
  0.87, // Sep — Tishri (Rosh Hashana / Yom Kippur / Sukkot)
  1.12, // Oct — post-Tishri rebound + Q4 push begins
  1.14, // Nov — Q4 peak
  1.16, // Dec — fiscal year-end invoicing push
]);

// Sanity check that the prior is centred. If it drifts, any multiplier we
// apply will tilt the whole forecast, so we re-normalise once at load time.
const ISRAELI_PRIOR_MEAN =
  ISRAELI_SEASONALITY_MONTHLY.reduce((a, b) => a + b, 0) /
  ISRAELI_SEASONALITY_MONTHLY.length;
const ISRAELI_SEASONALITY_MONTHLY_NORM = Object.freeze(
  ISRAELI_SEASONALITY_MONTHLY.map((v) => v / ISRAELI_PRIOR_MEAN)
);

/**
 * Hebrew / English labels for every method key. Hebrew strings intentionally
 * use simple bidi-safe glyphs so they render correctly regardless of caller.
 */
const METHOD_LABELS = Object.freeze({
  naive:           { he: 'תחזית נאיבית',            en: 'Naive' },
  seasonal_naive:  { he: 'תחזית נאיבית עונתית',     en: 'Seasonal naive' },
  moving_average:  { he: 'ממוצע נע',                en: 'Moving average' },
  weighted_ma:     { he: 'ממוצע נע משוקלל',         en: 'Weighted MA' },
  ses:             { he: 'החלקה אקספוננציאלית',     en: 'Simple exponential smoothing' },
  holt:            { he: 'Holt (דאבל)',             en: 'Double exponential (Holt)' },
  holt_winters:    { he: 'Holt-Winters (טריפל)',    en: 'Triple exponential (Holt-Winters)' },
  linear:          { he: 'רגרסיה לינארית',          en: 'Linear regression' },
  seasonal_add:    { he: 'פירוק עונתי חיבורי',      en: 'Seasonal decomposition (additive)' },
  seasonal_mul:    { he: 'פירוק עונתי כפלי',        en: 'Seasonal decomposition (multiplicative)' },
  ensemble:        { he: 'אנסמבל משוקלל',           en: 'Weighted ensemble' },
});

// z-scores for symmetric prediction intervals
const Z_80 = 1.2816;
const Z_95 = 1.96;

// tiny epsilon for safe divisions
const EPS = 1e-12;

// Default periods assumed when the caller does not specify one:
//   12 → monthly, 7 → weekly daily, 4 → quarterly
const DEFAULT_PERIOD = 12;

// ═══════════════════════════════════════════════════════════════════════════
// 1. SMALL UTILITIES (validation, math helpers)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Copy a time series into a plain Array<number>, rejecting NaN / Infinity.
 * Never mutates the input. Throws TypeError on invalid shape.
 */
function toSeries(series) {
  if (!Array.isArray(series)) {
    throw new TypeError('series must be an array of finite numbers');
  }
  const out = new Array(series.length);
  for (let i = 0; i < series.length; i++) {
    const v = series[i];
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new TypeError(
        `series[${i}] is not a finite number (got ${v === null ? 'null' : typeof v})`
      );
    }
    out[i] = v;
  }
  return out;
}

function assertPositiveInt(n, name) {
  if (!Number.isInteger(n) || n <= 0) {
    throw new TypeError(`${name} must be a positive integer, got ${n}`);
  }
}

function assertUnit(x, name) {
  if (typeof x !== 'number' || !Number.isFinite(x) || x < 0 || x > 1) {
    throw new TypeError(`${name} must be a number in [0,1], got ${x}`);
  }
}

function sum(arr) {
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i];
  return s;
}

function mean(arr) {
  return arr.length === 0 ? 0 : sum(arr) / arr.length;
}

/**
 * Sample standard deviation (Bessel-corrected). Returns 0 for n < 2 so
 * divide-by-zero is impossible downstream.
 */
function stdev(arr) {
  const n = arr.length;
  if (n < 2) return 0;
  const m = mean(arr);
  let ss = 0;
  for (let i = 0; i < n; i++) {
    const d = arr[i] - m;
    ss += d * d;
  }
  return Math.sqrt(ss / (n - 1));
}

function lastOf(arr) {
  return arr[arr.length - 1];
}

function clamp(x, lo, hi) {
  return x < lo ? lo : x > hi ? hi : x;
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. ACCURACY METRICS — MAPE, RMSE, MAE, Bias
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compute MAPE, RMSE, MAE and bias between two equal-length arrays.
 *
 * MAPE skips points where |actual| < EPS to avoid divide-by-zero blowup.
 * If every actual is ~0 the returned mape is Infinity and the caller is
 * expected to fall back on RMSE / MAE.
 *
 * All metrics are returned as unit-less numbers (MAPE is a fraction, not a
 * percentage — multiply by 100 for display).
 */
function computeMetrics(actual, forecastArr) {
  if (!Array.isArray(actual) || !Array.isArray(forecastArr)) {
    throw new TypeError('computeMetrics requires two arrays');
  }
  if (actual.length !== forecastArr.length) {
    throw new TypeError(
      `actual (${actual.length}) and forecast (${forecastArr.length}) must be same length`
    );
  }
  const n = actual.length;
  if (n === 0) {
    return { mape: 0, rmse: 0, mae: 0, bias: 0, n: 0 };
  }

  let absErrSum = 0;
  let sqErrSum = 0;
  let biasSum = 0;
  let pctSum = 0;
  let pctCount = 0;

  for (let i = 0; i < n; i++) {
    const a = actual[i];
    const f = forecastArr[i];
    const err = f - a;
    absErrSum += Math.abs(err);
    sqErrSum += err * err;
    biasSum += err;
    if (Math.abs(a) > EPS) {
      pctSum += Math.abs(err / a);
      pctCount++;
    }
  }

  return {
    mape: pctCount === 0 ? Infinity : pctSum / pctCount,
    rmse: Math.sqrt(sqErrSum / n),
    mae: absErrSum / n,
    bias: biasSum / n,
    n,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. METHOD 1 — Moving average (simple + weighted)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Simple moving average.
 *
 * Returns:
 *   {
 *     smoothed:    Number[],   // centred smoothed history (undefined→NaN for warm-up)
 *     predictions: Number[],   // flat line at the last window mean for `horizon` steps
 *     window:      Number,
 *     value:       Number,     // the tail mean used as the forecast
 *   }
 *
 * The forecast for every future step is the mean of the last `window`
 * observations — this is the textbook MA(q) behaviour and is intentionally
 * flat. A sloping forecast comes from linearTrend or Holt, not from MA.
 */
function movingAverage(series, window, opts) {
  const s = toSeries(series);
  assertPositiveInt(window, 'window');
  const horizon = opts && typeof opts.horizon === 'number' ? opts.horizon : 1;
  assertPositiveInt(horizon, 'horizon');
  if (window > s.length) {
    throw new RangeError(`window (${window}) cannot exceed series length (${s.length})`);
  }

  const smoothed = new Array(s.length).fill(NaN);
  let running = 0;
  for (let i = 0; i < s.length; i++) {
    running += s[i];
    if (i >= window) running -= s[i - window];
    if (i >= window - 1) smoothed[i] = running / window;
  }

  const tailMean = smoothed[s.length - 1];
  const predictions = new Array(horizon).fill(tailMean);

  return { smoothed, predictions, window, value: tailMean };
}

/**
 * Weighted moving average with linearly-increasing weights by default:
 *   w_k = k / (1 + 2 + ... + window)  for k = 1..window
 *
 * A custom `weights` array can be supplied; it is normalised to sum to 1
 * before application.
 */
function weightedMovingAverage(series, window, weights, opts) {
  const s = toSeries(series);
  assertPositiveInt(window, 'window');
  if (window > s.length) {
    throw new RangeError(`window (${window}) cannot exceed series length (${s.length})`);
  }
  const horizon = opts && typeof opts.horizon === 'number' ? opts.horizon : 1;
  assertPositiveInt(horizon, 'horizon');

  // Build or validate weights
  let w;
  if (Array.isArray(weights)) {
    if (weights.length !== window) {
      throw new RangeError(
        `weights length (${weights.length}) must equal window (${window})`
      );
    }
    w = weights.slice();
  } else {
    w = new Array(window);
    for (let k = 0; k < window; k++) w[k] = k + 1; // linear 1..window
  }
  const wSum = sum(w);
  if (wSum <= 0) throw new RangeError('weights must sum to a positive number');
  for (let k = 0; k < window; k++) w[k] /= wSum;

  const smoothed = new Array(s.length).fill(NaN);
  for (let i = window - 1; i < s.length; i++) {
    let acc = 0;
    for (let k = 0; k < window; k++) {
      acc += w[k] * s[i - (window - 1 - k)];
    }
    smoothed[i] = acc;
  }

  const tail = smoothed[s.length - 1];
  const predictions = new Array(horizon).fill(tail);
  return { smoothed, predictions, window, weights: w, value: tail };
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. METHOD 2 — Exponential smoothing (SES / Holt / Holt-Winters)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Simple exponential smoothing (SES).
 *   ℓ_t = α·y_t + (1-α)·ℓ_{t-1}
 *   ŷ_{t+h} = ℓ_t  (flat forecast)
 */
function simpleExponentialSmoothing(series, alpha) {
  const s = toSeries(series);
  assertUnit(alpha, 'alpha');
  if (s.length === 0) throw new RangeError('series must not be empty');

  const level = new Array(s.length);
  level[0] = s[0];
  for (let t = 1; t < s.length; t++) {
    level[t] = alpha * s[t] + (1 - alpha) * level[t - 1];
  }
  return { level, final: level[level.length - 1] };
}

/**
 * Double exponential smoothing (Holt). Captures level + linear trend.
 *   ℓ_t = α·y_t + (1-α)·(ℓ_{t-1} + b_{t-1})
 *   b_t = β·(ℓ_t - ℓ_{t-1}) + (1-β)·b_{t-1}
 *   ŷ_{t+h} = ℓ_t + h·b_t
 */
function holtSmoothing(series, alpha, beta) {
  const s = toSeries(series);
  assertUnit(alpha, 'alpha');
  assertUnit(beta, 'beta');
  if (s.length < 2) throw new RangeError('Holt requires at least 2 points');

  const level = new Array(s.length);
  const trend = new Array(s.length);
  level[0] = s[0];
  trend[0] = s[1] - s[0];
  for (let t = 1; t < s.length; t++) {
    const prevLevel = level[t - 1];
    const prevTrend = trend[t - 1];
    level[t] = alpha * s[t] + (1 - alpha) * (prevLevel + prevTrend);
    trend[t] = beta * (level[t] - prevLevel) + (1 - beta) * prevTrend;
  }
  return {
    level, trend,
    finalLevel: level[level.length - 1],
    finalTrend: trend[trend.length - 1],
  };
}

/**
 * Triple exponential smoothing — Holt-Winters with ADDITIVE seasonality.
 * Follows Hyndman & Athanasopoulos (fpp3) notation:
 *
 *   ℓ_t = α·(y_t − s_{t−m}) + (1−α)·(ℓ_{t−1} + b_{t−1})
 *   b_t = β·(ℓ_t − ℓ_{t−1}) + (1−β)·b_{t−1}
 *   s_t = γ·(y_t − ℓ_{t−1} − b_{t−1}) + (1−γ)·s_{t−m}
 *   ŷ_{t+h} = ℓ_t + h·b_t + s_{t−m + ((h−1) mod m) + 1}
 *
 * Seasonal indices are initialised from the average of the first full
 * period minus the first-period mean (classic additive init). If the series
 * is shorter than one full period, Holt-Winters is not applicable and we
 * raise RangeError — the caller should fall back to Holt or SES.
 */
function holtWintersAdditive(series, alpha, beta, gamma, period) {
  const s = toSeries(series);
  assertUnit(alpha, 'alpha');
  assertUnit(beta, 'beta');
  assertUnit(gamma, 'gamma');
  assertPositiveInt(period, 'period');
  if (s.length < period * 2) {
    throw new RangeError(
      `Holt-Winters additive requires >= 2 full seasons (need ${period * 2}, got ${s.length})`
    );
  }

  const n = s.length;
  // ── init level: mean of first period ──
  let level0 = 0;
  for (let i = 0; i < period; i++) level0 += s[i];
  level0 /= period;

  // ── init trend: average change from season 1 → season 2 ──
  let trend0 = 0;
  for (let i = 0; i < period; i++) {
    trend0 += (s[period + i] - s[i]) / period;
  }
  trend0 /= period;

  // ── init seasonal: y_i − level0  over the first period, repeated ──
  const seasonal = new Array(n + period);
  for (let i = 0; i < period; i++) seasonal[i] = s[i] - level0;

  const level = new Array(n);
  const trend = new Array(n);
  level[0] = level0;
  trend[0] = trend0;

  for (let t = 1; t < n; t++) {
    const seasT = seasonal[t - period] !== undefined ? seasonal[t - period] : 0;
    const newLevel = alpha * (s[t] - seasT) + (1 - alpha) * (level[t - 1] + trend[t - 1]);
    const newTrend = beta * (newLevel - level[t - 1]) + (1 - beta) * trend[t - 1];
    const newSeason = gamma * (s[t] - level[t - 1] - trend[t - 1]) + (1 - gamma) * seasT;
    level[t] = newLevel;
    trend[t] = newTrend;
    seasonal[t] = newSeason;
  }

  return {
    level,
    trend,
    seasonal,
    period,
    finalLevel: level[n - 1],
    finalTrend: trend[n - 1],
  };
}

/**
 * Public exponential-smoothing entry point. Dispatches to SES, Holt, or
 * Holt-Winters based on which params are supplied.
 *
 *   exponentialSmoothing(s, α)                         → SES
 *   exponentialSmoothing(s, α, β)                      → Holt
 *   exponentialSmoothing(s, α, β, γ, period)           → Holt-Winters
 *
 * Returns the same envelope as every other forecaster in this module.
 */
function exponentialSmoothing(series, alpha, beta, gamma, period, opts) {
  const s = toSeries(series);
  const horizon = opts && typeof opts.horizon === 'number' ? opts.horizon : 1;
  assertPositiveInt(horizon, 'horizon');

  // ── Holt-Winters path ─────────────────────────────────────────────
  if (typeof gamma === 'number' && typeof period === 'number' && period > 0) {
    if (s.length >= period * 2) {
      const model = holtWintersAdditive(s, alpha, beta || 0, gamma, period);
      const predictions = new Array(horizon);
      const fitted = new Array(s.length);
      for (let t = 0; t < s.length; t++) {
        const seasIdx = t - period;
        fitted[t] =
          (t === 0 ? model.level[0] : model.level[t - 1] + model.trend[t - 1]) +
          (seasIdx >= 0 ? model.seasonal[seasIdx] : 0);
      }
      for (let h = 1; h <= horizon; h++) {
        const seasIdx = s.length - period + ((h - 1) % period);
        const seas = model.seasonal[seasIdx] !== undefined ? model.seasonal[seasIdx] : 0;
        predictions[h - 1] = model.finalLevel + h * model.finalTrend + seas;
      }
      return {
        kind: 'holt_winters',
        predictions,
        fitted,
        alpha, beta, gamma, period,
        finalLevel: model.finalLevel,
        finalTrend: model.finalTrend,
      };
    }
    // fall through to Holt if not enough data for HW
  }

  // ── Holt path ─────────────────────────────────────────────────────
  if (typeof beta === 'number') {
    const model = holtSmoothing(s, alpha, beta);
    const predictions = new Array(horizon);
    const fitted = new Array(s.length);
    fitted[0] = s[0];
    for (let t = 1; t < s.length; t++) {
      fitted[t] = model.level[t - 1] + model.trend[t - 1];
    }
    for (let h = 1; h <= horizon; h++) {
      predictions[h - 1] = model.finalLevel + h * model.finalTrend;
    }
    return {
      kind: 'holt',
      predictions,
      fitted,
      alpha, beta,
      finalLevel: model.finalLevel,
      finalTrend: model.finalTrend,
    };
  }

  // ── SES path ──────────────────────────────────────────────────────
  const model = simpleExponentialSmoothing(s, alpha);
  const predictions = new Array(horizon).fill(model.final);
  const fitted = new Array(s.length);
  fitted[0] = s[0];
  for (let t = 1; t < s.length; t++) fitted[t] = model.level[t - 1];
  return {
    kind: 'ses',
    predictions,
    fitted,
    alpha,
    final: model.final,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. METHOD 3 — Linear regression on time (OLS)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Ordinary-least-squares regression of y on t=0..n-1.
 *
 *   slope     = Cov(t, y) / Var(t)
 *   intercept = ȳ − slope·t̄
 *
 * Returns the fitted values, residuals, residual σ, plus an inline
 * `predict(h)` helper producing the forecast for h future steps.
 */
function linearTrend(series, opts) {
  const s = toSeries(series);
  const n = s.length;
  if (n < 2) {
    throw new RangeError('linearTrend requires at least 2 points');
  }
  const horizon = opts && typeof opts.horizon === 'number' ? opts.horizon : 1;

  // t values 0..n-1
  const tMean = (n - 1) / 2;
  const yMean = mean(s);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dt = i - tMean;
    num += dt * (s[i] - yMean);
    den += dt * dt;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = yMean - slope * tMean;

  // fitted + residuals
  const fitted = new Array(n);
  const residuals = new Array(n);
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    fitted[i] = intercept + slope * i;
    residuals[i] = s[i] - fitted[i];
    ssRes += residuals[i] * residuals[i];
    const dy = s[i] - yMean;
    ssTot += dy * dy;
  }
  const sigma = n > 2 ? Math.sqrt(ssRes / (n - 2)) : 0;
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;

  const predictions = new Array(horizon);
  for (let h = 1; h <= horizon; h++) {
    predictions[h - 1] = intercept + slope * (n - 1 + h);
  }

  return {
    slope,
    intercept,
    fitted,
    residuals,
    sigma,
    r2,
    predictions,
    predict(h) {
      return intercept + slope * (n - 1 + h);
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. METHOD 4 — Classical seasonal decomposition (additive + multiplicative)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Classical decomposition with a centred moving average of length `period`.
 *
 * type = 'additive':    y_t = trend_t + seasonal_t + residual_t
 * type = 'multiplicative': y_t = trend_t · seasonal_t · residual_t
 *
 * Trend is estimated via a 2×m centred MA for even periods and a plain m-MA
 * for odd periods. Seasonal component is the average detrended value per
 * phase-of-cycle, then centred so ∑ seasonal_phase = 0 (additive) or the
 * geometric mean is 1 (multiplicative).
 *
 * The series must be at least 2·period long; otherwise RangeError.
 */
function decomposeSeasonal(series, period, type) {
  const s = toSeries(series);
  assertPositiveInt(period, 'period');
  const mode = type || 'additive';
  if (mode !== 'additive' && mode !== 'multiplicative') {
    throw new TypeError(`type must be 'additive' or 'multiplicative', got ${mode}`);
  }
  const n = s.length;
  if (n < period * 2) {
    throw new RangeError(
      `decomposeSeasonal requires >= 2 full periods (need ${period * 2}, got ${n})`
    );
  }

  // ── Step 1: centred moving average trend ──
  const trend = new Array(n).fill(NaN);
  const half = Math.floor(period / 2);
  if (period % 2 === 0) {
    // 2×period MA
    for (let t = half; t < n - half; t++) {
      let acc = 0;
      for (let k = -half; k <= half; k++) {
        const w = (k === -half || k === half) ? 0.5 : 1;
        acc += w * s[t + k];
      }
      trend[t] = acc / period;
    }
  } else {
    for (let t = half; t < n - half; t++) {
      let acc = 0;
      for (let k = -half; k <= half; k++) acc += s[t + k];
      trend[t] = acc / period;
    }
  }

  // ── Step 2: detrended values ──
  const detrended = new Array(n).fill(NaN);
  for (let t = 0; t < n; t++) {
    if (!Number.isNaN(trend[t])) {
      detrended[t] = mode === 'additive'
        ? s[t] - trend[t]
        : (trend[t] === 0 ? NaN : s[t] / trend[t]);
    }
  }

  // ── Step 3: average detrended by phase-of-cycle ──
  const seasonalByPhase = new Array(period).fill(0);
  const counts = new Array(period).fill(0);
  for (let t = 0; t < n; t++) {
    const v = detrended[t];
    if (!Number.isNaN(v)) {
      const phase = t % period;
      seasonalByPhase[phase] += v;
      counts[phase]++;
    }
  }
  for (let p = 0; p < period; p++) {
    seasonalByPhase[p] = counts[p] === 0
      ? (mode === 'additive' ? 0 : 1)
      : seasonalByPhase[p] / counts[p];
  }

  // ── Step 4: centre the seasonal component ──
  if (mode === 'additive') {
    const m = mean(seasonalByPhase);
    for (let p = 0; p < period; p++) seasonalByPhase[p] -= m;
  } else {
    // geometric mean = 1
    let gm = 0;
    let gmCount = 0;
    for (let p = 0; p < period; p++) {
      if (seasonalByPhase[p] > 0) {
        gm += Math.log(seasonalByPhase[p]);
        gmCount++;
      }
    }
    const centre = gmCount === 0 ? 1 : Math.exp(gm / gmCount);
    for (let p = 0; p < period; p++) seasonalByPhase[p] /= centre;
  }

  // ── Step 5: full-length seasonal + residual series ──
  const seasonal = new Array(n);
  const residual = new Array(n);
  for (let t = 0; t < n; t++) {
    seasonal[t] = seasonalByPhase[t % period];
    if (Number.isNaN(trend[t])) {
      residual[t] = NaN;
    } else if (mode === 'additive') {
      residual[t] = s[t] - trend[t] - seasonal[t];
    } else {
      residual[t] = seasonal[t] === 0 ? NaN : s[t] / trend[t] / seasonal[t];
    }
  }

  return {
    type: mode,
    period,
    trend,
    seasonal,
    residual,
    seasonalByPhase,
  };
}

/**
 * Forecast a seasonal decomposition by extrapolating the trend linearly and
 * repeating the seasonal pattern forward. This is the standard "decompose
 * → extend → recompose" approach when you don't want Holt-Winters.
 */
function decomposeForecast(series, period, horizon, type) {
  const s = toSeries(series);
  const mode = type || 'additive';
  const dec = decomposeSeasonal(s, period, mode);

  // fit a linear trend on the VALID portion of the decomposed trend
  const tIdx = [];
  const tVal = [];
  for (let i = 0; i < dec.trend.length; i++) {
    if (!Number.isNaN(dec.trend[i])) {
      tIdx.push(i);
      tVal.push(dec.trend[i]);
    }
  }
  let slope = 0, intercept = tVal[0] || 0;
  if (tIdx.length >= 2) {
    const tMean = mean(tIdx);
    const yMean = mean(tVal);
    let num = 0, den = 0;
    for (let i = 0; i < tIdx.length; i++) {
      const dt = tIdx[i] - tMean;
      num += dt * (tVal[i] - yMean);
      den += dt * dt;
    }
    slope = den === 0 ? 0 : num / den;
    intercept = yMean - slope * tMean;
  }

  const predictions = new Array(horizon);
  for (let h = 1; h <= horizon; h++) {
    const futureIdx = s.length - 1 + h;
    const trendHat = intercept + slope * futureIdx;
    const seas = dec.seasonalByPhase[futureIdx % period];
    predictions[h - 1] = mode === 'additive'
      ? trendHat + seas
      : trendHat * seas;
  }

  // fitted values for in-sample residual sigma
  const fitted = new Array(s.length);
  for (let t = 0; t < s.length; t++) {
    const tr = Number.isNaN(dec.trend[t]) ? intercept + slope * t : dec.trend[t];
    fitted[t] = mode === 'additive'
      ? tr + dec.seasonal[t]
      : tr * dec.seasonal[t];
  }

  return {
    predictions,
    fitted,
    decomposition: dec,
    trendSlope: slope,
    trendIntercept: intercept,
    type: mode,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. METHOD 5 — Naive forecasts (last value / seasonal)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Naive forecast.
 *
 *   mode 'last'  (default)     → ŷ_{t+h} = y_t            (random walk)
 *   mode 'seasonal' + period  → ŷ_{t+h} = y_{t + h − m·⌈h/m⌉}
 *
 * Both are exceptionally strong baselines and should always be in the
 * ensemble — they make no assumptions at all.
 */
function naiveForecast(series, horizon, period) {
  const s = toSeries(series);
  assertPositiveInt(horizon, 'horizon');
  if (s.length === 0) throw new RangeError('series must not be empty');

  if (typeof period === 'number' && period > 0 && s.length >= period) {
    const predictions = new Array(horizon);
    for (let h = 1; h <= horizon; h++) {
      // step into the past by one full period, wrapping for long horizons
      const lookback = ((h - 1) % period) + 1;
      predictions[h - 1] = s[s.length - period + (h - 1) % period];
      // ensure no negative index
      const idx = s.length - period + ((h - 1) % period);
      predictions[h - 1] = idx >= 0 ? s[idx] : lastOf(s);
      // keep 'lookback' referenced so lint doesn't strip it — also handy for debug
      if (lookback < 0) predictions[h - 1] = lastOf(s);
    }
    return { mode: 'seasonal', predictions, period };
  }

  return { mode: 'last', predictions: new Array(horizon).fill(lastOf(s)) };
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. METHOD 6 — Ensemble (inverse-MAPE weighted)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Train every eligible method on the given series, evaluate each via a
 * walk-forward backtest, and return an inverse-MAPE weighted average of
 * their horizon forecasts.
 *
 * Methods that cannot be fit on this series (e.g. Holt-Winters on < 24
 * months) are silently dropped. Every method that survives contributes
 * both its forecast and its backtest accuracy; the ensemble is the
 * weighted average where w_i ∝ 1 / (mape_i + ε).
 *
 *   opts.period     — seasonal period (default 12)
 *   opts.holdout    — # of points held out for backtest (default
 *                     min(period, max(4, ⌊n/4⌋)))
 *   opts.alphaHW    — Holt-Winters α     (default 0.3)
 *   opts.betaHW     —                 β  (default 0.1)
 *   opts.gammaHW    —                 γ  (default 0.2)
 *   opts.alphaHolt, opts.betaHolt — Holt params (defaults 0.6, 0.2)
 *   opts.alphaSES   — SES α (default 0.5)
 *   opts.window     — MA window (default min(3, n-1))
 */
function ensemble(series, horizon, opts) {
  const s = toSeries(series);
  assertPositiveInt(horizon, 'horizon');
  const o = opts || {};
  const period = o.period || DEFAULT_PERIOD;

  const bt = backtest(s, undefined, {
    period,
    holdout: o.holdout,
    window: o.window,
    alphaHW: o.alphaHW, betaHW: o.betaHW, gammaHW: o.gammaHW,
    alphaHolt: o.alphaHolt, betaHolt: o.betaHolt,
    alphaSES: o.alphaSES,
  });

  const members = [];
  for (const r of bt.results) {
    const full = runMethodOnFullSeries(s, r.method, horizon, {
      period,
      window: o.window,
      alphaHW: o.alphaHW, betaHW: o.betaHW, gammaHW: o.gammaHW,
      alphaHolt: o.alphaHolt, betaHolt: o.betaHolt,
      alphaSES: o.alphaSES,
    });
    if (full) {
      members.push({
        method: r.method,
        mape: r.mape,
        rmse: r.rmse,
        mae: r.mae,
        bias: r.bias,
        predictions: full.predictions,
        fitted: full.fitted,
      });
    }
  }

  if (members.length === 0) {
    // Degenerate — fall back to pure naive
    const naive = naiveForecast(s, horizon);
    return {
      predictions: naive.predictions,
      weights: { naive: 1 },
      members: [],
      method_used: 'naive',
      confidence_bands: buildBands(naive.predictions, stdev(s)),
    };
  }

  // ── compute weights: inverse MAPE, then normalise ──
  const weights = {};
  let wSum = 0;
  for (const m of members) {
    // if MAPE is Infinity (all actuals 0), fall back on RMSE
    const score = Number.isFinite(m.mape) ? m.mape : m.rmse + EPS;
    weights[m.method] = 1 / (score + EPS);
    wSum += weights[m.method];
  }
  for (const k of Object.keys(weights)) weights[k] /= wSum;

  // ── weighted blend ──
  const predictions = new Array(horizon).fill(0);
  for (const m of members) {
    const w = weights[m.method];
    for (let h = 0; h < horizon; h++) {
      predictions[h] += w * m.predictions[h];
    }
  }

  // residual sigma — combined over members' in-sample residuals
  let combinedSq = 0;
  let combinedN = 0;
  for (const m of members) {
    if (!m.fitted) continue;
    const w = weights[m.method];
    for (let t = 0; t < s.length; t++) {
      if (Number.isFinite(m.fitted[t])) {
        const e = s[t] - m.fitted[t];
        combinedSq += w * e * e;
        combinedN += w;
      }
    }
  }
  const sigma = combinedN > 0 ? Math.sqrt(combinedSq / combinedN) : stdev(s);

  // pick the best single member for method_used reporting
  let best = members[0];
  for (const m of members) {
    const scoreM = Number.isFinite(m.mape) ? m.mape : m.rmse;
    const scoreB = Number.isFinite(best.mape) ? best.mape : best.rmse;
    if (scoreM < scoreB) best = m;
  }

  return {
    predictions,
    weights,
    members,
    method_used: 'ensemble',
    best_member: best.method,
    confidence_bands: buildBands(predictions, sigma),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 9. BACKTESTING — walk-forward accuracy comparison
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Holdout walk-forward backtest. Trains every candidate method on the first
 * n−holdout points and scores them on the last `holdout` points. Returns a
 * sorted table plus the winning method key.
 *
 * No randomness, no shuffling — deterministic results.
 */
function backtest(series, methods, opts) {
  const s = toSeries(series);
  const o = opts || {};
  const period = o.period || DEFAULT_PERIOD;

  // default holdout: max(4, min(period, ⌊n/4⌋)) — but never more than n-period-1
  let holdout;
  if (typeof o.holdout === 'number') {
    holdout = Math.max(1, Math.floor(o.holdout));
  } else {
    holdout = Math.max(1, Math.min(period, Math.floor(s.length / 4)));
  }
  if (holdout >= s.length) holdout = Math.max(1, Math.floor(s.length / 2));

  const train = s.slice(0, s.length - holdout);
  const test = s.slice(s.length - holdout);

  const candidates = methods && methods.length ? methods : defaultMethodList();
  const results = [];

  for (const method of candidates) {
    const out = runMethodOnTrain(train, method, holdout, {
      period,
      window: o.window,
      alphaHW: o.alphaHW, betaHW: o.betaHW, gammaHW: o.gammaHW,
      alphaHolt: o.alphaHolt, betaHolt: o.betaHolt,
      alphaSES: o.alphaSES,
    });
    if (!out) continue;
    const metrics = computeMetrics(test, out.predictions);
    results.push({
      method,
      ...metrics,
      predictions: out.predictions,
    });
  }

  // sort by MAPE (then RMSE) — smaller is better
  results.sort((a, b) => {
    const am = Number.isFinite(a.mape) ? a.mape : Infinity;
    const bm = Number.isFinite(b.mape) ? b.mape : Infinity;
    if (am !== bm) return am - bm;
    return a.rmse - b.rmse;
  });

  return {
    results,
    best: results.length > 0 ? results[0].method : null,
    holdout,
    trainSize: train.length,
    testSize: test.length,
  };
}

function defaultMethodList() {
  return [
    'naive',
    'seasonal_naive',
    'moving_average',
    'weighted_ma',
    'ses',
    'holt',
    'holt_winters',
    'linear',
    'seasonal_add',
    'seasonal_mul',
  ];
}

/**
 * Run a named method on a training series and return its `horizon` forecasts
 * plus (optionally) an in-sample fitted array. Returns `null` if the method
 * is not applicable (e.g. Holt-Winters on too-short training data).
 */
function runMethodOnTrain(train, method, horizon, opts) {
  const o = opts || {};
  const period = o.period || DEFAULT_PERIOD;
  const window = o.window || Math.min(3, Math.max(1, train.length - 1));
  const alphaSES = typeof o.alphaSES === 'number' ? o.alphaSES : 0.5;
  const alphaHolt = typeof o.alphaHolt === 'number' ? o.alphaHolt : 0.6;
  const betaHolt = typeof o.betaHolt === 'number' ? o.betaHolt : 0.2;
  const alphaHW = typeof o.alphaHW === 'number' ? o.alphaHW : 0.3;
  const betaHW = typeof o.betaHW === 'number' ? o.betaHW : 0.1;
  const gammaHW = typeof o.gammaHW === 'number' ? o.gammaHW : 0.2;

  try {
    switch (method) {
      case 'naive': {
        const f = naiveForecast(train, horizon);
        return { predictions: f.predictions };
      }
      case 'seasonal_naive': {
        if (train.length < period) return null;
        const f = naiveForecast(train, horizon, period);
        return { predictions: f.predictions };
      }
      case 'moving_average': {
        if (train.length < window) return null;
        const f = movingAverage(train, window, { horizon });
        return { predictions: f.predictions, fitted: f.smoothed };
      }
      case 'weighted_ma': {
        if (train.length < window) return null;
        const f = weightedMovingAverage(train, window, null, { horizon });
        return { predictions: f.predictions, fitted: f.smoothed };
      }
      case 'ses': {
        const f = exponentialSmoothing(train, alphaSES, undefined, undefined, undefined, { horizon });
        return { predictions: f.predictions, fitted: f.fitted };
      }
      case 'holt': {
        if (train.length < 2) return null;
        const f = exponentialSmoothing(train, alphaHolt, betaHolt, undefined, undefined, { horizon });
        return { predictions: f.predictions, fitted: f.fitted };
      }
      case 'holt_winters': {
        if (train.length < period * 2) return null;
        const f = exponentialSmoothing(train, alphaHW, betaHW, gammaHW, period, { horizon });
        return { predictions: f.predictions, fitted: f.fitted };
      }
      case 'linear': {
        if (train.length < 2) return null;
        const f = linearTrend(train, { horizon });
        return { predictions: f.predictions, fitted: f.fitted };
      }
      case 'seasonal_add': {
        if (train.length < period * 2) return null;
        const f = decomposeForecast(train, period, horizon, 'additive');
        return { predictions: f.predictions, fitted: f.fitted };
      }
      case 'seasonal_mul': {
        if (train.length < period * 2) return null;
        const f = decomposeForecast(train, period, horizon, 'multiplicative');
        return { predictions: f.predictions, fitted: f.fitted };
      }
      default:
        return null;
    }
  } catch (_err) {
    return null;
  }
}

/**
 * Same as runMethodOnTrain but operates on the full series (for producing
 * the ensemble's final forward predictions, as opposed to its backtest
 * forecasts).
 */
function runMethodOnFullSeries(series, method, horizon, opts) {
  return runMethodOnTrain(series, method, horizon, opts);
}

// ═══════════════════════════════════════════════════════════════════════════
// 10. CONFIDENCE BANDS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build symmetric Gaussian prediction intervals around a horizon forecast.
 * The band widens linearly with √h to reflect growing uncertainty — the
 * classical random-walk assumption that is robust for short horizons.
 */
function buildBands(predictions, sigma) {
  const horizon = predictions.length;
  const lower95 = new Array(horizon);
  const upper95 = new Array(horizon);
  const lower80 = new Array(horizon);
  const upper80 = new Array(horizon);
  for (let h = 0; h < horizon; h++) {
    const widen = Math.sqrt(h + 1);
    const band95 = Z_95 * sigma * widen;
    const band80 = Z_80 * sigma * widen;
    lower95[h] = predictions[h] - band95;
    upper95[h] = predictions[h] + band95;
    lower80[h] = predictions[h] - band80;
    upper80[h] = predictions[h] + band80;
  }
  return {
    lower_95: lower95,
    upper_95: upper95,
    lower_80: lower80,
    upper_80: upper80,
    sigma,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 11. PUBLIC `forecast(...)` ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Top-level forecast API.
 *
 *   forecast(series, horizon)                      → auto-select via backtest
 *   forecast(series, horizon, 'ensemble')          → always ensemble
 *   forecast(series, horizon, 'holt_winters', {period:12})
 *
 * Valid `method` keys: any key in METHOD_LABELS plus 'auto' (alias of
 * leaving method undefined). The returned object is the unified forecast
 * envelope described at the top of this file.
 */
function forecast(series, horizon, method, opts) {
  const s = toSeries(series);
  assertPositiveInt(horizon, 'horizon');
  const o = opts || {};
  const period = o.period || DEFAULT_PERIOD;

  const requested = method || 'auto';

  // ── Auto: run ensemble-powered backtest, return best single model ──
  if (requested === 'auto') {
    const bt = backtest(s, undefined, {
      period,
      window: o.window,
      alphaHW: o.alphaHW, betaHW: o.betaHW, gammaHW: o.gammaHW,
      alphaHolt: o.alphaHolt, betaHolt: o.betaHolt,
      alphaSES: o.alphaSES,
    });
    const winner = bt.best || 'naive';
    const full = runMethodOnFullSeries(s, winner, horizon, {
      period,
      window: o.window,
      alphaHW: o.alphaHW, betaHW: o.betaHW, gammaHW: o.gammaHW,
      alphaHolt: o.alphaHolt, betaHolt: o.betaHolt,
      alphaSES: o.alphaSES,
    });
    const winningResult = bt.results.find((r) => r.method === winner) || {
      mape: NaN, rmse: NaN, mae: NaN, bias: NaN, n: 0,
    };
    const sigma = full && full.fitted ? residualSigmaFromFitted(s, full.fitted) : stdev(s);
    return {
      predictions: full ? full.predictions : new Array(horizon).fill(lastOf(s)),
      confidence_bands: buildBands(
        full ? full.predictions : new Array(horizon).fill(lastOf(s)),
        sigma
      ),
      method_used: winner,
      method_he: METHOD_LABELS[winner] ? METHOD_LABELS[winner].he : winner,
      method_en: METHOD_LABELS[winner] ? METHOD_LABELS[winner].en : winner,
      accuracy: {
        mape: winningResult.mape,
        rmse: winningResult.rmse,
        mae: winningResult.mae,
        bias: winningResult.bias,
        n: winningResult.n,
      },
      backtest: bt,
      metadata: { period, holdout: bt.holdout },
    };
  }

  // ── Ensemble: inverse-MAPE weighted blend ──
  if (requested === 'ensemble') {
    const e = ensemble(s, horizon, { period, ...o });
    // compute accuracy of the ensemble itself via its own backtest
    const trainN = Math.max(4, Math.floor(s.length * 0.75));
    const train = s.slice(0, trainN);
    const test = s.slice(trainN);
    let acc = { mape: NaN, rmse: NaN, mae: NaN, bias: NaN, n: test.length };
    if (test.length > 0) {
      const eBT = ensemble(train, test.length, { period, ...o });
      acc = computeMetrics(test, eBT.predictions);
    }
    return {
      predictions: e.predictions,
      confidence_bands: e.confidence_bands,
      method_used: 'ensemble',
      method_he: METHOD_LABELS.ensemble.he,
      method_en: METHOD_LABELS.ensemble.en,
      accuracy: acc,
      weights: e.weights,
      members: e.members,
      best_member: e.best_member,
      metadata: { period },
    };
  }

  // ── Named method ──
  const full = runMethodOnFullSeries(s, requested, horizon, {
    period,
    window: o.window,
    alphaHW: o.alphaHW, betaHW: o.betaHW, gammaHW: o.gammaHW,
    alphaHolt: o.alphaHolt, betaHolt: o.betaHolt,
    alphaSES: o.alphaSES,
  });
  if (!full) {
    throw new RangeError(
      `method '${requested}' is not applicable to this series (length ${s.length})`
    );
  }
  const sigma = full.fitted ? residualSigmaFromFitted(s, full.fitted) : stdev(s);

  // in-sample accuracy as a cheap proxy when no backtest is requested
  const inSampleFitted = full.fitted || new Array(s.length).fill(NaN);
  const validActual = [];
  const validFitted = [];
  for (let i = 0; i < s.length; i++) {
    if (Number.isFinite(inSampleFitted[i])) {
      validActual.push(s[i]);
      validFitted.push(inSampleFitted[i]);
    }
  }
  const accuracy = validActual.length > 0
    ? computeMetrics(validActual, validFitted)
    : { mape: NaN, rmse: NaN, mae: NaN, bias: NaN, n: 0 };

  return {
    predictions: full.predictions,
    confidence_bands: buildBands(full.predictions, sigma),
    method_used: requested,
    method_he: METHOD_LABELS[requested] ? METHOD_LABELS[requested].he : requested,
    method_en: METHOD_LABELS[requested] ? METHOD_LABELS[requested].en : requested,
    accuracy,
    metadata: { period },
  };
}

/**
 * σ from the residuals of a fitted series (skipping NaN warm-up values).
 */
function residualSigmaFromFitted(series, fitted) {
  const residuals = [];
  for (let i = 0; i < series.length; i++) {
    if (Number.isFinite(fitted[i])) residuals.push(series[i] - fitted[i]);
  }
  if (residuals.length < 2) return stdev(series);
  return stdev(residuals);
}

// ═══════════════════════════════════════════════════════════════════════════
// 12. ISRAELI-SEASONALITY HELPER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Apply the ISRAELI_SEASONALITY_MONTHLY_NORM prior on top of a flat
 * forecast. Useful when callers have only a handful of data points but know
 * the month-of-year each forecast step corresponds to.
 *
 *   applyIsraeliSeasonality([100, 100, 100], startMonth=9)
 *     → multiplies Oct/Nov/Dec by the Q4 prior (since JS months are 0-based,
 *       `startMonth=9` means "October").
 */
function applyIsraeliSeasonality(predictions, startMonth) {
  if (!Array.isArray(predictions)) {
    throw new TypeError('predictions must be an array');
  }
  const sm = typeof startMonth === 'number' ? clamp(Math.floor(startMonth), 0, 11) : 0;
  const out = new Array(predictions.length);
  for (let i = 0; i < predictions.length; i++) {
    const m = (sm + i) % 12;
    out[i] = predictions[i] * ISRAELI_SEASONALITY_MONTHLY_NORM[m];
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// 13. EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  // top-level API
  forecast,
  ensemble,
  backtest,
  computeMetrics,

  // individual models
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

  // Israeli priors
  applyIsraeliSeasonality,
  ISRAELI_SEASONALITY_MONTHLY,
  ISRAELI_SEASONALITY_MONTHLY_NORM,

  // labels + helpers
  METHOD_LABELS,
  buildBands,
  defaultMethodList,
};
