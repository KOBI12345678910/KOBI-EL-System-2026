# AG-Y154 — Trend Detection Engine (OLS + Mann-Kendall + Theil-Sen + CUSUM)

**Agent:** Y-154
**System:** Techno-Kol Uzi mega-ERP (ONYX AI subsystem)
**Author:** Kobi
**Date:** 2026-04-11
**Status:** GREEN — 21 / 21 tests passing
**Motto observed:** לא מוחקים רק משדרגים ומגדלים (We never delete, only upgrade and grow)

---

## 1. Mission / משימה

**EN.** Build a zero-dependency, pure-TypeScript trend detection engine for
financial, procurement and KPI time-series on the ONYX AI platform. Must run
offline, use only Node built-ins, never mutate input, and ship bilingual
(Hebrew + English) RTL-safe summary strings for the dashboard.

**HE.** ‏בניית מנוע זיהוי מגמות בטייפסקריפט טהור, ללא תלות חיצונית, עבור סדרות
עתיות של רכש, כספים ו-KPI בפלטפורמת ONYX AI. המנוע ירוץ במצב לא-מקוון,
ישתמש אך ורק ב-built-ins של Node, לא ישנה את הקלט, ויחזיר סיכומים דו-לשוניים
(עברית + אנגלית) עם סימני RTL עבור לוחות הבקרה.‏

---

## 2. Deliverables / תוצרים

| File | Purpose |
|---|---|
| `onyx-ai/src/trends/trend-detector.ts` | Engine — 6 algorithms + class façade |
| `onyx-ai/test/trends/trend-detector.test.ts` | 21 unit tests, `node:test` runner |
| `_qa-reports/AG-Y154-trend-detector.md` | This report |

- **Zero runtime dependencies introduced.** Only `node:test` / `node:assert/strict`
  are used by the tests (both built-in).
- **Zero files deleted.** No existing code removed or renamed.
- **Strict TypeScript clean.** `tsc --noEmit --project tsconfig.json` produces
  zero diagnostics for `src/trends/trend-detector.ts`. Pre-existing errors in
  `src/onyx-integrations.ts` and `src/onyx-platform.ts` are unrelated and are
  already documented in `test/event-store.test.ts`.

---

## 3. Algorithms implemented / אלגוריתמים

| # | Method | Public API | Complexity |
|---|---|---|---|
| 1 | Ordinary Least Squares linear regression | `linearRegression()`, `rSquared()` | O(n) time, O(1) memory |
| 2 | Mann-Kendall non-parametric trend test | `mannKendallTest()` | O(n²) time, O(u) memory (u = unique values) |
| 3 | Theil-Sen robust slope estimator | `theilSenSlope()` | O(n²) time + memory |
| 4 | CUSUM change-point detection (binary segmentation) | `detectChangePoints()` | O(n log n) amortised |
| 5 | Four-bucket classification | `classify()` | O(n) time |
| 6 | Bilingual (HE + EN) RTL-safe summary | `summary()`, `TrendDetector.analyze()` | O(1) string ops |

### 3.1 Linear regression details

- Computes slope (β₁), intercept (β₀), R², residual SS, standard error
  of the slope, t-statistic, and a two-sided p-value via the Student's t
  distribution (Numerical Recipes continued-fraction beta → I_x(a,b)).
- **Perfect-fit guard.** When residual SS = 0 and slope ≠ 0, the
  t-statistic is mathematically infinite. We short-circuit to
  `tStatistic = Infinity`, `pValue = 0` so downstream classifiers do not
  mis-interpret a perfect ramp as "no signal".
- Accepts `n < 2`, `n === 1`, constant-y, constant-t — all produce
  neutral, non-throwing results.

### 3.2 Mann-Kendall details

- Classical S statistic with tie correction:
  `Var(S) = [n(n-1)(2n+5) - Σ t_k(t_k-1)(2t_k+5)] / 18`.
- ±1 continuity correction on the Z statistic.
- Two-sided p-value via a from-scratch normal CDF (Abramowitz & Stegun
  26.2.17, ε < 7.5×10⁻⁸).
- Direction label ("increasing" / "decreasing" / "no-trend") decided at
  α = 0.05.
- Kendall's τ = S / (n(n−1)/2) returned alongside.

### 3.3 Theil-Sen details

- Median of all pairwise slopes (t_j > t_i).
- Siegel-style intercept = median(y_i − slope · t_i).
- **Robustness verified.** With a single 9999× outlier appended to a
  y = x ramp (n = 21), Theil-Sen returns ≈ 1.0 while OLS is dragged to
  ≈ 23.8. See test 11.
- 95 % confidence interval via the Kendall variance formula:
  `C_α = z₀.₉₇₅ · √Var(S)`, `M₁ = ⌊(N − C_α)/2⌋`, `M₂ = ⌈(N + C_α)/2⌉`.

