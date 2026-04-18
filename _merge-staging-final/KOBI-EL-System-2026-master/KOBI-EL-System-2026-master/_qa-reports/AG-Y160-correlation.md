# AG-Y160 — Correlation Matrix Tool / כלי מטריצת מתאם

**Agent**: Y-160
**System**: Techno-Kol Uzi mega-ERP / ONYX AI
**Date / תאריך**: 2026-04-11
**Module / מודול**: `onyx-ai/src/stats/correlation.ts`
**Tests / בדיקות**: `onyx-ai/test/stats/correlation.test.ts`
**Dependencies / תלויות**: **ZERO** (Node built-ins only) — **אפס** (רק ספריות מובנות של Node)

---

## EN — Executive Summary

Agent Y-160 delivers a self-contained correlation matrix tool for ONYX AI. The
module implements Pearson, Spearman, and Kendall tau-b coefficients together
with a permutation-test p-value engine, a significance ranker, and a bilingual
SVG heatmap renderer. It has no runtime dependencies outside the Node standard
library — every helper (PRNG, ranker, shuffle, XML escape, color mapping) lives
inside the module. Test coverage is 27 cases executed under `node --test`; all
pass.

## HE — תקציר מנהלים

סוכן Y-160 מספק כלי מטריצת מתאם עצמאי לפלטפורמת ONYX AI. המודול ממש שלושה
מקדמים — פירסון, ספירמן, וקנדל טאו-ב — יחד עם מנוע ערכי p במבחן החלפה
(permutation test), מדרג מתאמים מובהקים, ומחולל SVG דו-לשוני של מפת חום.
אין תלות חיצונית כלשהי: כל הכלים (מחולל אקראי, דירוג, ערבוב, ברחת XML,
ומיפוי צבע) כתובים בתוך המודול. כיסוי הבדיקות: 27 בדיקות שרצו תחת
`node --test`; כולן עברו.

---

## 1. Scope & Deliverables / היקף ותוצרים

| # | File / קובץ | Lines / שורות | Status / סטטוס |
|---|---|---|---|
| 1 | `onyx-ai/src/stats/correlation.ts` | 547 | Created / נוצר |
| 2 | `onyx-ai/test/stats/correlation.test.ts` | 405 | Created / נוצר |
| 3 | `_qa-reports/AG-Y160-correlation.md` | this file | Created / נוצר |

**No existing files were modified or deleted.**
**לא נמחק ולא שונה אף קובץ קיים.**

---

## 2. Public API / ממשק ציבורי

### 2.1 Types / טיפוסים

| Name / שם | Purpose / תפקיד |
|---|---|
| `CorrelationMethod` | `'pearson' \| 'spearman' \| 'kendall'` |
| `BilingualLabel` | `{ he: string; en: string }` |
| `Series` | `{ label: BilingualLabel; values: readonly number[] }` |
| `CorrelationCell` | Single (row, col) entry with `r`, `pValue`, `n` |
| `CorrelationMatrix` | Full result: `r[][]`, `p[][]`, `cells[]`, `labels[]`, `method` |
| `CorrelationOptions` | `{ method, permutations, seed, skipPValue }` |
| `HeatmapOptions` | `{ cellSize, margin, language, showValues, title }` |
| `SignificantCorrelation` | Cell + `magnitude` + `direction` |

### 2.2 Functions / פונקציות

