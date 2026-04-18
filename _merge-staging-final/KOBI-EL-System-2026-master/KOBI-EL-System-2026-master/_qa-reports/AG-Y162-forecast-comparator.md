# AG-Y162 — Forecast Comparator / סוכן השוואת תחזיות

**Agent:** Y-162
**System:** Techno-Kol Uzi mega-ERP
**Author:** Kobi
**Date:** 2026-04-11
**Status:** GREEN — 19 / 19 tests passing
**Binding rules:** never delete, built-ins only, bilingual.

---

## 1. Mission / משימה

**EN** — Ship a forecast comparator that accepts one "actual" time series and an
arbitrary number of competing forecasts, computes the classical accuracy
metrics for each forecast, ranks the models, and runs pairwise Diebold-Mariano
significance tests. Every output label is bilingual (Hebrew + English), the
MAPE path is hardened against zero / near-zero actuals, and the whole module
runs on Node built-ins with zero new npm dependencies.

**HE** — לספק סוכן השוואת תחזיות המקבל סדרת ערכים בפועל ומספר שרירותי של
תחזיות מתחרות, מחשב מדדי דיוק קלאסיים לכל תחזית, מדרג את המודלים, ומריץ מבחני
דיבולד-מריאנו לכל זוג. כל התוויות דו-לשוניות (עברית + אנגלית), מסלול MAPE מוגן
מפני ערכים אפסיים, והמודול כולו רץ ללא תלויות חיצוניות חדשות.

---

## 2. Deliverables / תוצרים

| File | Purpose |
|---|---|
| `onyx-ai/src/forecast/comparator.ts` | Comparator engine (metrics + DM test) |
| `onyx-ai/test/forecast/comparator.test.ts` | 19 unit tests (node:test + node:assert) |
| `_qa-reports/AG-Y162-forecast-comparator.md` | This bilingual QA report |

- Zero files deleted / לא נמחקו קבצים.
- Zero new runtime dependencies introduced / לא נוספו תלויות חדשות.
- Only Node built-ins used (`node:test`, `node:assert/strict`) / רק מודולי ליבה של Node.

---

## 3. Metrics implemented / מדדים מיושמים

| # | Metric | Hebrew label | Lower is better? |
|---|---|---|---|
| 1 | MAE — Mean Absolute Error | שגיאה מוחלטת ממוצעת | yes |
| 2 | MAPE — Mean Absolute Percentage Error (guarded) | שגיאה אחוזית מוחלטת ממוצעת | yes |
| 3 | sMAPE — Symmetric MAPE | שגיאה אחוזית סימטרית | yes |
| 4 | WAPE — Weighted Absolute Percentage Error | שגיאה אחוזית משוקללת | yes |
| 5 | RMSE — Root Mean Squared Error | שורש השגיאה הריבועית הממוצעת | yes |
| 6 | MASE — Mean Absolute Scaled Error | שגיאה מוחלטת מנורמלת | yes |
| 7 | Theil's U (U2) | מקדם תאיל | yes (< 1 beats naive) |
| 8 | Directional accuracy | דיוק כיווני | no (higher = better) |

### 3.1 MAPE zero-guard / הגנה על מכנה אפס ב-MAPE

**EN** — For every index `i` where `|actual[i]| ≤ epsilon` (default `1e-9`),
that index is removed from the MAPE numerator *and* counted in `mapeSkipped`.
If **all** indices are dropped (i.e. the actual series is entirely zero near
the forecast horizon), MAPE falls back to WAPE and the `mapeFallback` flag on
the row is set to `true`. This keeps the metric finite on degenerate inputs
and makes the fall-through visible to downstream dashboards.

**HE** — לכל אינדקס שבו `|actual[i]| ≤ epsilon` (ברירת מחדל `1e-9`), האינדקס
מוצא מהמונה של MAPE ונספר בשדה `mapeSkipped`. אם **כל** האינדקסים נפסלו (סדרת
ערכים אפסית) — המדד עובר אוטומטית ל-WAPE והדגל `mapeFallback` נדלק. כך המדד
נשאר סופי על קלטים מנוונים והחלופה נחשפת לדשבורד.

