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
| B-C021 | 2026-04-18 | 7 | schema | Analytics Mega Batch 00061 — ALTER 14 existing analytics tables (audit cols) + CREATE 4 missing (kpi_definitions, report_definitions, report_runs, drilldown_paths) with CHECK lifecycles (report_run 4-state / invalidation 3-state) + RLS baseline + indexes + seed 7 kpi_definitions (revenue_mtd/expenses_mtd/gross_profit_mtd/headcount/open_invoices/overdue_invoices/inventory_value). | B-E021 |
| B-C022 | 2026-04-18 | 7 | schema | Analytics Menu Wiring 00062 — 9 idempotent menu entries under "דשבורד" (/dashboards, /dashboards/:id, /reports, /reports/:id, /kpi-definitions, /kpi-snapshots, /drilldown-paths, /read-model-invalidations, /custom-metrics). | B-E022 |
| B-C023 | 2026-04-18 | 7 | code | Analytics Zod — 10 files (`_shared`, `dashboards`, `dashboard-widgets`, `reports`, `kpi-definitions`, `kpi-snapshots`, `drilldown-paths`, `read-model-invalidations`, `custom-metrics`, `rm-summaries`) + barrel under `lib-client/api-zod/src/analytics/`; subpath export `./analytics` added to package.json. | B-E023 |
| B-C024 | 2026-04-18 | 7 | code | Analytics API — 10 files (`_helpers` + 9 routers + aggregator) under `api-server/src/routes/analytics/`. All use `_safe-list-helpers` (zero raw user-string interpolation). Business endpoints: POST /reports/:id/run, POST /kpi-definitions/:id/compute, POST /read-model-invalidations/:id/reprocess, POST /dashboards/:id/export (CSV/PDF). Mounted at `/api/analytics/*` via routes/index.ts. Legacy flat-file analytics-engine / business-analytics / dashboard-kpi / dashboard-stats preserved untouched. | B-E024 |
| B-C025 | 2026-04-18 | 7 | code | Analytics pages — 8 pages + shared helper (DashboardsListPage, DashboardBuilderPage, ReportsListPage, ReportDetailPage, KPIDefinitionsPage, KPISnapshotsPage, DrilldownPathsPage, ReadModelInvalidationsPage) under `erp-app/src/pages/analytics/` with Hebrew RTL + loading/error/empty states + lazy-loaded + wouter routes appended to App.tsx. | B-E025 |
| B-C026 | 2026-04-18 | 7 | docs | Analytics permission matrix — `_master-registry/domains/analytics_permission_matrix.md` with 4 roles × 9 modules + status lifecycles + RLS baseline. | B-E026 |

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

#### Intelligence Mega Batch (00057/00058)

