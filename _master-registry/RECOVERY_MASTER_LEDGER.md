# RECOVERY MASTER LEDGER — Techno-Kol Uzi ERP 2026

| Field | Value |
|---|---|
| Generated | 2026-04-18 |
| Scope | Entire monorepo `C:\Users\kobi\Projects\techno-kol-uzi-2026` |
| System version | v1.0.0 (per commit 689a22d) |
| Phase | 1 — Recovery Baseline Lock (in-progress → complete) |
| Author | recovery-agent |
| Mode | READ-ONLY on code; write-only on the 6 ledger files |
| Sources of truth (primary) | `supabase/migrations/*.sql`, `onyx-procurement/src/pipeline/*`, `erp-app/src/App.tsx`, `api-server/src/routes/index.ts` |
| Sources imported | AUDIT_REAL.md, DISCOVERY_RECOVERY_MAP.md, INVISIBLE_MENU_ITEMS.md, SYSTEM_360_SANITY.md, CONNECTIVITY_VALIDATION.md, FINAL_MERGE_REPORT.md, MERGE_REPORT.md, VAT_18_UPDATE.md, MISSING_MODELS_SCAN.md, INTEGRITY_REPORT.md, AB_VALIDATION.md + 12 JSON registries |

---

## 1. Baseline Inventory (verified from filesystem, 2026-04-18)

| Metric | Value | Source |
|---|--:|---|
| Supabase migrations | 42 | `supabase/migrations/*.sql` |
| `create table` statements | 235 | grep of migrations |
| Unique tables (schema.name) | 237 | AUDIT_REAL §0 + dedup |
| Schemas | 23 | AUDIT_REAL §1a |
| `create view` statements | 15 | grep (AUDIT_REAL reports 19 incl. dynamic) |
| `create function` statements (RPCs + triggers) | 165 | grep (AUDIT_REAL reports 143 RPCs after trigger filter) |
| FK `references` clauses | 385 | grep (AUDIT_REAL=346, CONNECTIVITY=386) |
| RLS policies | 213–302 | AUDIT_REAL=213 / CONNECTIVITY=302 drift |
| API route files | 328 (+ index.ts) | `api-server/src/routes/*.ts` |
| API mounts (in routes/index.ts) | 328 | grep `router.use(` in index.ts |
| API endpoints (aggregate decls) | 4,364 – 5,598 | AUDIT_REAL=4,364; CONNECTIVITY=5,598 / 5,313 unique |
| React `<Route>` declarations (App.tsx) | 1,262 | grep `erp-app/src/App.tsx` |
| React routes with `element={<X/>}` | 629 | regex |
| React routes unique paths (AUDIT_REAL) | 666 | AUDIT_REAL §0 |
| Page files under `erp-app/src/pages/**` | 1,166 (fs) / 1,164 (CONNECTIVITY) | `find` |
| Page component files (AUDIT_REAL scope) | 658 | AUDIT_REAL §0 |
| Menu seed migrations | 7 | 00017, 00034, 00035, 00036, 00038, 00039, 00040 |
| Menu entry INSERT rows | 1,289 | SYSTEM_360_SANITY §0 |
| Menu unique routes | 1,012 – 1,271 | SANITY=1,204; CONNECTIVITY=1,012; INVISIBLE=1,271 |
| Pipeline entities (entity-map.js) | 16 | AUDIT_REAL §0 |
| State machines | 13–15 | AUDIT_REAL=15; CLAUDE.md=13 |
| State transitions | 91–115 | AUDIT_REAL=115; CLAUDE.md=91 |
| Workflow flows | 5 | workflow-flows.js |
| Orchestrator actions | 18 | orchestrator.js |
| Page contracts (wiring-spec) | 9 | wiring-spec.js |
| Action→API mappings | 55 | wiring-spec.js |
| Cross-service contracts | 7 | wiring-spec.js |
| Entity relationships (ENTITY_RELATIONSHIPS) | 20 / 190 (pipeline strings) | wiring-spec.js |
| Registry models claimed | 342 | models_registry.json |
| Models delta (claimed – found) | 105 | 342 − 237 |
| Zod schema files | 419 | `lib-client/api-zod/src/**` |
| Reports in registry | 20 | reports_registry.json |
| Dashboards in registry | 10 | dashboards_registry.json |
| Automations in registry | 12 | automations_registry.json |
| Roles | 18 | roles_registry.json |
| Lifecycles | 7 | lifecycles_registry.json |

