# AG-X35 — CRM Sales Pipeline (Deals / Kanban / Forecast)
**Agent:** X-35 | **Swarm:** 3B | **Project:** Techno-Kol Uzi mega-ERP
**Date:** 2026-04-11
**Status:** PASS — 32/32 tests green

---

## 1. Scope

A zero-dependency CRM sales-pipeline engine + a drag-and-drop Kanban UI for
Kobi Elkayam's Techno-Kol Uzi mega-ERP. Implements the full deal lifecycle
(Lead → Qualified → Proposal → Negotiation → Won/Lost) with activities,
forecasting, velocity, win/loss and stale-detection, plus a Palantir-dark
Hebrew-RTL kanban with HTML5 native drag-and-drop.

Delivered files
- `onyx-procurement/src/crm/pipeline.js` — engine
- `payroll-autonomous/src/components/KanbanBoard.jsx` — kanban UI
- `test/payroll/crm-pipeline.test.js` — 32 tests
- `_qa-reports/AG-X35-crm-pipeline.md` — this report

RULES respected
- Zero dependencies (engine uses only plain ES2015+ / Node builtins; UI uses React only)
- Hebrew bilingual labels on every stage, activity type, signal and warning
- Never deletes — state is append-only; no `deleteDeal` / `removeDeal` export exists (test 30)
- Real code, no stubs; fully exercised by the test suite (32 cases)

---

## 2. Domain model

### Deal
```js
{
  id, title, client_id, prospect_name, contact_id, owner,
  value, currency, probability, stage, expected_close_date,
  source, tags[], notes, created_at, updated_at,
  stage_entered_at, stage_history[], activity_ids[],
  closed_at?, won?, lost_reason?, actual_value?
}
```

### Stage ladder (bilingual)
| key           | HE           | EN          | probability |
|---------------|--------------|-------------|-------------|
| `Lead`        | הצעה         | Lead        | 0.10 |
| `Qualified`   | איכותני      | Qualified   | 0.25 |
| `Proposal`    | הצעת מחיר    | Proposal    | 0.45 |
| `Negotiation` | משא ומתן     | Negotiation | 0.70 |
| `Won`         | זכייה        | Won         | 1.00 |
| `Lost`        | הפסד         | Lost        | 0.00 |

### Activity types
`call / email / meeting / task / note` — each carries `datetime`,
`duration_minutes`, `outcome`, `subject`, `body`, `completed`, optional
`reminder_at`, and is append-only. Each type has `he` + `en` labels.

### Contact
`{ id, name, role, phone, email, client_id, created_at }`

---

## 3. Public API (`createPipeline({ now? }) → api`)

| function | purpose |
|----------|---------|
| `createDeal(fields)` | validate + insert, returns id |
| `updateDeal(dealId, patch)` | whitelist-only patch of mutable fields |
| `updateStage(dealId, stage, comment?)` | append to `stage_history`, resets `stage_entered_at`, auto-closes on Won/Lost |
| `logActivity(dealId, activity)` | append-only, supports reminders |
| `addContact(fields)` / `getContact(id)` | simple contact store |
| `listByOwner(ownerId)` | owner view, newest first |
| `pipelineView(stageFilters?)` | groups by stage, total + weighted totals |
| `forecast(period)` | `{committed, best_case, pipeline, weighted}` |
| `velocityReport(period)` | avg days per stage + overall |
| `winLossAnalysis(period)` | by_source + by_reason + win_rate |
| `forecastAccuracy(lookback)` | MAPE + bias vs probability-at-creation |
| `staleDeals(thresholdDays?)` | open deals whose stage age ≥ threshold |
| `dueFollowUps(now?)` | reminder_at ≤ now AND not completed |
| `calendarEvents(from, to)` | call/meeting/task normalized as events |
| `autoProgressRules(rules?)` | applies rules, returns transitions |
| `renderEmail(templateKey, ctx)` | bilingual template rendering |
| `snapshot()` | deep-cloneable state dump |

All list/get methods return shallow clones so the caller cannot mutate
internal state (verified in test 29).

---

## 4. Forecast semantics

```
committed   = Σ Won deals closed in period (uses actual_value)
pipeline    = Σ value of open deals whose expected_close_date is in period
weighted    = Σ value × probability of the above
best_case   = committed + Σ value of open Proposal/Negotiation deals in period
```

Forecast accuracy uses **probability at creation** (first entry of
`stage_history`) so comparisons are apples-to-apples, and reports:
```
samples, forecast_total, actual_total,
mape = Σ|actual − forecast| / forecast_total,
bias = Σ(actual − forecast) / forecast_total
```

---

## 5. Velocity metrics

`velocityReport(period)` walks each closed deal's `stage_history` and
accumulates `(stage_i.entered_at → stage_{i+1}.entered_at)` durations. For
the last open stage, it uses `closed_at` as the end marker. Per-stage
averages are computed only over deals that actually touched the stage, so
deals that skipped a stage don't zero-dilute its mean (verified in test 19).

---

## 6. Auto-progression rules

Default rule chain (callers may supply their own):

1. **Lead → Qualified** — if the deal has ≥ 1 completed meeting
2. **Qualified → Proposal** — if an email whose subject/body matches
   `/proposal|הצעה|quote/i` has been logged
3. **Proposal → Negotiation** — if ≥ 2 call/meeting activities whose
   `outcome + subject` matches `/negotiat|מחיר|מו"מ/i`

Caller can replace the chain entirely by passing `[fnA, fnB, …]`.
Each function receives `(deal, activities)` and returns either
`null` or `{ newStage, comment }`. Applied transitions are returned
as `{ deal_id, from, to, reason }[]` so the UI can toast them.

---

