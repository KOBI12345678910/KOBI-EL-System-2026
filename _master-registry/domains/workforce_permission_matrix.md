# Workforce — Permission Matrix

| Generated | 2026-04-18 |
|---|---|
| Batch | B-BATCH-WORKFORCE-RECONCILE-01 |
| Sensitivity | **Highest** — PII + salary data |

Workforce is the most restrictive domain in the system. RLS is
enforced at the app layer via role-gated Express middleware; the
database also has RLS enabled on every sensitive table.

## Roles referenced

| Role code | Label | Scope |
|---|---|---|
| `super_admin` | מנהל מערכת-על | full read/write all tables |
| `admin` | מנהל | full read/write all tables |
| `hr_admin` | מנהל משאבי אנוש ראשי | employees + HR profiles + benefits |
| `hr_manager` | מנהל משאבי אנוש | approvals: leave, attendance-exceptions, payroll |
| `payroll_operator` | פקיד שכר | payroll_runs calculate / entries / wage_slips draft |
| `finance_manager` | מנהל כספים | payroll_runs/pay, payroll_export_batches |
| `employee_self` | עובד | read-only on own employee row + own wage_slips |

## Module × Role permission table (R=read, W=write, A=approve/transition)

| Module / Endpoint                       | employee_self | payroll_operator | hr_manager | hr_admin | finance_manager | admin |
|-----------------------------------------|:---:|:---:|:---:|:---:|:---:|:---:|
| employees — list / read all             | —   | R   | R   | R/W | R   | R/W |
| employees — read own row                | R   | R   | R   | R/W | R   | R/W |
| employees — write (create/update/del)   | —   | —   | —   | R/W | —   | R/W |
| employee_profiles (hr_profiles)         | —   | R   | R/W | R/W | —   | R/W |
| attendance logs                         | R*  | R/W | R/W | R/W | R   | R/W |
| attendance_exceptions — read/create     | R*  | R/W | R/W | R/W | R   | R/W |
| attendance_exceptions — approve/reject  | —   | —   | A   | A   | —   | A   |
| leave_requests — read/create own        | R/W*| R   | R   | R/W | R   | R/W |
| leave_requests — approve/reject         | —   | —   | A   | A   | —   | A   |
| leave_types admin                       | —   | R   | R/W | R/W | R   | R/W |
| payroll_runs — list/read                | —   | R   | R   | R   | R   | R/W |
| payroll_runs — create/draft edit        | —   | R/W | R/W | R/W | —   | R/W |
| payroll_runs — calculate                | —   | A   | A   | A   | —   | A   |
| payroll_runs — **approve**              | —   | —   | A   | A   | —   | A   |
| payroll_runs — **pay**                  | —   | —   | —   | —   | A   | A   |
| payroll_runs — **close**                | —   | —   | A   | A   | A   | A   |
| payroll_line_items (entries)            | R** | R/W | R   | R/W | R   | R/W |
| payroll_exceptions                      | —   | R   | R/W | R/W | R   | R/W |
| payroll_exceptions — resolve            | —   | A   | A   | A   | —   | A   |
| wage_slips — list                       | R** | R   | R   | R/W | R   | R/W |
| wage_slips — create/edit draft          | —   | R/W | R   | R/W | —   | R/W |
| wage_slips — **publish**                | —   | —   | A   | A   | —   | A   |
| pay_components admin                    | —   | R   | R/W | R/W | R   | R/W |
| employee_pay_components                 | —   | R/W | R/W | R/W | R   | R/W |
| benefits                                | R*  | R   | R/W | R/W | R   | R/W |
| pension_records                         | R** | R/W | R   | R/W | R   | R/W |
| shifts                                  | R*  | R   | R/W | R/W | —   | R/W |
| payroll_export_batches — read           | —   | R   | R   | R   | R   | R/W |
| payroll_export_batches — **generate**   | —   | —   | —   | —   | A   | A   |

**Legend**
- `*` self-only: the endpoint filters to `employee_id` = caller's resolved employee row (`metadata.user_id` match).
- `**` self-only read restricted to caller's own wage_slips / payroll_entries / pension_records.
- `A` (approve) is a state-transition action with its own endpoint (`POST /:id/approve`).

## PII markers

Two columns on `workforce.employees` are flagged via
`COMMENT ON COLUMN` for data-governance tooling:

- `national_id` — `PII:national_id sensitive; HR/Payroll role required`
- `bank_account_reference` — `PII:bank_account sensitive; Payroll/Finance role required`

Zod validates both with Hebrew-locale error messages:
`HebrewNationalIdSchema`, `HebrewBankAccountSchema`.

## Self-only RLS decision

DB-level RLS currently enforces `using (true)` on authenticated
sessions. Fine-grained self-only filtering is enforced at the
Express route layer via:

- `hrOrAdminMiddleware` — allows hr_admin / hr_manager / payroll_operator / finance_manager / admin.
- `hrManagerMiddleware` — allows hr_manager / hr_admin / admin.
- `financeManagerMiddleware` — allows finance_manager / admin.

Employee self-service endpoints (e.g. `GET /employees/:id/wage-slips-history`)
must be further gated with `getSelfEmployeeId(req)` comparison — this
hook is provided in `_helpers.ts` for future wiring when the employee
portal is enabled.

## Audit & triggers

- Audit triggers fire on: `employees`, `wage_slips`, `pension_records`,
  `payroll_runs`, `attendance_exceptions`, `benefits`, `leave_requests`,
  `payroll_entries`.
- Every state change logs to `audit_log` via `logAudit()` with user,
  ip, table, record_id, action, new_values.

## Legacy surface

The 53 existing pages under `erp-app/src/pages/hr/` remain the
canonical UI. This batch adds only two gap-fill pages under
`erp-app/src/pages/workforce/`:

- `PayrollRun360.tsx` — was flagged missing in `workforce.md § 3 GAPS → broken`.
- `WageSlipsArchivePage.tsx` — was flagged missing in `workforce.md § 3 GAPS → broken`.
