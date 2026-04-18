# RECOVERY EVIDENCE MAP

| Field | Value |
|---|---|
| Generated | 2026-04-18 |
| Scope | All claims from AUDIT_REAL, DISCOVERY_RECOVERY_MAP, INVISIBLE_MENU_ITEMS, SYSTEM_360_SANITY, CONNECTIVITY_VALIDATION, INTEGRITY_REPORT, MISSING_MODELS_SCAN, VAT_18_UPDATE, AB_VALIDATION, FINAL/MERGE reports |
| Entry count | 325 |

Each row: `id | claim | evidence_files | claim_type | confidence`.

---

## Core system counts (E001–E016)

| id | claim | evidence_files | claim_type | confidence |
|---|---|---|---|---|
| E001 | 237 unique DB tables across 23 schemas | `_master-registry/AUDIT_REAL.md:17,54-78`, `supabase/migrations/00000_master_schema.sql:55-2100`, `supabase/migrations/00010_*:1-800`, `supabase/migrations/00011_*:1-700`, `supabase/migrations/00027_*:1-600` | table_exists | high |
| E002 | models_registry.json claims 342; 105 delta vs DB | `_master-registry/models_registry.json`, `_master-registry/AUDIT_REAL.md:18,44`, `DISCOVERY_RECOVERY_MAP.md:7,12-14` | registry_claims | high |
| E003 | Registry domains (crm/sales/projects/hr_workforce/production/engineering/installation/ai_automation) do not exist as schemas | `_master-registry/AUDIT_REAL.md:102-106`, `_master-registry/models_registry.json` | schema_mismatch | high |
| E004 | 29 orphan tables (no FK in AND no FK out) | `_master-registry/AUDIT_REAL.md:41`, §10 | orphan | high |
| E005 | 652 orphan pages (routes registered, not in menu) | `_master-registry/AUDIT_REAL.md:42` | route_orphan | high |
| E006 | 223 duplicate risks (5 table + 15 route + 171 api + 32 menu) | `_master-registry/AUDIT_REAL.md:43` | duplicate | high |
| E007 | 93 claimed models without migration table | `_master-registry/AUDIT_REAL.md:44` | registry_claims | high |
| E008 | 7 source-of-truth conflicts | `_master-registry/AUDIT_REAL.md:45`, `_master-registry/source_of_truth_registry.json` | source_of_truth_conflict | high |
| E009 | 510 menu entries without frontend route | `_master-registry/AUDIT_REAL.md:46` | menu_orphan | high |
| E010 | 5 duplicate CREATE TABLE declarations | `supabase/migrations/00000_master_schema.sql:71-129`, `supabase/migrations/00009_seed_roles_permissions.sql`, `supabase/migrations/00010_enterprise_expansion_30_tables.sql:371-425`, `supabase/migrations/00021_dashboard_tables.sql:28`, `_master-registry/CONNECTIVITY_VALIDATION.md:54` | duplicate_table | high |
| E011 | 15 duplicate `<Route path>` across App.tsx | `_master-registry/AUDIT_REAL.md:43`, `erp-app/src/App.tsx` | duplicate_route | medium |
| E012 | 171 duplicate API handler (mount-prefix) declarations | `_master-registry/AUDIT_REAL.md:43`, `api-server/src/routes/index.ts` | duplicate_endpoint | high |
| E013 | 32 duplicate menu rows | `_master-registry/AUDIT_REAL.md:43`, menu seed migrations | duplicate_menu | medium |
| E014 | 20 reports, 10 dashboards, 12 automations, 5 crons | `_master-registry/reports_registry.json`, `dashboards_registry.json`, `automations_registry.json`, `onyx-procurement/vm-task-runner/src/jobs.js` | registry_claims | high |
| E015 | 55 action→API mappings, 7 cross-service contracts | `onyx-procurement/src/pipeline/wiring-spec.js` | pipeline_contract | high |
| E016 | 15 registry domains vs 23 migration schemas | `_master-registry/AUDIT_REAL.md:54-100`, `SUMMARY.txt` | schema_mismatch | high |

## Hidden existing models (E017–E047)

