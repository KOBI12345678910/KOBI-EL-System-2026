# Execution Domain — Permission Matrix

Generated: 2026-04-18
Scope: 29 execution entities (19 existing + 10 new via migration 00045).

All endpoints gated by `requireExecutionAuth` (JWT validated via `validateSession`). Role/permission checks layered via `req.permissions` from `permission-engine`.

## Endpoint → required capability

| Endpoint | Method | Capability | Notes |
|---|---|---|---|
| /api/execution/projects | GET | `execution.projects.read` | list, search, paginate |
| /api/execution/projects/:id | GET | `execution.projects.read` | single row |
| /api/execution/projects | POST | `execution.projects.create` | audit logged |
| /api/execution/projects/:id | PUT | `execution.projects.update` | audit logged |
| /api/execution/projects/:id | DELETE | `execution.projects.delete` | soft delete |
| /api/execution/projects/:id/transition-status | POST | `execution.projects.transition` | state change audited |
| /api/execution/project-phases | CRUD | `execution.project_phases.*` | |
| /api/execution/project-milestones | CRUD | `execution.project_milestones.*` | |
| /api/execution/project-risks | CRUD | `execution.project_risks.*` | |
| /api/execution/project-blockers | CRUD | `execution.project_blockers.*` | |
| /api/execution/project-cost-plans | CRUD | `execution.project_cost_plans.*` | finance-sensitive |
| /api/execution/project-resources | CRUD | `execution.project_resources.*` | |
| /api/execution/tasks | CRUD | `execution.tasks.*` | |
| /api/execution/tasks/:id/transition-status | POST | `execution.tasks.transition` | |
| /api/execution/task-dependencies | LIST/POST/DELETE | `execution.task_dependencies.*` | |
| /api/execution/task-comments | LIST/POST/DELETE | `execution.task_comments.*` | |
| /api/execution/task-attachments | LIST/POST/DELETE | `execution.task_attachments.*` | |
| /api/execution/work-orders | CRUD | `execution.work_orders.*` | |
| /api/execution/work-orders/:id/start | POST | `execution.work_orders.transition` | |
| /api/execution/work-orders/:id/complete-qa | POST | `execution.work_orders.qa` | |
| /api/execution/work-orders/:id/transition-status | POST | `execution.work_orders.transition` | |
| /api/execution/work-order-tasks | CRUD | `execution.work_order_tasks.*` | |
| /api/execution/work-order-qa-checklists | CRUD | `execution.work_order_qa_checklists.*` | |
| /api/execution/work-order-qa-items | CRUD | `execution.work_order_qa_items.*` | |
| /api/execution/delivery-events | CRUD | `execution.delivery_events.*` | |
| /api/execution/installation-events | CRUD | `execution.installation_events.*` | |
| /api/execution/logistics-orders | CRUD | `execution.logistics_orders.*` | |
| /api/execution/signatures | LIST/GET/POST | `execution.signatures.*` | append-only |
| /api/execution/alerts | CRUD | `execution.alerts.*` | |
| /api/execution/alerts/:id/acknowledge | POST | `execution.alerts.triage` | |
| /api/execution/alerts/:id/resolve | POST | `execution.alerts.triage` | |
| /api/execution/dependencies | CRUD | `execution.dependencies.*` | cross-entity graph |
| /api/execution/production-orders | CRUD | `execution.production_orders.*` | |
| /api/execution/production-orders/:id/release | POST | `execution.production_orders.release` | |
| /api/execution/production-orders/:id/complete | POST | `execution.production_orders.transition` | |
| /api/execution/work-centers | CRUD | `execution.work_centers.*` | admin-heavy |
| /api/execution/labor-logs | CRUD | `execution.labor_logs.*` | employee self-log |
| /api/execution/labor-logs/:id/submit | POST | `execution.labor_logs.transition` | |
| /api/execution/labor-logs/:id/approve | POST | `execution.labor_logs.approve` | manager role |
| /api/execution/installation-teams | CRUD | `execution.installation_teams.*` | admin-heavy |
| /api/execution/site-visits | CRUD | `execution.site_visits.*` | |
| /api/execution/site-visits/:id/start | POST | `execution.site_visits.transition` | |
| /api/execution/site-visits/:id/complete | POST | `execution.site_visits.transition` | |
| /api/execution/punch-lists | CRUD | `execution.punch_lists.*` | |
| /api/execution/punch-lists/:id/resolve | POST | `execution.punch_lists.transition` | |
| /api/execution/drawings | CRUD | `execution.drawings.*` | engineering |
| /api/execution/drawings/:id/approve | POST | `execution.drawings.approve` | engineering manager |
| /api/execution/bom-headers | CRUD | `execution.bom_headers.*` | engineering |
| /api/execution/bom-headers/:id/release | POST | `execution.bom_headers.release` | engineering manager |
| /api/execution/revision-control | CRUD | `execution.revision_control.*` | engineering |

## Role → default grants

| Role | Read | Create/Update | Approve / Release | Delete |
|---|---|---|---|---|
| `super_admin` | all | all | all | all |
| `project_manager` | all | projects, phases, milestones, tasks, work_orders, risks, blockers, cost_plans, resources, dependencies | project state transitions | own records |
| `production_manager` | production_*, work_orders, tasks, labor_logs, work_centers | production_orders, labor_logs, work_centers | production_orders/release, labor_logs/approve | — |
| `installation_manager` | installation_*, site_visits, punch_lists, teams | site_visits, punch_lists, installation_teams | installation transitions | — |
| `engineering_manager` | drawings, bom_headers, revision_control | drawings, bom_headers, revisions | drawings/approve, bom_headers/release | — |
| `field_worker` | own labor_logs, assigned tasks, assigned site_visits | labor_logs (own), task comments, site visit outcomes | — | — |
| `qa_inspector` | work_orders, work_order_qa_checklists, work_order_qa_items | qa checklists/items, complete-qa action | — | — |
| `sales` | projects (read), delivery_events (read) | — | — | — |
| `finance` | project_cost_plans, labor_logs (billable) | — | — | — |

## Audit trail

Every `INSERT` / `UPDATE` / `DELETE` on the following tables writes to `governance.audit_log` via the shared `logAudit` helper:
- execution.projects (high sensitivity)
- execution.work_orders (high sensitivity)
- execution.tasks (high sensitivity)
- All other execution tables log on state transitions (via the `execution.log_state_change` trigger in migration 00045 PART D).

## RLS

Row-level security is deferred to a dedicated RLS migration (follows project convention — see commercial_evidence_log.md §11). RLS policies will hook into `governance.is_org_member()` / `governance.has_project_access(project_id)` helpers.
