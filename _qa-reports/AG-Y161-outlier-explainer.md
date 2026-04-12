# AG-Y161 — Outlier Explainer (Bilingual Plain-Language WHY Engine)

**Agent:** Y-161
**System:** Techno-Kol Uzi mega-ERP / ONYX-AI subsystem
**Author:** Kobi
**Date:** 2026-04-11
**Status:** GREEN — 22 / 22 tests passing, strict TypeScript typecheck clean

---

## 1. Mission / משימה

**EN.** Extend the ONYX statistical layer beyond outlier *detection* into
outlier *explanation*: given a single dataset row and a reference
distribution, produce a verdict **plus** a bilingual, plain-language
narrative that tells a non-technical reviewer (accountant, project
manager) *why* a value was flagged, how many similar cases exist in the
past 12 months, and which categorical dimensions are the biggest
contributors to the anomaly.

**HE.** להרחיב את שכבת הסטטיסטיקה של ONYX מעבר לאיתור חריגות — להסבר
חריגות: עבור רשומה בודדת והתפלגות ייחוס, להחזיר גם פסק-דין וגם הסבר
דו-לשוני, בשפה פשוטה, שמסביר לרואה-חשבון או למנהל פרויקט *למה* הערך חריג,
כמה מקרים דומים היו ב-12 החודשים האחרונים, ואיזה ממדים קטגוריאליים תורמים
הכי הרבה לחריגות.

## 2. Deliverables / תוצרים

| # | File | Purpose |
|---|---|---|
| 1 | `onyx-ai/src/stats/outlier-explainer.ts` | Engine — `OutlierExplainer` class + math helpers |
| 2 | `onyx-ai/test/stats/outlier-explainer.test.ts` | 22 unit tests (Node built-in runner) |
| 3 | `_qa-reports/AG-Y161-outlier-explainer.md` | This bilingual report |

**Rules honored:**

- Never deletes any existing file / module (verified via git status — three new files only).
- Built-ins only. Zero new dependencies. Uses `node:test`, `node:assert/strict`.
- Bilingual (he + en) output in every narrative, even insufficient-sample
  and within-range paths.
- Pure TypeScript module, strict mode, runs under the existing
  `tsconfig.json` (target ES2022, strict: true).

## 3. Mathematical methods / שיטות

| # | Method | Function | Role |
|---|---|---|---|
| 1 | Welford one-pass mean / sample stdev | `computeStats` | Global distribution stats |
| 2 | Median + MAD (robust scale) | `median`, `mad` | Heavy-tail-safe fallback |
| 3 | Iglewicz-Hoaglin modified z-score | `modifiedZScore` | 0.6745·(x-median)/MAD |
| 4 | Tukey IQR fences (k=1.5 default) | `computeQuartiles` | Non-parametric outlier fences |
| 5 | Percentile rank (below + 0.5·equal) | `percentileRank` | Rank within reference set |
| 6 | Dimensional re-computation | inside `explain()` | Per-vendor, per-category, per-department, per-project buckets |
| 7 | 12-month similar-cases counter | `countSimilarCasesLast12Months` | Value-tolerance + time-window filter |

**Decision pipeline inside `explain()`:**

```
1. globalStats = Welford(reference.value)
2. if n < minSample -> reasonCode = insufficient_sample  (bilingual, done)
3. z      = (x - mean) / stdev
4. mz     = 0.6745 * (x - median) / MAD
5. fences = Tukey(Q1, Q3, k)
6. isOutlier = |z| >= zThreshold OR |mz| >= madThreshold OR x outside fences
7. contributions[] = for each dim: repeat steps 1-4 inside the bucket
8. similar = count(ref where |x-r.v|/max <= tol AND ts in 12m window)
9. narrative = bilingual template filled from the above
```

## 4. Public API / ממשק

```ts
import {
  OutlierExplainer,
  defaultOutlierExplainer,
  // math helpers (exported for reuse and unit tests)
  computeStats,
  computeQuartiles,
  modifiedZScore,
  percentileRank,
  groupBy,
  countSimilarCasesLast12Months,
  affectedCategories,
} from 'onyx-ai/src/stats/outlier-explainer';

const explainer = new OutlierExplainer({
  zThreshold: 2.5,
  madThreshold: 3.5,
  iqrK: 1.5,
  minSample: 5,
  similarWindowDays: 365,
  similarTolerance: 0.10,
  dimensions: ['vendorId', 'category', 'department', 'projectId'],
});

const result = explainer.explain(row, referenceRows);
// result.isOutlier, result.stdDeviationsFromMean,
// result.contributions[], result.affectedCategories,
// result.similarCasesLast12Months,
// result.narrative.he  /  result.narrative.en
```