| id | claim | evidence_files | claim_type | confidence |
|---|---|---|---|---|
| E017 | 30 hidden-but-existing models | `_master-registry/DISCOVERY_RECOVERY_MAP.md:12,18-22,77-122` | schema_mismatch | high |
| E018 | customers exists at commercial.customers (not crm.customers) | `supabase/migrations/00000_master_schema.sql:358` | wrong_schema | high |
| E019 | opportunities exists at commercial.opportunities/crm.opportunities (not sales.opportunities) | `supabase/migrations/00000_master_schema.sql:449`, `supabase/migrations/00027_enterprise_30_tables.sql:69` | wrong_schema | high |
| E020 | quotes exists at commercial.quotes (not sales.quotes) | `supabase/migrations/00000_master_schema.sql:467` | wrong_schema | high |
| E021 | approvals exists at procurement.approvals (not sales.approvals) | `supabase/migrations/00000_master_schema.sql:659` | wrong_schema | high |
| E022 | projects exists at execution.projects (not projects.projects) | `supabase/migrations/00000_master_schema.sql:802` | wrong_schema | high |
| E023 | project_phases exists at execution.project_phases | `supabase/migrations/00000_master_schema.sql:836` | wrong_schema | high |
| E024 | employees exists at public.employees or workforce.employees (not hr_workforce.employees) | `supabase/migrations/*`, `_master-registry/DISCOVERY_RECOVERY_MAP.md:88` | wrong_schema | high |
| E025 | documents exists at docs.documents (not documents.documents) | `supabase/migrations/00000_master_schema.sql:1679` | wrong_schema | high |
| E026 | document_versions at docs.document_versions | `supabase/migrations/00010_enterprise_expansion_30_tables.sql:589` | wrong_schema | high |
| E027 | signatures at execution.signatures | `supabase/migrations/00000_master_schema.sql:972` | wrong_schema | high |
| E028 | attachments at docs.attachments | `supabase/migrations/00000_master_schema.sql:1723` | wrong_schema | high |
| E029 | forecast_models at intelligence.forecast_models | `supabase/migrations/00000_master_schema.sql:1957` | wrong_schema | high |
| E030 | contacts has API route, no DB table | `api-server/src/routes/supplier-details.ts`, `api-server/src/routes/suppliers.ts` | no_table | medium |
| E031 | activities has API route, no DB table | `api-server/src/routes/crm-ultimate.ts` | no_table | medium |
| E032 | meetings — route, no table | `api-server/src/routes/crm-ultimate.ts`, `api-server/src/routes/hr-enterprise.ts` | no_table | medium |
| E033 | milestones — route, no table | `api-server/src/routes/projects-module.ts`, `api-server/src/routes/route-aliases.ts` | no_table | medium |
| E034 | items (inventory) — route, no table | `api-server/src/routes/delivery-returns.ts`, `api-server/src/routes/dispatch-planning.ts`, `api-server/src/routes/finance-enterprise.ts` | no_table | medium |
| E035 | reservations — route, no table | `api-server/src/routes/quote-builder.ts` | no_table | medium |
| E036 | schedules — route, no table | `api-server/src/routes/ai-agents-system.ts`, `api-server/src/routes/bi-scheduled-reports.ts`, `api-server/src/routes/cashflow-management.ts` | no_table | medium |
| E037 | contractors — route, no table | `api-server/src/routes/contractor-payment-engine.ts`, `api-server/src/routes/hr.ts`, `api-server/src/routes/payroll-module.ts` | no_table | medium |
| E038 | assignments — route, no table | `api-server/src/routes/hr-enterprise.ts`, `api-server/src/routes/sla-management.ts`, `api-server/src/routes/work-orders.ts` | no_table | medium |
| E039 | templates — route, no table | `api-server/src/routes/ai-prompt-templates.ts`, `api-server/src/routes/communication-marketing-engine.ts`, `api-server/src/routes/contract-templates.ts` | no_table | medium |
| E040 | dashboards — route, no table | `api-server/src/routes/bi-dashboards.ts` | no_table | medium |
| E041 | reports — route, no table | `api-server/src/routes/ai-business-automation.ts`, `api-server/src/routes/crm-analytics-sync.ts`, `api-server/src/routes/external-api.ts` | no_table | medium |
| E042 | scorecards — route, no table | `api-server/src/routes/shipping-freight.ts`, `api-server/src/routes/supplier-intelligence-new.ts` | no_table | medium |
| E043 | users — route, no table (needs governance.users view over auth.users) | `api-server/src/routes/audit-log.ts`, `api-server/src/routes/auth.ts`, `api-server/src/routes/chat.ts` | no_table | medium |
| E044 | dependencies — FE page, no table | `erp-app/src/pages/supply-chain/bom-where-used/dependencies*` | no_table | medium |
| E045 | drawings — FE page, no table | `erp-app/src/pages/engineering/drawing-management/*`, `erp-app/src/pages/engineering/engineering-command-center/*`, `erp-app/src/pages/engineering/engineering-office/*` | no_table | medium |
| E046 | raw_materials — FE page, no table | `erp-app/src/pages/procurement/raw_materials_dashboard*`, `erp-app/src/pages/procurement/raw_materials_list*` | no_table | medium |
| E047 | teams — FE page, no table | `erp-app/src/pages/fabrication/*`, `erp-app/src/pages/installation/*` | no_table | medium |

## Duplicate models (E048)

| id | claim | evidence_files | claim_type | confidence |
|---|---|---|---|---|
| E048 | 17 duplicate models with different schema names (leads, customers, opportunities, quotes, approvals, projects, project_phases, suppliers, employees, documents, document_versions, signatures, attachments, forecast_models, notifications, work_orders, workflow_steps) | `_master-registry/DISCOVERY_RECOVERY_MAP.md:237-254` | duplicate_model | high |

## Orphan tables (E049)

| id | claim | evidence_files | claim_type | confidence |
|---|---|---|---|---|
| E049 | 119 orphan tables with no FK-in and no code reference | `_master-registry/DISCOVERY_RECOVERY_MAP.md:257-379` | orphan_extended | high |

## Truly missing models (E050)

| id | claim | evidence_files | claim_type | confidence |
|---|---|---|---|---|
| E050 | 75 truly-absent registry models need full build (DB+API+FE+registry) | `_master-registry/DISCOVERY_RECOVERY_MAP.md:475`, §B rows categorized truly_absent | missing_model | high |

## Unmounted route files (E051–E053)

| id | claim | evidence_files | claim_type | confidence |
|---|---|---|---|---|
| E051 | dashboardRouter imported but not mounted | `api-server/src/routes/index.ts`, `api-server/src/routes/dashboard.ts` | unmounted_route | high |
| E052 | finRouterRouter imported but not mounted | `api-server/src/routes/index.ts`, `api-server/src/routes/fin-router.ts` | unmounted_route | high |
| E053 | savedPlacesRouter imported but not mounted | `api-server/src/routes/index.ts`, `api-server/src/routes/saved-places.ts` | unmounted_route | high |

## Dead RPCs (E054)

| id | claim | evidence_files | claim_type | confidence |
|---|---|---|---|---|
| E054 | 127 of 128 RPC functions never referenced by literal name in api-server source | `_master-registry/DISCOVERY_RECOVERY_MAP.md:17,381-393` | unused_rpc | medium |

## Top wins (E055)

| id | claim | evidence_files | claim_type | confidence |
|---|---|---|---|---|
| E055 | 20 top recovery wins (low-complexity registry pointer fixes + API→DB backfill) | `_master-registry/DISCOVERY_RECOVERY_MAP.md:26-50` | recovery_plan | high |

## Invisible menu items (E056–E065)

| id | claim | evidence_files | claim_type | confidence |
|---|---|---|---|---|
| E056 | 779 total invisible items (MODEL 101 + ENGINE 223 + PAGE 455 + REPORT 14 + DASHBOARD 10 + WORKFLOW 5 + STATE 13 + EDGE 45) | `_master-registry/INVISIBLE_MENU_ITEMS.md:7-16` | invisible_count | high |
| E057 | 101 DB tables invisible (no menu/page) | `_master-registry/INVISIBLE_MENU_ITEMS.md:8` | invisible_model | high |
| E058 | 455 React pages unreachable from menu | `_master-registry/INVISIBLE_MENU_ITEMS.md:11,21` | invisible_page | high |
| E059 | 223 API engine modules without UI | `_master-registry/INVISIBLE_MENU_ITEMS.md:10,21` | invisible_engine | high |
| E060 | 14 of 20 registry reports not in menu | `_master-registry/INVISIBLE_MENU_ITEMS.md:14` | invisible_report | high |
| E061 | 10 of 10 dashboards lack canonical menu entry | `_master-registry/INVISIBLE_MENU_ITEMS.md:13` | invisible_dashboard | high |
| E062 | 5 of 5 workflows have no menu entry | `_master-registry/INVISIBLE_MENU_ITEMS.md:15` | invisible_workflow | high |
| E063 | 13 of 13 state machines not configurable | `_master-registry/INVISIBLE_MENU_ITEMS.md:16` | invisible_state_machine | high |
| E064 | analytics schema at 0% menu coverage | `_master-registry/INVISIBLE_MENU_ITEMS.md:32,62-73` | invisible_domain | high |
| E065 | docs/documents schemas at 12–17% coverage | `_master-registry/INVISIBLE_MENU_ITEMS.md:33,176-192` | invisible_domain | high |

