# AG-Y103 — Customer Success Plan Builder
**Agent:** Y-103 | **Swarm:** 4 | **Project:** Techno-Kol Uzi mega-ERP
**Date:** 2026-04-11
**Status:** PASS — 35/35 tests green (~112 ms)
**Rule:** לא מוחקים רק משדרגים ומגדלים  —  never delete, only upgrade and grow

---

## 1. Scope

A zero-dependency, in-memory Customer Success Plan (CSP) engine for every
enterprise account Techno-Kol Uzi runs on the ERP. The engine owns the
joint vision, goals, stakeholders, risks, milestones, health score, QBR
data prep, ROI of the customer, escalation chain, bilingual executive
deck (real PDF bytes, no deps), cadence of touchpoints, value realization
and renewal readiness scoring.

Delivered files
- `onyx-procurement/src/customer/success-plan.js` — the library (~870 LOC, pure JS)
- `onyx-procurement/test/customer/success-plan.test.js` — 35 tests across 13 suites
- `_qa-reports/AG-Y103-success-plan.md` — this report

RULES respected
- **Zero dependencies** — only Node built-ins (`node:test`, `node:assert/strict`, `Buffer`)
- **Bilingual** — every status, label, section, QBR title, risk, severity, cadence and
  renewal tier has both `{he}` and `{en}` fields
- **Never delete** — plans, goals, risks, stakeholders, decisions, ROI snapshots,
  QBRs, escalations and history are append-only. Joint reviews capture a full
  `snapshot_before` of the plan so nothing is ever lost.
- **Deterministic** — id factory produces stable `plan_0001`, `goal_0001`, etc.,
  enabling reproducible tests; `now` is injectable for time-travel testing.

---

## 2. Public API (`class SuccessPlan`)

```js
const { SuccessPlan } = require('./src/customer/success-plan.js');
const engine = new SuccessPlan({ now: () => '2026-04-11T10:00:00.000Z' });

engine.createPlan({customerId, csm, startDate, endDate, vision, goals, stakeholders, risks, milestones, cadence});
engine.trackGoalProgress({planId, goalId, actual, notes, date});
engine.planHealth(planId);                       // → { score, label, breakdown }
engine.quarterlyReview({planId, quarter});       // → QBR object with sections
engine.stakeholderMap(planId);                   // → exec_sponsor / champion / user_base / blockers
engine.roiCalculation({planId, investments, returns});
engine.escalation({planId, issue, severity, routedTo});
engine.updatePlanWithCustomer({planId, reviewDate, decisions, changes});
engine.generateExecutivePDF(planId);             // → { bytes, pdf_base64, text }
engine.cadenceTracker({planId, cadence});        // → { next_touchpoints, overdue }
engine.valueRealization(planId);                 // → { planned, delivered, gap, pct }
engine.renewalReadiness(planId);                 // → { score, label, factors }
engine.getPlan(planId);                          // deep clone
engine.listPlans({customerId, csm, status});     // filtered list
```

---

## 3. Plan structure

```
Plan {
  id, customer_id, csm, start_date, end_date,
  vision: { he, en },
  cadence: 'weekly'|'biweekly'|'monthly'|'quarterly'|'annually',
  status: 'draft'|'active'|'healthy'|'at_risk'|'critical'|'archived',
  health_score, health_label,     // computed by _computeHealth()
  renewal_score, renewal_label,   // computed by _computeRenewal()
  goals: [
    Goal {
      id, description_he, description_en,
      metric, target, owner, due_date,
      status: 'not_started'|'on_track'|'at_risk'|'off_track'|'achieved'|'missed',
      status_he, status_en,
      actuals: [{ actual, notes, at, pct }],
      latest_actual, latest_pct, created_at, updated_at
    }
  ],
  stakeholders: [ Stakeholder {id, name, role, type, type_he, type_en, influence, sentiment, email, phone} ],
  risks:        [ Risk        {id, description_he, description_en, severity, severity_he, severity_en, mitigation, owner, status} ],
  milestones:   [ Milestone   {id, name_he, name_en, target_date, achieved_date, status} ],

  // append-only logs (NEVER deleted)
  value_log[], touchpoints[], escalations[],
  roi_snapshots[], qbrs[], decisions[],
  history[]   // every joint review snapshots the full `snapshot_before`

  created_at, updated_at, archived_at
}
```

### Goal status → health weight

