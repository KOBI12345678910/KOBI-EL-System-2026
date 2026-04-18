# AG-Y191 — Funnel Analyzer (lead -> MQL -> SQL -> opportunity -> won)

**Agent:** Y-191
**System:** Techno-Kol Uzi mega-ERP
**Subsystem:** ONYX Procurement — Reporting
**Author:** Kobi
**Date:** 2026-04-11
**Status:** GREEN — 30 / 30 tests passing

---

## 1. Mission / משימה

**EN.** Build a zero-dependency, pure-JS funnel analyzer that ingests
stage-transition events and produces step-wise conversion rates, overall
conversion, time-in-stage averages, and a bilingual drop-off reason
breakdown. The default funnel models the classic sales pipeline
`lead -> MQL -> SQL -> opportunity -> won`, but every step, label, and
drop-off reason can be replaced at construction time. The module must run
offline, never touch the network, never mutate caller data, and emit
every public label in both Hebrew and English.

**HE.** לבנות מנתח משפך טהור בג'אווהסקריפט, ללא תלויות חיצוניות, שמקבל
אירועי מעבר-שלב ומפיק שיעורי המרה שלב-אחרי-שלב, המרה כוללת, זמן ממוצע
בשלב, וניתוח סיבות נשירה דו-לשוני. משפך ברירת המחדל מדגים את צינור
המכירות הקלאסי: `ליד -> ליד מוסמך שיווקית -> ליד מוסמך מכירות -> הזדמנות
-> חתום`, אולם ניתן להגדיר משפך מותאם אישית לכל תהליך (RFQ->PO->חשבונית
->שולם, הרשמה->ניסיון->משלם, וכד'). המודול רץ במצב לא-מקוון, אינו נוגע
ברשת, אינו משנה את נתוני המשתמש, ומפיק את כל התוויות בעברית ובאנגלית.

## 2. Deliverables / תוצרים

| File / קובץ | Purpose / מטרה |
|---|---|
| `onyx-procurement/src/reporting/funnel.js` | Engine — `FunnelAnalyzer` class + helpers |
| `onyx-procurement/test/reporting/funnel.test.js` | 30 unit tests (node --test) |
| `_qa-reports/AG-Y191-funnel.md` | This report |

- Zero runtime dependencies introduced.
- Zero files deleted or renamed.
- No changes to any file outside the three listed above.

## 3. Public API / ממשק ציבורי

```js
const {
  FunnelAnalyzer,
  DEFAULT_STEPS,
  DEFAULT_DROP_REASONS,
} = require('./src/reporting/funnel');

const fa = new FunnelAnalyzer();           // default 5-stage funnel
// or with custom steps:
const fa2 = new FunnelAnalyzer({
  steps: [
    { key: 'rfq',     labelHe: 'בקשת הצעה', labelEn: 'RFQ' },
    { key: 'po',      labelHe: 'הזמנה',      labelEn: 'Purchase Order' },
    { key: 'invoice', labelHe: 'חשבונית',    labelEn: 'Invoice' },
    { key: 'paid',    labelHe: 'שולם',       labelEn: 'Paid' },
  ],
  dropReasons: {
    feature_gap: { he: 'חסר פיצר', en: 'Feature gap' },
  },
});

fa.addEvents([
  { entity_id: 'e1', stage: 'lead',        timestamp: '2026-01-01T09:00:00Z' },
  { entity_id: 'e1', stage: 'mql',         timestamp: '2026-01-02T09:00:00Z' },
  { entity_id: 'e1', stage: 'sql',         timestamp: '2026-01-04T09:00:00Z' },
  { entity_id: 'e1', stage: 'opportunity', timestamp: '2026-01-08T09:00:00Z' },
  { entity_id: 'e1', stage: 'won',         timestamp: '2026-01-20T09:00:00Z' },
  { entity_id: 'e2', stage: 'lead',        timestamp: '2026-01-03T10:00:00Z',
    drop_reason: 'budget' },
]);

fa.defineSteps(steps)                 // replace the funnel definition
fa.addEvent(event)                    // push one event
fa.addEvents(events)                  // push many events
fa.assignEventsToSteps()              // { stepKey: [events] }
fa.computeStepCounts()                // { stepKey: uniqueEntities }
fa.convRate('lead', 'mql')            // 0..1 conversion ratio
fa.allConvRates()                     // bilingual array, every adjacent pair
fa.overallConversion()                // first-step -> last-step ratio
fa.avgTimeInStage('sql')              // milliseconds or null
fa.allAvgTimeInStage()                // { stepKey: ms | null }
fa.dropOffByReason()                  // { reasonKey: count }
fa.dropOffByReasonBilingual()         // [{ key, he, en, count, pct }]
fa.analyze()                          // one-shot snapshot
fa.renderReport('both' | 'he' | 'en') // bilingual textual report
```

### Record shape — event / מבנה אירוע

```js
{
  entity_id:  'lead-007',            // stable id
  stage:      'mql',                 // must match a funnel step key
  timestamp:  '2026-03-01T09:15:00Z' // string | number | Date
  drop_reason: 'budget'              // optional; keyed into dropReasons dict
}
```

### Default stage labels / תוויות שלבים

| key | Hebrew | English |
|---|---|---|
| `lead` | ליד | Lead |
| `mql` | ליד מוסמך שיווקית | Marketing Qualified Lead |
| `sql` | ליד מוסמך מכירות | Sales Qualified Lead |
| `opportunity` | הזדמנות | Opportunity |
| `won` | חתום | Won / Closed |

### Default drop-off reasons / סיבות נשירה ברירת-מחדל

| key | Hebrew | English |
|---|---|---|
| `budget` | חוסר תקציב | No budget |
| `timing` | תזמון לא מתאים | Bad timing |
| `competitor` | מעבר למתחרה | Went to competitor |
| `no_fit` | חוסר התאמה | Not a good fit |
| `no_response` | ללא מענה | No response |
| `price` | מחיר גבוה מדי | Price too high |
| `authority` | חוסר סמכות החלטה | Lack of decision authority |
| `product` | חוסר פיצ'ר נדרש | Missing required feature |
| `lost_contact` | קשר אבוד | Lost contact |
| `other` | אחר | Other |

## 4. Algorithmic Notes / הערות אלגוריתמיות

1. **Unique-entity counting.** `computeStepCounts` de-duplicates events
   by `entity_id` so a repeated `lead` event for the same account never
   inflates the funnel top. `Set` semantics, O(n) over the event list.
2. **Conversion rates.** `convRate(a, b) = unique(b) / unique(a)`. We
   return `0` when the source bucket is empty (avoids `NaN`/Infinity).
3. **Time-in-stage.** `avgTimeInStage(k)` takes the **earliest** event
   per entity at stage `k` and subtracts it from the **earliest** event
   per entity at the next step. Entities that never advance are excluded
   — this prevents "stuck" rows from skewing the average to infinity.
   Out-of-order events (next-stage timestamp earlier than current-stage)
   are defensively dropped.
4. **Terminal stage.** Time-in-stage for the last step always returns
   `null` — there is no "next" stage to transition into. The report
   prints `n/a` / `אין נתונים`.
5. **Overall conversion.** Computed as first-step unique -> last-step
   unique, not as the product of intermediate rates. The two
   coincide when no entity skips stages but the definition is more
   robust to out-of-order ingestion.
6. **Drop-off tally.** `dropOffByReasonBilingual` sorts first by
   descending count, then by raw key alphabetically for deterministic
   output.
7. **Determinism.** No `Math.random`, no wall-clock reads, no locale
   reads. `test 25` pins this by comparing two analyzers on the same
   event list.
8. **Immutability.** `cloneEvent` copies every incoming event; `test 26`
   confirms the caller's array is untouched after `analyze()`.
9. **Zero-dependency.** Only `node:test` and `node:assert/strict` in
   the test file, both built-in.

## 5. Test Suite / חבילת בדיקות

**Location:** `onyx-procurement/test/reporting/funnel.test.js`
**Runner:** `node --test` (built-in)
**Cases:** 30 tests covering construction, configuration, ingestion,
counts, conversion, time-in-stage, drop-off, rendering, helpers, and
determinism.

### Breakdown

1. Constructs with default 5-stage funnel
2. `defineSteps` rejects <2 steps
3. `defineSteps` rejects duplicate keys and missing key
4. Custom funnel definition (procurement: RFQ -> PO -> invoice -> paid)
5. `addEvent` / `addEvents` store events; `addEvents` rejects non-array
6. `assignEventsToSteps` groups events and ignores unknown stages
7. `computeStepCounts` produces correct funnel counts
8. `computeStepCounts` dedupes repeated events for same entity
9. `convRate` computes step_i -> step_i+1 correctly
10. `convRate` throws on unknown step key
11. `convRate` handles zero-source gracefully (returns 0)
12. `allConvRates` returns bilingual labels for every adjacent pair
13. `overallConversion` is first->last independent of intermediate
14. `avgTimeInStage` computes per-entity average correctly
15. `avgTimeInStage` returns null for terminal step and empty data
16. `allAvgTimeInStage` reports every stage including null for terminal
17. `dropOffByReason` tallies raw drop reasons
18. `dropOffByReasonBilingual` sorts desc and ships HE+EN
19. Custom `dropReasons` dictionary overrides defaults
20. `analyze()` returns a self-contained snapshot
21. `renderReport('both')` contains Hebrew and English headers
22. `renderReport('he')` / `('en')` are language-pure
23. `toMillis` handles strings, numbers, Date, and nulls
24. `formatDuration` formats bilingual durations
25. Analyzer is deterministic across repeated runs
26. Adding events does not mutate caller payload
27. Custom 3-stage funnel with custom drop reasons works end-to-end
28. `avgTimeInStage` ignores out-of-order events gracefully
29. `DEFAULT_STEPS` and `DEFAULT_DROP_REASONS` are frozen
30. `round()` helper is stable and handles non-finite input

### Run result / תוצאת הרצה

```
tests 30
pass  30
fail  0
duration_ms ~208
```

Reproduce:

```
cd onyx-procurement
node --test test/reporting/funnel.test.js
```

## 6. Worked Example / דוגמה מלאה

Same 10-entity sample used by tests 7, 16, 18, 21:

```
דו"ח ניתוח משפך — Techno-Kol Uzi
Funnel Analysis Report — Techno-Kol Uzi
========================================
שלבים (ספירה):
Steps (counts):
  ליד: 10
  Lead: 10
  ליד מוסמך שיווקית: 8
  Marketing Qualified Lead: 8
  ליד מוסמך מכירות: 5
  Sales Qualified Lead: 5
  הזדמנות: 3
  Opportunity: 3
  חתום: 2
  Won / Closed: 2
----------------------------------------
שיעורי המרה (שלב->שלב):
Step-wise conversion rates:
  ליד -> ליד מוסמך שיווקית: 80% (8/10)
  Lead -> Marketing Qualified Lead: 80% (8/10)
  ליד מוסמך שיווקית -> ליד מוסמך מכירות: 62.5% (5/8)
  Marketing Qualified Lead -> Sales Qualified Lead: 62.5% (5/8)
  ליד מוסמך מכירות -> הזדמנות: 60% (3/5)
  Sales Qualified Lead -> Opportunity: 60% (3/5)
  הזדמנות -> חתום: 66.67% (2/3)
  Opportunity -> Won / Closed: 66.67% (2/3)
----------------------------------------
המרה כוללת: 20%
Overall conversion: 20%
----------------------------------------
זמן ממוצע בשלב:
Average time in stage:
  ליד: 2 ימים 0 שעות 0 דקות
  Lead: 2d 0h 0m
  ליד מוסמך שיווקית: 3 ימים 0 שעות 0 דקות
  Marketing Qualified Lead: 3d 0h 0m
  ליד מוסמך מכירות: 5 ימים 0 שעות 0 דקות
  Sales Qualified Lead: 5d 0h 0m
  הזדמנות: 10 ימים 0 שעות 0 דקות
  Opportunity: 10d 0h 0m
  חתום: אין נתונים
  Won / Closed: n/a
----------------------------------------
סיבות נשירה:
Drop-off reasons:
  תזמון לא מתאים: 2 (25%)
  Bad timing: 2 (25%)
  חוסר תקציב: 1 (12.5%)
  No budget: 1 (12.5%)
  מעבר למתחרה: 1 (12.5%)
  Went to competitor: 1 (12.5%)
  חוסר התאמה: 1 (12.5%)
  Not a good fit: 1 (12.5%)
  ללא מענה: 1 (12.5%)
  No response: 1 (12.5%)
  אחר: 1 (12.5%)
  Other: 1 (12.5%)
  מחיר גבוה מדי: 1 (12.5%)
  Price too high: 1 (12.5%)
========================================
```

## 7. Constraints Observed / אילוצים שכובדו

- **Never delete / לעולם לא למחוק.** No existing files removed or
  renamed. Only three new files created.
- **Node built-ins only / ליבת Node בלבד.** `node:test` and
  `node:assert/strict`. Zero `package.json` edits.
- **Bilingual / דו-לשוני.** Every public label (steps, drop reasons,
  report headers, duration format) ships in Hebrew and English.
- **Deterministic / דטרמיניסטי.** Verified by test 25.
- **Pure.** No HTTP, no disk, no DB. Pure math + Maps/Sets.
- **No mutation.** Verified by test 26.

## 8. Known Limitations / Future Work / מגבלות עתידיות

- **Linear funnel only.** Branching / parallel funnels (e.g. lead ->
  either trial OR demo -> won) are not modeled. Callers that need this
  can instantiate multiple `FunnelAnalyzer` instances and join their
  reports.
- **First-touch semantics.** `avgTimeInStage` uses the earliest event
  per entity at each stage. If an entity re-enters a stage after a
  loopback, the second entry is ignored.
- **No cohort windowing.** There is no built-in "last 30 days" or
  "per-quarter" slicing. Callers can pre-filter events before
  `addEvents`, or subclass and override `assignEventsToSteps`.
- **Drop reasons are whatever the caller provides.** The default
  dictionary covers the common Hebrew/English pairs but unknown keys
  fall through unchanged (no Hebrew mapping), which is explicit by
  design.

## 9. Sign-off / אישור

- All 30 tests green.
- No file deletions; no runtime dependencies added.
- Bilingual output verified end-to-end in tests 21, 22, 24, and in the
  worked example above.
- Ready for integration with the CRM/sales pipeline
  (`src/crm/`, `src/sales/`) and the reporting dashboard
  (`src/reports/`, `web/onyx-dashboard.jsx`).
