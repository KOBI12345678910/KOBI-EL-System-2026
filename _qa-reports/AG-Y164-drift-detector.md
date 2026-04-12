# AG-Y164 — Model Drift Detector (PSI / KS / Chi-square)

**Agent:** Y-164
**System:** Techno-Kol Uzi mega-ERP
**Module:** ONYX AI → `src/ml/drift-detector.ts`
**Author:** Kobi
**Date:** 2026-04-11
**Status:** GREEN — 21 / 21 tests passing
**Language:** TypeScript (strict), Node built-ins only

---

## 1. Mission / משימה

**EN —** Build a zero-dependency, pure-TypeScript model-drift detector for the
production ML models inside ONYX AI. The detector must compare a baseline
(reference / training) distribution against a current (live) distribution
and return three orthogonal statistical signals: **PSI**, **KS**, and
**chi-square**, wrapped by a bilingual (Hebrew + English) `DriftReport`,
feature-level rollup, concept-drift hook, and alert-trigger surface.

**HE —** לבנות גלאי סחיפת מודלים ב-TypeScript טהור ללא תלויות, לתוך ONYX AI.
הגלאי משווה התפלגות בסיס (אימון) מול התפלגות נוכחית (פרודקשן) ומחזיר שלושה
אותות סטטיסטיים: **PSI**, **KS**, ו-**chi-square**, עטופים בדו"ח דו-לשוני,
סיכום ברמת תכונה, זיהוי סחיפת מושג, והפעלת התראות.

## 2. Deliverables / תוצרים

| File | Purpose |
|---|---|
| `onyx-ai/src/ml/drift-detector.ts` | Engine — PSI + KS + chi² + feature/concept drift + alerts |
| `onyx-ai/test/ml/drift-detector.test.ts` | 21 unit tests (Node `node --test`) |
| `_qa-reports/AG-Y164-drift-detector.md` | This report |

- Zero dependencies introduced.
- Zero files deleted (rule honored: never delete).
- Zero mutation of input arrays (defensive `[...]` copies everywhere).
- All strings in user-facing output carry `_he` and `_en` variants.

## 3. Statistical methods / שיטות סטטיסטיות

| # | Test | Purpose | Source reference |
|---|---|---|---|
| 1 | **Population Stability Index (PSI)** | Total-variation-style distance between two binned distributions. Primary drift signal. | Karakoulas 2004; industry-standard risk model monitoring. |
| 2 | **Kolmogorov-Smirnov (two-sample, two-sided)** | Max ECDF gap `D` + Marsaglia Q_KS series for the p-value. | Smirnov 1948; Marsaglia/Tsang/Wang 2003. |
| 3 | **Pearson chi-square** | Goodness-of-fit on aligned histograms (numeric) or aligned categorical counts. Laplace α=0.5 smoothing prevents empty-cell blow-ups. | Pearson 1900; Cochran 1954 (expected-cell guidance). |
| 4 | **Feature drift rollup** | Multi-feature scan that runs PSI+KS+chi² on every column and rolls the worst severity up. | — |
| 5 | **Concept drift hook** | Specialises compareDistributions for a target / prediction column and annotates the report with `conceptDrift: boolean`. | Webb, Lee, Goethals 2016. |

### Severity thresholds / ספי חומרה

Industry-standard PSI bands, exposed as `DRIFT_DEFAULTS` (frozen):

```
PSI < 0.10          → stable / יציב
0.10 ≤ PSI ≤ 0.25   → minor  / סחיפה קלה
PSI > 0.25          → major  / סחיפה משמעותית
```

KS and chi² supplement PSI. Their p-values are mapped to the same three
bands using **conservative** cut-points (p ≥ 0.01 → stable,
0.01 > p ≥ 0.0001 → minor, p < 0.0001 → major). The conservative
cut-points were chosen so that a purely-random same-distribution split
at n=500 does not escalate to "major" on sample noise alone. This
matches production practice where PSI is the primary signal and KS /
chi² only corroborate.

## 4. Public API / ממשק ציבורי