| Status        | he        | en          | Weight |
|---------------|-----------|-------------|-------:|
| not_started   | טרם החל   | Not started |  0.00 |
| on_track      | במסלול    | On track    |  1.00 |
| at_risk       | בסיכון    | At risk     |  0.50 |
| off_track     | סטייה     | Off track   |  0.20 |
| achieved      | הושג      | Achieved    |  1.00 |
| missed        | לא הושג   | Missed      |  0.00 |

Health score = `(Σ weights) / goalCount`, then adjusted:
- `-0.15` per unresolved critical risk
- `-0.05` per open escalation

Mapping to label:
- `>= 0.75` → **green** / ירוק
- `>= 0.50` → **yellow** / צהוב
- otherwise → **red** / אדום

---

## 4. QBR format

`quarterlyReview({planId, quarter})` returns:

```
QBR {
  id, plan_id, customer_id, quarter, generated_at,
  title: { he: 'סקירת לקוח רבעונית — Q2-2026',
           en: 'Quarterly Business Review — Q2-2026' },
  executive_summary: {
    he: 'בריאות התכנית: ירוק. 1/2 יעדים הושגו. 0 בסיכון.',
    en: 'Plan health: Green. 1/2 goals achieved. 0 at risk.',
  },
  sections: {
    health,              // full health breakdown
    value_realization,   // planned vs delivered
    renewal_readiness,   // score + 4 weighted factors
    goals: { achieved[], at_risk[], total },
    milestones,          // next 5 upcoming
    stakeholder_map,     // sponsors / champions / users / blockers
    roi,                 // latest snapshot
    risks,               // open only
    escalations,         // open only
  },
  next_steps_he: 'להגדיר פעולות רבעון הבא בפגישת סקירה',
  next_steps_en: 'Define next quarter actions in review meeting',
}
```

The QBR is itself append-only: every generated review stays on
`plan.qbrs[]` for historical comparison and audit.

---

## 5. ROI calculation

```js
engine.roiCalculation({
  planId,
  investments: [{ label: 'Licenses', amount: 100000 }, { amount: 20000 }],
  returns:     [{ label: 'Savings Y1', amount: 180000 }, 60000],
});
// → {
//   total_investment: 120000,
//   total_return:     240000,
//   net_return:       120000,
//   roi_ratio:        1.00,
//   roi_percentage:   100,
//   payback_months:   6,
//   label: { he: 'החזר חיובי', en: 'Positive ROI' },
//   currency: 'ILS',
// }
```

Investments and returns accept both numeric shorthand and `{label,amount,month?}`
objects. Each call is persisted as a snapshot; the latest feeds into renewal readiness.

---

## 6. Escalation chain

Severity → SLA + default chain (CSM always included first):

| Severity | he       | SLA (h) | Chain added                                     |
|----------|----------|--------:|-------------------------------------------------|
| low      | נמוכה    |      72 | CSM → csm_lead → account_director                |
| medium   | בינונית  |      24 | CSM → csm_lead → account_director                |
| high     | גבוהה    |       8 | + vp_customer_success                            |
| critical | קריטית   |       2 | + vp_customer_success + cro + ceo                |

`routedTo` is prepended to the chain so ad-hoc routing is preserved. The
escalation's `history[]` is append-only (open → acknowledged → resolved),
and every escalation is stored on `plan.escalations[]` forever.

---

## 7. Cadence tracker

`cadenceTracker({planId, cadence?})` generates the full scheduled touchpoint
stream across `[start_date, end_date]` with per-cadence step:

| Cadence    | he         | en         | Step (days) |
|------------|------------|------------|-------------|
| weekly     | שבועי      | Weekly     |  7          |
| biweekly   | דו-שבועי   | Biweekly   | 14          |
| monthly    | חודשי      | Monthly    | 30          |
| quarterly  | רבעוני     | Quarterly  | 90          |
| annually   | שנתי       | Annually   | 365         |

Returns `{ next_touchpoints (next 5 upcoming), overdue, total, logged }`.
Every invocation is itself recorded as a touchpoint snapshot so the
cadence history is queryable.

---

## 8. Renewal readiness (0.00 — 1.00)

Weighted composite over four factors:

