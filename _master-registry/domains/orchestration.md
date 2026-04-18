# DOMAIN — orchestration

| Field | Value |
|---|---|
| Generated | 2026-04-18 |
| Canonical schema | `orchestration` |
| Evidence | `B-E013` `B-E015` DISCOVERY §B §D |

## 1. domain_checklist

### expected_models (7+)
workflow_definitions, workflow_steps, workflow_runs, workflow_step_runs, job_queue, universal_inbox, notifications (canonical=comms.notifications — overlap resolve) — plus planned: orchestration_flows (alias→ai_automation.orchestration_flows)

### required_pages
WorkflowsAdmin, WorkflowDefinitionEditor, WorkflowRunsList, WorkflowRun360 (steps + logs), UniversalInbox (per-user), JobQueueAdmin, NotificationCenter

### required_forms
NewWorkflowDefinition, EditWorkflowStep, RunWorkflow, AckNotification

### required_routes
`/orchestration/workflows`, `/orchestration/workflow/:id`, `/orchestration/runs`, `/orchestration/run/:id`, `/orchestration/inbox`, `/orchestration/jobs`, `/notifications`

### required_reports
workflow_run_performance_report, sla_breach_report, inbox_aging_report

### required_dashboards
OrchestrationDashboard (planned)

### required_flows
- every domain workflow registers its definition here
- notifications fan-out from orchestration to comms

### critical_relations
- workflow_definitions 1—* workflow_steps
- workflow_definitions 1—* workflow_runs 1—* workflow_step_runs
- workflow_step_runs → job_queue entries
- notifications materialize into universal_inbox per user

### completion_gate
- notifications overlap between orchestration.* and comms.* — canonical decision D003 (use comms.notifications)
- universal_inbox must surface real data per user
- job_queue admin only

## 2. DISCOVERY

| layer | count |
|---|---:|
| DB tables orchestration.* | 7 |
| Registry models | 1 full + 7 partial |
| API routers | 8 |
| Pages | 6 |
| Menu entries | 6 |
| Dashboards | 0 |
| Reports | 0 |

## 3. GAPS

| class | items |
|---|---|
| **planned_locked** | orchestration_flows(canonical AI) |
| **built_not_exposed / red** | workflow_step_runs, job_queue, universal_inbox |
| **duplicate_canonical** | orchestration.notifications ↔ comms.notifications (17-entity dedup list) |

## 4. ACTIONS

| action | items |
|---|---|
| recover_now | D003: canonical=comms.notifications; alias orchestration.notifications out |
| build_now | UniversalInbox page; WorkflowRun360 |
| internal_only | job_queue (admin only), workflow_step_runs (instance log) |
| postpone | — |
| remove_from_registry | N/A |

## 5. DEPLOYMENT

0/7 tables verified; pending.

## 6. COVERAGE

| metric | value |
|---|---|
| completion_percent | 40 |
| business_readiness | partial |
| gate_status | blocked — UniversalInbox not live |
| red rows | 3 |