```ts
import {
  DriftDetector,
  defaultDriftDetector,
  computePSI,
  ksTwoSample,
  chiSquareTest,
  buildBinEdges,
  buildHistogram,
  alignCategoricalCounts,
  psiSeverity,
  percentile,
  ecdf,
  DRIFT_DEFAULTS,
  // Types
  DriftReport,
  DriftFinding,
  FeatureDriftReport,
  ConceptDriftReport,
  DriftAlert,
  DriftSeverity,
  DriftOptions,
  Lang,
} from './src/ml/drift-detector';

const detector = new DriftDetector({ lang: 'both' });

// Single distribution pair → DriftReport
const report = detector.compareDistributions(baselineValues, currentValues);

// Full feature-matrix scan → FeatureDriftReport
const rollup = detector.detectFeatureDrift(baselineRows, currentRows, [
  'price',
  'latency_ms',
  'region',
]);

// Model-output drift → ConceptDriftReport
const concept = detector.detectConceptDrift(
  basePredictions,
  currentPredictions,
  'risk_score',
);

// Convert any report into actionable alerts → DriftAlert[]
const alerts = detector.triggerAlerts(rollup);
```

### DriftReport shape

```ts
{
  feature?: 'price',
  kind: 'numeric' | 'categorical',
  sampleSizeBaseline: 500,
  sampleSizeCurrent:  500,
  findings: [
    {
      test: 'psi',
      statistic: 0.034,
      threshold: 0.10,
      severity: 'stable',
      bins: 10,
      explanation_he: 'PSI = 0.0341 על פני 10 פחים → יציב',
      explanation_en: 'PSI = 0.0341 over 10 bins → stable'
    },
    { test: 'ks', statistic: 0.042, pValue: 0.7614, severity: 'stable', ... },
    { test: 'chi_square', statistic: 4.12, pValue: 0.90, degreesOfFreedom: 9, ... }
  ],
  overallSeverity: 'stable',
  drifted: false,
  summary_he: 'סחיפה נומרית — יציב. PSI=0.0341, KS D=0.0420 (p=0.7614), χ²=4.12 ...',
  summary_en: 'Numeric drift — stable. PSI=0.0341, KS D=0.0420 (p=0.7614), chi²=4.12 ...',
  generatedAt: '2026-04-11T00:00:00.000Z'
}
```

### DriftAlert shape

```ts
{
  level: 'info' | 'warn' | 'critical',
  severity: 'stable' | 'minor' | 'major',
  feature?: 'latency_ms',
  test: 'psi' | 'ks' | 'chi_square' | 'feature_rollup' | 'concept_drift',
  statistic?: 12.34,
  threshold?: 0.25,
  triggeredAt: '2026-04-11T12:00:00.000Z',
  title_he: 'סחיפה ב-latency_ms: סחיפה משמעותית',
  title_en: 'Drift on latency_ms: major drift',
  body_he:  '...',
  body_en:  '...'
}
```

## 5. Test suite / סוויטת בדיקות

**Location:** `onyx-ai/test/ml/drift-detector.test.ts`
**Runner:** `node --test` (built-in, no extra deps)
**Command:**
```
npx node --test --require ts-node/register test/ml/drift-detector.test.ts
```

**Result:** **21 passed / 0 failed / 0 skipped** (total duration ≈ 1.0 s).

| # | Test | What it proves |
|---:|---|---|
| 1 | PSI is ~0 for identical histograms | PSI floor |
| 2 | PSI flags minor drift in the 0.10–0.25 band | Minor-band threshold |
| 3 | PSI above 0.25 is classified as major drift | Major-band threshold |
| 4 | Histogram bin edges span the union of both samples | `buildBinEdges` / `buildHistogram` correctness |
| 5 | KS returns D ~0 for identical samples | KS floor |
| 6 | KS detects a mean shift between two samples | KS power |
| 7 | KS p-value shrinks as distributions diverge | Monotonicity of the KS p-value |
| 8 | Chi-square has a small statistic for stable categorical data | Chi² floor |
| 9 | Chi-square rejects when categorical proportions shift | Chi² power |
| 10 | compareDistributions numeric — stable case | End-to-end stable path (Gaussian n=500) |
| 11 | compareDistributions numeric — major drift case | End-to-end major path + `freezeClockAt` |
| 12 | compareDistributions categorical — drift case | End-to-end categorical path, KS marked N/A |
| 13 | detectFeatureDrift rolls up multiple features correctly | Multi-feature rollup + selective drift per column |
| 14 | detectConceptDrift flags changes in model output distribution | Concept-drift wrapper |
| 15 | triggerAlerts emits critical alerts for major drift | Alert-routing for major |
| 16 | triggerAlerts is silent for stable reports | Zero false positives |
| 17 | Every report field carries bilingual Hebrew + English strings | Language contract (regex on U+0590–U+05FF) |
| 18 | compareDistributions does not mutate its input arrays | Immutability contract |
| 19 | percentile and ecdf behave sensibly | Helpers floor |
| 20 | alignCategoricalCounts aligns on the sorted union of keys | Categorical alignment |
| 21 | DRIFT_DEFAULTS has the Y-164 specified thresholds | Frozen defaults + threshold contract |

