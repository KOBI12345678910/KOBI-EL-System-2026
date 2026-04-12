# AG-X11 — Demand Forecaster (Multi-Model Ensemble)
**Agent:** X-11 | **Swarm:** 3 | **Project:** Techno-Kol Uzi mega-ERP
**Date:** 2026-04-11
**Status:** PASS — 65/65 tests green (162.95 ms)

---

## 1. Scope

A zero-dependency time-series forecasting library for demand, revenue and
volume planning inside the procurement and operations modules. Every method
is implemented in pure JavaScript math — no `tfjs`, no `ml-regression`, no
`arima`, no HTTP calls, no file I/O — and runs synchronously on Node 16+,
Electron, or inside a browser bundle.

Delivered files
- `onyx-procurement/src/forecasting/demand-forecaster.js` — the library (~870 LOC)
- `onyx-procurement/test/payroll/demand-forecaster.test.js` — 65 tests across 12 suites
- `_qa-reports/AG-X11-demand-forecaster.md` — this report

RULES respected
- Zero dependencies (only `node:test` + `node:assert/strict` in the test file)
- Hebrew bilingual labels via `METHOD_LABELS` (`{he, en}` per method key)
- Never deletes — every function is pure and non-mutating
- Real code, no stubs, fully exercised by the test suite
- Deterministic: no randomness, no `Date.now()` inside the math

---

## 2. Six forecasting methods (the task)

| # | Method key                          | Algorithm                                              | Hebrew label                  |
|---|--------------------------------------|--------------------------------------------------------|-------------------------------|
| 1 | `moving_average` / `weighted_ma`    | Simple MA + linearly-weighted MA                       | ממוצע נע / ממוצע נע משוקלל     |
| 2 | `ses` / `holt` / `holt_winters`     | SES, double (Holt), triple (Holt-Winters additive)    | החלקה אקספוננציאלית / Holt / Holt-Winters |
| 3 | `linear`                             | OLS regression on t → y                                | רגרסיה לינארית                 |
| 4 | `seasonal_add` / `seasonal_mul`     | Classical decomposition, additive + multiplicative     | פירוק עונתי חיבורי / כפלי      |
| 5 | `naive` / `seasonal_naive`          | Last-value random walk + seasonal replay               | תחזית נאיבית / עונתית          |
| 6 | `ensemble`                           | Inverse-MAPE weighted blend of the nine methods above  | אנסמבל משוקלל                  |

All ten method keys plus the `ensemble` key carry Hebrew + English labels
in `METHOD_LABELS` (covered by test 9.08).

---

## 3. Accuracy metrics

`computeMetrics(actual, forecast)` returns:

| Metric | Formula                                      | Notes                                    |
|--------|----------------------------------------------|------------------------------------------|
| MAPE   | mean(|err/actual|) over non-zero actuals     | Scale-free. Infinity if all actuals ~0.  |
| RMSE   | sqrt(mean(err²))                             | Penalises big misses                     |
| MAE    | mean(|err|)                                  | Robust average                           |
| Bias   | mean(forecast − actual)                      | Signed; negative = under-forecasting     |
| n      | sample size                                  | For reporting                            |

Covered by tests 1.01 → 1.07 (including zero-actual edge cases and length
mismatches).

---

## 4. Public API

```js
const {
  // top-level
  forecast,                  // (series, horizon, method?, opts?) → envelope
  ensemble,                  // (series, horizon, opts?)          → blended forecast
  backtest,                  // (series, methods?, opts?)         → accuracy table
  computeMetrics,            // (actual, forecast)                → {mape, rmse, mae, bias, n}

  // individual models
  movingAverage,             // (series, window, opts?)
  weightedMovingAverage,     // (series, window, weights?, opts?)
  exponentialSmoothing,      // (series, α, β?, γ?, period?, opts?)   → SES / Holt / HW
  simpleExponentialSmoothing,// (series, α)                           → {level, final}
  holtSmoothing,             // (series, α, β)                        → {level, trend, ...}
  holtWintersAdditive,       // (series, α, β, γ, period)             → {level, trend, seasonal, ...}
  linearTrend,               // (series, opts?)                       → {slope, intercept, predictions, r2, predict(h)}
  decomposeSeasonal,         // (series, period, type?)               → {trend, seasonal, residual, type}
  decomposeForecast,         // (series, period, horizon, type?)      → {predictions, fitted, decomposition}
  naiveForecast,             // (series, horizon, period?)            → {mode, predictions}

  // Israeli priors
  applyIsraeliSeasonality,   // (predictions, startMonth)             → tilted predictions
  ISRAELI_SEASONALITY_MONTHLY,      // 12-index raw prior (frozen)
  ISRAELI_SEASONALITY_MONTHLY_NORM, // 12-index mean-normalised prior (frozen)

  // labels / helpers
  METHOD_LABELS,             // {he, en} per method key (frozen)
  buildBands,                // (predictions, sigma) → {lower_95, upper_95, lower_80, upper_80, sigma}
  defaultMethodList,         // () → ['naive', 'seasonal_naive', ..., 'seasonal_mul']
} = require('./src/forecasting/demand-forecaster.js');
```

