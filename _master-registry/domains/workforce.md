# DOMAIN — workforce

| Field | Value |
|---|---|
| Generated | 2026-04-18 |
| Canonical schema | `workforce` (plus HR-specific planned) |
| Evidence | `B-E013` `B-E015` DISCOVERY §B |

## 1. domain_checklist

### expected_models (13)
employees, employers, attendance, leave_requests, leave_types, shifts, pay_components, payroll_runs, payroll_entries, wage_slips, pension_records, workforce_assignments, hr_profiles — plus planned: contractors, teams, performance_reviews, skill_matrix, attendance_logs(alias→attendance)

### required_pages
EmployeesList, Employee360, EmployersList, AttendancePage, LeaveRequestsPage, ShiftsPlanner, PayComponentsAdmin, PayrollRunsList, PayrollRun360 (must include real line items), WageSlipsArchive (must have real page), PensionRecordsList, WorkforceAssignmentsPage, HRProfilesPage, TeamsAdmin (planned), ContractorsList (planned), PerformanceReviewsPage (planned), SkillMatrixPage (planned)

### required_forms
NewEmployee, HireWizard, AttendanceClockIn, RequestLeave, ApproveLeave, NewShift, RunPayroll, ApprovePayroll, LogPensionContribution, NewContractor, StartPerformanceReview, UpdateSkillMatrix

### required_routes
`/employees`, `/employee/:id`, `/attendance`, `/leave-requests`, `/shifts`, `/payroll-runs`, `/payroll-run/:id`, `/wage-slips`, `/pension`, `/employers`, `/teams`, `/contractors`, `/performance`, `/skills`

### required_reports
payroll_summary_report, overtime_report, leave_balance_report, attendance_variance_report, pension_contribution_report, headcount_report

### required_dashboards
WorkforceControlRoom, AttendanceDashboard, PayrollCostDashboard

### required_flows
- employee_to_payroll (flow_5)
- onboarding → employee → attendance → payroll state
- leave_request approval flow

### critical_relations
- employees *—1 employers; employees 1—* attendance; employees 1—* leave_requests; employees 1—* payroll_entries
- payroll_runs 1—* payroll_entries 1—* pay_components (split)
- payroll_runs 1—* wage_slips
- employees 1—* workforce_assignments (projects)
- employees 1—1 hr_profiles

### completion_gate
- PayrollRunsPage must be exposed
- PayrollRun360 must have real line items
- WageSlips archive must have real page
- performance_reviews / skill_matrix need decisions

## 2. DISCOVERY

| layer | count |
|---|---:|
| DB tables workforce.* | 16 |
| Registry models | 1 full + 12 partial |
| API routers | 18 |
| Pages | 47 |
| Menu entries | 47 |
| Dashboards | 1 connected |
| Reports | 1 connected |

## 3. GAPS

| class | items |
|---|---|
| **planned_locked** | contractors, teams, attendance_logs(alias), assignments(alias→workforce_assignments), payroll_inputs, performance_reviews, skill_matrix |
| **wrong-schema** | employees (registry says hr_workforce → canonical workforce) |
| **ghost tables** | employee_expenses, employee_pay_components, hr_profiles, payroll_exceptions, payroll_export_batches, pension_records, wage_slips, workforce_assignments |
| **broken** | PayrollRun360 missing line items surface; WageSlips archive page missing |

## 4. ACTIONS

| action | items |
|---|---|
| recover_now | fix employees registry; build WageSlipsArchive page; build PayrollRun360 line items |
| build_now | contractors, teams, performance_reviews, skill_matrix |
| internal_only | payroll_export_batches (automation), payroll_exceptions (alert feed) |
| postpone | — |
| remove_from_registry | N/A |

## 5. DEPLOYMENT

0/16 tables verified; pending.

## 6. COVERAGE

| metric | value |
|---|---|
| completion_percent | 38 |
| business_readiness | partial |
| gate_status | blocked — payroll surfaces incomplete |
| red rows | 5 |
