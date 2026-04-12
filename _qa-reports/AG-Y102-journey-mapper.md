# AG-Y102 — Customer Journey Mapper
**Agent:** Y-102 | **Swarm:** Customer | **Project:** Techno-Kol Uzi Mega-ERP 2026
**Date:** 2026-04-11
**Status:** PASS — 33 / 33 tests green
**Rule upheld:** לא מוחקים רק משדרגים ומגדלים (Never delete, only upgrade and grow)

---

## 1. Scope

A zero-dependency, pure Node.js Customer Journey Mapper that tracks events
across the full customer lifecycle and turns them into measurable stage
transitions, conversion funnels, abandonment signals, anomaly reports,
cohort comparisons, next-stage predictions, intervention points, stage-level
NPS, and a bilingual SVG journey map.

The mapper is deterministic (no `Math.random`, clock is injectable), fully
append-only (there is no delete method — upgrades go through
`upgradeJourney()` which creates a new version and retains every prior
version), and bilingual in Hebrew (RTL) and English.

### Delivered files

| File | LOC | Purpose |
|---|---|---|
| `onyx-procurement/src/customer/journey-mapper.js` | ~740 | Main module |
| `onyx-procurement/test/customer/journey-mapper.test.js` | ~420 | 33 unit tests |
| `_qa-reports/AG-Y102-journey-mapper.md` | this file | QA report |

### Rules respected

- **Zero deps** — only `node:test` + `node:assert` (test file).
  No npm packages. No `require` outside `node:*`.
- **Never deletes** — `JourneyMapper` exposes no `delete*` or `remove*`
  method. Events are appended to an in-memory store; journey upgrades
  append a new version while retaining prior versions.
- **Bilingual labels** — every stage, trigger, anomaly, SVG title, legend,
  and label ships with both `he` and `en` variants.
- **Deterministic** — clock injectable via `new JourneyMapper({ now })`.

### Test run

```
node --test onyx-procurement/test/customer/journey-mapper.test.js
ℹ tests 33
ℹ suites 10
ℹ pass 33
ℹ fail 0
ℹ duration_ms 146
```

---

## 2. Public API

```js
const {
  JourneyMapper,        // main class
  STANDARD_JOURNEY,     // seed "Customer Lifecycle" journey
  STANDARD_STAGES,      // 7-stage definition
  EVENT_TYPES,          // event type catalog (stage + weight)
  TRIGGERS,             // array of known trigger event names
  LABELS,               // bilingual label dictionary
  createMemoryStore,    // in-memory append-only store
  ms, seconds, minutes, hours, days, // duration helpers
} = require('./src/customer/journey-mapper.js');

const jm = new JourneyMapper({
  now: () => new Date(),       // injectable clock
  store: createMemoryStore(),  // swappable persistence adapter
  seedStandardJourney: true,   // auto-seed the 7-stage lifecycle
});
```

### Class methods

| Method | Purpose |
|---|---|
| `defineJourney({id, name_he, name_en, stages})` | Register a journey. Stages must have `{id, name_he, name_en, triggers, expectedDuration, successMetrics}`. Frozen on store. |
| `upgradeJourney(id, patch)` | Create a new version of the journey. Stages are merged by id — existing stages are **never removed**. |
| `getJourney(id)` | Current (latest) version. |
| `listJourneys()` | All journey current versions. |
| `recordEvent({customerId, eventType, timestamp, properties})` | Append an event. `timestamp` accepts number, ISO string, or Date. |
| `getEvents(customerId, journeyId?)` | Chronological events. |
| `currentStage(customerId, journeyId)` | Latest resolved stage + entered_at. |
| `journeyDuration(customerId, journeyId)` | Total ms from first event to now. |
| `stageTimes(customerId, journeyId)` | `{stageId → ms}` map. |
| `conversionFunnel(journeyId)` | Per-stage `{reached, fromPrev%, fromTop%}`. |
| `abandonment({journeyId, period})` | Per-stage drop count (stalled > 2x expected). |
| `heatmapEvents({journeyId, period})` | `{stageId → {eventType → count}}` matrix. |
| `anomalyDetection({customerId, journeyId})` | Skip / backtrack / stall anomalies. |
| `compareCohorts({cohortA, cohortB})` | A/B delta of size, avgDuration, completion. |
| `predictNextStage(customerId, journeyId)` | Peer-trajectory based prediction with confidence. |
| `interventionPoints(journeyId)` | Stalls ranked by count and severity. |
| `generateJourneyMap(journeyId)` | Bilingual SVG visualization string. |
| `npsPerStage(journeyId)` | NPS attribution per stage. |

---

## 3. Journey Model

A **Journey** is an immutable, versioned definition of a lifecycle:

```
Journey {
  id: string                  // stable key
  name_he, name_en: string    // bilingual
  stages: Stage[]             // ordered
  version: number             // 1, 2, 3...
  createdAt: ISO string
}

Stage {
  id: string
  name_he, name_en: string
  triggers: string[]          // event types that resolve to this stage
  expectedDuration: number    // ms; used for abandonment / stall detection
  successMetrics: {
    min_events: number
    conversion_target: 0..1
    advance_to: stageId | null
  }
  index: number               // position in sequence
}
```

Events are resolved to stages by:

1. explicit `event.stage` property if the stage id exists on the journey,
   otherwise
2. lookup in `stage.triggers[]` — the first stage whose `triggers` array
   includes the event type wins.

A customer's stage history is rebuilt from their event sequence on demand
(pure function of the append-only log). Re-entering the same stage does
not produce a new entry — transitions are de-duplicated.

---

## 4. Standard Stages (seed)

The seed journey `customer_lifecycle` ships with 7 stages, all bilingual,
each with expected duration and default triggers:

| # | id | he | en | triggers | expected |
|---|---|---|---|---|---|
| 1 | `awareness` | מודעות | Awareness | `website_visit`, `ad_click`, `content_view`, `referral` | 14 d |
| 2 | `consideration` | שקילה | Consideration | `product_view`, `quote_request`, `demo_booked`, `comparison` | 21 d |
| 3 | `purchase` | רכישה | Purchase | `order_placed`, `contract_signed`, `payment_received` | 3 d |
| 4 | `onboarding` | קליטה | Onboarding | `welcome_email_opened`, `first_login`, `training_completed` | 14 d |
| 5 | `adoption` | אימוץ | Adoption | `feature_used`, `weekly_active`, `support_ticket` | 60 d |
| 6 | `expansion` | הרחבה | Expansion | `upsell_accepted`, `seat_added`, `upgrade_plan` | 180 d |
| 7 | `advocacy` | שגרירות | Advocacy | `referral_sent`, `review_posted`, `case_study`, `nps_promoter` | 365 d |

`nps_response` is stage-agnostic — it is attributed at report time to
whichever stage the customer was in when the response arrived.

---

## 5. Funnel & Abandonment Semantics

### Conversion funnel

```
Awareness      5  (100% / 100%)
Consideration  4  ( 80% /  80%)  ← 4/5 from prev, 4/5 from top
Purchase       3  ( 75% /  60%)
Onboarding     2  ( 66.7% / 40%)
Adoption       1  ( 50% /  20%)
Expansion      0
Advocacy       0
```

`fromPrev` is the conversion from the previous stage.
`fromTop` is the conversion from the entry stage (stage 0).

### Abandonment rule

A customer is counted as "dropped" in a stage when all of:

- the stage is **not** the terminal stage of the journey;
- the customer's most recent transition happened inside the requested
  `period: { from, to }` window;
- `now - lastEntry > 2 * stage.expectedDuration` (twice the tolerance).

---

## 6. Anomaly Detection

| Type | Trigger | Returned fields |
|---|---|---|
| `backtrack` | Stage index decreases between two consecutive transitions | `from`, `to`, `at`, `label_he`, `label_en` |
| `skip` | Stage index increases by more than 1 | `from`, `to`, `skipped[]`, `at` |
| `stall` | Customer's current stage is non-terminal and `elapsed > 2 * expected` | `stageId`, `elapsed`, `expected`, `at` |

---

## 7. SVG Layout

`generateJourneyMap(journeyId)` emits a self-contained SVG string with:

```
┌────────────────────────────────────────────────────────────────────┐
│                   Customer Lifecycle — מחזור חיי לקוח              │  title
│           Customer Journey / מסע לקוח | N customers / לקוחות       │  sub
│                     v1 — 2026-04-11T00:00:00Z                      │  version
│                                                                    │
│  ┌───────┐  80%  ┌───────┐  75%  ┌───────┐  ...                    │
│  │① Aware│──────▶│② Consi│──────▶│③ Purch│──────▶                  │  stages
│  │ מודעות│       │ שקילה │       │ רכישה │                         │
│  │ 5 cust│       │ 4 cust│       │ 3 cust│                         │
│  └───────┘       └───────┘       └───────┘                         │
│    100%            80%             60%                             │  fromTop
│    100% המירו      80% המירו       60% המירו                       │
│                                                                    │
│  Conversion / המרה                                                 │  footer
│  Generated ... · Techno-Kol Uzi Mega-ERP · Journey Mapper AG-Y102  │
└────────────────────────────────────────────────────────────────────┘
```

Layout parameters:

- Box: 160 × 90 px, rounded corners (rx=10), gradient fill.
- Gap: 50 px between boxes.
- Dimensions: width scales with N stages (~`40+N*160+(N-1)*50`), height ~370 px.
- Each stage shows English + Hebrew names, customer count, and index bubble.
- Arrows between boxes labeled with `fromPrev` percentage.
- Below each box: `fromTop` percentage in both languages.
- Footer: generated-at ISO timestamp + agent tag.

