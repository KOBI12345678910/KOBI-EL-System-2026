# AG-Y100 — Churn Prevention Engine | מנוע מניעת נטישה

**Agent:** Y-100
**Module:** `onyx-procurement/src/customer/churn-prevention.js`
**Tests:** `onyx-procurement/test/customer/churn-prevention.test.js`
**Date:** 2026-04-11
**Status:** GREEN — 65/65 tests pass (0 failures)
**House rule:** `לא מוחקים רק משדרגים ומגדלים` — never delete, always upgrade and grow.
**Complements:** X-06 churn predictor (`onyx-procurement/src/analytics/churn-predictor.js`).

---

## 1. Scope | תחום

**EN:** An operational retention engine that sits on top of the X-06 churn
*predictor*. Where the predictor answers *"who is likely to leave?"*, this
module answers *"what do we do about it, who owns each step, did it work,
and was it worth it?"* — signals, playbooks, save campaigns, saves vs
losses, exit interviews, win-back flows, closed-loop reporting.

**HE:** מנוע שימור תפעולי שמונח על גבי ה-*חיזוי* (X-06). בעוד שהחיזוי עונה
על "מי עומד לעזוב?", המודול הזה עונה על "מה עושים? מי אחראי על כל שלב?
האם זה עבד? כמה זה היה שווה?" — אותות, פלייבוקים, קמפייני שימור,
הצלות מול אובדנים, ראיונות פרידה, זרימות החזרת לקוח ודיווח סגירת מעגל.

All signals, executions, step logs, offers, saves, losses, exit interviews,
loop statuses and legacy intervention records are **append-only**. The module
preserves the original Swarm-4 API as legacy shims alongside the new Y-100
API — nothing was removed, only upgraded.

---

## 2. The seven canonical triggers | שבעת הטריגרים הקנוניים

| # | Trigger (EN)                    | טריגר (HE)              | Default severity | Default playbook ID          |
|---|---------------------------------|-------------------------|------------------|------------------------------|
| 1 | `health-score-drop`             | ירידה בציון בריאות        | `high`           | `pb-health-drop`             |
| 2 | `nps-detractor`                 | לקוח NPS שלילי           | `medium`         | `pb-nps-detractor`           |
| 3 | `payment-late`                  | תשלום באיחור              | `high`           | `pb-payment-late`            |
| 4 | `support-escalation`            | הסלמה בתמיכה              | `high`           | `pb-support-escalation`      |
| 5 | `contract-end-approaching`      | סיום חוזה מתקרב            | `critical`       | `pb-contract-end`            |
| 6 | `usage-decline`                 | ירידה בשימוש               | `medium`         | `pb-usage-decline`           |
| 7 | `contact-change`                | החלפת איש קשר              | `medium`         | `pb-contact-change`          |

Severity weights used by `churnRisk()`:
`low = 1 · medium = 3 · high = 6 · critical = 10`

---

## 3. Playbook anatomy | אנטומיית פלייבוק

A playbook is the single runbook that attaches to a trigger. When a signal
fires, `triggerPlaybook(customerId, trigger)` instantiates an execution
record for the customer, attaches the playbook's steps, and opens a step
log. Every step is recorded append-only.

### Shape | מבנה

```js
{
  id:            'pb-health-drop',          // unique id
  trigger:       'health-score-drop',        // one of the 7 canonical triggers
  severity:      'high',                     // low | medium | high | critical
  owner:         'customer_success_manager', // role or email
  successMetric: 'health_score_recovered_to_70',
  label_he:      'החייאת ציון בריאות',
  label_en:      'Health Score Recovery',
  steps: [
    { id: 'hs1', label_he: 'זיהוי סיבת הירידה',  label_en: 'Identify root cause',  owner: 'csm' },
    { id: 'hs2', label_he: 'שיחת CSM עם הלקוח',  label_en: 'CSM outreach call',    owner: 'csm' },
    { id: 'hs3', label_he: 'הצעת תכנית החייאה', label_en: 'Offer recovery plan',  owner: 'csm' },
    { id: 'hs4', label_he: 'מעקב שבועי',          label_en: 'Weekly follow-up',    owner: 'csm' }
  ]
}
```

### Lifecycle | מחזור חיים

