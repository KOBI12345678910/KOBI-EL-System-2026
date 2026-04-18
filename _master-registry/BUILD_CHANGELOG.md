# BUILD CHANGELOG — Techno-Kol Uzi ERP 2026

Forward-looking changelog for build-mode work. Separate from `RECOVERY_CHANGELOG.md` (C001–C014 historical).
Format: `B-C<NNN> | date | phase | type | description | evidence`

Types: `docs` | `decision` | `matrix` | `schema` | `data` | `code` | `deploy` | `release`

---

## Phase 1 — Ultra-Enterprise Baseline Lock

| ID | Date | Phase | Type | Description | Evidence |
|---|---|---|---|---|---|
| B-C001 | 2026-04-18 | 1 | docs | Created `BUILD_MASTER_LEDGER.md` — 15-phase + 10-layer map, RECOVERY cross-ref. | B-E001 |
| B-C002 | 2026-04-18 | 1 | docs | Created `BUILD_TASK_BOARD.md` — mirrored T001–T368 + added 6 build columns + 17 new B-tasks. | B-E002 |
| B-C003 | 2026-04-18 | 1 | decision | Created `BUILD_DECISION_LOG.md` — D001–D050 imported + B-D001–B-D015 added. | B-E003 |
| B-C004 | 2026-04-18 | 1 | docs | Created `BUILD_EVIDENCE_MAP.md` — 368 cross-refs + 25 new B-E entries. | B-E004 |
| B-C005 | 2026-04-18 | 1 | docs | Created `BUILD_CHANGELOG.md` (this file). | B-E005 |
| B-C006 | 2026-04-18 | 1 | docs | Created `BUILD_FINAL_STATUS.json` — 15 phase_tracker, L1–L10 layer_completion, 13-domain domain_completion. | B-E006 |
| B-C007 | 2026-04-18 | 1 | matrix | Created `MODEL_COVERAGE_MATRIX.md` — 237 DB tables + 16 pipeline entities + 105 registry-only delta rows. | B-E007 |
| B-C008 | 2026-04-18 | 1 | matrix | Created `MENU_ROUTE_COVERAGE_MATRIX.md` — summary + representative sample per B-D011; full 2000-row expansion deferred to Phase 8. | B-E008 |
| B-C009 | 2026-04-18 | 1 | matrix | Created `TABLE_DEPLOYMENT_MATRIX.md` — 237 rows with `deployed_to_supabase=pending — Phase 11`. | B-E009 |
| B-C010 | 2026-04-18 | 1 | docs | Created `LAYER_10_ARCHITECTURE_MAP.md` — 10 sections with counts, gaps, completion %. | B-E010 |
| B-C011 | 2026-04-18 | 1 | docs | Created 13 domain checklists under `_master-registry/domains/` (commercial, execution, procurement, inventory, finance, workforce, docs, intelligence, governance, analytics, orchestration, comms, support_schemas). | B-E011 |
| B-C012 | 2026-04-18 | 1 | docs | Created `PHASE_1_ENTERPRISE_SUMMARY.md` — one-page roll-up, readiness verdict. | B-E012 |

---

## Phase 7 — Truly-Missing Build-Out (incremental)