| Factor                | Weight | Source                            |
|-----------------------|-------:|-----------------------------------|
| plan_health           |  0.40 | `_computeHealth(plan).score`      |
| stakeholder_coverage  |  0.20 | exec (0.35) + champ (0.30) + 3+ users (0.20) + no blockers (0.15) |
| value_realization     |  0.25 | `_computeValue(plan).pct / 100`   |
| roi                   |  0.15 | Latest `roi_ratio`: ≥1 = 1.0; >0 = 0.6; =0 = 0.3; <0 = 0 |

Label mapping:

| Score range  | Label     | he               | en                  |
|--------------|-----------|------------------|---------------------|
| ≥ 0.75       | likely    | צפוי לחדש        | Likely to renew     |
| 0.55 – 0.74  | stable    | יציב             | Stable              |
| 0.35 – 0.54  | at_risk   | בסיכון           | At risk             |
| < 0.35       | critical  | לא צפוי לחדש     | Unlikely to renew   |

Returned object includes every factor with its `weight`, `value`, `contribution`
so the CS team can explain the score to the customer and to leadership.

---

## 9. Executive PDF (bilingual)

`generateExecutivePDF(planId)` produces a real PDF 1.4 document in pure JS
via `_buildMinimalPdf()`. The 1-page deck renders:

- Title (EN + HE header)
- Plan id, customer, CSM, window
- Vision (EN + HE)
- Health score + label (EN + HE)
- Goals on-track %, total goals
- Value delivered %
- Renewal readiness (EN + HE)
- Stakeholder counts, open risks, open escalations, milestones

Output shape:
```
{ plan_id, bytes: <Buffer>, pdf_base64, content_type: 'application/pdf',
  pages: 1, bilingual: true, generated_at, text }
```

Header verified: first 5 bytes = `%PDF-`. Non-Latin-1 characters are
substituted with `?` inside the PDF text stream (for Helvetica builtin
compatibility) but the full bilingual payload is available on the
returned `text` field for any client-side renderer.

---

## 10. Test coverage

`test/customer/success-plan.test.js` — 35 tests, all passing:

| Suite | Tests | Coverage focus                                                 |
|-------|------:|----------------------------------------------------------------|
| 1. createPlan               | 5 | Shape, ids, bilingual vision, required fields, history entry |
| 2. trackGoalProgress        | 6 | on_track / at_risk / off_track / achieved / missed, errors   |
| 3. planHealth               | 4 | all not_started, all green, critical-risk penalty, empty    |
| 4. stakeholderMap           | 2 | Grouping by type, coverage score edge cases                  |
| 5. roiCalculation           | 4 | Positive / negative / zero / snapshot persistence            |
| 6. quarterlyReview          | 1 | Bilingual title + all sections present                       |
| 7. escalation               | 3 | Severity chain, SLA hours, routedTo prepend                  |
| 8. updatePlanWithCustomer   | 2 | Append-only, goalPatches preserve `snapshot_before`          |
| 9. generateExecutivePDF     | 1 | Valid PDF bytes, bilingual text                              |
| 10. cadenceTracker          | 2 | Monthly vs weekly touchpoint counts                          |
| 11. valueRealization        | 1 | Planned vs delivered sums                                    |
| 12. renewalReadiness        | 2 | Likely / critical paths, weighted factors                    |
| 13. Accessors + invariants  | 2 | Deep-clone return, "never delete" invariant verification     |

Run:

```
cd onyx-procurement
node --test test/customer/success-plan.test.js
# tests 35   pass 35   fail 0   duration_ms ~112
```

---

## 11. Hebrew / English glossary