---

## 2. Findings imported (grouped by source report)

Every item below has at least one Evidence entry (E-id) in RECOVERY_EVIDENCE_MAP.md and one Task (T-id) in RECOVERY_TASK_BOARD.md. Decisions referenced by D-id live in RECOVERY_DECISION_LOG.md.

### 2.1 From AUDIT_REAL.md (forensic audit, 3,187 lines)

| # | Finding | E-id | T-id | D-id |
|---|---|---|---|---|
| A1 | 237 DB tables across 23 schemas | E001 | — | D001 |
| A2 | 342 models claimed by registry; 105 delta | E002 | T001 | D002 |
| A3 | Domain naming conflict — registry uses `crm/sales/projects/hr_workforce/production/ai_automation/engineering/installation`; migrations use `commercial/execution/workforce/intelligence/procurement/inventory/finance/docs` | E003 | T002 | D003 |
| A4 | 29 orphan tables (no FK in AND no FK out) | E004 | T003-T031 | D004 |
| A5 | 652 orphan pages (route registered, not in menu) | E005 | T032 | D005 |
| A6 | 223 duplicate risks (5 table + 15 route + 171 api + 32 menu) | E006 | T033 | D006 |
| A7 | 93 claimed models with no migration table | E007 | T034 | D002 |
| A8 | 7 source-of-truth conflicts (controlled meaning → no table) | E008 | T035 | D007 |
| A9 | 510 menu entries without frontend route | E009 | T036 | D008 |
| A10 | 5 duplicate CREATE TABLE statements (governance.roles/permissions/role_permissions/user_roles; analytics.dashboard_widgets) | E010 | T037-T041 | D006 |
| A11 | 15 route duplicates across App.tsx | E011 | T042 | D006 |
| A12 | 171 api handler duplicates | E012 | T043 | D006 |
| A13 | 32 menu route duplicates | E013 | T044 | D006 |
| A14 | 20 reports, 10 dashboards, 12 automations, 5 crons | E014 | — | — |
| A15 | 55 action→API mappings, 7 cross-service contracts | E015 | — | — |
| A16 | Registry domains (15) vs migration schemas (23) asymmetry | E016 | T045 | D003 |

### 2.2 From DISCOVERY_RECOVERY_MAP.md (508 lines, recovery mapping)

| # | Finding | E-id | T-id | D-id |
|---|---|---|---|---|
| DR1 | 30 hidden-but-existing models (29% of "missing") | E017 | T046 | D002 |
| DR2 | 12 wrong-schema pointers (customers, opportunities, quotes, approvals, projects, project_phases, employees, documents, document_versions, signatures, attachments, forecast_models) | E018-E029 | T047-T058 | D009 |
| DR3 | 14 has-API-route-no-DB (contacts, activities, meetings, milestones, items, reservations, schedules, contractors, assignments, templates, dashboards, reports, scorecards, users) | E030-E043 | T059-T072 | D010 |
| DR4 | 4 FE-page-no-DB (dependencies, drawings, raw_materials, teams) | E044-E047 | T073-T076 | D011 |
| DR5 | 17 duplicate models with different schema names | E048 | T077-T093 | D009 |
| DR6 | 119 dead orphan tables (no FK-in, no code reference) | E049 | T094 | D004 |
| DR7 | 75 truly-absent models (need full build) | E050 | T095-T169 | D012 |
| DR8 | 3 unmounted route files (dashboardRouter, finRouterRouter, savedPlacesRouter) | E051-E053 | T170-T172 | D013 |
| DR9 | 127 of 128 RPC functions not literally referenced | E054 | T173 | D014 |
| DR10 | 20 "Top Recovery Wins" (low complexity fixes) | E055 | T174 | — |

