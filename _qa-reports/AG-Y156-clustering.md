# AG-Y156 — Clustering Engine / מנוע אשכולות

**Agent:** Y-156
**System:** Techno-Kol Uzi mega-ERP
**Author:** Kobi
**Date:** 2026-04-11
**Status:** GREEN — 25 / 25 tests passing
**Zero deps introduced. Zero files deleted.**

---

## 1. Mission / משימה

**EN:** Build a zero-dependency, pure-TypeScript clustering toolkit for
the ONYX AI subsystem. Engine must run offline (no HTTP, no disk, no DB)
and must emit bilingual (Hebrew + English) labels on every public
result. Algorithms in scope: K-means with k-means++ seeding, hierarchical
agglomerative clustering (single / complete / average linkage), and
DBSCAN. Must be deterministic — required for audit repeatability.

**HE:** בניית מנוע אשכולות ללא תלויות חיצוניות, בפרוט TypeScript
טהור, עבור תת-מערכת ONYX AI. המנוע חייב לרוץ אופליין (ללא HTTP,
דיסק או מסד נתונים) ולהחזיר תוויות דו-לשוניות (עברית + אנגלית)
על כל תוצאה פומבית. אלגוריתמים: K-Means עם k-means++, אשכול
היררכי (single/complete/average), ו-DBSCAN. דטרמיניסטיות
מחייבת — נדרש לצורכי ביקורת חוזרת.

## 2. Deliverables / תוצרים

| File / קובץ | Purpose / תכלית |
|---|---|
| `onyx-ai/src/ml/clustering.ts` | Engine — K-Means, Hierarchical, DBSCAN, helpers |
| `onyx-ai/test/ml/clustering.test.ts` | 25 unit tests (Node built-in runner) |
| `_qa-reports/AG-Y156-clustering.md` | This report / דוח זה |

## 3. Algorithms Implemented / אלגוריתמים שהוטמעו

| # | Algorithm / אלגוריתם | Function | Notes / הערות |
|---|---|---|---|
| 1 | K-Means (k-means++) | `kMeans`, `kMeansPPInit` | deterministic seed, empty-cluster reseed |
| 2 | Hierarchical — single linkage | `hierarchical(data, k, 'single')` | nearest-neighbour / "שכן קרוב" |
| 3 | Hierarchical — complete linkage | `hierarchical(data, k, 'complete')` | farthest-neighbour / "שכן רחוק" |
| 4 | Hierarchical — average linkage (UPGMA) | `hierarchical(data, k, 'average')` | unweighted pair-group mean |
| 5 | DBSCAN | `dbscan` | Ester et al. 1996, O(n²), noise label = -1 |
| 6 | Elbow method | `elbow` | distance-from-line heuristic for K selection |
| 7 | Silhouette score | `silhouetteScore` | range [-1, 1], ignores DBSCAN noise |

### Distance metrics / מדדי מרחק

- `euclidean` (L2) — default / ברירת מחדל
- `manhattan` (L1)
- `sqEuclidean` — internal optimisation

### Normalisation / נרמול

- `zScoreNormalize` — (x − μ) / σ per column, safe on constant columns
- `minMaxNormalize` — (x − min) / (max − min), safe on constant columns
- `normalize(data, 'zscore' | 'minmax')` — unified dispatcher

### Deterministic PRNG / מחולל פסבדו-אקראי

`mulberry32(seed)` — 32-bit state, pure JS, used to seed k-means++.
Same seed → same centroids → same labels → reproducible audits.

## 4. Public API / ממשק פומבי

```ts
import clustering from './src/ml/clustering';

// --- K-Means ---------------------------------------------------------
const r1 = clustering.kMeans(data, { k: 3, seed: 42 });
// r1.labels, r1.centroids, r1.inertia, r1.silhouette, r1.label.he / .en

// --- Elbow method ----------------------------------------------------
const elbow = clustering.elbow(data, 10, { seed: 42 });
// elbow.recommendedK, elbow.kValues, elbow.inertias

// --- Hierarchical ----------------------------------------------------
const r2 = clustering.hierarchical(data, 3, 'average', 'euclidean');
// r2.labels, r2.merges, r2.silhouette

// --- DBSCAN ----------------------------------------------------------
const r3 = clustering.dbscan(data, { eps: 0.5, minPts: 4 });
// r3.labels (-1 = noise), r3.clusterCount, r3.noiseCount

// --- Helpers ---------------------------------------------------------
const z = clustering.zScoreNormalize(data);
const mm = clustering.minMaxNormalize(data);
const s = clustering.silhouetteScore(data, labels);
```