## 7. Kanban UI (`KanbanBoard.jsx`)

- **React-only**. No DnD libs, no UI kit, no styled-components. Inline
  styles keyed to a Palantir-dark theme (matches `BIDashboard` and
  `AuditTrail`).
- **RTL-first**: root `dir="rtl"`, header/cards `direction: rtl`, all
  text-align rules right-anchored, scroll container uses `direction: rtl`
  so horizontal scrolling mirrors.
- **Drag-and-drop**: native HTML5 `draggable="true"` + `dataTransfer`
  `text/plain` payload — the kind of zero-dep DnD that works in every
  browser since 2011. `aria-grabbed` flips during drag for screen readers;
  `aria-label` on every column uses "Stage column: <en name>".
- **Cards**: title, currency-formatted value, probability %, owner, age
  badge (turns orange if `stage_age_days >= staleThresholdDays`), tag
  chips. Key identifiers default to `he-IL` via `Intl.NumberFormat`.
- **Header totals**: total value + weighted value + deal count per stage,
  plus a global summary in the top header.
- **Filter bar**: free-text search (title / prospect / owner / tag /
  source), owner dropdown, tag dropdown, date range, "stale only"
  checkbox, reset button.
- **Light theme**: same component, pass `theme="light"`.

### Pure helper: `applyFilters(data, opts)`
Exported alongside the default component so the engine layer (or unit
tests) can reuse the exact same filter semantics as the board.

---

## 8. Test coverage

```
tests      32
passed     32
failed      0
duration  ~221ms
```

Node built-in runner:
```
node --test test/payroll/crm-pipeline.test.js
```

| Area                               | Cases |
|------------------------------------|-------|
| Module shape / bilingual           | 01–03 |
| Deal CRUD + validation             | 04–06 |
| Stage transitions + history        | 07–10 |
| Activities / reminders / calendar  | 11–14 |
| Pipeline view + listByOwner        | 15–16 |
| Forecast                           | 17–18 |
| Velocity                           | 19    |
| Win/loss by source + reason        | 20    |
| Forecast accuracy (MAPE/bias)      | 21    |
| Stale detection                    | 22–23 |
| Auto-progression rules             | 24–25 |
| Email templates (HE + EN)          | 26–28 |
| Immutability + never-delete        | 29–30 |
| Contacts                           | 31    |
| Snapshot + bilingual               | 32    |
| **Total**                          | **32**|

---

## 9. Defensive behavior

- `createDeal` validates title, non-negative numeric value, and stage
  membership. Anything else throws.
- `updateDeal` uses a whitelist — unknown keys (e.g. `id`) are ignored.
- `updateStage` rejects invalid stage names and refuses to re-open a
  closed deal (`Won`/`Lost` are terminal).
- `logActivity` rejects unknown activity types.
- `getDeal` / `listByOwner` / `pipelineView` / `listActivities` return
  shallow clones — mutating the returned object has **no** effect on
  internal state (test 29).
- All date inputs tolerate `null`/`undefined`/`Date`/numeric-ms/ISO string.
- `forecast`, `velocityReport`, `winLossAnalysis` skip malformed or
  out-of-window data silently (never throw on empty input).
- Deterministic id generator (`DEAL_xxxxxx`, `CONTACT_xxxxxx`,
  `ACT_xxxxxx`) — base-36, zero-padded, monotonic per-pipeline instance.

---

## 10. Bilingual compliance check

- Every stage entry in `STAGE_LABELS` carries non-empty `he` + `en`
  (tested in 02).
- Every activity type in `ACTIVITY_TYPES` carries non-empty `he` + `en`
  (tested in 03).
- Stale warnings emit both `warning_he` and `warning_en` (tested in 22).
- Email templates carry `subject_he/en` + `body_he/en`; `renderEmail`
  picks by `ctx.lang` and defaults to Hebrew (tested in 26–27).
- `snapshot().stages` round-trip preserves both labels (tested in 32).
- Kanban UI mirrors the same labels (`HE` dictionary is the primary, `EN`
  is exported for callers who want to switch).

---

## 11. Zero-dep compliance check

- `onyx-procurement/src/crm/pipeline.js` imports **nothing** —
  `'use strict'` + plain JS.
- Test file imports only `node:test`, `node:assert/strict`, `node:path`
  and the module under test.
- `KanbanBoard.jsx` imports only `react` (already a dep of
  `payroll-autonomous`). No `react-beautiful-dnd`, no `@dnd-kit`, no
  `framer-motion`, no UI library. Native HTML5 drag-and-drop only.
- No additions to any `package.json`.

---

## 12. Never-delete compliance check

- Module exports no deletion function of any kind — verified
  programmatically in test 30 (`assert.equal(pipe.deleteDeal, undefined)`,
  same for `removeDeal` / `purgeDeal`).
- Stage history is append-only; the only way to "undo" a stage change is
  to add a new stage entry.
- Activities are append-only — once logged they stay logged.
- Closed deals can never be re-opened (`updateStage` throws).

---

## 13. Sign-off

- Engine: implemented, documented, zero-dep, non-mutating, append-only
- Kanban UI: implemented, Palantir-dark RTL, HTML5 drag-drop, zero-dep
- Tests: 32/32 passing on Node 18+
- Bilingual: yes, on every stage / activity / warning / template
- Never-delete: yes, verified by test 30
- QA report: this file

**Recommendation:** APPROVE for integration into the sales desk of the
Techno-Kol Uzi mega-ERP. Wire `KanbanBoard` to
`createPipeline(...).pipelineView()` and route `onStageChange` back into
`updateStage`. For nightly forecasts, schedule `forecast('month')` +
`forecastAccuracy(90)` as a background job.