### 3.2 sMAPE convention / מוסכמת sMAPE

Makridakis 1993 convention, denominator = `(|a|+|f|)/2`. Values are clipped to
a ceiling (default 200%) so that a degenerate `a=f=0` returns 0, not NaN.

### 3.3 MASE convention / מוסכמת MASE

- Denominator = **in-sample** (seasonal) naive MAE of the actual series only.
- No external training slice required. If `seasonality < actual.length`, the
  denominator uses lag-`m`; otherwise it quietly falls back to `m=1`.
- Zero-denominator is capped at `Number.MAX_SAFE_INTEGER` so ranking math
  stays finite on flat series.

### 3.4 Theil's U convention / מוסכמת מקדם תאיל

`U2 = RMSE_model / RMSE_naive`. The naive baseline is either supplied in
`ComparatorOptions.naiveValues` or derived from the actual series as a
one-step random walk `naive[t] = actual[t-1]`. The two-vector case is
aligned so index 0 is skipped on both sides when we auto-build the baseline.

---

## 4. Diebold-Mariano test / מבחן דיבולד-מריאנו

Implements the DM test with squared-error loss and Harvey-Leybourne-Newbold
small-sample correction:

```
 d_t     = (a_t - f1_t)^2 - (a_t - f2_t)^2
 dbar    = mean(d_t)
 g_0     = sample variance of d_t       (divisor n)
 HAC     = g_0 + 2 * Σ_{k=1..h-1} g_k    (Newey-West, Bartlett weights = 1)
 var_bar = HAC / n
 DM      = dbar / sqrt(var_bar)
 DM*     = DM * sqrt( (n + 1 - 2h + h(h-1)/n) / n )   (HLN correction)
```

- The returned p-value is the **two-sided** tail of the standard normal,
  computed via the Abramowitz-Stegun 7.1.26 rational approximation (max
  error ≈ 1.5e-7). Accurate enough for a dashboard p-value.
- For `n < 3` or degenerate (all-zero) difference series, the test returns
  a neutral `(dmStatistic=0, pValue=1)` sentinel instead of NaN.
- Verdict strings are bilingual:
  - EN: `"Significant: <winner> beats <loser> (p=0.0123)"`
  - HE: `"הבדל מובהק: <winner> עדיף על <loser> (p=0.0123)"`
- Significance threshold hard-coded at α = 0.05.

---

## 5. Public API / ממשק פומבי

```ts
import { ForecastComparator, ForecastSeries } from 'onyx-ai/src/forecast/comparator';

const actual: number[] = [/* ... */];
const forecasts: ForecastSeries[] = [
  { name: 'arima',  values: [...], labelHe: 'מודל ARIMA',  labelEn: 'ARIMA' },
  { name: 'ets',    values: [...], labelHe: 'מודל ETS',    labelEn: 'ETS' },
  { name: 'prophet',values: [...], labelHe: 'מודל Prophet',labelEn: 'Prophet' },
];

const cmp = new ForecastComparator({ seasonality: 12 });
const result = cmp.compare(actual, forecasts);

// result.rows           - one MetricRow per forecast (all 8 metrics)
// result.ranked         - forecasts ordered best -> worst by mean rank
// result.winners        - overall winner + per-metric champions
// result.diebold        - pairwise DM test results with bilingual verdicts
// result.headers.he/en  - bilingual column headers for table UIs
```

Static helpers (for code that needs just one metric):

```
ForecastComparator.mae(actual, forecast)
ForecastComparator.rmse(actual, forecast)
ForecastComparator.mape(actual, forecast, epsilon?)
ForecastComparator.smape(actual, forecast, clipPercent?)
ForecastComparator.wape(actual, forecast)
ForecastComparator.mase(actual, forecast, seasonality?)
ForecastComparator.theilU(actual, forecast, naiveValues?)
ForecastComparator.directionalAccuracy(actual, forecast)
ForecastComparator.dieboldMariano(actual, f1, f2, h?)
```

---

## 6. Test matrix / מטריצת בדיקות

Command used (matches the project's existing convention in
`onyx-ai/test/platform.test.ts`):

