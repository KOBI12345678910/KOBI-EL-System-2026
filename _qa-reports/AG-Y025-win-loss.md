# AG-Y025 — Win / Loss Analyzer — QA Report

**Agent:** Y-025
**Swarm:** Sales Intelligence — Techno-Kol Uzi Mega-ERP
**Component:** `onyx-procurement/src/sales/win-loss.js`
**Test:** `onyx-procurement/test/sales/win-loss.test.js`
**Date:** 2026-04-11
**Node:** >= 18 (uses built-in `node:test`)
**Runtime deps:** none (pure JavaScript, bilingual HE/EN)
**Rule reminder:** **לא מוחקים רק משדרגים ומגדלים** — the ledger inside
`WinLossAnalyzer` is append-only. Replaying the same `opportunityId` keeps
both entries in history; only aggregates roll up the latest. Nothing is
ever deleted.

---

## 1. Purpose

`WinLossAnalyzer` turns every closed sales opportunity — win or loss — into
structured, auditable insight. It answers four recurring questions for the
sales leadership weekly review:

1. **Why are we losing?** — ranked root-cause catalog, period-scoped.
2. **Who are we losing to?** — win rate by competitor, loss share.
3. **Where are we losing?** — per-segment win rates (industry / size /
   region / product).
4. **What traits predict a loss?** — cohort lift analysis vs global loss rate.

It also generates a Hebrew interview script for lost-deal debriefs and a
bilingual management report suitable for deck inclusion.

## 2. Public API

```js
const { WinLossAnalyzer } = require('./src/sales/win-loss');

const a = new WinLossAnalyzer({
  now: () => new Date(),            // optional clock override for tests
  opportunities: [                    // optional opportunity metadata
    { opportunityId, accountName, industry, size, region, product },
  ],
});

a.upsertOpportunity({ opportunityId, industry, size, region, product });
a.recordOutcome(opportunityId, {
  outcome: 'won' | 'lost',
  causes: [{ category, subCategory, notes, competitor }],
  competitor, value, notes, closedAt,
});

a.causeCatalog();                                  // hierarchical HE/EN
a.topCauses('lost', { from, to });                 // ranked causes
a.trends('lost', { from, to });                    // monthly buckets
a.competitorAnalysis({ from, to });                // win rate per rival
a.segmentAnalysis({ dimension, period });          // dimension = industry|size|region|product
a.lossPatterns({ period, limit });                 // correlation / lift
a.interviewTemplate(opportunityId);                // HE debrief script
a.generateReport({ from, to });                    // bilingual summary
a.getRecords();                                    // read-only ledger copy
```

## 3. Cause Taxonomy (hierarchical, bilingual)

| Category | Hebrew | Sub-codes (selection) |
| --- | --- | --- |
| `price` | מחיר | too_high, discount_denied, payment_terms, tco, competitive_bid*, value_match* |
| `features` | תכונות | missing_feature, integration_gap, scale_limit, ux, must_have*, roadmap_match* |
| `timing` | תזמון | too_late, too_early, quarter_mismatch, frozen_hiring, perfect_window* |
| `relationship` | יחסים | weak_champion, no_exec_sponsor, trust, responsiveness, strong_champion*, exec_backing* |
| `competitor` | מתחרה | incumbent, price_war, better_demo, reference_story, out_featured*, better_support* |
| `budget_cut` | קיצוץ תקציב | approved_then_pulled, department_freeze, shifted_priority, budget_secured* |
| `no_decision` | אין החלטה | status_quo, stalled_evaluation, unclear_owner |
| `product_fit` | התאמת מוצר | wrong_segment, wrong_geo, unsupported_lang, perfect_fit* |
| `delivery` | מסירה | long_lead_time, no_local_support, implementation_risk, fast_delivery* |
| `legal` | משפטי | dpa_blocker, security_questionnaire, localisation_law |

`*` = positive sub-code used on `won` records. The same top-level category
exists on both sides so symmetric analysis (what wins vs what loses on the
same axis) is possible.

## 4. Analysis Methods

### 4.1 Top causes
Counts each (`category`, `subCategory`) occurrence inside the window,
divides by the sum of all cause counts → `share`, sorts descending. Labels
are emitted in both languages.

### 4.2 Competitor analysis
Groups records by `competitor` (inherits from `outcome.competitor` or from
any `competitor` cause), returning `wins`, `losses`, `total`, `value`,
`winRate`, and `shareOfLosses`. Sorted by total deals so the most
significant rivals surface first.

### 4.3 Segment analysis
Joins each record against its opportunity metadata on the requested
dimension (`industry`, `size`, `region`, `product`). Opportunities without
metadata fall into a `(unknown)` bucket rather than being silently dropped,
so the data owner sees the gap.

### 4.4 Loss patterns (correlation / lift)
For every trait (segment dimensions, competitor, cause category), computes:

- cohort loss rate = losses(cohort) / total(cohort)
- lift = cohort loss rate − global loss rate

Cohorts smaller than 2 records are skipped (noise filter). Correlation is
bucketed:

| Lift                | Label |
| ------------------- | --- |
| `>= 0.20`           | `strong_loss_lift` |
| `>= 0.10`           | `loss_lift` |
| `>= 0.03`           | `mild_loss_lift` |
| `(-0.03, 0.03)`     | `neutral` |
| `<= -0.03`          | `mild_win_lift` |
| `<= -0.10`          | `win_lift` |
| `<= -0.20`          | `strong_win_lift` |