## SYSTEM_360_SANITY findings (E066–E076)

| id | claim | evidence_files | claim_type | confidence |
|---|---|---|---|---|
| E066 | 33 DB tables missing from menu (18 high-priority) | `_master-registry/SYSTEM_360_SANITY.md:18,39-45` | menu_gap | high |
| E067 | 451 menu routes with no `<Route>` in App.tsx | `_master-registry/SYSTEM_360_SANITY.md:21,94-101`, `_audit_tmp/menu_gap.json` | menu_route_gap | high |
| E068 | 496 routes without menu entry (pages invisible to nav) | `_master-registry/CONNECTIVITY_VALIDATION.md:38`, `INTEGRITY_REPORT.md:24,49-69` | route_menu_gap | high |
| E069 | 0 broken component refs (all 629 element bindings resolve) | `_master-registry/SYSTEM_360_SANITY.md:24,105`, `_audit_tmp/broken_refs.json` | no_broken_refs | high |
| E070 | 0 uncovered FE `/api/*` paths (1,137 all resolve) | `_master-registry/SYSTEM_360_SANITY.md:26,107-109`, `_audit_tmp/api_call_gaps.json` | api_coverage_ok | high |
| E071 | 13 dead in-app links | `_master-registry/SYSTEM_360_SANITY.md:27,113-129` | dead_link | high |
| E072 | 43 orphan page files (not imported anywhere) | `_master-registry/SYSTEM_360_SANITY.md:28,143-151`, `_audit_tmp/orphan_pages.json` | orphan_page | high |
| E073 | 2 orphan API route files (fin-seed.ts, supplier-notification-trigger.ts) | `_master-registry/SYSTEM_360_SANITY.md:29,153` | orphan_route | high |
| E074 | 6 menu miscategorizations | `_master-registry/SYSTEM_360_SANITY.md:82-89` | miscategorized | high |
| E075 | 14 leftover /realestate/* rows | `_master-registry/SYSTEM_360_SANITY.md:98,205` | leftover_realestate | high |
| E076 | Migration 00040 adds 51 rows + 6 recategorizations | `supabase/migrations/00040_system_360_fixes.sql`, `_master-registry/SYSTEM_360_SANITY.md:193-198` | migration_pending | high |

## CONNECTIVITY_VALIDATION findings (E077–E085)

| id | claim | evidence_files | claim_type | confidence |
|---|---|---|---|---|
| E077 | 5 migrations with unbalanced parentheses | `_master-registry/INTEGRITY_REPORT.md:75-80`, migration files `00010`, `00011`, `00012`, `00015`, `00016` | sql_syntax | high |
| E078 | 4 pages broken imports → ../../lib/utils | `erp-app/src/pages/goods-receipt.tsx`, `erp-app/src/pages/purchase-requests.tsx`, `erp-app/src/pages/raw-materials.tsx`, `erp-app/src/pages/suppliers.tsx`, `_master-registry/INTEGRITY_REPORT.md:110-113` | broken_import | high |
| E079 | ~285 duplicate API endpoint declarations | `_master-registry/CONNECTIVITY_VALIDATION.md:44`, `api-server/src/routes/*.ts` | duplicate_endpoint | high |
| E080 | 30 broken relative imports at code level | `_master-registry/INTEGRITY_REPORT.md:84-116` | broken_import | high |
| E081 | 10/10 dashboards reference missing tables | `_master-registry/CONNECTIVITY_VALIDATION.md:42`, `_master-registry/dashboards_registry.json` | broken_dashboard | high |
| E082 | 17/20 reports reference missing schemas | `_master-registry/CONNECTIVITY_VALIDATION.md:43`, `_master-registry/reports_registry.json` | broken_report | high |
| E083 | Pipeline entity-map drift from registry | `onyx-procurement/src/pipeline/entity-map.js`, `_master-registry/models_registry.json`, `_master-registry/CONNECTIVITY_VALIDATION.md:57` | pipeline_drift | high |
| E084 | RLS policy count drift (213 vs 302) | `_master-registry/AUDIT_REAL.md:36`, `_master-registry/CONNECTIVITY_VALIDATION.md:22` | rls_drift | medium |
| E085 | VERDICT: high_risk_not_connected | `_master-registry/CONNECTIVITY_VALIDATION.md:103-107` | verdict | high |

## Other reports (E086–E091)

| id | claim | evidence_files | claim_type | confidence |
|---|---|---|---|---|
| E086 | TypeScript compiles clean (api-server=0, erp-app=0, onyx-ai=0, techno-kol-ops=0) | `_master-registry/INTEGRITY_REPORT.md` §D1 | build_ok | high |
| E087 | 30 broken relative imports — detailed list | `_master-registry/INTEGRITY_REPORT.md:84-116` | broken_import | high |
| E088 | VAT 17% → 18% update applied | `supabase/migrations/00037_vat_rate_18_percent.sql`, `_master-registry/VAT_18_UPDATE.md` | migration_applied | high |
| E089 | Final merge manifest + delta verify complete | `_master-registry/final_merge_manifest.json`, `_master-registry/MERGE_DELTA_VERIFY.json`, `_master-registry/FINAL_MERGE_REPORT.md` | merge_done | high |
| E090 | A/B validation acceptance criteria met | `_master-registry/AB_VALIDATION.md` | validation_ok | medium |
| E091 | MISSING_MODELS_SCAN captures 105 missing + 30 hidden | `_master-registry/MISSING_MODELS_SCAN.md` | missing_model | high |

## Orphan table enumeration (E092–E210) — 119 orphans from DISCOVERY §D

| id | claim (orphan table) | evidence_files | claim_type | confidence |
|---|---|---|---|---|
| E092 | analytics.dashboard_board_widgets orphan | `supabase/migrations/00021_dashboard_tables.sql:28` | orphan | high |
| E093 | analytics.kpi_snapshots orphan | `supabase/migrations/00010_enterprise_expansion_30_tables.sql:418` | orphan | high |
| E094 | analytics.read_model_invalidations orphan | `supabase/migrations/00011_enterprise_expansion_30_more_tables.sql:563` | orphan | high |
| E095 | analytics.rm_ai_summary orphan | `supabase/migrations/00000_master_schema.sql:2088` | orphan | high |
| E096 | analytics.rm_executive_summary orphan | `supabase/migrations/00000_master_schema.sql:2028` | orphan | high |
| E097 | analytics.rm_finance_summary orphan | `supabase/migrations/00000_master_schema.sql:2065` | orphan | high |
| E098 | analytics.rm_operations_summary orphan | `supabase/migrations/00000_master_schema.sql:2041` | orphan | high |
| E099 | analytics.rm_procurement_summary orphan | `supabase/migrations/00000_master_schema.sql:2053` | orphan | high |
| E100 | analytics.rm_workforce_summary orphan | `supabase/migrations/00000_master_schema.sql:2077` | orphan | high |
| E101 | analytics.user_dashboard_boards orphan | `supabase/migrations/00021_dashboard_tables.sql:43` | orphan | high |
| E102 | commercial.customer_contacts orphan | `supabase/migrations/00010_enterprise_expansion_30_tables.sql:11` | orphan | high |
| E103 | commercial.customer_portal_accounts orphan | `supabase/migrations/00000_master_schema.sql:1780` | orphan | high |
| E104 | commercial.lead_tag_assignments orphan | `supabase/migrations/00011_enterprise_expansion_30_more_tables.sql:30` | orphan | high |
| E105 | commercial.quote_approval_rules orphan | `supabase/migrations/00011_enterprise_expansion_30_more_tables.sql:65` | orphan | high |
| E106 | commercial.quote_lines orphan | `supabase/migrations/00000_master_schema.sql:494` | orphan | high |
| E107 | commercial.quote_revisions orphan | `supabase/migrations/00011_enterprise_expansion_30_more_tables.sql:46` | orphan | high |
| E108 | comms.chatbot_sessions orphan | `supabase/migrations/00000_master_schema.sql:1872` | orphan | high |
| E109 | comms.email_messages orphan | `supabase/migrations/00000_master_schema.sql:1827` | orphan | high |
| E110 | comms.help_articles orphan | `supabase/migrations/00000_master_schema.sql:1905` | orphan | high |
| E111 | comms.notification_deliveries orphan | `supabase/migrations/00011_enterprise_expansion_30_more_tables.sql:634` | orphan | high |
| E112 | comms.sms_messages orphan | `supabase/migrations/00000_master_schema.sql:1846` | orphan | high |
| E113 | comms.support_sla_tracking orphan | `supabase/migrations/00011_enterprise_expansion_30_more_tables.sql:659` | orphan | high |
| E114 | compliance.policy_acknowledgements orphan | `supabase/migrations/00027_enterprise_30_tables.sql:210` | orphan | high |
| E115 | crm.lead_activities orphan | `supabase/migrations/00027_enterprise_30_tables.sql:50` | orphan | high |
| E116 | docs.document_classifications orphan | `supabase/migrations/00000_master_schema.sql:1702` | orphan | high |
| E117 | docs.document_signature_requests orphan | `supabase/migrations/00010_enterprise_expansion_30_tables.sql:559` | orphan | high |
| E118 | docs.ocr_results orphan | `supabase/migrations/00000_master_schema.sql:1712` | orphan | high |
| E119 | docs.print_jobs orphan | `supabase/migrations/00000_master_schema.sql:1732` | orphan | high |
| E120 | docs.scan_sessions orphan | `supabase/migrations/00000_master_schema.sql:1746` | orphan | high |
| E121 | documents.classification_runs orphan | `supabase/migrations/00027_enterprise_30_tables.sql:475` | orphan | high |
| E122 | documents.document_chunks orphan | `supabase/migrations/00027_enterprise_30_tables.sql:516` | orphan | high |
| E123 | documents.document_relations orphan | `supabase/migrations/00027_enterprise_30_tables.sql:551` | orphan | high |
| E124 | documents.entity_extractions orphan | `supabase/migrations/00027_enterprise_30_tables.sql:533` | orphan | high |
| E125 | documents.knowledge_cards orphan | `supabase/migrations/00027_enterprise_30_tables.sql:566` | orphan | high |
| E126 | documents.ocr_runs orphan | `supabase/migrations/00027_enterprise_30_tables.sql:455` | orphan | high |
| E127 | execution.delivery_events orphan | `supabase/migrations/00000_master_schema.sql:950` | orphan | high |
| E128 | execution.installation_events orphan | `supabase/migrations/00000_master_schema.sql:962` | orphan | high |
| E129 | execution.project_blockers orphan | `supabase/migrations/00010_enterprise_expansion_30_tables.sql:122` | orphan | high |
| E130 | execution.project_cost_plans orphan | `supabase/migrations/00011_enterprise_expansion_30_more_tables.sql:253` | orphan | high |
| E131 | execution.task_attachments orphan | `supabase/migrations/00010_enterprise_expansion_30_tables.sql:179` | orphan | high |
| E132 | execution.task_comments orphan | `supabase/migrations/00010_enterprise_expansion_30_tables.sql:156` | orphan | high |
| E133 | execution.task_dependencies orphan | `supabase/migrations/00000_master_schema.sql:924` | orphan | high |
| E134 | execution.work_order_qa_items orphan | `supabase/migrations/00011_enterprise_expansion_30_more_tables.sql:299` | orphan | high |
| E135 | execution.work_order_tasks orphan | `supabase/migrations/00000_master_schema.sql:891` | orphan | high |
| E136 | finance.annual_tax_reports orphan | `supabase/migrations/00000_master_schema.sql:1662` | orphan | high |
| E137 | finance.bank_matches orphan | `supabase/migrations/00000_master_schema.sql:1550` | orphan | high |
| E138 | finance.budget_entries orphan | `supabase/migrations/00000_master_schema.sql:1579` | orphan | high |
| E139 | finance.collection_actions orphan | `supabase/migrations/00011_enterprise_expansion_30_more_tables.sql:362` | orphan | high |
| E140 | finance.consolidation_entries orphan | `supabase/migrations/00000_master_schema.sql:1617` | orphan | high |
| E141 | finance.costing_entries orphan | `supabase/migrations/00000_master_schema.sql:1591` | orphan | high |
| E142 | finance.dunning_steps orphan | `supabase/migrations/00011_enterprise_expansion_30_more_tables.sql:341` | orphan | high |
| E143 | finance.fx_rates orphan | `supabase/migrations/00000_master_schema.sql:1607` | orphan | high |
| E144 | finance.gl_transactions orphan | `supabase/migrations/00000_master_schema.sql:1483` | orphan | high |
| E145 | finance.invoice_lines orphan | `supabase/migrations/00000_master_schema.sql:1429` | orphan | high |
| E146 | finance.payment_allocations orphan | `supabase/migrations/00010_enterprise_expansion_30_tables.sql:488` | orphan | high |
| E147 | finance.reconciliation_exceptions orphan | `supabase/migrations/00010_enterprise_expansion_30_tables.sql:459` | orphan | high |
| E148 | finance.reminder_schedules orphan | `supabase/migrations/00011_enterprise_expansion_30_more_tables.sql:381` | orphan | high |
| E149 | finance.tax_exports orphan | `supabase/migrations/00000_master_schema.sql:1523` | orphan | high |
| E150 | finance.vat_records orphan | `supabase/migrations/00000_master_schema.sql:1499` | orphan | high |
| E151 | governance.alert_subscriptions orphan | `supabase/migrations/00010_enterprise_expansion_30_tables.sql:654` | orphan | high |
| E152 | governance.audit_log_attachments orphan | `supabase/migrations/00010_enterprise_expansion_30_tables.sql:727` | orphan | high |
| E153 | governance.command_logs orphan | `supabase/migrations/00011_enterprise_expansion_30_more_tables.sql:583` | orphan | high |
| E154 | governance.config_entries orphan | `supabase/migrations/00000_master_schema.sql:303` | orphan | high |
| E155 | governance.escalation_rules orphan | `supabase/migrations/00010_enterprise_expansion_30_tables.sql:631` | orphan | high |
| E156 | governance.event_deliveries orphan | `supabase/migrations/00000_master_schema.sql:212` | orphan | high |
| E157 | governance.feature_flag_targets orphan | `supabase/migrations/00010_enterprise_expansion_30_tables.sql:304` | orphan | high |
| E158 | governance.health_checks orphan | `supabase/migrations/00000_master_schema.sql:329` | orphan | high |
| E159 | governance.idempotency_keys orphan | `supabase/migrations/00008_idempotency_table.sql:9` | orphan | high |
| E160 | governance.job_executions orphan | `supabase/migrations/00010_enterprise_expansion_30_tables.sql:707` | orphan | high |
| E161 | governance.object_permissions orphan | `supabase/migrations/00000_master_schema.sql:114` | orphan | high |
| E162 | governance.saved_filters orphan | `supabase/migrations/00010_enterprise_expansion_30_tables.sql:347` | orphan | high |
| E163 | governance.security_events orphan | `supabase/migrations/00011_enterprise_expansion_30_more_tables.sql:609` | orphan | high |
| E164 | governance.sla_timers orphan | `supabase/migrations/00010_enterprise_expansion_30_tables.sql:678` | orphan | high |
| E165 | governance.state_history orphan | `supabase/migrations/00000_master_schema.sql:156` | orphan | high |
| E166 | governance.user_preferences orphan | `supabase/migrations/00010_enterprise_expansion_30_tables.sql:324` | orphan | high |
| E167 | governance.validations_log orphan | `supabase/migrations/00000_master_schema.sql:280` | orphan | high |
| E168 | governance.webhook_deliveries orphan | `supabase/migrations/00010_enterprise_expansion_30_tables.sql:223` | orphan | high |
| E169 | governance.workflow_step_executions orphan | `supabase/migrations/00000_master_schema.sql:269` | orphan | high |
| E170 | intelligence.agent_jobs orphan | `supabase/migrations/00023_ai_agent_registry_and_views.sql:19` | orphan | high |
| E171 | intelligence.ai_insights orphan | `supabase/migrations/00000_master_schema.sql:1922` | orphan | high |
| E172 | intelligence.anomaly_feedback orphan | `supabase/migrations/00010_enterprise_expansion_30_tables.sql:743` | orphan | high |
| E173 | intelligence.forecast_models orphan | `supabase/migrations/00000_master_schema.sql:1957` | orphan | high |
| E174 | intelligence.model_executions orphan | `supabase/migrations/00011_enterprise_expansion_30_more_tables.sql:524` | orphan | high |
| E175 | intelligence.quality_scores orphan | `supabase/migrations/00000_master_schema.sql:1974` | orphan | high |
| E176 | intelligence.recommendation_feedback orphan | `supabase/migrations/00011_enterprise_expansion_30_more_tables.sql:546` | orphan | high |
| E177 | intelligence.seasonality_patterns orphan | `supabase/migrations/00000_master_schema.sql:1996` | orphan | high |
| E178 | intelligence.trend_signals orphan | `supabase/migrations/00000_master_schema.sql:1985` | orphan | high |
| E179 | inventory.barcode_scans orphan | `supabase/migrations/00000_master_schema.sql:1186` | orphan | high |
| E180 | inventory.inventory_issues orphan | `supabase/migrations/00000_master_schema.sql:1088` | orphan | high |
| E181 | inventory.inventory_receipts orphan | `supabase/migrations/00000_master_schema.sql:1070` | orphan | high |
| E182 | inventory.inventory_transfers orphan | `supabase/migrations/00000_master_schema.sql:1105` | orphan | high |
| E183 | inventory.manufacturing_batches orphan | `supabase/migrations/00000_master_schema.sql:1198` | orphan | high |
| E184 | inventory.material_request_lines orphan | `supabase/migrations/00000_master_schema.sql:1173` | orphan | high |
| E185 | inventory.reorder_rules orphan | `supabase/migrations/00011_enterprise_expansion_30_more_tables.sql:212` | orphan | high |
| E186 | inventory.shortage_snapshots orphan | `supabase/migrations/00011_enterprise_expansion_30_more_tables.sql:234` | orphan | high |
| E187 | inventory.stock_count_lines orphan | `supabase/migrations/00000_master_schema.sql:1148` | orphan | high |
| E188 | orchestration.job_queue orphan | `supabase/migrations/00024_orchestration_tables.sql:73` | orphan | high |
| E189 | orchestration.universal_inbox orphan | `supabase/migrations/00024_orchestration_tables.sql:94` | orphan | high |
| E190 | orchestration.workflow_step_runs orphan | `supabase/migrations/00024_orchestration_tables.sql:54` | orphan | high |
| E191 | planning.capacity_slots orphan | `supabase/migrations/00027_enterprise_30_tables.sql:294` | orphan | high |
| E192 | procurement.approval_steps orphan | `supabase/migrations/00011_enterprise_expansion_30_more_tables.sql:88` | orphan | high |
| E193 | procurement.contract_milestones orphan | `supabase/migrations/00011_enterprise_expansion_30_more_tables.sql:137` | orphan | high |
| E194 | procurement.rfq_comparison_snapshots orphan | `supabase/migrations/*` | orphan | medium |
| E195 | procurement.rfq_supplier_invites orphan | `supabase/migrations/*` | orphan | medium |
| E196 | procurement.supplier_scorecards orphan | `supabase/migrations/*` | orphan | medium |
| E197 | procurement.warranty_cases orphan | `supabase/migrations/*` | orphan | medium |
| E198 | public.user_profiles orphan | `supabase/migrations/*` | orphan | medium |
| E199 | routing.route_permission_map orphan | `supabase/migrations/*` | orphan | medium |
| E200 | service.ticket_comments orphan | `supabase/migrations/*` | orphan | medium |
| E201 | treasury.cash_forecasts orphan | `supabase/migrations/00032_treasury_and_extra_routes.sql` | orphan | high |
| E202 | treasury.cash_positions orphan | `supabase/migrations/00032_treasury_and_extra_routes.sql` | orphan | high |
| E203 | workforce.employee_expenses orphan | `supabase/migrations/*` | orphan | medium |
| E204 | workforce.employee_pay_components orphan | `supabase/migrations/*` | orphan | medium |
| E205 | workforce.hr_profiles orphan | `supabase/migrations/*` | orphan | medium |
| E206 | workforce.payroll_exceptions orphan | `supabase/migrations/*` | orphan | medium |
| E207 | workforce.payroll_export_batches orphan | `supabase/migrations/*` | orphan | medium |
| E208 | workforce.pension_records orphan | `supabase/migrations/*` | orphan | medium |
| E209 | workforce.wage_slips orphan | `supabase/migrations/*` | orphan | medium |
| E210 | workforce.workforce_assignments orphan | `supabase/migrations/*` | orphan | medium |

## Truly-missing models enumeration (E211–E285)

| id | claim (missing model) | evidence_files | claim_type | confidence |
|---|---|---|---|---|
| E211 | crm.lead_sources missing | `_master-registry/models_registry.json`, DISCOVERY §B#1 | missing_table | high |
| E212 | crm.communication_logs missing | registry §B#6 | missing_table | high |
| E213 | crm.customer_segments missing | registry §B#7 | missing_table | high |
| E214 | sales.quote_items missing | registry §B#10 | missing_table | high |
| E215 | sales.pricing_rules missing | registry §B#11 | missing_table | high |
| E216 | sales.discounts missing | registry §B#12 | missing_table | high |
| E217 | sales.sales_orders missing | registry §B#14 | missing_table | high |
| E218 | sales.sales_pipeline missing | registry §B#15 | missing_table | high |
| E219 | projects.project_tasks missing | registry §B#18 | missing_table | high |
| E220 | projects.project_resources missing | registry §B#21 | missing_table | high |
| E221 | projects.project_risk_entries missing | registry §B#22 | missing_table | high |
| E222 | projects.project_progress_logs missing | registry §B#23 | missing_table | high |
| E223 | engineering.technical_specs missing | registry §B#24 | missing_table | high |
| E224 | engineering.bom_headers missing | registry §B#26 | missing_table | high |
| E225 | engineering.bom_items missing | registry §B#27 | missing_table | high |
| E226 | engineering.revision_control missing | registry §B#28 | missing_table | high |
| E227 | engineering.product_configurations missing | registry §B#29 | missing_table | high |
| E228 | engineering.engineering_requests missing | registry §B#30 | missing_table | high |
| E229 | engineering.approval_drawings missing | registry §B#31 | missing_table | high |
| E230 | procurement.supplier_price_lists missing | registry §B#32 | missing_table | high |
| E231 | procurement.purchase_requests missing | registry §B#33 | missing_table | high |
| E232 | procurement.purchase_order_items missing | registry §B#34 | missing_table | high |
| E233 | procurement.goods_receipts missing | registry §B#35 | missing_table | high |
| E234 | procurement.procurement_approvals missing | registry §B#36 | missing_table | high |
| E235 | inventory.stock_balances missing | registry §B#39 | missing_table | high |
| E236 | inventory.stock_movements missing | registry §B#40 | missing_table | high |
| E237 | inventory.batch_lots missing | registry §B#42 | missing_table | high |
| E238 | production.production_orders missing | registry §B#43 | missing_table | high |
| E239 | production.production_steps missing | registry §B#44 | missing_table | high |
| E240 | production.work_centers missing | registry §B#45 | missing_table | high |
| E241 | production.labor_logs missing | registry §B#46 | missing_table | high |
| E242 | production.machine_logs missing | registry §B#47 | missing_table | high |
| E243 | production.material_consumption missing | registry §B#48 | missing_table | high |
| E244 | production.scrap_logs missing | registry §B#49 | missing_table | high |
| E245 | production.production_quality_checks missing | registry §B#50 | missing_table | high |
| E246 | installation.installation_orders missing | registry §B#51 | missing_table | high |
| E247 | installation.installation_tasks missing | registry §B#52 | missing_table | high |
| E248 | installation.installation_teams missing | registry §B#53 | missing_table | high |
| E249 | installation.site_visits missing | registry §B#55 | missing_table | high |
| E250 | installation.completion_reports missing | registry §B#56 | missing_table | high |
| E251 | installation.handover_documents missing | registry §B#57 | missing_table | high |
| E252 | installation.punch_lists missing | registry §B#58 | missing_table | high |
| E253 | service.service_tickets missing | registry §B#59 | missing_table | high |
| E254 | service.warranty_records missing | registry §B#60 | missing_table | high |
| E255 | service.service_visits missing | registry §B#61 | missing_table | high |
| E256 | service.issue_categories missing | registry §B#62 | missing_table | high |
| E257 | service.resolution_logs missing | registry §B#63 | missing_table | high |
| E258 | service.maintenance_plans missing | registry §B#64 | missing_table | high |
| E259 | service.service_feedback missing | registry §B#65 | missing_table | high |
| E260 | service.sla_rules missing | registry §B#66 | missing_table | high |
| E261 | finance.invoice_items missing | registry §B#67 | missing_table | high |
| E262 | finance.expense_categories missing | registry §B#68 | missing_table | high |
| E263 | finance.profitability_snapshots missing | registry §B#69 | missing_table | high |
| E264 | hr_workforce.attendance_logs missing | registry §B#73 | missing_table | high |
| E265 | hr_workforce.payroll_inputs missing | registry §B#75 | missing_table | high |
| E266 | hr_workforce.performance_reviews missing | registry §B#76 | missing_table | high |
| E267 | hr_workforce.skill_matrix missing | registry §B#77 | missing_table | high |
| E268 | documents.document_links missing | registry §B#79 | missing_table | high |
| E269 | documents.generated_files missing | registry §B#82 | missing_table | high |
| E270 | documents.archive_records missing | registry §B#85 | missing_table | high |
| E271 | analytics.kpi_definitions missing | registry §B#87 | missing_table | high |
| E272 | analytics.report_sources missing | registry §B#89 | missing_table | high |
| E273 | analytics.scenario_models missing | registry §B#91 | missing_table | high |
| E274 | ai_automation.automation_rules missing | registry §B#93 | missing_table | high |
| E275 | ai_automation.automation_runs missing | registry §B#94 | missing_table | high |
| E276 | ai_automation.ai_agents missing | registry §B#95 | missing_table | high |
| E277 | ai_automation.ai_actions missing | registry §B#96 | missing_table | high |
| E278 | ai_automation.prediction_outputs missing | registry §B#97 | missing_table | high |
| E279 | ai_automation.recommendation_logs missing | registry §B#98 | missing_table | high |
| E280 | ai_automation.prompt_templates missing | registry §B#99 | missing_table | high |
| E281 | ai_automation.orchestration_flows missing | registry §B#100 | missing_table | high |
| E282 | governance.change_logs missing | registry §B#102 | missing_table | high |
| E283 | governance.system_settings missing | registry §B#103 | missing_table | high |
| E284 | governance.validation_rules missing | registry §B#104 | missing_table | high |
| E285 | governance.data_quality_issues missing | registry §B#105 | missing_table | high |

## Dead in-app links (E286–E298)

| id | claim (dead link) | evidence_files | claim_type | confidence |
|---|---|---|---|---|
| E286 | /portal/customer/login dead (×2) | `_master-registry/SYSTEM_360_SANITY.md:117` | dead_link | high |
| E287 | /portal/customer/dashboard dead (×2) | `_master-registry/SYSTEM_360_SANITY.md:118` | dead_link | high |
| E288 | /ai-engine/chatbot-settings dead (×2) | `_master-registry/SYSTEM_360_SANITY.md:119` | dead_link | high |
| E289 | /executive/scorecard dead | `_master-registry/SYSTEM_360_SANITY.md:120` | dead_link | high |
| E290 | /contracts/risk-scoring dead | `_master-registry/SYSTEM_360_SANITY.md:121` | dead_link | high |
| E291 | /fin/income dead | `_master-registry/SYSTEM_360_SANITY.md:122` | dead_link | high |
| E292 | /fin/expenses dead | `_master-registry/SYSTEM_360_SANITY.md:123` | dead_link | high |
| E293 | /fin/activity dead | `_master-registry/SYSTEM_360_SANITY.md:124` | dead_link | high |
| E294 | /logistics/tracking dead | `_master-registry/SYSTEM_360_SANITY.md:125` | dead_link | high |
| E295 | /logistics/returns dead | `_master-registry/SYSTEM_360_SANITY.md:126` | dead_link | high |
| E296 | /sales/crm-pipeline dead | `_master-registry/SYSTEM_360_SANITY.md:127` | dead_link | high |
| E297 | /supply-chain/command-center dead | `_master-registry/SYSTEM_360_SANITY.md:128` | dead_link | high |
| E298 | /ai-engine/cross-module dead | `_master-registry/SYSTEM_360_SANITY.md:129` | dead_link | high |

## Menu miscategorizations (E299–E304)

| id | claim | evidence_files | claim_type | confidence |
|---|---|---|---|---|
| E299 | /receipts under inventory, should be finance | `_master-registry/SYSTEM_360_SANITY.md:83` | miscategorized | high |
| E300 | /all-documents under comms, should be documents | `_master-registry/SYSTEM_360_SANITY.md:84` | miscategorized | high |
| E301 | /audit under system, should be compliance | `_master-registry/SYSTEM_360_SANITY.md:85` | miscategorized | high |
| E302 | /integrations under AI, should be integrations | `_master-registry/SYSTEM_360_SANITY.md:86` | miscategorized | high |
| E303 | /webhooks under AI, should be integrations | `_master-registry/SYSTEM_360_SANITY.md:87` | miscategorized | high |
| E304 | /cron under system, should be infra/ops | `_master-registry/SYSTEM_360_SANITY.md:88` | miscategorized | high |

## Invisible DB-table evidence samples (E305–E325) — 101 total

| id | claim (invisible model) | evidence_files | claim_type | confidence |
|---|---|---|---|---|
| E305 | analytics.dashboard_definitions invisible | `_master-registry/INVISIBLE_MENU_ITEMS.md:67` | invisible_model | high |
| E306 | analytics.dashboard_boards invisible | `_master-registry/INVISIBLE_MENU_ITEMS.md:68` | invisible_model | high |
| E307 | commercial.quote_lines invisible | `_master-registry/INVISIBLE_MENU_ITEMS.md:79` | invisible_model | high |
| E308 | commercial.quote_revisions invisible | `_master-registry/INVISIBLE_MENU_ITEMS.md:80` | invisible_model | high |
| E309 | procurement.purchase_order_lines invisible | `_master-registry/INVISIBLE_MENU_ITEMS.md:101` | invisible_model | high |
| E310 | procurement.rfq_items invisible | `_master-registry/INVISIBLE_MENU_ITEMS.md:102` | invisible_model | high |
| E311 | procurement.supplier_invoices invisible | `_master-registry/INVISIBLE_MENU_ITEMS.md:105` | invisible_model | high |
| E312 | inventory.inventory_movements invisible | `_master-registry/INVISIBLE_MENU_ITEMS.md:115` | invisible_model | high |
| E313 | execution.work_order_tasks invisible | `_master-registry/INVISIBLE_MENU_ITEMS.md:130` | invisible_model | high |
| E314 | execution.project_phases invisible | `_master-registry/INVISIBLE_MENU_ITEMS.md:132` | invisible_model | high |
| E315 | finance.budget_entries invisible | `_master-registry/INVISIBLE_MENU_ITEMS.md:147` | invisible_model | high |
| E316 | finance.dunning_campaigns invisible | `_master-registry/INVISIBLE_MENU_ITEMS.md:152` | invisible_model | high |
| E317 | finance.tax_records invisible | `_master-registry/INVISIBLE_MENU_ITEMS.md:158` | invisible_model | high |
| E318 | workforce.payroll_runs invisible | `_master-registry/INVISIBLE_MENU_ITEMS.md:167` | invisible_model | high |
| E319 | workforce.payroll_entries invisible | `_master-registry/INVISIBLE_MENU_ITEMS.md:168` | invisible_model | high |
| E320 | docs.ocr_results invisible | `_master-registry/INVISIBLE_MENU_ITEMS.md:184` | invisible_model | high |
| E321 | documents.entity_extractions invisible | `_master-registry/INVISIBLE_MENU_ITEMS.md:188` | invisible_model | high |
| E322 | governance.permissions invisible (admin page missing) | `_master-registry/INVISIBLE_MENU_ITEMS.md` §governance | invisible_model | high |
| E323 | governance.role_permissions invisible | `_master-registry/INVISIBLE_MENU_ITEMS.md` §governance | invisible_model | high |
| E324 | governance.object_permissions invisible | `_master-registry/INVISIBLE_MENU_ITEMS.md` §governance | invisible_model | high |
| E325 | governance.integration_connections invisible | `_master-registry/INVISIBLE_MENU_ITEMS.md` §governance | invisible_model | high |

---

## phase_1_done

Evidence Map initialized with 325 entries spanning every major finding from the 5 primary reports and 3 secondary reports. Additional per-item evidence (remaining invisible tables, extended broken-imports list, per-endpoint duplicates) to be expanded during Phases 4–10 as items are actioned.

---

## Phase 1b — Forgotten-model evidence (E326–E368)

| id | claim | file:line | category | severity |
|---|---|---|---|---|
| E326 | documents.knowledge_cards table exists, no registry entry, no menu | `supabase/migrations/` grep `create table.*knowledge_cards` | forgotten_model | medium |
| E327 | documents.document_chunks exists, no registry, no menu | `supabase/migrations/` grep `create table.*document_chunks` | forgotten_model | medium |
| E328 | intelligence.anomaly_feedback exists, no registry, no menu | `supabase/migrations/` grep `create table.*anomaly_feedback` | forgotten_model | medium |
| E329 | intelligence.recommendation_feedback exists, no registry, no menu | `supabase/migrations/` grep `create table.*recommendation_feedback` | forgotten_model | medium |
| E330 | governance.alert_subscriptions exists, no registry, no menu | `supabase/migrations/00000_master_schema.sql` | forgotten_model | medium |
| E331 | governance.command_logs exists, no registry, no menu | `supabase/migrations/00000_master_schema.sql` | forgotten_model | low |
| E332 | maintenance.assets exists, no registry, no menu | `supabase/migrations/` grep `create table maintenance.assets` | forgotten_model | high |
| E333 | maintenance.work_orders duplicates execution.work_orders | grep finds both `create table` statements | duplicate_risk | high |
| E334 | planning.capacity_calendars exists, no registry | `supabase/migrations/` grep `create table planning.capacity_calendars` | forgotten_model | medium |
| E335 | planning.capacity_slots exists, no registry | `supabase/migrations/` grep `create table planning.capacity_slots` | forgotten_model | medium |
| E336 | pricing.calculations exists, no registry | `supabase/migrations/` grep `create table pricing.calculations` | forgotten_model | medium |
| E337 | pricing.rule_sets exists, no registry | `supabase/migrations/` grep `create table pricing.rule_sets` | forgotten_model | medium |
| E338 | quality.* schema exists, contents missing from registry | grep schema tables | forgotten_model | medium |
| E339 | routing.* schema exists, contents missing from registry | grep schema tables | forgotten_model | medium |
| E340 | treasury.* schema exists, contents missing from registry | grep schema tables | forgotten_model | medium |
| E341 | comms.comms_threads exists, no registry | migrations grep | forgotten_model | low |
| E342 | comms.support_sla_tracking exists, no registry | migrations grep | forgotten_model | medium |
| E343 | comms.portal_sessions exists, no registry | migrations grep | forgotten_model | low |
| E344 | comms.notification_deliveries exists, no registry | migrations grep | forgotten_model | low |
| E345 | inventory.barcode_scans exists, no registry | migrations grep | forgotten_model | low |
| E346 | inventory.material_lots exists, no registry | migrations grep | forgotten_model | medium |
| E347 | execution.logistics_orders exists, no registry | migrations grep | forgotten_model | medium |
| E348 | execution.project_risks exists, no registry | migrations grep | forgotten_model | medium |
| E349 | execution.project_blockers exists, no registry | migrations grep | forgotten_model | medium |
| E350 | execution.project_cost_plans exists, no registry | migrations grep | forgotten_model | medium |
| E351 | commercial.quote_lines exists, no registry | migrations grep | forgotten_model | critical |
| E352 | commercial.quote_revisions exists, no registry | migrations grep | forgotten_model | high |
| E353 | procurement.purchase_order_lines exists, no registry | migrations grep | forgotten_model | critical |
| E354 | procurement.rfq_items exists, no registry | migrations grep | forgotten_model | critical |
| E355 | finance.invoice_lines exists, no registry | migrations grep | forgotten_model | critical |
| E356 | finance.payment_allocations exists, no registry | migrations grep | forgotten_model | high |
| E357 | workforce.payroll_runs exists, no registry | migrations grep | forgotten_model | high |
| E358 | workforce.payroll_entries exists, no registry | migrations grep | forgotten_model | high |
| E359 | execution.work_order_tasks exists, no registry | migrations grep | forgotten_model | high |
| E360 | inventory.inventory_movements / stock_counts / reorder_rules exist, no registry | migrations grep | forgotten_model | high |
| E361 | WorkOrder360 page missing — no file matching `WorkOrder360` in `erp-app/src/pages/**` | glob scan | missing_360_page | critical |
| E362 | Invoice360 page missing — no file matching `Invoice360` | glob scan | missing_360_page | critical |
| E363 | Payment360 page missing — no file matching `Payment360` | glob scan | missing_360_page | critical |
| E364 | Material360 page missing — no file matching `Material360` | glob scan | missing_360_page | high |
| E365 | Contract360 page missing — no file matching `Contract360` | glob scan | missing_360_page | high |
| E366 | Task360 page missing — no file matching `Task360` | glob scan | missing_360_page | high |
| E367 | Alert360 page missing — no file matching `Alert360` | glob scan | missing_360_page | medium |
| E368 | PurchaseOrder360 page missing — no file matching `PurchaseOrder360` or `PO360` | glob scan | missing_360_page | critical |

## phase_1b_done

Evidence Map extended with E326–E368 (43 new entries). Total evidence entries: 368.