| ID | Date | Phase | Type | Description | Evidence |
|---|---|---|---|---|---|
| B-C100 | 2026-04-18 | 7 | schema | Migration `00057_intelligence_domain_complete.sql` — ALTER 13 existing intelligence tables (ai_insights, anomaly_cases, decision_recommendations, forecast_models, trend_signals, seasonality_patterns, quality_scores, agent_registry, agent_jobs, model_registry, model_executions, recommendation_feedback, anomaly_feedback) adding canonical audit cols (is_deleted/is_active/record_code/notes/metadata/created_by/updated_by + status where needed) + CREATE prompt_templates (uuid PK) + CREATE orchestration_flows (uuid PK, trigger_type/status CHECK) + status-lifecycle CHECKs (ai_insight, anomaly_case, decision_recommendation, agent_job, model_execution, orchestration_flow) + FK/status/created_at indexes + audit triggers (ai_insights, decision_recommendations, quality_scores, model_executions, recommendation_feedback, anomaly_feedback) + RLS on all 15 tables with 3 policies each (authenticated_read, analyst_write, admin_delete). Idempotent. | B-E100 |
| B-C101 | 2026-04-18 | 7 | schema | Seed data in 00057 — 4 orchestration_flows (lead_to_insight, invoice_to_anomaly_scan, stock_to_reorder, payroll_to_anomaly) + 6 prompt_templates (customer_summary, quote_recommendation, anomaly_explanation, forecast_summary, payroll_check, procurement_evaluation), all with Hebrew text. | B-E101 |
| B-C102 | 2026-04-18 | 7 | schema | Migration `00058_intelligence_menu_wiring.sql` — 11 idempotent menu entries under "בינה מלאכותית" (ai-insights, anomalies, recommendations, forecast-models, agents, agent-jobs, executive-war-room, predictive-analytics, process-mining, prompt-templates, orchestration-flows). | B-E102 |
| B-C103 | 2026-04-18 | 7 | code | Zod schemas `lib-client/api-zod/src/intelligence/*.ts` — 15 entity files + `_shared.ts` + `index.ts` barrel. Added `./intelligence` subpath export to `lib-client/api-zod/package.json`. | B-E103 |
| B-C104 | 2026-04-18 | 7 | code | API routes `api-server/src/routes/intelligence/*.ts` — 15 route files + `_helpers.ts` (wraps `_safe-list-helpers`) + `index.ts` aggregator mounted at `/api/intelligence/*` via `api-server/src/routes/index.ts`. Uses drizzle `sql` tagged templates with `buildSafeWhere`/`buildSafeOrderByFragment`/`buildSafeSetClause` — no raw user-string interpolation. Business endpoints: ai-insights/:id/{acknowledge,action,dismiss}, anomaly-cases/:id/{resolve,false-positive}, decision-recommendations/:id/{accept,reject}, agent-jobs/enqueue, agent-jobs/:id/cancel, model-executions/:id/rerun, orchestration-flows/:id/trigger, prompt-templates/:id/test-run. Legacy flat-file routes in `api-server/src/routes/` (ai-*, agent-*, anomaly-*, ai-orchestration/) untouched. | B-E104 |
| B-C105 | 2026-04-18 | 7 | code | Pages `erp-app/src/pages/intelligence/*.tsx` — 9 pages (AIInsightsPage, AnomalyCasesPage, RecommendationCenterPage, ForecastModelsPage with model_executions drilldown, AgentRegistryPage, AgentJobsPage with enqueue + cancel, OrchestrationFlowsPage with trigger, PromptTemplatesPage with test-run, ProcessMiningPage read-only) + `_shared.tsx` (useList, useSearchState, StatusBadge, Pagination, Loading/Error/Empty). Hebrew RTL. Lazy-loaded + 9 `<Route>` entries appended to `erp-app/src/App.tsx`. | B-E105 |
| B-C106 | 2026-04-18 | 7 | docs | Created `_master-registry/domains/intelligence_permission_matrix.md` — 3 roles × endpoint grant matrix with RLS + status lifecycles. | B-E106 |

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
| C021   | 2026-04-18 | 7 | code   | Fixed SQLi in `commercial/sales-orders.ts` LIST handler via parameterized bindings — replaced `sql.raw` + hand-rolled quote escaping with `sql` template fragments joined via `sql.join`, added explicit whitelist for `order_by`/`order_dir` identifier slots. Preserved API contract and all filters (q, status, customer_id, quote_id, from_date, to_date). Same unsafe pattern still present in `customer-segments.ts`, `pricing-rules.ts`, `lead-sources.ts` — flagged in B-D033 for follow-up. | `api-server/src/routes/commercial/sales-orders.ts` |

---

## Phase 7 — Foundation Fix (safe subset) — 2026-04-18

Batch: `B-BATCH-FOUNDATION-FIX-01`

| ID | Date | Phase | Type | Description | Evidence |
|---|---|---|---|---|---|
| C015 | 2026-04-18 | 7 | code   | Created `tsconfig.base.json` at repo root with strict settings (ES2022, strict:true, noImplicitReturns:true). Note: `api-server/tsconfig.json` references `../../tsconfig.base.json` which from `api-server/` resolves one level outside repo root — pre-existing path drift, documented in B-D034, not changed this pass. | `tsconfig.base.json` |
| C016 | 2026-04-18 | 7 | code   | Fixed syntax error in `api-server/src/routes/ai-agents-system.ts` — added missing `,` after `ceo_advisor` object (line 257 `}` → `},`) before `// ─── 20 QA Testing Agents` comment and next object literal at line 259. Resolves `error TS1005: ',' expected.` | `api-server/src/routes/ai-agents-system.ts:257` |
| C017 | 2026-04-18 | 7 | code   | Removed insecure JWT/ENCRYPTION_KEY default fallbacks in `api-server/src/lib/security-upgrade.ts`. Replaced `\|\|` default-string with fail-fast `throw` at module import time. Previous fallbacks `"default_jwt_secret_change_in_production_2026"` / `"default_encryption_key_32chars!!"` would otherwise sign tokens and encrypt 2FA secrets with shipped constants if env vars unset. Downstream usages (lines 66, 172, 183, 409) retain type narrowing. | `api-server/src/lib/security-upgrade.ts:16-25` |
| C018 | 2026-04-18 | 7 | docs   | Verified `erp-app/package.json` already contains `@tailwindcss/typography` (devDeps) and `wouter` (deps). No changes required. | `erp-app/package.json` |
| C019 | 2026-04-18 | 7 | decision | Documented 3 BLOCKED items in BUILD_DECISION_LOG §5: B-D030 (authMiddleware global mount), B-D031 (30 VAT literal replacements), B-D032 (AR/AP gross/net asymmetry). Each includes required sign-offs and interim mitigations. | `_master-registry/BUILD_DECISION_LOG.md` §5 |
| C020 | 2026-04-18 | 7 | docs   | Produced `FOUNDATION_FIX_REPORT.md` — 4 fixes applied, 3 blocked for review. tsc delta measurements, validation checklist. | `_master-registry/FOUNDATION_FIX_REPORT.md` |