### Reproducibility / שחזוריות

- All randomised fixtures use a deterministic LCG (`lcg(seed)`) plus Box-Muller;
  `Math.random` is **never** called.
- `freezeClockAt` is wired through both the constructor and per-call options,
  so the `generatedAt` timestamp on every report can be pinned to an ISO
  string for golden-file comparisons.
- Hebrew substrings in summaries are asserted via the Unicode range
  `[\u0590-\u05FF]`, so locale encoding regressions fail loudly.

## 6. Design decisions / החלטות עיצוב

1. **No external deps.** Every statistical primitive (histograms, KS scan,
   chi² with gamma lower-incomplete via Numerical-Recipes-style branches,
   Lanczos log-Γ, chi² critical-value bisection) is implemented in-house.
2. **Laplace α=0.5 smoothing** for chi² eliminates the infinity blow-up
   that otherwise appears when a tail bin is empty in one sample —
   catastrophic failure mode discovered during test hardening.
3. **Conservative KS/chi² severity cut-points** (p ≥ 0.01 → stable) keep
   PSI as the primary signal and prevent sample-noise from firing
   "critical" alerts at n = 500 same-distribution splits.
4. **Union-of-samples binning.** Bin edges are computed from
   `baseline ∪ current`, guaranteeing that the two histograms live on the
   same partition even if one sample's range is strictly inside the other.
5. **KS on categorical data is explicitly N/A.** The categorical branch
   emits a placeholder KS finding with `severity: 'stable'` and a
   bilingual "not applicable" explanation, so downstream alerting code
   never escalates on KS alone for categorical features.
6. **Bilingual by default.** Every `DriftReport`, `DriftAlert`, and
   individual `DriftFinding` carries both `_he` and `_en` strings.
   Callers can format based on `lang: 'he' | 'en' | 'both'`.
7. **Never delete.** Additive-only: new files only, no touches to
   existing source, no removals.

## 7. Edge cases handled / קצוות שטופלו

| Edge case | Behaviour |
|---|---|
| Zero-count tail bins | Laplace 0.5 smoothing, cells with expected < ε are dropped (df auto-reduced) |
| Empty input array | Returns 0 / stable — no NaN leakage |
| Identical min = max (degenerate range) | `buildBinEdges` returns a tiny symmetric window so all values land in the central bin |
| Categorical data routed to numeric path | `detectKind` inspects the first sample and dispatches correctly |
| Constructor-level `freezeClockAt` vs per-call override | Per-call wins; otherwise the constructor default is threaded through `resolve()` |
| Input mutation | All inputs are read-only (`readonly number[]`); internal sorts always operate on copies |

## 8. How to run / הפעלה

```bash
# From the onyx-ai directory
cd onyx-ai

# Run the drift-detector test suite
npx node --test --require ts-node/register test/ml/drift-detector.test.ts

# Expected tail:
# ℹ tests 21
# ℹ suites 0
# ℹ pass 21
# ℹ fail 0
```

## 9. Compliance / תאימות

- **Bilingual rule** — every user-facing string has `_he` + `_en` variants.
- **Built-ins only** — no new npm packages; `node:test` + `node:assert`.
- **Never delete** — only new files created; existing files untouched.
- **Deterministic** — tests use LCG + `freezeClockAt` for golden-file
  reproducibility.
- **Strict TypeScript** — file compiles cleanly under the project's
  `strict: true` tsconfig.
- **Immutable inputs** — verified by test #18.

## 10. Known limitations / מגבלות ידועות

1. **KS for categorical data** is intentionally N/A (returns a
   stable placeholder). For categorical drift we rely on PSI + chi².
2. **Chi² with < 2 cells** returns a 0 statistic and df = 0 (degenerate).
3. **Numeric binning defaults to 10 equal-width bins.** Callers with
   heavy-tailed distributions should pass explicit `binEdges` (supported
   via `DriftOptions.binEdges`) or a larger `bins` count.
4. **Sample-size advisory.** Recommended minimum 200 per sample for the
   KS / chi² findings to be informative. PSI works at smaller n but is
   noisier.
5. **No multivariate / joint-distribution drift.** Y-164 is deliberately
   univariate; multivariate drift (MMD, energy distance, density-ratio)
   is out-of-scope and would belong to a future `AG-Y165`.

---

**Sign-off:**
- Agent: Y-164
- Status: GREEN — 21/21 tests passing
- Bilingual: yes (HE + EN)
- Built-ins only: yes
- Never delete: honored
