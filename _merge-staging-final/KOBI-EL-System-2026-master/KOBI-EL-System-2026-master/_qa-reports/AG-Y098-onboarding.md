# AG-Y098 — Customer Onboarding Workflow Engine

**Agent**: Y-98
**Module**: `onyx-procurement/src/customer/onboarding.js`
**Tests**:  `onyx-procurement/test/customer/onboarding.test.js`
**Status**: 47/47 tests passing
**Date**:   2026-04-11
**Rule**:   לא מוחקים רק משדרגים ומגדלים — never delete, only grow

> IMPORTANT — this module is the **customer** (commercial) onboarding
> engine. It is intentionally separate from the **employee** new-hire
> onboarding in `src/hr/onboarding.js` (Agent Y-63), which is left
> untouched. Both live side-by-side.

---

## 1. Purpose

Walk a newly-signed customer through every phase of the commercial
onboarding lifecycle — from contract signature to productive use — with
task sequencing, traffic-light health scoring, risk assessment, blocker
escalation, stuck-phase detection, and a graceful handoff to ongoing
Customer Success Management (CSM).

Zero dependencies. Node >= 14. Bilingual (Hebrew RTL / English LTR).
In-memory store by default; pluggable persistence via `options.store`.

---

## 2. Phase Definitions (קליטת לקוח)

The workflow has **8 standard phases**, each with a target duration and
a "stuck" detection threshold. All phases produce task rows from
templates at record creation — they are never lost, only transitioned.

| # | Phase              | Key                | Hebrew                 | English               | Target Days | Stuck > |
|---|--------------------|--------------------|------------------------|-----------------------|-------------|---------|
| 1 | Kickoff            | `kickoff`          | פגישת פתיחה             | Kickoff               | 2           | 3       |
| 2 | Discovery          | `discovery`        | איסוף דרישות            | Discovery             | 7           | 10      |
| 3 | Setup              | `setup`            | הקמה                    | Setup                 | 10          | 14      |
| 4 | Configuration      | `configuration`    | הגדרות והתאמה           | Configuration         | 10          | 14      |
| 5 | Training           | `training`         | הדרכה                   | Training              | 7           | 10      |
| 6 | UAT                | `uat`              | בדיקות קבלה             | UAT                   | 10          | 14      |
| 7 | Go-Live            | `go_live`          | עלייה לאוויר             | Go-Live               | 3           | 5       |
| 8 | 30-day Review      | `review_30d`       | סקירת 30 יום             | 30-day review         | 30          | 30      |

Each phase has mandatory and optional tasks (see
`PHASE_TASK_TEMPLATES`). Advance between phases is gated: mandatory
tasks must be DONE unless `advancePhase(..., { force: true })` is
called.

### Per-phase tasks (mandatory = ✓, optional = ○)

**Kickoff**
- ✓ `kickoff_schedule`     / תיאום פגישת פתיחה / Schedule kickoff
- ✓ `kickoff_agenda`       / הכנת סדר-יום / Prepare agenda
- ✓ `kickoff_stakeholders` / מיפוי בעלי עניין / Map stakeholders
- ✓ `kickoff_charter`      / צ׳רטר פרויקט / Project charter

**Discovery**
- ✓ `discovery_questions`    / שאלון גילוי דרישות / Discovery questionnaire
- ✓ `discovery_interview`    / ראיונות בעלי עניין / Stakeholder interviews
- ✓ `discovery_data_audit`   / בדיקת נתונים / Data audit
- ✓ `discovery_workflows`    / מיפוי תהליכים / Workflow mapping
- ○ `discovery_integrations` / זיהוי אינטגרציות / Integration mapping

**Setup**
- ✓ `setup_tenant`    / הקמת סביבה / Provision tenant
- ✓ `setup_accounts`  / יצירת משתמשים / Accounts & roles
- ✓ `setup_data_mig`  / העברת נתונים / Data migration
- ○ `setup_dns`       / הגדרות DNS / DNS setup
- ○ `setup_sso`       / חיבור SSO / SSO integration
- ✓ `setup_backup`    / גיבוי ושחזור / Backup & restore

**Configuration**
- ✓ `config_product`      / התאמת המוצר / Product config
- ✓ `config_workflows`    / תהליכי עבודה / Workflow config
- ✓ `config_templates`    / תבניות ומסמכים / Templates
- ○ `config_integrations` / חיבור מערכות / Integrations
- ○ `config_branding`     / מיתוג / Branding

**Training**
- ✓ `training_admin`  / הדרכת מנהלים / Admin training
- ✓ `training_users`  / הדרכת משתמשים / End-user training
- ✓ `training_docs`   / חומרי עזר / Docs & FAQ
- ○ `training_record` / הקלטת הדרכות / Recordings