### 2.3 From INVISIBLE_MENU_ITEMS.md (1,618 lines)

| # | Finding | E-id | T-id | D-id |
|---|---|---|---|---|
| IMI1 | 779 total invisible items across MODEL/ENGINE/PAGE/EDGE/REPORT/DASHBOARD/WORKFLOW/STATE | E056 | T175 | D005 |
| IMI2 | 101 DB tables invisible (no menu entry) | E057 | T176-T276 | D005 |
| IMI3 | 455 React pages unreachable from menu (61% coverage) | E058 | T277 | D005 |
| IMI4 | 223 API engine modules without UI (32% coverage) | E059 | T278 | D005 |
| IMI5 | 14 of 20 registry reports not in menu | E060 | T279 | D015 |
| IMI6 | 10 of 10 dashboards lack canonical menu entry | E061 | T280 | D015 |
| IMI7 | 5 of 5 pipeline workflows have no menu entry | E062 | T281 | D015 |
| IMI8 | 13 of 13 state machines not configurable via UI | E063 | T282 | D015 |
| IMI9 | Analytics schema at 0% menu coverage | E064 | T283 | D005 |
| IMI10 | Docs/documents schemas at 12–17% coverage | E065 | T284 | D005 |

### 2.4 From SYSTEM_360_SANITY.md (226 lines)

| # | Finding | E-id | T-id | D-id |
|---|---|---|---|---|
| S360-1 | 33 DB tables missing from menu (18 high priority) | E066 | T285 | D005 |
| S360-2 | 451 menu routes w/ no `<Route>` in App.tsx | E067 | T286 | D008 |
| S360-3 | 496 routes w/o menu entry (pages invisible to nav) | E068 | T287 | D005 |
| S360-4 | 0 broken component refs | E069 | — | — |
| S360-5 | 0 uncovered `/api/*` paths in FE (1,137 all resolve) | E070 | — | — |
| S360-6 | 13 dead in-app links | E071 | T288-T300 | D016 |
| S360-7 | 43 orphan page files | E072 | T301 | D017 |
| S360-8 | 2 orphan API route files (fin-seed.ts, supplier-notification-trigger.ts) | E073 | T302-T303 | D017 |
| S360-9 | 6 menu miscategorizations (/receipts, /all-documents, /audit, /integrations, /webhooks, /cron) | E074 | T304-T309 | D005 |
| S360-10 | 14 leftover `/realestate/*` menu rows after 00036 | E075 | T310 | D005 |
| S360-11 | Migration 00040 adds 51 rows + 6 recategorizations | E076 | — | — |

### 2.5 From CONNECTIVITY_VALIDATION.md

| # | Finding | E-id | T-id | D-id |
|---|---|---|---|---|
| CV1 | 5 migrations w/ unbalanced parentheses (00010, 00011, 00012, 00015, 00016) | E077 | T311-T315 | D018 |
| CV2 | 4 pages w/ broken imports → `../../lib/utils` | E078 | T316-T319 | D019 |
| CV3 | ~285 duplicate API endpoint declarations | E079 | T320 | D006 |
| CV4 | 30 broken relative imports at code level | E080 | T321 | D019 |
| CV5 | 10/10 dashboards reference missing tables | E081 | T322 | D015 |
| CV6 | 17/20 reports reference missing schemas | E082 | T323 | D015 |
| CV7 | Pipeline entity-map ↔ registry drift (customer/lead/quote → commercial.* vs crm/sales.*) | E083 | T324 | D003 |
| CV8 | RLS drift (213 vs 302 depending on scan) | E084 | T325 | D020 |
| CV9 | VERDICT: high_risk_not_connected | E085 | — | — |

### 2.6 From INTEGRITY_REPORT.md, MISSING_MODELS_SCAN.md, FINAL_MERGE_REPORT.md, MERGE_REPORT.md, VAT_18_UPDATE.md, AB_VALIDATION.md