| English term                 | Hebrew                     |
|------------------------------|----------------------------|
| Customer Success Plan        | תכנית הצלחת לקוח           |
| Customer Success Manager     | מנהל הצלחת לקוח (CSM)      |
| Executive sponsor            | נותן חסות ביצועי            |
| Champion                     | אלוף                       |
| End user                     | משתמש                      |
| Decision maker               | מקבל החלטות                |
| Blocker                      | חוסם                       |
| Influencer                   | משפיע                      |
| Vision                       | חזון                       |
| Goal                         | יעד                        |
| Metric                       | מדד                        |
| Target                       | יעד / מטרה                 |
| Owner                        | בעלים / אחראי              |
| Due date                     | תאריך יעד                  |
| Not started                  | טרם החל                    |
| On track                     | במסלול                     |
| At risk                      | בסיכון                     |
| Off track                    | סטייה                      |
| Achieved                     | הושג                       |
| Missed                       | לא הושג                    |
| Health (plan)                | בריאות (תכנית)             |
| Green / Yellow / Red         | ירוק / צהוב / אדום         |
| Risk                         | סיכון                      |
| Severity                     | חומרה                      |
| Low / Medium / High / Critical | נמוכה / בינונית / גבוהה / קריטית |
| Mitigation                   | מיגור / הפחתה              |
| Milestone                    | אבן דרך                    |
| Go-live                      | העלאה לייצור               |
| Quarterly Business Review    | סקירת לקוח רבעונית (QBR)  |
| Executive summary            | תקציר מנהלים               |
| Value realization            | מימוש ערך                  |
| ROI                          | החזר השקעה                 |
| Positive / negative ROI      | החזר חיובי / שלילי         |
| Payback period               | תקופת החזר                 |
| Investment                   | השקעה                      |
| Return                       | תשואה / החזר               |
| Escalation                   | אסקלציה / הסלמה            |
| Escalation chain             | שרשרת אסקלציה              |
| Routed to                    | הופנה אל                   |
| SLA                          | זמן תגובה (SLA)            |
| Joint review                 | סקירה משותפת               |
| Decision                     | החלטה                      |
| History / audit trail        | היסטוריה / עקבות ביקורת    |
| Snapshot                     | צילום מצב                  |
| Cadence                      | תדירות                     |
| Weekly / Biweekly            | שבועי / דו-שבועי           |
| Monthly / Quarterly / Annually | חודשי / רבעוני / שנתי     |
| Touchpoint                   | נקודת מגע                  |
| Upcoming                     | קרוב / עתידי               |
| Overdue                      | באיחור                     |
| Stakeholder                  | בעל עניין                  |
| Stakeholder map              | מפת בעלי עניין             |
| Coverage                     | כיסוי                      |
| Sentiment                    | תחושה / עמדה               |
| Influence                    | השפעה                      |
| Renewal readiness            | מוכנות לחידוש              |
| Likely to renew              | צפוי לחדש                  |
| Stable                       | יציב                       |
| Unlikely to renew            | לא צפוי לחדש               |
| Archived                     | בארכיון                    |
| Upgrade and grow             | שדרוג וגידול               |

---

## 12. Rule compliance — "לא מוחקים רק משדרגים ומגדלים"

| Asset          | Delete path? | Audit trail                                    |
|----------------|-------------|-------------------------------------------------|
| Plan           | No          | `history[]` records every create/review        |
| Goal           | No          | `updatePlanWithCustomer.goalPatches` mutates in place but the old values are captured in `history[].snapshot_before.goals` |
| Stakeholder    | No          | `newStakeholders` appends; removals not supported |
| Risk           | No          | `status` flips to `resolved`; the record stays  |
| Milestone      | No          | `status` transitions; never removed             |
| Decision       | No          | Pure append                                     |
| Escalation     | No          | Pure append + its own `history[]`               |
| ROI snapshot   | No          | Pure append                                     |
| QBR            | No          | Pure append; historical QBRs stay               |
| Touchpoint     | No          | Pure append                                     |

Archival path: when a customer churns, set `plan.status = 'archived'` and
`plan.archived_at = now`. The plan remains fully queryable and continues to
feed into executive reporting and post-mortem analysis.

---

## 13. Integration touchpoints (future wiring)

This report deliberately ships the engine as a self-contained module. The
natural integration surface:

1. REST routes under `/api/customer/success-plan/...` backed by this engine
2. A `plans` table in PostgreSQL mirroring the in-memory shape (JSONB
   columns for goals, stakeholders, risks, milestones, history)
3. Pulling ROI figures from the existing `src/bl/` and `src/finance/` modules
4. Scheduling touchpoints into the calendar MCP (`gcal_create_event`)
5. Wiring escalations into the existing `src/notifications/` pipeline
6. Surfacing renewal-readiness scores on the CS dashboard alongside the
   CRM pipeline (see `src/crm/pipeline.js`)

None of the above is in scope for AG-Y103, but every field name and shape
in this module is designed to map cleanly onto those integrations.

---

**End of report — AG-Y103 — Customer Success Plan Builder**

---
---

# AG-Y103 — Customer Success Plan Engine (Y-103 extension upgrade) | מנוע תכנית הצלחת לקוח — שדרוג

**Agent:** Y-103 (Swarm 4 — Techno-Kol Uzi mega-ERP)
**Upgrade date:** 2026-04-11
**Status:** PASS — 61/61 tests green (35 existing + 26 Y-103 extension)
**Rule:** `לא מוחקים רק משדרגים ומגדלים` — never delete, only upgrade and grow

