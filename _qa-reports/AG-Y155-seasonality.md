# AG-Y155 — Seasonality Decomposition (STL-lite)

**Agent**: Y-155
**Module**: `onyx-ai/src/seasonality/seasonality.ts`
**Tests**:  `onyx-ai/test/seasonality/seasonality.test.ts`
**Status**: PASS (28/28)
**Date**: 2026-04-11

---

## 1. סיכום מנהלים / Executive Summary

### עברית
בניתי כלי פיצול סדרות־עת (Seasonality Decomposition) לפי המודל הקלאסי האדיטיבי
`Y = מגמה + עונתיות + שארית`, תוך כדי תמיכה מלאה בחגי ישראל (ראש השנה, יום כיפור,
סוכות, חול המועד, פסח, שבועות). הכלי זוהה מחזוריות (שבועית/חודשית/שנתית) באמצעות
אוטו־קורלציה נורמלית, ומפיק דו"ח דו־לשוני RTL-ready. ללא תלויות חיצוניות (TypeScript
טהור, `node:test` בלבד). המודול "לא מוחקים רק משדרגים ומגדלים" — נוסף כמודול חדש
מתחת ל-`src/seasonality/`, ללא כל שינוי בקוד קיים.

### English
Classical additive time-series decomposition `Y = trend + seasonal + residual`
with first-class Hebrew-calendar awareness (Rosh HaShana, Yom Kippur, Sukkot,
Chol HaMoed Sukkot, Pesach, Chol HaMoed Pesach, Shavuot). Period detection via
normalized autocorrelation (weekly/monthly/yearly). Fully bilingual / RTL-ready
report. Zero external dependencies — pure TypeScript, only `node:test` / `node:assert`.
Additive-only: the module lives under a brand-new `src/seasonality/` sub-tree
and touches nothing pre-existing.

---

## 2. קבצים שנוצרו / Deliverables

| # | Path | Purpose | LOC |
|---|------|---------|-----|
| 1 | `onyx-ai/src/seasonality/seasonality.ts`         | Core module (types, math, calendar, decompose) | ~520 |
| 2 | `onyx-ai/test/seasonality/seasonality.test.ts`    | 28 unit + integration tests                     | ~290 |
| 3 | `_qa-reports/AG-Y155-seasonality.md`             | This bilingual QA report                        | —    |

No existing file was modified, deleted or renamed. Complies with
**"לא מוחקים רק משדרגים ומגדלים"**.

---

## 3. API Surface

### Core exports

| Symbol | Kind | Summary |
|---|---|---|
| `TimeSeriesPoint`       | interface | `{ date?, value }` observation |
| `PeriodCandidate`       | interface | `{ lag, label, acf }` candidate period |
| `HebrewHolidayFlags`    | interface | Per-date holiday booleans |
| `DecomposedPoint`       | interface | Per-point result: trend / seasonal / residual / flags |
| `Bilingual`             | interface | `{ he, en }` text pair |
| `SeasonalityReport`     | interface | Aggregated result |
| `DecomposeOptions`      | interface | `{ period?, candidateLags?, minAcf?, hebrewCalendar? }` |
| `decompose()`           | function  | Main entry point — additive STL-lite |
| `detectPeriods()`       | function  | ACF-based lag ranking |
| `chooseBestPeriod()`    | function  | Defaults to weekly when ACF is weak |
| `computeSeasonalPattern()` | function | Period-index means, zero-normalized |
| `movingAverage()`       | function  | Centered MA (handles odd & even windows) |
| `autocorrelation()`     | function  | Pearson ACF at a single lag |
| `mean()`, `variance()`  | function  | Safe aggregators |
| `bundledHebrewCalendar()` | function | Lookup for Hebrew years 5785..5792 |
| `toTimeSeries()`        | function  | Zip dates+values with validation |
| `renderBilingualReport()` | function | Pretty-print HE/EN report |
| `toDate()`, `formatYmd()` | function | Date coercion / UTC ISO format |

### Sample usage

