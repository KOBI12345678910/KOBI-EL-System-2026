# System Connectivity Validation
Generated: 2026-04-18T12:31:33+03:00
Method: read-only scan of actual files (supabase migrations, api-server routes, erp-app pages, onyx-procurement pipeline, `_master-registry/*.json`). Registries treated as untrusted — cross-checked against code.
Scope: entire monorepo at `C:\Users\kobi\Projects\techno-kol-uzi-2026`

---

## A. connected_ok (positive counts — things that ARE connected)

- **models_count: 237** — derived from `grep -E "create table (if not exists )?<name>"` across 41 files in `supabase/migrations/*.sql` (deduped by schema.table). Prior `AUDIT_REAL.md:17` confirms 237.
- **tables_count: 237** — same source; in this codebase the `table` and `model` layers are 1:1 at the DB level.
- **pages_count: 1164** — derived from `find erp-app/src/pages -name "*.tsx"`. App.tsx uses `lazy(() => import('./pages/…'))` to wire 629 of these (see below).
- **routes_count (React `<Route path>`): 1262** — derived from `grep -cE "<Route\s+path=" erp-app/src/App.tsx` (2,602 lines). Of these, **629** are lazy-loaded page components (one-to-one) and **633** are aliases/redirects/duplicates.
- **forms_count: 87 files** — derived from `grep -lE "<form|useForm\(|handleSubmit" erp-app/src` (files containing forms). `useForm(` hook instances = 0 (forms use native handlers or Dialog patterns).
- **api_endpoints_count: 5,598 declarations / 5,313 unique** — derived from `grep -Eho "(router|app)\.(get|post|put|patch|delete)\s*\(\s*['\"]…" api-server/src/routes`. 430 route files; `AUDIT_REAL.md:22` claims 4,364 after aggregator dedup.
- **reports_count: 20** — `_master-registry/reports_registry.json` (RPT-0001 … RPT-0020). Each lists `sources[]`.
- **dashboards_count: 10** — `_master-registry/dashboards_registry.json` (DSH-0001 … DSH-0010). Each lists widgets + sources.
- **flows_count: 5** — `onyx-procurement/src/pipeline/workflow-flows.js` (WORKFLOW_FLOWS: Sales→Project, Procurement, Execution, Cash, Employee→Payroll). Matches `AUDIT_REAL.md:23`.

Supporting counts:
- **relationships (FK `references` clauses): 386** (ground truth `grep -iE "references\s+[a-zA-Z_\.]+"` in migrations; prior audit 346)
- **RLS policies: 302** (`create policy` rows); `AUDIT_REAL.md:36` claimed 213 — drift
- **RLS enable-statements: 265**
- **RPC functions: 143** (`create function` / `create or replace function`)
- **menu route string occurrences: 2,128**, **~1,012 unique menu routes** across seeds `00017/00034/00035/00036/00038/00039/00040`
- **pipeline entities: 16** in `entity-map.js`
- **state machines: 13–15 (with 91–115 transitions)** in `state-machines.js`
- **page contracts: 9**, **action→API mappings: 55**, **cross-service contracts: 7** in `wiring-spec.js`

---

## B. broken_connections (negative counts — things that are NOT connected)