### Return shape (`OutlierExplanation`)

| Field | Type | Description |
|---|---|---|
| `isOutlier` | boolean | Verdict |
| `value` | number | The value under test |
| `method` | `'zscore' \| 'mad' \| 'iqr' \| 'none'` | Which test tripped first |
| `stdDeviationsFromMean` | number | Classical z-score (signed) |
| `modifiedZScore` | number | MAD-based z-score (signed) |
| `percentile` | number | 0..100 |
| `direction` | `'high' \| 'low' \| 'equal'` | Side of the mean |
| `globalStats` | BasicStats | n, mean, stdev, min, max, sum |
| `quartiles` | Quartiles | Q1, Q2, Q3, IQR, fences |
| `contributions` | DimensionContribution[] | Per-dim breakdown, worst-first |
| `similarCasesLast12Months` | number | Count in value+time window |
| `affectedCategories` | string[] | "dim=bucket" list of flagged subsets |
| `narrative` | `{ he: string; en: string }` | Plain-language explanation |
| `reasonCode` | enum | UI filter key |

## 5. Sample narrative output / דוגמת פלט

**Input row (target):** value = 50,000 NIS, vendor A, category=materials,
project P-1, timestamp 1 day ago. Reference = the engineered 12-month
dataset built in the test fixtures (≈41 rows across three vendors).

**English:**
> Value 50,000.00 is 120.45 standard deviations above the mean
> (637.60). Percentile 100.0. Similar cases in past 12 months: 0.
> Affected categories: [vendorId=A, category=materials,
> department=construction, projectId=P-1]. Top contributing dimension:
> vendorId=A (z=+170.21, n=20).

**Hebrew:**
> הערך חריג כי 50,000.00 גבוה ב-120.45 סטיות תקן מהממוצע (637.60).
> אחוזון 100.0. מקרים דומים ב-12 החודשים האחרונים: 0. קטגוריות
> מושפעות: [vendorId=A, category=materials, department=construction,
> projectId=P-1]. הגורם העיקרי: vendorId=A (z=+170.21, n=20).

The narrative pattern for a *non-outlier* switches to a short "within
expected range" message in both languages; insufficient-sample returns a
"cannot determine" message in both languages.

## 6. Test matrix / מטריצת בדיקות

22 tests — `node --test --require ts-node/register test/stats/outlier-explainer.test.ts`:

| # | Test | Kind | Focus |
|---|---|---|---|
| 1 | `computeStats — known dataset` | math | mean, stdev, min, max, sum |
| 2 | `computeStats — empty array is safe` | math | zero-sample guard |
| 3 | `computeQuartiles — Tukey fences` | math | Q1<Q3, fences, IQR |
| 4 | `modifiedZScore — 0.6745 scaling + zero MAD` | math | Iglewicz-Hoaglin correctness, div-by-zero guard |
| 5 | `percentileRank — midpoint ~50` | math | (below + 0.5·equal)/n definition |
| 6 | `groupBy — skips missing keys` | helper | dimensional partitioning |
| 7 | `countSimilarCasesLast12Months — window+tolerance` | helper | time window, value tolerance |
| 8 | `affectedCategories — flagged only` | helper | contributor filter |
| 9 | `explain — high outlier flagged, bilingual` | e2e | narrative contains "חריג" and "standard deviations" |
| 10 | `explain — in-range not flagged, bilingual` | e2e | positive path still produces he+en |
| 11 | `explain — insufficient_sample inconclusive` | e2e | ≤4 rows → bilingual "cannot determine" |
| 12 | `explain — low-direction outlier` | e2e | negative z, direction=low |
| 13 | `explain — contributions broken down by dim` | e2e | all 4 dims present, sorted by |z| |
| 14 | `explain — affectedCategories >= 1` | e2e | dim=bucket format |
| 15 | `explain — similarCases reflects reference window` | e2e | ≥10 near-1000 matches |
| 16 | `explain — required keywords in he+en` | e2e | "סטיות תקן", "percentile", NIS formatting |
| 17 | `explain — custom options override defaults` | e2e | permissive vs strict thresholds |
| 18 | `explainValue — scalar+series wrapper` | e2e | convenience overload |
| 19 | `narrate — returns stored narrative` | api | `narrate(exp) === exp.narrative` |
| 20 | `explain — flat distribution stdev=0` | edge | no crash, not flagged |
| 21 | `defaultOutlierExplainer — singleton usable` | api | default export works |
| 22 | `explain — deterministic same input twice` | property | byte-identical narrative on replay |