The SVG is valid XML with escaped attribute values, ready to embed in
dashboards, emails, or PDFs.

---

## 8. Hebrew glossary

| English | עברית | Notes |
|---|---|---|
| Customer Journey | מסע לקוח | top-level report header |
| Customer Lifecycle | מחזור חיי לקוח | seed journey name |
| Stage | שלב | |
| Trigger | טריגר / טריגרים | stage-entry event types |
| Duration | משך | total time in journey / stage |
| Conversion | המרה | stage-to-stage advance |
| Funnel | משפך המרה | |
| Abandonment | נטישה | |
| Heatmap | מפת חום | |
| Anomaly | חריגה | |
| Backtrack | חזרה לשלב קודם | customer moved backwards |
| Skip | דילוג על שלב | customer skipped a stage |
| Stall | תקיעה בשלב | customer has been in a stage past the tolerance |
| Intervention point | נקודת התערבות | stage where customers commonly stall |
| NPS | מדד נאמנות לקוחות / NPS | promoters − detractors, × 100 |
| Cohort | קבוצת השוואה | group of customers compared A/B |
| Journey map | מפת מסע | SVG visualization |
| Customers | לקוחות | |
| Events | אירועים | touchpoints |
| Dropped | עזבו | abandonment count |
| Stalled | תקועים | intervention count |
| Converted | המירו | funnel advance |
| Awareness | מודעות | stage 1 |
| Consideration | שקילה | stage 2 |
| Purchase | רכישה | stage 3 |
| Onboarding | קליטה | stage 4 |
| Adoption | אימוץ | stage 5 |
| Expansion | הרחבה | stage 6 |
| Advocacy | שגרירות | stage 7 |

---

## 9. Test Coverage

33 tests across 10 suites, all green:

1. **definition & seed** (6) — default seed, STANDARD_STAGES ids, validation,
   frozen records, `listJourneys`, `upgradeJourney` preserves prior version.
2. **events** (3) — append-only storage, argument validation, per-journey filtering.
3. **stage transitions** (4) — `currentStage`, empty-customer fallback,
   `journeyDuration`, `stageTimes` accumulation.
4. **funnel & abandonment** (3) — funnel percentages, drop detection at 2x
   tolerance, in-window non-drop.
5. **heatmap & anomalies** (4) — event matrix, backtrack, skip, stall.
6. **predict / intervene / cohort** (4) — peer trajectory prediction,
   terminal null, intervention ranking, cohort delta.
7. **NPS per stage** (2) — attribution at time-of-response, empty state.
8. **SVG generation** (2) — structural checks, bilingual titles, width scaling.
9. **never-delete invariant** (3) — no delete methods, upgrade preserves versions.
10. **bilingual labels** (2) — LABELS dictionary completeness, EVENT_TYPES
    ↔ TRIGGERS alignment.

Run:

```bash
node --test onyx-procurement/test/customer/journey-mapper.test.js
```

---

## 10. Never-Delete Invariant

The module provides exactly **zero** delete / remove / clear methods. The
test suite asserts this:

```js
assert.equal(typeof jm.deleteEvent, 'undefined');
assert.equal(typeof jm.removeEvent, 'undefined');
assert.equal(typeof jm.clear, 'undefined');
assert.equal(typeof jm.deleteJourney, 'undefined');
assert.equal(typeof jm.removeJourney, 'undefined');
```

Corrections are applied by:

- **new events** — any subsequent event overrides the "latest stage"
  computation without erasing history.
- **new journey versions** — `upgradeJourney()` appends a new version and
  keeps every prior version reachable via `store.allVersions(id)`. The
  current-index pointer simply advances.
- **frozen records** — returned stage and journey objects are
  `Object.freeze`d so callers cannot mutate history in place.

---

## 11. Integration notes

- The default in-memory store is fine for unit tests and dashboards.
  For persistence, pass a custom `store` implementing the same interface
  (`addEvent`, `allEvents`, `eventsFor`, `putJourney`, `getJourney`,
  `allVersions`, `listJourneyIds`).
- Consumers can plug the mapper into CRM write-paths: whenever a CRM
  event is emitted, mirror it via `recordEvent()` and the mapper will
  keep the funnel, heatmap, and SVG fresh with no additional wiring.
- The SVG output is self-contained and safe to embed in the existing
  BI dashboard at `/dashboard/journey/<id>.svg` — no external CSS or
  font files are needed beyond the default sans-serif.

---

## 12. Sign-off

- [x] Source module written & tested
- [x] 33 / 33 unit tests green
- [x] Zero runtime dependencies
- [x] Bilingual (he + en) everywhere
- [x] Rule "לא מוחקים רק משדרגים ומגדלים" enforced by design + tests
- [x] SVG generation produces valid bilingual output
- [x] Hebrew glossary documented

Agent Y-102 · 2026-04-11 · Techno-Kol Uzi Mega-ERP