## Phase 7 — Finance Tier 1 (Option 1 — Tight Deliverable)

Batch: `B-BATCH-FINANCE-TIER1-01` — 2026-04-18

| ID | Date | Phase | Type | Description | Evidence |
|---|---|---|---|---|---|
| B-F001 | 2026-04-18 | 7 | code   | Fix P1 — export `getVatRateForDate`, `VAT_RATE`, `VAT_RATE_PRIOR`, `VAT_EFFECTIVE_FROM` from `israeli-accounting-engine.ts` (line 35). Enables downstream finance routes to resolve VAT per invoice date without hardcoding. | `api-server/src/routes/israeli-accounting-engine.ts:27-35` |
| B-F002 | 2026-04-18 | 7 | schema | Migration 00051 — Finance domain complete: ALTER housekeeping columns on 18 existing finance.* tables; CREATE 6 new tables (payment_allocations, dunning_campaigns, dunning_steps, collection_actions, reconciliation_exceptions, reminder_schedules) w/ FK indexes, audit triggers, RLS + 3 policies each; CHECK constraints for state lifecycles (invoices/payments/collection_cases); invoice totals-integrity trigger; fx_rates seed ILS/USD/EUR/GBP baseline. | `supabase/migrations/00051_finance_domain_complete.sql` |
| B-F003 | 2026-04-18 | 7 | schema | Migration 00052 — Finance menu wiring: 23 idempotent entries under category 6 (כספים), including Invoice 360 `/invoices/:id` and Payment 360 `/payments/:id`. | `supabase/migrations/00052_finance_menu_wiring.sql` |
| B-F004 | 2026-04-18 | 7 | code   | Zod barrel + 6 critical schemas under `lib-client/api-zod/src/finance/`: invoice (strict total invariant ±0.01), invoice-line (line math helper `computeInvoiceLineTotals`), payment (method/status enums), vat-record (+ PCN836/PCN874 export payload), tax-record, fx-rate (+ bulk upsert). Exported via new `./finance` sub-path in `package.json`. | `lib-client/api-zod/src/finance/`, `lib-client/api-zod/package.json` |
| B-F005 | 2026-04-18 | 7 | code   | API route files — finance domain (4 files: `invoices.ts`, `payments.ts`, `vat-records.ts`, `index.ts` aggregator). CRUD + state transitions; invoice `issue`/`void` + embedded line CRUD with auto-recompute; payment `reconcile`/`allocate`/`refund`; VAT `/export` produces PCN836/PCN874/CSV payload and writes `finance.tax_exports` audit row. Auth + audit on every mutation. `getVatRateForDate` looked up live from issue_date. | `api-server/src/routes/finance/{invoices,payments,vat-records,index}.ts` |
| B-F006 | 2026-04-18 | 7 | code   | Mount finance aggregator at `/api/v2/finance` in `routes/index.ts` (side-by-side with legacy `/finance` from `finance.ts`). Named import `financeV2Router` to avoid clash with existing `financeRouter` identifier. | `api-server/src/routes/index.ts:133, 789` |
| B-F007 | 2026-04-18 | 7 | code   | Invoice360 page — Hebrew RTL, embedded invoice-lines editor (add/remove/edit with live VAT-rate math), actions: issue / send to customer / void, status timeline, KPI header (subtotal/discount/vat/grand/paid/balance), notes panel. Non-draft invoices lock lines. | `erp-app/src/pages/finance/Invoice360.tsx` |
| B-F008 | 2026-04-18 | 7 | code   | Payment360 page — Hebrew RTL, allocation panel (link-to-invoice table + add row), reconcile (bank match) action, refund action with amount+reason prompt, remaining-to-allocate KPI. | `erp-app/src/pages/finance/Payment360.tsx` |
| B-F009 | 2026-04-18 | 7 | code   | App.tsx — added 2 lazy imports (FinanceInvoice360 / FinancePayment360) + 2 Routes (`/invoices/:id`, `/payments/:id`) in authenticated Switch. Appended, no destructive edits. | `erp-app/src/App.tsx:1174-1176, 1895-1897` |
| B-F010 | 2026-04-18 | 7 | matrix | Finance permission matrix — RACI-style per endpoint × role (viewer/ap_clerk/ar_clerk/finance_mgr/cfo/admin); invoice + payment state-transition RACI; deferred Tier 2+ list. | `_master-registry/domains/finance_permission_matrix.md` |