| # | Finding | E-id | T-id | D-id |
|---|---|---|---|---|
| INT1 | TypeScript compiles clean (api-server=0, erp-app=0, onyx-ai=0, techno-kol-ops=0) | E086 | — | — |
| INT2 | Unbalanced parens details + 30-import broken list | E087 | T315,T321 | D018 |
| VAT1 | VAT 17% → 18% update applied in 00037 | E088 | — | — |
| MR1 | Final merge manifest + delta verify complete | E089 | — | — |
| AB1 | A/B validation outcomes — acceptance criteria met | E090 | — | — |
| MM1 | MISSING_MODELS_SCAN captures 105 missing + 29 hidden | E091 | T001, T046 | D002 |

---

## 3. Unresolved queues (populated from findings)

See RECOVERY_FINAL_STATUS.json for machine-readable counts. Every queue item has an associated Task Board entry.

### 3.1 wrong_schema_pointers (12) — see T047–T058, D009

1. `crm.customers` → `commercial.customers` (T047)
2. `crm.leads` → `commercial.leads` / keep `crm.leads` (decision) (T048)
3. `sales.opportunities` → `commercial.opportunities` (T049)
4. `sales.quotes` → `commercial.quotes` (T050)
5. `sales.approvals` → `procurement.approvals` (T051)
6. `projects.projects` → `execution.projects` (T052)
7. `projects.project_phases` → `execution.project_phases` (T053)
8. `hr_workforce.employees` → `workforce.employees` (T054)
9. `documents.documents` → `docs.documents` (T055)
10. `documents.document_versions` → `docs.document_versions` (T056)
11. `documents.signatures` → `execution.signatures` (T057)
12. `documents.attachments` → `docs.attachments` (T058) — also `documents.forecast_models` → `intelligence.forecast_models` noted

### 3.2 hidden_existing_models (30) — T046–T076

12 wrong-schema + 14 has-api-route-no-db + 4 has-fe-call-no-db. Full enumeration in Evidence Map E017–E047.

### 3.3 duplicate_models (17) — T077–T093, D009

leads, customers, opportunities, quotes, approvals, projects, project_phases, suppliers, employees, documents, document_versions, signatures, attachments, forecast_models, notifications, work_orders, workflow_steps.

### 3.4 orphan_tables (29 primary; 119 extended) — T003–T031, T094

Primary list (29 from AUDIT_REAL): `analytics.kpi_snapshots`, `analytics.read_model_invalidations`, `analytics.rm_ai_summary`, `analytics.rm_executive_summary`, `analytics.rm_finance_summary`, `analytics.rm_operations_summary`, `analytics.rm_procurement_summary`, `analytics.rm_workforce_summary`, `comms.help_articles`, `commercial.quote_approval_rules`, `execution.signatures`, `finance.annual_tax_reports`, `finance.cashflow_entries`, `finance.consolidation_entries`, `finance.fx_rates`, `governance.config_entries`, `governance.escalation_rules`, `governance.health_checks`, `governance.idempotency_keys`, `governance.validations_log`, `intelligence.ai_insights`, `intelligence.forecast_models`, `intelligence.quality_scores`, `intelligence.seasonality_patterns`, `intelligence.trend_signals`, `orchestration.notifications`, `planning.demand_forecasts`, + per DISCOVERY 119 extended orphans list.

### 3.5 truly_missing_models (75) — T095–T169

Per DISCOVERY §H.4. Includes: lead_sources, communication_logs, customer_segments, quote_items, pricing_rules, discounts, sales_orders, sales_pipeline, purchase_requests, purchase_order_items, goods_receipts, stock_balances, stock_movements, batch_lots, production_orders, production_steps, work_centers, labor_logs, machine_logs, material_consumption, scrap_logs, production_quality_checks, installation_orders, installation_tasks, installation_teams, site_visits, completion_reports, handover_documents, punch_lists, service_tickets, warranty_records, service_visits, issue_categories, resolution_logs, maintenance_plans, service_feedback, sla_rules, invoice_items, expense_categories, profitability_snapshots, attendance_logs, payroll_inputs, performance_reviews, skill_matrix, document_links, generated_files, archive_records, kpi_definitions, report_sources, scenario_models, automation_rules, automation_runs, ai_agents, ai_actions, prediction_outputs, recommendation_logs, prompt_templates, orchestration_flows, change_logs, system_settings, validation_rules, data_quality_issues, project_tasks, project_resources, project_risk_entries, project_progress_logs, technical_specs, bom_headers, bom_items, revision_control, product_configurations, engineering_requests, approval_drawings, supplier_price_lists, procurement_approvals.

