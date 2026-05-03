# AGENT-285 NAV #5 — Employee360 -> Timesheet -> PayrollRun -> Payslip -> Form 102/856

Agent 285. Navigation chain trace through the workforce / payroll pipeline,
end-to-end. Working directory:
`C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\`.

## TL;DR — Chain Status

| Hop | UI route | UI file | API surface | Status |
|-----|---------|--------|-------------|--------|
| 1. Employee360 | `/workforce/employee360` | `erp-app/src/pages/workforce/Employee360.tsx` | `GET /api/employees/:id/360` | LIVE |
| 2. Timesheet (attendance) | `/hr/attendance`, embedded in Employee360 "attendance" tab | `Employee360.tsx` lines 514-549 + `api-server/src/routes/workforce/attendance.ts` | `POST /api/attendance/:id/approve` | LIVE |
| 3. PayrollRun360 | `/payroll-runs/:id`, `/workforce/payroll-run/:id` | `erp-app/src/pages/workforce/PayrollRun360.tsx` | `/api/workforce/payroll-runs/:id` (+ `/calculate`, `/approve`, `/pay`, `/close`) | LIVE |
| 4. Payslip / WageSlip | `/wage-slips-archive`, `/hr/payslips`, in-page modal `PayslipDetailModal` | `WageSlipsArchivePage.tsx`, `pages/hr/payslips.tsx`, `payroll-engine.tsx` | `/api/workforce/wage-slips`, `/api/workforce/wage-slips/:id/publish`, `/api/hr/payslips`, `/api/payroll/calculation-runs/:runId/payslip/:id/pdf` | LIVE |
| 5. Form 102 / 856 (annual filings) | NO UI nav surface | engine: `onyx-procurement/src/tax/form-102.js`, `form-856.js` | NO HTTP route binding `generate102()` / `generate856()` to `/api/...` | **GAP** — engines exist but unwired; only labels referenced in `accounting-portal.tsx`, `israeli-integrations.tsx` |

Bottom line: Hops 1-4 are wired and clickable. Hop 5 (Form 102 / 856 generation
from a closed PayrollRun) is a **dead-end** — domain engines exist but no
route nor button on PayrollRun360 invokes them.

## Hop 1 — Employee360

- File: `erp-app/src/pages/workforce/Employee360.tsx`
- Route registered: `App.tsx:2484` → `<Route path="/workforce/employee360" element={<Employee360Page />} />`
- Lazy import: `App.tsx:418` → `lazy(() => import('./pages/workforce/Employee360'))`
- Data fetch: `fetchEmployee360()` → `GET /api/employees/:employeeId/360`
- Tabs: overview / attendance / **payroll** / expenses / assignments / payComponents / leave / ai / audit
- Header actions: `Calculate Payroll` button → `POST /api/payroll/run` body `{ employee_id }`
- Side panel "Next Best Action" steers user when `pr.length === 0` to "חשב שכר לעובד"
- Entity definition: `onyx-procurement/src/pipeline/entity-map.js:250-271`
  - `relatedSections: ['attendance', 'payroll', 'payslips', 'tasks', 'work_orders', ...]`
  - `actions[].view_payslips` ("תלושי שכר", icon 📄) — **declared in entity map but no on-click handler implemented in Employee360.tsx**
- Workflow flow: `onyx-procurement/src/pipeline/workflow-flows.js:95-108` flow id `employee_to_payroll`
  steps: attend_work → approve attendance → calculate → approve_and_export

## Hop 2 — Timesheet / Attendance

- Embedded inside Employee360 (no dedicated 360 page for a single timesheet entity)
- Type: `EmployeeAttendance` (Employee360.tsx lines 39-48): `work_date`, `regular_hours`,
  `overtime_hours`, `approval_status`, `state`, optional `project_id` / `work_order_id`
- Action: `approveAttendance(attendanceId)` → `POST /api/attendance/:id/approve`
  (Employee360.tsx lines 197-207)
- Sidebar nav: `erp-app/src/components/layout.tsx`
  - `:686` `/projects/timesheets` "דיווחי שעות"
  - `:698` `/hr/attendance` "נוכחות ושעון"
  - `:725` `/attendance` "נוכחות (כללי)"
- Backend: `api-server/src/routes/workforce/attendance.ts` mounted at
  `workforceRouter.use("/attendance-logs", attendanceRouter)` (workforce/index.ts:28)
- State machine effect: approving attendance → `locked_for_payroll`,
  `available_for_costing` (workflow-flows.js:101-102)
- **Naming gap**: `Timesheet` as an entity does not exist; system uses `attendance` /
  `attendance_logs`. `project-risks-timesheets.ts` exists at the project domain
  but is unrelated to payroll — separate ledger.

## Hop 3 — PayrollRun360

- File: `erp-app/src/pages/workforce/PayrollRun360.tsx` (304 lines)
- Routes: `App.tsx:2485-2486`
  - `/payroll-runs/:id`
  - `/workforce/payroll-run/:id`
- URL param: `useParams<{ id: string }>()` → `Number(idParam)`
- Queries:
  - `GET /api/workforce/payroll-runs/:id` → run header
  - `GET /api/workforce/payroll-line-items?payroll_run_id=:id&limit=500` → lines (per employee row)
  - `GET /api/workforce/payroll-exceptions?payroll_run_id=:id&limit=500`
- Mutations (state machine transitions):
  - `POST /api/workforce/payroll-runs/:id/calculate` (gate: status in `draft|in_progress`)
  - `POST /api/workforce/payroll-runs/:id/approve` (gate: status `in_progress`)
  - `POST /api/workforce/payroll-runs/:id/pay` (gate: status `approved`)
  - `POST /api/workforce/payroll-runs/:id/close` (gate: status `approved|paid`)
- Backend: `api-server/src/routes/workforce/payroll-runs.ts`, mounted at
  `/api/workforce/payroll-runs` (workforce/index.ts:31)
- Entry from Employee360: `payroll` tab lists `EmployeePayrollRun[]` (id, payroll_run_number,
  state, gross_pay, net_pay) but **rows are not clickable** — no `Link` or `navigate(`/payroll-runs/${id}`)`
  call. **GAP**: navigation back-pointer broken — user must hand-edit URL.

## Hop 4 — Payslip / Wage Slip

- Side A — workforce wage-slips archive (post-publish view)
  - File: `erp-app/src/pages/workforce/WageSlipsArchivePage.tsx`
  - Routes: `App.tsx:2487-2488`
    - `/wage-slips-archive`
    - `/workforce/wage-slips-archive`
  - Query: `GET /api/workforce/wage-slips?limit=200&[employee_id]&[status]&[slip_date_*]`
  - Action `publish`: `POST /api/workforce/wage-slips/:id/publish` body
    `{ generate_pdf: true, notify_employee: false }`
  - PDF download link: `GET /api/docs/documents/:document_id/download`
  - Backend: `api-server/src/routes/workforce/wage-slips.ts` (state: draft → published → superseded)
- Side B — HR payslips management
  - File: `erp-app/src/pages/hr/payslips.tsx`
  - Route: `App.tsx:1689` `/hr/payslips` (label "תלושי שכר", `layout.tsx:703`)
  - API: `/api/hr/payslips` (legacy CRUD) + `payroll-engine.tsx:363`
    PDF link `/api/payroll/calculation-runs/:runId/payslip/:calc.id/pdf`
- Side C — Employee Self-Service portal
  - `erp-app/src/pages/portal/employee-portal.tsx:76,114,152,161`: `payslips` tab on
    `dashboard?.payslips`
  - `erp-app/src/pages/hr/employee-self-service.tsx:53,164,168,290-299`
- Side D — Run-detail modals (in-row action)
  - `pages/hr/payroll.tsx:277,516`: `PayslipModal record={payslipRecord}`
  - `pages/hr/payroll-engine.tsx:390,663`: `PayslipDetailModal calc={payslipCalc} runId={selectedRun.id}`

Workflow contract: `workflow-flows.js:103-104` — calculate produces `wage_slip_created`,
`pension_calculated`, `expense_allocations_created`. Approve+export produces
`bank_file_created`, `payroll_status_approved`, `cost_posted_to_finance`.

**GAP**: PayrollRun360 has no "View Payslips for this run" tab nor link.
The lines table (`PayrollRun360.tsx:210-242`) shows employee + amounts but
each row has no link to the per-employee wage-slip record.

## Hop 5 — Form 102 / Form 856 — UNWIRED

- Engines exist:
  - `onyx-procurement/src/tax/form-102.js` (~80+ lines header + business logic)
    - Exports `generate102(payrollPeriod, employerDetails)` returning
      `{ sections, total, payableBy, dueDate, xml, pdfFields, period, employer, meta, warnings }`
    - Helpers: `computeBituachLeumi()`, `computeHealth()`, `computeIncomeTax()`,
      `dueDateFor({year, month})`, `buildPdfFields()`, `buildStubXml()`
    - `submitXML102(data)` — stub for שע"מ envelope
  - `onyx-procurement/src/tax/form-856.js`
    - Exports `generate856({year, payer, recipients, payments, certificates})` returning
      `{ records, summary, electronicFile }` (fixed-width + XML)
    - Adapters: `rowsFromCertificateTable()`, `rowsFromContractorPayments()`
- Tests exist: `onyx-procurement/test/tax/form-102.test.js`, `form-126.test.js`, etc.
- **HTTP route binding: not found**
  - `Grep` for `/api/.*102` / `/api/.*856` / `form-102` / `form-856` against
    `api-server/src/routes` returns 0 hits except a comment in
    `israeli-payroll.ts:43` (a CHECK constraint listing `report_type IN ('vat_856', ...)` —
    that is the VAT 856, not the withholding 856) and `israeli-payroll.ts:254`
    (`reportType = req.body.report_type || 'vat_856'`) — same VAT context.
- UI references (label-only, no handler):
  - `erp-app/src/pages/finance/israeli-integrations.tsx:141`
    `withholding_856: 'דוח 856 ניכוי מס'` — string only
  - `erp-app/src/pages/finance/accounting-portal.tsx:113`
    `{ label: "דוח ניכויים (856)", date: "15 בחודש הבא", type: "ניכויים", urgent: false }`
  - `erp-app/src/pages/finance/accounting-portal.tsx:1761`
    `{ label: "דוח 856 (ניכויים)", href: "#", icon: FileSpreadsheet }` — `href: "#"` confirms placeholder
  - PayrollRun360 has no "Generate 102" or "Export 856" button. The four state
    actions (`חשב`, `אשר`, `שלם`, `סגור`) terminate the chain at `closed`.
  - `payroll-export-batches.ts` accepts `export_type` (free string) but does not
    invoke `generate102` / `generate856` on creation — it just stores a row.

## Master Wiring References

- `onyx-procurement/src/pipeline/wiring-spec.js:32` — payroll service entities:
  `['employee', 'employer', 'attendance', 'payroll', 'wage_slip', 'pension_record', ...]`
- `onyx-procurement/src/pipeline/wiring-spec.js:59-60` — relationships
  `employee has_many [attendance, payroll, wage_slip, ...]`
- `onyx-procurement/src/pipeline/wiring-spec.js:84` —
  `employees: { detail: '/employees/:id', attendance: '/employees/:id/attendance', payroll: '/employees/:id/payroll' }`
  — note these per-employee sub-routes are declared in spec but **NOT registered
  in App.tsx** (only `/workforce/employee360` exists; the spec's `/employees/:id/payroll`
  has no Route element)
- `wiring-spec.js:216` —
  `employee.add_attendance: { method: 'POST', path: '/api/attendance', body: { employeeId } }`
  matches what Employee360 uses.
- `pipeline/orchestrator.js:230` — payroll calculate action precondition
  `approved_attendance_exists` confirming attendance must be approved first.

## Findings Summary (P0 -> P2)

1. **P0 — Form 102 / Form 856 not wired to UI/API**.
   `onyx-procurement/src/tax/form-102.js` and `form-856.js` are pure modules
   with no Express route, no service registration, no PayrollRun360 button,
   no menu link. The accounting-portal placeholder uses `href: "#"`. The 856
   appearing in `israeli-payroll.ts` is the **VAT 856**, distinct from the
   withholding-tax 856 covered by `form-856.js`.

2. **P1 — Navigation back-pointer broken on PayrollRun list**.
   Employee360 payroll tab shows runs but rows are not links. Users cannot
   click an `EmployeePayrollRun` to land on `/payroll-runs/:id`.

3. **P1 — `view_payslips` action declared but not implemented**.
   `entity-map.js:266` declares the button; no `onClick` exists in
   Employee360.tsx. There is no in-page tab nor link on the employee that
   surfaces the per-employee `wage_slips` archive filter
   (`/wage-slips-archive?employee_id=...`).

4. **P1 — PayrollRun360 has no payslip drill-down**.
   The lines table renders employee rows but does not link a line to its
   wage-slip / payslip record.

5. **P2 — Spec/route drift**: `wiring-spec.js:84` declares
   `/employees/:id/attendance`, `/employees/:id/payroll`, `/employees/:id/expenses`
   as routes, but `App.tsx` only registers the consolidated `/workforce/employee360`.
   Either the spec should be updated to reflect the current consolidated 360
   page, or per-section sub-routes should be added.

6. **P2 — Timesheet entity naming**: spec uses `attendance` consistently;
   no entity called `timesheet` exists in `entity-map.js`. The sidebar label
   "דיווחי שעות" at `/projects/timesheets` is a project-level surface, not the
   payroll one. Consider aligning vocabulary.

## Files To Open If Fixing

- Wire 102/856 endpoints:
  - new `api-server/src/routes/workforce/tax-filings.ts` (POST `/payroll-runs/:id/form-102`,
    `/payroll-runs/:id/form-856`)
  - mount in `api-server/src/routes/workforce/index.ts`
  - import engines from `onyx-procurement/src/tax/form-102.js`, `form-856.js`
  - add buttons on `erp-app/src/pages/workforce/PayrollRun360.tsx` after `closeMut`
- Add link on Employee360 payroll list:
  `erp-app/src/pages/workforce/Employee360.tsx:551-576` wrap `payrollRuns.map`
  row in `<Link to={`/payroll-runs/${run.id}`}>` (already imports react-query;
  needs `react-router-dom` import).
- Wire `view_payslips` action in Employee360 header to navigate to
  `/wage-slips-archive?employee_id=${employee.id}` and add corresponding query
  filter on `WageSlipsArchivePage.tsx`.