> This upgrade APPENDS to the original report above. The original Customer
> Success Plan Builder (35 tests) is untouched, every legacy method, dictionary
> and behaviour still passes its original tests. The extension adds 11 new
> methods + 3 new dictionaries to `SuccessPlan`.

## E-1. Scope of upgrade | היקף השדרוג

תוספת Y-103 מוסיפה 11 שיטות חדשות למחלקה `SuccessPlan` מעל ה-API הקיים, מבלי
לגעת בסמל אחד מהמימוש המקורי. כל הבדיקות הישנות (35) ממשיכות לעבור ירוק כפי שהיו,
ו-26 בדיקות חדשות מכסות את ה-API החדש. אחסון: in-memory, לולאה בלבד של Node.

New methods (all in `onyx-procurement/src/customer/success-plan.js`):

| Method                                      | EN                                                               | HE                                             |
|----------------------------------------------|------------------------------------------------------------------|------------------------------------------------|
| `createPlan({...,reviewCadence,goals})`     | Accept Y-103 goal shape (`name_he`, `name_en`, `baseline`, `weight`) + `reviewCadence`; legacy shape still works | קבלת צורת היעדים של Y-103 + קצב סקירה           |
| `updateMilestone({planId,goalId,currentValue,notes,updatedBy})` | Append-only measurement + history              | מדידה חדשה, היסטוריה מצטברת                    |
| `computeProgress(planId)`                    | Weighted 0–100% progress across all goals                        | התקדמות משוקללת 0–100%                         |
| `riskAssessment(planId)`                     | `green` / `yellow` / `red` band from progress vs. timeline       | פס סיכון לפי קצב מול ציר זמן                    |
| `addMilestone(planId, goal)`                 | Append a new goal, preserve all existing goals                   | הוספת יעד חדש, יעדים קיימים נשמרים             |
| `markAtRisk(planId, reason)`                 | Flag plan + compute notification recipients                      | סימון בסיכון + חישוב נמענים                    |
| `escalate(planId, level)`                    | Ladder: `csm_manager` → `vp_cs` → `executive`                    | סולם: מנהל/ת CSM → סגן נשיא CS → הנהלה          |
| `scheduleReview(planId, date, attendees)`    | Record the next review meeting                                    | תיעוד פגישת סקירה הבאה                          |
| `generateDeck(planId, lang)`                 | Bilingual HTML deck (`he` / `en` / `both`)                       | מצגת HTML דו-לשונית                             |
| `aggregatePortfolio(csmId)`                  | All plans owned by a CSM + totals                                 | כל התכניות של CSM + סכומים                      |
| `graduatePlan(planId)`                       | Status → `graduated`, full record preserved                       | סטטוס → הושלמה בהצלחה, הרשומה נשמרת              |
| `closeUnsuccessful(planId, reason)`          | Status → `closed_unsuccessful`, full history preserved            | סטטוס → נסגרה ללא הצלחה, ההיסטוריה נשמרת         |

New exported dictionaries:

* `RISK_BANDS` — `green` / `yellow` / `red` with `{he, en, min}`
* `ESCALATION_LEVELS` — `csm_manager` / `vp_cs` / `executive` with ordered recipients
* `REVIEW_CADENCES` — subset of `CADENCE` allowed in `createPlan({reviewCadence})`

## E-2. Cadence table | טבלת תדירויות

| key         | HE         | EN         | days | Allowed in `reviewCadence`? |
|-------------|------------|------------|------|-----------------------------|
| `weekly`    | שבועי      | Weekly     | 7    | Yes — כן                    |
| `biweekly`  | דו-שבועי   | Biweekly   | 14   | Yes — כן                    |
| `monthly`   | חודשי      | Monthly    | 30   | Yes — כן                    |
| `quarterly` | רבעוני     | Quarterly  | 90   | Yes — כן                    |
| `annually`  | שנתי       | Annually   | 365  | No — לא (legacy cadence API only) |

## E-3. Risk bands | פסי סיכון

`riskAssessment(planId)` computes a **pace ratio**:
`pace_ratio = weighted_progress / time_elapsed` (both ∈ [0,1] over the plan window).