### 3.6 invisible_menu_items (779) — T175

101 models + 223 API engines + 455 pages + 14 reports + 10 dashboards + 5 workflows + 13 state machines = 821 (report says 779 after dedup).

### 3.7 broken_pages (4 runtime + 30 import-level) — T316–T321, D019

goods-receipt.tsx, purchase-requests.tsx, raw-materials.tsx, suppliers.tsx + 26 additional broken imports.

### 3.8 dead_links (13) — T288–T300, D016

/portal/customer/login (×2), /portal/customer/dashboard (×2), /ai-engine/chatbot-settings (×2), /executive/scorecard, /contracts/risk-scoring, /fin/income, /fin/expenses, /fin/activity, /logistics/tracking, /logistics/returns, /sales/crm-pipeline, /supply-chain/command-center, /ai-engine/cross-module.

### 3.9 duplicate_endpoints (~285) — T320, D006

GET /dashboard ×23, POST /init ×30, GET / ×8, POST / ×7, GET /:id ×6, PUT /:id ×8, GET /contracts ×4, POST /contracts ×4, GET /products ×4, GET /alerts ×4, etc.

### 3.10 duplicate_tables (5) — T037–T041, D006

governance.roles, governance.permissions, governance.role_permissions, governance.user_roles, analytics.dashboard_widgets.

### 3.11 source_of_truth_conflicts (7+) — T035, D007

crm.customers (missing), crm.contacts (missing), projects.projects (missing), sales.quotes (missing), procurement.suppliers (uncertain), inventory.stock_balances (missing), hr_workforce.employees (missing). Possibly extends to 11.

### 3.12 tables_without_rls (unknown — needs audit) — T325, D020

Scope of per-table RLS inventory deferred to Phase 4. analytics.rm_* layer lacks RLS (flagged).

### 3.13 broken_dashboards (10 of 10) — T322, D015

All 10 dashboards reference phantom schemas (projects/sales/hr_workforce/ai_automation/production).

### 3.14 broken_reports (17 of 20) — T323, D015

RPT-0001, 0007, 0008, 0011, 0012, 0013, 0014, 0015, 0016, 0018, 0019 + others referencing non-existent schemas.

### 3.15 menu_without_route (458) — T286, D008

### 3.16 routes_without_menu (496) — T287, D005

### 3.17 pages_without_route (535) — T287

### 3.18 unmounted_route_files (3) — T170–T172, D013

dashboard.ts, fin-router.ts, saved-places.ts.

### 3.19 orphan_api_route_files (2) — T302–T303, D017

fin-seed.ts, supplier-notification-trigger.ts.

### 3.20 orphan_pages (43) — T301, D017

### 3.21 sql_paren_mismatch (5) — T311–T315, D018

00010, 00011, 00012, 00015, 00016.

### 3.22 menu_miscategorizations (6) — T304–T309, D005

/receipts, /all-documents, /audit, /integrations, /webhooks, /cron (already queued by migration 00040).

### 3.23 pipeline_entity_misalignment (≥3) — T324, D003

customer/lead/quote entity-map bindings disagree with registry.

### 3.24 rls_policy_drift — T325, D020

213 vs 302 across two scans.

### 3.25 dead_rpcs (127 of 128) — T173, D014

---

## 4. Phase Status Tracker (1–12)