| Category | Count | Evidence |
|---|---|---|
| pages_without_data | 455 | `_master-registry/INVISIBLE_MENU_ITEMS.md:11` (455/1164 page components not wired to menu). Top: `erp-app/src/pages/advanced/*`, `erp-app/src/pages/ai-engine/*`, `erp-app/src/pages/palantir/*`, `erp-app/src/pages/data-fabric/*`, `erp-app/src/pages/customer-service.tsx`, `erp-app/src/pages/models.tsx`, `erp-app/src/pages/queries.tsx`, `erp-app/src/pages/responses.tsx`, `erp-app/src/pages/operations-control-center.tsx`, `erp-app/src/pages/kimi-task-challenges.tsx` |
| pages_without_route | ~535 | 1164 pages - 629 lazy-imports in `erp-app/src/App.tsx`. Samples: `erp-app/src/pages/ApiHub.tsx`, `IntegrationHub.tsx`, `alert-terminal.tsx`, `ai-builder.tsx`, `bom-products.tsx`, `audit-log.tsx`, `document-builder.tsx`, `data-migration.tsx`, `forbidden.tsx`, `forgot-password.tsx`, `goods-receipt.tsx`, `governance.tsx`, `import-management.tsx`, `integration-builder.tsx`, `menu-builder.tsx`, `notification-routing.tsx`, `notifications.tsx`, `payroll.tsx`, `providers.tsx`, `purchase-orders.tsx` |
| routes_without_page | 496 | `INTEGRITY_REPORT.md:24` — 496 `<Route>` declarations without corresponding menu entry. Samples at `INTEGRITY_REPORT.md:49-69`: `/`, `/operations-control-center`, `/executive/war-room`, `/executive/order-lifecycle`, `/executive/ceo-dashboard`, `/executive/live-ops`, `/executive/company-health`, `/executive/kpi-board`, `/executive/live-alerts`, `/executive/financial-risk`, `/executive/operational-bottlenecks`, `/executive/delayed-projects`, `/executive/procurement-risk`, `/executive/production-efficiency`, `/executive/profitability`, `/executive/workforce-status`, `/products`, `/sales-orders`, `/manufacturing`, `/manufacturing/:rest*` |
| menu_without_route | 458 | `INTEGRITY_REPORT.md:23`. Samples at `INTEGRITY_REPORT.md:27-46`: `/operations`, `/workforce`, `/rfqs`, `/pos`, `/sales`, `/tax`, `/realestate`, `/intelligence`, `/system`, `/executive`, `/procurement-room`, `/workforce-room`, `/ai-room`, `/kpi`, `/leads`, `/quotes`, `/sales-funnel`, `/sales-leaders`, `/supplier-360`, `/rfq-360` |
| forms_without_real_target | uncertain (sample) | 87 files with forms scanned; no automated target-binding check performed in this pass. Candidate offenders (manual flag): `erp-app/src/pages/goods-receipt.tsx`, `erp-app/src/pages/purchase-requests.tsx`, `erp-app/src/pages/raw-materials.tsx`, `erp-app/src/pages/suppliers.tsx` — all have broken imports to `../../lib/utils` per `INTEGRITY_REPORT.md:110-113`, which means their UI likely fails to render, so any form binding within cannot be validated |
| fields_without_real_binding | uncertain | `fields_registry.json` has 22,290 lines but no automated binding check; prior `MISSING_MODELS_SCAN.md` and registry drift (below) suggests many field names reference non-existent tables (e.g. `crm.customers`, `sales.quotes`, `projects.projects`, `hr_workforce.employees` — all missing) |
| dashboards_without_source | 10 | All 10 dashboards in `_master-registry/dashboards_registry.json` reference sources in schemas `projects.*`, `sales.*`, `hr_workforce.*`, `ai_automation.*` that DO NOT EXIST in migrations. Ground-truth schemas are `execution.*`, `commercial.*`, `workforce.*`, `intelligence.*`. Every dashboard source currently resolves to a missing table. Sources touched: `projects.projects`, `projects.project_tasks`, `projects.milestones`, `sales.opportunities`, `sales.quotes`, `sales.sales_pipeline`, `hr_workforce.employees`, `hr_workforce.attendance_logs`, `hr_workforce.payroll_inputs`, `ai_automation.automation_runs`, `ai_automation.prediction_outputs`, `production.production_orders`, `production.scrap_logs`, `production.work_centers` (none exist) |
| reports_without_source | 17 of 20 | Same schema-naming issue. Only `finance.*` and `governance.*` source references land in real schemas. Offenders in `_master-registry/reports_registry.json`: RPT-0001 (projects.*, production.*), RPT-0006 (finance.invoice_items — exists), RPT-0007 (production.*), RPT-0008 (crm.*, sales.*), RPT-0010 (inventory.stock_movements — exists), RPT-0011 (hr_workforce.*), RPT-0012 (hr_workforce.*), RPT-0013 (service.* — schema exists but `service_tickets`/`sla_rules` uncertain), RPT-0014 (crm.*, sales.*, projects.*), RPT-0015 (procurement.supplier_price_lists uncertain), RPT-0016 (projects.*), RPT-0018 (inventory.*), RPT-0019 (installation.* — schema does not exist) |
| apis_without_unique_handler | ≥285 | `5,598 - 5,313 = 285` duplicate endpoint path strings. Top dupes: `router.get("/dashboard")` ×23, `router.post("/init")` ×21 (+9 single-quoted = 30), `router.get("/")` ×8, `router.post("/")` ×7, `router.get("/:id")` ×6, `router.put("/:id")` ×5 (+3 = 8), `router.put("/contracts/:id")` ×4, `router.post("/contracts")` ×4, `router.get("/contracts")` ×4, `router.get("/products")` ×4, `router.get("/alerts")` ×4. These collide only when mounted at the same prefix; mount path must be reviewed in `api-server/src/routes/index.ts` |
| tables_without_usage | 29 (orphan) + ~60 uncertain | `AUDIT_REAL.md:41` — 29 orphan tables (no FK in AND no FK out). Plus analytics.rm_* read-models with 0 FKs in/out (e.g. `analytics.rm_ai_summary`, `rm_executive_summary`, `rm_finance_summary`, `rm_operations_summary`, `rm_procurement_summary`, `rm_workforce_summary`, `analytics.kpi_snapshots`, `analytics.read_model_invalidations`) at `00000_master_schema.sql:2028-2088` and `00011_enterprise_expansion_30_more_tables.sql:563` |
| models_without_real_table | 93 | `AUDIT_REAL.md:44` — 93 registered models (of 342) have no backing migration table. Biggest naming clusters: entire `crm.*` domain (registry claims 22 models, migrations have `commercial.*`), entire `sales.*` domain (registry claims 24, migrations have `commercial.*`), entire `projects.*` domain (registry claims 30, migrations have `execution.*`), entire `hr_workforce.*` domain (registry claims 25, migrations have `workforce.*`), `production.*` (registry claims 11, migrations have most under `execution`), `engineering.*` (registry claims 8, no schema), `installation.*` (registry claims 8, no schema), `ai_automation.*` (registry claims 28, migrations have `intelligence.*`) |
| models_existing_but_unregistered | 101 | `INVISIBLE_MENU_ITEMS.md:8` — 101 DB tables have no user-facing menu/page. Includes quote_lines, purchase_order_lines, rfq_items, invoice_lines, payroll_entries, work_order_tasks, project_phases, dunning, collections, reconciliation exceptions, tax_records, vat_records, consolidation_entries, budget entries, `governance.permissions`, `governance.role_permissions`, `governance.object_permissions`, `governance.integration_connections`, `governance.escalation_rules`, `governance.saved_filters`, entire `analytics.*` read-model layer |
| source_of_truth_conflicts | 7+ (likely all 11) | `_master-registry/source_of_truth_registry.json` declares primary sources that DO NOT EXIST: `crm.customers`, `crm.contacts`, `projects.projects`, `sales.quotes`, `procurement.suppliers` (uncertain — schema `procurement` exists but `suppliers` table location needs verify), `inventory.stock_balances` (uncertain), `finance.invoices` (exists), `finance.payments` (exists), `service.service_tickets` (uncertain), `hr_workforce.employees` (does NOT exist; actual = `workforce.employees`), `governance.permissions` (exists). `AUDIT_REAL.md:45` counts 7 conflicts |