1. **`definePlaybook(...)`** — registered (or upgraded — never replaced).
2. **`registerSignal(...)`** — a risk signal hits the append-only log.
3. **`churnRisk(customerId)`** — weighted 0..100 score recomputed on-demand.
4. **`triggerPlaybook(customerId, trigger)`** — execution instantiated with SLA.
5. **`executeStep({playbookExecutionId, stepId, outcome, notes, by})`** — step audit log grows.
6. **`saveOffer(...)`** — retention offer issued (one of four kinds below).
7. **`recordSave(...)`** / **`recordLoss(...)`** — terminal state recorded.
8. **`closeLoop(customerId, status)`** — `saved` | `churned` | `pending`.

### SLA per severity (inherited from legacy `PLAYBOOK` constant) | SLA לפי חומרה

| Severity | SLA hours | Owner role (default)   |
|----------|-----------|------------------------|
| low      | 48        | account_manager        |
| medium   | 24        | account_manager        |
| high     | 8         | executive_sponsor      |
| critical | 2         | save_team              |

### Intervention cost (ILS) | עלות התערבות (ש"ח)

| Severity | Cost (ILS) |
|----------|-----------:|
| low      |        250 |
| medium   |      1,200 |
| high     |      4,500 |
| critical |     12,000 |

---

## 4. Save offer types | סוגי הצעות שימור

`saveOffer({customerId, offer, expiresAt, approvedBy})` accepts four kinds:

| Kind            | EN                  | HE                | Typical use                                       |
|-----------------|---------------------|-------------------|---------------------------------------------------|
| `discount`      | Renewal discount    | הנחה על חידוש      | 10%–30% off renewal to fight price objection      |
| `upgrade`       | Free tier upgrade   | שדרוג חינם         | Jump the customer one tier up for 3–6 months       |
| `free-period`   | Free billing period | תקופת חינם          | Waive 1–2 billing cycles to cover an outage / fix |
| `waiver`        | Fee waiver          | ויתור על חיובים    | Drop late-payment penalties, implementation fees  |

Offers are validated — any `kind` outside the enum throws a `TypeError`.
Each offer record carries the approver (`approvedBy`) and an optional
`expiresAt`, plus a status (`offered` initially).

---

## 5. Signals, risk & decay | אותות, סיכון ודעיכה

`registerSignal({customerId, type, value, timestamp})`

* **Append-only.** Signals are never overwritten; `value` can be anything
  JSON-safe (a number, an object, a string).
* **Auto-severity.** If the caller doesn't specify, the canonical trigger
  map assigns severity (e.g. `payment-late → high`).

`churnRisk(customerId)` weighted aggregation:

```
score = min(100, Σ SEVERITY_WEIGHT[sev] * decay(age_days) * 8)

decay(age_days) =
    1.00   if age ≤ 30
    0.75   if 30 < age ≤ 60
    0.50   if 60 < age ≤ 180
    0      if age > 180   // fully expired
```

Thresholds used by `scoreToLevel(score)`:

| Range      | Level      |
|------------|------------|
| 0          | `none`     |
| 1–29       | `low`      |
| 30–59      | `medium`   |
| 60–79      | `high`     |
| 80–100     | `critical` |

---

## 6. Retention metrics | מדדי שימור

`retentionMetrics({period?})` returns:

```
{
  total_attempts:    saves + losses
  saves, losses
  save_rate_pct:     (saves / total_attempts) * 100
  revenue_saved_ils: Σ over saves
  revenue_lost_ils:  Σ over losses
  offers_made
  executions_opened
  cost_ils:          Σ INTERVENTION_COST_ILS per opened execution severity
  net_ils:           revenue_saved - cost
  roi_pct:           (net / cost) * 100
  top_loss_reasons:  sorted descending
  labels:            bilingual HE + EN label map
}
```

Example (from test `Y100: retentionMetrics — save rate, ROI, and top loss reasons`):

```
saves = 2  (80,000 ILS)
losses = 1 (45,000 ILS)
executions_opened = 1 @ severity high → cost = 4,500 ILS
save_rate_pct = 66.67
net_ils = 75,500
roi_pct = 1,677.78
top_loss_reasons = [{reason: 'price', count: 1}]
```

---

## 7. Closed-loop status | סגירת מעגל

`closeLoop(customerId, status)` with three states:

| Status     | EN       | HE        |
|------------|----------|-----------|
| `saved`    | Saved    | ניצל      |
| `churned`  | Churned  | נטש       |
| `pending`  | Pending  | ממתין     |

Invoking `closeLoop` **does not delete** earlier loop entries — the full
history is preserved in `loopHistory(customerId)`. `customerStatus(...)`
returns the latest entry (or synthesised `pending` for unknown IDs).