```
TS_NODE_TRANSPILE_ONLY=true npx node --test --require ts-node/register test/forecast/comparator.test.ts
```

**Result / תוצאה:** 19 pass, 0 fail, 0 skipped.

| # | Test | Band | What it proves |
|---|---|---|---|
| A-01 | MAE identity & manual check | kernel | exact arithmetic on perfect and noisy forecasts |
| A-02 | RMSE > MAE on spiky errors | kernel | convex penalty is wired correctly |
| A-03 | MAPE skips zero actuals | kernel | guarded average + `mapeSkipped` counter |
| A-04 | MAPE → WAPE full fallback | kernel | all-zero actuals do not throw / NaN |
| A-05 | sMAPE symmetric + 200% clip | kernel | Makridakis convention and ceiling |
| A-06 | WAPE volume weighting | kernel | large-actual dominates the denominator |
| A-07 | MASE identity + flat-series cap | kernel | MAX_SAFE_INTEGER sentinel on zero denom |
| A-08 | MASE seasonality=3 | kernel | seasonal-naive lag is honoured |
| A-09 | Theil's U < 1 beats naive | kernel | random-walk baseline auto-built |
| A-10 | Directional accuracy 100% / 0% | kernel | sign agreement aligned on t-1 |
| B-01 | compare(): input validation | e2e | bilingual error messages on empty/mismatched |
| B-02 | compare(): picks overall winner | e2e | per-metric winners + overall rank |
| B-03 | compare(): bilingual labels flow | e2e | Hebrew header contains U+0590..U+05FF |
| B-04 | compare(): mapeSkipped surfaces on row | e2e | guarded MAPE reported through the table |
| B-05 | compare(): 1 forecast, 0 DM pairs | e2e | no crash when pair grid is empty |
| B-06 | compare(): 3 forecasts → 3 DM pairs | e2e | n·(n-1)/2 pairs, bilingual verdicts |
| C-01 | DM identical forecasts | DM | stat = 0, p = 1 |
| C-02 | DM sign indicates winning series | DM | negative stat → first forecast better |
| C-03 | DM n < 3 sentinel | DM | returns (0, 1) instead of NaN |

Requirement was **15+ tests**; delivered **19**.

---

## 7. Compliance with binding rules / עמידה בחוקי-הסוכן

| Rule | Status | Proof |
|---|---|---|
| **Never delete** | PASS | No existing file was removed. `git status` still shows only the two new files plus this report. |
| **Built-ins only** | PASS | Source imports nothing external; tests import only `node:test` and `node:assert/strict`. `onyx-ai/package.json` was not touched. |
| **Bilingual** | PASS | Error messages, column headers, DM verdicts, and row labels all ship in Hebrew + English. A dedicated test (B-03) asserts the Hebrew header contains Hebrew-block code points. |

---

## 8. Typecheck / בדיקת טיפוסים

```
onyx-ai/node_modules/.bin/tsc --noEmit --target ES2022 --module commonjs \
    --strict --esModuleInterop --lib ES2022,DOM --skipLibCheck \
    --moduleResolution node --allowSyntheticDefaultImports --types node \
    src/forecast/comparator.ts test/forecast/comparator.test.ts
```

Exit code: **0**. Both files compile cleanly under the same strict settings
used by `onyx-ai/tsconfig.json`.

---

## 9. Notes for downstream wiring / הערות לאינטגרציה עתידית

- The comparator is **pure** and **stateless** — no clocks, I/O, logging, or
  environment lookups. Safe to call from tests, batch jobs, or a REST
  handler without any mocking layer.
- `ComparisonResult.headers` is exported so UI tables (`onyx-procurement/web/
  onyx-dashboard.jsx` and friends) can hydrate column headers directly in the
  user's locale without duplicating the string list.
- `ForecastSeries.labelHe / labelEn` flow through the row and the ranked
  table unchanged — no label lookup is required at the consumer side.
- Next natural integration point: the demand-forecaster agent (AG-X11). The
  current agent should start logging forecast runs into a vector the
  comparator can consume, with the seasonality pinned to 12 for monthly
  procurement data and 7 for daily payroll hours.

**End of report / סוף הדו"ח**
