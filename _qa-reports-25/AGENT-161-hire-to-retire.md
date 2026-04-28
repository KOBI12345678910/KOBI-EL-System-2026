# AGENT-161 — Hire-to-Retire End-to-End Trace

**Worktree:** `objective-merkle-40ff93`
**Date:** 2026-04-29
**Scope:** Hire → Onboard → Time → Payroll → Performance → Termination/Retire, with severance (פיצויי פיטורים) calculation.

The Hire-to-Retire chain has all six legs implemented as well-tested, zero-dependency modules in `onyx-procurement/src/{hr,time,payroll,pension}/` plus a workforce schema in Supabase. The pipeline-level wiring, however, is **fragmented**: each module has its own in-memory store, the orchestrator (`pipeline/orchestrator.js`) defines zero HR actions, and the canonical `state-machines.js` for `employee` has only `active → on_leave → suspended → terminated` with **no triggers**. Moves between phases (ATS-hire → workforce.employees row, offboarding-final-payroll → wage_slip, severance → form 161 → Tax Authority export) are coded inside each module but never bound together by the event bus or orchestrator.

---

## Step 1 — HIRE (ATS / requisition → offer → hired)

| Item | File:Line |
|---|---|
| ATS module (zero-dep, append-only, blind-review, anti-discrimination) | `onyx-procurement/src/hr/ats.js:1-120` |
| Stages: applied → screened → interviewed → offered → hired | `onyx-procurement/src/hr/ats.js:68-85` |
| Decision flow: `recordDecision()` flips to HIRED on ACCEPTED | `onyx-procurement/src/hr/ats.js:840-859` |
| Funnel metrics, k-anon diversity, blind PII unlock | `onyx-procurement/src/hr/ats.js:889-925` |
| Tests | `onyx-procurement/test/hr/ats.test.js` |
| Pipeline entity / state machine | `onyx-procurement/src/pipeline/state-machines.js:202-211` (no `hired` initial — only `active`) |

**Gaps**
- `recordDecision(ACCEPTED)` mutates the in-memory candidate but does **not** create a `workforce.employees` row, does **not** kick off `onboarding.startOnboarding()`, does **not** emit any event. Hand-off to onboarding is manual (no `ats:hired` event in `wiring/event-bus.js`).
- No `Form 101` (טופס 101) capture is wired between ATS `hired` and onboarding Day-1 task. Form 101 only appears as a label string in `onboarding.js:106`.
- Pipeline `entity-map.js:248-271` `employee` entity has no `applied/screened/offered` statuses — ATS lifecycle lives outside the canonical state model.

---

## Step 2 — ONBOARD (pre-board → day-1 → week-1 → month-1 → probation)

| Item | File:Line |
|---|---|
| Onboarding workflow engine | `onyx-procurement/src/hr/onboarding.js:1-30` |
| Phases (PRE_BOARDING, DAY_1, WEEK_1, MONTH_1, MONTH_3) + day offsets | `onyx-procurement/src/hr/onboarding.js:38-80` |
| Bilingual labels (Form 101, SHPAR, BL new-hire report, contract) | `onyx-procurement/src/hr/onboarding.js:88-120` |
| `startOnboarding({ employee })` entry point | `onyx-procurement/src/hr/onboarding.js:392-451` |
| Tests | `onyx-procurement/test/hr/onboarding.test.js` |

**Gaps**
- No callable contract: takes `{ employee }` but doesn't verify the employee was actually inserted in DB. There is no `onboarding-routes.js` mounting `/api/onboarding/*` (compare with `payroll-routes.js`).
- `wiring-spec.js:148-152` `employee360` page declares tabs `attendance, payroll, wage_slips, pension, expenses, hr_documents` but no `onboarding` tab — onboarding progress is invisible from Employee360.
- Probation (90d / MONTH_3) end does not auto-trigger `performance-review.scheduleReview()`. The handshake to performance is stubbed.

---

## Step 3 — TIME / Attendance