| ID | Date | Phase | Type | Description | Evidence |
|---|---|---|---|---|---|
| B-C013 | 2026-04-18 | 7 | schema | Commercial Mega Batch 00043 — +4 tables (lead_sources, customer_segments, sales_orders, pricing_rules) + ALTER enhancements + seeds. | B-E013 |
| B-C014 | 2026-04-18 | 7 | code | Commercial Zod + API + 4 pages + App.tsx wiring + permission matrix doc. | B-E014 |
| B-C015 | 2026-04-18 | 7 | schema | Procurement Mega Batch 00047 — +7 tables (supplier_contacts, goods_receipts, goods_receipt_lines, three_way_matches, approval_steps, supplier_evaluations, subcontractors) + po_receipts view + ALTERs to 10 existing procurement tables + seeds for approval_steps (tier1–4) + RLS baseline on 7 new tables + audit triggers for contracts/supplier_invoices. | B-E015 |
| B-C016 | 2026-04-18 | 7 | schema | Procurement Menu Wiring 00048 — 16 idempotent menu entries under "רכש וספקים" (suppliers, rfqs, purchase-orders, goods-receipts, three-way-match, supplier-invoices, supplier-evaluations, procurement-approvals, contracts, subcontractors + 360 pages + lines editors). | B-E016 |
| B-C017 | 2026-04-18 | 7 | code | Procurement Zod schemas — 18 files + _shared + index barrel under `lib-client/api-zod/src/procurement/`. | B-E017 |
| B-C018 | 2026-04-18 | 7 | code | Procurement API routes — 18 route files + aggregator `index.ts` under `api-server/src/routes/procurement/` with business endpoints (rfqs/:id/send, rfqs/:id/award/:bidId, purchase-orders/:id/approve, purchase-orders/:id/submit, goods-receipts with three-way-match trigger, three-way-matches/:id/resolve, supplier-invoices/:id/approve, approvals/:id/decide). Mounted at `/api/procurement/*` via `api-server/src/routes/index.ts`. | B-E018 |
| B-C019 | 2026-04-18 | 7 | code | Procurement pages — 14 v2 pages (SuppliersListPage, Supplier360, RFQsListPage, RFQ360, RFQItemsEditor, PurchaseOrdersListPage, PurchaseOrder360, PurchaseOrderLinesPage, GoodsReceiptsPage, ThreeWayMatchQueue, SupplierInvoicesPage, SupplierEvaluationsPage, ProcurementApprovalsQueue, Contract360, SubcontractorsPage) under `erp-app/src/pages/procurement/v2/` with Hebrew RTL + lazy-loaded + wouter routes appended to App.tsx. | B-E019 |
| B-C020 | 2026-04-18 | 7 | docs | Procurement permission matrix — `_master-registry/domains/procurement_permission_matrix.md` with 10 roles × 18 models. | B-E020 |

---

## Placeholder sections for Phases 2–15

### Phase 2 — Canonical Schema Resolution
(no entries yet)

### Phase 3 — Registry Reconciliation
(no entries yet)

### Phase 4 — RLS & Permissions Audit
(no entries yet)

### Phase 5 — Duplicate Elimination
(no entries yet)

### Phase 6 — Orphan Table Decision
(no entries yet)

### Phase 7 — Truly-Missing Build-Out

| ID | Date | Phase | Type | Description | Evidence |
|---|---|---|---|---|---|
| B-C080 | 2026-04-18 | 7 | schema | Migration `00045_execution_domain_complete.sql` — 10 new execution tables (project_resources, dependencies, production_orders, work_centers, labor_logs, installation_teams, site_visits, punch_lists, drawings, bom_headers, revision_control) + ALTER ADD-IF-NOT-EXISTS on 19 existing tables (is_deleted/is_active/record_code/notes/metadata/created_by/updated_by) + state-lifecycle CHECK constraints for projects/work_orders/tasks + audit triggers via `execution.log_state_change()` + seed for work_centers and installation_teams. Idempotent. | execution_evidence_log.md §3 §4 |
| B-C081 | 2026-04-18 | 7 | schema | Migration `00046_execution_menu_wiring.sql` — 18 app_menu entries under projects/production/installation/engineering categories. | execution_evidence_log.md §9 |
| B-C082 | 2026-04-18 | 7 | code | Zod schemas `lib-client/api-zod/src/execution/*.ts` — 29 entity files + `_shared.ts` + `index.ts` barrel. | commit log |
| B-C083 | 2026-04-18 | 7 | code | API routes `api-server/src/routes/execution/*.ts` — 29 routers + `_shared.ts` + `_crud-factory.ts` + `index.ts` aggregator mounted at `/api/execution`. CRUD + business endpoints (transition-status, start, complete-qa, acknowledge, resolve, release, approve). | commit log |
| B-C084 | 2026-04-18 | 7 | code | Frontend pages `erp-app/src/pages/execution/*.tsx` — 22 pages: ProjectsListPage, Project360 (with phases/milestones/risks/blockers/tasks/work_orders tabs per gate), ProjectRisksPage, ProjectBlockersPage, ProjectCostPlansPage, TasksListPage, Task360 (with sub-task nesting, status transitions, comments, attachments), WorkOrdersListPage, WorkOrder360 (with work_order_tasks editor per gate), WorkOrderTasksPage, DeliveryEventsPage, InstallationEventsPage, MaterialPlanningPage, Contract360, Alert360, ProductionOrdersPage, WorkCentersPage, LaborLogsPage, InstallationTeamsPage, SiteVisitsPage, PunchListsPage, DrawingsPage, BomHeadersPage, RevisionControlPage. Shared helpers `_list-helpers.tsx` + `_GenericListPage.tsx`. | commit log |
| B-C085 | 2026-04-18 | 7 | code | Wired pages into `erp-app/src/App.tsx` — 25 lazy imports + 29 `<Route>` entries placed ABOVE existing `/projects` and `/work-orders` redirects. | commit log |
| B-C086 | 2026-04-18 | 7 | docs | Created `_master-registry/domains/execution_permission_matrix.md` — endpoint → capability + role-based grant matrix. | execution_evidence_log.md §12 |
| B-C087 | 2026-04-18 | 7 | docs | Created `_master-registry/execution_evidence_log.md` — 12-section evidence trail. | — |

