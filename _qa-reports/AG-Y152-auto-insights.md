# AG-Y152 — Auto-Insights Generator (bilingual, zero-dependency)

**Agent:** Y-152
**System:** Techno-Kol Uzi mega-ERP / ONYX AI
**Author:** Kobi
**Date:** 2026-04-11
**Status:** GREEN — 23 / 23 tests passing (`node --test`)
**Principle:** "לא מוחקים רק משדרגים ומגדלים" — additive-only, no files deleted.

---

## 1. Mission / משימה

**EN.** Build a deterministic, zero-dependency auto-insights generator that
scans any tabular dataset and returns a ranked list of bilingual
(Hebrew + English) observations. The engine must support spike/dip
detection, top movers, unusual categories, correlation surprises,
missing/stale alerts, concentration risk, and plateau/growth identifiers.

**HE.** לבנות גנרטור תובנות אוטומטי דטרמיניסטי, ללא תלויות חיצוניות,
שסורק כל טבלת נתונים ומחזיר רשימת תובנות מדורגת בשתי שפות (עברית + אנגלית).
המנוע תומך בזיהוי זינוקים וצניחות, מזיזים גדולים, קטגוריות חריגות,
הפתעות קורלציה, התרעות נתונים חסרים/מיושנים, סיכון ריכוזיות,
וזיהוי רמות/צמיחה.

---

## 2. Deliverables / תוצרים

| File | Purpose |
|---|---|
| `onyx-ai/src/insights/auto-insights.ts` | Engine (class `AutoInsights`, 7 detectors, pure helpers) |
| `onyx-ai/test/insights/auto-insights.test.ts` | 23 unit tests (Node built-in runner) |
| `_qa-reports/AG-Y152-auto-insights.md` | This bilingual QA report |

No files were deleted. No new dependencies introduced. TypeScript strict
compile clean for the new file against the project's `tsconfig.json`
(ES2022 target — native iterator support).

---

## 3. Architecture / ארכיטקטורה

### 3.1 Public surface / ממשק ציבורי

```ts
import AutoInsights, {
  analyzeDataset,
  type Row,
  type Insight,
  type InsightConfig,
  type Evidence,
} from './src/insights/auto-insights';

const ai = new AutoInsights({
  numericColumns: ['amount', 'units'],
  categoricalColumns: ['supplier', 'category'],
  timestampColumn: 'date',
  valueColumn: 'amount',
  zThreshold: 3.0,
});

const insights: Insight[] = ai.analyze(rows);
```

The `analyze()` method returns a ranked array. A shortcut
`analyzeDataset(rows, cfg)` is exported for callers that prefer a
function call.

### 3.2 Insight shape / מבנה תובנה

```ts
interface Insight {
  id: string;                 // stable — "<detector>:<column>:<key>"
  severity: number;           // 1..10
  confidence: number;         // 0..1
  detector: InsightDetector;  // which detector emitted this
  titleHe: string;            // Hebrew title (RTL-safe)
  titleEn: string;            // English title
  bodyHe: string;             // Hebrew body with numeric evidence inline
  bodyEn: string;             // English body with numeric evidence inline
  evidence: Evidence;         // raw numbers backing the claim
  suggestion: { he: string; en: string }; // concrete action recommendation
}
```

### 3.3 Detectors / גלאים

| # | Detector | Method | Technique | Fires when |
|---|---|---|---|---|
| 1 | spike/dip | `detectSpikeDip` | 3-sigma (sample stdev) | `|z| >= zThreshold` (default 3) |
| 2 | topMovers | `detectTopMovers` | month-over-month delta | `|Δ%| >= 25%` on the most recent period |
| 3 | unusualCategories | `detectUnusualCategories` | Tukey 1.5×IQR fence | category total outside the IQR fence |
| 4 | correlations | `detectCorrelations` | Pearson `r` on all pairs | `|r| >= correlationThreshold` (default 0.7) |
| 5 | missingStale | `detectMissingStale` | null ratio + max-date age | missing ≥ 10% or age ≥ `staleDays` (30) |
| 6 | concentrationHHI | `detectConcentration` | Herfindahl index | HHI ≥ 0.15 (moderate) / 0.25 (critical) |
| 7 | plateauGrowth | `detectPlateauGrowth` | OLS slope ÷ mean | `|slopeₙ| < 0.01` = plateau, else trend |