When `closeLoop(..., 'saved')` fires it also auto-closes any open playbook
execution or legacy intervention for that customer, attaching the outcome.

---

## 8. Exit interview | ראיון פרידה

`exitInterview({customerId, feedback, rating, wouldReturn})` records
structured departure feedback with six bilingual questions:

| Key              | HE                            | EN                                  |
|------------------|-------------------------------|-------------------------------------|
| `primary_reason` | מהי הסיבה המרכזית לעזיבה?      | What is the primary reason for leaving? |
| `improvements`   | מה היינו צריכים לשפר?            | What should we have improved?       |
| `alternatives`   | לאיזה פתרון אתם עוברים?          | What solution are you moving to?    |
| `positives`      | מה אהבת אצלנו?                   | What did you enjoy about us?        |
| `return`         | האם תשקול לחזור בעתיד?           | Would you consider returning?       |
| `recommendation` | האם תמליץ עלינו לאחרים?          | Would you recommend us?             |

`rating` is clamped to 0..5. `wouldReturn` is coerced to boolean.

---

## 9. Win-back campaigns | קמפייני החזרת לקוח

`winBackCampaign({segmentId, touchpoints, duration})` creates a re-engagement
flow for already-churned customers grouped by segment. Each campaign stores
an ordered list of touchpoints (email-1, email-2, call, gift, …), a duration
in days, and a bilingual message (`message_he` + `message_en`) rendered
RTL-friendly.

---

## 10. Hebrew glossary | מילון עברי

All UI-facing terms are exposed through the frozen `GLOSSARY` export:

| key                            | HE                      | EN                      |
|--------------------------------|-------------------------|-------------------------|
| `churn`                        | נטישה                    | Churn                   |
| `prevention`                   | מניעה                    | Prevention              |
| `intervention`                 | התערבות                  | Intervention            |
| `signal`                       | אות אזהרה                | Signal                  |
| `playbook`                     | פלייבוק                  | Playbook                |
| `trigger`                      | טריגר                    | Trigger                 |
| `step`                         | שלב                      | Step                    |
| `owner`                        | אחראי                    | Owner                   |
| `save_rate`                    | אחוז הצלה                | Save Rate               |
| `save_offer`                   | הצעת שימור               | Save Offer              |
| `win_back`                     | החזרת לקוח               | Win-Back                |
| `exit_interview`               | ראיון פרידה              | Exit Interview          |
| `retention`                    | שימור                    | Retention               |
| `roi`                          | תשואה על ההשקעה          | ROI                     |
| `loss_reason`                  | סיבת אובדן               | Loss Reason             |
| `competitor`                   | מתחרה                    | Competitor              |
| `closed_loop`                  | סגירת מעגל               | Closed Loop             |
| `status_saved`                 | נוצל                     | Saved                   |
| `status_churned`               | נטש                      | Churned                 |
| `status_pending`               | ממתין                    | Pending                 |
| `offer_discount`               | הנחה                     | Discount                |
| `offer_upgrade`                | שדרוג                    | Upgrade                 |
| `offer_free`                   | תקופת חינם               | Free Period             |
| `offer_waiver`                 | ויתור                    | Waiver                  |
| `severity_low`                 | נמוכה                    | Low                     |
| `severity_medium`              | בינונית                  | Medium                  |
| `severity_high`                | גבוהה                    | High                    |
| `severity_critical`            | קריטית                   | Critical                |
| `trigger_health_drop`          | ירידה בציון בריאות         | Health Score Drop       |
| `trigger_nps_detractor`        | לקוח NPS שלילי            | NPS Detractor           |
| `trigger_payment_late`         | תשלום באיחור                | Payment Late            |
| `trigger_support_escalation`   | הסלמה בתמיכה                | Support Escalation      |
| `trigger_contract_end`         | סיום חוזה מתקרב              | Contract End Approaching|
| `trigger_usage_decline`        | ירידה בשימוש                 | Usage Decline           |
| `trigger_contact_change`       | החלפת איש קשר                | Contact Change          |
| `outcome_saved`                | ניצל                        | Saved                   |
| `outcome_churned`              | נטש                         | Churned                 |
| `outcome_downgraded`           | שודרג למטה                  | Downgraded              |
| `outcome_escalated`            | הוסלם                        | Escalated               |

---

## 11. Test matrix | מטריצת בדיקות

**Command:**

```bash
cd onyx-procurement && node --test test/customer/churn-prevention.test.js
```

