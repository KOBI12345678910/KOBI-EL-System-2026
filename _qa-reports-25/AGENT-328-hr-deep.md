# AGENT-328 — HR Module Deep Audit & IL Labor-Law Compliance

**Worktree:** `objective-merkle-40ff93`
**Date:** 2026-04-29
**Scope:** `hr_employees, hr_departments, hr_positions, hr_payroll_runs, hr_payslips, hr_leave_requests, hr_attendance, hr_performance_reviews` plus IL statutory: severance (פיצויי פיטורים), sick pay (דמי מחלה), vacation balance (חופשה שנתית), study fund (קרן השתלמות), pension (פנסיה).
**References:** AGENT-38 (not located in repo), AGENT-161 (Hire-to-Retire trace), AGENT-04 (payroll runtime), AGENT-309 (DB integrity), AGENT-220 (FK indexes).

**Verdict:** RED. Two parallel HR data models coexist (`workforce.*` schema vs. `public.hr_*` overlay) with **zero glue between them**. Application code reads/writes only `workforce.*`; the `public.hr_*` tables exist live in Supabase (per AGENT-309 advisor scan) but have **no migration source** in this repo, no API code, no calculator coupling. Critical IL statutory functions (vacation accrual, sick-pay ladder, leave balance, performance-review state machine) are stubs or mislabeled.

---

## 1. Two-namespace problem (CRITICAL)

| Table requested in scope | Schema actually shipped | Migration file |
|---|---|---|
| `hr_employees` | `workforce.employees` (1229) **and** `public.hr_employees` (live only) | master 00000:1229 / overlay (no DDL in repo, only indexes 00072/00075) |
| `hr_departments` | **NOT IMPLEMENTED** in either namespace; `workforce.employees.department text` only | none |
| `hr_positions` | **NOT IMPLEMENTED** in either namespace; `workforce.employees.role_title text` only | none |
| `hr_payroll_runs` | `workforce.payroll_runs` | 00000:1305 |
| `hr_payslips` | `workforce.wage_slips` (`+ payroll_entries`); `public.hr_payslips` (live only) | 00000:1340 |
| `hr_leave_requests` | `workforce.leave_requests`; `public.hr_leave_requests` (live only) | 00011:473 |
| `hr_attendance` | `workforce.attendance`; **no** `public.hr_attendance` in indexes | 00000:1283 |
| `hr_performance_reviews` | **No DB table** (engine is in-memory `hr/performance-review.js`); `public.hr_performance_reviews` (live only) | none |

**Evidence of the orphaned `public.hr_*` overlay:**
- `supabase/migrations/00072_tenant_id_columns_and_indexes.sql:167-168, 279` writes to `public.hr_payslips`, `public.hr_leave_requests`, `public.hr_performance_reviews`.
- `supabase/migrations/00075_fk_indexes.sql:147-154` adds 8 indexes against `public.hr_employees / hr_payslips / hr_leave_requests / hr_performance_reviews` columns (`department_id`, `manager_id`, `period_id`, `approver_id`, `reviewer_id`).
- AGENT-309 confirmed live: 231 base tables, advisor cites `hr_employees.manager_id`, `hr_employees.state` (free text, no CHECK).
- **Zero `CREATE TABLE` for `public.hr_*` exists in any migration in this repo** — they were created out-of-band (likely by the multi-tenant overlay batch in `_merge-incoming/`).
- App code (`api-server/src/routes/ai-document-intelligence-engine.ts:137,308,311`) addresses `hr_employees` directly — coupling the doc-intelligence pipeline to a table the rest of the ERP cannot see.

**Severity: CRITICAL.** Drift is silent: writes to `workforce.employees` never propagate to `public.hr_employees`; queries against the overlay miss the canonical PII columns guarded by `00053_workforce_domain_complete.sql:435-445`.

**Fix:** decide one. Either (a) drop `public.hr_*`, redirect the document-intelligence route to `workforce.employees`; or (b) ship a migration that creates `public.hr_*` as **views over `workforce.*`** so reads converge.

---