| band     | HE                          | EN                        | Pace ratio | Action                                        |
|----------|-----------------------------|---------------------------|------------|-----------------------------------------------|
| `green`  | ירוק — במסלול               | Green — on track          | `≥ 0.80`   | Keep cadence                                  |
| `yellow` | צהוב — דורש מעקב            | Yellow — watch            | `0.50–0.79`| Watch + weekly check                          |
| `red`    | אדום — התערבות דחופה        | Red — intervene now       | `< 0.50`   | Escalate + `markAtRisk`                       |

Downgrade rules:

1. **≥ 1 open critical risk** → any `green` result is floored to `yellow`.
2. **≥ 2 open critical risks** → any `yellow` result is floored to `red`.
3. **`plan.at_risk_flag === true`** → minimum band is `yellow` (never `green`).

## E-4. Escalation levels | רמות הסלמה

Every call to `escalate(planId, level)` appends an escalation record AND a
`type:'escalation'` history entry. Recipients are **cumulative** — each level
includes the recipients of all lower levels so nobody silently drops out of
the communication loop.

| order | level          | HE                                | EN                      | recipients                                      |
|-------|----------------|-----------------------------------|-------------------------|-------------------------------------------------|
| 1     | `csm_manager`  | מנהל/ת CSM                        | CSM manager             | `['csm_manager']`                               |
| 2     | `vp_cs`        | סגן/נית נשיא/ה להצלחת לקוחות      | VP Customer Success     | `['csm_manager', 'vp_cs']`                      |
| 3     | `executive`    | הנהלה בכירה                       | Executive               | `['csm_manager', 'vp_cs', 'cro', 'ceo']`        |

The richer legacy `escalation({planId, issue, severity, routedTo})` method
(which builds chains from severity) remains untouched and is still covered by
its three legacy tests.

## E-5. Hebrew glossary | מילון עברי

| HE                           | EN                          | Context                                           |
|------------------------------|-----------------------------|---------------------------------------------------|
| תכנית הצלחת לקוח              | Customer Success Plan       | Top-level artifact                                |
| אבן דרך                       | Milestone / Goal            | `plan.goals[]` + `addMilestone`                   |
| נקודת פתיחה                   | Baseline                    | `goal.baseline`                                   |
| יעד                           | Target                      | `goal.target`                                     |
| ערך נוכחי                     | Current value               | `updateMilestone({currentValue})`                 |
| משקל                          | Weight                      | `goal.weight` — affects weighted progress         |
| התקדמות משוקללת                | Weighted progress            | `computeProgress()` → `progress_pct`              |
| פס סיכון                      | Risk band                    | `riskAssessment()` → `green/yellow/red`           |
| קצב סקירה                     | Review cadence               | `reviewCadence` in `createPlan`                   |
| סימון בסיכון                  | Mark at risk                 | `markAtRisk(planId, reason)`                      |
| נמעני התראה                    | Notification recipients      | `markAtRisk` return value                         |
| הסלמה                         | Escalation                   | `escalate(planId, level)`                         |
| מנהל/ת CSM                    | CSM manager                  | `ESCALATION_LEVELS.csm_manager`                   |
| סגן/נית נשיא/ה להצלחת לקוחות   | VP Customer Success          | `ESCALATION_LEVELS.vp_cs`                         |
| הנהלה בכירה                    | Executive                    | `ESCALATION_LEVELS.executive`                     |
| פגישת סקירה                    | Review meeting               | `scheduleReview`                                  |
| משתתפים                        | Attendees                    | `scheduleReview(..., attendees)`                  |
| מצגת הצלחה                    | Success deck                 | `generateDeck`                                    |
| תיק תכניות                    | Portfolio                    | `aggregatePortfolio(csmId)`                       |
| הושלמה בהצלחה                  | Graduated                    | `PLAN_STATUS.graduated`, `graduatePlan`           |
| נסגרה ללא הצלחה                | Closed unsuccessful          | `PLAN_STATUS.closed_unsuccessful`, `closeUnsuccessful` |
| יומן אירועים                   | History / audit trail        | `plan.history[]` — append-only                    |

## E-6. Never-delete invariant (Y-103 upgrade) | כלל אי-המחיקה