### Record shape / מבנה תוצאה

Every public result carries:

```ts
{
  labels: number[],
  silhouette: number,
  label: { he: string, en: string } // bilingual header
}
```

## 5. Use-Case Wrappers / עטיפות שימוש

| Wrapper | Backed by | Use case (EN) | מקרה שימוש (HE) |
|---|---|---|---|
| `segmentCustomers(features, k)` | K-Means + optional normalise | Customer segmentation | סגמנטציית לקוחות |
| `clusterSuppliers(features, k)` | Hierarchical (average linkage) | Supplier clustering | אשכול ספקים |
| `groupDefects(features, opts)` | DBSCAN | Defect pattern grouping | קיבוץ תבניות תקלות |

All three return an additional bilingual names array
(`segments[] | groups[] | patterns[]`) for UI display.

## 6. Test Suite / סוויטת בדיקות

**Location:** `onyx-ai/test/ml/clustering.test.ts`
**Runner:** `node --test` with `ts-node/register` (both built-in / already in `devDependencies`)
**Cases:** 25 tests

### Breakdown / פירוט

| # | Test | Covers |
|---|---|---|
| 1 | euclidean basic + zero-case + mismatch throw | L2 distance |
| 2 | manhattan basic + zero-case + negatives | L1 distance |
| 3 | sqEuclidean ≡ euclidean² + getDistance dispatch | helpers |
| 4 | zScoreNormalize → mean 0, stdev 1 per column | z-score |
| 5 | minMaxNormalize → [0, 1], normalize() dispatch, constant-col safety | min-max |
| 6 | mulberry32 deterministic + range [0, 1) | PRNG |
| 7 | kMeansPPInit picks k distinct centroids, repeatable | k-means++ init |
| 8 | kMeansPPInit throws on bad k / too-few points | guards |
| 9 | kMeans separates 3 blobs perfectly, silhouette > 0.8 | core algorithm |
| 10 | kMeans deterministic for the same seed | determinism |
| 11 | kMeans with manhattan + bilingual label content | multi-metric + i18n |
| 12 | elbow method recommends K=3 on 3-blob fixture + monotone inertia | K selection |
| 13 | silhouetteScore — good vs random labelling + degenerate inputs | quality metric |
| 14 | hierarchical single-linkage recovers 3 blobs + merge-history length | single |
| 15 | hierarchical complete-linkage recovers 3 blobs | complete |
| 16 | hierarchical average-linkage + manhattan distance | average |
| 17 | dbscan finds 3 blobs, zero noise | density |
| 18 | dbscan labels far-away points as noise, bilingual label content | noise detection |
| 19 | dbscan with tiny eps marks everything as noise | edge case |
| 20 | segmentCustomers — bilingual segments + low/high separation | wrapper 1 |
| 21 | clusterSuppliers — hierarchical vendor grouping | wrapper 2 |
| 22 | groupDefects — DBSCAN patterns + noise outlier | wrapper 3 |
| 23 | kMeans throws on empty / under-sized / k=0 | guards |
| 24 | hierarchical handles k=n and k=1 | edge cases |
| 25 | 6-dimensional dataset — deterministic 3-cluster recovery | high-dim |

### Run result / תוצאת ריצה

```
ℹ tests 25
ℹ suites 0
ℹ pass 25
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms ~1303
```

Reproduce / שחזור:

```
cd onyx-ai
npx node --test --require ts-node/register test/ml/clustering.test.ts
```

### TypeScript typecheck / בדיקת טיפוסים

`clustering.ts` is clean under the project `tsconfig.json` (strict mode,
ES2022 target). `tsc --noEmit` reports zero diagnostics inside
`src/ml/clustering.ts`. Pre-existing errors in unrelated files
(`integrations.ts`, `onyx-platform.ts`, etc.) are not touched by this
agent — per the "never delete / never break" rule.

## 7. Design Notes / הערות עיצוב

**Determinism is load-bearing.**
Audit trails in a financial ERP require that the same CSV produce the
same segmentation report. K-means uses Mulberry32 seeded from
`opts.seed ?? 42`, so every run that sees the same input and the same
seed produces byte-identical `labels`, `centroids`, and `inertia`.
Test #10 and #25 lock this in.