### Unified forecast envelope

Every `forecast(...)` call — including the ensemble — returns:

```js
{
  predictions:       Number[],         // horizon values
  confidence_bands: {
    lower_95:        Number[],
    upper_95:        Number[],
    lower_80:        Number[],
    upper_80:        Number[],
    sigma:           Number,           // residual σ used
  },
  method_used:       String,           // e.g. 'holt', 'seasonal_add', 'ensemble'
  method_he:         String,           // Hebrew label
  method_en:         String,           // English label
  accuracy:         {mape, rmse, mae, bias, n},
  metadata:         {period, ...},
  // ensemble-specific extras:
  weights?:          {method: weight},
  members?:          [{method, mape, predictions, fitted, ...}],
  best_member?:      String,
  // auto-mode extra:
  backtest?:         {results, best, holdout, trainSize, testSize},
}
```

---

## 5. Israeli business seasonality prior

`ISRAELI_SEASONALITY_MONTHLY_NORM` is a frozen 12-element multiplicative
pattern (mean normalised to 1.0) encoding the rhythm of the Israeli
B2B/industrial calendar:

| Month | Multiplier | Reason                                            |
|-------|------------|---------------------------------------------------|
| Jan   | ~1.00      | Normal (VAT-return month)                         |
| Feb   | ~1.02      | Mild pre-Purim uptick                             |
| **Mar** | **< 1**  | **Passover shutdown (school + many firms)**       |
| Apr   | ~1.05      | Post-Pesach catch-up                              |
| May   | ~1.03      | Normal                                            |
| Jun   | ~1.02      | Normal                                            |
| Jul   | ~1.00      | Start of summer                                   |
| **Aug** | **< 1**  | **Summer slowdown (vacation season)**             |
| **Sep** | **< 1**  | **Tishri holidays (Rosh Hashana / Yom Kippur / Sukkot)** |
| **Oct** | **> 1**  | Post-Tishri rebound + Q4 push begins              |
| **Nov** | **> 1**  | Q4 peak                                           |
| **Dec** | **> 1**  | Fiscal year-end invoicing push                    |

Tests 11.01 → 11.06 verify the length, normalisation, Q4 uplift, spring /
late-summer dips, and the helper `applyIsraeliSeasonality(predictions, startMonth)`.
The task's daily "invoice EOM push" is intentionally NOT baked into the monthly
prior — monthly aggregation averages it out — but the monthly prior has a
small January lift so the VAT-return cash cycle is still visible downstream.

The priors are applied **only as a fallback** when a series is shorter than
two full seasonal cycles. Once the history is long enough, the classical
decomposition and Holt-Winters paths learn their own seasonal indices and
overwrite the prior — verified in scenario 12.01.

---

## 6. Ensemble weighting

1. Split the training window `n − holdout` from the tail `holdout` points
   (walk-forward, no randomness).
2. For each method in `defaultMethodList()`, if it is applicable to the
   training window (HW needs ≥ 2·period, decomposition needs ≥ 2·period,
   linear/Holt need ≥ 2 points, etc.), fit on train, predict `holdout`
   steps, and score against the held-out tail.
3. Keep the applicable methods, fit them on the **full** series for the
   forward forecast.
4. Compute weights: `w_i ∝ 1 / (mape_i + ε)`, renormalised to sum 1.
   If MAPE is Infinity (all actuals zero), fall back on RMSE.
5. Weighted average the horizon forecasts.
6. Build prediction bands using a combined residual σ across members.

This matches the task's "Ensemble averaging with weight by accuracy"
requirement. Test 8.01 confirms weights are positive and sum to 1;
test 8.02 confirms the ensemble output stays inside the envelope of its
members.

---

## 7. Confidence bands

`buildBands(predictions, sigma)` produces symmetric Gaussian prediction
intervals that widen as √h:

- `band_95[h] = ±1.96 · σ · √(h+1)`
- `band_80[h] = ±1.2816 · σ · √(h+1)`

The residual σ is computed from each model's in-sample residuals (skipping
NaN warm-up values) or — for the ensemble — a members-weighted residual
variance. Test 10.01 verifies bands widen over horizon, 10.02 handles zero
σ, 10.03 verifies 80% ⊂ 95%.

---

## 8. Input validation + error handling

All public functions:
- reject non-array series (`TypeError` with a descriptive message),
- reject `NaN`, `Infinity`, and non-number entries,
- reject zero / negative horizons,
- reject `window > series.length`,
- reject α/β/γ outside [0, 1],
- gracefully return `null` inside `runMethodOnTrain` when a method is not
  applicable (e.g. HW on 10 points with period=12) so `backtest` and
  `ensemble` can silently skip it without crashing.