| Item | File:Line |
|---|---|
| Time-tracking core (offline-first kiosk) | `onyx-procurement/src/time/time-tracking.js:1-79` |
| Israeli labor-law constants (8h/day, 42h/week, 36h Shabbat rest, OT 125/150/175/200) | `onyx-procurement/src/time/time-tracking.js:34-66` |
| Append-only entry statuses (open/closed/voided/superseded) | `onyx-procurement/src/time/time-tracking.js:68-79` |
| Attendance state machine: draft → submitted → approved → exported_to_payroll | `onyx-procurement/src/pipeline/state-machines.js:213-226` |
| DB table `workforce.attendance` | `supabase/migrations/00000_master_schema.sql:1283-1304` |
| Workflow Flow 5 step-1/2: attend → approve | `onyx-procurement/src/pipeline/workflow-flows.js:99-103` |

**Gaps**
- The `time-tracking.js` runtime is **independent** of `workforce.attendance` — it writes to its own IndexedDB queue. There is no `flushQueue()` call site that POSTs to `/api/attendance` (route itself is missing — see `payroll-routes.js` covers wage-slips only).
- The attendance state machine `approved → exported_to_payroll` has triggers `link_to_payroll` (`state-machines.js:223-225`) but no implementation in `orchestrator.js`.

---

## Step 4 — PAYROLL (calc → approve → bank file → paid)

| Item | File:Line |
|---|---|
| Wage-slip calculator (2026 brackets, BL, health, pension, severance, study fund) | `onyx-procurement/src/payroll/wage-slip-calculator.js:1-60` |
| 2026 tax constants verified | `onyx-procurement/src/payroll/wage-slip-calculator.js:25-58` & `CONSTANTS_VERIFICATION.md` |
| REST routes: employees CRUD, wage-slips compute/approve/issue/pdf/void | `onyx-procurement/src/payroll/payroll-routes.js:145-507` |
| Payroll state machine: draft → calculated → approved → exported → paid | `onyx-procurement/src/pipeline/state-machines.js:228-243` |
| Workflow Flow 5 step-3/4: calculate → approve_and_export | `onyx-procurement/src/pipeline/workflow-flows.js:103-107` |
| DB tables `payroll_runs`, `payroll_entries`, `wage_slips` | `supabase/migrations/00000_master_schema.sql:1305-1340` |
| Workforce reconciliation + PII RLS | `supabase/migrations/00053_workforce_domain_complete.sql:1-60` |

**Gaps**
- No route exists for `POST /api/attendance` or `POST /api/payroll/runs` that wires attendance approval → payroll-run creation. The transition `approved → exported_to_payroll` is declared but unimplemented end-to-end.
- `payroll-routes.js:174-196` permits employee creation directly, bypassing `onboarding.startOnboarding`. A second source of truth.
- `wage-slip-calculator.js` does not import from `severance-tracker.js` for the 8.33% severance line — the severance contribution is computed independently in each module.

---

## Step 5 — PERFORMANCE

| Item | File:Line |
|---|---|
| Performance-review engine (templates, 360°, calibration, PIP, PDI) | `onyx-procurement/src/hr/performance-review.js:1-60` |
| PIP gate enforces שימוע הוגן (case-law: מילפלדר, נון) | `onyx-procurement/src/hr/performance-review.js:22-31` |
| Tests | `onyx-procurement/test/hr/performance-review.test.js` |

**Gaps**
- No coupling to comp/bonus pipeline: `linkToCompGrade(reviewId, gradeChange)` exists but does not dispatch to `comp-planner.js` or `bonus-calc.js`.
- No state machine entry for `performance_review` in `pipeline/state-machines.js` — the engine's draft → submitted → calibrated → archived progression isn't enforced at the platform level.
- `flagPerformanceIssue` / `triggerPIP` does **not** auto-emit to `offboarding.js`. A PIP that ends in `terminate` requires a manual handoff — risk of skipping the שימוע in the offboarding module too.

---

## Step 6 — TERMINATION / RETIRE (offboarding → final payroll → form 161)