| Phase | Title | Status | Started | Completed | Notes |
|---|---|---|---|---|---|
| 1 | Recovery Baseline Lock | complete | 2026-04-18 | 2026-04-18 | 6 ledgers initialized |
| 2 | Canonical Schema Resolution | pending | — | — | Fix 12 wrong-schema pointers, lock naming (D003, D009) |
| 3 | Registry Reconciliation | pending | — | — | Align 342 registry models with 237 DB tables |
| 4 | RLS & Permissions Audit | pending | — | — | Resolve 213↔302 drift; per-table inventory |
| 5 | Duplicate Elimination | pending | — | — | 5 tables + 285 endpoints + 78 menu dups |
| 6 | Orphan Table Decision (wire or drop) | pending | — | — | 29 primary + 119 extended |
| 7 | Truly-Missing Build-Out | pending | — | — | 75 net-new tables |
| 8 | Menu↔Route↔Page Reconciliation | pending | — | — | 458 + 496 + 535 drift |
| 9 | Broken Import/Page Repair | pending | — | — | 4 runtime + 30 import errors |
| 10 | Dashboard & Report Rewiring | pending | — | — | 10 dashboards + 17 reports |
| 11 | Pipeline/Entity Alignment | pending | — | — | entity-map.js ↔ wiring-spec.js ↔ registry |
| 12 | Final Integrity Audit | pending | — | — | Re-emit AUDIT_REAL, INTEGRITY_REPORT, CONNECTIVITY_VALIDATION |

---

## phase_1_done

All sections above initialized. All findings from 3 primary + 3 secondary reports imported and indexed. See companion ledgers: RECOVERY_TASK_BOARD.md, RECOVERY_DECISION_LOG.md, RECOVERY_EVIDENCE_MAP.md, RECOVERY_CHANGELOG.md, RECOVERY_FINAL_STATUS.json.

---

## 5. Phase 1b — Full spec verification (2026-04-18)

| Field | Value |
|---|---|
| Trigger | User provided extensive spec pack (30 spec items) |
| Mode | Read-heavy; wrote only ledger + 1 verification doc + 1 categorization migration + 1 summary doc |

### 5.1 Spec items verified

30 / 30. Every spec item has a corresponding decision (D021–D050) with status `approved-by-user`. Index table at top of RECOVERY_DECISION_LOG.md.

### 5.2 Canonical domain × core_entities verification

- Enumerated 181 canonical entities across 11 domains (see CANONICAL_DOMAIN_VERIFICATION.md).
- 11 fully present (DB + registry + menu).
- 170 partial (missing registry or menu, mostly).
- 0 absent at DB layer — every canonical entity has a migration table.

### 5.3 13 required 360 pages

- 5 present: Customer360, Supplier360, Quote360, Project360, Employee360.
- 8 missing: WorkOrder360, PurchaseOrder360, Invoice360, Material360, Payment360, Contract360, Task360, Alert360.
- All 8 missing pages have a backing DB table ready.

### 5.4 Forgotten-model discovery

35 new forgotten models found (T326–T360). Categories:
- 25 DB tables with no registry and no menu (knowledge_cards, maintenance.*, planning.*, pricing.*, quality.*, routing.*, treasury.*, etc.).
- 1 duplicate risk: maintenance.work_orders vs execution.work_orders.

### 5.5 Menu recategorization

Migration `00041_menu_categorize_by_business_topic.sql` created — ~130 existing menu rows moved to their canonical top-level category via UPDATE parent_id (no INSERT, no DELETE).

### 5.6 Phase status after 1b

| Phase | Title | Status |
|---|---|---|
| 1 | Recovery Baseline Lock | done |
| 1b | Full Spec Verification + Gap Discovery | done |
| 2 | Canonical Schema Resolution | ready |
| 3 | Registry Reconciliation | pending |
| … | … | … |

### 5.7 Deliverables

- CANONICAL_DOMAIN_VERIFICATION.md (new)
- PHASE_1B_VERIFICATION_SUMMARY.md (new)
- 00041_menu_categorize_by_business_topic.sql (new)
- RECOVERY_DECISION_LOG.md (D021–D050 added)
- RECOVERY_TASK_BOARD.md (T326–T368 added)
- RECOVERY_EVIDENCE_MAP.md (forgotten-model evidence)
- RECOVERY_CHANGELOG.md (C007, C008, C009)
- RECOVERY_FINAL_STATUS.json (phase_1b = done, next_phase = 2 ready)

## phase_1b_done