*הערה בעברית:* הדטרמיניסטיות היא דרישה מחייבת עבור מעקב הביקורת
בפלטפורמה פיננסית. כל ריצה עם אותם נתונים ואותו seed תחזיר
בדיוק אותן תוויות, מרכזים ו-inertia.

**Empty-cluster recovery.**
K-means can produce an empty cluster when a centroid is dominated by
its neighbours. The update step detects this and reseeds the empty
centroid with the data point furthest from its current assigned
centroid, keeping `k` clusters alive throughout the run.

**k-means++ ties.**
When all points collapse onto existing centroids (duplicated rows) the
weighted sampler would hit `total === 0`. The engine duplicates the
last chosen centroid instead of dividing by zero, keeping the
k-means++ invariants.

**Silhouette ignores DBSCAN noise.**
Points labelled `-1` are skipped during both the `a(i)` and `b(i)`
accumulations, so a noisy DBSCAN run still reports a meaningful quality
score for its actual clusters.

**Hierarchical keeps the merge history.**
`merges[]` records every `{ a, b, distance, size }` pair in order. Tests
rely on `merges.length === n − k`, but the list is also the input a
future dendrogram renderer would need.

**DBSCAN is O(n²) on purpose.**
No k-d tree / ball tree — those would blow the zero-dep budget. For
procurement-volume datasets (≤ a few thousand vendors / transactions)
the pairwise scan is fast enough and keeps the code auditable.

**Never mutates input.**
All public functions treat input arrays as `readonly`. The distance
matrix in `hierarchical` and the centroid arrays in `kMeans` are fresh
allocations. Verified indirectly by determinism tests #10 and #25.

## 8. Constraints Observed / אילוצים שקויימו

- **Zero runtime deps / ללא תלויות ריצה** — uses only built-in JS math.
- **Zero dev deps added / ללא תלויות פיתוח חדשות** — `node:test` and
  `node:assert/strict` are both built-in and already wired via
  `ts-node/register` in `devDependencies`.
- **Never delete / לעולם לא מוחקים** — no existing file removed or
  renamed. Only two new files under `src/ml/` and `test/ml/`, plus this
  report.
- **Bilingual / דו-לשוני** — every result carries a `label.he / label.en`
  pair, and wrappers add bilingual `segments / groups / patterns` arrays.
- **Deterministic / דטרמיניסטי** — no `Math.random`, no `Date.now`,
  no `process.env` reads. Same input ⇒ same output.

## 9. Known Limitations / מגבלות ידועות

- **DBSCAN complexity.** O(n²) without spatial indexing. Acceptable for
  procurement datasets up to ~10k rows; beyond that, a k-d tree should
  be added behind the same public API.
- **Hierarchical complexity.** O(n²) memory, O(n³) worst-case CPU for
  the naive Lance–Williams-free implementation. Same size guidance.
- **Elbow heuristic.** "Distance-from-line" works on well-separated
  datasets but can over/under-shoot on noisy real-world data. Consider
  adding gap-statistic if analysts complain.
- **Mixed-type features.** The engine assumes all columns are numeric.
  Categorical features need external one-hot encoding before feeding in.
- **No cluster stability estimate.** Downstream users wanting confidence
  intervals on assignments will need to run multiple seeds and compare.

## 10. Integration Hooks / נקודות חיבור

- **ONYX procurement vendor scoring** — feed supplier KPIs (price, OTIF,
  quality score, lead time) into `clusterSuppliers(features, k)` to
  produce vendor tiers for the RFQ workflow.
- **Customer segmentation for CRM** — feed `[recency, frequency,
  monetary]` tuples into `segmentCustomers(features, k, { normalize:
  'zscore' })` to drive marketing-automation groups.
- **QA defect grouping** — feed `[location_x, location_y, severity,
  category]` vectors into `groupDefects(features, { eps, minPts })` to
  discover defect hot-spots before a field-crew dispatch.

## 11. Sign-off / חתימה

- **All 25 tests green / כל 25 הבדיקות ירוקות.**
- **No mutation of input arrays / ללא שינוי המערכים המקוריים.**
- **Zero dependencies introduced / ללא תלויות חדשות.**
- **Deterministic across runs / דטרמיניסטי בין ריצות.**
- **Bilingual labels on every public result / תוויות דו-לשוניות
  על כל תוצאה פומבית.**
- **Ready for integration with onyx-procurement vendor scoring,
  CRM segmentation and QA defect analysis pipelines.**
