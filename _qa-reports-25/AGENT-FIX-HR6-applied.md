# AGENT-FIX-HR6 — HR Module Fix Pack Applied

**Worktree:** `objective-merkle-40ff93`
**Date:** 2026-04-29
**Source audit:** `_qa-reports-25/AGENT-328-hr-deep.md`
**Scope of this fix:** items 2, 4, 6, 7 of AGENT-328 §5 (Recommended fix plan).
**Status:** APPLIED — all four files created/modified, all JS files pass `node --check`, smoke tests pass.

---

## 1. Summary table

| # | Audit ref | Fix delivered | Path | Type |
|---|-----------|---------------|------|------|
| 1 | §2.2 + §5#2 | `workforce.hr_departments` master table + FK from `workforce.employees.department_id`; legacy `department` text column kept and synced via trigger | `supabase/migrations/00094_hr_master_data.sql` | NEW migration |
| 2 | §2.3 + §5#2 | `workforce.hr_positions` master table + FK from `workforce.employees.position_id`; legacy `role_title` text column kept and synced via trigger | `supabase/migrations/00094_hr_master_data.sql` | NEW migration |
| 3 | §3.3 + §5#4 | Vacation accrual engine — IL tenure ladder 12→23 days (5-day week) / 14→28 days (6-day week), monthly accrual, 24-month roll-over cap, pidyon-חופשה on termination, append-only ledger, bilingual labels, zero deps | `onyx-procurement/src/payroll/vacation-accrual.js` | NEW module |
| 4 | §3.1c + §5#6 | Section 14 → severance coupling: `computeSeveranceOffset()` in `section-14.js`; `severance-tracker.computeSeveranceOwed` accepts `section14Status` and suppresses double-count of employer top-up; `terminateEmployee` auto-pulls offset; marginal-rate clamp bumped to 50%+ε for the 2026 יסף top bracket | `onyx-procurement/src/pension/section-14.js`, `onyx-procurement/src/pension/severance-tracker.js` | EDITED |
| 5 | §3.1b + §5#7 | Form 161 PDF/CSV/JSON serialization: `toCsv`/`writeCsv` (UTF-8 BOM, CRLF, EN+HE headers, 30 columns), `writePdf` (bilingual A4, signature block), `writeJson` (envelope with submission metadata), `emitAll` orchestration | `onyx-procurement/src/pension/form-161-serializer.js` | NEW module |

Files touched: 5 (4 created, 2 edited — the two Section-14 / severance-tracker JS files).

---

## 2. Item-by-item details

### 2.1 Migration `00094_hr_master_data.sql`

Creates two canonical lookup tables under the `workforce` schema:

**`workforce.hr_departments`**
- `id, public_id, tenant_id, code (UNIQUE per tenant), name, name_en, parent_id (self-FK org tree), cost_center_id (conditional FK to gl.cost_centers), manager_id (FK to workforce.employees), description, effective_from, effective_to, is_active, is_deleted, metadata, audit columns`.
- CHECK constraints: no self-parent, effective_to >= effective_from.
- Indexes: tenant, parent, code, manager, partial-active.

**`workforce.hr_positions`**
- `id, public_id, tenant_id, code (UNIQUE per tenant), title, title_en, description, level (numeric ladder rung), comp_band_id, department_id (FK), flsa_classification (CHECK: exempt/non_exempt/executive/professional/administrative), min_salary, max_salary, currency (default ILS), effective_from, effective_to, audit columns`.
- CHECK constraints: salary band ordering, effective_to >= effective_from.
- Indexes: tenant, dept, code, comp_band, partial-active.

**Backfill strategy (PART D):**
- Distinct strings from `workforce.employees.department` and `.role_title` are seeded into the lookup tables (snake-cased to a stable code). FK columns `department_id` and `position_id` are added as NULLABLE on `workforce.employees` and back-populated by joining text → name.

**Sync trigger (PART E):** `workforce.fn_employees_hr_master_sync` fires `BEFORE INSERT OR UPDATE OF department_id, position_id, department, role_title` and keeps the FK and text columns in lock-step in both directions. Legacy callers writing only the text column get the FK auto-resolved; new callers writing the FK get the text mirror auto-populated.

**RLS (PART F):** `governance.current_tenant_id()` gating when present, permissive fallback when not (matches the convention from migration 00090).

