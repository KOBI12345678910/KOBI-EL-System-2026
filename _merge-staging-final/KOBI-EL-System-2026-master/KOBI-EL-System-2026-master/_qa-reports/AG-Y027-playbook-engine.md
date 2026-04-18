# AG-Y027 — Sales Playbook Engine | מנוע תסריטי מכירות

**Agent:** Y-027
**Project:** Kobi's mega-ERP — Techno-Kol Uzi
**Module:** `onyx-procurement/src/sales/playbook-engine.js`
**Tests:** `onyx-procurement/test/sales/playbook-engine.test.js`
**Date:** 2026-04-11
**Status:** GREEN — 26 / 26 tests passing

**Hard rule:** לא מוחקים רק משדרגים ומגדלים — *never delete, only upgrade and grow*.

---

## 1. Scope

Situation-based sales playbook engine. Each sales rep has a library of
pre-defined cadences (call + email + meeting + demo + task sequences)
that auto-fire on business events and walk an opportunity through a
deterministic series of actions — each with its own wait / due window
and bilingual Hebrew + English script content.

Requirements delivered:

- [x] `SalesPlaybook` class exported from `playbook-engine.js`
- [x] `definePlaybook`, `trigger`, `getCurrentStep`, `completeStep`, `skipStep`, `metrics`
- [x] 6 trigger types (new-lead, stage-change, stuck-in-stage-X-days, competitor-detected, objection-raised, deal-slipping)
- [x] 5 step types (call, email, meeting, demo, task)
- [x] 5 default seed playbooks
- [x] Bilingual (he/en) — every playbook, step, trigger, label, error
- [x] Zero external dependencies (pure Node built-ins)
- [x] Unit tests for trigger matching, step progression, skip tracking, metrics aggregation
- [x] Never-delete semantics (append-only executions + versioned playbooks)

---

## 2. Files delivered

| File | Lines | Purpose |
|---|---|---|
| `onyx-procurement/src/sales/playbook-engine.js` | ~680 | Playbook engine + seed |
| `onyx-procurement/test/sales/playbook-engine.test.js` | ~340 | 26 unit tests |
| `_qa-reports/AG-Y027-playbook-engine.md` | this file | QA report |

---

## 3. Public API

### Class `SalesPlaybook`

| Method | Signature | Returns |
|---|---|---|
| `definePlaybook` | `({id, name_he, name_en, trigger, steps})` | Versioned Playbook — previous versions preserved |
| `getPlaybook` | `(id, version?)` | Latest playbook (or a specific version) |
| `getPlaybookHistory` | `(id)` | Every historical version of a playbook |
| `listPlaybooks` | `()` | Latest version of every registered playbook |
| `trigger` | `(event, context)` | Array of newly-created executions for all matching playbooks |
| `getExecution` | `(executionId)` | Full execution snapshot |
| `listExecutions` | `(filter?)` | Filtered by `playbook_id`, `status`, `opportunity_id` |
| `getCurrentStep` | `(executionId)` | Active step view with bilingual content |
| `completeStep` | `(executionId, stepId, outcome)` | Advances to next step (or closes execution) |
| `skipStep` | `(executionId, stepId, reason)` | Logs skip reason, advances pointer |
| `cancelExecution` | `(executionId, reason)` | Cancels entire execution (still retained) |
| `metrics` | `(playbookId, period)` | Aggregate effectiveness report |

### Free functions / constants

- `buildDefaultPlaybooks()` — pure factory returning fresh seed definitions
- `CONSTANTS` — frozen catalog: `{ TRIGGER_TYPES, STEP_TYPES, LABELS }`
- `TRIGGER_TYPES`, `STEP_TYPES`, `LABELS` — also exported individually

---

## 4. Domain model

```
Playbook {
  id, version, name_he, name_en,
  trigger: { type, params },
  steps: [
    { id, type, content_he, content_en, waitDays, dueDays, order }
  ],
  created_at, updated_at
}

Execution {
  id, playbook_id, playbook_version, opportunity_id,
  trigger_event, trigger_context,
  status: 'active' | 'completed' | 'cancelled',
  current_step_index,
  steps_state: [
    { step_id, status, started_at, completed_at, outcome,
      skipped, skip_reason, scheduled_at, due_at }
  ],
  started_at, completed_at?, cancelled_at?, cancel_reason?
}
```