| Function / פונקציה | Returns / מחזיר | Notes / הערות |
|---|---|---|
| `pearson(x, y)` | `number` | Linear r. NaN on zero variance. |
| `spearman(x, y)` | `number` | Rank-based rho. Ties via averaged ranks. |
| `kendall(x, y)` | `number` | Tau-b with tie correction. O(n^2). |
| `correlation(x, y, method)` | `number` | Dispatcher by method name. |
| `correlationMatrix(series, opts)` | `CorrelationMatrix` | Full symmetric matrix + p-values. |
| `permutationPValue(x, y, method, perms, seed)` | `number` | Two-sided, Phipson-Smyth corrected. |
| `rankSignificantCorrelations(matrix, alpha, minAbsR)` | `SignificantCorrelation[]` | Sorted by magnitude. |
| `renderHeatmapSvg(matrix, opts)` | `string` | Self-contained SVG. |
| `fractionalRanks(v)` | `number[]` | Average-rank method (R default). |
| `pairwiseClean(x, y)` | `{ x, y }` | Drops NaN / Infinity pairs. |
| `heatmapColor(r)` | `string` | Diverging blue/white/red scale. |
| `escapeXml(text)` | `string` | XML-safe string for SVG output. |
| `createRng(seed)` | `() => number` | Deterministic xorshift32 PRNG. |
| `shuffleInPlace(arr, rng)` | `T[]` | Fisher-Yates with injected RNG. |

---

## 3. Method Details / פירוט השיטות

### 3.1 Pearson / פירסון

Linear correlation. Cleans pairs first (drops NaN/Infinity), then computes
the standard covariance-over-standard-deviations formula with a numerical
clamp to `[-1, 1]` to guard against floating-point overshoot.

מחשב את מקדם המתאם הלינארי הרגיל לאחר ניקוי זוגות לא תקפים, עם הצמדה
לטווח `[-1, 1]` כדי למנוע חריגות נומריות.

### 3.2 Spearman / ספירמן

Spearman is implemented as Pearson on fractional (averaged) ranks, which
gives the textbook rho even in the presence of ties. For strictly monotone
(e.g., exponential) transformations, Spearman yields 1.0 while Pearson does
not — verified in the test suite.

מממש על ידי הרצת פירסון על דירוג ממוצע. כך מתקבל rho הנכון גם בנוכחות
תיקו, וכך השיטה מזהה קשרים מונוטוניים לא-לינאריים (למשל אקספוננציאלי).

### 3.3 Kendall tau-b / קנדל טאו-ב

Counts concordant, discordant, and tied pairs in O(n²), then applies the
tau-b tie correction:

```
tau_b = (C - D) / sqrt((C + D + Tx) * (C + D + Ty))
```

where `C`, `D` are concordant/discordant pair counts, and `Tx`, `Ty` are
pair counts tied on x-only or y-only respectively. Returns NaN when any
denominator term collapses to zero.

סופר זוגות קונקורדנטיים, דיסקורדנטיים, ותיקו ב-O(n²), ומחשב את טאו-ב
בתוספת תיקון תיקו כמו בנוסחה לעיל.

### 3.4 Permutation p-value / ערך p במבחן החלפה

- Default: 1000 permutations.
- Deterministic via xorshift32 seeded PRNG (`createRng`).
- Distinct per-pair seed inside the matrix computation so that the noise
  pattern for cell `(i, j)` is uncorrelated with cell `(i+1, j+1)`.
- Phipson–Smyth correction: `p = (hits + 1) / (perms + 1)`, guaranteeing
  `p > 0` even when no permutation exceeds the observed statistic.
- Two-sided: compares `|r_perm|` to `|r_obs|`.

- ברירת מחדל: 1000 ערבובים.
- דטרמיניסטי לפי זרע קבוע.
- זרע שונה לכל זוג (i,j) למניעת קורלציה בין תאים.
- תיקון פיפסון-סמית' למניעת p=0.
- דו-צדדי: השוואת |r| המוחלט.

### 3.5 Significance ranker / מדרג מובהקות

`rankSignificantCorrelations(matrix, alpha, minAbsR)`:

1. Iterate upper-triangle cells.
2. Drop NaN or `|r| < minAbsR`.
3. Drop cells whose `pValue > alpha` (NaN p-values are treated as
   "always significant" for the `skipPValue` fast path).
4. Sort descending by `|r|`, then ascending by p, then by (row, col) for
   deterministic output.
5. Tag `direction` as `'positive' | 'negative' | 'none'`.

### 3.6 Heatmap SVG / מפת חום SVG

- Self-contained string output — no external CSS, no embedded fonts, no
  JavaScript.
- Diverging color scale: `-1 → blue rgb(30,64,175)`, `0 → near-white
  rgb(248,250,252)`, `+1 → red rgb(185,28,28)`.