**UAT**
- ✓ `uat_plan`    / תכנית UAT / UAT plan
- ✓ `uat_cases`   / תסריטי בדיקה / Test cases
- ✓ `uat_exec`    / ביצוע UAT / Execution
- ✓ `uat_signoff` / אישור UAT / Sign-off

**Go-Live**
- ✓ `golive_freeze`   / הקפאת שינויים / Change freeze
- ✓ `golive_cutover`  / Cutover / Cutover
- ✓ `golive_monitor`  / ניטור / Monitoring
- ✓ `golive_rollback` / Rollback / Rollback plan
- ✓ `golive_comms`    / תקשורת / User comms

**30-day Review**
- ✓ `review_metrics` / סקירת מדדים / Metrics review
- ✓ `review_health`  / שיחת בריאות / Health call
- ✓ `review_handoff` / העברה ל-CSM / Handoff
- ○ `review_retro`   / תחקיר פנימי / Internal retro

---

## 3. Public API

### Class: `CustomerOnboarding`

Constructor options:
```js
new CustomerOnboarding({
  store?:  { save, get, all, listByStatus },  // default = memory
  now?:    () => Date,                        // test clock injection
  logger?: { info, warn, error },
})
```

### Methods

| Method | Purpose |
|---|---|
| `initiateOnboarding({customerId, product, package, owner, startDate, targetGoLiveDate})` | Create a new onboarding record, materialising all 8 phases & tasks. |
| `kickoffMeeting(onboardingId, { scheduledAt?, attendees?, durationMinutes? })` | Schedule a kickoff with a 7-item bilingual agenda. |
| `collectRequirements(onboardingId, requirements)` | Apply answers to the 20-item discovery questionnaire. Reports `{answered, missing, complete}`. |
| `setupTasks(onboardingId)` | Stagger due dates across the SETUP window and assign to owner. |
| `configureProduct(onboardingId, config)` | Store per-customer config and auto-complete matching CONFIGURATION tasks. |
| `trainingSessions({onboardingId, participants, sessions})` | Schedule one or more training sessions; marks TRAINING tasks in progress. |
| `uatChecklist(onboardingId)` | Initialise (or return) the 13-item UAT checklist. |
| `updateUatItem(onboardingId, itemId, passed, note?)` | Mark an individual UAT item. |
| `goLiveChecklist(onboardingId)` | Initialise (or return) the 14-item go-live gate list. |
| `updateGoLiveItem(onboardingId, itemId, done, note?)` | Mark an individual go-live gate. |
| `goLiveReady(onboardingId)` | Returns `{ready, openGates[]}` — all gates must be DONE. |
| `successMetrics({onboardingId, metrics})` | Merge default KPI catalog with customer-specific targets. |
| `riskAssessment(onboardingId)` | Scan for known risk patterns; append-only to `record.risks`. |
| `blockerEscalation(onboardingId, blocker)` | Raise a blocker, derive escalation level, optionally flip status to ESCALATED. |
| `daysInPhase(onboardingId)` | Days spent in current phase (stuck detection). |
| `onboardingHealth(onboardingId)` | Traffic-light (green/yellow/red) scorecard with reasons. |
| `handoffToSuccess(onboardingId, csmId, opts?)` | Transition to CSM; requires go-live + 30-day review tasks DONE unless `force: true`. |
| `advancePhase(onboardingId, opts?)` | Move to next phase; refuses if mandatory tasks still open. |
| `completeTask(onboardingId, phase, taskId, by, note?)` | Mark an individual task done. |
| `getOnboarding(onboardingId)` | Fetch current record from store. |

### Exported constants
`PHASES`, `PHASE_ORDER`, `TASK_STATUS`, `ONBOARDING_STATUS`, `HEALTH`,
`RISK_LEVEL`, `ESCALATION_LEVEL`, `LABELS`, `PHASE_TASK_TEMPLATES`,
`DISCOVERY_QUESTIONNAIRE`, `UAT_CHECKLIST_TEMPLATE`,
`GO_LIVE_CHECKLIST_TEMPLATE`, `DEFAULT_SUCCESS_METRICS`,
`RISK_CATALOG`, `PHASE_STUCK_THRESHOLD_DAYS`, `PHASE_TARGET_DAYS`.

### Exported helpers
`createMemoryStore()`, `computeCurrentPhase()`, `phaseIndex()`,
`nextPhase()`.

---

## 4. Health Criteria (Green / Yellow / Red)

`onboardingHealth(onboardingId)` returns:

```
{
  color:  'green' | 'yellow' | 'red',
  label:  { he, en },
  stuckDays, phase,
  reasons: [ { code, ... } ],
  activeRisks, activeBlockers, activeEscalations,
  computedAt,
}
```

### RED (any of)
| Code | Trigger |
|---|---|
| `critical_risk`        | ≥1 risk at `RISK_LEVEL.CRITICAL` |
| `high_escalation`      | ≥1 active escalation at `L3_DIR` or `L4_EXEC` |
| `severely_stuck`       | `daysInPhase > 2 × phase threshold` |
| `go_live_missed`       | `now > targetGoLiveDate` and status not completed/handed_off |

### YELLOW (any of, if not RED)
| Code | Trigger |
|---|---|
| `high_risk`            | ≥1 risk at `RISK_LEVEL.HIGH` |
| `stuck`                | `daysInPhase > phase threshold` |
| `overdue_task`         | ≥1 mandatory task past its `dueAt` |
| `open_escalation`      | ≥1 active escalation at any level |

### GREEN
None of the above. Fresh records immediately after creation return
GREEN with `stuckDays = 0`.

---

## 5. Escalation Rules

Four-tier ladder — every blocker raised via `blockerEscalation()`
produces one escalation row. Existing blockers / escalations are
**never deleted** (append-only history).

| Level        | Hebrew                         | English                         |
|--------------|--------------------------------|---------------------------------|
| `L1_OWNER`   | אחראי אונבורדינג                | Onboarding owner                |
| `L2_LEAD`    | ראש צוות הצלחת לקוח             | CS team lead                    |
| `L3_DIR`     | מנהל/ת הצלחת לקוח               | CS director                     |
| `L4_EXEC`    | הנהלה / ועדת היגוי              | Executive / steering committee  |

### Derivation algorithm
```
severity = blocker.severity ∈ { low, medium, high, critical }
activeBlockers = count of previously-open blockers on this record

if severity == CRITICAL             → L4_EXEC
elif severity == HIGH  || ≥2 active → L3_DIR
elif severity == MEDIUM || ≥1 active → L2_LEAD
else                                 → L1_OWNER
```

Side-effect: if the derived level is L2 or higher, the onboarding
status flips from `ACTIVE` → `ESCALATED`. Status never reverses
automatically (manual resolution kept for traceability).

### Risk levels

| Level      | Hebrew    | English   |
|------------|-----------|-----------|
| `low`      | נמוך       | Low       |
| `medium`   | בינוני     | Medium    |
| `high`     | גבוה       | High      |
| `critical` | קריטי      | Critical  |

### Risk catalog (auto-identified patterns)

| id                   | Hebrew                                   | Default level |
|----------------------|------------------------------------------|---------------|
| `late_data`          | נתונים המגיעים באיחור                     | HIGH          |
| `missing_sme`        | חוסר זמינות SME                          | HIGH          |
| `scope_creep`        | זחילת דרישות                             | MEDIUM        |
| `integration_delay`  | עיכוב אינטגרציה                          | HIGH          |
| `stakeholder_misalign` | חוסר יישור קו בין בעלי עניין          | MEDIUM        |
| `training_noshow`    | היעדרות מהדרכות                          | MEDIUM        |
| `uat_fail`           | כישלון UAT                               | CRITICAL      |
| `legal_blocker`      | חסם משפטי                                | CRITICAL      |
| `budget_overrun`     | חריגה מתקציב                             | HIGH          |
| `stuck_phase`        | שלב תקוע                                 | HIGH / CRIT   |

Stuck-phase risks escalate from HIGH → CRITICAL once
`daysInPhase > 2 × threshold`.

---

## 6. Hebrew Glossary (מונחון עברי)