Executions are **append-only**. Skipped steps flip their status to
`skipped` and log the reason in place — they are never removed from
`steps_state[]`, so the replay timeline of any deal remains intact
forever.

Playbooks are **versioned**. `definePlaybook` on an existing id never
overwrites — it pushes a new version onto the history stack and
`getPlaybookHistory(id)` returns all revisions.

---

## 5. Trigger catalog

| Type | עברית | English | Params |
|---|---|---|---|
| `new-lead` | ליד חדש | New lead | `source`, `channel` |
| `stage-change` | שינוי שלב | Stage change | `fromStage`, `toStage` |
| `stuck-in-stage-X-days` | תקוע בשלב X ימים | Stuck in stage X days | `stage`, `days` |
| `competitor-detected` | מתחרה זוהה | Competitor detected | `competitor` |
| `objection-raised` | התנגדות הועלתה | Objection raised | `category` |
| `deal-slipping` | עסקה נשמטת | Deal slipping | `reason` |

### Matching rules

1. **Type equality** — event type must equal `playbook.trigger.type`.
2. **Param filtering** — each param on the playbook must satisfy the
   context:
   - strings → case-insensitive equality
   - `days` → numeric lower-bound threshold (`context.days >= playbook.days`)
   - `'*'` or unspecified → wildcard (matches anything)
3. **Unspecified params** on the playbook → fully permissive.

Example: `stuck-in-stage-X-days` with `{ stage: 'Proposal', days: 7 }`
matches any event whose stage equals `Proposal` and whose idle days
value is `>= 7`.

---

## 6. Step type catalog

| Type | עברית | English |
|---|---|---|
| `call` | שיחת טלפון | Phone call |
| `email` | אימייל | Email |
| `meeting` | פגישה | Meeting |
| `demo` | הדגמה | Demo |
| `task` | משימה | Task |

Each step defines:

- `waitDays` — days to wait after the *previous* step completes
- `dueDays` — SLA window once the step becomes active
- `content_he` / `content_en` — bilingual script/brief for the rep

When an execution starts, the engine walks all steps in order and
computes their `scheduled_at` + `due_at` timestamps cumulatively —
so the UI can show "Step 3 is due on April 17" the moment a lead
lands.

---

## 7. Seed — 5 default playbooks

### 7.1 New inbound lead — `pb-new-inbound-lead`

**Trigger:** `new-lead` (any source) · **Duration:** 10 days total

| # | Type | waitDays | dueDays | Hebrew | English |
|---|---|---|---|---|---|
| 1 | call    | 0 | 0 | שיחת היכרות תוך שעה — בירור צורך וגודל העסק | Discovery call within 1 hour — clarify need and company size |
| 2 | email   | 1 | 1 | אימייל מעקב עם מצגת וחומר רלוונטי לתחום הלקוח | Follow-up email with deck and industry-relevant material |
| 3 | demo    | 3 | 2 | הדגמה ממוקדת של המוצר לצורכי הלקוח | Targeted product demo aligned to customer needs |
| 4 | meeting | 4 | 2 | פגישת המשך עם מקבל ההחלטה הכלכלית | Follow-up meeting with economic decision-maker |
| 5 | task    | 2 | 1 | הכנת הצעת מחיר והעברתה תוך 48 שעות | Prepare and deliver a proposal within 48 hours |