Top-N patterns returned sorted by `lift` desc (largest loss lifts first).

### 4.5 Trends
Monthly buckets keyed `YYYY-MM`, each bucket totals records in that month
and counts by cause category — used by BI dashboards to plot stacked
column charts.

## 5. Hebrew Interview Script Template

`interviewTemplate(opportunityId)` returns a structured object:

```js
{
  opportunityId,
  lang: 'he',
  fallbackEn: true,
  script: '…full HE text…',
  sections: [
    'header', 'ground_rules', 'warm_up', 'discovery',
    'decision_criteria', 'competition', 'gap', 'advice',
    'wrap_up', 'fields'
  ],
  suggestedDurationMinutes: 25,
  causeFieldsHint: { /* full causeCatalog() */ },
}
```

The script auto-pre-fills account name, industry, region, product, and the
winning competitor when metadata is available. When metadata is missing,
the interviewer still gets a complete HE template they can run cold.

**Section outline (HE):**

1. **תחקיר הפסד עסקה / Lost Deal Debrief** — header with IDs & date.
2. **כללי הריאיון** — ground rules, consent, no pricing, ~20–30 minutes.
3. **פתיחה** — project goal, decision stakeholders.
4. **גילוי וצרכים** — priorities: price, features, relationship, support, integration.
5. **קריטריוני החלטה** — primary reason, swing factor, ROI/TCO.
6. **תחרות** — other vendors, demo comparisons, incumbent influence.
7. **הפער שלנו** — where we fell short, moment of lost interest.
8. **עצה לעתיד** — what would make us relevant in 12 months.
9. **סיכום** — open floor, thank you, written summary within 48h.
10. **שדות לתיעוד** — exact field names to push back into the analyzer.

## 6. Bilingual Report

`generateReport(period)` returns a JSON payload containing:

- `summary.he` / `summary.en` — totals, wins, losses, winRate, wonValue,
  lostValue, totalValue, title.
- `topWinCauses`, `topLossCauses` — top 5 each.
- `competitors` — full competitor table.
- `lossPatterns` — top 5 correlated traits.
- `glossary` — the HE glossary (see §7).
- `recommendations` — HE+EN action items derived from top loss causes and
  high-lift cohorts.
- `ruleReminder` — `לא מוחקים רק משדרגים ומגדלים`.

## 7. Hebrew Glossary

| Key | HE |
| --- | --- |
| `won` | ניצחון |
| `lost` | הפסד |
| `winRate` | שיעור ניצחון |
| `lossRate` | שיעור הפסד |
| `opportunity` | הזדמנות |
| `cause` | סיבה |
| `category` | קטגוריה |
| `subCategory` | תת קטגוריה |
| `competitor` | מתחרה |
| `industry` | ענף |
| `size` | גודל |
| `region` | אזור |
| `product` | מוצר |
| `segment` | סגמנט |
| `trend` | מגמה |
| `pattern` | דפוס |
| `period` | תקופה |
| `topCauses` | סיבות מובילות |
| `interview` | ריאיון |
| `debrief` | תחקיר |
| `patternAnalysis` | ניתוח דפוסים |
| `correlation` | מתאם |
| `recommendation` | המלצה |

## 8. Test Coverage

`test/sales/win-loss.test.js` — 16 tests, all passing.

```
✔ causeCatalog exposes bilingual hierarchical taxonomy
✔ recordOutcome is append-only and preserves history (לא מוחקים)
✔ recordOutcome rejects invalid inputs
✔ topCauses aggregates and ranks by count
✔ topCauses honours period filter
✔ topCauses also works for wins
✔ competitorAnalysis computes win rate per competitor
✔ competitorAnalysis is period-scoped
✔ segmentAnalysis breaks down win rate per dimension
✔ segmentAnalysis surfaces unknown segments rather than dropping them
✔ lossPatterns identifies at-risk cohorts with positive lift
✔ interviewTemplate generates a Hebrew script with expected sections
✔ interviewTemplate falls back gracefully for unknown opportunity
✔ generateReport produces bilingual summary with recommendations
✔ internal helpers behave as expected
✔ HEBREW_GLOSSARY covers required analyst vocabulary

tests 16 / pass 16 / fail 0
```

Run with:
```
node --test test/sales/win-loss.test.js
```

## 9. Never-Delete Guarantee

Verified by the `recordOutcome is append-only` test:

1. Record OPP-2001 as `lost`.
2. Record OPP-2001 again as `won`.
3. `getRecords()` returns **2** entries in chronological order.
4. Aggregates use the latest entry, the audit trail preserves the original.

## 10. Non-Goals

- No persistence: the analyzer is a pure library. Callers own storage
  (DB, file, sync to the ledger).
- No random sampling: every aggregate is deterministic on inputs, which
  keeps reports reproducible and diff-able.
- No external dependencies: safe to ship inside a worker, CLI, or report
  job without touching `package.json`.

## 11. Integration Points (future)

- `onyx-procurement` CRM module emits `recordOutcome` whenever a deal is
  marked won/lost.
- The management dashboard calls `generateReport({ from, to })` weekly.
- The sales ops UI consumes `causeCatalog()` to render the HE/EN picker.
- The post-mortem flow calls `interviewTemplate(oppId)` to print the HE
  debrief script for the account manager.

---

**Status:** DONE — 16/16 tests passing, bilingual, zero deps, rule-compliant.