### 3.4 Ranking / דירוג

1. `severity` descending (most critical first).
2. `confidence` descending when severity ties.
3. `id` ascending for total stability (same input → same output order).

`maxResults` caps the returned array. `minSeverity` filters low-severity
noise before ranking.

### 3.5 Pure numeric helpers / פונקציות מספריות טהורות

Exported for reuse by other modules (also exercised by T22):
`mean`, `stdev`, `median`, `quartile`, `pearson`, `linearSlope`,
`herfindahl`, `toNum`, `toDate`. All ignore non-finite inputs and never
throw — they return `0` or `NaN` for degenerate cases.

---

## 4. Tunable thresholds / ספים ניתנים לכוונון

| Option | Default | Meaning |
|---|---|---|
| `zThreshold` | `3.0` | 3-σ cutoff for spike/dip |
| `minSeriesLength` | `5` | Skip detectors on short series |
| `hhiModerateRisk` | `0.15` | HHI → moderate concentration |
| `hhiHighRisk` | `0.25` | HHI → critical concentration |
| `staleDays` | `30` | Stale-data threshold |
| `correlationThreshold` | `0.7` | Pearson surprise cutoff |
| `plateauSlopeThreshold` | `0.01` | Normalised slope → plateau call |
| `asOf` | `new Date()` | Clock for staleness math (testable) |
| `maxResults` | `0` (unlimited) | Cap on returned insights |
| `minSeverity` | `1` | Severity floor for the result set |

Every option can be overridden per-call via a second argument to
`analyze(dataset, configOverride)`.

---

## 5. Test suite / חבילת מבחנים

**Runner.** Node built-in test runner (`node --test`) + `ts-node/register`
with `TS_NODE_TRANSPILE_ONLY=true` (matches the pattern already used by
`test/event-store.test.ts`).

**Run command:**

```bash
TS_NODE_TRANSPILE_ONLY=true \
  npx node --test --require ts-node/register \
  test/insights/auto-insights.test.ts
```

**Result.** 23 / 23 passing, ~540 ms total, pure in-memory (no FS, no
network).

| # | Test | What it proves |
|---|---|---|
| T01 | empty dataset → severity-10 missingStale | Safe behaviour on empty input |
| T02 | 3-sigma spike is caught | `detectSpikeDip` positive path |
| T03 | clean linear series silent | `detectSpikeDip` false-positive guard |
| T04 | downward dip fires with `z < 0` | Bilateral detection works |
| T05 | top-movers catches +400% swing | Month-over-month aggregation |
| T06 | <25% swing is ignored | False-positive guard for `topMovers` |
| T07 | whale breaks the IQR fence | `detectUnusualCategories` positive path |
| T08 | perfect positive Pearson caught | `detectCorrelations` positive path |
| T09 | perfect negative Pearson caught | Bilateral correlation detection |
| T10 | weak correlation stays silent | Threshold guard |
| T11 | 25% missing column is flagged | `detectMissingStale` positive path |
| T12 | 2-year-old timestamp is flagged | Stale-data math via `asOf` |
| T13 | dominant supplier triggers HHI | `detectConcentration` positive path |
| T14 | 10 balanced suppliers stay silent | HHI false-positive guard |
| T15 | flat series → plateau insight | `detectPlateauGrowth` plateau path |
| T16 | trending series → growth insight | `detectPlateauGrowth` growth path |
| T17 | output ranked by severity desc | Ranking invariant |
| T18 | `maxResults` caps the array | Cap behaviour |
| T19 | `minSeverity` filters noise | Severity floor |
| T20 | every insight has HE+EN+evidence+suggestion | Bilingual contract |
| T21 | synthetic procurement dataset → multi-detector output | End-to-end smoke test |
| T22 | numeric helpers are accurate | `mean`/`stdev`/`pearson`/`herfindahl` |
| T23 | deterministic ids across runs | Stability invariant |