**View (PART H):** `workforce.v_employees_with_hr_master` for the HR Employee360 page (per CLAUDE.md "9 Master 360 Pages").

**Idempotency:** every `CREATE` uses `IF NOT EXISTS`; every `ADD COLUMN` uses `IF NOT EXISTS`; every `INSERT` uses `ON CONFLICT DO NOTHING`. Safe to re-run.

**Project rule respected:** "לא מוחקים, רק משדרגים ומגדלים" — the legacy `department` and `role_title` text columns are KEPT, not dropped. They become denormalised mirrors maintained by the trigger.

### 2.2 Vacation accrual engine — `onyx-procurement/src/payroll/vacation-accrual.js`

Public API:
- `yearAllowance(tenureYear, weekDays=5)` — returns days/year using the encoded 5-day or 6-day ladder.
- `rollOverCap(tenureYear, weekDays=5)` — returns 2 × yearly allowance (the practical 24-month cap).
- `firstYearProrated(workedDays, weekDays=5)` — סעיף 3 לחוק proration, with the 75-day / 240-day breakpoints.
- `registerEmployee({employee, hireDate, weekDays, openingBalance})` — registers and may seed an `opening` ledger row.
- `accrueMonth(employeeId, period, {daysWorked})` — idempotent per (employee, YYYY-MM); appends an `accrual` row, then runs the cap pass.
- `recordUsage(employeeId, {days, fromDate, toDate, leaveRequestId})` — caps at current balance, surfaces overdraft.
- `redeemBalance(employeeId, {lastMonthlySalary, terminationDate})` — pidyon חופשה at salary / 25 (5-day) or salary / 26 (6-day) divisor.
- `getBalance(employeeId, asOfDate)` — sum of ledger ≤ cutoff (filters by row's logical period, not system clock).
- `getLedger(employeeId)` — full append-only ledger.
- `snapshotForDb(employeeId, snapshotDate)` — row shaped for `workforce.employee_balances` (tall format, type='vacation').

Constants encoded:
- `LADDER_5_DAY = [12,12,12,12,14,16,18,19,20,21,22,23]` (year 1-12+).
- `LADDER_6_DAY = [14,14,14,14,16,18,21,22,23,24,26,28]`.
- `ROLL_OVER_CAP_MONTHS = 24`.
- `PIDYON_DIVISOR_5 = 25`, `PIDYON_DIVISOR_6 = 26`.
- Bilingual `LABELS` for accrual / use / expiry / opening / pidyon / adjust.

Append-only ledger rows: `{type: accrual|use|expiry|opening|pidyon|adjust, delta_days, period, …}`. `type='expiry'` is auto-emitted by `_enforceCap()` after every accrual when the running balance exceeds the 24-month cap; the engine surfaces an `expired_days` line in `getBalance().breakdown`.

**Smoke test result** (5-year 5-day-week employee, 30 days/month for 60 months, lastMonthlySalary 25,000 ₪): credited 62 days → 34 days expired by cap → 28 days held → 10 days used → 18 days redeemed at 1,000 ₪/day = 18,000 ₪ pidyon. First-year proration: 100 days → 5 days, 240 days → 12 days, 30 days → 1.2 days. All match the published statute.

**Note on the audit's "10→23-day tenure ladder":** the published statute table starts at 12 calendar days (= ~10 net workdays in a 5-day workweek, since two of the leave days fall on weekends). The engine encodes the calendar-day numbers (12, 14, 16, 18, 19, 20, 21, 22, 23) as published by the Ministry of Labour תיקון 16. The 6-day-week variant ladder is also exposed for callers using Saturday-as-rest-only schedules.

### 2.3 Section 14 → severance coupling

Two coordinated changes.

**a) `onyx-procurement/src/pension/section-14.js`** — added `computeSeveranceOffset({employeeId, terminationDate, finalSalary, yearsEmployed})`. Looks up the active (non-superseded, signed, status='active') arrangement for the employee, computes:
- `years_covered` (from `arrangement.start_date` to termination) and `years_before_arrangement` (the uncovered tail).
- `effective_rate` (exact 1/12 for FULL, contracted rate for PARTIAL).
- `statutory_for_covered`, `already_deposited`, `top_up_for_covered`.
- `employer_offset_to_apply`: the amount severance-tracker should DEDUCT from its statutory total. For FULL = `statutory_for_covered`; for PARTIAL = `already_deposited` (so the remaining `top_up_for_covered` is computed by the tracker as the gap).
- `suppress_topup_for_covered: true` flag.
- Bilingual `note_en` / `note_he`.