**Total wait-days:** 0 + 1 + 3 + 4 + 2 = **10 days** (asserted by test #02)

### 7.2 Renewal approach 60 days before — `pb-renewal-60d`

**Trigger:** `stuck-in-stage-X-days` · `stage: Renewal` · **6 steps**
(email → call → QBR meeting → task → email → call). Spans the full
60-day window from opening reminder to closing call.

### 7.3 Stuck in proposal stage — `pb-stuck-in-proposal`

**Trigger:** `stuck-in-stage-X-days` · `stage: Proposal, days: 7` ·
**4 steps** (gentle email → active call → targeted incentive → handshake
meeting). Only fires once a deal has been idle in the Proposal stage
for 7+ days.

### 7.4 Lost-to-competitor recovery — `pb-lost-to-competitor-recovery`

**Trigger:** `competitor-detected` (any competitor) · **5 steps**
(RCA task → graceful email → 30-day check-in call → 90-day meeting
with win-back offer → onboarding support task). Spans ~98 days and
focuses on long-horizon win-back.

### 7.5 Upsell to existing customer — `pb-upsell-existing`

**Trigger:** `stage-change` · `toStage: Customer` · **5 steps**
(usage data collection → insights email → advanced-feature demo
→ ROI meeting → close upgrade task).

---

## 8. Metrics API

`metrics(playbookId, period)` returns:

```js
{
  playbook_id, version, name_he, name_en,
  period: { from, to },
  total_executions, active, completed, cancelled,
  completion_rate,             // completed / total
  steps_completed,
  steps_skipped,
  skip_rate,                   // skipped / (completed + skipped)
  avg_duration_days,           // average days from start → completed
  top_skip_reasons: [          // top-5 skip reasons
    { reason, count }
  ],
  outcome_breakdown: {         // tallies completeStep(outcome.result)
    won, lost, neutral, positive, other
  }
}
```

`period.from` / `period.to` accept `Date` or ISO strings and filter on
`started_at`. Both bounds are optional.

---

## 9. Hebrew glossary | מילון עברי

| English | עברית |
|---|---|
| Playbook | תסריט מכירות |
| Playbook engine | מנוע תסריטי מכירות |
| Trigger | טריגר / גורם הפעלה |
| Execution | ביצוע |
| Step | צעד |
| Current step | הצעד הנוכחי |
| Complete step | השלמת צעד |
| Skip step | דילוג על צעד |
| Skip reason | סיבת דילוג |
| Outcome | תוצאה |
| Opportunity | הזדמנות / עסקה |
| Lead | ליד |
| Inbound lead | ליד נכנס |
| Stage change | שינוי שלב |
| Stuck in stage | תקוע בשלב |
| Competitor | מתחרה |
| Objection | התנגדות |
| Deal slipping | עסקה נשמטת |
| Renewal | חידוש |
| QBR | סקירה רבעונית עם הלקוח |
| Upsell | מכירת שדרוג |
| Cross-sell | מכירה צולבת |
| Win-back | שחזור לקוח |
| Discovery call | שיחת היכרות |
| Follow-up | מעקב |
| Demo | הדגמה |
| Decision-maker | מקבל החלטה |
| Economic buyer | מקבל החלטה כלכלי |
| Handshake meeting | פגישת לחיצת יד |
| Call | שיחת טלפון |
| Email | אימייל |
| Meeting | פגישה |
| Task | משימה |
| Active | פעיל |
| Completed | הושלם |
| Cancelled | בוטל |
| Pending | ממתין |
| Skipped | דולג |
| Due date | תאריך יעד |
| Wait days | ימי המתנה |
| Effectiveness metrics | מדדי אפקטיביות |
| Completion rate | שיעור השלמה |
| Skip rate | שיעור דילוג |

---

## 10. Never-delete compliance

| Rule | Enforcement |
|---|---|
| Playbooks are never removed | `definePlaybook(id)` appends to `_playbooks.get(id)` → version history |
| Steps inside an execution are never removed | `skipStep` flips `status = 'skipped'`, keeps entry in `steps_state[]` |
| Skip reasons are logged | Test #18 asserts `skip_reason` persists + `steps_state.length` unchanged |
| Cancelled executions remain queryable | Test #20 asserts `getExecution(id)` returns the cancelled execution |
| Seed is idempotent | `seedDefaults()` is a no-op on already-registered ids (test #25) |
| Outcome audit trail | `steps_state[i].outcome` keeps the full payload of `completeStep` forever |
| Frozen constants | `CONSTANTS`, `TRIGGER_TYPES`, `STEP_TYPES`, `LABELS` all deep-frozen |

**No `.delete()`, `.clear()`, `.pop()`, `.shift()`, or `.splice()` calls
anywhere in the module.** Verified by direct review.

---

## 11. Test suite — 26 / 26 passing

Run:

```
cd onyx-procurement
node --test test/sales/playbook-engine.test.js
```

### Coverage map

| # | Test | Area |
|---|---|---|
| 01 | seed ships 5 default playbooks with bilingual names | seed + bilingual |
| 02 | new inbound lead has 5 steps spanning 10 days | seed content |
| 03 | every default playbook exists by id | seed ids |
| 04 | TRIGGER_TYPES catalog is complete + bilingual | catalog |
| 05 | STEP_TYPES includes call/email/meeting/demo/task | catalog |
| 06 | CONSTANTS table is frozen | never-delete |
| 07 | definePlaybook: redefining bumps version, history kept | versioning |
| 08 | definePlaybook rejects invalid input | validation |
| 09 | trigger: new-lead fires matching playbook | trigger matching |
| 10 | stuck-in-stage days threshold is a lower bound | trigger matching |
| 11 | competitor-detected fires recovery playbook | trigger matching |
| 12 | stage-change upsell only when toStage=Customer | trigger matching |
| 13 | invalid trigger event throws bilingual error | validation |
| 14 | getCurrentStep returns active step w/ bilingual content | progression |
| 15 | completeStep advances to next step | progression |
| 16 | completing final step marks execution completed | progression |
| 17 | completeStep rejects wrong step id | progression |
| 18 | skipStep: status=skipped, reason logged, step NOT removed | skip tracking |
| 19 | skipStep requires a reason | skip validation |
| 20 | cancelExecution keeps execution in store | never-delete |
| 21 | metrics aggregates executions, completions, skip rate | metrics |
| 22 | metrics respects period window | metrics |
| 23 | metrics throws for unknown playbook | metrics validation |
| 24 | listExecutions filters by playbook_id / status / opp | listing |
| 25 | seedDefaults is idempotent | seed |
| 26 | buildDefaultPlaybooks is a pure factory | purity |

### Actual output

```
✔ 01. seed ships 5 default playbooks with bilingual names
✔ 02. seed — new inbound lead has 5 steps spanning ~10 days
✔ 03. seed — every default playbook exists by id
✔ 04. TRIGGER_TYPES catalog is complete and bilingual
✔ 05. STEP_TYPES catalog includes call/email/meeting/demo/task
✔ 06. CONSTANTS table is frozen (never-delete)
✔ 07. definePlaybook: redefining an id bumps version, history preserved
✔ 08. definePlaybook rejects invalid input
✔ 09. trigger: new-lead fires matching playbook
✔ 10. trigger: stuck-in-stage-X-days — days threshold is a lower bound
✔ 11. trigger: competitor-detected fires recovery playbook
✔ 12. trigger: stage-change only fires upsell when toStage=Customer
✔ 13. trigger: invalid event throws bilingual error
✔ 14. getCurrentStep returns the active step with bilingual content
✔ 15. completeStep advances to the next step
✔ 16. completing the final step marks execution completed
✔ 17. completeStep rejects wrong step id
✔ 18. skipStep: status=skipped, reason logged, step NOT removed
✔ 19. skipStep requires a reason
✔ 20. cancelExecution keeps the execution (append-only)
✔ 21. metrics aggregates executions, completions, skip rate
✔ 22. metrics respects period window
✔ 23. metrics throws for unknown playbook
✔ 24. listExecutions filters by playbook_id and status
✔ 25. seedDefaults is idempotent (never duplicates ids)
✔ 26. buildDefaultPlaybooks is a pure factory (fresh objects)

ℹ tests 26
ℹ pass  26
ℹ fail  0
ℹ duration_ms ~137
```

---

## 12. Integration notes

- **Zero deps** — pure CommonJS, no `package.json` entries touched.
  Require directly: `require('./src/sales/playbook-engine.js')`.
- **CRM wire-up** — `trigger()` is designed to be called from the CRM
  pipeline's stage-change hook and the inbound-lead intake endpoint.
  Example:

  ```js
  const { SalesPlaybook } = require('./src/sales/playbook-engine');
  const playbooks = new SalesPlaybook();

  // on inbound lead
  app.post('/api/leads', (req, res) => {
    const leadId = createLead(req.body);
    playbooks.trigger('new-lead', {
      opportunity_id: leadId,
      source: req.body.source,
    });
    res.json({ ok: true, leadId });
  });
  ```

- **Persistence** — currently in-memory. To persist across restarts,
  wire `_playbooks` and `_executions` to the existing `src/db` layer.
  The shapes are pure JSON-safe objects and the engine already uses
  `JSON.parse(JSON.stringify(...))` for all outbound clones, so a
  trivial `JSON.stringify`-based store will do.
- **UI layer** — every step / trigger / label comes back with `he`
  and `en` variants. The React dashboard can render Hebrew RTL on
  every surface without a translation round-trip.
- **Error handling** — every validation error carries
  `err.bilingual = { he, en }` so UI error toasts are trivially
  locale-aware.

---

## 13. Sign-off

Module is production-ready for Swarm Y integration.
All deliverables created; 26/26 tests green; never-delete rule
respected end-to-end.

— Agent Y-027