| Operation            | Effect on prior data                                              |
|----------------------|-------------------------------------------------------------------|
| `addMilestone`       | Appends new goal, existing goals untouched.                       |
| `updateMilestone`    | Appends to `goal.actuals[]` with `previous_value` in history.     |
| `markAtRisk`         | Flag + reason + history entry; reason is queryable later.         |
| `escalate`           | New escalation record + history entry; old escalations retained.  |
| `scheduleReview`     | Append to `plan.reviews[]`; no overwrite of prior meetings.       |
| `graduatePlan`       | Status flipped to `graduated`; goals, history, reviews, decisions, ROI snapshots all queryable via `getPlan`. |
| `closeUnsuccessful`  | Status flipped to `closed_unsuccessful`; full audit trail retained — every legacy history event is still present after the close. |

Dedicated tests enforce this invariant:

* `Y103 never-delete invariant: addMilestone + updates only grow the record`
* `Y103 closeUnsuccessful: status flip preserves full history`
* `Y103 graduatePlan: flips status to graduated, record fully preserved`

## E-7. Test run | הרצת בדיקות

```
cd onyx-procurement
node --test test/customer/success-plan.test.js
```

**Result:**

```
ℹ tests        61
ℹ suites        0
ℹ pass         61
ℹ fail          0
ℹ cancelled     0
ℹ skipped       0
ℹ todo          0
ℹ duration_ms ~140
```

### Y-103 extension tests (26, well above the 18 minimum)

1. `Y103 createPlan: accepts reviewCadence + name_he/name_en/baseline/weight goals`
2. `Y103 createPlan: rejects reviewCadence outside weekly/biweekly/monthly/quarterly`
3. `Y103 updateMilestone: appends actuals and history, nothing removed`
4. `Y103 computeProgress: weighted progress across goals 0-100%`
5. `Y103 computeProgress: empty plan returns 0% with bilingual label`
6. `Y103 riskAssessment: green when progress keeps pace with timeline`
7. `Y103 riskAssessment: red when progress lags timeline badly`
8. `Y103 riskAssessment: yellow band sits between green and red`
9. `Y103 addMilestone: appends new goal, existing goals preserved`
10. `Y103 markAtRisk: flags plan and returns notification recipients`
11. `Y103 escalate: ladder csm_manager → vp_cs → executive`
12. `Y103 escalate: unknown level throws`
13. `Y103 scheduleReview: records review meeting and attendees`
14. `Y103 scheduleReview: requires a date`
15. `Y103 generateDeck: bilingual HTML deck with RTL + LTR sections`
16. `Y103 generateDeck: lang=he produces RTL-only deck`
17. `Y103 aggregatePortfolio: returns all plans owned by a CSM`
18. `Y103 aggregatePortfolio: requires csmId`
19. `Y103 graduatePlan: flips status to graduated, record fully preserved`
20. `Y103 closeUnsuccessful: status flip preserves full history`
21. `Y103 closeUnsuccessful: requires reason`
22. `Y103 never-delete invariant: addMilestone + updates only grow the record`
23. `Y103 computeProgress: weights skew the weighted average`
24. `Y103 riskAssessment: critical risks downgrade band`
25. `Y103 dictionaries: RISK_BANDS / ESCALATION_LEVELS / REVIEW_CADENCES all bilingual`
26. `Y103 end-to-end: create → milestones → risk → escalate → graduate`

All 35 pre-existing `SuccessPlan` tests still pass verbatim — this upgrade is
100% backwards-compatible.

## E-8. Hebrew RTL + bilingual UX

* Every new dictionary (`RISK_BANDS`, `ESCALATION_LEVELS`, `REVIEW_CADENCES`,
  extended `PLAN_STATUS`) has `{ he, en }` labels.
* `generateDeck()` emits a valid HTML5 document with `<section dir="rtl" lang="he">`
  + `<section dir="ltr" lang="en">` side-by-side when `lang === 'both'`,
  or a single RTL/LTR block when `lang === 'he'` / `lang === 'en'`.
* Every goal carries `name_he`, `name_en`, `description_he`, `description_en`
  (legacy mirror) — either shape round-trips.

## E-9. Sign-off | אישור

* `node --test test/customer/success-plan.test.js` → **61/61 pass**
* **Zero external dependencies** — only Node built-ins (`node:test`,
  `node:assert/strict`, `node:path`, `Buffer`)
* **Never-delete rule honored** — zero method removes a field, goal, risk,
  stakeholder, milestone, decision, escalation, review, or history entry.
  Terminal states (`graduated`, `closed_unsuccessful`) flip status but
  preserve every byte of the audit trail.

`Y-103 upgrade — READY FOR WIRING`