## Phase 7 — Governance Tier (Admin Domain Mega-Batch)

Batch: `B-BATCH-GOVERNANCE-01` — 2026-04-18

| ID | Date | Phase | Type | Description | Evidence |
|---|---|---|---|---|---|
| B-G001 | 2026-04-18 | 7 | docs   | `_master-registry/governance_evidence_log.md` — Step 1 evidence (safe-list helpers, 00019/00047 mirrors, auth middleware, audit-log, zod barrel). | `_master-registry/governance_evidence_log.md` |
| B-G002 | 2026-04-18 | 7 | schema | Migration 00059 — Governance domain complete: ALTER 8 existing tables (users_profile, roles, permissions, role_permissions, user_roles, audit_logs, config_entries, health_checks) with housekeeping columns; CREATE 22 missing tables; CHECK constraints for 4 status lifecycles (webhook_delivery, integration_sync, sla_timer, queue_job); audit triggers on 14 governance-sensitive tables; targeted indexes on audit_logs / webhook_deliveries / queue_jobs / sla_timers hot paths; RLS + 3 baseline policies per new table; seed 6 feature_flags + 5 escalation_rules (NO role/permission reseed). | `supabase/migrations/00059_governance_domain_complete.sql` |
| B-G003 | 2026-04-18 | 7 | schema | Migration 00060 — Governance menu wiring: 21 idempotent entries under "מערכת / הרשאות / Audit / אינטגרציות". | `supabase/migrations/00060_governance_menu_wiring.sql` |
| B-G004 | 2026-04-18 | 7 | code   | Zod barrel + 8 schema modules under `lib-client/api-zod/src/governance/` (_shared, users, roles, audit, webhooks, integrations, feature-flags, ops). Exported via `./governance` sub-path. | `lib-client/api-zod/src/governance/`, `lib-client/api-zod/package.json` |
| B-G005 | 2026-04-18 | 7 | code   | 22 API route files under `api-server/src/routes/governance/` plus `_helpers.ts`. Every router installs `authMiddleware + adminMiddleware`. LIST handlers use `_safe-list-helpers` (no `sql.raw` with user input). Business endpoints: `POST /users/:id/assign-role`, `POST /users/:id/revoke-role`, `POST /webhooks/:id/test-delivery`, `POST /integrations/:id/sync-now`, `POST /queue-jobs/:id/retry`, `POST /sla-timers/:id/extend`, `POST /escalation-rules/trigger`. | `api-server/src/routes/governance/*.ts` |
| B-G006 | 2026-04-18 | 7 | code   | Mount governance aggregator at `/api/governance` in `routes/index.ts`. | `api-server/src/routes/index.ts` |
| B-G007 | 2026-04-18 | 7 | code   | 18 React admin pages under `erp-app/src/pages/governance/` using shared `_GovernanceTable` shell (Hebrew RTL, status badges). Interactive actions wired for webhooks (test), integrations (sync-now), queue-jobs (retry), validations-log (resolve). | `erp-app/src/pages/governance/*.tsx` |
| B-G008 | 2026-04-18 | 7 | code   | App.tsx — 18 lazy imports + 18 Routes appended (no destructive edits) for governance surfaces. | `erp-app/src/App.tsx` |
| B-G009 | 2026-04-18 | 7 | matrix | Governance permission matrix — SA/A/Aud per endpoint × surface. System roles/permissions are read-only for A (SA only for mutation). audit_logs is append-only. | `_master-registry/domains/governance_permission_matrix.md` |
| B-G010 | 2026-04-18 | 7 | docs   | Reserved migrations: 00059 + 00060 consumed. Registry gate §4 for governance: 8 RED rows closed (escalation_rules, integration_connections, integration_sync_logs, object_permissions, webhook_endpoints, config_entries, webhook_deliveries, feature_flags admin surface). | `_master-registry/domains/governance.md` |