```ts
import { decompose, toTimeSeries } from './seasonality/seasonality';

const pts = toTimeSeries(
  ['2026-03-30','2026-03-31','2026-04-01','2026-04-02','2026-04-03','2026-04-04','2026-04-05'],
  [120, 130, 128, 40, 42, 45, 50],   // big dip on Pesach
);
const rep = decompose(pts);
console.log(rep.messages.map(m => `${m.he}\n${m.en}`).join('\n'));
console.log('Pesach impact:', rep.holidayImpact.pesach);
```

---

## 4. אלגוריתם / Algorithm Overview

1. **Period selection** — if `opts.period` is absent, compute normalized ACF at
   candidate lags `[7, 14, 28, 30, 52, 90, 365]` (overridable). Pick the lag
   whose ACF beats `minAcf=0.15`. Fall back to weekly (7) for weak/noisy data.
2. **Trend** — centered moving average of window = period.
   Odd windows use the standard rolling mean; even windows use Cleveland's
   `2 × (w/2)` half-weighted endpoints trick for exact centering.
3. **Detrended series** — `d[i] = y[i] - trend[i]` (null where trend is null).
4. **Seasonal pattern** — mean of `d[i]` grouped by `i mod period`, then
   zero-normalized so `sum(S) ≈ 0` (additive-model invariant).
5. **Residual** — `r[i] = y[i] - trend[i] - S[i mod period]`.
6. **Strength metrics** — `var(T)/var(Y)`, `var(S)/var(Y)`, `var(R)/var(Y)`
   clipped to `[0, 1]`.
7. **Hebrew flags** — each point's `date` is looked up via
   `bundledHebrewCalendar()` (years 5785..5792) **or** a custom injector
   supplied by the caller. `holidayImpact` is the average observed value on
   each holiday class.
8. **Bilingual messages** — `SeasonalityReport.messages` is always populated
   with `{ he, en }` pairs; Hebrew text tested for the Unicode Hebrew range.

---

## 5. Hebrew Calendar Coverage

| Hebrew Year | Tishrei 1 (Rosh HaShana) | Nissan 15 (Pesach) | Sivan 6 (Shavuot) |
|---|---|---|---|
| 5785 | 2024-10-03 | 2025-04-13 | 2025-06-02 |
| 5786 | 2025-09-23 | 2026-04-02 | 2026-05-22 |
| 5787 | 2026-09-12 | 2027-04-22 | 2027-06-11 |
| 5788 | 2027-10-02 | 2028-04-11 | 2028-05-31 |
| 5789 | 2028-09-21 | 2029-03-31 | 2029-05-20 |
| 5790 | 2029-09-10 | 2030-04-18 | 2030-06-07 |
| 5791 | 2030-09-28 | 2031-04-08 | 2031-05-28 |
| 5792 | 2031-09-18 | 2032-03-27 | 2032-05-16 |

Derived flags:
- Rosh HaShana = Tishrei 1–2
- Yom Kippur = Tishrei 10
- Sukkot = Tishrei 15–21 (day 1 = yom tov, days 2–7 = chol hamoed)
- Pesach = Nissan 15–21 (days 1 and 7 = yom tov, days 2–6 = chol hamoed)
- Shavuot = Sivan 6
- `cholHamoed` and `anyHoliday` are derived aggregates.

For any date outside 5785..5792, inject your own `hebrewCalendar` via
`DecomposeOptions.hebrewCalendar` — this is demonstrated in test #21.

---

## 6. תוצאות טסטים / Test Results

Run command (mirrors sibling suites):

```
TS_NODE_TRANSPILE_ONLY=true npx node --test --require ts-node/register test/seasonality/seasonality.test.ts
```

Result:

```
tests 28
pass 28
fail 0
cancelled 0
skipped 0
todo 0
duration_ms 396.81
```

### Test-by-test coverage

