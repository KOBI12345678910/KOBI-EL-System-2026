# DOMAIN — execution

| Field | Value |
|---|---|
| Generated | 2026-04-18 |
| Canonical schema | `execution` |
| Evidence | `B-E013`, `B-E015`, `B-E016`, DISCOVERY §A §B |

## 1. domain_checklist

### expected_models (29)
projects, project_phases, project_milestones, project_risks, project_blockers, project_cost_plans, tasks, task_dependencies, task_comments, task_attachments, work_orders, work_order_tasks, work_order_qa_checklists, work_order_qa_items, delivery_events, installation_events, logistics_orders, signatures, project_resources (planned), dependencies (alias→task_dependencies), production_orders (planned), work_centers (planned), labor_logs (planned), installation_teams (planned), site_visits (planned), punch_lists (planned), drawings (planned engineering), bom_headers (planned), revision_control (planned)

### required_pages
- ProjectsList, Project360 (primary — must include phases+milestones+risks+blockers+tasks+work_orders tabs)
- WorkOrdersList, WorkOrder360 (primary — must include work_order_tasks surface)
- TasksList / TaskBoard
- DeliveriesList, DeliveryDetail (from delivery_events)
- InstallationsList, InstallationDetail (from installation_events)
- ProductionOrdersList (planned)
- DrawingsList (planned engineering)

### required_forms
NewProject, EditProject, NewPhase, NewMilestone, LogRisk, LogBlocker, NewTask, AssignTask, LogWorkOrder, QAChecklistRunner, SignoffForm, NewDelivery, NewInstallation, NewProductionOrder, NewDrawing (planned)

### required_routes
`/projects`, `/project/:id`, `/work-orders`, `/work-order/:id`, `/tasks`, `/task/:id`, `/deliveries`, `/installations`, `/logistics`, `/signatures`, `/production-orders`, `/drawings`

### required_reports
project_profitability_report, project_delivery_timeline_report, work_order_qa_pass_rate_report, installation_sla_report, labor_productivity_report, scrap_loss_report

### required_dashboards
ProjectProfitabilityDashboard, ProjectsHealthDashboard, WorkOrdersOpsDashboard, DeliveryPerformanceDashboard, ProductionOutputDashboard

### required_flows
- project_execution (flow_3)
- order→project→work_order→delivery→invoice chain
- 13 state machines touch execution (project_state, task_state, work_order_state, delivery_state, installation_state)

### critical_relations
- projects 1—* phases 1—* milestones
- projects 1—* tasks; tasks 1—* task_dependencies; tasks 1—* task_comments; tasks 1—* task_attachments
- projects 1—* work_orders 1—* work_order_tasks 1—* qa_items
- projects 1—* delivery_events; projects 1—* installation_events; projects 1—* logistics_orders
- projects 1—* signatures; projects 1—* project_risks; projects 1—* project_blockers; projects 1—1 project_cost_plans

### completion_gate
- **Project360** MUST display phases + milestones + risks + blockers + tasks + work_orders tabs
- **WorkOrder360** MUST include work_order_tasks
- delivery_events + installation_events MUST be UI-accessible
- production_orders / work_centers / labor_logs / installation_teams / site_visits / punch_lists / drawings / bom_headers / revision_control each MUST have explicit decision

## 2. DISCOVERY

| layer | count |
|---|---:|
| DB tables execution.* | 19 |
| Registry models | 4 full + 14 partial |
| API routers | 31 (projects-*, work-order-*, task-*, delivery-*, installation-*, logistics-*) |
| Pages | 62 under /projects + /work-orders + /tasks + /logistics + /installation + /fabrication + /production |
| Menu entries | 51 |
| Dashboards | 3 registry; 1 connected |
| Reports | 2 connected + 4 hidden |
| Flows | 1 of 5 directly |

## 3. GAPS

| class | items |
|---|---|
| **planned_locked (11)** | project_tasks(alias), project_resources, project_risk_entries(alias), project_progress_logs, production_orders, production_steps, work_centers, labor_logs, machine_logs, material_consumption, scrap_logs, production_quality_checks, installation_orders, installation_tasks, installation_teams, schedules, site_visits, completion_reports, handover_documents, punch_lists, drawings, bom_headers, bom_items, revision_control, technical_specs, product_configurations, engineering_requests, approval_drawings |
| **wrong-schema** | projects, project_phases, signatures (registry schemas to fix) |
| **ghost tables** | project_risks, project_blockers, project_cost_plans, task_dependencies, task_attachments, work_order_tasks, work_order_qa_items, delivery_events, installation_events |
| **broken** | Project360 placeholder tabs; WorkOrder360 missing tasks tab |

## 4. ACTIONS

| action | items |
|---|---|
| recover_now | fix projects/phases/signatures registry schema; expose Project360 tabs; expose WorkOrder360 tasks tab |
| build_now (Phase 7) | all engineering models (8) + production models (8) + installation models (8) + service line |
| internal_only | task_attachments (covered by docs.attachments FK) |
| postpone | engineering_requests (after drawings MVP) |
| remove_from_registry | **N/A per ZERO LOSS** |

## 5. DEPLOYMENT

0/19 tables verified Supabase; 0 layers to GitHub — both pending.

## 6. COVERAGE

| metric | value |
|---|---|
| completion_percent | 28 |
| business_readiness | blocked |
| gate_status | blocked — Project360 and WorkOrder360 incomplete |
| red rows | 13 |