## Phase 7 — Docs Mega Batch

Batch: `B-BATCH-DOCS-01` — 2026-04-18

| ID | Date | Phase | Type | Description | Evidence |
|---|---|---|---|---|---|
| B-DO001 | 2026-04-18 | 7 | schema | Migration 00055 — Docs domain complete: ALTER housekeeping columns (is_deleted, is_active, record_code, notes, metadata, created_by, updated_by) on 6 existing docs.* tables (documents, document_classifications, ocr_results, attachments, print_jobs, scan_sessions); CREATE 9 new tables (document_versions, document_signature_requests, ocr_runs, extraction_runs, classification_runs, document_chunks, entity_extractions, document_relations, knowledge_cards) w/ FK indexes, audit triggers, RLS + 3 policies each; CHECK constraints for document.status (5 values), signature_request.status (5 values), *_run.status (4 values), document_relations.relation_type (4 values); seed docs.document_classifications with 8 core labels. | `supabase/migrations/00055_docs_domain_complete.sql` |
| B-DO002 | 2026-04-18 | 7 | schema | Migration 00056 — Docs menu wiring: 11 idempotent entries under "מסמכים" category (/documents, /documents/:id, /documents/:id/versions, /attachments, /ocr-center, /ocr-runs, /extraction-runs, /classification-runs, /signature-requests, /knowledge-cards, /document-relations). | `supabase/migrations/00056_docs_menu_wiring.sql` |
| B-DO003 | 2026-04-18 | 7 | code | Zod schemas — 15 files + `_shared.ts` + `index.ts` barrel under `lib-client/api-zod/src/docs/`; canonical status enums (DocumentStatusSchema, SignatureRequestStatusSchema, RunStatusSchema, RelationTypeSchema); Create / Update / Read / ListQuery schemas per model. Exported via new `./docs` sub-path in `package.json`. | `lib-client/api-zod/src/docs/`, `lib-client/api-zod/package.json` |
| B-DO004 | 2026-04-18 | 7 | code | API route files — 15 route files + `_helpers.ts` + `index.ts` aggregator under `api-server/src/routes/docs/`. Every file `router.use(authMiddleware)` at top; imports from `../_safe-list-helpers` for `buildSafeOrderBy`/`safeLimit`/`safeOffset`. Full CRUD per model. Business endpoints: POST `/documents/:id/classify`, POST `/documents/:id/request-signature`, POST `/signature-requests/:id/record-signature`, POST `/ocr-runs` (enqueue + updates docs.documents.ocr_status), POST `/extraction-runs` (enqueue), POST `/knowledge-cards/generate-from-document/:id`. Mounted at `/api/docs/*` via `api-server/src/routes/index.ts`. | `api-server/src/routes/docs/{*,index}.ts`, `api-server/src/routes/index.ts:134,142` |
| B-DO005 | 2026-04-18 | 7 | code | Docs pages — 10 v2 pages (DocumentsListPage, Document360 w/ 7 tabs, DocumentVersionsPage, AttachmentsPage, OCRCenterPage dashboard, OCRRunsPage, ExtractionRunsPage, ClassificationRunsPage, SignatureRequestsPage, KnowledgeCardsPage card grid) under `erp-app/src/pages/docs/v2/` with Hebrew RTL + loading/error/empty/pagination + `_shared.tsx` (query hooks + StatusBadge + Pagination + SearchBar). Wired via 10 lazy imports + 10 wouter Routes appended to App.tsx. | `erp-app/src/pages/docs/v2/`, `erp-app/src/App.tsx` |
| B-DO006 | 2026-04-18 | 7 | docs | Docs permission matrix — `_master-registry/domains/docs_permission_matrix.md` with roles × endpoints for 15 docs models + business actions. | `_master-registry/domains/docs_permission_matrix.md` |

## Phase 7 — Orchestration Mega Batch

Batch: `B-BATCH-ORCH-01` — 2026-04-18