Synthetic fixtures live inside the test file (`buildSalesDataset`,
`buildProcurementDataset`) so the tests remain self-contained.

---

## 6. Bilingual output example / דוגמת פלט דו-לשונית

```
[
  {
    "id": "concentrationHHI:supplier",
    "severity": 10,
    "confidence": 0.99,
    "detector": "concentrationHHI",
    "titleHe": "סיכון ריכוזיות קריטי בעמודה supplier",
    "titleEn": "Critical concentration risk in supplier",
    "bodyHe": "מדד הרפינדל HHI=0.72 (סף קריטי 0.25). השחקן הדומיננטי: \"Mega-Corp\" עם נתח של +83.3%.",
    "bodyEn": "Herfindahl HHI=0.72 (critical threshold 0.25). Dominant player: \"Mega-Corp\" at +83.3% share.",
    "evidence": {
      "hhi": 0.716,
      "threshold": 0.25,
      "share": 0.833,
      "category": "Mega-Corp",
      "column": "supplier",
      "sampleSize": 3
    },
    "suggestion": {
      "he": "התחילו תוכנית גיוון ספקים/לקוחות כדי להקטין תלות אסטרטגית.",
      "en": "Launch a diversification plan to reduce strategic dependency."
    }
  }
]
```

Every insight contains the Hebrew and English forms; numeric evidence is
attached so reviewers can reproduce the calculation by hand.

---

## 7. Assumptions & limitations / הנחות ומגבלות

- **Deterministic only.** The engine performs no sampling, no randomness,
  and no floating-point time-dependent computation. Same input → same
  output.
- **Monthly top-movers granularity.** `detectTopMovers` aggregates by
  calendar month (`YYYY-MM`). Daily / weekly granularity is a future
  upgrade — additive, no rewrites needed.
- **No I/O.** The engine does not read files, hit databases, or make
  network calls. Callers control data ingestion upstream.
- **Pearson only.** Correlation detector uses Pearson `r`; Spearman /
  rank-based correlation is a planned upgrade.
- **UTF-8 Hebrew safe.** All Hebrew strings are embedded as literals, and
  test fixtures compare with Unicode regexes so RTL works in `node --test`.
- **Principle compliance.** No files were deleted and no exports were
  removed. The detector set can grow by adding a new method + wiring it
  into `analyze()` — the "upgrade and grow" rule is baked into the class
  structure.

---

## 8. Integration pointers / נקודות אינטגרציה

Potential wire-up points inside the existing ERP:

1. **ONYX AI Governor** — stream the top-N critical insights into the
   existing alert bus for human review.
2. **ONYX Procurement dashboard** — surface `concentrationHHI` and
   `topMovers` on the supplier analytics page.
3. **Payroll autonomous engine** — feed salary cost series into
   `plateauGrowth` to flag departments that have plateaued.
4. **Techno-Kol Ops BI view** — mount `analyze()` behind a `/insights`
   endpoint to power the bilingual narrative column that already exists
   in the dashboard.

All four integrations are purely additive and require no changes to the
auto-insights module itself.

---

## 9. Sign-off / חתימה

- Engine file: `onyx-ai/src/insights/auto-insights.ts`
- Test file: `onyx-ai/test/insights/auto-insights.test.ts`
- Tests: 23 / 23 passing
- TypeScript: clean under project `tsconfig.json` (ES2022 target)
- Dependencies added: 0
- Files deleted: 0
- Principle honoured: "לא מוחקים רק משדרגים ומגדלים" ✅