## 2. Per-table audit (canonical `workforce.*` view)

### 2.1 `workforce.employees` (`00000:1229-1252`, RLS at `00053:392-429`)
**Columns:** `id, public_id, employee_number UNIQUE, full_name, phone, email, employer_id FK, role_title, department, employment_type, hourly_rate, salary_base, status DEFAULT 'Active', start_date, end_date, national_id (PII), bank_account_reference (PII), created_at, updated_at, created_by, updated_by, deleted_at`
**Strengths:** PII flagged via `COMMENT ON COLUMN` (00053:435-445); RLS enabled; soft-delete column present (rare across this codebase per AGENT-309 #1).
**Gaps:**
- `status` is **free text** with no CHECK (AGENT-309 #15: typo `complted` accepted).
- `department` is plain text — no `hr_departments` FK — no org-tree, no rollup.
- `role_title` is plain text — no `hr_positions` FK — no comp-band, no headcount-by-grade.
- Three creation paths (AGENT-161): `payroll-routes.js:174`, `hr/onboarding.js:392`, direct `INSERT`. No single guard.

### 2.2 `hr_departments` — MISSING
Not in `workforce.*`, not in any in-repo migration. The org chart is a string column. Consequences:
- AGENT-309 #15: no canonical department list, every report joins by string match.
- Reorganizations cannot be tracked over time (no `effective_from / effective_to`).
- Cost-center reconciliation against `gl.cost_centers` is broken — no FK bridge.

### 2.3 `hr_positions` — MISSING
Not in `workforce.*`, not in any in-repo migration. Consequences:
- No comp-band link → `hr/comp-planner.js` cannot enforce a banding policy.
- No requisition→position FK in `hr/ats.js` (AGENT-161 step 1).
- Span-of-control / direct-report tree must be inferred from `manager_id` at the employee level, which itself is only present on `public.hr_employees`, not on `workforce.employees`.

### 2.4 `workforce.payroll_runs` (`00000:1305-1321`, status check at `00053:257-269`)
**Columns:** `id, public_id, payroll_run_number UNIQUE, payroll_period_start/end, employer_id FK, state DEFAULT 'Draft', calculated_at, approved_at, exported_at, paid_at, created_by, approved_by`
**State machine:** `draft / in_progress / approved / paid / closed` (CHECK present at 00053).
**Gaps:**
- The migration ALTER at `00053:86-93` adds `status text DEFAULT 'draft'` to a table that already has `state text DEFAULT 'Draft'` (00000:1312). **Two columns hold the same fact, with a different casing convention.** The CHECK at `00053:265-268` constrains `status`, not `state`. Application code (`payroll-routes.js`) writes `state`. The CHECK never fires.
- No FK from `payroll_runs` to a `pay_period` calendar — `payroll_period_start/end` is a date-pair without a parent period entity.
- AGENT-04 row 13: `Income-tax annualisation` is monthly×12; no YTD true-up against `payroll_runs.payroll_period_end`.

### 2.5 `workforce.payroll_entries` + `workforce.wage_slips` (= `hr_payslips`) (00000:1323, 1340)
**Strengths:** unique `(payroll_run_id, employee_id)`; PII RLS at 00053:393-429; published_at + published_by audit columns added at 00053:104-114; status CHECK `draft/published/superseded` at 00053:285-297.
**Gaps:**
- `wage_slips.gross_pay`/`net_pay` are denormalised from `payroll_entries`; no DB-level `CHECK net_pay = gross_pay - sum(deductions)`. Wage-slip drift is silent.
- AGENT-04 row 27: `negative-net guard NONE` — `net_pay = gross − deductions` may be negative.
- AGENT-04 row 28: hourly-vs-monthly branch silently miscomputes `vacation_pay` when `base_salary` holds a monthly figure for hourly employees.

### 2.6 `workforce.attendance` (= `hr_attendance`) (00000:1283-1303, RLS 00053:325-327)
**Strengths:** indexed on `(employee_id, work_date desc)`; new `attendance_exceptions` child added at 00053:194-216 with status CHECK `pending/approved/rejected`.
**Gaps:**
- `time/time-tracking.js` writes to its own IndexedDB queue and never flushes here (AGENT-161 step 3 gap).
- No DB CHECK that `regular_hours + overtime_hours ≤ MAX_TOTAL_HOURS_PER_DAY (12)` from `time-tracking.js:37`.
- `state` (00000:1297) AND `approval_status` (00000:1296) — **second duplicate-fact problem** in this domain. Tests in `00053` only constrain `attendance_exceptions.status`, not `attendance.state` or `attendance.approval_status`.
- No FK from `attendance.work_order_id` enforcing project membership — cross-project hours are bookable.

### 2.7 `workforce.leave_requests` (= `hr_leave_requests`) + `workforce.leave_types` (00011:454-495, RLS+CHECK 00053:271-283)
**Strengths:** seeded with 7 leave types (00053:462-471: annual, sick, maternity, paternity, bereavement, reserve_military, unpaid); status CHECK `submitted/approved/rejected/cancelled`.
**Gaps:**
- **No accrual engine.** No code path that: (a) credits `vacation_days_balance` per worked month per `חוק חופשה שנתית, התשי"א-1951` ladder (10/12/14/15/16/18/20/21/22/23 days by tenure year), (b) decrements on approved `leave_requests`, (c) caps roll-over at 24 months.
- **No sick-day bank.** `wage-slip-calculator.js:151` applies a flat 50% multiplier (`hours_sick * rate * 0.5`) and a code comment admits this is a simplification. The IL statute (`חוק דמי מחלה, התשל"ו-1976`) demands a **0/50/100 ladder**: day 1 = 0%, days 2-3 = 50%, day 4+ = 100%, accrued at 1.5 days/month (max 90), redeemed only on illness — the current engine ignores both the ladder and the 90-day cap.
- **No cap on `total_days`.** A 365-day vacation request will pass the CHECK.
- **No overlap detection.** Two approved annual-leave requests for the same employee/dates create two reductions but only one is cited.
- `employee_balances` table referenced by `payroll-routes.js:498-523` (fields `vacation_days_balance, sick_days_balance, study_fund_balance, severance_balance, snapshot_date`) — **no migration creates this table.** Production INSERTs will fail.

### 2.8 `hr_performance_reviews` — NO DB TABLE
- Engine in `onyx-procurement/src/hr/performance-review.js:1-60` (AGENT-161 step 5).
- All state lives in the in-memory `Map` of the engine instance — restart loses every review and every PIP.
- AGENT-161 step 5 gap: no entry in `pipeline/state-machines.js` for `performance_review` (`draft → submitted → calibrated → archived` is engine-only).
- The in-app references that AGENT-220/00075 indexes `(employee_id, reviewer_id)` against the live `public.hr_performance_reviews` table are **dead** — no code in this repo reads/writes that table.
- PIP gate (`performance-review.js:22-31`) enforces `שימוע הוגן` per case-law (מילפלדר, נון) at engine level only. Not at DB level. A direct INSERT into `public.hr_performance_reviews` skips the gate.

---

## 3. IL Labor-Law compliance — by statute

### 3.1 Severance (פיצויי פיטורים) — `pension/severance-tracker.js`
**Strong (per AGENT-161):** 8.33% rate, exempt ceiling 13,750 NIS×years, REASON_RIGHTS matrix (full/partial/limited/estate/pension), Section 161 election, Form 161 v2026-01.
**Gaps (AGENT-161 §Severance):**
- (a) No nightly job that posts `wage_slip.severance_employer` into the fund ledger — `recordContribution()` is never called from a scheduled context.
- (b) `Form 161` row built in JS but never serialised to PDF/CSV; no submission client.
- (c) Section 14 offset (`pension/section-14.js`) does **not** feed back into `computeSeveranceOwed` — when a valid Section 14 letter is on file, the calc still adds `employerTopUp` → **double-count risk**.
- (d) Marginal rate clamp `0..0.5` (severance-tracker.js:415-419) **rejects** the 2026 50% top bracket including `יסף`.
- (e) Fund-mobility roll-over (`העברת זכויות`) not honoured — surplus/deficit miscomputed for portable balances.
- (f) `employee.pension_records` (`00000:1354-1364`) does NOT separate `severance_component` from `pension_component` — fund-balance reconstruction is impossible from DB alone.

### 3.2 Sick pay (דמי מחלה) — `wage-slip-calculator.js:151,293`
- **NON-COMPLIANT.** Flat 50% multiplier ignores the IL `0/50/100 ladder`. Acknowledged by code comment ("per law; simplified").
- **No sick-bank accrual** (1.5 days/month, cap 90).
- **No certification gate** — payable sick days require an `אישור מחלה` (doctor's note) per `תקנות דמי מחלה (נהלים לתשלום), התשל"ו-1976`. No `sick_certificate` field on `leave_requests`.
- Severity HIGH (AGENT-04 row 9).

### 3.3 Vacation balance (חופשה שנתית, חוק חופשה שנתית התשי"א-1951)
- **NON-COMPLIANT.** No accrual ladder by tenure year (10→12→14→15→16→18→20→21→22→23 days). No tenure-aware computation.
- **No 24-month cap** on roll-over. The statute permits carry-over for a limited window; without code, balances grow indefinitely.
- **Pidyon חופשה on termination:** `offboarding.js:1169` reads `emp.unusedVacationDays` directly and pays `vacationDays × dailyRate`. Source of `unusedVacationDays` is undefined in the offboarding path — depends on `employee_balances` table (which has no migration).
- **No half-day support** — `total_days numeric(9,2)` allows fractional but `leave_requests` has no `start_half`/`end_half` flags.

### 3.4 Study fund (קרן השתלמות) — `wage-slip-calculator.js:70-74,252-261`
- **Compliant rates:** 2.5% employee / 7.5% employer; tax-exempt cap 15,712 NIS/month (matches AGENT-04 verification).
- **Eligibility heuristic is fragile** (AGENT-04 row 22): `studyFundEligible = !!employee.study_fund_number`. A blank string is falsy; a `0` numeric is falsy. No DB-enforced fund-account validation.
- **No vesting clock.** Study-fund withdrawal becomes tax-free only after 6 years (or earlier under retirement / hardship). Engine tracks neither the deposit-date ledger nor the 6-year clock.
- **No carry-forward of excess contributions** above the cap as taxable income — the calculator stops at the cap, but does not flag the excess for the wage-slip.

### 3.5 Pension (פנסיה) — `wage-slip-calculator.js:60-67,242-249` + `pension/section-14.js`
- **First-shekel rule honoured** (`MIN_BASE_MONTHLY:0` per `תקנות פנסיית חובה 2008`).
- **Cap honoured** (`MAX_PENSIONABLE: 28,750`).
- **Rate verified:** 6% employee / 6.5% employer / 8.33% severance.
- **Gaps:**
  - Section-14 module exists but doesn't gate the wage-slip (AGENT-161).
  - No fund selection (mandatory pension fund / managers' insurance / provident — each has different cap rules); the calculator treats all the same.
  - No Bituach Manageim 2.5% disability-cap variant (`section-14.js:23` mentions it but the calculator has no branch).
  - No bridging to `pension_records` (00000:1354) — the wage-slip computes pension lines but does not persist a contribution row.

---

## 4. Cross-cutting & runtime gaps

| # | Item | Severity | Reference |
|---|---|---|---|
| 1 | Two HR namespaces (`workforce.*` vs `public.hr_*`) with no view bridge | CRITICAL | §1 |
| 2 | `hr_departments` and `hr_positions` entirely missing | HIGH | §2.2-3 |
| 3 | `employee_balances` referenced but no migration | CRITICAL | `payroll-routes.js:498-523` |
| 4 | Sick pay `0/50/100` ladder not implemented (flat 50%) | HIGH | §3.2 |
| 5 | Vacation accrual engine missing | HIGH | §3.3 |
| 6 | Section 14 not coupled into severance calc — double-count risk | HIGH | §3.1c |
| 7 | Form 161 PDF/submission client missing | HIGH | AGENT-161 §Severance |
| 8 | Performance review has no DB persistence (in-memory only) | HIGH | §2.8 |
| 9 | `payroll_runs.state` vs `.status` duplicate-fact (CHECK on wrong column) | HIGH | `00053:265-268` |
| 10 | `attendance.state` vs `.approval_status` duplicate-fact | MEDIUM | §2.6 |
| 11 | No FK from `attendance.work_order_id` to project | MEDIUM | §2.6 |
| 12 | No DB CHECK on daily/weekly hour caps (12h/42h) | MEDIUM | §2.6 |
| 13 | No HR orchestrator action (`hire/onboard/terminate`) | HIGH | AGENT-161 §X-1 |
| 14 | No event bus channels for HR | HIGH | AGENT-161 §X-3 |
| 15 | No `retired` final state — retirement reuses `terminate` | MEDIUM | AGENT-161 §X-5 |
| 16 | `שימוע` gate not enforced at state-transition guard | HIGH | AGENT-161 §6 |
| 17 | Form 101 (טופס 101) capture missing — label only | HIGH | AGENT-161 §1 |
| 18 | Doc-intelligence route writes to orphan `hr_employees` overlay | HIGH | `api-server/.../ai-document-intelligence-engine.ts:137,308,311` |

---

## 5. Recommended fix plan (priority order)

1. **DECIDE the namespace** — Migration `0007X_hr_overlay_views.sql`: drop or replace `public.hr_*` with `CREATE OR REPLACE VIEW` over `workforce.*`. Repoint the doc-intelligence route.
2. **Create `hr_departments` and `hr_positions`** — bigserial/public_id, name, parent_id (departments), comp_band_id (positions), `effective_from/to`. Convert `workforce.employees.department/role_title` to FK.
3. **Create `workforce.employee_balances`** — the migration the code already calls (`payroll-routes.js:498-523`).
4. **Build vacation-accrual engine** — module `onyx-procurement/src/hr/leave-accrual.js` with the IL tenure ladder and 24-month roll-over cap. Tests against years 1-30.
5. **Replace flat 50% sick pay** — module `onyx-procurement/src/hr/sick-pay-ladder.js` with the `0/50/100` ladder, 1.5 days/month accrual, 90-day cap, certificate gate.
6. **Couple Section 14 → severance** — pass `section14Status` into `computeSeveranceOwed`; suppress `employerTopUp` for covered months.
7. **Form 161 PDF/CSV** — port the `pdf-generator.js` pattern from `payroll/`.
8. **Persist performance reviews** — migration `workforce.performance_reviews` (`employee_id, period, reviewer_id, status, score, pip_id`); state machine entry in `pipeline/state-machines.js`.
9. **De-duplicate `state` vs `status`** — single column, single CHECK; one ALTER ... DROP COLUMN per affected table after data migration.
10. **Event-bus channels** — `ats:hired`, `onboarding:complete`, `attendance:approved`, `payroll:paid`, `severance:computed`, `form161:generated`, plus `pip:opened` / `shimua:scheduled`.

---

## 6. Bottom line

The HR module **delivers strong, bilingual, append-only zero-dep engines** (ATS, onboarding, performance, offboarding, severance, Section 14) and a partially complete `workforce.*` schema. It **fails** at: (a) data-model unification — the `public.hr_*` namespace is a ghost; (b) IL statutory accrual — sick-bank, vacation-ladder, pension-fund-mobility absent; (c) DB persistence of `hr_performance_reviews` and `employee_balances`; (d) HR-tier orchestrator, event bus and state-machine bindings. Compared to the canonical `workforce.*` model, the eight `hr_*` table names in the audit scope map either to a working canonical equivalent (4 of 8) or to a missing or orphan target (4 of 8: `hr_departments`, `hr_positions`, `hr_performance_reviews` no DB, `hr_payslips` overlay drift).

Recommended status: **RED — block production payroll until items 1, 3, 4, 5, 6 in §5 land.**