| ID | Date | Phase | Type | Description | Evidence |
|---|---|---|---|---|---|
| B-OR001 | 2026-04-18 | 7 | schema | Migration 00063 — Orchestration domain complete: ALTER 7 existing `orchestration.*` tables from 00024 (workflow_definitions, workflow_steps, workflow_runs, workflow_step_runs, job_queue, universal_inbox, notifications) with canonical housekeeping columns (public_id, is_active, metadata, created_by, updated_by) AND bridge `state → status` with backfill; CREATE 3 missing tables (workflow_triggers with trigger_type CHECK, inbox_assignments, step_comments); CHECK constraints on 5 status lifecycles (workflow_run, workflow_step_run, job_queue, universal_inbox, notification); RLS + 3 baseline policies per table; indexes on FK + status + scheduled_at hot paths; seed 3 example workflow_definitions (customer_onboarding, invoice_approval, procurement_approval) + 12 steps + 3 sample triggers. Idempotent. | `supabase/migrations/00063_orchestration_domain_complete.sql` |
| B-OR002 | 2026-04-18 | 7 | schema | Migration 00064 — Orchestration menu wiring: 6 idempotent entries under "תזמור ותהליכים" category (/workflows, /workflow-runs, /workflow-triggers, /job-queue, /universal-inbox, /notifications). | `supabase/migrations/00064_orchestration_menu_wiring.sql` |
| B-OR003 | 2026-04-18 | 7 | code   | Zod schemas — 7 files + `_shared.ts` + `index.ts` barrel under `lib-client/api-zod/src/orchestration/` (workflow-definitions, workflow-runs, workflow-triggers, job-queue, universal-inbox, notifications); canonical status enums (WorkflowRunStatusSchema, WorkflowStepRunStatusSchema, JobQueueStatusSchema, InboxStatusSchema, NotificationStatusSchema, TriggerTypeSchema). Exported via new `./orchestration` sub-path in `package.json`. | `lib-client/api-zod/src/orchestration/`, `lib-client/api-zod/package.json` |
| B-OR004 | 2026-04-18 | 7 | code   | API route files — 8 files (`_helpers.ts`, `workflow-definitions.ts`, `workflow-runs.ts`, `workflow-triggers.ts`, `job-queue.ts`, `universal-inbox.ts`, `notifications.ts`, `index.ts`) under `api-server/src/routes/orchestration/`. Every router installs `authMiddleware`; admin-only routers (workflow-triggers, workflow-definitions write, job-queue create, universal-inbox create/reassign, notifications create) additionally install `adminMiddleware`. LIST handlers use `_safe-list-helpers` (no `sql.raw` with user input). Business endpoints: `POST /workflows/:id/trigger`, `POST /workflow-runs/:id/{pause,resume,cancel}`, `POST /workflow-triggers/:id/enable`, `POST /job-queue/:id/{retry,cancel}`, `POST /universal-inbox/:id/{claim,resolve,dismiss,reassign}`, `POST /notifications/:id/{mark-read,dismiss}`, `POST /notifications/mark-all-read`. Legacy `agent-orchestration.ts` + `ai-orchestration/` directory untouched. Mounted at `/api/orchestration` in `routes/index.ts`. | `api-server/src/routes/orchestration/{*,index}.ts`, `api-server/src/routes/index.ts` |
| B-OR005 | 2026-04-18 | 7 | code   | 7 React pages under `erp-app/src/pages/orchestration/` using shared `_OrchestrationTable` shell (Hebrew RTL, OrchStatusBadge, formatHe): WorkflowDefinitionsPage (admin), WorkflowRunsPage (pause/resume/cancel), WorkflowRunDetailPage (step tree + jobs), JobQueuePage (retry/cancel), UniversalInboxPage (work queue: claim/resolve/dismiss), NotificationsPage (mark-read/dismiss/mark-all-read), WorkflowTriggersPage (admin toggle). 7 lazy imports + 9 Routes appended to App.tsx (no destructive edits). | `erp-app/src/pages/orchestration/`, `erp-app/src/App.tsx` |
| B-OR006 | 2026-04-18 | 7 | matrix | Orchestration permission matrix — SA/A/U/Own per endpoint × surface. Workflow execution surfaces open to every authenticated user; workflow definition / trigger surfaces admin-only. Own-record filtering at UI layer (DB-level RLS tightening planned). | `_master-registry/domains/orchestration_permission_matrix.md` |
| B-OR007 | 2026-04-18 | 7 | docs   | Reserved migrations: 00063 + 00064 consumed. Registry gate for orchestration: 3 RED rows closed (workflow_triggers, inbox_assignments, step_comments) plus canonical status unification across 5 lifecycles. Legacy `api-server/src/routes/agent-orchestration.ts` and `ai-orchestration/` directory preserved unchanged per scope contract. | `_master-registry/domains/orchestration.md` |