Additional broken connections found:

| Category | Count | Evidence |
|---|---|---|
| duplicate_tables | 5 | `grep ... | sort | uniq -c`: `governance.user_roles`, `governance.roles`, `governance.role_permissions`, `governance.permissions`, `analytics.dashboard_widgets` each declared in 2 migrations |
| sql_paren_mismatch | 5 migrations | `INTEGRITY_REPORT.md:75-80`: `00010`, `00011`, `00012`, `00015`, `00016` — may fail to apply cleanly |
| broken_imports | 30 | `INTEGRITY_REPORT.md:84`. Includes 4 page-level imports that fail at runtime: `goods-receipt.tsx`, `purchase-requests.tsx`, `raw-materials.tsx`, `suppliers.tsx` → `../../lib/utils` |
| pipeline_entity_to_table_misalignment | at least 3 | `onyx-procurement/src/pipeline/entity-map.js` declares 16 entities; `AUDIT_REAL.md:130-140` shows `customer`/`lead`/`quote` map to `commercial.*` tables, but registry/source-of-truth declare them as `crm.*`/`sales.*` — pipeline and registry disagree |

---

## C. highest_risk_items (top 20)

| # | item_name | file_path | risk_type | why_it_matters | blast_radius |
|---|---|---|---|---|---|
| 1 | schema namespace mismatch: registry vs migrations | `_master-registry/models_registry.json`, `source_of_truth_registry.json` vs `supabase/migrations/00000_master_schema.sql` | data-loss | 93 registered models point at non-existent schemas (`crm`, `sales`, `projects`, `hr_workforce`, `production`, `ai_automation`). Any API/report/dashboard that honours the registry will query nothing. | system-wide |
| 2 | all 10 dashboards reference missing tables | `_master-registry/dashboards_registry.json:1-162` | silent-failure | Executive/Operations/Procurement/Workforce/AI/Finance/Service/Projects/Production/Sales dashboards will return empty data — leadership dashboards look working but show no data. | system-wide |
| 3 | 17/20 reports reference missing schemas | `_master-registry/reports_registry.json` | silent-failure | Reporting layer largely broken against ground-truth DB. | cross-service |
| 4 | 5 migrations have unbalanced parentheses | `supabase/migrations/00010_*.sql`, `00011_*.sql`, `00012_*.sql`, `00015_*.sql`, `00016_*.sql` | runtime-error | Could prevent clean schema rebuild in fresh Supabase env; blocks CI re-provisioning. | system-wide |
| 5 | 4 pages import missing utils module | `erp-app/src/pages/goods-receipt.tsx`, `purchase-requests.tsx`, `raw-materials.tsx`, `suppliers.tsx` → `../../lib/utils` | runtime-error | Pages will crash on render; 4 P0 procurement flows broken in browser. | service |
| 6 | 5 duplicate CREATE TABLE declarations | migrations declaring `governance.roles`, `governance.role_permissions`, `governance.permissions`, `governance.user_roles`, `analytics.dashboard_widgets` twice | runtime-error | Migration 2 will fail or silently skip (IF NOT EXISTS) — risks divergence between dev and prod schema. | system-wide |
| 7 | ~285 duplicate API endpoint declarations | `api-server/src/routes/*.ts` (e.g. 23× `GET /dashboard`, 30× `POST /init`) | runtime-error | Depending on mount path in `index.ts`, later handler may shadow earlier; callers hit unpredictable logic. | cross-service |
| 8 | 458 menu entries with no route | menu seeds `00017/00034/00035/00036/00038/00039/00040` | runtime-error | Users clicking menu items hit 404/blank — "dead menu" (`INVISIBLE_MENU_ITEMS`). Includes `/sales`, `/workforce`, `/operations`, `/tax`, `/leads`, `/quotes`. | system-wide |
| 9 | 496 routes registered but not in menu | `erp-app/src/App.tsx:lines-various` | silent-failure | "Invisible features" — 629 lazy-loaded pages, only ~166 reachable via menu. Includes executive/ceo-dashboard, war-room, kpi-board. | system-wide |
| 10 | 455 page components unreachable from menu | `erp-app/src/pages/*` | silent-failure | 61% menu-page coverage per `INVISIBLE_MENU_ITEMS.md:21`. Wasted build + onboarding confusion. | system-wide |
| 11 | 101 DB tables without any UI | `INVISIBLE_MENU_ITEMS.md:8` | data-loss | Cannot audit/repair line-item data (quote_lines, payroll_entries, invoice_lines) without direct SQL. | system-wide |
| 12 | source_of_truth registry asserts primary tables that don't exist | `_master-registry/source_of_truth_registry.json:4-70` | inconsistency | Anti-duplication rules cannot be enforced; 7 controlled meanings lack any primary source. | system-wide |
| 13 | pipeline entity-map drift from registry | `onyx-procurement/src/pipeline/entity-map.js` (customer/lead/quote → commercial.*) vs registry (→ crm./sales.*) | inconsistency | API `/api/entity-map/:type` returns definitions that don't match registry 360 pages. | cross-service |
| 14 | RLS policy count drift | 302 policies in code vs `AUDIT_REAL.md:36` claim of 213 | permission-gap | Audit artifacts stale; reviewers cannot trust policy coverage figure. Need per-table RLS audit. | system-wide |
| 15 | 29 orphan tables (no FKs in/out) | per `AUDIT_REAL.md:41` | data-loss | Tables receive writes but no relational integrity; candidates for deletion or wiring. | single-page |
| 16 | 30 broken relative imports at code level | `INTEGRITY_REPORT.md:84-116` | runtime-error | TypeScript may compile but runtime `import()` fails or falls back to undefined. | service |
| 17 | entire `analytics.*` read-model layer invisible | `analytics.rm_*`, `analytics.kpi_snapshots`, `analytics.user_dashboard_boards` | silent-failure | Read-models exist but nothing queries/refreshes them — dashboard data stagnant. | cross-service |
| 18 | `installation.*` schema claimed by registry & report RPT-0019 but no schema exists | `_master-registry/models_registry.json` vs migrations | runtime-error | Installation completion report will error on first query. | service |
| 19 | governance admin surfaces missing | `governance.permissions`, `role_permissions`, `object_permissions`, `integration_connections`, `escalation_rules` (tables exist, no UI) | permission-gap | Role/permission edits require SQL; violates "no dead pages" rule for a P0 admin concern. | system-wide |
| 20 | docs/documents schemas 12-17% menu coverage | `INVISIBLE_MENU_ITEMS.md:33` | silent-failure | OCR, classification, extraction, signature, version history all invisible to business users. | service |