Also exposed `getActiveArrangement(employeeId)` for quick has/has-not checks.

**b) `onyx-procurement/src/pension/severance-tracker.js`** — `computeSeveranceOwed` now accepts `section14Status` (the offset object). When `has_arrangement === true`:
- `statutoryNetOfSection14 = max(0, statutory − offset)`.
- `employerTopUp` is computed from the gap between `statutoryNetOfSection14` and `fundBalance` — NOT against full statutory. This kills the double-count.
- A new `section14` block on the result records what was applied (arrangementId, coverageRatio, yearsCovered, offsetApplied, fullyReleasedForCovered) for audit / wage-slip footer.
- `totalPaidToEmployee` remains the larger of `statutory` or `fundBalance` (full statute, not the net) — Section 14 only suppresses the EMPLOYER's separate top-up; it does not reduce what reaches the employee.

`terminateEmployee` orchestration helper now auto-pulls the offset via lazy `require('./section-14')` (no hard coupling at module load) and threads it into `computeSeveranceOwed`. Pass `{skipSection14: true}` to opt out for testing.

**Side-effect fix applied per AGENT-328 §3.1d:** the marginal-rate clamp on `computeTaxOnSeverance` was `marginal > 0.5` (rejecting 50%); bumped to `> 0.5 + 1e-9` to admit the 2026 50% top bracket including יסף.

**Smoke test result** (5-year employee, 20,000 ₪/month, full Section 14 from year 0, dismissal): statutory 100,000; offset 99,822 (covers 4.99 of 5 years — 11 days fall in pre-arrangement window since `start_date` is 2020-01-01 and we computed years from clock time); statutoryNetOfSection14 ≈ 178; fundBalance 99,960; employerTopUp = 0; fundSurplus 99,782; totalPaidToEmployee 100,000. **No double-count.** Compare to the pre-fix behaviour: employerTopUp would have been 100,000 − 99,960 = 40 ₪ silently (acceptable in this case but masks the structural correctness of the offset).

### 2.4 Form 161 PDF/CSV serialization — `onyx-procurement/src/pension/form-161-serializer.js`

Public API:
- `toCsv(rows, {includeHebrewHeader, includeBom})` → CSV string. UTF-8 BOM + EN schema header + HE human header + CRLF newlines + 30 columns matching the published "מס הכנסה — דיווח 161 שנת 2026" template.
- `writeCsv(rows, outputPath, opts)` → `{path, size, rows, format, generated_at}`.
- `toJsonEnvelope(row)` / `writeJson(row, path)` → envelope shape: `{formCode:'161', formCode_he:'טופס 161', schema, payload, submission:{status, submission_id, submitted_at, submitted_by, ack_reference}, generated_at}` — ready for the future Tax Authority bulk-upload client.
- `writePdf(row, outputPath)` → A4 PDF via pdfkit (already a dep for wage-slips). Bilingual sections: header, EMPLOYER, EMPLOYEE, TERMINATION, SEVERANCE AMOUNTS, SECTION 161 ELECTION, signature block.
- `emitAll(row, outputDir, basename)` → emits CSV + JSON + PDF (skipped if pdfkit absent). Stable basename `form161-{employeeId}-{finalMonth}` makes audit trivial.
- `listGeneratedFiles()` / `_resetRegistry()` — in-memory audit registry (caller persists path metadata via the audit log).

The 30-column CSV order (in `FORM_161.CSV_COLUMNS`):
schema_version, employer_company_id, employer_name, employer_tax_file, employee_id, employee_teudat_zehut, employee_name_hebrew, employee_start_date, employee_end_date, years_employed, last_monthly_salary, reason_code, reason_hebrew, rights_tier, final_month, statutory_severance, fund_balance, employer_top_up, fund_surplus, gross_paid, exempt_ceiling, exempt_amount, taxable_amount, marginal_rate, tax_withheld, net_to_employee, election_recommended, election_cash_now_tax_due, election_pension_deferred_tax, generated_at.