### Phase 8 — Menu/Route/Page Reconciliation
(no entries yet)

### Phase 9 — Broken Import/Page Repair
(no entries yet)

### Phase 10 — Dashboard & Report Rewiring
(no entries yet)

### Phase 11 — Supabase Deployment + GitHub Commit Gate
(no entries yet)

### Phase 12 — Pipeline/Entity Alignment
(no entries yet)

### Phase 13 — Final Integrity Audit
(no entries yet)

### Phase 14 — Business Readiness QA
(no entries yet)

### Phase 15 — Enterprise Lock & Release
(no entries yet)

---

## Phase 7 — Truly-Missing Build-Out (partial — Commercial Mega Batch)

Batch: `B-BATCH-COMMERCIAL-MEGA-01` — 2026-04-18

| ID | Date | Phase | Type | Description | Evidence |
|---|---|---|---|---|---|
| B-C100 | 2026-04-18 | 7 | docs   | Evidence log for commercial mega batch — patterns, conventions, decisions. | `_master-registry/commercial_evidence_log.md` |
| B-C101 | 2026-04-18 | 7 | schema | Migration 00043 — 4 new commercial tables (lead_sources, customer_segments, sales_orders, pricing_rules) + ALTER enhancements on 11 existing tables + seed data + updated_at triggers. | `supabase/migrations/00043_commercial_domain_complete.sql` |
| B-C102 | 2026-04-18 | 7 | schema | Migration 00044 — commercial menu wiring (17 entries under category 2 'מכירות ולקוחות'), idempotent. | `supabase/migrations/00044_commercial_menu_wiring.sql` |
| B-C103 | 2026-04-18 | 7 | code   | Zod schemas — commercial domain (5 files: lead-sources, customer-segments, sales-orders, pricing-rules, index). | `lib-client/api-zod/src/commercial/` |
| B-C104 | 2026-04-18 | 7 | code   | API routes — commercial domain (5 files: 4 CRUD routers + aggregator). Full auth + audit + validation. | `api-server/src/routes/commercial/` |
| B-C105 | 2026-04-18 | 7 | code   | Mount commercial aggregator at `/api/commercial` in `routes/index.ts`. | `api-server/src/routes/index.ts` |
| B-C106 | 2026-04-18 | 7 | code   | Frontend pages — commercial domain (4 pages: lead-sources, customer-segments, sales-orders, pricing-rules). | `erp-app/src/pages/commercial/` |
| B-C107 | 2026-04-18 | 7 | code   | App.tsx — 4 lazy imports + 4 `<Route>` declarations for `/commercial/*` paths. | `erp-app/src/App.tsx` |
| B-C108 | 2026-04-18 | 7 | docs   | Commercial permission matrix (RACI-style: role × endpoint, status-transition RACI). | `_master-registry/domains/commercial_permission_matrix.md` |