| Item | File:Line |
|---|---|
| Offboarding engine | `onyx-procurement/src/hr/offboarding.js:1-72` |
| Reasons (voluntary/dismissal/retirement/death/layoff/relocation/end_of_contract) | `onyx-procurement/src/hr/offboarding.js:87-145` |
| Lifecycle: initiated → notice_served → assets_collected → exit_interview → final_payroll → completed | `onyx-procurement/src/hr/offboarding.js:148-168` |
| Statutory notice (חוק הודעה מוקדמת 2001) calc by tenure band | `onyx-procurement/src/hr/offboarding.js:347-401` |
| Asset return checklist + system access revocation list | `onyx-procurement/src/hr/offboarding.js:170-208` |
| Exit-interview template (15 questions, bilingual) | `onyx-procurement/src/hr/offboarding.js:252-289` |
| Tests | `onyx-procurement/test/hr/offboarding.test.js` |
| Employee state machine final: `terminated` | `onyx-procurement/src/pipeline/state-machines.js:208` |

**Gaps**
- Offboarding declares emit-only contract `severance:compute` and `form161:request` (`offboarding.js:48-52`) but `wiring/event-bus.js` has **no consumer** for those event names — the bridge is a doc-only contract.
- The שימוע (pre-dismissal hearing) flag `shimuaRequired: true` is set on dismissal/layoff but not blocked at the state-transition guard — the engine will let `initiated → notice_served` advance even without a recorded shimua.
- The `employee` pipeline state machine has no transition for `retire` — retirement reuses `terminate` (`state-machines.js:205-208`). Retirement-specific tracking (Section 161 election, pension carry-over) is invisible from the entity model.

---

## Severance (פיצויי פיטורים) — Detailed

**File:** `onyx-procurement/src/pension/severance-tracker.js` (663 lines, fully tested at `test/pension/severance-tracker.test.js`)

### Legal anchors (header, lines 12-17)
- חוק פיצויי פיטורים, תשכ״ג-1963
- סעיף 14 להסכם פנסיה חובה
- פקודת מס הכנסה — 9(7א), 161, 164
- חוזר מס הכנסה 2/2013 (טופס 161)

### 2026 constants (`severance-tracker.js:32-71`)
```
SEVERANCE_CONTRIBUTION_RATE   = 0.0833         // 8.33% = 1/12 (one month per year)
ANNUAL_EXEMPT_CEILING_NIS     = 13750          // פיצויים פטורים, indexed
SUBJECT_TO_BITUACH_LEUMI      = false
DEFAULT_MARGINAL_RATE         = 0.35
FORM_161_VERSION              = '2026-01'
REASON_RIGHTS:
  dismissal / economic_layoff / constructive_dismissal / end_of_contract → full (×1.00)
  retirement                                                              → pension (×1.00)
  death                                                                   → estate  (×1.00)
  relocation                                                              → partial (×0.50)
  resignation                                                             → limited (×0.00)
```

### Statutory formula (`severance-tracker.js:294-356`)
```
severance      = lastMonthlySalary × yearsEmployed × rightsMultiplier
fundBalance    = Σ contributions (8.33% × salary) compounded by monthly returns
employerTopUp  = max(0, severance − fundBalance)
fundSurplus    = max(0, fundBalance − severance)
totalPaid      = max(severance, fundBalance)
```

### Tax (`severance-tracker.js:382-435`)
```
exemptCeiling  = 13750 × yearsEmployed
exempt         = min(severance, exemptCeiling)
taxable        = max(0, severance − exempt)
tax            = taxable × marginalRate (default 0.35, range 0..0.5)
net            = severance − tax
bituachLeumi   = 0  (constants: SUBJECT_TO_BITUACH_LEUMI = false)
```

### Section 161 election (`severance-tracker.js:437-514`)
Returns `{ cashNow, pensionCredit, recommended }`. Heuristic: if `severance > exemptCeiling × 1.5` → recommend `pension` (defer); if no taxable amount → `cash`.

### Form 161 generation (`severance-tracker.js:516-601`)
Schema 2026-01 with employer block (ח.פ, תיק ניכויים), employee block (ת.ז, dates), termination block (reason, rightsTier), amounts block (gross, exempt, taxable, tax withheld, net), election block.

### One-shot orchestration (`severance-tracker.js:603-629`)
`terminateEmployee()` runs computeSeveranceOwed → computeTaxOnSeverance → section161Election → generateForm161 in a single call. Returns `{ severance, tax, election, form161 }`.