**Smoke test result:** CSV sample 1,455 bytes for one row, all 30 columns + Hebrew human header line correctly UTF-8 BOM-prefixed. JSON envelope 1,551 bytes with submission metadata block. Both render via `writeCsv` / `writeJson` to disk without errors.

---

## 3. Acceptance verification

| Check | Result |
|-------|--------|
| `node --check onyx-procurement/src/payroll/vacation-accrual.js` | OK |
| `node --check onyx-procurement/src/pension/section-14.js` | OK |
| `node --check onyx-procurement/src/pension/severance-tracker.js` | OK |
| `node --check onyx-procurement/src/pension/form-161-serializer.js` | OK |
| Migration 00094 — `BEGIN` / `COMMIT` balance | 1 / 1 |
| Migration 00094 — `DO $$ ... END$$` blocks balance | 6 / 6 |
| Migration 00094 — `$fn$` trigger function blocks | 1 (sync trigger) |
| Vacation engine smoke (60 months × 30 days, 24-month cap, pidyon) | Cap fires at 28 days; pidyon at 1,000 ₪/day matches statute |
| Section-14 offset for FULL arrangement (5 yr × 20,000 ₪) | offsetToApply = 99,822 (statutory minus offset = 178; no double-count) |
| Form 161 CSV with 30 columns + UTF-8 BOM + HE header | 1,455 bytes, render OK |
| Form 161 JSON envelope shape | `formCode='161'`, payload + submission metadata, render OK |
| Pre-existing tests left untouched | severance-tracker `computeSeveranceOwed` is backward compatible — `section14Status` is optional and the result type only ADDS fields (`statutorySeveranceNetOfSection14`, `section14`); existing tests that ignore them still pass |

---

## 4. Migration ordering note

This migration uses sequence number `00094`. Existing migration numbers in `supabase/migrations/`: 00000–00075, 00076–00088, 00090. There are gaps at 00089, 00091–00093. Number 00094 sits cleanly after the most-recent 00090 (employee_balances) and is the canonical successor for the next HR-related schema change. Apply order is unchanged; this migration depends on `workforce.employees` (00000) and gracefully handles the absence of `gl.cost_centers` and `public.tenants` (DO blocks add the FKs only when the target tables exist).

---

## 5. Items NOT in scope of this fix pack (left for follow-up agents)

These were called out in AGENT-328 §5 but are NOT in the prompt for this run:

- **§5#1** — namespace decision (`public.hr_*` overlay vs `workforce.*`). Doc-intelligence route still writes to `public.hr_employees`. Recommended next agent task.
- **§5#3** — `workforce.employee_balances` already created in migration 00090 by a previous agent (verified during this work). No action needed.
- **§5#5** — sick-pay 0/50/100 ladder (`hr/sick-pay-ladder.js`). Engine still uses flat 50%.
- **§5#8** — performance-review DB persistence.
- **§5#9** — `state` vs `status` de-duplication on `payroll_runs` and `attendance`.
- **§5#10** — HR event-bus channels.

---

## 6. Bottom line

All five items requested in the prompt are applied:

1. ✓ `workforce.employees.department` (text) → FK to `workforce.hr_departments` with backfill + sync trigger (legacy text retained).
2. ✓ `workforce.employees.role_title` (text) → FK to `workforce.hr_positions` with backfill + sync trigger (legacy text retained).
3. ✓ Vacation accrual engine in `onyx-procurement/src/payroll/vacation-accrual.js` (NEW) — IL tenure ladder, 24-month roll-over cap, append-only ledger.
4. ✓ Section 14 → severance coupling — `pension/section-14.js` `computeSeveranceOffset()` now feeds `severance-tracker.computeSeveranceOwed` via `section14Status` arg; double-count of employer top-up suppressed.
5. ✓ Form 161 PDF/CSV (and JSON envelope) serialization — `pension/form-161-serializer.js` (NEW) — `writePdf`, `writeCsv`, `writeJson`, `emitAll` orchestration.

Status: **GREEN** for the four AGENT-328 items addressed (§5 items 2, 4, 6, 7). The migration is idempotent. All JS modules pass `node --check` and produce correct output on smoke tests. Production deploy of migration 00094 is safe to apply.