- Accessibility: `role="img"` + `aria-label` populated from the title, and
  `dir="auto"` so Hebrew text renders right-to-left without special CSS.
- Three language modes: `'he'`, `'en'`, `'both'` (default — writes
  `"Hebrew / English"`).
- Subtitle shows the active method in the chosen language(s).

פלט SVG עצמאי עם צבעים מתפצלים, תמיכה מלאה ב-RTL, ושלושה מצבי שפה:
עברית, אנגלית, או שניהם.

---

## 4. Test Inventory / רשימת הבדיקות

**Result: 27 / 27 pass** — `node --test --require ts-node/register`

```
duration_ms 1319.8
pass        27
fail         0
```

| # | Test / בדיקה | Coverage / כיסוי |
|---|---|---|
| 1 | `pearson: perfect positive linear correlation returns 1` | r=+1 happy path |
| 2 | `pearson: perfect negative linear correlation returns -1` | r=-1 happy path |
| 3 | `pearson: uncorrelated data yields magnitude below 0.5` | Low signal |
| 4 | `pearson: matches textbook value on reference sample` | Numerical accuracy |
| 5 | `pearson: returns NaN when one vector has zero variance` | NaN guard |
| 6 | `fractionalRanks: assigns averaged ranks to tied observations` | Ranker |
| 7 | `spearman: monotone transformation yields rho = 1` | Non-linear monotone |
| 8 | `spearman: reverse monotone yields rho = -1` | Negative monotone |
| 9 | `kendall: fully concordant pairs yield tau = 1` | Tau=+1 |
| 10 | `kendall: reference sample matches hand-computed tau-b` | 4/6 check |
| 11 | `kendall: zero variance on one side returns NaN` | NaN guard |
| 12 | `pairwiseClean: removes pairs containing NaN or infinity` | Data hygiene |
| 13 | `permutationPValue: strong correlation yields p < 0.05` | Significance |
| 14 | `permutationPValue: same seed yields same p-value` | Determinism |
| 15 | `correlationMatrix: diagonal is 1 and matrix is symmetric` | Matrix invariants |
| 16 | `correlationMatrix: throws when series lengths differ` | Input validation |
| 17 | `correlationMatrix: skipPValue leaves off-diagonal p as NaN` | Fast path |
| 18 | `rankSignificantCorrelations: orders by magnitude and respects alpha` | Ranker core |
| 19 | `rankSignificantCorrelations: tags direction positive vs negative` | Direction tag |
| 20 | `heatmapColor: maps -1, 0, +1 to expected color shades` | Color mapping |
| 21 | `renderHeatmapSvg: bilingual mode embeds he+en labels and method` | Bilingual SVG |
| 22 | `renderHeatmapSvg: he-only mode omits English labels` | he mode |
| 23 | `renderHeatmapSvg: en-only mode omits Hebrew labels` | en mode |
| 24 | `escapeXml: escapes XML-significant characters` | Injection guard |
| 25 | `createRng + shuffleInPlace: deterministic given seed` | PRNG determinism |
| 26 | `correlation: dispatcher routes to pearson/spearman/kendall` | Dispatcher |
| 27 | `end-to-end: procurement scenario produces ranked correlations and SVG` | E2E |

> 27 > 15 — exceeds the 15-test minimum by 12.
> 27 > 15 — עובר את המינימום הנדרש ב-12 בדיקות נוספות.

---

## 5. Example Usage / דוגמת שימוש