---

## D. fix_order (exact ordered list — NOT EXECUTED)

1. **schema_naming_conflicts** — files to edit: `_master-registry/models_registry.json`, `_master-registry/source_of_truth_registry.json`, `_master-registry/reports_registry.json`, `_master-registry/dashboards_registry.json`, `_master-registry/relationships_registry.json`, `_master-registry/fields_registry.json`, `onyx-procurement/src/pipeline/entity-map.js`, `onyx-procurement/src/pipeline/wiring-spec.js`. Choose one canonical naming: either migrations (`commercial/execution/workforce/intelligence`) or registry (`crm/sales/projects/hr_workforce/production/ai_automation`). The cheaper fix is to rename registry fields to match migrations (23 real schemas vs 15 claimed domains).
2. **duplicate_endpoints** — files to consolidate: `api-server/src/routes/index.ts` (review mount paths), then dedupe handlers in the top offenders: any route file with `GET /dashboard` (23 files), `POST /init` (30 files combined), `GET /`, `GET /:id`, `PUT /:id`, `GET /contracts`, `POST /contracts`, `GET /products`, `GET /alerts`. Cross-check with `api-server/src/routes/ai-orchestration/`, `api-server/src/routes/claude/`.
3. **duplicate_tables** — migrations: `00009_seed_roles_permissions.sql` (governance.roles/permissions/role_permissions/user_roles), `00021_dashboard_tables.sql` vs `00010_enterprise_expansion_30_tables.sql` (analytics.dashboard_widgets). Collapse via new migration `00041_remove_duplicate_table_declarations.sql`.
4. **orphan_tables** — next action per table: decide wire-or-drop for 29 orphans flagged in `AUDIT_REAL.md:41`, plus `analytics.rm_*` (6 tables) — either add refresh jobs + dashboard wiring or remove from schema. Targets: `analytics.rm_ai_summary`, `analytics.rm_executive_summary`, `analytics.rm_finance_summary`, `analytics.rm_operations_summary`, `analytics.rm_procurement_summary`, `analytics.rm_workforce_summary`, `analytics.kpi_snapshots`, `analytics.read_model_invalidations`.
5. **menu_routes_mismatch** — migration to write: `00041_menu_route_reconciliation.sql` covering: (a) delete/rename 458 menu items without routes, (b) add menu entries for the 496 routes that have pages but no menu. Priority: 16 `/executive/*` routes, `/operations-control-center`, `/sales-orders`, `/products`, `/manufacturing`, `/leads`, `/quotes`, `/sales`, `/workforce`, `/operations`, all 360-page siblings.
6. **forms_field_bindings** — files to rewire: top 4 runtime-breaking pages first: `erp-app/src/pages/goods-receipt.tsx`, `erp-app/src/pages/purchase-requests.tsx`, `erp-app/src/pages/raw-materials.tsx`, `erp-app/src/pages/suppliers.tsx` (fix `../../lib/utils` path). Then fields-registry re-bind for all `crm.*`/`sales.*`/`projects.*` form fields once §1 completes.
7. **dashboards_reports_sources** — registry files: `_master-registry/dashboards_registry.json`, `_master-registry/reports_registry.json`. Point every `sources[]` entry at an existing migration table (e.g. `projects.projects` → `execution.projects`, `sales.quotes` → `commercial.quotes`, `hr_workforce.employees` → `workforce.employees`, `production.production_orders` → `execution.production_orders` if present).
8. **permissions_rls** — tables missing RLS: run per-table audit; at minimum add RLS to all `analytics.rm_*` read-models, `analytics.kpi_snapshots`, `analytics.read_model_invalidations`, `analytics.dashboard_definitions`. Verify all tables touched by migrations `00010`, `00011`, `00027` have matching `00014_rls_policies_expansion_tables.sql` and `00029_enterprise_30_tables_rls.sql` coverage.
9. **entity_files_reconciliation** — pipeline files: `onyx-procurement/src/pipeline/entity-map.js`, `wiring-spec.js`, `state-machines.js`, `workflow-flows.js`, `orchestrator.js`, `pipeline-engine.js`. Align 16 entity names with canonical schema names chosen in §1, ensure 55 action→API mappings in `wiring-spec.js` actually hit live `api-server/src/routes/*.ts` handlers.
10. **final_integrity_audit** — script to produce confirmation: `scripts/audit-connectivity.mjs` (new). Must emit updated versions of `AUDIT_REAL.md`, `INTEGRITY_REPORT.md`, `INVISIBLE_MENU_ITEMS.md`, `CONNECTIVITY_VALIDATION.md` and exit non-zero on any category with count > 0.