**Result:** `tests 65 · pass 65 · fail 0 · duration_ms ~127`

### New Y-100 API tests (33)

| # | Test                                                                          |
|---:|-------------------------------------------------------------------------------|
| 1 | Y100: TRIGGERS exposes exactly the seven canonical triggers                    |
| 2 | Y100: constructor seeds a default playbook per trigger                         |
| 3 | Y100: definePlaybook registers a new playbook and upgrades existing            |
| 4 | Y100: definePlaybook throws on missing id or trigger                           |
| 5 | Y100: registerSignal appends to the log and is visible via listSignals         |
| 6 | Y100: registerSignal — missing customerId/type throws                          |
| 7 | Y100: churnRisk — zero when no signals                                         |
| 8 | Y100: churnRisk — weighted aggregation grows with severity                     |
| 9 | Y100: churnRisk — capped at 100                                                |
| 10 | Y100: churnRisk — older signals decay, very old are ignored                   |
| 11 | Y100: riskBreakdown returns explanation for UI                                 |
| 12 | Y100: triggerPlaybook fires matching playbook and returns an execution         |
| 13 | Y100: triggerPlaybook — unknown trigger returns null                           |
| 14 | Y100: triggerPlaybook — does not duplicate open executions for same customer   |
| 15 | Y100: executeStep appends to step log and bumps completed counter on done      |
| 16 | Y100: executeStep — unknown execution throws                                   |
| 17 | Y100: saveOffer records a retention offer with kind validation                 |
| 18 | Y100: saveOffer — all four offer kinds accepted                                |
| 19 | Y100: saveOffer — invalid kind throws                                          |
| 20 | Y100: recordSave stores successful retention and listSaves returns it          |
| 21 | Y100: recordLoss stores failed retention with competitor and value             |
| 22 | Y100: recordSave & recordLoss — missing customerId throws                      |
| 23 | Y100: exitInterview captures structured feedback with bilingual questions      |
| 24 | Y100: exitInterview — rating clamped to 0..5                                   |
| 25 | Y100: winBackCampaign creates a re-engagement campaign record                  |
| 26 | Y100: retentionMetrics — save rate, ROI, and top loss reasons                  |
| 27 | Y100: retentionMetrics — empty ledger returns 0% save rate and 0 ROI           |
| 28 | Y100: closeLoop writes status and preserves history (never deletes)            |
| 29 | Y100: closeLoop — saved outcome also closes any open execution for customer    |
| 30 | Y100: closeLoop — invalid status throws, valid states enumerated               |
| 31 | Y100: customerStatus returns pending for unknown customer                      |
| 32 | Y100: end-to-end — signal drives risk, playbook fires, save closes loop        |
| 33 | Y100: scoreToLevel helper maps score ranges to level names                     |

### Legacy Swarm-4 tests (32, all preserved and still green)

`defineSignals`, `recordSignal`, `detectAtRisk`, `interventionPlaybook`,
`openIntervention`, `recordAction`, `closeIntervention`, `saveRate`,
`preventionROI`, `winBack`, `churnDebriefing`, `alertExecutive`,
`communicateToTeam`, `listInterventions`, `exportJson/importJson`, and the
`GLOSSARY` / `CLOSE_OUTCOMES` exports.

---

## 12. Compliance checklist | רשימת תקינות

| Rule                                                      | Status |
|-----------------------------------------------------------|--------|
| `לא מוחקים רק משדרגים ומגדלים` (append-only everywhere)   | PASS   |
| Zero external dependencies — Node built-ins only          | PASS   |
| Hebrew RTL + bilingual labels on every user-facing field  | PASS   |
| At least 18 tests in `churn-prevention.test.js`           | PASS (65) |
| `node --test` passes green                                | PASS   |
| Seven canonical triggers supported                        | PASS   |
| Four save-offer kinds validated                           | PASS   |
| Legacy API preserved (backward-compatible)                | PASS   |

---

## 13. Files touched | קבצים שנגעו

* `onyx-procurement/src/customer/churn-prevention.js` — upgraded to expose
  the new Y-100 API alongside the preserved legacy Swarm-4 API.
* `onyx-procurement/test/customer/churn-prevention.test.js` — 33 new
  Y-100 tests appended; all 32 legacy tests remain in place.
* `_qa-reports/AG-Y100-churn-prevention.md` — this report.

---

**End of AG-Y100 report.** Signed, Agent Y-100 / Techno-Kol Uzi mega-ERP /
2026-04-11.