```ts
import {
  correlationMatrix,
  rankSignificantCorrelations,
  renderHeatmapSvg,
} from './stats/correlation';

const series = [
  { label: { he: 'עלות חומרים',  en: 'Materials Cost' }, values: [10,12,11,14,16,15,18,19,21,22,24,25] },
  { label: { he: 'שעות עבודה',   en: 'Labor Hours'    }, values: [100,110,108,125,140,135,160,168,180,190,205,215] },
  { label: { he: 'אחוז תקלות',   en: 'Defect Rate'    }, values: [5.0,4.8,5.1,4.5,4.2,4.4,3.8,3.6,3.2,3.0,2.8,2.5] },
  { label: { he: 'שביעות רצון',  en: 'Satisfaction'   }, values: [7.0,7.1,7.0,7.3,7.5,7.4,7.8,8.0,8.2,8.4,8.6,8.8] },
];

const matrix = correlationMatrix(series, {
  method: 'spearman',
  permutations: 1000,
  seed: 2026,
});

const top = rankSignificantCorrelations(matrix, 0.05, 0.7);
// top[0] => strongest significant pair, e.g. Materials ↔ Labor Hours

const svg = renderHeatmapSvg(matrix, {
  language: 'both',
  title: { he: 'מתאמי רכש', en: 'Procurement Correlations' },
});
// svg is a self-contained string you can write to disk or embed in HTML.
```

---

## 6. Non-functional Properties / תכונות לא פונקציונליות

| Property / תכונה | Status / מצב |
|---|---|
| Zero runtime dependencies / אפס תלויות ריצה | Yes / כן |
| Strict TypeScript clean / TypeScript מחמיר נקי | Yes / כן |
| Deterministic given a seed / דטרמיניסטי לפי זרע | Yes / כן |
| Handles NaN / Infinity inputs / מטפל ב-NaN ואינסוף | Yes (drops pairs) |
| Handles ties (Spearman, Kendall) / טיפול בתיקו | Yes — average ranks & tau-b |
| Bilingual UI (he + en) / ממשק דו-לשוני | Yes |
| RTL support in SVG / תמיכת RTL ב-SVG | Yes (`dir="auto"`) |
| XML injection safe / בטוח מהזרקת XML | Yes (`escapeXml`) |
| No existing files modified / ללא שינוי בקבצים קיימים | Yes |
| No existing files deleted / ללא מחיקת קבצים | Yes |

---

## 7. Complexity / סיבוכיות

| Routine / שגרה | Complexity / סיבוכיות |
|---|---|
| `pearson` | O(n) |
| `spearman` | O(n log n) (sort for ranking) |
| `kendall` | O(n²) pairwise scan |
| `correlationMatrix` (k series, n samples, P perms) | O(k² · P · C(method)) |
| `permutationPValue` | O(P · C(method)) |
| `rankSignificantCorrelations` | O(k² log k²) |
| `renderHeatmapSvg` | O(k²) |

---

## 8. Compliance / התאמה

| Rule / כלל | Result / תוצאה |
|---|---|
| **Never delete / אין למחוק** | PASS — no files removed |
| **Built-ins only / רק ספריות מובנות** | PASS — only `node:test` + `node:assert/strict` |
| **Bilingual / דו-לשוני** | PASS — every exported type carries Hebrew + English names; SVG renders both; report is bilingual |
| **15+ tests / לפחות 15 בדיקות** | PASS — 27 tests |
| **Methods: pearson / spearman / kendall / p-value / ranking / heatmap** | PASS — all six present |

---

## 9. Files Touched / קבצים שנגעו בהם

```
+ C:/Users/kobi/OneDrive/kobi/המערכת 2026  KOBI EL/onyx-ai/src/stats/correlation.ts
+ C:/Users/kobi/OneDrive/kobi/המערכת 2026  KOBI EL/onyx-ai/test/stats/correlation.test.ts
+ C:/Users/kobi/OneDrive/kobi/המערכת 2026  KOBI EL/_qa-reports/AG-Y160-correlation.md
```

No existing files were modified or deleted.
לא נמחק ולא שונה אף קובץ קיים.

---

## 10. Sign-off / אישור סיום

- **Agent / סוכן**: Y-160
- **System / מערכת**: Techno-Kol Uzi mega-ERP
- **Module / מודול**: `onyx-ai/src/stats/correlation`
- **Tests passing / בדיקות עוברות**: 27 / 27
- **External deps added / תלויות חיצוניות שנוספו**: 0
- **Status / סטטוס**: READY / מוכן

**End of report / סוף דו"ח**