| #  | Name | Area |
|---|---|---|
| 01 | mean and variance of small array                                    | math helper |
| 02 | mean of empty array is 0 (defensive)                                | math helper |
| 03 | autocorrelation of perfect 7-day sine is ~1 at lag 7                | ACF core |
| 04 | autocorrelation guards: lag>=n and zero-variance                    | ACF edge |
| 05 | movingAverage (odd window) centered correctly                       | trend MA |
| 06 | movingAverage (even window, Cleveland 2xk centering)                | trend MA |
| 07 | detectPeriods on weekly signal ranks lag=7 at the top               | period detection |
| 08 | chooseBestPeriod picks 30 for a clean monthly signal                | period detection |
| 09 | chooseBestPeriod falls back to weekly on noise-only data            | period fallback |
| 10 | decompose reconstructs Y = trend + seasonal + residual (identity)   | algebraic identity |
| 11 | decompose: seasonalPattern sums to ~0 (normalization)               | invariants |
| 12 | decompose strength: weekly signal has seasonal >> residual          | quality |
| 13 | decompose on flat series: seasonal and residual collapse to 0       | degenerate |
| 14 | decompose throws on empty input                                     | error path |
| 15 | decompose throws on period < 2                                      | error path |
| 16 | computeSeasonalPattern handles nulls at the edges                   | null-safe |
| 17 | bundled calendar flags Rosh HaShana 5786 (2025-09-23)               | Hebrew cal |
| 18 | bundled calendar flags Pesach 5786 start and chol hamoed day        | Hebrew cal |
| 19 | bundled calendar flags Sukkot 5786                                  | Hebrew cal |
| 20 | bundled calendar returns empty for non-holiday weekday              | Hebrew cal |
| 21 | custom injected calendar overrides the bundled one                  | extensibility |
| 22 | decompose surfaces holidayImpact averages correctly                 | integration |
| 23 | report messages contain both Hebrew and English                     | bilingual |
| 24 | renderBilingualReport emits HE and EN lines                         | bilingual |
| 25 | toTimeSeries zips arrays, refuses mismatched lengths                | util |
| 26 | toDate accepts Date, ISO string, and rejects garbage                | util |
| 27 | formatYmd is UTC-stable and zero-padded                             | util |
| 28 | integration: weekly decomposition exposes 7-long pattern            | smoke |

28 tests ≥ 15 required. All green.

---

## 7. תאימות / Compliance Checklist

- **"לא מוחקים רק משדרגים ומגדלים"**: ✅ — additive new module, zero deletions.
- **Zero dependencies**: ✅ — only `node:test`, `node:assert`, and project TS.
- **Bilingual**: ✅ — `SeasonalityReport.messages` always carries `{he, en}`; Hebrew Unicode tested in #23.
- **RTL-ready**: ✅ — report output uses prefixed `HE:` / `EN:` line labels; consumer decides direction.
- **Strict TypeScript**: ✅ — `tsc --noEmit --strict` clean on `src/seasonality/seasonality.ts`.
- **Hebrew calendar**: ✅ — bundled 5785..5792 + injector for other years.
- **Period detection**: ✅ — 7/30/365 probed via ACF with safe fallback.
- **Test count**: ✅ — 28 tests (required ≥ 15).

---

## 8. Integration Hooks (growth path)

The residual series `rep.points.map(p => p.residual)` is the canonical feed for
`AG-100 anomaly-detector`. `rep.seasonalPattern` can be reused by the
`AG-X11 demand-forecaster` to seed a Holt-Winters-style additive forecast
without re-estimating seasonality.

Future upgrades (non-breaking, additive only):
- Multiplicative model (`Y = T * S * R`) as a second API — no change to
  `decompose()` signature.
- Multi-seasonal decomposition (weekly + yearly in one call).
- Robust trend via Loess — drop-in alternative to `movingAverage()`.

---

## 9. Reproduction

```bash
cd onyx-ai
TS_NODE_TRANSPILE_ONLY=true npx node --test --require ts-node/register test/seasonality/seasonality.test.ts
```

Expected tail:

```
ℹ tests 28
ℹ pass 28
ℹ fail 0
```

**Signed-off**: Agent Y-155 · 2026-04-11