### 3.4 CUSUM change-point detection

- Page-Hinkley cumulative walk S_i = Σ (y_k − μ) over a segment.
- Change-point is the **arg-extremum of the walk**, not the first
  threshold crossing — this places the detection at the true break.
- Threshold = `(2.5 − 1.7·sensitivity) · σ · √n` (sensitivity ∈ [0,1];
  default 0.5 → threshold ≈ 1.65σ√n).
- **Binary segmentation** recursion via an explicit stack finds multiple
  change-points without overlap. Edges (lo, hi) are skipped to avoid
  degenerate detections.
- **Semantic direction** ('up'/'down') is computed from
  `mean(post) vs mean(pre)`, not from the sign of the walk extremum —
  this gives the intuitive answer for step-ups even when the first half
  is below the overall mean.

### 3.5 Classification decision table

| Precedence | Condition | Label |
|---|---|---|
| 1 | n < 3 | `stable` |
| 2 | regression p-value < 0.05 AND slope > 0 | `uptrend` |
| 3 | regression p-value < 0.05 AND slope < 0 | `downtrend` |
| 4 | coefficient of variation > 0.5 (no significant slope) | `volatile` |
| 5 | else | `stable` |

**Why significance is checked first.** A clean y = 2x + 3 ramp has a huge
raw CV (σ/μ ≈ 0.5) yet is obviously a trend. Checking the p-value first
prevents such ramps from being mis-labelled `volatile`.

### 3.6 Bilingual summary

- Hebrew strings are wrapped with U+200F RIGHT-TO-LEFT MARK around every
  embedded numeral so mixed RTL content renders correctly in Hebrew
  dashboards.
- English and Hebrew strings carry the same numerical content.
- Both strings are returned inside `TrendDetector.analyze()` as
  `summaryHe` and `summaryEn`.
- A `rtlNumber()` helper is exported for UI code that needs to embed
  ad-hoc numbers into Hebrew labels.

---

## 4. Public API surface / ממשק חשוף

```ts
import {
  TrendDetector,
  trendDetector,        // singleton instance
  linearRegression,
  mannKendallTest,
  theilSenSlope,
  detectChangePoints,
  classify,
  rSquared,
  summary,
  rtlNumber,
  // Numeric helpers (also exported):
  mean, median, variance, stdev,
  normalCdf, normalTwoSidedPValue, tTwoSidedPValue,
  // Types:
  TrendPoint, TrendAnalysis, TrendClassification, TrendDirection,
  LinearRegressionResult, MannKendallResult, TheilSenResult, ChangePoint,
} from '@/trends/trend-detector';

const td = new TrendDetector();
const analysis = td.analyze(series);
// => { regression, mannKendall, theilSen, changePoints,
//      classification, mean, stdev, coefficientOfVariation,
//      summaryHe, summaryEn, n }
```

### Record shapes

```ts
interface TrendPoint { t: number; y: number; }

interface LinearRegressionResult {
  slope: number;            // β₁
  intercept: number;        // β₀
  rSquared: number;         // ∈ [0, 1]
  n: number;
  slopeStdError: number;
  tStatistic: number;
  pValue: number;           // two-sided, Student's t
  residualSumOfSquares: number;
}

interface MannKendallResult {
  s: number;
  variance: number;
  z: number;                // continuity-corrected
  pValue: number;           // two-sided Normal
  tau: number;              // Kendall's τ
  direction: 'increasing' | 'decreasing' | 'no-trend';
  n: number;
}

interface TheilSenResult {
  slope: number;            // median pairwise slope
  intercept: number;        // median y − slope·t
  numPairs: number;
  ciLower: number;          // 95 % CI lower
  ciUpper: number;          // 95 % CI upper
}

interface ChangePoint {
  index: number;
  t: number;
  direction: 'up' | 'down';
  magnitude: number;
}
```

---

## 5. Test suite / מערך בדיקות

**Location:** `onyx-ai/test/trends/trend-detector.test.ts`
**Runner:** `node --test` (built-in) via `ts-node` transpile-only.

### Reproduce

```bash
cd onyx-ai
TS_NODE_TRANSPILE_ONLY=true npx node --test \
  --require ts-node/register test/trends/trend-detector.test.ts
```

### Test inventory (21 cases)