| Hebrew                         | English                                    | Module term             |
|--------------------------------|--------------------------------------------|-------------------------|
| קליטת לקוח                      | Customer onboarding                        | (module purpose)        |
| פגישת פתיחה                     | Kickoff meeting                            | `PHASES.KICKOFF`        |
| איסוף דרישות                    | Discovery / requirements gathering         | `PHASES.DISCOVERY`      |
| הקמה                            | Setup / provisioning                       | `PHASES.SETUP`          |
| הגדרות והתאמה                   | Configuration / customization              | `PHASES.CONFIGURATION`  |
| הדרכה                           | Training                                   | `PHASES.TRAINING`       |
| בדיקות קבלה                     | User acceptance testing (UAT)              | `PHASES.UAT`            |
| עלייה לאוויר                     | Go-Live                                    | `PHASES.GO_LIVE`        |
| סקירת 30 יום                     | 30-day review                              | `PHASES.REVIEW_30D`     |
| צ׳רטר פרויקט                     | Project charter                            | `kickoff_charter`       |
| שאלון גילוי                      | Discovery questionnaire                    | `DISCOVERY_QUESTIONNAIRE` |
| העברת נתונים                     | Data migration                             | `setup_data_mig`        |
| חיבור SSO                        | SSO integration                            | `setup_sso`             |
| גיבוי ושחזור                     | Backup & restore                           | `setup_backup`          |
| Cutover                         | Cutover                                    | `golive_cutover`        |
| Rollback                        | Rollback                                   | `golive_rollback`       |
| ניטור פוסט-לייב                  | Post-live monitoring                       | `golive_monitor`        |
| הקפאת שינויים                    | Change freeze                              | `golive_freeze`         |
| CSM / הצלחת לקוח                 | Customer Success Management                | `handoffToSuccess`      |
| בעלי עניין                       | Stakeholders                               | `kickoff_stakeholders`  |
| SME / מומחה נושא                 | Subject-matter expert                      | `missing_sme` risk      |
| אסקלציה                          | Escalation                                 | `ESCALATION_LEVEL`      |
| חסם                              | Blocker                                    | `blockerEscalation`     |
| סיכון                            | Risk                                       | `riskAssessment`        |
| תקוע                             | Stuck                                      | `daysInPhase`           |
| ירוק / צהוב / אדום               | Green / Yellow / Red                       | `HEALTH`                |
| שביעות רצון                       | CSAT / satisfaction                        | `csat_score` metric     |
| זמן עד ערך                        | Time to value                              | `time_to_value` metric  |

---

## 7. Test Coverage

Run:
```
cd onyx-procurement
node --test test/customer/onboarding.test.js
```

**Result: 47/47 passing, 0 failing.**

### Coverage matrix

| Area                         | Tests |
|------------------------------|-------|
| Constants & structure        | 4     |
| Initiation + validation      | 3     |
| Kickoff meeting              | 1     |
| Discovery / requirements     | 3     |
| Setup                        | 1     |
| Configuration                | 2     |
| Training sessions            | 2     |
| UAT checklist + updates      | 3     |
| Go-Live gates                | 2     |
| Success metrics              | 2     |
| Phase progression            | 3     |
| Days in phase / stuck        | 2     |
| Risk assessment              | 3     |
| Blocker escalation           | 4     |
| Health status (green/yel/red)| 5     |
| Handoff to CSM               | 4     |
| Never-delete rule / audit    | 3     |

---

## 8. Never-Delete Compliance

Mandatory rule: **לא מוחקים רק משדרגים ומגדלים**.

- ✓ `createMemoryStore()` exposes no `delete()` method — verified by test.
- ✓ Task state transitions go PENDING → IN_PROGRESS → DONE | BLOCKED | OVERDUE | SKIPPED | CANCELLED — the latter two are soft terminations preserving audit history.
- ✓ Blockers array is append-only. Resolving a blocker sets `active = false` and `resolvedAt` but keeps the row.
- ✓ Escalations array is append-only (same model).
- ✓ Risks array is append-only — `riskAssessment()` is idempotent and never re-fires identical risks.
- ✓ Phase `history[]` accumulates entered/exited events, never overwrites.
- ✓ Task `history[]` accumulates every status transition with `from`, `to`, `at`, `by`, `note`.
- ✓ Record top-level `history[]` accumulates lifecycle events (initiated, phase_changed, handed_off, completed).
- ✓ Handoff to CSM sets `status = HANDED_OFF` — the record stays queryable forever.
- ✓ This report itself is never to be deleted; future revisions append.

---

## 9. Relation to Y-063 (Employee Onboarding)

- `src/hr/onboarding.js` → **employee** onboarding (Form 101, Bituach Leumi, training fund, etc.) — Agent Y-63.
- `src/customer/onboarding.js` → **customer / commercial** onboarding — Agent Y-98 (this module).

Both modules coexist. Neither replaces nor extends the other. The ERP
rule is satisfied: we grew the system with a new flow; we did not
touch the existing one.

---

## 10. Future Extensions (growth roadmap)

- PDF export of kickoff agenda & UAT sign-off sheet (bilingual).
- Gantt-view DTO over the phase timeline for UI components.
- Slack / email hooks on escalation tier changes.
- SLA breach metrics feeding the company-wide BI dashboard.
- Multi-tenant segmentation so partners can run onboarding on behalf of resellers.
- Handoff success-prediction model (ML stub).

All extensions will land as *new* methods and *new* constants — no
existing shape will be removed.