---

## E. VERDICT

**high_risk_not_connected**

Justification: the system has the scaffolding of a Palantir-grade ERP (237 tables, 1,164 pages, 5,313 unique API endpoints, 16 pipeline entities, 13 state machines, 5 flows, 20 reports, 10 dashboards, 302 RLS policies) but connectivity is fragmented along three severe axes. **(1) Schema-namespace collision** — the `_master-registry/*` layer (models, source_of_truth, dashboards, reports, fields) names primary domains as `crm/sales/projects/hr_workforce/production/ai_automation`, yet the actual migrations name them `commercial/execution/workforce/intelligence`; this makes 93 of 342 registered models (27%) point at non-existent tables, breaks 10/10 dashboards, and breaks 17/20 reports. **(2) Menu ↔ route ↔ page three-way drift** — 458 menu entries have no route, 496 routes have no menu, and 455 of 1,164 page components are unreachable from navigation, meaning roughly 40-60% of features are either dead links or invisible. **(3) Duplicate declarations at every layer** — 5 duplicate CREATE TABLE statements, ~285 duplicate Express endpoint strings, 5 migrations with unbalanced parentheses, 30 broken relative imports, and 4 pages that will crash at runtime — each a latent production incident. The system is not "fully connected" and not even "partially connected" in a safe operational sense; shipping any feature against the registry today risks querying phantom tables.

---

*Produced by read-only scan. No source files were modified. See `_master-registry/AUDIT_REAL.md`, `INTEGRITY_REPORT.md`, `INVISIBLE_MENU_ITEMS.md` for deeper per-table detail.*