**Live run output:**

```
ℹ tests 22
ℹ suites 0
ℹ pass 22
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms ~1245
```

## 7. Integration points / נקודות אינטגרציה

- **AG-100 anomaly detector (`onyx-procurement/src/ml/anomaly-detector.js`).**
  Each anomaly record already carries `{value, vendorId, category,
  timestamp}`. Feed the record as `row` and the same transaction list as
  `reference`; surface `explanation.narrative.he` / `.en` next to the
  existing flag on the procurement dashboard.
- **BI dashboard (`AG-99`).** The `narrative` field is ready to render
  directly as a tooltip or card body; `affectedCategories` feeds a
  filter chip row.
- **Intelligent Alert System
  (`onyx-ai/src/modules/intelligent-alert-system.ts`).** Use
  `reasonCode` as the alert-type discriminator; use both narratives as
  the email / WhatsApp body depending on the recipient's locale.
- **i18n (`AG-81`).** No extra translation keys required — narratives
  are generated in both languages by the same function call.

## 8. Design decisions & trade-offs / החלטות ופשרות

1. **Robust + classical side-by-side.** We compute both z-score and
   MAD-based modified z-score and report both. Financial distributions
   are often heavy-tailed and a single stdev-based rule is fragile; the
   MAD fallback catches cases the classical rule misses (e.g. a heavily
   skewed supplier price list with a few extreme values inflating the
   stdev).
2. **IQR as a third opinion.** Even if `|z|` and `|mz|` are below
   threshold, a value outside Tukey fences is still flagged. This is a
   classical non-parametric check and adds robustness without extra
   math.
3. **Insufficient-sample gate.** Below `minSample = 5` the explainer
   refuses to give a verdict and says so in both languages rather than
   returning a statistically meaningless flag. This matters in the
   procurement context where new vendors have very few historical
   rows.
4. **Deterministic clock.** `opts.now` is injectable so the 12-month
   window is reproducible in tests. Production callers omit it and get
   `new Date()` at call time.
5. **Narrative as stored state.** The bilingual narrative is generated
   once, inside `explain()`, and stored on the explanation. `narrate()`
   is a pure accessor. That lets callers cache explanations by row id
   without re-running the template.
6. **Dimensional ordering.** Contributions are returned sorted by
   `|zScore|` descending so the UI can show "top contributor first"
   without extra work on the caller's side.
7. **NIS formatting.** We format currency values with two decimals and
   a comma group separator *without* using `Intl.NumberFormat`. This
   keeps the module pure-ASCII dependency-wise and avoids Intl-locale
   drift on trimmed Node runtimes.

## 9. Verification / אימות

| Check | Result |
|---|---|
| `node --test` on the 22-test suite | 22 / 22 pass |
| Strict TypeScript typecheck | Clean (no errors) |
| Zero new npm dependencies | Confirmed |
| No files deleted | Confirmed (three new files only) |
| Bilingual coverage on every code path (outlier / in-range / insufficient) | Tests 9, 10, 11 |
| Narrative determinism | Test 22 |
| Numeric correctness vs. hand-computed values | Tests 1, 3, 4, 5 |

## 10. Known limitations / מגבלות ידועות

- The default 12-month window is fixed to calendar days, not trading
  days. For modules that care about business days the caller should
  narrow `similarWindowDays` accordingly.
- `similarCasesLast12Months` uses a simple relative tolerance; two
  rows with identical value but different dimensions count together.
  If a caller needs "same vendor only" similarity, they should
  pre-filter `reference` before calling.
- The narrative is template-driven (not LLM-written). That is a
  deliberate choice — the output must be deterministic and auditable
  for regulatory review. If a richer narrative is needed later, the
  `narrate()` hook can be replaced without touching `explain()`.

## 11. Runbook / הרצה

```bash
# from repo root
cd onyx-ai
# build check
npx tsc --noEmit
# test run
npx node --test --require ts-node/register test/stats/outlier-explainer.test.ts
```

## 12. Sign-off / חתימה

- Code: `onyx-ai/src/stats/outlier-explainer.ts` (~500 LOC, one class, no deps)
- Tests: `onyx-ai/test/stats/outlier-explainer.test.ts` (22 / 22 pass)
- Report: `_qa-reports/AG-Y161-outlier-explainer.md` (this file)

**Status: READY TO WIRE / מוכן להטמעה.**
