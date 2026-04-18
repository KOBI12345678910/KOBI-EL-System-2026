# Execution Mega Batch — Evidence Log

Generated: 2026-04-18
Scope: 29 execution models. Read-first evidence before writing migrations / Zod / API / pages / route wiring.

## 1. Auth middleware
- `api-server/src/middleware/auth.ts:44` exports `authMiddleware(req,res,next)` — JWT from cookie or Bearer.
- `api-server/src/middleware/auth.ts:18` declares `req.userId: number`.
- `api-server/src/routes/crm.ts:16` shows an alternative in-file `requireAuth` via `validateSession` + `resolveUserPermissions`.
- Convention chosen for execution routes: `router.use("/execution", requireAuth)` with per-router local `requireAuth` derived from `validateSession` (matches `crm.ts:16-29`) — keeps us aligned with permission engine hooks.

## 2. DB client
- `@workspace/db` exports `db`.
- Drizzle `sql` / `sql.raw` from `drizzle-orm`.
- `db.execute(sql\`…\`)` returns `{ rows: T[] }`.
- All execution tables use `bigserial` PK + `bigint` FKs + `governance.users_profile(id)` for audit columns.
- `governance.set_updated_at()` trigger fn (`supabase/migrations/00000_master_schema.sql` / confirmed in use at line 105 of 00043).
- `governance.generate_public_id()` default for `public_id uuid`.

## 3. Existing execution.* tables (evidence — `00000_master_schema.sql:800-1004`)
| Table | Key columns |
|---|---|
| `execution.projects` | id, public_id, project_number (unique), project_name, customer_id, quote_id, contract_id, project_type, location_name, address_line_1, city, region, owner_user_id, budget_amount, actual_cost, billed_amount, collected_amount, progress_percent, priority, planned_start_date, planned_end_date, actual_start_date, actual_end_date, billable, state ('Planning'), internal_notes, external_notes, audit |
| `execution.project_phases` | id, project_id, phase_code, phase_name, phase_order, planned/actual dates, progress_percent, state, unique(project_id, phase_order) |
| `execution.project_milestones` | id, project_id, phase_id, milestone_name, due_date, achieved_at, state ('pending') |
| `execution.work_orders` | id, public_id, work_order_number (unique), project_id, title, description, location_name, required/actual dates, progress_percent, quality_status, signature_status, state ('Open'), owner_user_id, assigned_team_name, audit |
| `execution.work_order_tasks` | id, work_order_id, task_name, description, sequence_order, assignee_user_id, due_date, completed_at, state ('Open') |
| `execution.tasks` | id, public_id, task_number (unique), title, description, priority, due_date, assignee_user_id, assignee_employee_id, linked_entity_type, linked_entity_id, state ('Open'), audit |
| `execution.task_dependencies` | id, predecessor_task_id, successor_task_id, dependency_type, unique(predecessor, successor) |
| `execution.logistics_orders` | id, public_id, logistics_number, project_id, work_order_id, warehouse_id, destination_name, destination_address, scheduled_at, delivered_at, state ('planned') |
| `execution.delivery_events` | id, project_id, work_order_id, logistics_order_id, delivered_at, delivered_by_user_id, received_by_name, notes |
| `execution.installation_events` | id, project_id, work_order_id, installed_at, installed_by_user_id, notes |
| `execution.signatures` | id, public_id, entity_type, entity_id, signer_name, signer_role, signed_at, signature_payload, document_id, notes |
| `execution.alerts` | id, public_id, alert_number (unique), category, severity, parent_entity_type, parent_entity_id, title, description, assigned_to_user_id, source_ai_insight_id, source_anomaly_case_id, state ('Open'), acknowledged_at, resolved_at |

Additional: `project_risks`, `project_blockers`, `project_cost_plans`, `task_comments`, `task_attachments`, `work_order_qa_checklists`, `work_order_qa_items` — 7 extra tables referenced in domain doc but present in migration expansions (00010/00011/00027).

## 4. MISSING — 10 new tables to build
1. `execution.project_resources`
2. `execution.dependencies` (project-level cross-entity dependencies)
3. `execution.production_orders`
4. `execution.work_centers`
5. `execution.labor_logs`
6. `execution.installation_teams`
7. `execution.site_visits`
8. `execution.punch_lists`
9. `execution.drawings` (engineering)
10. `execution.bom_headers` (engineering) + `execution.revision_control`

## 5. Route mount convention
- `api-server/src/routes/index.ts:130` — `const router = Router()` aggregator.
- `router.use(xRouter)` — each router sets its own `/api/...` paths OR we mount `router.use("/execution", executionRouter)` and the execution aggregator uses relative paths.
- Mounted later by `app.ts` behind `/api` prefix.

## 6. Frontend pattern
- `erp-app/src/App.tsx` — wouter `<Switch>/<Route>` tree with lazy imports + `<PageLoader />` Suspense fallback.
- Pages: RTL `dir="rtl"`, Hebrew labels, shadcn `Card`/`Button`/`Input`/`Table`/`Dialog`, `@tanstack/react-query`, `authFetch` from `@/lib/utils`, icons from `lucide-react`.

## 7. Zod pattern (from commercial)
- `lib-client/api-zod/src/commercial/lead-sources.ts` — exports `CreateX`, `UpdateX`, `ReadX`, `ListXQuery` + TS types. Uses `z.coerce` for query params.

## 8. Audit helper
- `api-server/src/lib/audit-log.ts` — `logAudit({ user_id, user_name, table_name, record_id, action, old_values, new_values, ip_address, notes })`. Reused.

## 9. Menu
- `public.app_menu(id bigserial, label, route unique?, icon, parent_id, order_index)`.
- Category hints: "פרויקטים" / "ייצור" / "התקנה" / "הנדסה" exist via 00041 categorization. Inserts via `on conflict (route) do nothing`.

## 10. State lifecycles (per D014 and domain doc)
- project: `draft → planning → in_progress → on_hold → completed → closed`
- work_order: `draft → approved → in_progress → qa → done → closed`
- task: `backlog → in_progress → review → done → blocked|cancelled`
- delivery_event: `scheduled → in_transit → delivered → confirmed`
- installation_event: `scheduled → en_route → installed → signed_off`

## 11. File targets
- `supabase/migrations/00045_execution_domain_complete.sql` — 10 new tables + ALTERs + audit triggers + seed.
- `supabase/migrations/00046_execution_menu_wiring.sql` — ~22 menu entries.
- `lib-client/api-zod/src/execution/*.ts` — 29 schemas + index barrel.
- `api-server/src/routes/execution/*.ts` — 29 routers + index aggregator.
- `api-server/src/routes/index.ts` — mount `executionRouter`.
- `erp-app/src/pages/execution/*.tsx` — 22 pages.
- `erp-app/src/App.tsx` — lazy imports + routes.
- `_master-registry/domains/execution_permission_matrix.md`
- `_master-registry/BUILD_CHANGELOG.md`, `BUILD_TASK_BOARD.md`, `BUILD_FINAL_STATUS.json`

## 12. Deferred
- RLS policies on new tables — follow project convention (added by dedicated RLS migration later).
- `maintenance.work_orders` view over `execution.work_orders` — verified as deferred to 00041; re-asserted in 00045 via CREATE OR REPLACE VIEW guard.