### Severance — Gaps
- The fund balance compounding (`getBalance`, `severance-tracker.js:201-289`) requires explicit per-period `recordContribution()` and `recordReturn()` calls — there is **no scheduled job** that nightly reads `wage_slip.severance_employer` and posts a contribution row, so production data flow is untested.
- No path from `offboarding.finalPayroll()` step into `severanceTracker.terminateEmployee()`. Each module is callable but never auto-chained.
- `Form 161` row is built in JS but never serialized to PDF/CSV; no submission client exists. Compare with `payroll/pdf-generator.js` (wage-slip PDF) which does emit a printable artifact.
- Section 14 offset (`pension/section-14.js`) tracks the 6% pension floor but does not feed into `computeSeveranceOwed` to suppress the employer top-up when a valid Section 14 letter is on file. Today the calc would double-count.
- `getBalance` reduces fund mix by contribution share but does not honour fund-mobility rollover (העברת זכויות) when an employee transfers between funds — surplus/deficit will be miscomputed for portable balances.
- Marginal-rate bound `0..0.5` (`severance-tracker.js:415-419`) excludes the 2026 50% top bracket including יסף — at the bracket boundary an exception is thrown.

---

## Cross-Cutting / Platform Gaps

1. **No HR-flow orchestrator action** — `pipeline/orchestrator.js` has zero entries for `hire`, `onboard`, `terminate`, `severance.compute`, `form161.dispatch`. The 18 executable actions described in CLAUDE.md don't include the workforce flow.
2. **Two employee sources of truth** — `payroll/payroll-routes.js:174` lets you POST `/api/payroll/employees` directly; `hr/onboarding.js:392` accepts an `{ employee }` object that may never reach DB. Real DB table `workforce.employees` (`supabase/migrations/00000_master_schema.sql:1229-1252`) is a third source.
3. **No event bus channels for HR** — `wiring/event-bus.js` has none of `ats:hired`, `onboarding:complete`, `attendance:approved`, `payroll:paid`, `offboarding:final_payroll`, `severance:computed`, `form161:generated`.
4. **Employee360 incomplete** — wiring-spec tabs miss `onboarding`, `performance`, `offboarding`, `form161`. Visible only: overview/attendance/payroll/wage_slips/pension/expenses/assignments/work_orders/hr_documents/alerts/audit_log (`wiring-spec.js:148-152`).
5. **Retire vs terminate** — pipeline state machine reuses `terminated` for both. No `retired` final state; no Section 161 election surfaced at the entity layer.
6. **Form 101 (טופס 101)** — labeled in onboarding (line 106) but no capture form, no DB table, no API.
7. **שימוע gate not enforced** — `offboarding.js:148-168` allows `initiated → notice_served` even when `REASONS[*].shimuaRequired=true` and no shimua letter recorded.
8. **Israeli labor-law constants duplicated** — `time/time-tracking.js:34` and `payroll/wage-slip-calculator.js:25` hold their own copies of OT rates, BL thresholds, and 2026 brackets. Drift risk.

---

## Summary Table

| Step | Module | Status | Critical Gap |
|---|---|---|---|
| Hire | `hr/ats.js` | Implemented + tested | No auto-create of `workforce.employees`; no event emit |
| Onboard | `hr/onboarding.js` | Implemented + tested | No REST mount; no `Form 101` table; not on Employee360 |
| Time | `time/time-tracking.js` + DB `workforce.attendance` | Implemented + tested | No flush route to DB; trigger `link_to_payroll` unimplemented |
| Payroll | `payroll/wage-slip-calculator.js` + `payroll-routes.js` | Implemented + tested + REST | Severance line not sourced from `severance-tracker` |
| Performance | `hr/performance-review.js` | Implemented + tested | Not in pipeline state machines; PIP→offboarding handoff manual |
| Terminate/Retire | `hr/offboarding.js` + `pension/severance-tracker.js` + `pension/section-14.js` | Implemented + tested | שימוע gate unenforced; no `retired` state; no Form 161 PDF/submission; no Section 14 offset in severance calc |

**Bottom line:** Every leg has a high-quality, zero-dep, bilingual, append-only ("לא מוחקים") implementation with tests. The legal coverage of severance is rigorous (formula, exempt ceiling, Section 161, Form 161). What is missing is the **glue**: the orchestrator, event bus, REST routes, and pipeline state-machine bindings that turn six modules into one Hire-to-Retire pipeline.