| # | Name | Asserts |
|---|---|---|
| 01 | mean / variance / stdev / median basic sanity | 10 |
| 02 | normalCdf and normal two-sided p-value | 4 |
| 03 | Student t two-sided p-value collapses to Normal for large df | 4 |
| 04 | linear regression on a perfect line is exact | 5 |
| 05 | linear regression slope on a perfect downward line | 3 |
| 06 | linear regression edge cases: empty, 1pt, constant y | 8 |
| 07 | rSquared helper and r² in [0,1] for noisy series | 2 |
| 08 | Mann-Kendall detects monotonic uptrend | 4 |
| 09 | Mann-Kendall detects monotonic downtrend and handles ties | 6 |
| 10 | Mann-Kendall returns neutral for n < 3 | 3 |
| 11 | Theil-Sen slope is robust to a single outlier | 4 |
| 12 | Theil-Sen matches OLS on clean linear data | 1 |
| 13 | CUSUM detects a step shift and location is near the break | 3 |
| 14 | CUSUM returns [] for flat noise and for tiny inputs | 4 |
| 15 | classify: uptrend / downtrend / stable / volatile | 4 |
| 16 | TrendDetector.analyze produces a full bilingual bundle | 6 |
| 17 | TrendDetector.analyze is pure: does not mutate input | 1 |
| 18 | analyze is deterministic across runs | 6 |
| 19 | summary() renders both languages correctly | 3 |
| 20 | rtlNumber helper wraps with U+200F | 3 |
| 21 | __internal.roundTo / clamp / fmt / incompleteBeta | 7 |

### Run result

```
ℹ tests 21
ℹ pass  21
ℹ fail  0
ℹ duration_ms ~326
```

---

## 6. Design notes / הערות תכנון

- **Deterministic.** No `Math.random()`, no `Date.now()`, no locale reads.
  Test fixtures use a deterministic LCG when pseudo-noise is needed.
- **No mutation.** `median()` uses `[...xs].sort(...)`; every algorithm
  reads `points` as `readonly TrendPoint[]`. Verified by test 17.
- **Numerically stable.** `variance()` uses Welford's online formula.
  `ssRes` is clamped to ≥ 0 to absorb floating-point drift.
- **RTL-safe.** U+200F RIGHT-TO-LEFT MARK is inserted around every number
  embedded in a Hebrew sentence — this is the recommended approach by
  the Unicode Bidi algorithm for inline mixed-direction content.
- **Strict mode compliant.** The file compiles cleanly under
  `strict: true` with all the sub-flags that `onyx-ai/tsconfig.json` enables.

---

## 7. Constraints observed / אילוצים

| Rule | Observance |
|---|---|
| "לא מוחקים רק משדרגים ומגדלים" | No files removed or renamed |
| Node built-ins only | Zero runtime deps; only `node:test` + `node:assert/strict` for tests |
| Bilingual RTL | Every summary returns `{ he, en }`; Hebrew wrapped with U+200F |
| Deterministic | Verified via test 18 (analyze twice → deepEqual) |
| Pure (no mutation) | Verified via test 17 |
| Strict TypeScript | `tsc --noEmit --project tsconfig.json` clean for this file |

---

## 8. Known limitations / מגבלות ידועות

- `theilSenSlope()` is O(n²) in time and memory. Acceptable for the
  typical ONYX time-series sizes (< 5 000 points). For larger inputs,
  a future upgrade could use a randomised median-of-medians selection.
- `detectChangePoints()` uses binary segmentation, which is greedy —
  it may miss change-points whose signal is masked by an adjacent,
  stronger change-point in the same segment. A future V2 could add
  dynamic-programming (PELT) segmentation.
- Mann-Kendall tie-correction handles exact ties only; near-ties below
  machine epsilon are treated as distinct values. Good enough for NIS
  amounts rounded to the agora.
- The CV-based `volatile` rule uses a fixed 0.5 threshold. A future
  upgrade could derive the threshold from a rolling historical baseline.

---

## 9. Future work / עבודות המשך

1. **V2 upgrade path (never delete the V1).** Add a `V2` variant to the
   same file when the time comes, and switch callers progressively. The
   existing test suite pins V1 behaviour and must continue to pass.
2. **Dashboard wiring.** Expose a thin HTTP route in `src/index.ts` that
   accepts a series and returns a `TrendAnalysis` object. Reuse the
   bilingual summary for the alert center.
3. **Integration.** Feed `TrendAnalysis.changePoints[]` into the alert
   system (`src/modules/intelligent-alert-system.ts`) so that sudden
   step-shifts in vendor pricing automatically raise a review task.
4. **Seasonality.** Add STL-style seasonal decomposition (additive) so
   that weekly or monthly patterns in procurement cycles are correctly
   separated from the residual trend.

---

## 10. Sign-off / אישור

- All 21 tests green. `pass 21, fail 0`.
- Zero new runtime dependencies. Zero files deleted.
- Zero strict-TypeScript diagnostics attributable to this module.
- RTL-safe bilingual summaries verified in tests 16 and 19.
- Deterministic and non-mutating behaviour verified in tests 17 and 18.
- Ready to integrate with `onyx-ai/src/modules/intelligent-alert-system.ts`
  and `onyx-procurement/src/analytics` pipelines.

‏— חתום: סוכן Y-154, 2026-04-11 —‏