Tests 2.06, 2.07, 3.05, 4.06, 4.07, 5.05, 6.04, 7.03, 9.04, 9.05, 9.06, 9.07.

---

## 9. Test matrix

`test/payroll/demand-forecaster.test.js` — 12 suites, 65 tests.

| # | Suite                          | Tests | Coverage                                         |
|---|--------------------------------|-------|--------------------------------------------------|
| 1 | DF.1 computeMetrics            |  7    | MAPE / RMSE / MAE / bias, zero actuals, mismatch |
| 2 | DF.2 Moving averages           |  7    | simple + weighted, flatness, custom weights      |
| 3 | DF.3 Linear regression         |  5    | exact slope/intercept recovery, R², validation   |
| 4 | DF.4 Exponential smoothing     |  8    | SES / Holt / HW, fallback, invalid params        |
| 5 | DF.5 Seasonal decomposition    |  6    | additive + multiplicative, centring, odd/even m  |
| 6 | DF.6 Naive forecasts           |  4    | last-value, seasonal replay, horizon wrap        |
| 7 | DF.7 Backtest                  |  4    | applicability, MAPE ordering, seasonal winner    |
| 8 | DF.8 Ensemble                  |  3    | weights sum=1, envelope, confidence bands        |
| 9 | DF.9 forecast() dispatcher     |  8    | auto / named / ensemble / Hebrew labels          |
| 10| DF.10 Confidence bands         |  3    | √h widening, zero σ, 80% ⊂ 95%                  |
| 11| DF.11 Israeli seasonality      |  6    | length, normalisation, Q4, Passover/Tishri/Aug   |
| 12| DF.12 Realistic Israeli demand |  4    | Q4 spike end-to-end, auto-seasonal, short series |

**Results**

```
ℹ tests 65
ℹ suites 12
ℹ pass 65
ℹ fail 0
ℹ duration_ms 162.9529
```

---

## 10. Representative scenario — Q4 spike on 3 years of monthly revenue

Test 12.01 feeds 36 synthetic monthly points with an upward trend plus the
Israeli seasonal prior, then asks the ensemble for the next 12 months.

```
predictions[0..11] ≈ [Jan, Feb, Mar, ..., Dec]
predictions[11] (Dec)   > predictions[7] (Aug)   — Q4 peak > summer trough  ✔
predictions[8]  (Sep)   < predictions[11] (Dec)  — Tishri dip               ✔
```

The ensemble correctly lifts Dec, drops Sep, and the Holt-Winters / seasonal
decomposition members dominate the weighting because they score best on the
holdout. The auto dispatcher (test 12.02) independently picks one of the
four seasonal methods on a purely seasonal series.

---

## 11. Known-truth sanity checks

The following tests verify numerically-exact recovery (within 1e-9) so we
know the math is correct, not just consistent:

- **3.01** `y = 2t + 5` ⇒ OLS returns `slope = 2.000000000`, `intercept = 5.000000000`
- **3.02** same series, horizon 5 ⇒ predictions match `2·(n-1+h) + 5` exactly
- **3.03** pure line ⇒ `R² = 1.000000000`
- **4.03** Holt with α = β = 0.9 on `y = 2t + 5` ⇒ horizon forecasts match analytic
- **5.01** additive decomp on repeated [-10, 0, 10] ⇒ recovers exactly [-10, 0, 10]
- **5.02** multiplicative decomp ⇒ geometric mean = 1.000000000
- **6.01/6.02** naive and seasonal-naive match literal last-period values
- **11.02** `ISRAELI_SEASONALITY_MONTHLY_NORM` ⇒ mean = 1.000000000

---

## 12. Integration surface

The library is a plain CommonJS module (`require`) with no hidden state, no
globals, no env-var reads. It is safe to call from:

- `onyx-procurement/src/reports/cash-flow-forecast.js`  (existing cash-flow module can replace its homegrown smoother)
- `techno-kol-ops/*` real-time dashboards  (ensemble + confidence_bands feed directly into a chart)
- `onyx-procurement/src/ml/anomaly-detector.js`  (residuals from this module can feed a z-score anomaly step)
- any `enterprise_palantir_core` pipeline  (pure function, no side effects)

Every export is a pure function; the result of identical inputs is
bit-identical across calls.

---

## 13. Sign-off

- Zero dependencies — only `node:test`/`node:assert` in tests, nothing in src.
- Hebrew bilingual — verified by test 9.08 (every method key has `{he, en}`).
- Never deletes — pure functions, inputs copied via `toSeries`, no mutation.
- Real code — 65 tests green in 162.95 ms, including numerically-exact truth checks.

**Status: PASS**
