# AUDIT_REAL.md — Forensic System Audit
# Generated: 2026-04-18T03:55:09.617Z
# Scope: entire monorepo at C:/Users/kobi/Projects/techno-kol-uzi-2026, file-based only, zero assumptions

> **Method**: scanned every `supabase/migrations/*.sql` file (36 files, 13,188 lines), every file under
> `onyx-procurement/src/pipeline/` (9 JS files, 2,934 lines), every `.ts`/`.tsx`/`.js`/`.jsx` under
> `erp-app/src/`, `api-server/src/`, `onyx-procurement/src/`, `techno-kol-ops/`, `payroll-autonomous/`, `onyx-ai/`
> (2,262 code files), every menu seed SQL, every `_master-registry/*.json` registry file.
> All numbers in this report are derived by parsing actual file contents. Where the prior
> `_master-registry/` run disagrees with the file-level reality, **this report treats the files as the
> ground truth and flags the disagreement**.

## 0. HEADLINE COUNTS

| Metric | Value | Ground-truth source |
|---|---|---|
| total_models_found (migrations, deduped by schema.name) | **237** | supabase/migrations/*.sql |
| total_models_CLAIMED_by_registry | 342 | _master-registry/models_registry.json |
| total_pipeline_entities (entity-map.js) | 16 | onyx-procurement/src/pipeline/entity-map.js |
| total_pages_unique_routes (`<Route path>`) | **666** | grep <Route path=> across services |
| total_page_component_files | 658 | files under pages/ or Page.(tsx\|jsx) |
| total_api_routes | 4364 | router/app.(get\|post\|...) |
| total_flows_found (WORKFLOW_FLOWS) | **5** | workflow-flows.js |
| total_state_machines | 15 | state-machines.js |
| total_state_transitions | 115 | state-machines.js (action:state pairs) |
| total_orchestrator_actions | 18 | orchestrator.js ORCHESTRATIONS |
| total_page_contracts | 9 | wiring-spec.js PAGE_CONTRACTS |
| total_action_api_mappings | 55 | wiring-spec.js ACTION_API_MAP |
| total_cross_service_contracts | 7 | wiring-spec.js CROSS_SERVICE_CONTRACTS |
| total_relationships_found (unique FKs in migrations) | **346** | references clauses |
| total_pipeline_relations (ENTITY_RELATIONSHIPS strings) | 190 | wiring-spec.js |
| total_reports_found | 20 | reports_registry.json |
| total_dashboards_found | 10 | dashboards_registry.json |
| total_automations_found | 12 | automations_registry.json |
| total_cron_jobs | 5 | vm-task-runner/src/jobs.js |
| total_rls_policies | 213 | create policy statements |
| total_rpc_functions | 143 | create function statements |
| total_views | 19 | create view statements |
| total_menu_entries | 549 | 00017/00034/00035 app_menu seeds |
| unique_menu_routes | 512 | deduped from menu seeds |
| orphan_models (no FK in AND no FK out) | **29** | see §10 |
| orphan_pages (route registered but not in menu) | **652** | see §10 |
| duplicate_risks (tables + routes + api + menu) | **223** | 5 table + 15 route + 171 api + 32 menu |
| missing_connections (claimed model but no migration table) | **93** | see §10 |
| source_of_truth_conflicts (controlled meaning → no table) | **7** | source_of_truth_registry.json vs tables |
| menu_entries_without_frontend_route | 510 | see §10 |

## 1. DOMAIN REGISTRY

### 1a. Domains (SCHEMAS) found in Supabase migrations — **GROUND TRUTH**

| # | schema | table_count | source |
|---|--------|-------------|--------|
| 1 | `governance` | 35 | supabase/migrations/*.sql |
| 2 | `finance` | 24 | supabase/migrations/*.sql |
| 3 | `execution` | 19 | supabase/migrations/*.sql |
| 4 | `procurement` | 19 | supabase/migrations/*.sql |
| 5 | `inventory` | 18 | supabase/migrations/*.sql |
| 6 | `workforce` | 17 | supabase/migrations/*.sql |
| 7 | `commercial` | 14 | supabase/migrations/*.sql |
| 8 | `analytics` | 13 | supabase/migrations/*.sql |
| 9 | `intelligence` | 13 | supabase/migrations/*.sql |
| 10 | `comms` | 12 | supabase/migrations/*.sql |
| 11 | `docs` | 8 | supabase/migrations/*.sql |
| 12 | `public` | 8 | supabase/migrations/*.sql |
| 13 | `documents` | 7 | supabase/migrations/*.sql |
| 14 | `orchestration` | 7 | supabase/migrations/*.sql |
| 15 | `crm` | 3 | supabase/migrations/*.sql |
| 16 | `planning` | 3 | supabase/migrations/*.sql |
| 17 | `quality` | 3 | supabase/migrations/*.sql |
| 18 | `routing` | 3 | supabase/migrations/*.sql |
| 19 | `treasury` | 3 | supabase/migrations/*.sql |
| 20 | `compliance` | 2 | supabase/migrations/*.sql |
| 21 | `maintenance` | 2 | supabase/migrations/*.sql |
| 22 | `pricing` | 2 | supabase/migrations/*.sql |
| 23 | `service` | 2 | supabase/migrations/*.sql |

**Total schemas in migrations: 23**

### 1b. Domains CLAIMED by `_master-registry/models_registry.json`

| # | domain | model_count |
|---|--------|-------------|
| 1 | `governance` | 53 |
| 2 | `projects` | 30 |
| 3 | `finance` | 30 |
| 4 | `ai_automation` | 28 |
| 5 | `hr_workforce` | 25 |
| 6 | `sales` | 24 |
| 7 | `procurement` | 24 |
| 8 | `inventory` | 24 |
| 9 | `documents` | 23 |
| 10 | `crm` | 22 |
| 11 | `analytics` | 20 |
| 12 | `service` | 12 |
| 13 | `production` | 11 |
| 14 | `engineering` | 8 |
| 15 | `installation` | 8 |

**Total domains in registry: 15** (SUMMARY.txt claims 15)

### 1c. DOMAIN-NAMING CONFLICT (source_of_truth_conflict)

The prior registry uses domain names (`crm`, `sales`, `projects`, `hr_workforce`, `production`, `engineering`, `installation`, `ai_automation`) that **DO NOT EXIST as schemas in any migration**.
The migrations use (`commercial`, `execution`, `workforce`, `intelligence`, `procurement`, `inventory`, `finance`, etc.).
The `source_of_truth_registry.json` declares primary sources such as `crm.customers`, `sales.quotes`, `projects.projects`, `hr_workforce.employees` — **none of these tables exist**. Actual tables are `commercial.customers`, `commercial.quotes`, `execution.projects`, `workforce.employees`.

## 2. MODELS REGISTRY

All 237 unique migration tables (deduped by schema.name). `pipeline_entity?` column = does this table match one of the 16 entities declared in `onyx-procurement/src/pipeline/entity-map.js`.

| # | schema.table | source | pk? | fk_out | fk_in | pipeline_entity? |
|---|--------------|--------|-----|--------|-------|-------------------|
| 1 | analytics.dashboard_board_widgets | 00021_dashboard_tables.sql:28 | ? | 2 | 0 | — |
| 2 | analytics.dashboard_boards | 00021_dashboard_tables.sql:6 | ? | 0 | 2 | — |
| 3 | analytics.dashboard_definitions | 00010_enterprise_expansion_30_tables.sql:371 | ? | 0 | 1 | — |
| 4 | analytics.dashboard_widgets | 00010_enterprise_expansion_30_tables.sql:391 | ? | 1 | 1 | — |
| 5 | analytics.kpi_snapshots | 00010_enterprise_expansion_30_tables.sql:418 | ? | 0 | 0 | — |
| 6 | analytics.read_model_invalidations | 00011_enterprise_expansion_30_more_tables.sql:563 | ? | 0 | 0 | — |
| 7 | analytics.rm_ai_summary | 00000_master_schema.sql:2088 | ? | 0 | 0 | — |
| 8 | analytics.rm_executive_summary | 00000_master_schema.sql:2028 | ? | 0 | 0 | — |
| 9 | analytics.rm_finance_summary | 00000_master_schema.sql:2065 | ? | 0 | 0 | — |
| 10 | analytics.rm_operations_summary | 00000_master_schema.sql:2041 | ? | 0 | 0 | — |
| 11 | analytics.rm_procurement_summary | 00000_master_schema.sql:2053 | ? | 0 | 0 | — |
| 12 | analytics.rm_workforce_summary | 00000_master_schema.sql:2077 | ? | 0 | 0 | — |
| 13 | analytics.user_dashboard_boards | 00021_dashboard_tables.sql:43 | ? | 2 | 0 | — |
| 14 | commercial.crm_activities | 00000_master_schema.sql:432 | ? | 1 | 0 | — |
| 15 | commercial.customer_contacts | 00010_enterprise_expansion_30_tables.sql:11 | ? | 2 | 0 | — |
| 16 | commercial.customer_portal_accounts | 00000_master_schema.sql:1780 | ? | 2 | 0 | — |
| 17 | commercial.customers | 00000_master_schema.sql:358 | ? | 1 | 17 | customer |
| 18 | commercial.lead_tag_assignments | 00011_enterprise_expansion_30_more_tables.sql:30 | ? | 3 | 0 | — |
| 19 | commercial.lead_tags | 00011_enterprise_expansion_30_more_tables.sql:11 | ? | 0 | 1 | — |
| 20 | commercial.leads | 00000_master_schema.sql:396 | ? | 3 | 3 | lead |
| 21 | commercial.opportunities | 00000_master_schema.sql:449 | ? | 3 | 1 | — |
| 22 | commercial.pipeline_stages | 00000_master_schema.sql:344 | ? | 0 | 1 | — |
| 23 | commercial.pricing_snapshots | 00000_master_schema.sql:517 | ? | 2 | 0 | — |
| 24 | commercial.quote_approval_rules | 00011_enterprise_expansion_30_more_tables.sql:65 | ? | 0 | 0 | — |
| 25 | commercial.quote_lines | 00000_master_schema.sql:494 | ? | 1 | 0 | — |
| 26 | commercial.quote_revisions | 00011_enterprise_expansion_30_more_tables.sql:46 | ? | 2 | 0 | — |
| 27 | commercial.quotes | 00000_master_schema.sql:467 | ? | 4 | 5 | quote |
| 28 | comms.chatbot_sessions | 00000_master_schema.sql:1872 | ? | 2 | 0 | — |
| 29 | comms.comms_threads | 00000_master_schema.sql:1815 | ? | 0 | 3 | — |
| 30 | comms.email_messages | 00000_master_schema.sql:1827 | ? | 1 | 0 | — |
| 31 | comms.help_articles | 00000_master_schema.sql:1905 | ? | 0 | 0 | — |
| 32 | comms.notification_deliveries | 00011_enterprise_expansion_30_more_tables.sql:634 | ? | 1 | 0 | — |
| 33 | comms.notifications | 00000_master_schema.sql:1800 | ? | 2 | 1 | — |
| 34 | comms.portal_sessions | 00010_enterprise_expansion_30_tables.sql:608 | ? | 1 | 0 | — |
| 35 | comms.portal_users | 00000_master_schema.sql:1762 | ? | 2 | 7 | — |
| 36 | comms.sms_messages | 00000_master_schema.sql:1846 | ? | 1 | 0 | — |
| 37 | comms.support_sla_tracking | 00011_enterprise_expansion_30_more_tables.sql:659 | ? | 1 | 0 | — |
| 38 | comms.support_tickets | 00000_master_schema.sql:1886 | ? | 4 | 1 | — |
| 39 | comms.whatsapp_messages | 00000_master_schema.sql:1859 | ? | 1 | 0 | — |
| 40 | compliance.policies | 00027_enterprise_30_tables.sql:191 | ? | 0 | 1 | — |
| 41 | compliance.policy_acknowledgements | 00027_enterprise_30_tables.sql:210 | ? | 2 | 0 | — |
| 42 | crm.lead_activities | 00027_enterprise_30_tables.sql:50 | ? | 2 | 0 | — |
| 43 | crm.leads | 00027_enterprise_30_tables.sql:26 | ? | 1 | 2 | lead |
| 44 | crm.opportunities | 00027_enterprise_30_tables.sql:69 | ? | 3 | 0 | — |
| 45 | docs.attachments | 00000_master_schema.sql:1723 | ? | 2 | 0 | — |
| 46 | docs.document_classifications | 00000_master_schema.sql:1702 | ? | 1 | 0 | — |
| 47 | docs.document_signature_requests | 00010_enterprise_expansion_30_tables.sql:559 | ? | 2 | 0 | — |
| 48 | docs.document_versions | 00010_enterprise_expansion_30_tables.sql:589 | ? | 2 | 0 | — |
| 49 | docs.documents | 00000_master_schema.sql:1679 | ? | 1 | 15 | document |
| 50 | docs.ocr_results | 00000_master_schema.sql:1712 | ? | 1 | 0 | — |
| 51 | docs.print_jobs | 00000_master_schema.sql:1732 | ? | 2 | 0 | — |
| 52 | docs.scan_sessions | 00000_master_schema.sql:1746 | ? | 1 | 0 | — |
| 53 | documents.classification_runs | 00027_enterprise_30_tables.sql:475 | ? | 1 | 0 | — |
| 54 | documents.document_chunks | 00027_enterprise_30_tables.sql:516 | ? | 1 | 0 | — |
| 55 | documents.document_relations | 00027_enterprise_30_tables.sql:551 | ? | 1 | 0 | — |
| 56 | documents.entity_extractions | 00027_enterprise_30_tables.sql:533 | ? | 2 | 0 | — |
| 57 | documents.extraction_runs | 00027_enterprise_30_tables.sql:496 | ? | 1 | 1 | — |
| 58 | documents.knowledge_cards | 00027_enterprise_30_tables.sql:566 | ? | 1 | 0 | — |
| 59 | documents.ocr_runs | 00027_enterprise_30_tables.sql:455 | ? | 1 | 0 | — |
| 60 | execution.alerts | 00000_master_schema.sql:986 | ? | 1 | 1 | alert |
| 61 | execution.delivery_events | 00000_master_schema.sql:950 | ? | 4 | 0 | — |
| 62 | execution.installation_events | 00000_master_schema.sql:962 | ? | 3 | 0 | — |
| 63 | execution.logistics_orders | 00000_master_schema.sql:933 | ? | 2 | 1 | — |
| 64 | execution.project_blockers | 00010_enterprise_expansion_30_tables.sql:122 | ? | 4 | 0 | — |
| 65 | execution.project_cost_plans | 00011_enterprise_expansion_30_more_tables.sql:253 | ? | 1 | 0 | — |
| 66 | execution.project_milestones | 00000_master_schema.sql:853 | ? | 2 | 0 | — |
| 67 | execution.project_phases | 00000_master_schema.sql:836 | ? | 1 | 1 | — |
| 68 | execution.project_risks | 00010_enterprise_expansion_30_tables.sql:85 | ? | 2 | 1 | — |
| 69 | execution.projects | 00000_master_schema.sql:802 | ? | 4 | 24 | project |
| 70 | execution.signatures | 00000_master_schema.sql:972 | ? | 0 | 0 | — |
| 71 | execution.task_attachments | 00010_enterprise_expansion_30_tables.sql:179 | ? | 3 | 0 | — |
| 72 | execution.task_comments | 00010_enterprise_expansion_30_tables.sql:156 | ? | 2 | 0 | — |
| 73 | execution.task_dependencies | 00000_master_schema.sql:924 | ? | 1 | 0 | — |
| 74 | execution.tasks | 00000_master_schema.sql:905 | ? | 1 | 3 | task |
| 75 | execution.work_order_qa_checklists | 00011_enterprise_expansion_30_more_tables.sql:277 | ? | 2 | 1 | — |
| 76 | execution.work_order_qa_items | 00011_enterprise_expansion_30_more_tables.sql:299 | ? | 2 | 0 | — |
| 77 | execution.work_order_tasks | 00000_master_schema.sql:891 | ? | 2 | 0 | — |
| 78 | execution.work_orders | 00000_master_schema.sql:866 | ? | 2 | 16 | work_order |
| 79 | finance.annual_tax_reports | 00000_master_schema.sql:1662 | ? | 0 | 0 | — |
| 80 | finance.bank_files | 00000_master_schema.sql:1537 | ? | 1 | 2 | — |
| 81 | finance.bank_matches | 00000_master_schema.sql:1550 | ? | 3 | 0 | — |
| 82 | finance.budget_entries | 00000_master_schema.sql:1579 | ? | 1 | 0 | — |
| 83 | finance.cashflow_entries | 00000_master_schema.sql:1564 | ? | 0 | 0 | — |
| 84 | finance.collection_actions | 00011_enterprise_expansion_30_more_tables.sql:362 | ? | 2 | 0 | — |
| 85 | finance.collection_cases | 00000_master_schema.sql:1626 | ? | 3 | 1 | — |
| 86 | finance.consolidation_entries | 00000_master_schema.sql:1617 | ? | 0 | 0 | — |
| 87 | finance.costing_entries | 00000_master_schema.sql:1591 | ? | 4 | 0 | — |
| 88 | finance.dunning_campaigns | 00011_enterprise_expansion_30_more_tables.sql:322 | ? | 0 | 1 | — |
| 89 | finance.dunning_steps | 00011_enterprise_expansion_30_more_tables.sql:341 | ? | 1 | 0 | — |
| 90 | finance.expenses | 00000_master_schema.sql:1643 | ? | 3 | 0 | — |
| 91 | finance.fx_rates | 00000_master_schema.sql:1607 | ? | 0 | 0 | — |
| 92 | finance.gl_transactions | 00000_master_schema.sql:1483 | ? | 1 | 0 | — |
| 93 | finance.invoice_lines | 00000_master_schema.sql:1429 | ? | 1 | 0 | — |
| 94 | finance.invoices | 00000_master_schema.sql:1401 | ? | 5 | 7 | invoice |
| 95 | finance.payment_allocations | 00010_enterprise_expansion_30_tables.sql:488 | ? | 3 | 0 | — |
| 96 | finance.payments | 00000_master_schema.sql:1461 | ? | 4 | 3 | payment |
| 97 | finance.receipts | 00000_master_schema.sql:1448 | ? | 1 | 0 | — |
| 98 | finance.reconciliation_exceptions | 00010_enterprise_expansion_30_tables.sql:459 | ? | 3 | 0 | — |
| 99 | finance.reminder_schedules | 00011_enterprise_expansion_30_more_tables.sql:381 | ? | 2 | 0 | — |
| 100 | finance.tax_exports | 00000_master_schema.sql:1523 | ? | 1 | 0 | — |
| 101 | finance.tax_records | 00000_master_schema.sql:1512 | ? | 1 | 0 | — |
| 102 | finance.vat_records | 00000_master_schema.sql:1499 | ? | 1 | 0 | — |
| 103 | governance.alert_subscriptions | 00010_enterprise_expansion_30_tables.sql:654 | ? | 1 | 0 | — |
| 104 | governance.audit_log_attachments | 00010_enterprise_expansion_30_tables.sql:727 | ? | 3 | 0 | — |
| 105 | governance.audit_logs | 00000_master_schema.sql:133 | ? | 1 | 1 | — |
| 106 | governance.command_logs | 00011_enterprise_expansion_30_more_tables.sql:583 | ? | 1 | 0 | — |
| 107 | governance.config_entries | 00000_master_schema.sql:303 | ? | 0 | 0 | — |
| 108 | governance.domain_events | 00000_master_schema.sql:172 | ? | 0 | 2 | — |
| 109 | governance.escalation_rules | 00010_enterprise_expansion_30_tables.sql:631 | ? | 0 | 0 | — |
| 110 | governance.event_deliveries | 00000_master_schema.sql:212 | ? | 2 | 0 | — |
| 111 | governance.event_subscriptions | 00000_master_schema.sql:200 | ? | 0 | 1 | — |
| 112 | governance.feature_flag_targets | 00010_enterprise_expansion_30_tables.sql:304 | ? | 1 | 0 | — |
| 113 | governance.feature_flags | 00000_master_schema.sql:293 | ? | 0 | 1 | — |
| 114 | governance.health_checks | 00000_master_schema.sql:329 | ? | 0 | 0 | — |
| 115 | governance.idempotency_keys | 00008_idempotency_table.sql:9 | ? | 0 | 0 | — |
| 116 | governance.integration_connections | 00010_enterprise_expansion_30_tables.sql:253 | ? | 1 | 1 | — |
| 117 | governance.integration_sync_logs | 00010_enterprise_expansion_30_tables.sql:279 | ? | 1 | 0 | — |
| 118 | governance.job_executions | 00010_enterprise_expansion_30_tables.sql:707 | ? | 1 | 0 | — |
| 119 | governance.object_permissions | 00000_master_schema.sql:114 | ? | 1 | 0 | — |
| 120 | governance.permissions | 00000_master_schema.sql:82 | ? | 0 | 1 | — |
| 121 | governance.queue_jobs | 00000_master_schema.sql:312 | ? | 0 | 1 | — |
| 122 | governance.role_permissions | 00000_master_schema.sql:95 | ? | 3 | 0 | — |
| 123 | governance.roles | 00000_master_schema.sql:71 | ? | 0 | 2 | — |
| 124 | governance.saved_filters | 00010_enterprise_expansion_30_tables.sql:347 | ? | 1 | 0 | — |
| 125 | governance.security_events | 00011_enterprise_expansion_30_more_tables.sql:609 | ? | 2 | 0 | — |
| 126 | governance.sla_timers | 00010_enterprise_expansion_30_tables.sql:678 | ? | 1 | 0 | — |
| 127 | governance.state_history | 00000_master_schema.sql:156 | ? | 1 | 0 | — |
| 128 | governance.user_preferences | 00010_enterprise_expansion_30_tables.sql:324 | ? | 1 | 0 | — |
| 129 | governance.user_roles | 00000_master_schema.sql:104 | ? | 2 | 0 | — |
| 130 | governance.users_profile | 00000_master_schema.sql:55 | ? | 0 | 94 | — |
| 131 | governance.validations_log | 00000_master_schema.sql:280 | ? | 0 | 0 | — |
| 132 | governance.webhook_deliveries | 00010_enterprise_expansion_30_tables.sql:223 | ? | 2 | 0 | — |
| 133 | governance.webhook_endpoints | 00010_enterprise_expansion_30_tables.sql:198 | ? | 1 | 1 | — |
| 134 | governance.workflow_instances | 00000_master_schema.sql:239 | ? | 1 | 1 | — |
| 135 | governance.workflow_step_executions | 00000_master_schema.sql:269 | ? | 3 | 0 | — |
| 136 | governance.workflow_steps | 00000_master_schema.sql:256 | ? | 1 | 1 | — |
| 137 | governance.workflows | 00000_master_schema.sql:228 | ? | 0 | 2 | — |
| 138 | intelligence.agent_jobs | 00023_ai_agent_registry_and_views.sql:19 | ? | 1 | 0 | — |
| 139 | intelligence.agent_registry | 00023_ai_agent_registry_and_views.sql:8 | ? | 0 | 1 | — |
| 140 | intelligence.ai_insights | 00000_master_schema.sql:1922 | ? | 0 | 0 | — |
| 141 | intelligence.anomaly_cases | 00000_master_schema.sql:1940 | ? | 0 | 1 | — |
| 142 | intelligence.anomaly_feedback | 00010_enterprise_expansion_30_tables.sql:743 | ? | 2 | 0 | — |
| 143 | intelligence.decision_recommendations | 00000_master_schema.sql:2006 | ? | 0 | 1 | — |
| 144 | intelligence.forecast_models | 00000_master_schema.sql:1957 | ? | 0 | 0 | — |
| 145 | intelligence.model_executions | 00011_enterprise_expansion_30_more_tables.sql:524 | ? | 1 | 0 | — |
| 146 | intelligence.model_registry | 00011_enterprise_expansion_30_more_tables.sql:501 | ? | 0 | 1 | — |
| 147 | intelligence.quality_scores | 00000_master_schema.sql:1974 | ? | 0 | 0 | — |
| 148 | intelligence.recommendation_feedback | 00011_enterprise_expansion_30_more_tables.sql:546 | ? | 2 | 0 | — |
| 149 | intelligence.seasonality_patterns | 00000_master_schema.sql:1996 | ? | 0 | 0 | — |
| 150 | intelligence.trend_signals | 00000_master_schema.sql:1985 | ? | 0 | 0 | — |
| 151 | inventory.barcode_scans | 00000_master_schema.sql:1186 | ? | 3 | 0 | — |
| 152 | inventory.inventory | 00000_master_schema.sql:1055 | ? | 2 | 0 | — |
| 153 | inventory.inventory_issues | 00000_master_schema.sql:1088 | ? | 5 | 0 | — |
| 154 | inventory.inventory_movements | 00011_enterprise_expansion_30_more_tables.sql:188 | ? | 4 | 0 | — |
| 155 | inventory.inventory_receipts | 00000_master_schema.sql:1070 | ? | 5 | 0 | — |
| 156 | inventory.inventory_reservations | 00000_master_schema.sql:1120 | ? | 5 | 0 | — |
| 157 | inventory.inventory_transfers | 00000_master_schema.sql:1105 | ? | 3 | 0 | — |
| 158 | inventory.manufacturing_batches | 00000_master_schema.sql:1198 | ? | 2 | 0 | — |
| 159 | inventory.material_categories | 00000_master_schema.sql:1010 | ? | 1 | 2 | — |
| 160 | inventory.material_lots | 00011_enterprise_expansion_30_more_tables.sql:160 | ? | 2 | 1 | — |
| 161 | inventory.material_request_lines | 00000_master_schema.sql:1173 | ? | 2 | 0 | — |
| 162 | inventory.material_requests | 00000_master_schema.sql:1159 | ? | 3 | 1 | — |
| 163 | inventory.materials | 00000_master_schema.sql:1020 | ? | 3 | 13 | material |
| 164 | inventory.reorder_rules | 00011_enterprise_expansion_30_more_tables.sql:212 | ? | 2 | 0 | — |
| 165 | inventory.shortage_snapshots | 00011_enterprise_expansion_30_more_tables.sql:234 | ? | 2 | 0 | — |
| 166 | inventory.stock_count_lines | 00000_master_schema.sql:1148 | ? | 2 | 0 | — |
| 167 | inventory.stock_counts | 00000_master_schema.sql:1135 | ? | 2 | 1 | — |
| 168 | inventory.warehouses | 00000_master_schema.sql:1040 | ? | 1 | 10 | — |
| 169 | maintenance.assets | 00027_enterprise_30_tables.sql:328 | ? | 0 | 1 | — |
| 170 | maintenance.work_orders | 00027_enterprise_30_tables.sql:348 | ? | 2 | 0 | work_order |
| 171 | orchestration.job_queue | 00024_orchestration_tables.sql:73 | ? | 1 | 0 | — |
| 172 | orchestration.notifications | 00024_orchestration_tables.sql:111 | ? | 0 | 0 | — |
| 173 | orchestration.universal_inbox | 00024_orchestration_tables.sql:94 | ? | 1 | 0 | — |
| 174 | orchestration.workflow_definitions | 00024_orchestration_tables.sql:10 | ? | 0 | 2 | — |
| 175 | orchestration.workflow_runs | 00024_orchestration_tables.sql:38 | ? | 2 | 2 | — |
| 176 | orchestration.workflow_step_runs | 00024_orchestration_tables.sql:54 | ? | 2 | 0 | — |
| 177 | orchestration.workflow_steps | 00024_orchestration_tables.sql:22 | ? | 1 | 1 | — |
| 178 | planning.capacity_calendars | 00027_enterprise_30_tables.sql:277 | ? | 0 | 1 | — |
| 179 | planning.capacity_slots | 00027_enterprise_30_tables.sql:294 | ? | 1 | 0 | — |
| 180 | planning.demand_forecasts | 00027_enterprise_30_tables.sql:309 | ? | 0 | 0 | — |
| 181 | pricing.calculations | 00027_enterprise_30_tables.sql:386 | ? | 1 | 0 | — |
| 182 | pricing.rule_sets | 00027_enterprise_30_tables.sql:369 | ? | 0 | 1 | — |
| 183 | procurement.approval_steps | 00011_enterprise_expansion_30_more_tables.sql:88 | ? | 2 | 0 | — |
| 184 | procurement.approvals | 00000_master_schema.sql:659 | ? | 1 | 1 | — |
| 185 | procurement.contract_milestones | 00011_enterprise_expansion_30_more_tables.sql:137 | ? | 1 | 0 | — |
| 186 | procurement.contracts | 00000_master_schema.sql:677 | ? | 3 | 3 | contract |
| 187 | procurement.purchase_order_lines | 00000_master_schema.sql:725 | ? | 2 | 1 | — |
| 188 | procurement.purchase_orders | 00000_master_schema.sql:697 | ? | 4 | 6 | po |
| 189 | procurement.returns | 00000_master_schema.sql:767 | ? | 2 | 0 | — |
| 190 | procurement.rfq_comparison_snapshots | 00010_enterprise_expansion_30_tables.sql:439 | ? | 3 | 0 | — |
| 191 | procurement.rfq_items | 00000_master_schema.sql:591 | ? | 1 | 1 | — |
| 192 | procurement.rfq_supplier_invites | 00000_master_schema.sql:607 | ? | 2 | 0 | — |
| 193 | procurement.rfqs | 00000_master_schema.sql:572 | ? | 2 | 5 | rfq |
| 194 | procurement.supplier_contacts | 00010_enterprise_expansion_30_tables.sql:48 | ? | 2 | 0 | — |
| 195 | procurement.supplier_invoices | 00000_master_schema.sql:748 | ? | 2 | 0 | — |
| 196 | procurement.supplier_portal_accounts | 00000_master_schema.sql:1790 | ? | 2 | 0 | — |
| 197 | procurement.supplier_quote_lines | 00000_master_schema.sql:640 | ? | 2 | 1 | — |
| 198 | procurement.supplier_quotes | 00000_master_schema.sql:618 | ? | 2 | 1 | — |
| 199 | procurement.supplier_scorecards | 00011_enterprise_expansion_30_more_tables.sql:114 | ? | 1 | 0 | — |
| 200 | procurement.suppliers | 00000_master_schema.sql:537 | ? | 1 | 19 | supplier |
| 201 | procurement.warranty_cases | 00000_master_schema.sql:781 | ? | 3 | 0 | — |
| 202 | public.app_menu | 00017_app_menu.sql:6 | ? | 1 | 1 | — |
| 203 | public.customers | 20260417000000_initial_schema.sql:21 | ? | 0 | 1 | customer |
| 204 | public.employees | 20260417000000_initial_schema.sql:85 | ? | 0 | 0 | employee |
| 205 | public.inventory_items | 20260417000000_initial_schema.sql:52 | ? | 1 | 0 | — |
| 206 | public.orders | 20260417000000_initial_schema.sql:69 | ? | 1 | 0 | — |
| 207 | public.properties | 20260417000000_initial_schema.sql:99 | ? | 0 | 0 | — |
| 208 | public.suppliers | 20260417000000_initial_schema.sql:38 | ? | 0 | 1 | supplier |
| 209 | public.user_profiles | 20260417000000_initial_schema.sql:8 | ? | 1 | 0 | — |
| 210 | quality.defects | 00027_enterprise_30_tables.sql:169 | ? | 4 | 0 | — |
| 211 | quality.inspection_plans | 00027_enterprise_30_tables.sql:130 | ? | 0 | 1 | — |
| 212 | quality.inspection_runs | 00027_enterprise_30_tables.sql:148 | ? | 4 | 1 | — |
| 213 | routing.menu_nodes | 00027_enterprise_30_tables.sql:425 | ? | 2 | 1 | — |
| 214 | routing.route_permission_map | 00027_enterprise_30_tables.sql:443 | ? | 1 | 0 | — |
| 215 | routing.route_registry | 00027_enterprise_30_tables.sql:406 | ? | 0 | 2 | — |
| 216 | service.ticket_comments | 00027_enterprise_30_tables.sql:115 | ? | 2 | 0 | — |
| 217 | service.tickets | 00027_enterprise_30_tables.sql:90 | ? | 4 | 1 | — |
| 218 | treasury.bank_accounts | 00027_enterprise_30_tables.sql:224 | ? | 0 | 2 | — |
| 219 | treasury.cash_forecasts | 00027_enterprise_30_tables.sql:259 | ? | 1 | 0 | — |
| 220 | treasury.cash_positions | 00027_enterprise_30_tables.sql:243 | ? | 1 | 0 | — |
| 221 | workforce.attendance | 00000_master_schema.sql:1283 | ? | 4 | 0 | — |
| 222 | workforce.employee_expenses | 00000_master_schema.sql:1366 | ? | 2 | 0 | — |
| 223 | workforce.employee_pay_components | 00011_enterprise_expansion_30_more_tables.sql:429 | ? | 2 | 0 | — |
| 224 | workforce.employees | 00000_master_schema.sql:1229 | ? | 2 | 13 | employee |
| 225 | workforce.employers | 00000_master_schema.sql:1216 | ? | 0 | 2 | — |
| 226 | workforce.hr_profiles | 00000_master_schema.sql:1254 | ? | 1 | 0 | — |
| 227 | workforce.leave_requests | 00011_enterprise_expansion_30_more_tables.sql:473 | ? | 3 | 0 | — |
| 228 | workforce.leave_types | 00011_enterprise_expansion_30_more_tables.sql:454 | ? | 0 | 1 | — |
| 229 | workforce.pay_components | 00011_enterprise_expansion_30_more_tables.sql:407 | ? | 0 | 1 | — |
| 230 | workforce.payroll_entries | 00000_master_schema.sql:1323 | ? | 2 | 2 | — |
| 231 | workforce.payroll_exceptions | 00010_enterprise_expansion_30_tables.sql:529 | ? | 3 | 0 | — |
| 232 | workforce.payroll_export_batches | 00010_enterprise_expansion_30_tables.sql:506 | ? | 2 | 0 | — |
| 233 | workforce.payroll_runs | 00000_master_schema.sql:1305 | ? | 2 | 3 | — |
| 234 | workforce.pension_records | 00000_master_schema.sql:1354 | ? | 2 | 0 | — |
| 235 | workforce.shifts | 00000_master_schema.sql:1384 | ? | 3 | 0 | — |
| 236 | workforce.wage_slips | 00000_master_schema.sql:1340 | ? | 2 | 0 | — |
| 237 | workforce.workforce_assignments | 00000_master_schema.sql:1269 | ? | 4 | 0 | — |


## 3. RELATIONSHIPS REGISTRY

All **346 unique foreign-key relationships** extracted from `references <table>(<col>)` clauses in migrations.

| # | from | → | to | source |
|---|------|---|-----|--------|
| 1 | `governance.role_permissions.role_id` | → | `governance.roles.id` | 00000_master_schema.sql:97 |
| 2 | `governance.role_permissions.permission_id` | → | `governance.permissions.id` | 00000_master_schema.sql:98 |
| 3 | `governance.role_permissions.granted_by` | → | `governance.users_profile.id` | 00000_master_schema.sql:100 |
| 4 | `governance.user_roles.user_id` | → | `governance.users_profile.id` | 00000_master_schema.sql:106 |
| 5 | `governance.user_roles.role_id` | → | `governance.roles.id` | 00000_master_schema.sql:107 |
| 6 | `governance.object_permissions.granted_by` | → | `governance.users_profile.id` | 00000_master_schema.sql:123 |
| 7 | `governance.audit_logs.performed_by_user_id` | → | `governance.users_profile.id` | 00000_master_schema.sql:141 |
| 8 | `governance.state_history.changed_by_user_id` | → | `governance.users_profile.id` | 00000_master_schema.sql:163 |
| 9 | `governance.event_deliveries.domain_event_id` | → | `governance.domain_events.id` | 00000_master_schema.sql:214 |
| 10 | `governance.event_deliveries.subscription_id` | → | `governance.event_subscriptions.id` | 00000_master_schema.sql:215 |
| 11 | `governance.workflow_instances.workflow_id` | → | `governance.workflows.id` | 00000_master_schema.sql:242 |
| 12 | `governance.workflow_steps.workflow_id` | → | `governance.workflows.id` | 00000_master_schema.sql:258 |
| 13 | `governance.workflow_step_executions.workflow_instance_id` | → | `governance.workflow_instances.id` | 00000_master_schema.sql:271 |
| 14 | `governance.workflow_step_executions.workflow_step_id` | → | `governance.workflow_steps.id` | 00000_master_schema.sql:272 |
| 15 | `governance.workflow_step_executions.executed_by_user_id` | → | `governance.users_profile.id` | 00000_master_schema.sql:274 |
| 16 | `commercial.customers.account_manager_user_id` | → | `governance.users_profile.id` | 00000_master_schema.sql:378 |
| 17 | `commercial.leads.pipeline_stage_id` | → | `commercial.pipeline_stages.id` | 00000_master_schema.sql:415 |
| 18 | `commercial.leads.assigned_user_id` | → | `governance.users_profile.id` | 00000_master_schema.sql:416 |
| 19 | `commercial.leads.customer_id` | → | `commercial.customers.id` | 00000_master_schema.sql:417 |
| 20 | `commercial.crm_activities.performed_by_user_id` | → | `governance.users_profile.id` | 00000_master_schema.sql:440 |
| 21 | `commercial.opportunities.lead_id` | → | `commercial.leads.id` | 00000_master_schema.sql:453 |
| 22 | `commercial.opportunities.customer_id` | → | `commercial.customers.id` | 00000_master_schema.sql:454 |
| 23 | `commercial.opportunities.owner_user_id` | → | `governance.users_profile.id` | 00000_master_schema.sql:462 |
| 24 | `commercial.quotes.customer_id` | → | `commercial.customers.id` | 00000_master_schema.sql:471 |
| 25 | `commercial.quotes.lead_id` | → | `commercial.leads.id` | 00000_master_schema.sql:472 |
| 26 | `commercial.quotes.opportunity_id` | → | `commercial.opportunities.id` | 00000_master_schema.sql:473 |
| 27 | `commercial.quotes.created_by` | → | `governance.users_profile.id` | 00000_master_schema.sql:490 |
| 28 | `commercial.quote_lines.quote_id` | → | `commercial.quotes.id` | 00000_master_schema.sql:496 |
| 29 | `commercial.pricing_snapshots.quote_id` | → | `commercial.quotes.id` | 00000_master_schema.sql:519 |
| 30 | `commercial.pricing_snapshots.created_by` | → | `governance.users_profile.id` | 00000_master_schema.sql:525 |
| 31 | `procurement.suppliers.created_by` | → | `governance.users_profile.id` | 00000_master_schema.sql:567 |
| 32 | `procurement.rfqs.winning_supplier_id` | → | `procurement.suppliers.id` | 00000_master_schema.sql:583 |
| 33 | `procurement.rfqs.created_by` | → | `governance.users_profile.id` | 00000_master_schema.sql:587 |
| 34 | `procurement.rfq_items.rfq_id` | → | `procurement.rfqs.id` | 00000_master_schema.sql:593 |
| 35 | `procurement.rfq_supplier_invites.rfq_id` | → | `procurement.rfqs.id` | 00000_master_schema.sql:609 |
| 36 | `procurement.rfq_supplier_invites.supplier_id` | → | `procurement.suppliers.id` | 00000_master_schema.sql:610 |
| 37 | `procurement.supplier_quotes.rfq_id` | → | `procurement.rfqs.id` | 00000_master_schema.sql:621 |
| 38 | `procurement.supplier_quotes.supplier_id` | → | `procurement.suppliers.id` | 00000_master_schema.sql:622 |
| 39 | `procurement.supplier_quote_lines.supplier_quote_id` | → | `procurement.supplier_quotes.id` | 00000_master_schema.sql:642 |
| 40 | `procurement.supplier_quote_lines.rfq_item_id` | → | `procurement.rfq_items.id` | 00000_master_schema.sql:643 |
| 41 | `procurement.approvals.requested_by_user_id` | → | `governance.users_profile.id` | 00000_master_schema.sql:665 |
| 42 | `procurement.contracts.customer_id` | → | `commercial.customers.id` | 00000_master_schema.sql:682 |
| 43 | `procurement.contracts.supplier_id` | → | `procurement.suppliers.id` | 00000_master_schema.sql:683 |
| 44 | `procurement.contracts.quote_id` | → | `commercial.quotes.id` | 00000_master_schema.sql:684 |
| 45 | `procurement.purchase_orders.supplier_id` | → | `procurement.suppliers.id` | 00000_master_schema.sql:701 |
| 46 | `procurement.purchase_orders.rfq_id` | → | `procurement.rfqs.id` | 00000_master_schema.sql:703 |
| 47 | `procurement.purchase_orders.contract_id` | → | `procurement.contracts.id` | 00000_master_schema.sql:704 |
| 48 | `procurement.purchase_orders.created_by` | → | `governance.users_profile.id` | 00000_master_schema.sql:721 |
| 49 | `procurement.purchase_order_lines.po_id` | → | `procurement.purchase_orders.id` | 00000_master_schema.sql:727 |
| 50 | `procurement.purchase_order_lines.supplier_quote_line_id` | → | `procurement.supplier_quote_lines.id` | 00000_master_schema.sql:730 |
| 51 | `procurement.supplier_invoices.supplier_id` | → | `procurement.suppliers.id` | 00000_master_schema.sql:752 |
| 52 | `procurement.supplier_invoices.po_id` | → | `procurement.purchase_orders.id` | 00000_master_schema.sql:753 |
| 53 | `procurement.returns.supplier_id` | → | `procurement.suppliers.id` | 00000_master_schema.sql:771 |
| 54 | `procurement.returns.po_id` | → | `procurement.purchase_orders.id` | 00000_master_schema.sql:772 |
| 55 | `procurement.warranty_cases.supplier_id` | → | `procurement.suppliers.id` | 00000_master_schema.sql:785 |
| 56 | `procurement.warranty_cases.customer_id` | → | `commercial.customers.id` | 00000_master_schema.sql:786 |
| 57 | `procurement.warranty_cases.po_id` | → | `procurement.purchase_orders.id` | 00000_master_schema.sql:787 |
| 58 | `execution.projects.customer_id` | → | `commercial.customers.id` | 00000_master_schema.sql:807 |
| 59 | `execution.projects.quote_id` | → | `commercial.quotes.id` | 00000_master_schema.sql:808 |
| 60 | `execution.projects.contract_id` | → | `procurement.contracts.id` | 00000_master_schema.sql:809 |
| 61 | `execution.projects.owner_user_id` | → | `governance.users_profile.id` | 00000_master_schema.sql:815 |
| 62 | `execution.project_phases.project_id` | → | `execution.projects.id` | 00000_master_schema.sql:838 |
| 63 | `execution.project_milestones.project_id` | → | `execution.projects.id` | 00000_master_schema.sql:855 |
| 64 | `execution.project_milestones.phase_id` | → | `execution.project_phases.id` | 00000_master_schema.sql:856 |
| 65 | `execution.work_orders.project_id` | → | `execution.projects.id` | 00000_master_schema.sql:870 |
| 66 | `execution.work_orders.owner_user_id` | → | `governance.users_profile.id` | 00000_master_schema.sql:882 |
| 67 | `execution.work_order_tasks.work_order_id` | → | `execution.work_orders.id` | 00000_master_schema.sql:893 |
| 68 | `execution.work_order_tasks.assignee_user_id` | → | `governance.users_profile.id` | 00000_master_schema.sql:897 |
| 69 | `execution.tasks.assignee_user_id` | → | `governance.users_profile.id` | 00000_master_schema.sql:913 |
| 70 | `execution.task_dependencies.predecessor_task_id` | → | `execution.tasks.id` | 00000_master_schema.sql:926 |
| 71 | `execution.logistics_orders.project_id` | → | `execution.projects.id` | 00000_master_schema.sql:937 |
| 72 | `execution.logistics_orders.work_order_id` | → | `execution.work_orders.id` | 00000_master_schema.sql:938 |
| 73 | `execution.delivery_events.project_id` | → | `execution.projects.id` | 00000_master_schema.sql:952 |
| 74 | `execution.delivery_events.work_order_id` | → | `execution.work_orders.id` | 00000_master_schema.sql:953 |
| 75 | `execution.delivery_events.logistics_order_id` | → | `execution.logistics_orders.id` | 00000_master_schema.sql:954 |
| 76 | `execution.delivery_events.delivered_by_user_id` | → | `governance.users_profile.id` | 00000_master_schema.sql:956 |
| 77 | `execution.installation_events.project_id` | → | `execution.projects.id` | 00000_master_schema.sql:964 |
| 78 | `execution.installation_events.work_order_id` | → | `execution.work_orders.id` | 00000_master_schema.sql:965 |
| 79 | `execution.installation_events.installed_by_user_id` | → | `governance.users_profile.id` | 00000_master_schema.sql:967 |
| 80 | `execution.alerts.assigned_to_user_id` | → | `governance.users_profile.id` | 00000_master_schema.sql:996 |
| 81 | `inventory.material_categories.parent_category_id` | → | `inventory.material_categories.id` | 00000_master_schema.sql:1014 |
| 82 | `inventory.materials.category_id` | → | `inventory.material_categories.id` | 00000_master_schema.sql:1026 |
| 83 | `inventory.materials.preferred_supplier_id` | → | `procurement.suppliers.id` | 00000_master_schema.sql:1028 |
| 84 | `inventory.materials.created_by` | → | `governance.users_profile.id` | 00000_master_schema.sql:1036 |
| 85 | `inventory.warehouses.manager_user_id` | → | `governance.users_profile.id` | 00000_master_schema.sql:1048 |
| 86 | `inventory.inventory.material_id` | → | `inventory.materials.id` | 00000_master_schema.sql:1057 |
| 87 | `inventory.inventory.warehouse_id` | → | `inventory.warehouses.id` | 00000_master_schema.sql:1058 |
| 88 | `inventory.inventory_receipts.po_id` | → | `procurement.purchase_orders.id` | 00000_master_schema.sql:1074 |
| 89 | `inventory.inventory_receipts.po_line_id` | → | `procurement.purchase_order_lines.id` | 00000_master_schema.sql:1075 |
| 90 | `inventory.inventory_receipts.material_id` | → | `inventory.materials.id` | 00000_master_schema.sql:1076 |
| 91 | `inventory.inventory_receipts.warehouse_id` | → | `inventory.warehouses.id` | 00000_master_schema.sql:1077 |
| 92 | `inventory.inventory_receipts.received_by_user_id` | → | `governance.users_profile.id` | 00000_master_schema.sql:1082 |
| 93 | `inventory.inventory_issues.project_id` | → | `execution.projects.id` | 00000_master_schema.sql:1092 |
| 94 | `inventory.inventory_issues.work_order_id` | → | `execution.work_orders.id` | 00000_master_schema.sql:1093 |
| 95 | `inventory.inventory_issues.material_id` | → | `inventory.materials.id` | 00000_master_schema.sql:1094 |
| 96 | `inventory.inventory_issues.warehouse_id` | → | `inventory.warehouses.id` | 00000_master_schema.sql:1095 |
| 97 | `inventory.inventory_issues.issued_by_user_id` | → | `governance.users_profile.id` | 00000_master_schema.sql:1098 |
| 98 | `inventory.inventory_transfers.material_id` | → | `inventory.materials.id` | 00000_master_schema.sql:1109 |
| 99 | `inventory.inventory_transfers.from_warehouse_id` | → | `inventory.warehouses.id` | 00000_master_schema.sql:1110 |
| 100 | `inventory.inventory_transfers.transferred_by_user_id` | → | `governance.users_profile.id` | 00000_master_schema.sql:1114 |
| 101 | `inventory.inventory_reservations.material_id` | → | `inventory.materials.id` | 00000_master_schema.sql:1122 |
| 102 | `inventory.inventory_reservations.warehouse_id` | → | `inventory.warehouses.id` | 00000_master_schema.sql:1123 |
| 103 | `inventory.inventory_reservations.project_id` | → | `execution.projects.id` | 00000_master_schema.sql:1124 |
| 104 | `inventory.inventory_reservations.work_order_id` | → | `execution.work_orders.id` | 00000_master_schema.sql:1125 |
| 105 | `inventory.inventory_reservations.reserved_by_user_id` | → | `governance.users_profile.id` | 00000_master_schema.sql:1128 |
| 106 | `inventory.stock_counts.warehouse_id` | → | `inventory.warehouses.id` | 00000_master_schema.sql:1139 |
| 107 | `inventory.stock_counts.counted_by_user_id` | → | `governance.users_profile.id` | 00000_master_schema.sql:1141 |
| 108 | `inventory.stock_count_lines.stock_count_id` | → | `inventory.stock_counts.id` | 00000_master_schema.sql:1150 |
| 109 | `inventory.stock_count_lines.material_id` | → | `inventory.materials.id` | 00000_master_schema.sql:1151 |
| 110 | `inventory.material_requests.project_id` | → | `execution.projects.id` | 00000_master_schema.sql:1163 |
| 111 | `inventory.material_requests.work_order_id` | → | `execution.work_orders.id` | 00000_master_schema.sql:1164 |
| 112 | `inventory.material_requests.requested_by_user_id` | → | `governance.users_profile.id` | 00000_master_schema.sql:1165 |
| 113 | `inventory.material_request_lines.material_request_id` | → | `inventory.material_requests.id` | 00000_master_schema.sql:1175 |
| 114 | `inventory.material_request_lines.material_id` | → | `inventory.materials.id` | 00000_master_schema.sql:1176 |
| 115 | `inventory.barcode_scans.material_id` | → | `inventory.materials.id` | 00000_master_schema.sql:1189 |
| 116 | `inventory.barcode_scans.warehouse_id` | → | `inventory.warehouses.id` | 00000_master_schema.sql:1190 |
| 117 | `inventory.barcode_scans.scanned_by_user_id` | → | `governance.users_profile.id` | 00000_master_schema.sql:1193 |
| 118 | `inventory.manufacturing_batches.project_id` | → | `execution.projects.id` | 00000_master_schema.sql:1202 |
| 119 | `inventory.manufacturing_batches.work_order_id` | → | `execution.work_orders.id` | 00000_master_schema.sql:1203 |
| 120 | `workforce.employees.employer_id` | → | `workforce.employers.id` | 00000_master_schema.sql:1236 |
| 121 | `workforce.employees.created_by` | → | `governance.users_profile.id` | 00000_master_schema.sql:1249 |
| 122 | `workforce.hr_profiles.employee_id` | → | `workforce.employees.id` | 00000_master_schema.sql:1256 |
| 123 | `workforce.workforce_assignments.employee_id` | → | `workforce.employees.id` | 00000_master_schema.sql:1271 |
| 124 | `workforce.workforce_assignments.project_id` | → | `execution.projects.id` | 00000_master_schema.sql:1272 |
| 125 | `workforce.workforce_assignments.work_order_id` | → | `execution.work_orders.id` | 00000_master_schema.sql:1273 |
| 126 | `workforce.workforce_assignments.assigned_by_user_id` | → | `governance.users_profile.id` | 00000_master_schema.sql:1278 |
| 127 | `workforce.attendance.employee_id` | → | `workforce.employees.id` | 00000_master_schema.sql:1287 |
| 128 | `workforce.attendance.project_id` | → | `execution.projects.id` | 00000_master_schema.sql:1288 |
| 129 | `workforce.attendance.work_order_id` | → | `execution.work_orders.id` | 00000_master_schema.sql:1289 |
| 130 | `workforce.attendance.approved_by_user_id` | → | `governance.users_profile.id` | 00000_master_schema.sql:1298 |
| 131 | `workforce.payroll_runs.employer_id` | → | `workforce.employers.id` | 00000_master_schema.sql:1311 |
| 132 | `workforce.payroll_runs.created_by` | → | `governance.users_profile.id` | 00000_master_schema.sql:1317 |
| 133 | `workforce.payroll_entries.payroll_run_id` | → | `workforce.payroll_runs.id` | 00000_master_schema.sql:1325 |
| 134 | `workforce.payroll_entries.employee_id` | → | `workforce.employees.id` | 00000_master_schema.sql:1326 |
| 135 | `workforce.wage_slips.payroll_entry_id` | → | `workforce.payroll_entries.id` | 00000_master_schema.sql:1343 |
| 136 | `workforce.wage_slips.employee_id` | → | `workforce.employees.id` | 00000_master_schema.sql:1344 |
| 137 | `workforce.pension_records.payroll_entry_id` | → | `workforce.payroll_entries.id` | 00000_master_schema.sql:1356 |
| 138 | `workforce.pension_records.employee_id` | → | `workforce.employees.id` | 00000_master_schema.sql:1357 |
| 139 | `workforce.employee_expenses.employee_id` | → | `workforce.employees.id` | 00000_master_schema.sql:1370 |
| 140 | `workforce.employee_expenses.project_id` | → | `execution.projects.id` | 00000_master_schema.sql:1371 |
| 141 | `workforce.shifts.employee_id` | → | `workforce.employees.id` | 00000_master_schema.sql:1386 |
| 142 | `workforce.shifts.project_id` | → | `execution.projects.id` | 00000_master_schema.sql:1387 |
| 143 | `workforce.shifts.work_order_id` | → | `execution.work_orders.id` | 00000_master_schema.sql:1388 |
| 144 | `finance.invoices.customer_id` | → | `commercial.customers.id` | 00000_master_schema.sql:1406 |
| 145 | `finance.invoices.supplier_id` | → | `procurement.suppliers.id` | 00000_master_schema.sql:1407 |
| 146 | `finance.invoices.project_id` | → | `execution.projects.id` | 00000_master_schema.sql:1408 |
| 147 | `finance.invoices.po_id` | → | `procurement.purchase_orders.id` | 00000_master_schema.sql:1409 |
| 148 | `finance.invoices.created_by` | → | `governance.users_profile.id` | 00000_master_schema.sql:1425 |
| 149 | `finance.invoice_lines.invoice_id` | → | `finance.invoices.id` | 00000_master_schema.sql:1431 |
| 150 | `finance.receipts.customer_id` | → | `commercial.customers.id` | 00000_master_schema.sql:1452 |
| 151 | `finance.payments.invoice_id` | → | `finance.invoices.id` | 00000_master_schema.sql:1465 |
| 152 | `finance.payments.customer_id` | → | `commercial.customers.id` | 00000_master_schema.sql:1466 |
| 153 | `finance.payments.supplier_id` | → | `procurement.suppliers.id` | 00000_master_schema.sql:1467 |
| 154 | `finance.payments.created_by` | → | `governance.users_profile.id` | 00000_master_schema.sql:1479 |
| 155 | `finance.gl_transactions.created_by` | → | `governance.users_profile.id` | 00000_master_schema.sql:1496 |
| 156 | `finance.vat_records.invoice_id` | → | `finance.invoices.id` | 00000_master_schema.sql:1501 |
| 157 | `finance.tax_records.invoice_id` | → | `finance.invoices.id` | 00000_master_schema.sql:1514 |
| 158 | `finance.tax_exports.exported_by_user_id` | → | `governance.users_profile.id` | 00000_master_schema.sql:1531 |
| 159 | `finance.bank_files.imported_by_user_id` | → | `governance.users_profile.id` | 00000_master_schema.sql:1543 |
| 160 | `finance.bank_matches.payment_id` | → | `finance.payments.id` | 00000_master_schema.sql:1552 |
| 161 | `finance.bank_matches.bank_file_id` | → | `finance.bank_files.id` | 00000_master_schema.sql:1553 |
| 162 | `finance.bank_matches.matched_by_user_id` | → | `governance.users_profile.id` | 00000_master_schema.sql:1557 |
| 163 | `finance.budget_entries.project_id` | → | `execution.projects.id` | 00000_master_schema.sql:1581 |
| 164 | `finance.costing_entries.project_id` | → | `execution.projects.id` | 00000_master_schema.sql:1593 |
| 165 | `finance.costing_entries.work_order_id` | → | `execution.work_orders.id` | 00000_master_schema.sql:1594 |
| 166 | `finance.costing_entries.material_id` | → | `inventory.materials.id` | 00000_master_schema.sql:1595 |
| 167 | `finance.costing_entries.employee_id` | → | `workforce.employees.id` | 00000_master_schema.sql:1596 |
| 168 | `finance.collection_cases.invoice_id` | → | `finance.invoices.id` | 00000_master_schema.sql:1630 |
| 169 | `finance.collection_cases.customer_id` | → | `commercial.customers.id` | 00000_master_schema.sql:1631 |
| 170 | `finance.collection_cases.assigned_to_user_id` | → | `governance.users_profile.id` | 00000_master_schema.sql:1633 |
| 171 | `finance.expenses.supplier_id` | → | `procurement.suppliers.id` | 00000_master_schema.sql:1648 |
| 172 | `finance.expenses.employee_id` | → | `workforce.employees.id` | 00000_master_schema.sql:1649 |
| 173 | `finance.expenses.project_id` | → | `execution.projects.id` | 00000_master_schema.sql:1650 |
| 174 | `docs.documents.uploaded_by_user_id` | → | `governance.users_profile.id` | 00000_master_schema.sql:1696 |
| 175 | `docs.document_classifications.document_id` | → | `docs.documents.id` | 00000_master_schema.sql:1704 |
| 176 | `docs.ocr_results.document_id` | → | `docs.documents.id` | 00000_master_schema.sql:1714 |
| 177 | `docs.attachments.document_id` | → | `docs.documents.id` | 00000_master_schema.sql:1725 |
| 178 | `docs.attachments.attached_by_user_id` | → | `governance.users_profile.id` | 00000_master_schema.sql:1729 |
| 179 | `docs.print_jobs.document_id` | → | `docs.documents.id` | 00000_master_schema.sql:1735 |
| 180 | `docs.print_jobs.requested_by_user_id` | → | `governance.users_profile.id` | 00000_master_schema.sql:1740 |
| 181 | `docs.scan_sessions.initiated_by_user_id` | → | `governance.users_profile.id` | 00000_master_schema.sql:1751 |
| 182 | `comms.portal_users.customer_id` | → | `commercial.customers.id` | 00000_master_schema.sql:1770 |
| 183 | `comms.portal_users.supplier_id` | → | `procurement.suppliers.id` | 00000_master_schema.sql:1771 |
| 184 | `commercial.customer_portal_accounts.customer_id` | → | `commercial.customers.id` | 00000_master_schema.sql:1782 |
| 185 | `commercial.customer_portal_accounts.portal_user_id` | → | `comms.portal_users.id` | 00000_master_schema.sql:1783 |
| 186 | `procurement.supplier_portal_accounts.supplier_id` | → | `procurement.suppliers.id` | 00000_master_schema.sql:1792 |
| 187 | `procurement.supplier_portal_accounts.portal_user_id` | → | `comms.portal_users.id` | 00000_master_schema.sql:1793 |
| 188 | `comms.notifications.user_id` | → | `governance.users_profile.id` | 00000_master_schema.sql:1803 |
| 189 | `comms.notifications.portal_user_id` | → | `comms.portal_users.id` | 00000_master_schema.sql:1804 |
| 190 | `comms.email_messages.thread_id` | → | `comms.comms_threads.id` | 00000_master_schema.sql:1830 |
| 191 | `comms.sms_messages.thread_id` | → | `comms.comms_threads.id` | 00000_master_schema.sql:1848 |
| 192 | `comms.whatsapp_messages.thread_id` | → | `comms.comms_threads.id` | 00000_master_schema.sql:1861 |
| 193 | `comms.chatbot_sessions.user_id` | → | `governance.users_profile.id` | 00000_master_schema.sql:1875 |
| 194 | `comms.chatbot_sessions.portal_user_id` | → | `comms.portal_users.id` | 00000_master_schema.sql:1876 |
| 195 | `comms.support_tickets.customer_id` | → | `commercial.customers.id` | 00000_master_schema.sql:1890 |
| 196 | `comms.support_tickets.supplier_id` | → | `procurement.suppliers.id` | 00000_master_schema.sql:1891 |
| 197 | `comms.support_tickets.portal_user_id` | → | `comms.portal_users.id` | 00000_master_schema.sql:1892 |
| 198 | `comms.support_tickets.assigned_to_user_id` | → | `governance.users_profile.id` | 00000_master_schema.sql:1896 |
| 199 | `commercial.customer_contacts.customer_id` | → | `commercial.customers.id` | 00010_enterprise_expansion_30_tables.sql:14 |
| 200 | `commercial.customer_contacts.created_by` | → | `governance.users_profile.id` | 00010_enterprise_expansion_30_tables.sql:30 |
| 201 | `procurement.supplier_contacts.supplier_id` | → | `procurement.suppliers.id` | 00010_enterprise_expansion_30_tables.sql:51 |
| 202 | `procurement.supplier_contacts.created_by` | → | `governance.users_profile.id` | 00010_enterprise_expansion_30_tables.sql:67 |
| 203 | `execution.project_risks.project_id` | → | `execution.projects.id` | 00010_enterprise_expansion_30_tables.sql:88 |
| 204 | `execution.project_risks.owner_user_id` | → | `governance.users_profile.id` | 00010_enterprise_expansion_30_tables.sql:97 |
| 205 | `execution.project_blockers.project_id` | → | `execution.projects.id` | 00010_enterprise_expansion_30_tables.sql:125 |
| 206 | `execution.project_blockers.owner_user_id` | → | `governance.users_profile.id` | 00010_enterprise_expansion_30_tables.sql:131 |
| 207 | `execution.project_blockers.linked_alert_id` | → | `execution.alerts.id` | 00010_enterprise_expansion_30_tables.sql:136 |
| 208 | `execution.project_blockers.linked_risk_id` | → | `execution.project_risks.id` | 00010_enterprise_expansion_30_tables.sql:137 |
| 209 | `execution.task_comments.task_id` | → | `execution.tasks.id` | 00010_enterprise_expansion_30_tables.sql:159 |
| 210 | `execution.task_comments.author_user_id` | → | `governance.users_profile.id` | 00010_enterprise_expansion_30_tables.sql:163 |
| 211 | `execution.task_attachments.task_id` | → | `execution.tasks.id` | 00010_enterprise_expansion_30_tables.sql:181 |
| 212 | `execution.task_attachments.document_id` | → | `docs.documents.id` | 00010_enterprise_expansion_30_tables.sql:182 |
| 213 | `execution.task_attachments.attached_by_user_id` | → | `governance.users_profile.id` | 00010_enterprise_expansion_30_tables.sql:184 |
| 214 | `governance.webhook_endpoints.created_by` | → | `governance.users_profile.id` | 00010_enterprise_expansion_30_tables.sql:211 |
| 215 | `governance.webhook_deliveries.webhook_endpoint_id` | → | `governance.webhook_endpoints.id` | 00010_enterprise_expansion_30_tables.sql:225 |
| 216 | `governance.webhook_deliveries.domain_event_id` | → | `governance.domain_events.id` | 00010_enterprise_expansion_30_tables.sql:226 |
| 217 | `governance.integration_connections.created_by` | → | `governance.users_profile.id` | 00010_enterprise_expansion_30_tables.sql:267 |
| 218 | `governance.integration_sync_logs.integration_connection_id` | → | `governance.integration_connections.id` | 00010_enterprise_expansion_30_tables.sql:281 |
| 219 | `governance.feature_flag_targets.feature_flag_id` | → | `governance.feature_flags.id` | 00010_enterprise_expansion_30_tables.sql:306 |
| 220 | `governance.user_preferences.user_id` | → | `governance.users_profile.id` | 00010_enterprise_expansion_30_tables.sql:326 |
| 221 | `governance.saved_filters.user_id` | → | `governance.users_profile.id` | 00010_enterprise_expansion_30_tables.sql:350 |
| 222 | `analytics.dashboard_widgets.dashboard_definition_id` | → | `analytics.dashboard_definitions.id` | 00010_enterprise_expansion_30_tables.sql:393 |
| 223 | `procurement.rfq_comparison_snapshots.rfq_id` | → | `procurement.rfqs.id` | 00010_enterprise_expansion_30_tables.sql:442 |
| 224 | `procurement.rfq_comparison_snapshots.selected_supplier_id` | → | `procurement.suppliers.id` | 00010_enterprise_expansion_30_tables.sql:445 |
| 225 | `procurement.rfq_comparison_snapshots.created_by` | → | `governance.users_profile.id` | 00010_enterprise_expansion_30_tables.sql:448 |
| 226 | `finance.reconciliation_exceptions.bank_file_id` | → | `finance.bank_files.id` | 00010_enterprise_expansion_30_tables.sql:463 |
| 227 | `finance.reconciliation_exceptions.payment_id` | → | `finance.payments.id` | 00010_enterprise_expansion_30_tables.sql:464 |
| 228 | `finance.reconciliation_exceptions.owner_user_id` | → | `governance.users_profile.id` | 00010_enterprise_expansion_30_tables.sql:471 |
| 229 | `finance.payment_allocations.payment_id` | → | `finance.payments.id` | 00010_enterprise_expansion_30_tables.sql:490 |
| 230 | `finance.payment_allocations.invoice_id` | → | `finance.invoices.id` | 00010_enterprise_expansion_30_tables.sql:491 |
| 231 | `finance.payment_allocations.allocated_by_user_id` | → | `governance.users_profile.id` | 00010_enterprise_expansion_30_tables.sql:494 |
| 232 | `workforce.payroll_export_batches.payroll_run_id` | → | `workforce.payroll_runs.id` | 00010_enterprise_expansion_30_tables.sql:510 |
| 233 | `workforce.payroll_export_batches.exported_by_user_id` | → | `governance.users_profile.id` | 00010_enterprise_expansion_30_tables.sql:516 |
| 234 | `workforce.payroll_exceptions.payroll_run_id` | → | `workforce.payroll_runs.id` | 00010_enterprise_expansion_30_tables.sql:532 |
| 235 | `workforce.payroll_exceptions.employee_id` | → | `workforce.employees.id` | 00010_enterprise_expansion_30_tables.sql:533 |
| 236 | `workforce.payroll_exceptions.owner_user_id` | → | `governance.users_profile.id` | 00010_enterprise_expansion_30_tables.sql:540 |
| 237 | `docs.document_signature_requests.document_id` | → | `docs.documents.id` | 00010_enterprise_expansion_30_tables.sql:562 |
| 238 | `docs.document_signature_requests.created_by_user_id` | → | `governance.users_profile.id` | 00010_enterprise_expansion_30_tables.sql:573 |
| 239 | `docs.document_versions.document_id` | → | `docs.documents.id` | 00010_enterprise_expansion_30_tables.sql:591 |
| 240 | `docs.document_versions.uploaded_by_user_id` | → | `governance.users_profile.id` | 00010_enterprise_expansion_30_tables.sql:595 |
| 241 | `comms.portal_sessions.portal_user_id` | → | `comms.portal_users.id` | 00010_enterprise_expansion_30_tables.sql:610 |
| 242 | `governance.alert_subscriptions.user_id` | → | `governance.users_profile.id` | 00010_enterprise_expansion_30_tables.sql:656 |
| 243 | `governance.sla_timers.owner_user_id` | → | `governance.users_profile.id` | 00010_enterprise_expansion_30_tables.sql:688 |
| 244 | `governance.job_executions.queue_job_id` | → | `governance.queue_jobs.id` | 00010_enterprise_expansion_30_tables.sql:709 |
| 245 | `governance.audit_log_attachments.audit_log_id` | → | `governance.audit_logs.id` | 00010_enterprise_expansion_30_tables.sql:729 |
| 246 | `governance.audit_log_attachments.document_id` | → | `docs.documents.id` | 00010_enterprise_expansion_30_tables.sql:730 |
| 247 | `governance.audit_log_attachments.attached_by_user_id` | → | `governance.users_profile.id` | 00010_enterprise_expansion_30_tables.sql:732 |
| 248 | `intelligence.anomaly_feedback.anomaly_case_id` | → | `intelligence.anomaly_cases.id` | 00010_enterprise_expansion_30_tables.sql:745 |
| 249 | `intelligence.anomaly_feedback.provided_by_user_id` | → | `governance.users_profile.id` | 00010_enterprise_expansion_30_tables.sql:749 |
| 250 | `commercial.lead_tag_assignments.lead_id` | → | `commercial.leads.id` | 00011_enterprise_expansion_30_more_tables.sql:32 |
| 251 | `commercial.lead_tag_assignments.tag_id` | → | `commercial.lead_tags.id` | 00011_enterprise_expansion_30_more_tables.sql:33 |
| 252 | `commercial.lead_tag_assignments.assigned_by` | → | `governance.users_profile.id` | 00011_enterprise_expansion_30_more_tables.sql:35 |
| 253 | `commercial.quote_revisions.quote_id` | → | `commercial.quotes.id` | 00011_enterprise_expansion_30_more_tables.sql:49 |
| 254 | `commercial.quote_revisions.created_by` | → | `governance.users_profile.id` | 00011_enterprise_expansion_30_more_tables.sql:53 |
| 255 | `procurement.approval_steps.approval_id` | → | `procurement.approvals.id` | 00011_enterprise_expansion_30_more_tables.sql:90 |
| 256 | `procurement.approval_steps.assigned_approver_user_id` | → | `governance.users_profile.id` | 00011_enterprise_expansion_30_more_tables.sql:93 |
| 257 | `procurement.supplier_scorecards.supplier_id` | → | `procurement.suppliers.id` | 00011_enterprise_expansion_30_more_tables.sql:117 |
| 258 | `procurement.contract_milestones.contract_id` | → | `procurement.contracts.id` | 00011_enterprise_expansion_30_more_tables.sql:139 |
| 259 | `inventory.material_lots.material_id` | → | `inventory.materials.id` | 00011_enterprise_expansion_30_more_tables.sql:163 |
| 260 | `inventory.material_lots.warehouse_id` | → | `inventory.warehouses.id` | 00011_enterprise_expansion_30_more_tables.sql:164 |
| 261 | `inventory.inventory_movements.material_id` | → | `inventory.materials.id` | 00011_enterprise_expansion_30_more_tables.sql:191 |
| 262 | `inventory.inventory_movements.warehouse_id` | → | `inventory.warehouses.id` | 00011_enterprise_expansion_30_more_tables.sql:192 |
| 263 | `inventory.inventory_movements.lot_id` | → | `inventory.material_lots.id` | 00011_enterprise_expansion_30_more_tables.sql:193 |
| 264 | `inventory.inventory_movements.moved_by_user_id` | → | `governance.users_profile.id` | 00011_enterprise_expansion_30_more_tables.sql:200 |
| 265 | `inventory.reorder_rules.material_id` | → | `inventory.materials.id` | 00011_enterprise_expansion_30_more_tables.sql:215 |
| 266 | `inventory.reorder_rules.preferred_supplier_id` | → | `procurement.suppliers.id` | 00011_enterprise_expansion_30_more_tables.sql:219 |
| 267 | `inventory.shortage_snapshots.material_id` | → | `inventory.materials.id` | 00011_enterprise_expansion_30_more_tables.sql:237 |
| 268 | `inventory.shortage_snapshots.warehouse_id` | → | `inventory.warehouses.id` | 00011_enterprise_expansion_30_more_tables.sql:238 |
| 269 | `execution.project_cost_plans.project_id` | → | `execution.projects.id` | 00011_enterprise_expansion_30_more_tables.sql:256 |
| 270 | `execution.work_order_qa_checklists.work_order_id` | → | `execution.work_orders.id` | 00011_enterprise_expansion_30_more_tables.sql:280 |
| 271 | `execution.work_order_qa_checklists.completed_by_user_id` | → | `governance.users_profile.id` | 00011_enterprise_expansion_30_more_tables.sql:285 |
| 272 | `execution.work_order_qa_items.checklist_id` | → | `execution.work_order_qa_checklists.id` | 00011_enterprise_expansion_30_more_tables.sql:301 |
| 273 | `execution.work_order_qa_items.checked_by_user_id` | → | `governance.users_profile.id` | 00011_enterprise_expansion_30_more_tables.sql:307 |
| 274 | `finance.dunning_steps.dunning_campaign_id` | → | `finance.dunning_campaigns.id` | 00011_enterprise_expansion_30_more_tables.sql:343 |
| 275 | `finance.collection_actions.collection_case_id` | → | `finance.collection_cases.id` | 00011_enterprise_expansion_30_more_tables.sql:365 |
| 276 | `finance.collection_actions.performed_by_user_id` | → | `governance.users_profile.id` | 00011_enterprise_expansion_30_more_tables.sql:368 |
| 277 | `finance.reminder_schedules.customer_id` | → | `commercial.customers.id` | 00011_enterprise_expansion_30_more_tables.sql:384 |
| 278 | `finance.reminder_schedules.invoice_id` | → | `finance.invoices.id` | 00011_enterprise_expansion_30_more_tables.sql:385 |
| 279 | `workforce.employee_pay_components.employee_id` | → | `workforce.employees.id` | 00011_enterprise_expansion_30_more_tables.sql:431 |
| 280 | `workforce.employee_pay_components.pay_component_id` | → | `workforce.pay_components.id` | 00011_enterprise_expansion_30_more_tables.sql:432 |
| 281 | `workforce.leave_requests.employee_id` | → | `workforce.employees.id` | 00011_enterprise_expansion_30_more_tables.sql:477 |
| 282 | `workforce.leave_requests.leave_type_id` | → | `workforce.leave_types.id` | 00011_enterprise_expansion_30_more_tables.sql:478 |
| 283 | `workforce.leave_requests.approved_by_user_id` | → | `governance.users_profile.id` | 00011_enterprise_expansion_30_more_tables.sql:483 |
| 284 | `intelligence.model_executions.model_registry_id` | → | `intelligence.model_registry.id` | 00011_enterprise_expansion_30_more_tables.sql:526 |
| 285 | `intelligence.recommendation_feedback.recommendation_id` | → | `intelligence.decision_recommendations.id` | 00011_enterprise_expansion_30_more_tables.sql:548 |
| 286 | `intelligence.recommendation_feedback.provided_by_user_id` | → | `governance.users_profile.id` | 00011_enterprise_expansion_30_more_tables.sql:551 |
| 287 | `governance.command_logs.actor_user_id` | → | `governance.users_profile.id` | 00011_enterprise_expansion_30_more_tables.sql:589 |
| 288 | `governance.security_events.user_profile_id` | → | `governance.users_profile.id` | 00011_enterprise_expansion_30_more_tables.sql:615 |
| 289 | `governance.security_events.portal_user_id` | → | `comms.portal_users.id` | 00011_enterprise_expansion_30_more_tables.sql:616 |
| 290 | `comms.notification_deliveries.notification_id` | → | `comms.notifications.id` | 00011_enterprise_expansion_30_more_tables.sql:636 |
| 291 | `comms.support_sla_tracking.support_ticket_id` | → | `comms.support_tickets.id` | 00011_enterprise_expansion_30_more_tables.sql:661 |
| 292 | `public.app_menu.parent_id` | → | `public.app_menu.id` | 00017_app_menu.sql:11 |
| 293 | `analytics.dashboard_board_widgets.board_id` | → | `analytics.dashboard_boards.id` | 00021_dashboard_tables.sql:30 |
| 294 | `analytics.dashboard_board_widgets.widget_id` | → | `analytics.dashboard_widgets.id` | 00021_dashboard_tables.sql:31 |
| 295 | `analytics.user_dashboard_boards.user_id` | → | `governance.users_profile.id` | 00021_dashboard_tables.sql:45 |
| 296 | `analytics.user_dashboard_boards.board_id` | → | `analytics.dashboard_boards.id` | 00021_dashboard_tables.sql:46 |
| 297 | `intelligence.agent_jobs.agent_id` | → | `intelligence.agent_registry.id` | 00023_ai_agent_registry_and_views.sql:21 |
| 298 | `orchestration.workflow_steps.workflow_definition_id` | → | `orchestration.workflow_definitions.id` | 00024_orchestration_tables.sql:24 |
| 299 | `orchestration.workflow_runs.workflow_definition_id` | → | `orchestration.workflow_definitions.id` | 00024_orchestration_tables.sql:40 |
| 300 | `orchestration.workflow_runs.triggered_by_user_id` | → | `governance.users_profile.id` | 00024_orchestration_tables.sql:46 |
| 301 | `orchestration.workflow_step_runs.workflow_run_id` | → | `orchestration.workflow_runs.id` | 00024_orchestration_tables.sql:56 |
| 302 | `orchestration.workflow_step_runs.workflow_step_id` | → | `orchestration.workflow_steps.id` | 00024_orchestration_tables.sql:57 |
| 303 | `orchestration.job_queue.workflow_run_id` | → | `orchestration.workflow_runs.id` | 00024_orchestration_tables.sql:79 |
| 304 | `orchestration.universal_inbox.assigned_to_user_id` | → | `governance.users_profile.id` | 00024_orchestration_tables.sql:102 |
| 305 | `crm.leads.owner_user_id` | → | `governance.users_profile.id` | 00027_enterprise_30_tables.sql:38 |
| 306 | `crm.lead_activities.lead_id` | → | `crm.leads.id` | 00027_enterprise_30_tables.sql:52 |
| 307 | `crm.lead_activities.performed_by_user_id` | → | `governance.users_profile.id` | 00027_enterprise_30_tables.sql:56 |
| 308 | `crm.opportunities.lead_id` | → | `crm.leads.id` | 00027_enterprise_30_tables.sql:73 |
| 309 | `crm.opportunities.customer_id` | → | `commercial.customers.id` | 00027_enterprise_30_tables.sql:74 |
| 310 | `crm.opportunities.owner_user_id` | → | `governance.users_profile.id` | 00027_enterprise_30_tables.sql:79 |
| 311 | `service.tickets.customer_id` | → | `commercial.customers.id` | 00027_enterprise_30_tables.sql:94 |
| 312 | `service.tickets.project_id` | → | `execution.projects.id` | 00027_enterprise_30_tables.sql:95 |
| 313 | `service.tickets.work_order_id` | → | `execution.work_orders.id` | 00027_enterprise_30_tables.sql:96 |
| 314 | `service.tickets.assigned_to_user_id` | → | `governance.users_profile.id` | 00027_enterprise_30_tables.sql:102 |
| 315 | `service.ticket_comments.ticket_id` | → | `service.tickets.id` | 00027_enterprise_30_tables.sql:117 |
| 316 | `service.ticket_comments.author_user_id` | → | `governance.users_profile.id` | 00027_enterprise_30_tables.sql:120 |
| 317 | `quality.inspection_runs.plan_id` | → | `quality.inspection_plans.id` | 00027_enterprise_30_tables.sql:150 |
| 318 | `quality.inspection_runs.project_id` | → | `execution.projects.id` | 00027_enterprise_30_tables.sql:151 |
| 319 | `quality.inspection_runs.work_order_id` | → | `execution.work_orders.id` | 00027_enterprise_30_tables.sql:152 |
| 320 | `quality.inspection_runs.inspector_user_id` | → | `governance.users_profile.id` | 00027_enterprise_30_tables.sql:154 |
| 321 | `quality.defects.inspection_run_id` | → | `quality.inspection_runs.id` | 00027_enterprise_30_tables.sql:172 |
| 322 | `quality.defects.project_id` | → | `execution.projects.id` | 00027_enterprise_30_tables.sql:173 |
| 323 | `quality.defects.work_order_id` | → | `execution.work_orders.id` | 00027_enterprise_30_tables.sql:174 |
| 324 | `quality.defects.owner_user_id` | → | `governance.users_profile.id` | 00027_enterprise_30_tables.sql:179 |
| 325 | `compliance.policy_acknowledgements.policy_id` | → | `compliance.policies.id` | 00027_enterprise_30_tables.sql:212 |
| 326 | `compliance.policy_acknowledgements.user_id` | → | `governance.users_profile.id` | 00027_enterprise_30_tables.sql:213 |
| 327 | `treasury.cash_positions.bank_account_id` | → | `treasury.bank_accounts.id` | 00027_enterprise_30_tables.sql:245 |
| 328 | `treasury.cash_forecasts.bank_account_id` | → | `treasury.bank_accounts.id` | 00027_enterprise_30_tables.sql:262 |
| 329 | `planning.capacity_slots.capacity_calendar_id` | → | `planning.capacity_calendars.id` | 00027_enterprise_30_tables.sql:296 |
| 330 | `maintenance.work_orders.asset_id` | → | `maintenance.assets.id` | 00027_enterprise_30_tables.sql:351 |
| 331 | `maintenance.work_orders.assigned_to_user_id` | → | `governance.users_profile.id` | 00027_enterprise_30_tables.sql:357 |
| 332 | `pricing.calculations.ruleset_id` | → | `pricing.rule_sets.id` | 00027_enterprise_30_tables.sql:391 |
| 333 | `routing.menu_nodes.route_registry_id` | → | `routing.route_registry.id` | 00027_enterprise_30_tables.sql:429 |
| 334 | `routing.menu_nodes.parent_node_id` | → | `routing.menu_nodes.id` | 00027_enterprise_30_tables.sql:430 |
| 335 | `routing.route_permission_map.route_registry_id` | → | `routing.route_registry.id` | 00027_enterprise_30_tables.sql:445 |
| 336 | `documents.ocr_runs.document_id` | → | `docs.documents.id` | 00027_enterprise_30_tables.sql:458 |
| 337 | `documents.classification_runs.document_id` | → | `docs.documents.id` | 00027_enterprise_30_tables.sql:478 |
| 338 | `documents.extraction_runs.document_id` | → | `docs.documents.id` | 00027_enterprise_30_tables.sql:499 |
| 339 | `documents.document_chunks.document_id` | → | `docs.documents.id` | 00027_enterprise_30_tables.sql:518 |
| 340 | `documents.entity_extractions.document_id` | → | `docs.documents.id` | 00027_enterprise_30_tables.sql:535 |
| 341 | `documents.entity_extractions.extraction_run_id` | → | `documents.extraction_runs.id` | 00027_enterprise_30_tables.sql:536 |
| 342 | `documents.document_relations.source_document_id` | → | `docs.documents.id` | 00027_enterprise_30_tables.sql:553 |
| 343 | `documents.knowledge_cards.document_id` | → | `docs.documents.id` | 00027_enterprise_30_tables.sql:569 |
| 344 | `public.user_profiles.id` | → | `auth.users.id` | 20260417000000_initial_schema.sql:9 |
| 345 | `public.inventory_items.supplier_id` | → | `public.suppliers.id` | 20260417000000_initial_schema.sql:62 |
| 346 | `public.orders.customer_id` | → | `public.customers.id` | 20260417000000_initial_schema.sql:72 |

## 4. PAGE REGISTRY

All 666 unique frontend routes (`<Route path="...">`) across every service.

| # | route | file:line |
|---|-------|-----------|
| 1 | `/` | erp-app/src/App.tsx:518 |
| 2 | `/operations-control-center` | erp-app/src/App.tsx:519 |
| 3 | `/executive/war-room` | erp-app/src/App.tsx:520 |
| 4 | `/executive/order-lifecycle` | erp-app/src/App.tsx:521 |
| 5 | `/executive/ceo-dashboard` | erp-app/src/App.tsx:522 |
| 6 | `/executive/live-ops` | erp-app/src/App.tsx:523 |
| 7 | `/executive/company-health` | erp-app/src/App.tsx:524 |
| 8 | `/executive/kpi-board` | erp-app/src/App.tsx:525 |
| 9 | `/executive/live-alerts` | erp-app/src/App.tsx:526 |
| 10 | `/executive/financial-risk` | erp-app/src/App.tsx:527 |
| 11 | `/executive/operational-bottlenecks` | erp-app/src/App.tsx:528 |
| 12 | `/executive/delayed-projects` | erp-app/src/App.tsx:529 |
| 13 | `/executive/procurement-risk` | erp-app/src/App.tsx:530 |
| 14 | `/executive/production-efficiency` | erp-app/src/App.tsx:531 |
| 15 | `/executive/profitability` | erp-app/src/App.tsx:532 |
| 16 | `/executive/workforce-status` | erp-app/src/App.tsx:533 |
| 17 | `/system/model-catalog` | erp-app/src/App.tsx:534 |
| 18 | `/customers` | erp-app/src/App.tsx:535 |
| 19 | `/products` | erp-app/src/App.tsx:536 |
| 20 | `/projects` | erp-app/src/App.tsx:537 |
| 21 | `/invoices` | erp-app/src/App.tsx:538 |
| 22 | `/sales-orders` | erp-app/src/App.tsx:539 |
| 23 | `/employees` | erp-app/src/App.tsx:540 |
| 24 | `/work-orders` | erp-app/src/App.tsx:541 |
| 25 | `/payroll` | erp-app/src/App.tsx:542 |
| 26 | `/attendance` | erp-app/src/App.tsx:543 |
| 27 | `/manufacturing` | erp-app/src/App.tsx:544 |
| 28 | `/manufacturing/:rest*` | erp-app/src/App.tsx:545 |
| 29 | `/field-measurements` | erp-app/src/App.tsx:546 |
| 30 | `/accounting` | erp-app/src/App.tsx:547 |
| 31 | `/blackrock` | erp-app/src/App.tsx:548 |
| 32 | `/kimi` | erp-app/src/App.tsx:549 |
| 33 | `/kimi2` | erp-app/src/App.tsx:550 |
| 34 | `/platform` | erp-app/src/App.tsx:551 |
| 35 | `/builder` | erp-app/src/App.tsx:552 |
| 36 | `/builder/modules` | erp-app/src/App.tsx:553 |
| 37 | `/builder/module/:id/versions` | erp-app/src/App.tsx:554 |
| 38 | `/builder/module/:id` | erp-app/src/App.tsx:555 |
| 39 | `/builder/entity/:id` | erp-app/src/App.tsx:556 |
| 40 | `/builder/data/:entityId` | erp-app/src/App.tsx:557 |
| 41 | `/module/:entityId` | erp-app/src/App.tsx:558 |
| 42 | `/builder/entities` | erp-app/src/App.tsx:559 |
| 43 | `/builder/fields` | erp-app/src/App.tsx:560 |
| 44 | `/builder/relations` | erp-app/src/App.tsx:561 |
| 45 | `/builder/forms` | erp-app/src/App.tsx:562 |
| 46 | `/builder/views` | erp-app/src/App.tsx:563 |
| 47 | `/builder/details` | erp-app/src/App.tsx:564 |
| 48 | `/builder/categories` | erp-app/src/App.tsx:565 |
| 49 | `/builder/statuses` | erp-app/src/App.tsx:566 |
| 50 | `/builder/buttons` | erp-app/src/App.tsx:567 |
| 51 | `/builder/actions` | erp-app/src/App.tsx:568 |
| 52 | `/builder/validations` | erp-app/src/App.tsx:569 |
| 53 | `/builder/permissions` | erp-app/src/App.tsx:570 |
| 54 | `/builder/menus` | erp-app/src/App.tsx:571 |
| 55 | `/builder/dashboards` | erp-app/src/App.tsx:572 |
| 56 | `/builder/widgets` | erp-app/src/App.tsx:573 |
| 57 | `/builder/workflows` | erp-app/src/App.tsx:574 |
| 58 | `/builder/automations` | erp-app/src/App.tsx:575 |
| 59 | `/builder/automation-dashboard` | erp-app/src/App.tsx:576 |
| 60 | `/platform/data-flow-automations` | erp-app/src/App.tsx:577 |
| 61 | `/builder/templates` | erp-app/src/App.tsx:578 |
| 62 | `/builder/tools` | erp-app/src/App.tsx:579 |
| 63 | `/builder/contexts` | erp-app/src/App.tsx:580 |
| 64 | `/builder/publish` | erp-app/src/App.tsx:581 |
| 65 | `/menu-builder` | erp-app/src/App.tsx:582 |
| 66 | `/audit-log` | erp-app/src/App.tsx:583 |
| 67 | `/report-builder` | erp-app/src/App.tsx:584 |
| 68 | `/document-builder` | erp-app/src/App.tsx:585 |
| 69 | `/integration-builder` | erp-app/src/App.tsx:586 |
| 70 | `/integrations-hub` | erp-app/src/App.tsx:587 |
| 71 | `/integrations-hub/:slug` | erp-app/src/App.tsx:588 |
| 72 | `/ai-builder` | erp-app/src/App.tsx:589 |
| 73 | `/inventory` | erp-app/src/App.tsx:590 |
| 74 | `/production` | erp-app/src/App.tsx:591 |
| 75 | `/suppliers` | erp-app/src/App.tsx:592 |
| 76 | `/suppliers/:id` | erp-app/src/App.tsx:593 |
| 77 | `/procurement-dashboard` | erp-app/src/App.tsx:594 |
| 78 | `/import-dashboard` | erp-app/src/App.tsx:595 |
| 79 | `/purchase-orders` | erp-app/src/App.tsx:596 |
| 80 | `/goods-receipt` | erp-app/src/App.tsx:597 |
| 81 | `/purchase-requests` | erp-app/src/App.tsx:598 |
| 82 | `/purchase-approvals` | erp-app/src/App.tsx:599 |
| 83 | `/price-quotes` | erp-app/src/App.tsx:600 |
| 84 | `/price-comparison` | erp-app/src/App.tsx:601 |
| 85 | `/inventory-management` | erp-app/src/App.tsx:602 |
| 86 | `/raw-materials` | erp-app/src/App.tsx:603 |
| 87 | `/finance/cost-centers` | erp-app/src/App.tsx:604 |
| 88 | `/finance/invoices` | erp-app/src/App.tsx:605 |
| 89 | `/finance/receipts` | erp-app/src/App.tsx:606 |
| 90 | `/finance/credit-notes` | erp-app/src/App.tsx:607 |
| 91 | `/finance/customers/invoices` | erp-app/src/App.tsx:608 |
| 92 | `/finance/customers/refunds` | erp-app/src/App.tsx:609 |
| 93 | `/finance/customers/payments` | erp-app/src/App.tsx:610 |
| 94 | `/finance/customers/products` | erp-app/src/App.tsx:611 |
| 95 | `/finance/suppliers/invoices` | erp-app/src/App.tsx:612 |
| 96 | `/finance/suppliers/credit-notes` | erp-app/src/App.tsx:613 |
| 97 | `/finance/suppliers/payments` | erp-app/src/App.tsx:614 |
| 98 | `/finance/suppliers/products` | erp-app/src/App.tsx:615 |
| 99 | `/finance/aging-report` | erp-app/src/App.tsx:616 |
| 100 | `/finance/chart-of-accounts` | erp-app/src/App.tsx:617 |
| 101 | `/finance/petty-cash` | erp-app/src/App.tsx:618 |
| 102 | `/finance/expense-claims` | erp-app/src/App.tsx:619 |
| 103 | `/finance/payment-runs` | erp-app/src/App.tsx:620 |
| 104 | `/finance/withholding-tax` | erp-app/src/App.tsx:621 |
| 105 | `/finance/general-ledger` | erp-app/src/App.tsx:622 |
| 106 | `/finance/expense-reports` | erp-app/src/App.tsx:623 |
| 107 | `/finance/fixed-assets` | erp-app/src/App.tsx:624 |
| 108 | `/finance/financial-reports` | erp-app/src/App.tsx:625 |
| 109 | `/finance/profit-loss` | erp-app/src/App.tsx:626 |
| 110 | `/finance/control-center` | erp-app/src/App.tsx:627 |
| 111 | `/finance/payment-terms` | erp-app/src/App.tsx:628 |
| 112 | `/finance/debit-notes` | erp-app/src/App.tsx:629 |
| 113 | `/finance/revenue-tracking` | erp-app/src/App.tsx:630 |
| 114 | `/finance/expense-breakdown` | erp-app/src/App.tsx:631 |
| 115 | `/finance/project-profitability` | erp-app/src/App.tsx:632 |
| 116 | `/finance/customer-profitability` | erp-app/src/App.tsx:633 |
| 117 | `/finance/supplier-cost-analysis` | erp-app/src/App.tsx:634 |
| 118 | `/finance/management-reporting` | erp-app/src/App.tsx:635 |
| 119 | `/finance/budget-vs-actual` | erp-app/src/App.tsx:636 |
| 120 | `/finance/payment-reminders` | erp-app/src/App.tsx:637 |
| 121 | `/finance/budget-departments` | erp-app/src/App.tsx:638 |
| 122 | `/finance/customer-vendor-ledger` | erp-app/src/App.tsx:639 |
| 123 | `/finance/customer-aging` | erp-app/src/App.tsx:640 |
| 124 | `/finance/vendor-aging` | erp-app/src/App.tsx:641 |
| 125 | `/finance/vat-report` | erp-app/src/App.tsx:642 |
| 126 | `/finance/fiscal-report` | erp-app/src/App.tsx:643 |
| 127 | `/finance/invoice-analysis` | erp-app/src/App.tsx:644 |
| 128 | `/finance/analytics` | erp-app/src/App.tsx:645 |
| 129 | `/finance/executive-summary` | erp-app/src/App.tsx:646 |
| 130 | `/production/dashboard` | erp-app/src/App.tsx:647 |
| 131 | `/production/mes` | erp-app/src/App.tsx:648 |
| 132 | `/production/scada` | erp-app/src/App.tsx:649 |
| 133 | `/production/kanban` | erp-app/src/App.tsx:650 |
| 134 | `/production/gantt` | erp-app/src/App.tsx:651 |
| 135 | `/production/quality-control` | erp-app/src/App.tsx:652 |
| 136 | `/production/work-orders` | erp-app/src/App.tsx:653 |
| 137 | `/production/maintenance` | erp-app/src/App.tsx:654 |
| 138 | `/assets` | erp-app/src/App.tsx:655 |
| 139 | `/document-control` | erp-app/src/App.tsx:656 |
| 140 | `/documents` | erp-app/src/App.tsx:657 |
| 141 | `/documents/upload` | erp-app/src/App.tsx:658 |
| 142 | `/documents/digital-archive` | erp-app/src/App.tsx:659 |
| 143 | `/documents/digital-signatures` | erp-app/src/App.tsx:660 |
| 144 | `/documents/quality-docs` | erp-app/src/App.tsx:661 |
| 145 | `/documents/checklists` | erp-app/src/App.tsx:662 |
| 146 | `/documents/system-spec` | erp-app/src/App.tsx:663 |
| 147 | `/documents/archive-files` | erp-app/src/App.tsx:664 |
| 148 | `/documents/company-report` | erp-app/src/App.tsx:665 |
| 149 | `/documents/templates` | erp-app/src/App.tsx:666 |
| 150 | `/safety` | erp-app/src/App.tsx:667 |
| 151 | `/safety/procedures` | erp-app/src/App.tsx:668 |
| 152 | `/safety/accident-reports` | erp-app/src/App.tsx:669 |
| 153 | `/safety/training` | erp-app/src/App.tsx:670 |
| 154 | `/production/quality-checklists` | erp-app/src/App.tsx:671 |
| 155 | `/production/corrective-actions` | erp-app/src/App.tsx:672 |
| 156 | `/production/product-design` | erp-app/src/App.tsx:673 |
| 157 | `/production/product-testing` | erp-app/src/App.tsx:674 |
| 158 | `/production/prototypes` | erp-app/src/App.tsx:675 |
| 159 | `/production/output-report` | erp-app/src/App.tsx:676 |
| 160 | `/production/efficiency-report` | erp-app/src/App.tsx:677 |
| 161 | `/production/waste-report` | erp-app/src/App.tsx:678 |
| 162 | `/production/cost-report` | erp-app/src/App.tsx:679 |
| 163 | `/production/bom-manager` | erp-app/src/App.tsx:680 |
| 164 | `/production/work-orders-mgmt` | erp-app/src/App.tsx:681 |
| 165 | `/production/planning` | erp-app/src/App.tsx:682 |
| 166 | `/production/qc-inspections` | erp-app/src/App.tsx:683 |
| 167 | `/production/machine-maintenance` | erp-app/src/App.tsx:684 |
| 168 | `/production/cmms` | erp-app/src/App.tsx:685 |
| 169 | `/production/reports` | erp-app/src/App.tsx:686 |
| 170 | `/product-dev/roadmap` | erp-app/src/App.tsx:687 |
| 171 | `/product-dev/rd-projects` | erp-app/src/App.tsx:688 |
| 172 | `/product-dev/feature-requests` | erp-app/src/App.tsx:689 |
| 173 | `/product-dev/qa-testing` | erp-app/src/App.tsx:690 |
| 174 | `/supplier-evaluations` | erp-app/src/App.tsx:691 |
| 175 | `/purchase-returns` | erp-app/src/App.tsx:692 |
| 176 | `/supplier-contracts` | erp-app/src/App.tsx:693 |
| 177 | `/budget-tracking` | erp-app/src/App.tsx:694 |
| 178 | `/finance/budgets` | erp-app/src/App.tsx:695 |
| 179 | `/import-orders` | erp-app/src/App.tsx:696 |
| 180 | `/customs-clearance` | erp-app/src/App.tsx:697 |
| 181 | `/shipment-tracking` | erp-app/src/App.tsx:698 |
| 182 | `/foreign-suppliers` | erp-app/src/App.tsx:699 |
| 183 | `/letters-of-credit` | erp-app/src/App.tsx:700 |
| 184 | `/import-cost-calculator` | erp-app/src/App.tsx:701 |
| 185 | `/compliance-certificates` | erp-app/src/App.tsx:702 |
| 186 | `/exchange-rates` | erp-app/src/App.tsx:703 |
| 187 | `/procurement-ai` | erp-app/src/App.tsx:704 |
| 188 | `/procurement/profitability` | erp-app/src/App.tsx:705 |
| 189 | `/procurement/competitors` | erp-app/src/App.tsx:706 |
| 190 | `/procurement/risk-hedging` | erp-app/src/App.tsx:707 |
| 191 | `/project-analyses` | erp-app/src/App.tsx:708 |
| 192 | `/project-analysis/:id` | erp-app/src/App.tsx:709 |
| 193 | `/claude-chat` | erp-app/src/App.tsx:710 |
| 194 | `/hi-tech-dashboard` | erp-app/src/App.tsx:711 |
| 195 | `/ai-settings` | erp-app/src/App.tsx:712 |
| 196 | `/chat` | erp-app/src/App.tsx:713 |
| 197 | `/permissions` | erp-app/src/App.tsx:714 |
| 198 | `/governance` | erp-app/src/App.tsx:715 |
| 199 | `/finance` | erp-app/src/App.tsx:716 |
| 200 | `/finance/balance-sheet` | erp-app/src/App.tsx:717 |
| 201 | `/finance/projects` | erp-app/src/App.tsx:718 |
| 202 | `/finance/income` | erp-app/src/App.tsx:719 |
| 203 | `/finance/expenses` | erp-app/src/App.tsx:720 |
| 204 | `/finance/expense-items` | erp-app/src/App.tsx:721 |
| 205 | `/finance/expense-upload` | erp-app/src/App.tsx:722 |
| 206 | `/finance/expense-filing` | erp-app/src/App.tsx:723 |
| 207 | `/finance/expense-files` | erp-app/src/App.tsx:724 |
| 208 | `/finance/blackrock-2026` | erp-app/src/App.tsx:725 |
| 209 | `/finance/blackrock-monte-carlo` | erp-app/src/App.tsx:726 |
| 210 | `/finance/blackrock-var` | erp-app/src/App.tsx:727 |
| 211 | `/finance/blackrock-risk-matrix` | erp-app/src/App.tsx:728 |
| 212 | `/finance/blackrock-hedging` | erp-app/src/App.tsx:729 |
| 213 | `/finance/blackrock-ai` | erp-app/src/App.tsx:730 |
| 214 | `/finance/payment-anomalies` | erp-app/src/App.tsx:731 |
| 215 | `/finance/credit-card-processing` | erp-app/src/App.tsx:732 |
| 216 | `/finance/accounting-portal` | erp-app/src/App.tsx:733 |
| 217 | `/finance/reports` | erp-app/src/App.tsx:734 |
| 218 | `/finance/income-expenses-report` | erp-app/src/App.tsx:735 |
| 219 | `/finance/accounting-reports` | erp-app/src/App.tsx:736 |
| 220 | `/finance/debtors-balances` | erp-app/src/App.tsx:737 |
| 221 | `/finance/operational-profit` | erp-app/src/App.tsx:738 |
| 222 | `/finance/accounting-settings` | erp-app/src/App.tsx:739 |
| 223 | `/finance/settings` | erp-app/src/App.tsx:740 |
| 224 | `/finance/standing-orders` | erp-app/src/App.tsx:741 |
| 225 | `/finance/journal` | erp-app/src/App.tsx:742 |
| 226 | `/finance/journal-entries` | erp-app/src/App.tsx:743 |
| 227 | `/finance/bank-reconciliation` | erp-app/src/App.tsx:744 |
| 228 | `/finance/cash-flow` | erp-app/src/App.tsx:745 |
| 229 | `/finance/tax-management` | erp-app/src/App.tsx:746 |
| 230 | `/finance/journal-transactions` | erp-app/src/App.tsx:747 |
| 231 | `/finance/journal-report` | erp-app/src/App.tsx:748 |
| 232 | `/finance/audit-control` | erp-app/src/App.tsx:749 |
| 233 | `/finance/working-files` | erp-app/src/App.tsx:750 |
| 234 | `/finance/annual-report` | erp-app/src/App.tsx:751 |
| 235 | `/finance/accounting-inventory` | erp-app/src/App.tsx:752 |
| 236 | `/inventory/expiry-alerts` | erp-app/src/App.tsx:753 |
| 237 | `/finance/depreciation-schedule` | erp-app/src/App.tsx:754 |
| 238 | `/finance/loan-analysis` | erp-app/src/App.tsx:755 |
| 239 | `/finance/adjusting-entries` | erp-app/src/App.tsx:756 |
| 240 | `/finance/deferred-revenue` | erp-app/src/App.tsx:757 |
| 241 | `/finance/deferred-expenses` | erp-app/src/App.tsx:758 |
| 242 | `/finance/registrations` | erp-app/src/App.tsx:759 |
| 243 | `/finance/change-tracking` | erp-app/src/App.tsx:760 |
| 244 | `/finance/revenue-recognition` | erp-app/src/App.tsx:761 |
| 245 | `/finance/intercompany` | erp-app/src/App.tsx:762 |
| 246 | `/production/engineering-change` | erp-app/src/App.tsx:763 |
| 247 | `/settings/sla-management` | erp-app/src/App.tsx:764 |
| 248 | `/support/warranty-management` | erp-app/src/App.tsx:765 |
| 249 | `/settings/multi-site` | erp-app/src/App.tsx:766 |
| 250 | `/ai-engine/knowledge-graph` | erp-app/src/App.tsx:767 |
| 251 | `/ai-engine/digital-twin` | erp-app/src/App.tsx:768 |
| 252 | `/ai-engine/agent-orchestration` | erp-app/src/App.tsx:769 |
| 253 | `/production/cpq-configurator` | erp-app/src/App.tsx:770 |
| 254 | `/finance/three-way-match` | erp-app/src/App.tsx:771 |
| 255 | `/production/dispatch-planning` | erp-app/src/App.tsx:772 |
| 256 | `/projects/variation-orders` | erp-app/src/App.tsx:773 |
| 257 | `/settings/feature-flags` | erp-app/src/App.tsx:774 |
| 258 | `/settings/import-staging` | erp-app/src/App.tsx:775 |
| 259 | `/settings/duplicate-resolution` | erp-app/src/App.tsx:776 |
| 260 | `/reports/metric-dictionary` | erp-app/src/App.tsx:777 |
| 261 | `/production/cut-nesting` | erp-app/src/App.tsx:778 |
| 262 | `/inventory/remnant-management` | erp-app/src/App.tsx:779 |
| 263 | `/ai-engine/predictive-analytics` | erp-app/src/App.tsx:780 |
| 264 | `/ai-engine/optimization-lab` | erp-app/src/App.tsx:781 |
| 265 | `/ai-engine/document-intelligence` | erp-app/src/App.tsx:782 |
| 266 | `/ai-engine/process-mining` | erp-app/src/App.tsx:783 |
| 267 | `/production/supply-chain-traceability` | erp-app/src/App.tsx:784 |
| 268 | `/production/iot-sensor-hub` | erp-app/src/App.tsx:785 |
| 269 | `/production/capacity-planning` | erp-app/src/App.tsx:786 |
| 270 | `/crm/customer-experience` | erp-app/src/App.tsx:787 |
| 271 | `/crm/contract-intelligence` | erp-app/src/App.tsx:788 |
| 272 | `/executive/risk-management` | erp-app/src/App.tsx:789 |
| 273 | `/reports/esg-sustainability` | erp-app/src/App.tsx:790 |
| 274 | `/settings/realtime-collaboration` | erp-app/src/App.tsx:791 |
| 275 | `/settings/intelligent-notifications` | erp-app/src/App.tsx:792 |
| 276 | `/hr/performance-okr` | erp-app/src/App.tsx:793 |
| 277 | `/procurement/vmi-consignment` | erp-app/src/App.tsx:794 |
| 278 | `/production/supply-chain-workflow` | erp-app/src/App.tsx:795 |
| 279 | `/production/measurement-comparison` | erp-app/src/App.tsx:796 |
| 280 | `/finance/project-cost-calculator` | erp-app/src/App.tsx:797 |
| 281 | `/crm/agent-performance` | erp-app/src/App.tsx:798 |
| 282 | `/hr/employee-value-analysis` | erp-app/src/App.tsx:799 |
| 283 | `/installations/installation-scheduler` | erp-app/src/App.tsx:800 |
| 284 | `/hr/smart-payroll` | erp-app/src/App.tsx:801 |
| 285 | `/finance/ap-ar-control` | erp-app/src/App.tsx:802 |
| 286 | `/finance/financial-statements` | erp-app/src/App.tsx:803 |
| 287 | `/executive/daily-profit-monitor` | erp-app/src/App.tsx:804 |
| 288 | `/executive/fraud-detection` | erp-app/src/App.tsx:805 |
| 289 | `/strategy/competitor-intelligence` | erp-app/src/App.tsx:806 |
| 290 | `/crm/whatsapp-hub` | erp-app/src/App.tsx:807 |
| 291 | `/crm/call-analysis` | erp-app/src/App.tsx:808 |
| 292 | `/documents/document-templates` | erp-app/src/App.tsx:809 |
| 293 | `/hr/recruitment` | erp-app/src/App.tsx:810 |
| 294 | `/finance/cashflow-management` | erp-app/src/App.tsx:811 |
| 295 | `/marketing/social-marketing` | erp-app/src/App.tsx:813 |
| 296 | `/import/import-management` | erp-app/src/App.tsx:814 |
| 297 | `/settings/department-manager` | erp-app/src/App.tsx:815 |
| 298 | `/inventory/raw-material-catalog` | erp-app/src/App.tsx:816 |
| 299 | `/production/bom-builder` | erp-app/src/App.tsx:817 |
| 300 | `/production/scrap-tracker` | erp-app/src/App.tsx:818 |
| 301 | `/production/tool-equipment` | erp-app/src/App.tsx:819 |
| 302 | `/production/safety-incidents` | erp-app/src/App.tsx:820 |
| 303 | `/hr/shift-scheduling` | erp-app/src/App.tsx:821 |
| 304 | `/portal/customer-portal` | erp-app/src/App.tsx:822 |
| 305 | `/portal/supplier-portal-new` | erp-app/src/App.tsx:823 |
| 306 | `/mobile/field-operations` | erp-app/src/App.tsx:824 |
| 307 | `/ai-engine/ai-agents` | erp-app/src/App.tsx:825 |
| 308 | `/alerts` | erp-app/src/App.tsx:826 |
| 309 | `/analytics-engine` | erp-app/src/App.tsx:827 |
| 310 | `/inventory-legacy` | erp-app/src/App.tsx:828 |
| 311 | `/kimi-challenges` | erp-app/src/App.tsx:829 |
| 312 | `/notification-routing` | erp-app/src/App.tsx:830 |
| 313 | `/procurement-legacy` | erp-app/src/App.tsx:831 |
| 314 | `/hr` | erp-app/src/App.tsx:832 |
| 315 | `/hr/employees` | erp-app/src/App.tsx:833 |
| 316 | `/hr/employees/:id` | erp-app/src/App.tsx:834 |
| 317 | `/hr/payroll` | erp-app/src/App.tsx:835 |
| 318 | `/hr/payroll-center` | erp-app/src/App.tsx:836 |
| 319 | `/hr/employee-value` | erp-app/src/App.tsx:837 |
| 320 | `/hr/attendance` | erp-app/src/App.tsx:838 |
| 321 | `/hr/shifts` | erp-app/src/App.tsx:839 |
| 322 | `/hr/contractors` | erp-app/src/App.tsx:840 |
| 323 | `/hr/leave-management` | erp-app/src/App.tsx:841 |
| 324 | `/hr/training` | erp-app/src/App.tsx:842 |
| 325 | `/hr/performance-reviews` | erp-app/src/App.tsx:844 |
| 326 | `/hr/org-chart` | erp-app/src/App.tsx:845 |
| 327 | `/hr/benefits` | erp-app/src/App.tsx:846 |
| 328 | `/hr/departments` | erp-app/src/App.tsx:847 |
| 329 | `/hr/meetings` | erp-app/src/App.tsx:848 |
| 330 | `/hr/onboarding` | erp-app/src/App.tsx:849 |
| 331 | `/hr/policies` | erp-app/src/App.tsx:850 |
| 332 | `/hr/payslips` | erp-app/src/App.tsx:851 |
| 333 | `/hr/bonuses` | erp-app/src/App.tsx:852 |
| 334 | `/hr/employer-cost` | erp-app/src/App.tsx:853 |
| 335 | `/hr/open-positions` | erp-app/src/App.tsx:854 |
| 336 | `/hr/candidates` | erp-app/src/App.tsx:855 |
| 337 | `/hr/interviews` | erp-app/src/App.tsx:856 |
| 338 | `/hr/contractor-contracts` | erp-app/src/App.tsx:857 |
| 339 | `/hr/contractor-insurance` | erp-app/src/App.tsx:858 |
| 340 | `/hr/contractor-payments` | erp-app/src/App.tsx:859 |
| 341 | `/hr/workforce-planning` | erp-app/src/App.tsx:861 |
| 342 | `/hr/skills-matrix` | erp-app/src/App.tsx:862 |
| 343 | `/hr/goals` | erp-app/src/App.tsx:863 |
| 344 | `/hr/health-safety` | erp-app/src/App.tsx:864 |
| 345 | `/hr/expense-claims-hr` | erp-app/src/App.tsx:865 |
| 346 | `/finance/profit-centers` | erp-app/src/App.tsx:867 |
| 347 | `/finance/treasury` | erp-app/src/App.tsx:868 |
| 348 | `/finance/period-close` | erp-app/src/App.tsx:869 |
| 349 | `/finance/credit-management` | erp-app/src/App.tsx:870 |
| 350 | `/production/mrp` | erp-app/src/App.tsx:872 |
| 351 | `/production/oee` | erp-app/src/App.tsx:873 |
| 352 | `/production/batch-serial` | erp-app/src/App.tsx:874 |
| 353 | `/production/tools` | erp-app/src/App.tsx:875 |
| 354 | `/crm/ultimate` | erp-app/src/App.tsx:877 |
| 355 | `/crm/agent-control` | erp-app/src/App.tsx:878 |
| 356 | `/crm/leads-ultimate` | erp-app/src/App.tsx:879 |
| 357 | `/crm/lead/:id` | erp-app/src/App.tsx:880 |
| 358 | `/crm/territories` | erp-app/src/App.tsx:882 |
| 359 | `/crm/commissions` | erp-app/src/App.tsx:883 |
| 360 | `/crm/contracts` | erp-app/src/App.tsx:884 |
| 361 | `/crm/campaign-analytics` | erp-app/src/App.tsx:885 |
| 362 | `/procurement/vendor-evaluation` | erp-app/src/App.tsx:887 |
| 363 | `/procurement/rfq-sap` | erp-app/src/App.tsx:888 |
| 364 | `/procurement/spend-analysis` | erp-app/src/App.tsx:889 |
| 365 | `/projects/earned-value` | erp-app/src/App.tsx:891 |
| 366 | `/projects/resource-planning` | erp-app/src/App.tsx:892 |
| 367 | `/projects/risk-register-sap` | erp-app/src/App.tsx:893 |
| 368 | `/factory/digital-twin` | erp-app/src/App.tsx:895 |
| 369 | `/builder/workflow-visual` | erp-app/src/App.tsx:896 |
| 370 | `/support/tickets` | erp-app/src/App.tsx:897 |
| 371 | `/suppliers/communications` | erp-app/src/App.tsx:898 |
| 372 | `/product-catalog` | erp-app/src/App.tsx:899 |
| 373 | `/operations/media-library` | erp-app/src/App.tsx:900 |
| 374 | `/operations/data-sender` | erp-app/src/App.tsx:901 |
| 375 | `/ai/api-keys` | erp-app/src/App.tsx:902 |
| 376 | `/ai/models` | erp-app/src/App.tsx:903 |
| 377 | `/ai/providers` | erp-app/src/App.tsx:904 |
| 378 | `/ai/queries` | erp-app/src/App.tsx:905 |
| 379 | `/ai/recommendations` | erp-app/src/App.tsx:906 |
| 380 | `/ai/responses` | erp-app/src/App.tsx:907 |
| 381 | `/ai/usage-logs` | erp-app/src/App.tsx:908 |
| 382 | `/ai/prompt-templates` | erp-app/src/App.tsx:909 |
| 383 | `/sales/customers` | erp-app/src/App.tsx:910 |
| 384 | `/sales/customer-portal` | erp-app/src/App.tsx:911 |
| 385 | `/sales/orders` | erp-app/src/App.tsx:912 |
| 386 | `/sales/quotations` | erp-app/src/App.tsx:913 |
| 387 | `/sales/invoicing` | erp-app/src/App.tsx:914 |
| 388 | `/sales/pipeline` | erp-app/src/App.tsx:915 |
| 389 | `/sales/service` | erp-app/src/App.tsx:916 |
| 390 | `/ai-customer-service` | erp-app/src/App.tsx:917 |
| 391 | `/crm` | erp-app/src/App.tsx:918 |
| 392 | `/crm/field-agents` | erp-app/src/App.tsx:919 |
| 393 | `/crm/leads` | erp-app/src/App.tsx:920 |
| 394 | `/crm/pricing` | erp-app/src/App.tsx:921 |
| 395 | `/crm/collections` | erp-app/src/App.tsx:922 |
| 396 | `/crm/profitability` | erp-app/src/App.tsx:923 |
| 397 | `/crm/sla` | erp-app/src/App.tsx:924 |
| 398 | `/crm/smart-routing` | erp-app/src/App.tsx:925 |
| 399 | `/crm/automations` | erp-app/src/App.tsx:926 |
| 400 | `/crm/contractor-decision` | erp-app/src/App.tsx:927 |
| 401 | `/crm/ai/lead-scoring` | erp-app/src/App.tsx:928 |
| 402 | `/crm/ai/next-action` | erp-app/src/App.tsx:929 |
| 403 | `/crm/ai/predictive` | erp-app/src/App.tsx:930 |
| 404 | `/crm/ai/anomaly` | erp-app/src/App.tsx:931 |
| 405 | `/crm/security/audit` | erp-app/src/App.tsx:932 |
| 406 | `/crm/security/row-security` | erp-app/src/App.tsx:933 |
| 407 | `/crm/security/encryption` | erp-app/src/App.tsx:934 |
| 408 | `/crm/security/sso` | erp-app/src/App.tsx:935 |
| 409 | `/crm/realtime/feeds` | erp-app/src/App.tsx:936 |
| 410 | `/crm/realtime/notifications` | erp-app/src/App.tsx:937 |
| 411 | `/crm/realtime/triggers` | erp-app/src/App.tsx:938 |
| 412 | `/crm/realtime/sync` | erp-app/src/App.tsx:939 |
| 413 | `/crm/analytics/custom-reports` | erp-app/src/App.tsx:940 |
| 414 | `/crm/analytics/trends` | erp-app/src/App.tsx:941 |
| 415 | `/crm/analytics/cohort` | erp-app/src/App.tsx:942 |
| 416 | `/crm/analytics/filters` | erp-app/src/App.tsx:943 |
| 417 | `/crm/integrations/rest-api` | erp-app/src/App.tsx:944 |
| 418 | `/crm/integrations/mobile` | erp-app/src/App.tsx:945 |
| 419 | `/crm/integrations/cloud` | erp-app/src/App.tsx:946 |
| 420 | `/crm/integrations/webhooks` | erp-app/src/App.tsx:947 |
| 421 | `/notifications` | erp-app/src/App.tsx:948 |
| 422 | `/notification-preferences` | erp-app/src/App.tsx:949 |
| 423 | `/alert-terminal` | erp-app/src/App.tsx:950 |
| 424 | `/crm/email-sync` | erp-app/src/App.tsx:952 |
| 425 | `/crm/whatsapp-sms` | erp-app/src/App.tsx:953 |
| 426 | `/crm/ai-insights` | erp-app/src/App.tsx:954 |
| 427 | `/crm/predictive-analytics` | erp-app/src/App.tsx:955 |
| 428 | `/crm/lead-quality` | erp-app/src/App.tsx:956 |
| 429 | `/crm/realtime-feed` | erp-app/src/App.tsx:957 |
| 430 | `/crm/advanced-search` | erp-app/src/App.tsx:958 |
| 431 | `/crm/collaboration` | erp-app/src/App.tsx:959 |
| 432 | `/meetings` | erp-app/src/App.tsx:960 |
| 433 | `/calendar` | erp-app/src/App.tsx:961 |
| 434 | `/workforce-analysis` | erp-app/src/App.tsx:962 |
| 435 | `/analytics` | erp-app/src/App.tsx:963 |
| 436 | `/reports` | erp-app/src/App.tsx:964 |
| 437 | `/reports/financial` | erp-app/src/App.tsx:965 |
| 438 | `/reports/financial/customer-vendor-ledger` | erp-app/src/App.tsx:966 |
| 439 | `/reports/financial/customer-aging` | erp-app/src/App.tsx:967 |
| 440 | `/reports/financial/vendor-aging` | erp-app/src/App.tsx:968 |
| 441 | `/reports/financial/fiscal-report` | erp-app/src/App.tsx:969 |
| 442 | `/reports/financial/invoice-analysis` | erp-app/src/App.tsx:970 |
| 443 | `/reports/financial/analytics` | erp-app/src/App.tsx:971 |
| 444 | `/reports/financial/executive-summary` | erp-app/src/App.tsx:972 |
| 445 | `/reports/financial/vat-report` | erp-app/src/App.tsx:973 |
| 446 | `/reports/risks` | erp-app/src/App.tsx:974 |
| 447 | `/reports/kpis` | erp-app/src/App.tsx:975 |
| 448 | `/reports/funnel` | erp-app/src/App.tsx:976 |
| 449 | `/reports/operational` | erp-app/src/App.tsx:977 |
| 450 | `/reports/bi-dashboard` | erp-app/src/App.tsx:978 |
| 451 | `/settings` | erp-app/src/App.tsx:979 |
| 452 | `/settings/departments` | erp-app/src/App.tsx:980 |
| 453 | `/settings/roles` | erp-app/src/App.tsx:981 |
| 454 | `/settings/triggers` | erp-app/src/App.tsx:982 |
| 455 | `/settings/webhooks` | erp-app/src/App.tsx:983 |
| 456 | `/settings/import-export` | erp-app/src/App.tsx:984 |
| 457 | `/settings/backups` | erp-app/src/App.tsx:985 |
| 458 | `/projects/dashboard` | erp-app/src/App.tsx:986 |
| 459 | `/projects/tasks` | erp-app/src/App.tsx:987 |
| 460 | `/projects/milestones` | erp-app/src/App.tsx:988 |
| 461 | `/projects/subcontractors` | erp-app/src/App.tsx:989 |
| 462 | `/projects/real-estate/kiryati10` | erp-app/src/App.tsx:990 |
| 463 | `/projects/real-estate/units` | erp-app/src/App.tsx:991 |
| 464 | `/projects/real-estate/permits` | erp-app/src/App.tsx:992 |
| 465 | `/projects/real-estate/contractors` | erp-app/src/App.tsx:993 |
| 466 | `/projects/resources` | erp-app/src/App.tsx:994 |
| 467 | `/projects/budget` | erp-app/src/App.tsx:995 |
| 468 | `/projects/risks` | erp-app/src/App.tsx:996 |
| 469 | `/projects/timesheets` | erp-app/src/App.tsx:997 |
| 470 | `/strategy/goals` | erp-app/src/App.tsx:998 |
| 471 | `/strategy/swot` | erp-app/src/App.tsx:999 |
| 472 | `/strategy/planning` | erp-app/src/App.tsx:1000 |
| 473 | `/strategy/market-analysis` | erp-app/src/App.tsx:1001 |
| 474 | `/strategy/okrs` | erp-app/src/App.tsx:1002 |
| 475 | `/installations/facilities` | erp-app/src/App.tsx:1003 |
| 476 | `/installations/work` | erp-app/src/App.tsx:1004 |
| 477 | `/installations/assets` | erp-app/src/App.tsx:1005 |
| 478 | `/installations/calendar` | erp-app/src/App.tsx:1006 |
| 479 | `/strategy/balanced-scorecard` | erp-app/src/App.tsx:1007 |
| 480 | `/strategy/competitive-analysis` | erp-app/src/App.tsx:1008 |
| 481 | `/strategy/business-plan` | erp-app/src/App.tsx:1009 |
| 482 | `/portal-management` | erp-app/src/App.tsx:1010 |
| 483 | `/marketing` | erp-app/src/App.tsx:1011 |
| 484 | `/marketing/hub` | erp-app/src/App.tsx:1012 |
| 485 | `/marketing/integrations` | erp-app/src/App.tsx:1013 |
| 486 | `/marketing/analytics` | erp-app/src/App.tsx:1014 |
| 487 | `/marketing/campaigns` | erp-app/src/App.tsx:1015 |
| 488 | `/marketing/content-calendar` | erp-app/src/App.tsx:1016 |
| 489 | `/marketing/social-media` | erp-app/src/App.tsx:1017 |
| 490 | `/marketing/email-campaigns` | erp-app/src/App.tsx:1018 |
| 491 | `/marketing/budget` | erp-app/src/App.tsx:1019 |
| 492 | `/ai-engine` | erp-app/src/App.tsx:1020 |
| 493 | `/ai-engine/lead-scoring` | erp-app/src/App.tsx:1021 |
| 494 | `/ai-engine/call-nlp-analysis` | erp-app/src/App.tsx:1022 |
| 495 | `/ai-engine/call-nlp` | erp-app/src/App.tsx:1023 |
| 496 | `/ai-engine/predictive` | erp-app/src/App.tsx:1024 |
| 497 | `/ai-engine/ai-chatbot-settings` | erp-app/src/App.tsx:1025 |
| 498 | `/ai-engine/chatbot` | erp-app/src/App.tsx:1026 |
| 499 | `/ai-engine/kimi-terminal` | erp-app/src/App.tsx:1027 |
| 500 | `/procurement` | erp-app/src/App.tsx:1028 |
| 501 | `/ai-engine/kimi` | erp-app/src/App.tsx:1029 |
| 502 | `/ai-engine/kobi` | erp-app/src/App.tsx:1030 |
| 503 | `/ai-engine/kobi-ide` | erp-app/src/App.tsx:1031 |
| 504 | `/ai-engine/super-agent` | erp-app/src/App.tsx:1032 |
| 505 | `/ai-engine/transactions` | erp-app/src/App.tsx:1033 |
| 506 | `/ai-engine/super-agent-dashboard` | erp-app/src/App.tsx:1034 |
| 507 | `/kobi` | erp-app/src/App.tsx:1035 |
| 508 | `/ai-ops/sales-assistant` | erp-app/src/App.tsx:1036 |
| 509 | `/ai-ops/lead-scoring` | erp-app/src/App.tsx:1037 |
| 510 | `/ai-ops/customer-service` | erp-app/src/App.tsx:1038 |
| 511 | `/ai-ops/follow-up` | erp-app/src/App.tsx:1039 |
| 512 | `/ai-ops/quotation-assistant` | erp-app/src/App.tsx:1040 |
| 513 | `/ai-ops/procurement-optimizer` | erp-app/src/App.tsx:1041 |
| 514 | `/ai-ops/production-insights` | erp-app/src/App.tsx:1042 |
| 515 | `/ai-ops/anomaly-detection` | erp-app/src/App.tsx:1043 |
| 516 | `/ai-ops/executive-insights` | erp-app/src/App.tsx:1044 |
| 517 | `/ai-engine/kimi-challenges` | erp-app/src/App.tsx:1045 |
| 518 | `/ai-document-processor` | erp-app/src/App.tsx:1046 |
| 519 | `/finance/trial-balance` | erp-app/src/App.tsx:1047 |
| 520 | `/finance/analytical-reports` | erp-app/src/App.tsx:1048 |
| 521 | `/finance/consolidated-reports` | erp-app/src/App.tsx:1049 |
| 522 | `/finance/entity-ledger` | erp-app/src/App.tsx:1050 |
| 523 | `/finance/supplier-aging` | erp-app/src/App.tsx:1051 |
| 524 | `/pricing/price-lists-ent` | erp-app/src/App.tsx:1052 |
| 525 | `/pricing/price-lists` | erp-app/src/App.tsx:1053 |
| 526 | `/pricing/cost-calculator` | erp-app/src/App.tsx:1054 |
| 527 | `/pricing/collection-management` | erp-app/src/App.tsx:1055 |
| 528 | `/pricing/collections` | erp-app/src/App.tsx:1056 |
| 529 | `/pricing/cost-calculations` | erp-app/src/App.tsx:1057 |
| 530 | `/production/bom-tree` | erp-app/src/App.tsx:1058 |
| 531 | `/production/production-planning` | erp-app/src/App.tsx:1059 |
| 532 | `/production/production-reports` | erp-app/src/App.tsx:1060 |
| 533 | `/production/quality-control-ent` | erp-app/src/App.tsx:1061 |
| 534 | `/production/work-instructions-ent` | erp-app/src/App.tsx:1062 |
| 535 | `/fabrication/profiles` | erp-app/src/App.tsx:1063 |
| 536 | `/fabrication/systems` | erp-app/src/App.tsx:1064 |
| 537 | `/fabrication/glass-catalog` | erp-app/src/App.tsx:1065 |
| 538 | `/fabrication/finishes-colors` | erp-app/src/App.tsx:1066 |
| 539 | `/fabrication/accessories` | erp-app/src/App.tsx:1067 |
| 540 | `/fabrication/cutting-lists` | erp-app/src/App.tsx:1068 |
| 541 | `/fabrication/assembly-orders` | erp-app/src/App.tsx:1069 |
| 542 | `/fabrication/welding-orders` | erp-app/src/App.tsx:1070 |
| 543 | `/fabrication/coating-orders` | erp-app/src/App.tsx:1071 |
| 544 | `/fabrication/glazing-orders` | erp-app/src/App.tsx:1072 |
| 545 | `/fabrication/packing-lists` | erp-app/src/App.tsx:1073 |
| 546 | `/fabrication/transport-orders` | erp-app/src/App.tsx:1074 |
| 547 | `/fabrication/installation-orders` | erp-app/src/App.tsx:1075 |
| 548 | `/fabrication/service-tickets` | erp-app/src/App.tsx:1076 |
| 549 | `/fabrication/workflow-tracker` | erp-app/src/App.tsx:1077 |
| 550 | `/inventory/warehouses` | erp-app/src/App.tsx:1078 |
| 551 | `/inventory/stock-movements` | erp-app/src/App.tsx:1079 |
| 552 | `/inventory/stock-counts` | erp-app/src/App.tsx:1080 |
| 553 | `/inventory/raw-material-stock` | erp-app/src/App.tsx:1081 |
| 554 | `/inventory/finished-goods-stock` | erp-app/src/App.tsx:1082 |
| 555 | `/inventory/warehouse-locations` | erp-app/src/App.tsx:1083 |
| 556 | `/inventory/dashboard` | erp-app/src/App.tsx:1084 |
| 557 | `/sales/delivery-notes` | erp-app/src/App.tsx:1085 |
| 558 | `/sales/returns` | erp-app/src/App.tsx:1086 |
| 559 | `/production/production-lines` | erp-app/src/App.tsx:1087 |
| 560 | `/production/ncr-reports` | erp-app/src/App.tsx:1088 |
| 561 | `/production/equipment` | erp-app/src/App.tsx:1089 |
| 562 | `/production/installers` | erp-app/src/App.tsx:1090 |
| 563 | `/production/installations` | erp-app/src/App.tsx:1091 |
| 564 | `/documents/contracts` | erp-app/src/App.tsx:1092 |
| 565 | `/data-flow` | erp-app/src/App.tsx:1093 |
| 566 | `/crm/contacts` | erp-app/src/App.tsx:1096 |
| 567 | `/crm/pipeline` | erp-app/src/App.tsx:1097 |
| 568 | `/crm/activities` | erp-app/src/App.tsx:1098 |
| 569 | `/crm/service` | erp-app/src/App.tsx:1099 |
| 570 | `/crm/meetings` | erp-app/src/App.tsx:1100 |
| 571 | `/crm/messaging` | erp-app/src/App.tsx:1101 |
| 572 | `/crm/portal` | erp-app/src/App.tsx:1102 |
| 573 | `/crm/automation` | erp-app/src/App.tsx:1103 |
| 574 | `/crm/real-time` | erp-app/src/App.tsx:1104 |
| 575 | `/crm/search` | erp-app/src/App.tsx:1105 |
| 576 | `/sales/quotes` | erp-app/src/App.tsx:1106 |
| 577 | `/sales/invoices` | erp-app/src/App.tsx:1107 |
| 578 | `/pricing/cost-calc` | erp-app/src/App.tsx:1108 |
| 579 | `/pricing/dynamic` | erp-app/src/App.tsx:1109 |
| 580 | `/pricing/daily-profit` | erp-app/src/App.tsx:1110 |
| 581 | `/production/bom` | erp-app/src/App.tsx:1111 |
| 582 | `/production/quality-inspections` | erp-app/src/App.tsx:1112 |
| 583 | `/production/safety` | erp-app/src/App.tsx:1113 |
| 584 | `/installation/installers` | erp-app/src/App.tsx:1114 |
| 585 | `/installation/field` | erp-app/src/App.tsx:1115 |
| 586 | `/installation/measurements` | erp-app/src/App.tsx:1116 |
| 587 | `/finance/revenues` | erp-app/src/App.tsx:1117 |
| 588 | `/finance/payments` | erp-app/src/App.tsx:1118 |
| 589 | `/finance/checks` | erp-app/src/App.tsx:1119 |
| 590 | `/finance/currencies` | erp-app/src/App.tsx:1120 |
| 591 | `/hr/leaves` | erp-app/src/App.tsx:1121 |
| 592 | `/procurement/requisitions` | erp-app/src/App.tsx:1123 |
| 593 | `/procurement/rfq` | erp-app/src/App.tsx:1124 |
| 594 | `/procurement/stock-count` | erp-app/src/App.tsx:1125 |
| 595 | `/procurement/stock-movements` | erp-app/src/App.tsx:1126 |
| 596 | `/import/cost-calculator` | erp-app/src/App.tsx:1127 |
| 597 | `/import/insurance` | erp-app/src/App.tsx:1128 |
| 598 | `/procurement/suppliers` | erp-app/src/App.tsx:1131 |
| 599 | `/procurement/purchase-orders` | erp-app/src/App.tsx:1132 |
| 600 | `/procurement/purchase-requests` | erp-app/src/App.tsx:1133 |
| 601 | `/procurement/purchase-approvals` | erp-app/src/App.tsx:1134 |
| 602 | `/procurement/goods-receipt` | erp-app/src/App.tsx:1135 |
| 603 | `/procurement/price-quotes` | erp-app/src/App.tsx:1136 |
| 604 | `/procurement/price-comparison` | erp-app/src/App.tsx:1137 |
| 605 | `/procurement/inventory-management` | erp-app/src/App.tsx:1138 |
| 606 | `/procurement/supplier-evaluations` | erp-app/src/App.tsx:1139 |
| 607 | `/procurement/supplier-contracts` | erp-app/src/App.tsx:1140 |
| 608 | `/procurement/purchase-returns` | erp-app/src/App.tsx:1141 |
| 609 | `/crm/leads-management` | erp-app/src/App.tsx:1142 |
| 610 | `/crm/customers` | erp-app/src/App.tsx:1143 |
| 611 | `/crm/quotations` | erp-app/src/App.tsx:1144 |
| 612 | `/crm/sales-orders` | erp-app/src/App.tsx:1145 |
| 613 | `/inventory/inventory-dashboard` | erp-app/src/App.tsx:1146 |
| 614 | `/production/field-measurements` | erp-app/src/App.tsx:1147 |
| 615 | `/production/installations-list` | erp-app/src/App.tsx:1148 |
| 616 | `/executive/profitability-dashboard` | erp-app/src/App.tsx:1149 |
| 617 | `/whatsapp-ai` | erp-app/src/App.tsx:1152 |
| 618 | `/customer-service` | erp-app/src/App.tsx:1153 |
| 619 | `/hr/payroll-engine` | erp-app/src/App.tsx:1154 |
| 620 | `/production/bom-products` | erp-app/src/App.tsx:1155 |
| 621 | `/crm/lead-scoring` | erp-app/src/App.tsx:1156 |
| 622 | `/import-management` | erp-app/src/App.tsx:1157 |
| 623 | `/risk-management` | erp-app/src/App.tsx:1158 |
| 624 | `/finance/company-financials` | erp-app/src/App.tsx:1159 |
| 625 | `/portal/login` | erp-app/src/App.tsx:1173 |
| 626 | `/portal/register/:token` | erp-app/src/App.tsx:1174 |
| 627 | `/portal/supplier` | erp-app/src/App.tsx:1175 |
| 628 | `/portal/contractor` | erp-app/src/App.tsx:1176 |
| 629 | `/portal/employee` | erp-app/src/App.tsx:1177 |
| 630 | `${pagePath}` | api-server/src/routes/kobi/tools.ts:575 |
| 631 | `/intelligence` | techno-kol-ops/client/src/App.tsx:102 |
| 632 | `/supply-chain` | techno-kol-ops/client/src/App.tsx:103 |
| 633 | `/pipeline` | techno-kol-ops/client/src/App.tsx:106 |
| 634 | `/map` | techno-kol-ops/client/src/App.tsx:107 |
| 635 | `/materials` | techno-kol-ops/client/src/App.tsx:108 |
| 636 | `/clients` | techno-kol-ops/client/src/App.tsx:110 |
| 637 | `/mobile` | techno-kol-ops/client/src/App.tsx:113 |
| 638 | `/project-analysis` | techno-kol-ops/client/src/App.tsx:117 |
| 639 | `/purchasing` | techno-kol-ops/client/src/App.tsx:118 |
| 640 | `/situation` | techno-kol-ops/client/src/App.tsx:120 |
| 641 | `/hours` | techno-kol-ops/client/src/App.tsx:122 |
| 642 | `/alerts-intel` | techno-kol-ops/client/src/App.tsx:124 |
| 643 | `/hr-autonomy` | techno-kol-ops/client/src/App.tsx:125 |
| 644 | `/document-management` | techno-kol-ops/client/src/App.tsx:126 |
| 645 | `/financial-autonomy` | techno-kol-ops/client/src/App.tsx:129 |
| 646 | `/project360/:id` | techno-kol-ops/client/src/App.tsx:131 |
| 647 | `/work-order360/:id` | techno-kol-ops/client/src/App.tsx:132 |
| 648 | `/control-room/operations` | techno-kol-ops/client/src/App.tsx:133 |
| 649 | `/control-room/procurement` | techno-kol-ops/client/src/App.tsx:134 |
| 650 | `/control-room/workforce` | techno-kol-ops/client/src/App.tsx:135 |
| 651 | `/360/customer/:id` | techno-kol-ops/client/src/App.tsx:136 |
| 652 | `/360/employee/:id` | techno-kol-ops/client/src/App.tsx:137 |
| 653 | `/360/finance/:id` | techno-kol-ops/client/src/App.tsx:138 |
| 654 | `/360/po/:id` | techno-kol-ops/client/src/App.tsx:139 |
| 655 | `/360/project/:id` | techno-kol-ops/client/src/App.tsx:140 |
| 656 | `/360/quote/:id` | techno-kol-ops/client/src/App.tsx:141 |
| 657 | `/360/rfq/:id` | techno-kol-ops/client/src/App.tsx:142 |
| 658 | `/360/supplier/:id` | techno-kol-ops/client/src/App.tsx:143 |
| 659 | `/360/work-order/:id` | techno-kol-ops/client/src/App.tsx:144 |
| 660 | `/inventory-alerts` | techno-kol-ops/client/src/App.tsx:145 |
| 661 | `/qr-generator` | techno-kol-ops/client/src/App.tsx:146 |
| 662 | `/schedule` | techno-kol-ops/client/src/App.tsx:147 |
| 663 | `/reports/:type` | techno-kol-ops/client/src/App.tsx:149 |
| 664 | `/invoice/:id/print` | techno-kol-ops/client/src/App.tsx:150 |
| 665 | `*` | techno-kol-ops/client/src/App.tsx:151 |
| 666 | `/sign/:token` | techno-kol-ops/client/src/App.tsx:227 |

**Route files scanned**: erp-app/src, api-server/src, onyx-procurement/src, techno-kol-ops/, payroll-autonomous/, onyx-ai/

**Frontend route groups (by first segment)**: 137
**API route groups (by first segment)**: 729

## 5. FLOW REGISTRY

### 5a. WORKFLOW_FLOWS (workflow-flows.js)

| # | flow_id | source |
|---|---------|--------|
| 1 | `sales_to_project` | onyx-procurement/src/pipeline/workflow-flows.js:19 |
| 2 | `project_to_procurement` | onyx-procurement/src/pipeline/workflow-flows.js:39 |
| 3 | `procurement_to_execution` | onyx-procurement/src/pipeline/workflow-flows.js:59 |
| 4 | `execution_to_cash` | onyx-procurement/src/pipeline/workflow-flows.js:77 |
| 5 | `employee_to_payroll` | onyx-procurement/src/pipeline/workflow-flows.js:95 |

**Total workflow steps across all flows: 22**

### 5b. STATE_MACHINES (state-machines.js)

| # | entity | source |
|---|--------|--------|
| 1 | `lead` | onyx-procurement/src/pipeline/state-machines.js:14 |
| 2 | `quote` | onyx-procurement/src/pipeline/state-machines.js:32 |
| 3 | `rfq` | onyx-procurement/src/pipeline/state-machines.js:55 |
| 4 | `po` | onyx-procurement/src/pipeline/state-machines.js:76 |
| 5 | `project` | onyx-procurement/src/pipeline/state-machines.js:104 |
| 6 | `work_order` | onyx-procurement/src/pipeline/state-machines.js:149 |
| 7 | `invoice` | onyx-procurement/src/pipeline/state-machines.js:173 |
| 8 | `employee` | onyx-procurement/src/pipeline/state-machines.js:202 |
| 9 | `attendance` | onyx-procurement/src/pipeline/state-machines.js:213 |
| 10 | `payroll` | onyx-procurement/src/pipeline/state-machines.js:228 |
| 11 | `contract` | onyx-procurement/src/pipeline/state-machines.js:245 |
| 12 | `task` | onyx-procurement/src/pipeline/state-machines.js:259 |
| 13 | `payment` | onyx-procurement/src/pipeline/state-machines.js:272 |
| 14 | `document` | onyx-procurement/src/pipeline/state-machines.js:286 |
| 15 | `alert` | onyx-procurement/src/pipeline/state-machines.js:297 |

**Total transitions: 115** (parsed from `transitions: { action: 'state' }` objects)

### 5c. PIPELINE_STAGES (pipeline-engine.js)

| # | id | name |
|---|----|------|
| 1 | lead | Lead (ליד) |
| 2 | quote | RFQ / Quote (הצעת מחיר) |
| 3 | approval | Approval (אישור) |
| 4 | order | Sales Order / Contract (הזמנה / חוזה) |
| 5 | project | Project (פרויקט) |
| 6 | work_orders | Work Orders (הזמנות עבודה) |
| 7 | procurement | Procurement (רכש) |
| 8 | inventory | Inventory / Materials (מלאי / חומרים) |
| 9 | execution | Manufacturing (ייצור / ביצוע) |
| 10 | delivery | Delivery / Installation (אספקה / התקנה) |
| 11 | invoice | Invoice (חשבונית) |
| 12 | payment | Collection / Payment (גביה / תשלום) |
| 13 | closure | Reporting / Closure (סגירה ודיווח) |

**Total: 13 stages** (CLAUDE.md claims 13)

### 5d. ORCHESTRATOR ACTIONS (orchestrator.js)

| # | action_id | line |
|---|-----------|------|
| 1 | `lead.create_quote` | onyx-procurement/src/pipeline/orchestrator.js:24 |
| 2 | `lead.convert_to_customer` | onyx-procurement/src/pipeline/orchestrator.js:37 |
| 3 | `quote.approve` | onyx-procurement/src/pipeline/orchestrator.js:49 |
| 4 | `quote.convert_to_project` | onyx-procurement/src/pipeline/orchestrator.js:62 |
| 5 | `project.create_work_order` | onyx-procurement/src/pipeline/orchestrator.js:80 |
| 6 | `project.create_po` | onyx-procurement/src/pipeline/orchestrator.js:93 |
| 7 | `project.create_invoice` | onyx-procurement/src/pipeline/orchestrator.js:107 |
| 8 | `rfq.convert_to_po` | onyx-procurement/src/pipeline/orchestrator.js:120 |
| 9 | `po.receive_items` | onyx-procurement/src/pipeline/orchestrator.js:135 |
| 10 | `work_order.start` | onyx-procurement/src/pipeline/orchestrator.js:150 |
| 11 | `work_order.signoff` | onyx-procurement/src/pipeline/orchestrator.js:162 |
| 12 | `invoice.issue` | onyx-procurement/src/pipeline/orchestrator.js:176 |
| 13 | `invoice.register_payment` | onyx-procurement/src/pipeline/orchestrator.js:190 |
| 14 | `payment.reconcile` | onyx-procurement/src/pipeline/orchestrator.js:203 |
| 15 | `attendance.approve` | onyx-procurement/src/pipeline/orchestrator.js:215 |
| 16 | `payroll.calculate` | onyx-procurement/src/pipeline/orchestrator.js:228 |
| 17 | `payroll.export` | onyx-procurement/src/pipeline/orchestrator.js:242 |
| 18 | `alert.resolve` | onyx-procurement/src/pipeline/orchestrator.js:254 |

**Total: 18 actions** (CLAUDE.md claims 18)

## 6. DASHBOARDS/REPORTS REGISTRY

### 6a. Reports (`reports_registry.json`)

| id | name | domain | sources |
|----|------|--------|---------|
| RPT-0001 | `project_profitability_report` | projects | projects.projects, finance.invoices, procurement.purchase_orders, production.material_consumption |
| RPT-0002 | `aging_report` | finance | finance.invoices, finance.payments |
| RPT-0003 | `pnl` | finance | finance.cashflow_entries, finance.expenses |
| RPT-0004 | `balance_sheet` | finance | finance.cashflow_entries |
| RPT-0005 | `cash_flow` | finance | finance.cashflow_entries |
| RPT-0006 | `vat_report_pcn836` | finance | finance.invoices, finance.invoice_items |
| RPT-0007 | `production_kpi` | production | production.production_orders, production.production_quality_checks |
| RPT-0008 | `sales_pipeline` | sales | crm.leads, sales.opportunities, sales.quotes |
| RPT-0009 | `procurement_savings` | procurement | procurement.purchase_orders |
| RPT-0010 | `inventory_turnover` | inventory | inventory.stock_movements, inventory.items |
| RPT-0011 | `payroll_summary` | hr_workforce | hr_workforce.payroll_inputs |
| RPT-0012 | `attendance_report` | hr_workforce | hr_workforce.attendance_logs |
| RPT-0013 | `service_sla` | service | service.service_tickets, service.sla_rules |
| RPT-0014 | `customer_360` | crm | crm.customers, sales.quotes, projects.projects, finance.invoices |
| RPT-0015 | `supplier_scorecard` | procurement | procurement.suppliers, procurement.supplier_price_lists |
| RPT-0016 | `overdue_projects_report` | projects | projects.projects |
| RPT-0017 | `bank_reconciliation` | finance | finance.cashflow_entries, finance.payments |
| RPT-0018 | `stock_reorder_suggestions` | inventory | inventory.stock_balances, inventory.reorder_rules |
| RPT-0019 | `installation_completion` | installation | installation.installation_orders, installation.completion_reports |
| RPT-0020 | `audit_log_review` | governance | governance.audit_logs, governance.change_logs |

### 6b. Dashboards (`dashboards_registry.json`)

| id | name | domain | widgets |
|----|------|--------|---------|
| DSH-0001 | `dashboard_executive` | governance | revenue, profit, cash, projects_active, sla_breaches |
| DSH-0002 | `dashboard_operations` | projects | wo_open, attendance_today, alerts, production_orders |
| DSH-0003 | `dashboard_procurement` | procurement | rfqs_open, pos_pending, savings |
| DSH-0004 | `dashboard_workforce` | hr_workforce | employees_active, attendance_rate, payroll_run |
| DSH-0005 | `dashboard_ai` | ai_automation | automation_runs, insights, anomalies |
| DSH-0006 | `dashboard_finance` | finance | ar_aging, ap_aging, vat, bank_balances |
| DSH-0007 | `dashboard_service` | service | open_tickets, sla_breaches, csat |
| DSH-0008 | `dashboard_projects` | projects | projects_by_status, overdue, upcoming_milestones |
| DSH-0009 | `dashboard_production` | production | oee, scrap_rate, wo_in_progress |
| DSH-0010 | `dashboard_sales` | sales | pipeline, win_rate, quota_attainment |

## 7. PERMISSIONS REGISTRY

**213 RLS policies** extracted from `create policy` statements.

| # | policy_name | table | source |
|---|-------------|-------|--------|
| 1 | `users_select_own` | `governance.users_profile` | 00001_rls_helpers_and_policies.sql:313 |
| 2 | `users_update_own_or_admin` | `governance.users_profile` | 00001_rls_helpers_and_policies.sql:316 |
| 3 | `roles_select` | `governance.roles` | 00001_rls_helpers_and_policies.sql:320 |
| 4 | `permissions_select` | `governance.permissions` | 00001_rls_helpers_and_policies.sql:321 |
| 5 | `role_permissions_select` | `governance.role_permissions` | 00001_rls_helpers_and_policies.sql:322 |
| 6 | `user_roles_select` | `governance.user_roles` | 00001_rls_helpers_and_policies.sql:325 |
| 7 | `audit_select` | `governance.audit_logs` | 00001_rls_helpers_and_policies.sql:329 |
| 8 | `state_history_select` | `governance.state_history` | 00001_rls_helpers_and_policies.sql:333 |
| 9 | `flags_select` | `governance.feature_flags` | 00001_rls_helpers_and_policies.sql:336 |
| 10 | `config_select` | `governance.config_entries` | 00001_rls_helpers_and_policies.sql:339 |
| 11 | `workflows_select` | `governance.workflows` | 00001_rls_helpers_and_policies.sql:343 |
| 12 | `workflow_instances_select` | `governance.workflow_instances` | 00001_rls_helpers_and_policies.sql:344 |
| 13 | `workflow_steps_select` | `governance.workflow_steps` | 00001_rls_helpers_and_policies.sql:345 |
| 14 | `workflow_step_executions_select` | `governance.workflow_step_executions` | 00001_rls_helpers_and_policies.sql:346 |
| 15 | `domain_events_select` | `governance.domain_events` | 00001_rls_helpers_and_policies.sql:349 |
| 16 | `event_subs_select` | `governance.event_subscriptions` | 00001_rls_helpers_and_policies.sql:351 |
| 17 | `event_deliveries_select` | `governance.event_deliveries` | 00001_rls_helpers_and_policies.sql:353 |
| 18 | `queue_jobs_select` | `governance.queue_jobs` | 00001_rls_helpers_and_policies.sql:355 |
| 19 | `health_checks_select` | `governance.health_checks` | 00001_rls_helpers_and_policies.sql:357 |
| 20 | `obj_perms_select` | `governance.object_permissions` | 00001_rls_helpers_and_policies.sql:361 |
| 21 | `validations_select` | `governance.validations_log` | 00001_rls_helpers_and_policies.sql:363 |
| 22 | `pipeline_stages_select` | `commercial.pipeline_stages` | 00001_rls_helpers_and_policies.sql:370 |
| 23 | `customers_select` | `commercial.customers` | 00001_rls_helpers_and_policies.sql:372 |
| 24 | `leads_select` | `commercial.leads` | 00001_rls_helpers_and_policies.sql:377 |
| 25 | `crm_activities_select` | `commercial.crm_activities` | 00001_rls_helpers_and_policies.sql:381 |
| 26 | `opportunities_select` | `commercial.opportunities` | 00001_rls_helpers_and_policies.sql:385 |
| 27 | `quotes_select` | `commercial.quotes` | 00001_rls_helpers_and_policies.sql:388 |
| 28 | `quote_lines_select` | `commercial.quote_lines` | 00001_rls_helpers_and_policies.sql:392 |
| 29 | `pricing_snapshots_select` | `commercial.pricing_snapshots` | 00001_rls_helpers_and_policies.sql:396 |
| 30 | `customer_portal_select` | `commercial.customer_portal_accounts` | 00001_rls_helpers_and_policies.sql:399 |
| 31 | `suppliers_select` | `procurement.suppliers` | 00001_rls_helpers_and_policies.sql:406 |
| 32 | `rfqs_select` | `procurement.rfqs` | 00001_rls_helpers_and_policies.sql:410 |
| 33 | `rfq_items_select` | `procurement.rfq_items` | 00001_rls_helpers_and_policies.sql:414 |
| 34 | `rfq_invites_select` | `procurement.rfq_supplier_invites` | 00001_rls_helpers_and_policies.sql:417 |
| 35 | `supplier_quotes_select` | `procurement.supplier_quotes` | 00001_rls_helpers_and_policies.sql:420 |
| 36 | `supplier_quote_lines_select` | `procurement.supplier_quote_lines` | 00001_rls_helpers_and_policies.sql:423 |
| 37 | `approvals_select` | `procurement.approvals` | 00001_rls_helpers_and_policies.sql:426 |
| 38 | `contracts_select` | `procurement.contracts` | 00001_rls_helpers_and_policies.sql:431 |
| 39 | `po_select` | `procurement.purchase_orders` | 00001_rls_helpers_and_policies.sql:435 |
| 40 | `po_lines_select` | `procurement.purchase_order_lines` | 00001_rls_helpers_and_policies.sql:439 |
| 41 | `supplier_invoices_select` | `procurement.supplier_invoices` | 00001_rls_helpers_and_policies.sql:443 |
| 42 | `returns_select` | `procurement.returns` | 00001_rls_helpers_and_policies.sql:447 |
| 43 | `warranty_select` | `procurement.warranty_cases` | 00001_rls_helpers_and_policies.sql:450 |
| 44 | `supplier_portal_select` | `procurement.supplier_portal_accounts` | 00001_rls_helpers_and_policies.sql:454 |
| 45 | `projects_select` | `execution.projects` | 00001_rls_helpers_and_policies.sql:461 |
| 46 | `phases_select` | `execution.project_phases` | 00001_rls_helpers_and_policies.sql:465 |
| 47 | `milestones_select` | `execution.project_milestones` | 00001_rls_helpers_and_policies.sql:468 |
| 48 | `wo_select` | `execution.work_orders` | 00001_rls_helpers_and_policies.sql:472 |
| 49 | `wo_tasks_select` | `execution.work_order_tasks` | 00001_rls_helpers_and_policies.sql:476 |
| 50 | `tasks_select` | `execution.tasks` | 00001_rls_helpers_and_policies.sql:480 |
| 51 | `task_deps_select` | `execution.task_dependencies` | 00001_rls_helpers_and_policies.sql:485 |
| 52 | `logistics_select` | `execution.logistics_orders` | 00001_rls_helpers_and_policies.sql:487 |
| 53 | `delivery_events_select` | `execution.delivery_events` | 00001_rls_helpers_and_policies.sql:490 |
| 54 | `installation_events_select` | `execution.installation_events` | 00001_rls_helpers_and_policies.sql:493 |
| 55 | `signatures_select` | `execution.signatures` | 00001_rls_helpers_and_policies.sql:496 |
| 56 | `alerts_select` | `execution.alerts` | 00001_rls_helpers_and_policies.sql:498 |
| 57 | `categories_select` | `inventory.material_categories` | 00001_rls_helpers_and_policies.sql:506 |
| 58 | `materials_select` | `inventory.materials` | 00001_rls_helpers_and_policies.sql:508 |
| 59 | `warehouses_select` | `inventory.warehouses` | 00001_rls_helpers_and_policies.sql:512 |
| 60 | `inv_select` | `inventory.inventory` | 00001_rls_helpers_and_policies.sql:515 |
| 61 | `receipts_select` | `inventory.inventory_receipts` | 00001_rls_helpers_and_policies.sql:518 |
| 62 | `issues_select` | `inventory.inventory_issues` | 00001_rls_helpers_and_policies.sql:521 |
| 63 | `transfers_select` | `inventory.inventory_transfers` | 00001_rls_helpers_and_policies.sql:524 |
| 64 | `reservations_select` | `inventory.inventory_reservations` | 00001_rls_helpers_and_policies.sql:527 |
| 65 | `stock_counts_select` | `inventory.stock_counts` | 00001_rls_helpers_and_policies.sql:530 |
| 66 | `stock_count_lines_select` | `inventory.stock_count_lines` | 00001_rls_helpers_and_policies.sql:533 |
| 67 | `material_requests_select` | `inventory.material_requests` | 00001_rls_helpers_and_policies.sql:536 |
| 68 | `material_request_lines_select` | `inventory.material_request_lines` | 00001_rls_helpers_and_policies.sql:540 |
| 69 | `barcode_scans_select` | `inventory.barcode_scans` | 00001_rls_helpers_and_policies.sql:543 |
| 70 | `batches_select` | `inventory.manufacturing_batches` | 00001_rls_helpers_and_policies.sql:546 |
| 71 | `employers_select` | `workforce.employers` | 00001_rls_helpers_and_policies.sql:554 |
| 72 | `employees_select` | `workforce.employees` | 00001_rls_helpers_and_policies.sql:557 |
| 73 | `hr_profiles_select` | `workforce.hr_profiles` | 00001_rls_helpers_and_policies.sql:561 |
| 74 | `assignments_select` | `workforce.workforce_assignments` | 00001_rls_helpers_and_policies.sql:564 |
| 75 | `attendance_select` | `workforce.attendance` | 00001_rls_helpers_and_policies.sql:567 |
| 76 | `payroll_runs_select` | `workforce.payroll_runs` | 00001_rls_helpers_and_policies.sql:570 |
| 77 | `payroll_entries_select` | `workforce.payroll_entries` | 00001_rls_helpers_and_policies.sql:573 |
| 78 | `wage_slips_select` | `workforce.wage_slips` | 00001_rls_helpers_and_policies.sql:576 |
| 79 | `pension_select` | `workforce.pension_records` | 00001_rls_helpers_and_policies.sql:579 |
| 80 | `emp_expenses_select` | `workforce.employee_expenses` | 00001_rls_helpers_and_policies.sql:582 |
| 81 | `shifts_select` | `workforce.shifts` | 00001_rls_helpers_and_policies.sql:585 |
| 82 | `invoices_select` | `finance.invoices` | 00001_rls_helpers_and_policies.sql:592 |
| 83 | `invoice_lines_select` | `finance.invoice_lines` | 00001_rls_helpers_and_policies.sql:595 |
| 84 | `receipts_select` | `finance.receipts` | 00001_rls_helpers_and_policies.sql:598 |
| 85 | `payments_select` | `finance.payments` | 00001_rls_helpers_and_policies.sql:601 |
| 86 | `gl_select` | `finance.gl_transactions` | 00001_rls_helpers_and_policies.sql:604 |
| 87 | `vat_select` | `finance.vat_records` | 00001_rls_helpers_and_policies.sql:607 |
| 88 | `tax_records_select` | `finance.tax_records` | 00001_rls_helpers_and_policies.sql:610 |
| 89 | `tax_exports_select` | `finance.tax_exports` | 00001_rls_helpers_and_policies.sql:613 |
| 90 | `bank_files_select` | `finance.bank_files` | 00001_rls_helpers_and_policies.sql:616 |
| 91 | `bank_matches_select` | `finance.bank_matches` | 00001_rls_helpers_and_policies.sql:619 |
| 92 | `cashflow_select` | `finance.cashflow_entries` | 00001_rls_helpers_and_policies.sql:622 |
| 93 | `budget_select` | `finance.budget_entries` | 00001_rls_helpers_and_policies.sql:625 |
| 94 | `costing_select` | `finance.costing_entries` | 00001_rls_helpers_and_policies.sql:629 |
| 95 | `fx_select` | `finance.fx_rates` | 00001_rls_helpers_and_policies.sql:633 |
| 96 | `consolidation_select` | `finance.consolidation_entries` | 00001_rls_helpers_and_policies.sql:635 |
| 97 | `collections_select` | `finance.collection_cases` | 00001_rls_helpers_and_policies.sql:638 |
| 98 | `expenses_select` | `finance.expenses` | 00001_rls_helpers_and_policies.sql:641 |
| 99 | `annual_tax_select` | `finance.annual_tax_reports` | 00001_rls_helpers_and_policies.sql:644 |
| 100 | `docs_select` | `docs.documents` | 00001_rls_helpers_and_policies.sql:651 |
| 101 | `classifications_select` | `docs.document_classifications` | 00001_rls_helpers_and_policies.sql:652 |
| 102 | `ocr_select` | `docs.ocr_results` | 00001_rls_helpers_and_policies.sql:653 |
| 103 | `attachments_select` | `docs.attachments` | 00001_rls_helpers_and_policies.sql:654 |
| 104 | `print_jobs_select` | `docs.print_jobs` | 00001_rls_helpers_and_policies.sql:655 |
| 105 | `scan_sessions_select` | `docs.scan_sessions` | 00001_rls_helpers_and_policies.sql:656 |
| 106 | `portal_users_select` | `comms.portal_users` | 00001_rls_helpers_and_policies.sql:663 |
| 107 | `notifications_select` | `comms.notifications` | 00001_rls_helpers_and_policies.sql:666 |
| 108 | `notifications_update_read` | `comms.notifications` | 00001_rls_helpers_and_policies.sql:670 |
| 109 | `threads_select` | `comms.comms_threads` | 00001_rls_helpers_and_policies.sql:673 |
| 110 | `emails_select` | `comms.email_messages` | 00001_rls_helpers_and_policies.sql:674 |
| 111 | `sms_select` | `comms.sms_messages` | 00001_rls_helpers_and_policies.sql:675 |
| 112 | `whatsapp_select` | `comms.whatsapp_messages` | 00001_rls_helpers_and_policies.sql:676 |
| 113 | `chatbot_select` | `comms.chatbot_sessions` | 00001_rls_helpers_and_policies.sql:678 |
| 114 | `tickets_select` | `comms.support_tickets` | 00001_rls_helpers_and_policies.sql:681 |
| 115 | `articles_select` | `comms.help_articles` | 00001_rls_helpers_and_policies.sql:685 |
| 116 | `insights_select` | `intelligence.ai_insights` | 00001_rls_helpers_and_policies.sql:692 |
| 117 | `anomalies_select` | `intelligence.anomaly_cases` | 00001_rls_helpers_and_policies.sql:695 |
| 118 | `forecasts_select` | `intelligence.forecast_models` | 00001_rls_helpers_and_policies.sql:698 |
| 119 | `quality_select` | `intelligence.quality_scores` | 00001_rls_helpers_and_policies.sql:701 |
| 120 | `trends_select` | `intelligence.trend_signals` | 00001_rls_helpers_and_policies.sql:704 |
| 121 | `seasonality_select` | `intelligence.seasonality_patterns` | 00001_rls_helpers_and_policies.sql:707 |
| 122 | `recommendations_select` | `intelligence.decision_recommendations` | 00001_rls_helpers_and_policies.sql:710 |
| 123 | `rm_exec_select` | `analytics.rm_executive_summary` | 00001_rls_helpers_and_policies.sql:717 |
| 124 | `rm_ops_select` | `analytics.rm_operations_summary` | 00001_rls_helpers_and_policies.sql:720 |
| 125 | `rm_proc_select` | `analytics.rm_procurement_summary` | 00001_rls_helpers_and_policies.sql:723 |
| 126 | `rm_fin_select` | `analytics.rm_finance_summary` | 00001_rls_helpers_and_policies.sql:726 |
| 127 | `rm_work_select` | `analytics.rm_workforce_summary` | 00001_rls_helpers_and_policies.sql:729 |
| 128 | `rm_ai_select` | `analytics.rm_ai_summary` | 00001_rls_helpers_and_policies.sql:732 |
| 129 | `customers_select` | `commercial.customers` | 00005_rls_policies.sql:55 |
| 130 | `customers_insert` | `commercial.customers` | 00005_rls_policies.sql:57 |
| 131 | `customers_update` | `commercial.customers` | 00005_rls_policies.sql:59 |
| 132 | `suppliers_select` | `procurement.suppliers` | 00005_rls_policies.sql:66 |
| 133 | `suppliers_insert` | `procurement.suppliers` | 00005_rls_policies.sql:68 |
| 134 | `suppliers_update` | `procurement.suppliers` | 00005_rls_policies.sql:70 |
| 135 | `projects_select` | `execution.projects` | 00005_rls_policies.sql:77 |
| 136 | `projects_insert` | `execution.projects` | 00005_rls_policies.sql:79 |
| 137 | `projects_update` | `execution.projects` | 00005_rls_policies.sql:81 |
| 138 | `work_orders_select` | `execution.work_orders` | 00005_rls_policies.sql:88 |
| 139 | `work_orders_insert` | `execution.work_orders` | 00005_rls_policies.sql:90 |
| 140 | `work_orders_update` | `execution.work_orders` | 00005_rls_policies.sql:92 |
| 141 | `employees_select` | `workforce.employees` | 00005_rls_policies.sql:99 |
| 142 | `employees_insert` | `workforce.employees` | 00005_rls_policies.sql:101 |
| 143 | `employees_update` | `workforce.employees` | 00005_rls_policies.sql:103 |
| 144 | `attendance_select` | `workforce.attendance` | 00005_rls_policies.sql:110 |
| 145 | `attendance_insert` | `workforce.attendance` | 00005_rls_policies.sql:122 |
| 146 | `attendance_update` | `workforce.attendance` | 00005_rls_policies.sql:124 |
| 147 | `invoices_select` | `finance.invoices` | 00005_rls_policies.sql:135 |
| 148 | `invoices_insert` | `finance.invoices` | 00005_rls_policies.sql:137 |
| 149 | `invoices_update` | `finance.invoices` | 00005_rls_policies.sql:139 |
| 150 | `payments_select` | `finance.payments` | 00005_rls_policies.sql:150 |
| 151 | `payments_insert` | `finance.payments` | 00005_rls_policies.sql:154 |
| 152 | `payments_update` | `finance.payments` | 00005_rls_policies.sql:156 |
| 153 | `documents_select` | `docs.documents` | 00005_rls_policies.sql:167 |
| 154 | `documents_insert` | `docs.documents` | 00005_rls_policies.sql:169 |
| 155 | `documents_update` | `docs.documents` | 00005_rls_policies.sql:171 |
| 156 | `ai_insights_select` | `intelligence.ai_insights` | 00005_rls_policies.sql:178 |
| 157 | `ai_insights_insert` | `intelligence.ai_insights` | 00005_rls_policies.sql:182 |
| 158 | `ai_insights_update` | `intelligence.ai_insights` | 00005_rls_policies.sql:185 |
| 159 | `quotes_select` | `commercial.quotes` | 00005_rls_policies.sql:196 |
| 160 | `quotes_insert` | `commercial.quotes` | 00005_rls_policies.sql:199 |
| 161 | `quotes_update` | `commercial.quotes` | 00005_rls_policies.sql:201 |
| 162 | `po_select` | `procurement.purchase_orders` | 00005_rls_policies.sql:212 |
| 163 | `po_insert` | `procurement.purchase_orders` | 00005_rls_policies.sql:214 |
| 164 | `po_update` | `procurement.purchase_orders` | 00005_rls_policies.sql:216 |
| 165 | `rfqs_select` | `procurement.rfqs` | 00005_rls_policies.sql:227 |
| 166 | `rfqs_insert` | `procurement.rfqs` | 00005_rls_policies.sql:231 |
| 167 | `rfqs_update` | `procurement.rfqs` | 00005_rls_policies.sql:233 |
| 168 | `gl_select` | `finance.gl_transactions` | 00005_rls_policies.sql:244 |
| 169 | `gl_insert` | `finance.gl_transactions` | 00005_rls_policies.sql:248 |
| 170 | `alerts_select` | `execution.alerts` | 00005_rls_policies.sql:255 |
| 171 | `alerts_insert` | `execution.alerts` | 00005_rls_policies.sql:259 |
| 172 | `alerts_update` | `execution.alerts` | 00005_rls_policies.sql:262 |
| 173 | `rls_customer_contacts_read` | `commercial.customer_contacts` | 00014_rls_policies_expansion_tables.sql:136 |
| 174 | `rls_lead_tags_read` | `commercial.lead_tags` | 00014_rls_policies_expansion_tables.sql:140 |
| 175 | `rls_lead_tag_assignments_read` | `commercial.lead_tag_assignments` | 00014_rls_policies_expansion_tables.sql:143 |
| 176 | `rls_quote_revisions_read` | `commercial.quote_revisions` | 00014_rls_policies_expansion_tables.sql:147 |
| 177 | `rls_quote_approval_rules_read` | `commercial.quote_approval_rules` | 00014_rls_policies_expansion_tables.sql:151 |
| 178 | `rls_supplier_contacts_read` | `procurement.supplier_contacts` | 00014_rls_policies_expansion_tables.sql:156 |
| 179 | `rls_approval_steps_read` | `procurement.approval_steps` | 00014_rls_policies_expansion_tables.sql:160 |
| 180 | `rls_supplier_scorecards_read` | `procurement.supplier_scorecards` | 00014_rls_policies_expansion_tables.sql:164 |
| 181 | `rls_contract_milestones_read` | `procurement.contract_milestones` | 00014_rls_policies_expansion_tables.sql:168 |
| 182 | `rls_rfq_comparison_snapshots_read` | `procurement.rfq_comparison_snapshots` | 00014_rls_policies_expansion_tables.sql:172 |
| 183 | `rls_project_risks_read` | `execution.project_risks` | 00014_rls_policies_expansion_tables.sql:177 |
| 184 | `rls_project_blockers_read` | `execution.project_blockers` | 00014_rls_policies_expansion_tables.sql:181 |
| 185 | `rls_task_comments_read` | `execution.task_comments` | 00014_rls_policies_expansion_tables.sql:185 |
| 186 | `rls_task_attachments_read` | `execution.task_attachments` | 00014_rls_policies_expansion_tables.sql:189 |
| 187 | `rls_project_cost_plans_read` | `execution.project_cost_plans` | 00014_rls_policies_expansion_tables.sql:193 |
| 188 | `rls_wo_qa_checklists_read` | `execution.work_order_qa_checklists` | 00014_rls_policies_expansion_tables.sql:197 |
| 189 | `rls_wo_qa_items_read` | `execution.work_order_qa_items` | 00014_rls_policies_expansion_tables.sql:201 |
| 190 | `rls_recon_exceptions_read` | `finance.reconciliation_exceptions` | 00014_rls_policies_expansion_tables.sql:206 |
| 191 | `rls_payment_allocations_read` | `finance.payment_allocations` | 00014_rls_policies_expansion_tables.sql:210 |
| 192 | `rls_dunning_campaigns_read` | `finance.dunning_campaigns` | 00014_rls_policies_expansion_tables.sql:214 |
| 193 | `rls_dunning_steps_read` | `finance.dunning_steps` | 00014_rls_policies_expansion_tables.sql:218 |
| 194 | `rls_collection_actions_read` | `finance.collection_actions` | 00014_rls_policies_expansion_tables.sql:222 |
| 195 | `rls_reminder_schedules_read` | `finance.reminder_schedules` | 00014_rls_policies_expansion_tables.sql:226 |
| 196 | `rls_payroll_export_batches_read` | `workforce.payroll_export_batches` | 00014_rls_policies_expansion_tables.sql:231 |
| 197 | `rls_payroll_exceptions_read` | `workforce.payroll_exceptions` | 00014_rls_policies_expansion_tables.sql:235 |
| 198 | `rls_pay_components_read` | `workforce.pay_components` | 00014_rls_policies_expansion_tables.sql:239 |
| 199 | `rls_employee_pay_components_read` | `workforce.employee_pay_components` | 00014_rls_policies_expansion_tables.sql:243 |
| 200 | `rls_leave_types_read` | `workforce.leave_types` | 00014_rls_policies_expansion_tables.sql:247 |
| 201 | `rls_leave_requests_read` | `workforce.leave_requests` | 00014_rls_policies_expansion_tables.sql:250 |
| 202 | `rls_user_preferences_own` | `governance.user_preferences` | 00014_rls_policies_expansion_tables.sql:255 |
| 203 | `rls_saved_filters_read` | `governance.saved_filters` | 00014_rls_policies_expansion_tables.sql:261 |
| 204 | `rls_alert_subscriptions_own` | `governance.alert_subscriptions` | 00014_rls_policies_expansion_tables.sql:266 |
| 205 | `rls_dashboard_defs_read` | `analytics.dashboard_definitions` | 00014_rls_policies_expansion_tables.sql:272 |
| 206 | `rls_dashboard_widgets_read` | `analytics.dashboard_widgets` | 00014_rls_policies_expansion_tables.sql:275 |
| 207 | `rls_kpi_snapshots_read` | `analytics.kpi_snapshots` | 00014_rls_policies_expansion_tables.sql:278 |
| 208 | `rls_anomaly_feedback_read` | `intelligence.anomaly_feedback` | 00014_rls_policies_expansion_tables.sql:282 |
| 209 | `rls_model_registry_read` | `intelligence.model_registry` | 00014_rls_policies_expansion_tables.sql:286 |
| 210 | `rls_model_executions_read` | `intelligence.model_executions` | 00014_rls_policies_expansion_tables.sql:290 |
| 211 | `rls_recommendation_feedback_read` | `intelligence.recommendation_feedback` | 00014_rls_policies_expansion_tables.sql:294 |
| 212 | `app_menu_read` | `public.app_menu` | 00017_app_menu.sql:28 |
| 213 | `app_menu_admin` | `public.app_menu` | 00017_app_menu.sql:29 |

**Roles registry** declares: ["roles","count"]

## 8. AUTOMATIONS REGISTRY

### 8a. Declared automations (`automations_registry.json`)

| id | name | trigger | side_effects |
|----|------|---------|--------------|
| AUTO-0001 | `quote_approved_create_project` | `sales.quotes.status=approved` | projects.projects.create |
| AUTO-0002 | `project_status_change_alert` | `projects.projects.status.change` | orchestration.notifications.create |
| AUTO-0003 | `overdue_project_alert` | `projects.projects.target_delivery<today` | orchestration.notifications.create |
| AUTO-0004 | `auto_reorder_on_low_stock` | `inventory.stock_balances<reorder_point` | procurement.purchase_requests.create |
| AUTO-0005 | `compute_wage_on_attendance_close` | `hr_workforce.attendance_logs.status=submitted` | hr_workforce.payroll_inputs.create |
| AUTO-0006 | `vat_period_reminder` | `cron 0 9 14 * *` | orchestration.notifications.create |
| AUTO-0007 | `daily_kpi_snapshot` | `cron 5 0 * * *` | analytics.scorecards.create |
| AUTO-0008 | `payment_reminder_overdue` | `finance.invoices.days_overdue>0` | orchestration.notifications.create |
| AUTO-0009 | `ai_anomaly_detection_nightly` | `cron 0 3 * * *` | ai_automation.prediction_outputs.create |
| AUTO-0010 | `send_quote_email_on_approve` | `sales.quotes.status=approved` | documents.generated_files.create |
| AUTO-0011 | `rfq_followup_no_response` | `procurement.purchase_requests.no_response>3d` | orchestration.notifications.create |
| AUTO-0012 | `service_sla_breach_alert` | `service.service_tickets.sla_exceeded=true` | orchestration.notifications.create |

### 8b. Cron jobs (`vm-task-runner/src/jobs.js`)

| # | name | cron | file:line |
|---|------|------|-----------|
| 1 | `daily-kpi-snapshot` | `5 0 * * *` | vm-task-runner/src/jobs.js:12 |
| 2 | `payroll-monthly-close` | `0 2 1 * *` | vm-task-runner/src/jobs.js:21 |
| 3 | `vat-period-reminder` | `0 9 14 * *` | vm-task-runner/src/jobs.js:29 |
| 4 | `procurement-rfq-followup` | `0 10 * * 1-5` | vm-task-runner/src/jobs.js:37 |
| 5 | `ai-nightly-recommendations` | `0 3 * * *` | vm-task-runner/src/jobs.js:45 |

## 9. CONNECTION MATRIX

Per-table connection status. Status: **healthy** (FK in + FK out + pipeline entity + at least one matching route), **partial** (has FKs but no pipeline/route), **orphan** (no FK in AND no FK out), **declared_but_no_table** (registry model has no migration table).

### 9a. The 16 pipeline entities → migration table match

| entity | migration table(s) matched | status |
|--------|----------------------------|--------|
| `lead` | `commercial.leads` | MATCHED |
| `customer` | `commercial.customers` | MATCHED |
| `supplier` | `procurement.suppliers` | MATCHED |
| `quote` | `commercial.quotes` | MATCHED |
| `rfq` | `procurement.rfqs` | MATCHED |
| `po` | `procurement.purchase_orders` | MATCHED |
| `project` | `execution.projects` | MATCHED |
| `work_order` | `execution.work_orders` | MATCHED |
| `invoice` | `finance.invoices` | MATCHED |
| `employee` | `workforce.employees` | MATCHED |
| `contract` | (none) | **DECLARED_BUT_NO_TABLE** |
| `material` | `inventory.materials` | MATCHED |
| `payment` | `finance.payments` | MATCHED |
| `task` | `execution.tasks` | MATCHED |
| `document` | `docs.documents` | MATCHED |
| `alert` | (none) | **DECLARED_BUT_NO_TABLE** |

### 9b. FK-connectivity per schema

| schema | tables | orphan (no FK in/out) | hubs (≥5 FK in) |
|--------|--------|-----------------------|-------------------|
| `analytics` | 13 | 8 | 0 |
| `commercial` | 14 | 1 | 2 |
| `comms` | 12 | 1 | 1 |
| `compliance` | 2 | 0 | 0 |
| `crm` | 3 | 0 | 0 |
| `docs` | 8 | 0 | 1 |
| `documents` | 7 | 0 | 0 |
| `execution` | 19 | 1 | 2 |
| `finance` | 24 | 4 | 1 |
| `governance` | 35 | 5 | 1 |
| `intelligence` | 13 | 5 | 0 |
| `inventory` | 18 | 0 | 2 |
| `maintenance` | 2 | 0 | 0 |
| `orchestration` | 7 | 1 | 0 |
| `planning` | 3 | 1 | 0 |
| `pricing` | 2 | 0 | 0 |
| `procurement` | 19 | 0 | 3 |
| `public` | 8 | 2 | 0 |
| `quality` | 3 | 0 | 0 |
| `routing` | 3 | 0 | 0 |
| `service` | 2 | 0 | 0 |
| `treasury` | 3 | 0 | 0 |
| `workforce` | 17 | 0 | 1 |

## 10. INTEGRITY AUDIT

### 10a. Orphan models — tables with NO FK in AND NO FK out (29)

- `analytics.kpi_snapshots` (00010_enterprise_expansion_30_tables.sql:418)
- `analytics.read_model_invalidations` (00011_enterprise_expansion_30_more_tables.sql:563)
- `analytics.rm_ai_summary` (00000_master_schema.sql:2088)
- `analytics.rm_executive_summary` (00000_master_schema.sql:2028)
- `analytics.rm_finance_summary` (00000_master_schema.sql:2065)
- `analytics.rm_operations_summary` (00000_master_schema.sql:2041)
- `analytics.rm_procurement_summary` (00000_master_schema.sql:2053)
- `analytics.rm_workforce_summary` (00000_master_schema.sql:2077)
- `commercial.quote_approval_rules` (00011_enterprise_expansion_30_more_tables.sql:65)
- `comms.help_articles` (00000_master_schema.sql:1905)
- `execution.signatures` (00000_master_schema.sql:972)
- `finance.annual_tax_reports` (00000_master_schema.sql:1662)
- `finance.cashflow_entries` (00000_master_schema.sql:1564)
- `finance.consolidation_entries` (00000_master_schema.sql:1617)
- `finance.fx_rates` (00000_master_schema.sql:1607)
- `governance.config_entries` (00000_master_schema.sql:303)
- `governance.escalation_rules` (00010_enterprise_expansion_30_tables.sql:631)
- `governance.health_checks` (00000_master_schema.sql:329)
- `governance.idempotency_keys` (00008_idempotency_table.sql:9)
- `governance.validations_log` (00000_master_schema.sql:280)
- `intelligence.ai_insights` (00000_master_schema.sql:1922)
- `intelligence.forecast_models` (00000_master_schema.sql:1957)
- `intelligence.quality_scores` (00000_master_schema.sql:1974)
- `intelligence.seasonality_patterns` (00000_master_schema.sql:1996)
- `intelligence.trend_signals` (00000_master_schema.sql:1985)
- `orchestration.notifications` (00024_orchestration_tables.sql:111)
- `planning.demand_forecasts` (00027_enterprise_30_tables.sql:309)
- `public.employees` (20260417000000_initial_schema.sql:85)
- `public.properties` (20260417000000_initial_schema.sql:99)

### 10b. Declared but no table — claimed in `models_registry.json` but no matching migration table (93)

- `crm.lead_sources`
- `crm.contacts`
- `crm.activities`
- `crm.meetings`
- `crm.communication_logs`
- `crm.customer_segments`
- `sales.quote_items`
- `sales.pricing_rules`
- `sales.discounts`
- `sales.sales_orders`
- `sales.sales_pipeline`
- `projects.project_tasks`
- `projects.milestones`
- `projects.dependencies`
- `projects.project_resources`
- `projects.project_risk_entries`
- `projects.project_progress_logs`
- `engineering.technical_specs`
- `engineering.drawings`
- `engineering.bom_headers`
- `engineering.bom_items`
- `engineering.revision_control`
- `engineering.product_configurations`
- `engineering.engineering_requests`
- `engineering.approval_drawings`
- `procurement.supplier_price_lists`
- `procurement.purchase_requests`
- `procurement.purchase_order_items`
- `procurement.goods_receipts`
- `procurement.procurement_approvals`
- `inventory.items`
- `inventory.raw_materials`
- `inventory.stock_balances`
- `inventory.stock_movements`
- `inventory.reservations`
- `inventory.batch_lots`
- `production.production_orders`
- `production.production_steps`
- `production.work_centers`
- `production.labor_logs`
- `production.machine_logs`
- `production.material_consumption`
- `production.scrap_logs`
- `production.production_quality_checks`
- `installation.installation_orders`
- `installation.installation_tasks`
- `installation.installation_teams`
- `installation.schedules`
- `installation.site_visits`
- `installation.completion_reports`
- `installation.handover_documents`
- `installation.punch_lists`
- `service.service_tickets`
- `service.warranty_records`
- `service.service_visits`
- `service.issue_categories`
- `service.resolution_logs`
- `service.maintenance_plans`
- `service.service_feedback`
- `service.sla_rules`
- `finance.invoice_items`
- `finance.expense_categories`
- `finance.profitability_snapshots`
- `hr_workforce.contractors`
- `hr_workforce.teams`
- `hr_workforce.attendance_logs`
- `hr_workforce.assignments`
- `hr_workforce.payroll_inputs`
- `hr_workforce.performance_reviews`
- `hr_workforce.skill_matrix`
- `documents.document_links`
- `documents.templates`
- `documents.generated_files`
- `documents.archive_records`
- `analytics.dashboards`
- `analytics.kpi_definitions`
- `analytics.reports`
- `analytics.report_sources`
- `analytics.scenario_models`
- `analytics.scorecards`
- `ai_automation.automation_rules`
- `ai_automation.automation_runs`
- `ai_automation.ai_agents`
- `ai_automation.ai_actions`
- `ai_automation.prediction_outputs`
- `ai_automation.recommendation_logs`
- `ai_automation.prompt_templates`
- `ai_automation.orchestration_flows`
- `governance.users`
- `governance.change_logs`
- `governance.system_settings`
- `governance.validation_rules`
- `governance.data_quality_issues`

### 10c. Duplicate tables (defined ≥ 2× in migrations) — 5

- `governance.roles` — defined at: 00000_master_schema.sql:71, 00019_security_rls_core.sql:11
- `governance.permissions` — defined at: 00000_master_schema.sql:82, 00019_security_rls_core.sql:21
- `governance.role_permissions` — defined at: 00000_master_schema.sql:95, 00019_security_rls_core.sql:31
- `governance.user_roles` — defined at: 00000_master_schema.sql:104, 00019_security_rls_core.sql:39
- `analytics.dashboard_widgets` — defined at: 00010_enterprise_expansion_30_tables.sql:391, 00021_dashboard_tables.sql:16

### 10d. Duplicate frontend routes (>1 file registers same path) — 15 (sample up to 50)

- `/` — erp-app/src/App.tsx:518, techno-kol-ops/client/src/App.tsx:101
- `/employees` — erp-app/src/App.tsx:540, techno-kol-ops/client/src/App.tsx:109
- `/work-orders` — erp-app/src/App.tsx:541, techno-kol-ops/client/src/App.tsx:104
- `/production` — erp-app/src/App.tsx:591, techno-kol-ops/client/src/App.tsx:105
- `/documents` — erp-app/src/App.tsx:657, techno-kol-ops/client/src/App.tsx:115
- `/finance` — erp-app/src/App.tsx:716, techno-kol-ops/client/src/App.tsx:111
- `/finance/tax-management` — erp-app/src/App.tsx:746, erp-app/src/App.tsx:812
- `/hr/recruitment` — erp-app/src/App.tsx:810, erp-app/src/App.tsx:843
- `/alerts` — erp-app/src/App.tsx:826, techno-kol-ops/client/src/App.tsx:112
- `/notification-routing` — erp-app/src/App.tsx:830, erp-app/src/App.tsx:951
- `/hr/contractor-payments` — erp-app/src/App.tsx:859, erp-app/src/App.tsx:1122
- `/reports` — erp-app/src/App.tsx:964, techno-kol-ops/client/src/App.tsx:148
- `/ai-engine/kimi-terminal` — erp-app/src/App.tsx:1027, api-server/src/routes/kobi/tools.ts:577
- `/procurement` — erp-app/src/App.tsx:1028, techno-kol-ops/client/src/App.tsx:127
- `/data-flow` — erp-app/src/App.tsx:1093, techno-kol-ops/client/src/App.tsx:121

### 10e. Duplicate API routes (same method+path registered in >1 file) — 171 (sample up to 50)

- `GET /health` — api-server/src/lib/kimi-express-routes.ts:7, onyx-ai/src/health.ts:208
- `GET /status` — api-server/src/lib/kimi-express-routes.ts:12, api-server/src/routes/ai-autonomous-agent.ts:38
- `POST /init` — api-server/src/lib/project-costing-engine.ts:1162, api-server/src/routes/ai-document-intelligence-engine.ts:31, api-server/src/routes/ai-engine-routes.ts:261, api-server/src/routes/attendance-leave-engine.ts:15 …(31 total)
- `GET /products` — api-server/src/lib/project-costing-engine.ts:1177, api-server/src/routes/bom-product-engine.ts:422, api-server/src/routes/product-catalog.ts:122, api-server/src/routes/products.ts:9
- `GET /products/:id` — api-server/src/lib/project-costing-engine.ts:1202, api-server/src/routes/bom-product-engine.ts:436, api-server/src/routes/product-catalog.ts:149, api-server/src/routes/products.ts:20
- `POST /products` — api-server/src/lib/project-costing-engine.ts:1216, api-server/src/routes/bom-product-engine.ts:398, api-server/src/routes/product-catalog.ts:161, api-server/src/routes/products.ts:33
- `PUT /products/:id` — api-server/src/lib/project-costing-engine.ts:1238, api-server/src/routes/bom-product-engine.ts:452, api-server/src/routes/product-catalog.ts:189, api-server/src/routes/products.ts:53
- `DELETE /products/:id` — api-server/src/lib/project-costing-engine.ts:1266, api-server/src/routes/product-catalog.ts:220, api-server/src/routes/products.ts:76
- `GET /suppliers` — api-server/src/lib/project-costing-engine.ts:1580, api-server/src/routes/suppliers.ts:6, techno-kol-ops/src/routes/supplyChain.ts:43
- `GET /suppliers/:id` — api-server/src/lib/project-costing-engine.ts:1606, api-server/src/routes/suppliers.ts:31
- `POST /suppliers` — api-server/src/lib/project-costing-engine.ts:1617, api-server/src/routes/suppliers.ts:42
- `PUT /suppliers/:id` — api-server/src/lib/project-costing-engine.ts:1642, api-server/src/routes/suppliers.ts:58
- `DELETE /suppliers/:id` — api-server/src/lib/project-costing-engine.ts:1670, api-server/src/routes/suppliers.ts:74
- `GET /daily-profit` — api-server/src/lib/project-costing-engine.ts:1795, api-server/src/routes/company-financials-realtime-engine.ts:275, api-server/src/routes/oracle-financial-core.ts:1497
- `GET /` — api-server/src/middleware/api-standards.ts:21, api-server/src/routes/digital-contracts-signatures-engine.ts:454, api-server/src/routes/metrics.ts:28, api-server/src/routes/project-costing-engine.ts:204 …(20 total)
- `GET /:id` — api-server/src/middleware/api-standards.ts:56, api-server/src/routes/digital-contracts-signatures-engine.ts:502, api-server/src/routes/project-costing-engine.ts:248, api-server/src/routes/quality-control-engine.ts:223 …(11 total)
- `POST /` — api-server/src/middleware/api-standards.ts:73, api-server/src/routes/digital-contracts-signatures-engine.ts:394, api-server/src/routes/project-costing-engine.ts:282, api-server/src/routes/quality-control-engine.ts:250 …(19 total)
- `PUT /:id` — api-server/src/middleware/api-standards.ts:104, api-server/src/routes/digital-contracts-signatures-engine.ts:531, api-server/src/routes/project-costing-engine.ts:316, api-server/src/routes/quality-control-engine.ts:279 …(10 total)
- `DELETE /:id` — api-server/src/middleware/api-standards.ts:140, api-server/src/routes/digital-contracts-signatures-engine.ts:580, api-server/src/routes/project-costing-engine.ts:362, api-server/src/routes/quality-control-engine.ts:312 …(5 total)
- `GET /agents` — api-server/src/routes/agent-orchestration.ts:89, api-server/src/routes/crm-ultimate.ts:713
- `GET /agents/:id` — api-server/src/routes/agent-orchestration.ts:106, api-server/src/routes/crm-ultimate.ts:723
- `POST /agents` — api-server/src/routes/agent-orchestration.ts:112, api-server/src/routes/crm-ultimate.ts:735
- `PUT /agents/:id` — api-server/src/routes/agent-orchestration.ts:120, api-server/src/routes/crm-ultimate.ts:750
- `DELETE /agents/:id` — api-server/src/routes/agent-orchestration.ts:137, api-server/src/routes/crm-ultimate.ts:762
- `GET /rules` — api-server/src/routes/ai-autonomous-agent.ts:46, api-server/src/routes/ai-document-intelligence-engine.ts:867, api-server/src/routes/commission-calculator-engine.ts:234
- `GET /dashboard` — api-server/src/routes/ai-document-intelligence-engine.ts:719, api-server/src/routes/ai-engine-routes.ts:494, api-server/src/routes/ai-operations.ts:34, api-server/src/routes/attendance-leave-engine.ts:707 …(29 total)
- `GET /price-alerts` — api-server/src/routes/ai-document-intelligence-engine.ts:792, api-server/src/routes/product-quote-engine.ts:934
- `POST /rules` — api-server/src/routes/ai-document-intelligence-engine.ts:894, api-server/src/routes/commission-calculator-engine.ts:273
- `GET /stats` — api-server/src/routes/ai-engine-routes.ts:538, api-server/src/routes/vector-search.ts:179, techno-kol-ops/src/routes/admin.ts:113
- `GET /contracts` — api-server/src/routes/ai-gaps.ts:223, api-server/src/routes/crm-ultimate.ts:915, api-server/src/routes/digital-contracts-engine.ts:517
- `POST /contracts` — api-server/src/routes/ai-gaps.ts:230, api-server/src/routes/crm-ultimate.ts:930, api-server/src/routes/digital-contracts-engine.ts:569
- `PUT /contracts/:id` — api-server/src/routes/ai-gaps.ts:243, api-server/src/routes/crm-ultimate.ts:947, api-server/src/routes/digital-contracts-engine.ts:608
- `DELETE /contracts/:id` — api-server/src/routes/ai-gaps.ts:254, api-server/src/routes/crm-ultimate.ts:961, api-server/src/routes/digital-contracts-engine.ts:650
- `GET /today` — api-server/src/routes/attendance-leave-engine.ts:351, techno-kol-ops/src/routes/attendance.ts:9
- `GET /payroll-runs` — api-server/src/routes/attendance-payroll-engine.ts:1022, api-server/src/routes/payroll-engine.ts:429
- `GET /audit-log` — api-server/src/routes/audit-log.ts:7, techno-kol-ops/src/routes/admin.ts:108
- `GET /currency-exposures` — api-server/src/routes/business-analytics.ts:233, api-server/src/routes/exchange-rates.ts:127
- `POST /currency-exposures` — api-server/src/routes/business-analytics.ts:243, api-server/src/routes/exchange-rates.ts:143
- `PUT /currency-exposures/:id` — api-server/src/routes/business-analytics.ts:261, api-server/src/routes/exchange-rates.ts:152
- `DELETE /currency-exposures/:id` — api-server/src/routes/business-analytics.ts:282, api-server/src/routes/exchange-rates.ts:162
- `POST /project-analyses/import-from-quote` — api-server/src/routes/business-analytics.ts:413, api-server/src/routes/module-path-aliases.ts:702
- `POST /project-analyses/import-from-deal` — api-server/src/routes/business-analytics.ts:471, api-server/src/routes/module-path-aliases.ts:694
- `POST /project-analyses/import-from-products` — api-server/src/routes/business-analytics.ts:509, api-server/src/routes/module-path-aliases.ts:698
- `GET /kpis` — api-server/src/routes/ceo-control-tower.ts:274, techno-kol-ops/src/routes/intelligence.ts:10
- `GET /alerts` — api-server/src/routes/ceo-control-tower.ts:378, api-server/src/routes/realtime-financials-engine.ts:884, api-server/src/routes/supply-chain-lifecycle-engine.ts:848, techno-kol-ops/src/routes/materials.ts:30
- `GET /goals` — api-server/src/routes/ceo-control-tower.ts:481, techno-kol-ops/src/routes/brain.ts:81
- `POST /take-snapshot` — api-server/src/routes/ceo-control-tower.ts:899, api-server/src/routes/realtime-financials-engine.ts:109
- `GET /strategic-goals` — api-server/src/routes/ceo-control-tower.ts:1160, api-server/src/routes/strategy-module.ts:20
- `GET /leaderboard/:period` — api-server/src/routes/commission-calculator-engine.ts:835, api-server/src/routes/field-agent-analytics-engine.ts:1512
- `GET /obligations` — api-server/src/routes/company-financials-realtime-engine.ts:383, api-server/src/routes/oracle-financial-core.ts:1547
- `GET /receivables` — api-server/src/routes/company-financials-realtime-engine.ts:503, api-server/src/routes/oracle-financial-core.ts:1612
- `GET /balance-sheet` — api-server/src/routes/company-financials-realtime-engine.ts:750, api-server/src/routes/oracle-financial-core.ts:752
- `POST /messaging/send` — api-server/src/routes/crm-new-capabilities.ts:422, api-server/src/routes/module-path-aliases.ts:552
- `GET /contracts/:id` — api-server/src/routes/crm-ultimate.ts:925, api-server/src/routes/digital-contracts-engine.ts:543
- `GET /notifications` — api-server/src/routes/crm-ultimate.ts:1089, api-server/src/routes/notifications.ts:22
- `POST /notifications` — api-server/src/routes/crm-ultimate.ts:1101, api-server/src/routes/notifications.ts:722
- `DELETE /notifications/:id` — api-server/src/routes/crm-ultimate.ts:1134, api-server/src/routes/notifications.ts:256
- `GET /agent-stats/:agentId` — api-server/src/routes/crm-ultimate.ts:1317, api-server/src/routes/customer-service-ai-engine.ts:1115
- `GET /manager-dashboard` — api-server/src/routes/crm-ultimate.ts:2191, api-server/src/routes/field-agent-analytics-engine.ts:2364
- `GET /crm/field-agents` — api-server/src/routes/crm.ts:245, api-server/src/routes/route-aliases.ts:292
- `POST /crm/contractor-decision/calculate` — api-server/src/routes/crm.ts:581, api-server/src/routes/module-path-aliases.ts:527
- `POST /auto-check-sla` — api-server/src/routes/customer-service-ai-engine.ts:1265, api-server/src/routes/supply-chain-lifecycle-engine.ts:1662
- `GET /jobs` — api-server/src/routes/cut-nesting.ts:79, api-server/src/routes/installer-management-engine.ts:356
- `GET /jobs/:id` — api-server/src/routes/cut-nesting.ts:97, api-server/src/routes/installer-management-engine.ts:379
- `POST /jobs` — api-server/src/routes/cut-nesting.ts:103, api-server/src/routes/installer-management-engine.ts:391
- `PUT /jobs/:id` — api-server/src/routes/cut-nesting.ts:111, api-server/src/routes/installer-management-engine.ts:416
- `POST /data-flows/run-all` — api-server/src/routes/data-flow-automations.ts:60, api-server/src/routes/module-path-aliases.ts:602
- `GET /templates` — api-server/src/routes/digital-contracts-engine.ts:676, api-server/src/routes/digital-contracts-signatures-engine.ts:1106, api-server/src/routes/whatsapp-ai-engine.ts:1073
- `GET /templates/:id` — api-server/src/routes/digital-contracts-engine.ts:702, api-server/src/routes/whatsapp-ai-engine.ts:1180
- `POST /templates` — api-server/src/routes/digital-contracts-engine.ts:719, api-server/src/routes/digital-contracts-signatures-engine.ts:1134, api-server/src/routes/whatsapp-ai-engine.ts:1116
- `PUT /templates/:id` — api-server/src/routes/digital-contracts-engine.ts:751, api-server/src/routes/digital-contracts-signatures-engine.ts:1164, api-server/src/routes/whatsapp-ai-engine.ts:1141
- `GET /digital-twin` — api-server/src/routes/digital-twin.ts:62, techno-kol-ops/src/routes/ontology.ts:27
- `GET /documents/templates` — api-server/src/routes/document-templates.ts:81, api-server/src/routes/route-aliases.ts:387
- `POST /document-files/upload` — api-server/src/routes/documents.ts:248, api-server/src/routes/module-path-aliases.ts:606
- `POST /init-tables` — api-server/src/routes/engineering-change.ts:67, api-server/src/routes/sla-management.ts:41
- `GET /general-ledger` — api-server/src/routes/finance-accounting.ts:43, api-server/src/routes/finance-enterprise4.ts:32
- `GET /general-ledger/by-account` — api-server/src/routes/finance-accounting.ts:56, api-server/src/routes/finance-enterprise4.ts:63
- `GET /general-ledger/by-period` — api-server/src/routes/finance-accounting.ts:71, api-server/src/routes/finance-enterprise4.ts:80
- `GET /general-ledger/stats` — api-server/src/routes/finance-accounting.ts:86, api-server/src/routes/finance-enterprise4.ts:47
- `POST /general-ledger` — api-server/src/routes/finance-accounting.ts:109, api-server/src/routes/finance-enterprise4.ts:95
- `PUT /general-ledger/:id` — api-server/src/routes/finance-accounting.ts:121, api-server/src/routes/finance-enterprise4.ts:108
- `DELETE /general-ledger/:id` — api-server/src/routes/finance-accounting.ts:150, api-server/src/routes/finance-enterprise4.ts:134
- `GET /fixed-assets` — api-server/src/routes/finance-accounting.ts:156, api-server/src/routes/maintenance-enterprise.ts:89
- `GET /fixed-assets/stats` — api-server/src/routes/finance-accounting.ts:169, api-server/src/routes/maintenance-enterprise.ts:93
- `POST /fixed-assets` — api-server/src/routes/finance-accounting.ts:193, api-server/src/routes/maintenance-enterprise.ts:107
- `PUT /fixed-assets/:id` — api-server/src/routes/finance-accounting.ts:210, api-server/src/routes/maintenance-enterprise.ts:116
- `DELETE /fixed-assets/:id` — api-server/src/routes/finance-accounting.ts:249, api-server/src/routes/maintenance-enterprise.ts:139
- `GET /expense-reports/stats` — api-server/src/routes/finance-accounting.ts:278, api-server/src/routes/finance-enterprise4.ts:147
- `POST /payment-anomalies/detect` — api-server/src/routes/finance-enterprise.ts:1055, api-server/src/routes/module-path-aliases.ts:543
- `POST /finance/fixed-assets/calculate-depreciation` — api-server/src/routes/finance-enterprise4.ts:355, api-server/src/routes/module-path-aliases.ts:617
- `GET /finance/standing-orders` — api-server/src/routes/finance.ts:470, api-server/src/routes/module-path-aliases.ts:314
- `GET /finance/debtors-balances` — api-server/src/routes/finance.ts:1080, api-server/src/routes/module-path-aliases.ts:323
- `GET ${route}/stats` — api-server/src/routes/generic-crud.ts:130, api-server/src/routes/module-path-aliases.ts:50
- `GET ${route}/:id` — api-server/src/routes/generic-crud.ts:240, api-server/src/routes/module-path-aliases.ts:58
- `PUT ${route}/:id` — api-server/src/routes/generic-crud.ts:323, api-server/src/routes/module-path-aliases.ts:85
- `DELETE ${route}/:id` — api-server/src/routes/generic-crud.ts:349, api-server/src/routes/module-path-aliases.ts:103
- `GET /goods-receipts` — api-server/src/routes/goods-receipts.ts:20, api-server/src/routes/goods_receipts.ts:9
- `GET /goods-receipts/:id` — api-server/src/routes/goods-receipts.ts:45, api-server/src/routes/goods_receipts.ts:20
- `POST /goods-receipts` — api-server/src/routes/goods-receipts.ts:57, api-server/src/routes/goods_receipts.ts:33
- `PUT /goods-receipts/:id` — api-server/src/routes/goods-receipts.ts:84, api-server/src/routes/goods_receipts.ts:53
- `DELETE /goods-receipts/:id` — api-server/src/routes/goods-receipts.ts:115, api-server/src/routes/goods_receipts.ts:76
- `GET /healthz` — api-server/src/routes/health.ts:13, techno-kol-ops/src/index.ts:186
- `POST /attendance/clock-in` — api-server/src/routes/hr-enterprise.ts:479, api-server/src/routes/module-path-aliases.ts:563
- `POST /attendance/clock-out` — api-server/src/routes/hr-enterprise.ts:521, api-server/src/routes/module-path-aliases.ts:575
- `GET /installers` — api-server/src/routes/installations-module.ts:126, api-server/src/routes/installer-management-engine.ts:239
- `POST /installers` — api-server/src/routes/installations-module.ts:133, api-server/src/routes/installer-management-engine.ts:273
- `PUT /installers/:id` — api-server/src/routes/installations-module.ts:146, api-server/src/routes/installer-management-engine.ts:296
- `DELETE /installers/:id` — api-server/src/routes/installations-module.ts:157, api-server/src/routes/installer-management-engine.ts:337
- `GET /warehouses` — api-server/src/routes/inventory-warehouse.ts:135, api-server/src/routes/warehouses.ts:6
- `POST /warehouses` — api-server/src/routes/inventory-warehouse.ts:142, api-server/src/routes/warehouses.ts:18
- `PUT /warehouses/:id` — api-server/src/routes/inventory-warehouse.ts:154, api-server/src/routes/warehouses.ts:27
- `DELETE /warehouses/:id` — api-server/src/routes/inventory-warehouse.ts:165, api-server/src/routes/warehouses.ts:38
- `GET /stock-movements` — api-server/src/routes/inventory-warehouse.ts:233, api-server/src/routes/stock_movements.ts:9
- `POST /stock-movements` — api-server/src/routes/inventory-warehouse.ts:248, api-server/src/routes/stock_movements.ts:33
- `GET /stock-counts` — api-server/src/routes/inventory-warehouse.ts:260, api-server/src/routes/stock_counts.ts:9
- `POST /stock-counts` — api-server/src/routes/inventory-warehouse.ts:272, api-server/src/routes/stock_counts.ts:33
- `GET /kimi/dev/file` — api-server/src/routes/kimi/dev-platform.ts:67, api-server/src/routes/module-path-aliases.ts:676
- `GET /super-agent/history` — api-server/src/routes/kobi/chat.ts:1109, api-server/src/routes/super-agent/index.ts:427
- `GET /social-media-posts` — api-server/src/routes/marketing-automation-engine.ts:192, api-server/src/routes/marketing-module.ts:104
- `GET /social-media-posts/:id` — api-server/src/routes/marketing-automation-engine.ts:203, api-server/src/routes/marketing-module.ts:111
- `POST /social-media-posts` — api-server/src/routes/marketing-automation-engine.ts:215, api-server/src/routes/marketing-module.ts:120
- `PUT /social-media-posts/:id` — api-server/src/routes/marketing-automation-engine.ts:231, api-server/src/routes/marketing-module.ts:128
- `DELETE /social-media-posts/:id` — api-server/src/routes/marketing-automation-engine.ts:254, api-server/src/routes/marketing-module.ts:138
- `GET /marketing/campaigns` — api-server/src/routes/marketing-enterprise.ts:26, api-server/src/routes/route-aliases.ts:95
- `GET /marketing/content-calendar` — api-server/src/routes/marketing-enterprise.ts:80, api-server/src/routes/route-aliases.ts:101
- `GET /marketing/social-media` — api-server/src/routes/marketing-enterprise.ts:126, api-server/src/routes/route-aliases.ts:107
- `GET /marketing/email` — api-server/src/routes/marketing-enterprise.ts:175, api-server/src/routes/route-aliases.ts:113
- `GET /marketing/budget` — api-server/src/routes/marketing-enterprise.ts:227, api-server/src/routes/module-path-aliases.ts:443, api-server/src/routes/route-aliases.ts:119
- `GET /metrics` — api-server/src/routes/metric-dictionary.ts:46, onyx-procurement/src/ops/metrics.js:20, onyx-procurement/src/ops/prom-metrics.js:34
- `GET /hr/performance-reviews` — api-server/src/routes/module-path-aliases.ts:190, api-server/src/routes/route-aliases.ts:242
- `GET /marketing/hub` — api-server/src/routes/module-path-aliases.ts:411, api-server/src/routes/route-aliases.ts:128
- `GET /marketing/integrations` — api-server/src/routes/module-path-aliases.ts:426, api-server/src/routes/route-aliases.ts:131
- `GET /marketing/analytics` — api-server/src/routes/module-path-aliases.ts:433, api-server/src/routes/route-aliases.ts:125
- `POST /n8n/test-connection` — api-server/src/routes/module-path-aliases.ts:655, api-server/src/routes/n8n-integrations.ts:37
- `POST /raw-materials/bulk` — api-server/src/routes/module-path-aliases.ts:706, api-server/src/routes/raw-materials.ts:243
- `GET /payroll/dashboard` — api-server/src/routes/payroll-module.ts:25, api-server/src/routes/smart-payroll.ts:345
- `GET /product-dev/roadmap` — api-server/src/routes/product-dev-enterprise.ts:26, api-server/src/routes/route-aliases.ts:199
- `GET /product-dev/rd-projects` — api-server/src/routes/product-dev-enterprise.ts:75, api-server/src/routes/route-aliases.ts:211
- `GET /product-dev/feature-requests` — api-server/src/routes/product-dev-enterprise.ts:128, api-server/src/routes/route-aliases.ts:193
- `GET /product-dev/qa-testing` — api-server/src/routes/product-dev-enterprise.ts:177, api-server/src/routes/route-aliases.ts:205
- `GET /machine-maintenance` — api-server/src/routes/production-enterprise2.ts:252, api-server/src/routes/production-product-dev.ts:317
- `GET /machine-maintenance/stats` — api-server/src/routes/production-enterprise2.ts:256, api-server/src/routes/production-product-dev.ts:321
- `POST /machine-maintenance` — api-server/src/routes/production-enterprise2.ts:272, api-server/src/routes/production-product-dev.ts:326
- `PUT /machine-maintenance/:id` — api-server/src/routes/production-enterprise2.ts:280, api-server/src/routes/production-product-dev.ts:335
- `DELETE /machine-maintenance/:id` — api-server/src/routes/production-enterprise2.ts:310, api-server/src/routes/production-product-dev.ts:353
- `GET /${routePath}` — api-server/src/routes/production-sap-upgrade.ts:253, api-server/src/routes/projects-sap-upgrade.ts:290
- `GET /${routePath}/:id` — api-server/src/routes/production-sap-upgrade.ts:312, api-server/src/routes/projects-sap-upgrade.ts:311
- `POST /${routePath}` — api-server/src/routes/production-sap-upgrade.ts:327, api-server/src/routes/projects-sap-upgrade.ts:320
- `PUT /${routePath}/:id` — api-server/src/routes/production-sap-upgrade.ts:350, api-server/src/routes/projects-sap-upgrade.ts:375
- `DELETE /${routePath}/:id` — api-server/src/routes/production-sap-upgrade.ts:376, api-server/src/routes/projects-sap-upgrade.ts:446
- `GET /purchase-orders` — api-server/src/routes/purchase-orders.ts:10, api-server/src/routes/purchase_orders.ts:9
- `GET /purchase-orders/:id` — api-server/src/routes/purchase-orders.ts:36, api-server/src/routes/purchase_orders.ts:20
- `POST /purchase-orders` — api-server/src/routes/purchase-orders.ts:48, api-server/src/routes/purchase_orders.ts:33
- `PUT /purchase-orders/:id` — api-server/src/routes/purchase-orders.ts:77, api-server/src/routes/purchase_orders.ts:53
- `DELETE /purchase-orders/:id` — api-server/src/routes/purchase-orders.ts:118, api-server/src/routes/purchase_orders.ts:76
- `PUT /purchase-order-items/:id` — api-server/src/routes/purchase-orders.ts:153, api-server/src/routes/purchase_order_items.ts:53
- `DELETE /purchase-order-items/:id` — api-server/src/routes/purchase-orders.ts:177, api-server/src/routes/purchase_order_items.ts:76
- `GET /purchase-requests` — api-server/src/routes/purchase-requests.ts:9, api-server/src/routes/purchase_requests.ts:9
- `GET /purchase-requests/:id` — api-server/src/routes/purchase-requests.ts:35, api-server/src/routes/purchase_requests.ts:20
- `POST /purchase-requests` — api-server/src/routes/purchase-requests.ts:48, api-server/src/routes/purchase_requests.ts:33
- `PUT /purchase-requests/:id` — api-server/src/routes/purchase-requests.ts:72, api-server/src/routes/purchase_requests.ts:53
- `DELETE /purchase-requests/:id` — api-server/src/routes/purchase-requests.ts:95, api-server/src/routes/purchase_requests.ts:76
- `GET /raw-materials` — api-server/src/routes/raw-materials.ts:99, api-server/src/routes/raw_materials.ts:9
- `GET /raw-materials/:id` — api-server/src/routes/raw-materials.ts:196, api-server/src/routes/raw_materials.ts:20
- `POST /raw-materials` — api-server/src/routes/raw-materials.ts:207, api-server/src/routes/raw_materials.ts:33
- `PUT /raw-materials/:id` — api-server/src/routes/raw-materials.ts:220, api-server/src/routes/raw_materials.ts:53
- `DELETE /raw-materials/:id` — api-server/src/routes/raw-materials.ts:232, api-server/src/routes/raw_materials.ts:76
- `GET /whatsapp/templates` — api-server/src/routes/whatsapp-business-engine.ts:250, api-server/src/routes/whatsapp-hub.ts:207
- `GET /whatsapp/conversations` — api-server/src/routes/whatsapp-business-engine.ts:467, api-server/src/routes/whatsapp-hub.ts:87
- `GET /whatsapp/dashboard` — api-server/src/routes/whatsapp-business-engine.ts:566, api-server/src/routes/whatsapp-hub.ts:283
- `POST /whatsapp/webhook` — api-server/src/routes/whatsapp-hub.ts:132, techno-kol-ops/src/routes/intelligence.ts:77

### 10f. Duplicate menu entries (same route in >1 menu seed) — 32

- `/operations` — 3 occurrences in 00017/00034/00035_app_menu*
- `/procurement` — 3 occurrences in 00017/00034/00035_app_menu*
- `/workforce` — 3 occurrences in 00017/00034/00035_app_menu*
- `/customers` — 2 occurrences in 00017/00034/00035_app_menu*
- `/projects` — 4 occurrences in 00017/00034/00035_app_menu*
- `/work-orders` — 2 occurrences in 00017/00034/00035_app_menu*
- `/suppliers` — 2 occurrences in 00017/00034/00035_app_menu*
- `/employees` — 2 occurrences in 00017/00034/00035_app_menu*
- `/attendance` — 2 occurrences in 00017/00034/00035_app_menu*
- `/dashboard` — 2 occurrences in 00017/00034/00035_app_menu*
- `/inventory` — 2 occurrences in 00017/00034/00035_app_menu*
- `/finance` — 2 occurrences in 00017/00034/00035_app_menu*
- `/tax` — 2 occurrences in 00017/00034/00035_app_menu*
- `/realestate` — 2 occurrences in 00017/00034/00035_app_menu*
- `/documents` — 2 occurrences in 00017/00034/00035_app_menu*
- `/intelligence` — 2 occurrences in 00017/00034/00035_app_menu*
- `/system` — 2 occurrences in 00017/00034/00035_app_menu*
- `/executive` — 2 occurrences in 00017/00034/00035_app_menu*
- `/procurement-room` — 2 occurrences in 00017/00034/00035_app_menu*
- `/workforce-room` — 2 occurrences in 00017/00034/00035_app_menu*
- `/ai-room` — 2 occurrences in 00017/00034/00035_app_menu*
- `/command-center` — 2 occurrences in 00017/00034/00035_app_menu*
- `/kpi` — 2 occurrences in 00017/00034/00035_app_menu*
- `/inbox` — 2 occurrences in 00017/00034/00035_app_menu*
- `/events` — 2 occurrences in 00017/00034/00035_app_menu*
- `/audit` — 2 occurrences in 00017/00034/00035_app_menu*
- `/users` — 2 occurrences in 00017/00034/00035_app_menu*
- `/roles` — 2 occurrences in 00017/00034/00035_app_menu*
- `/feature-flags` — 2 occurrences in 00017/00034/00035_app_menu*
- `/integrations` — 2 occurrences in 00017/00034/00035_app_menu*
- `/cron` — 2 occurrences in 00017/00034/00035_app_menu*
- `/settings` — 2 occurrences in 00017/00034/00035_app_menu*

### 10g. Source-of-truth conflicts — controlled meaning declares a primary_source table that doesn't exist (7 of 11)

- `customer_master` → primary_source `crm.customers` — **NOT FOUND in any migration**. Likely actual table(s): `commercial.customers`, `public.customers`
- `contact_master` → primary_source `crm.contacts` — **NOT FOUND in any migration**. Likely actual table(s): (none)
- `project_master` → primary_source `projects.projects` — **NOT FOUND in any migration**. Likely actual table(s): `execution.projects`
- `quote_master` → primary_source `sales.quotes` — **NOT FOUND in any migration**. Likely actual table(s): `commercial.quotes`
- `inventory_balance` → primary_source `inventory.stock_balances` — **NOT FOUND in any migration**. Likely actual table(s): (none)
- `service_ticket_master` → primary_source `service.service_tickets` — **NOT FOUND in any migration**. Likely actual table(s): (none)
- `employee_master` → primary_source `hr_workforce.employees` — **NOT FOUND in any migration**. Likely actual table(s): `public.employees`, `workforce.employees`

### 10h. Missing connections — pipeline declares relation but no FK in DB

The pipeline `ENTITY_RELATIONSHIPS` (wiring-spec.js:46-70) declares 190 relation strings across 20 entity keys. The migrations declare 346 concrete foreign keys. Below are pipeline entity keys that have **no corresponding migration table** (hence their relations cannot be enforced in DB):

- Pipeline entity `contract` has no matching migration table. All relations declared for it in wiring-spec.js:46-70 are **logical-only**.
- Pipeline entity `alert` has no matching migration table. All relations declared for it in wiring-spec.js:46-70 are **logical-only**.
- Pipeline entity `inventory` (implicit in relations) is represented only as schema + sub-tables; there is no single `inventory.inventory` table.
- Pipeline entity `warehouse` (used in relations, wiring-spec.js:58) has no matching migration table.
- Pipeline entity `attendance`/`payroll` have state-machines (state-machines.js:213/228) but only `workforce.attendance_*` and `workforce.payroll_runs` tables exist — the singular names in the state machines do not map 1:1.

### 10i. Pages/menu that reference routes or tables that don't exist

- **510 menu entries** point to routes not defined anywhere by `<Route path=>` (sample shown below — this includes both the older 00017 menu and the newer 00035 FULL menu; the FULL menu alone contributes ~500 routes that have no corresponding `<Route>` registration in the scanned services).
- **652 frontend routes** are registered as `<Route path=>` but never appear in any menu seed, meaning the user cannot reach them from navigation.

Sample orphan menu entries (first 15):

- `/operations` (תפעול) — supabase/migrations/00017_app_menu.sql
- `/workforce` (כח אדם) — supabase/migrations/00017_app_menu.sql
- `/rfqs` (בקשות הצעת מחיר) — supabase/migrations/00017_app_menu.sql
- `/pos` (הזמנות רכש) — supabase/migrations/00017_app_menu.sql
- `/dashboard` (דשבורד) — supabase/migrations/00034_app_menu_complete.sql
- `/sales` (מכירות ולקוחות) — supabase/migrations/00034_app_menu_complete.sql
- `/tax` (מיסוי) — supabase/migrations/00034_app_menu_complete.sql
- `/workforce` (כח אדם ושכר) — supabase/migrations/00034_app_menu_complete.sql
- `/realestate` (נדל"ן) — supabase/migrations/00034_app_menu_complete.sql
- `/system` (מערכת) — supabase/migrations/00034_app_menu_complete.sql
- `/executive` (Executive Control Tower) — supabase/migrations/00034_app_menu_complete.sql
- `/operations` (Operations Control Room) — supabase/migrations/00034_app_menu_complete.sql
- `/procurement-room` (Procurement Control Room) — supabase/migrations/00034_app_menu_complete.sql
- `/workforce-room` (Workforce Control Room) — supabase/migrations/00034_app_menu_complete.sql
- `/ai-room` (AI Control Room) — supabase/migrations/00034_app_menu_complete.sql

### 10j. FKs pointing at nonexistent tables

- `public.user_profiles.id` → `auth.users.id` (20260417000000_initial_schema.sql:9)

## A. SYSTEM MAP (10 layers)

### L1 — Data (Supabase tables, views, RPCs)

- **PRESENT**: 237 tables across 23 schemas, 19 views, 143 RPC/trigger functions, 19 named indexes.
- **MISSING**: 0 tables missing vs registry pipeline entity-map (all 16 entities map to at least one table except `contract` and `alert` which need singular-name matching).
- **DUPLICATE**: 5 tables re-created in a later migration (governance.roles, governance.permissions, governance.role_permissions, governance.user_roles, analytics.dashboard_widgets).

### L2 — Entities (pipeline ontology)

- **PRESENT**: 16 entities in entity-map.js, 15 state machines.
- **MISSING**: state machine for `material` is absent; there's an `attendance` state machine but no entity-map entry (entity-map has `employee` only).
- **DUPLICATE**: `ontology.js` and `domain-model.js` both exist alongside `entity-map.js` — three partially-overlapping entity definitions in pipeline/.

### L3 — Relationships

- **PRESENT**: 346 unique FKs in migrations; 190 relation strings in pipeline ENTITY_RELATIONSHIPS.
- **MISSING**: pipeline declares relations for `warehouse`, `inventory_receipt`, `inventory_issue`, `inventory_transfer`, `inventory_reservation`, `stock_count`, `material_request`, `pricing_snapshot`, `employee_assignment`, `quality_check`, `bank_match`, `gl_transaction`, `ocr_result` that cannot be enforced because the target tables either don't exist or the pipeline names don't match.
- **DUPLICATE**: 0 FKs redefine the same edge.

### L4 — Business logic (flows / state machines / orchestrator)

- **PRESENT**: 5 workflow flows (22 total steps), 15 state machines (115 transitions), 18 orchestrator actions, 55 ACTION_API_MAP entries, 9 PAGE_CONTRACTS.
- **MISSING**: orchestrator has 18 declared actions (CLAUDE.md) vs 18 actually present. CLAUDE.md claims "91 transitions" — actual count from state-machines.js = **115**. CLAUDE.md claims 13 pipeline stages — PIPELINE_STAGES array contains 13.
- **DUPLICATE**: `state-enforcement.js` duplicates canTransition logic from `state-machines.js`.

### L5 — Pages / UI

- **PRESENT**: 658 page component files, 666 unique `<Route path>` declarations across services.
- **MISSING**: 9 Master 360 pages (Customer360, Supplier360, Quote360, RFQ360, Project360, WorkOrder360, PO360, Finance360, Employee360) are declared in wiring-spec.js PAGE_CONTRACTS but only **partially** map to actual `<Route>` paths — verification of each 360 page's required tabs vs actual implementation is out of scope for this file audit.
- **DUPLICATE**: 15 unique frontend route paths are registered by >1 file (multiple services register the same `/path`).

### L6 — Routes / API

- **PRESENT**: 4364 unique API endpoints, 729 API route groups (by first path segment).
- **MISSING**: pipeline `ACTION_API_MAP` references 55 canonical endpoints; not every endpoint is verified to exist in api-server/src (spot-check only).
- **DUPLICATE**: 171 method+path pairs are registered in >1 file.

### L7 — Permissions

- **PRESENT**: 213 RLS policies.
- **MISSING**: not every table has an RLS policy — 71 tables have zero policies declared in migrations.
- **DUPLICATE**: policies named identically on the same table in different migrations (needs per-policy deeper scan — flagged as follow-up).

### L8 — Automations

- **PRESENT**: 12 declared automations, 5 cron jobs in vm-task-runner.
- **MISSING**: 3 of the 12 `AUTO-xxxx` entries use cron triggers (`AUTO-0006`, `AUTO-0007`, `AUTO-0009`) matching vm-task-runner crons; 2 jobs (`payroll-monthly-close`, `procurement-rfq-followup`) have no corresponding entry in `automations_registry.json`.
- **DUPLICATE**: same cron schedule declared both in vm-task-runner and in automations_registry.json (double-authoring).

### L9 — Analytics (dashboards / reports)

- **PRESENT**: 10 dashboards, 20 reports, analytics.rm_* summary read-models.
- **MISSING**: dashboards reference sources like `projects.projects`, `sales.quotes`, `hr_workforce.attendance_logs`, `production.production_orders`, `procurement.purchase_requests` — **all of these table names do not exist** (actual: `execution.projects`, `commercial.quotes`, `workforce.attendance_logs`, no `production` schema, `procurement.purchase_requests` does not exist — only `procurement.rfqs`).
- **DUPLICATE**: `analytics.dashboard_widgets` is defined in two migrations (`00010`:391 and `00021`:16).

### L10 — Governance (audit, idempotency, health, validations)

- **PRESENT**: `governance.audit_events`, `governance.idempotency_keys`, `governance.validations_log`, `governance.health_checks`, `governance.roles`, `governance.permissions`, `governance.role_permissions`, `governance.user_roles`, `governance.escalation_rules`, `governance.config_entries`. Total 39 tables in governance schema.
- **MISSING**: no `governance.audit_policy` or `governance.data_retention_policy` — policies declared in code only.
- **DUPLICATE**: `governance.roles/permissions/role_permissions/user_roles` are defined in BOTH `00000_master_schema.sql` AND `00019_security_rls_core.sql` — table-level duplicate.

## B. LIST OF ALL MODELS FOUND

All 237 unique tables from Supabase migrations, sorted by schema then name:

- `analytics.dashboard_board_widgets` (00021_dashboard_tables.sql:28)
- `analytics.dashboard_boards` (00021_dashboard_tables.sql:6)
- `analytics.dashboard_definitions` (00010_enterprise_expansion_30_tables.sql:371)
- `analytics.dashboard_widgets` (00010_enterprise_expansion_30_tables.sql:391)
- `analytics.kpi_snapshots` (00010_enterprise_expansion_30_tables.sql:418)
- `analytics.read_model_invalidations` (00011_enterprise_expansion_30_more_tables.sql:563)
- `analytics.rm_ai_summary` (00000_master_schema.sql:2088)
- `analytics.rm_executive_summary` (00000_master_schema.sql:2028)
- `analytics.rm_finance_summary` (00000_master_schema.sql:2065)
- `analytics.rm_operations_summary` (00000_master_schema.sql:2041)
- `analytics.rm_procurement_summary` (00000_master_schema.sql:2053)
- `analytics.rm_workforce_summary` (00000_master_schema.sql:2077)
- `analytics.user_dashboard_boards` (00021_dashboard_tables.sql:43)
- `commercial.crm_activities` (00000_master_schema.sql:432)
- `commercial.customer_contacts` (00010_enterprise_expansion_30_tables.sql:11)
- `commercial.customer_portal_accounts` (00000_master_schema.sql:1780)
- `commercial.customers` (00000_master_schema.sql:358)
- `commercial.lead_tag_assignments` (00011_enterprise_expansion_30_more_tables.sql:30)
- `commercial.lead_tags` (00011_enterprise_expansion_30_more_tables.sql:11)
- `commercial.leads` (00000_master_schema.sql:396)
- `commercial.opportunities` (00000_master_schema.sql:449)
- `commercial.pipeline_stages` (00000_master_schema.sql:344)
- `commercial.pricing_snapshots` (00000_master_schema.sql:517)
- `commercial.quote_approval_rules` (00011_enterprise_expansion_30_more_tables.sql:65)
- `commercial.quote_lines` (00000_master_schema.sql:494)
- `commercial.quote_revisions` (00011_enterprise_expansion_30_more_tables.sql:46)
- `commercial.quotes` (00000_master_schema.sql:467)
- `comms.chatbot_sessions` (00000_master_schema.sql:1872)
- `comms.comms_threads` (00000_master_schema.sql:1815)
- `comms.email_messages` (00000_master_schema.sql:1827)
- `comms.help_articles` (00000_master_schema.sql:1905)
- `comms.notification_deliveries` (00011_enterprise_expansion_30_more_tables.sql:634)
- `comms.notifications` (00000_master_schema.sql:1800)
- `comms.portal_sessions` (00010_enterprise_expansion_30_tables.sql:608)
- `comms.portal_users` (00000_master_schema.sql:1762)
- `comms.sms_messages` (00000_master_schema.sql:1846)
- `comms.support_sla_tracking` (00011_enterprise_expansion_30_more_tables.sql:659)
- `comms.support_tickets` (00000_master_schema.sql:1886)
- `comms.whatsapp_messages` (00000_master_schema.sql:1859)
- `compliance.policies` (00027_enterprise_30_tables.sql:191)
- `compliance.policy_acknowledgements` (00027_enterprise_30_tables.sql:210)
- `crm.lead_activities` (00027_enterprise_30_tables.sql:50)
- `crm.leads` (00027_enterprise_30_tables.sql:26)
- `crm.opportunities` (00027_enterprise_30_tables.sql:69)
- `docs.attachments` (00000_master_schema.sql:1723)
- `docs.document_classifications` (00000_master_schema.sql:1702)
- `docs.document_signature_requests` (00010_enterprise_expansion_30_tables.sql:559)
- `docs.document_versions` (00010_enterprise_expansion_30_tables.sql:589)
- `docs.documents` (00000_master_schema.sql:1679)
- `docs.ocr_results` (00000_master_schema.sql:1712)
- `docs.print_jobs` (00000_master_schema.sql:1732)
- `docs.scan_sessions` (00000_master_schema.sql:1746)
- `documents.classification_runs` (00027_enterprise_30_tables.sql:475)
- `documents.document_chunks` (00027_enterprise_30_tables.sql:516)
- `documents.document_relations` (00027_enterprise_30_tables.sql:551)
- `documents.entity_extractions` (00027_enterprise_30_tables.sql:533)
- `documents.extraction_runs` (00027_enterprise_30_tables.sql:496)
- `documents.knowledge_cards` (00027_enterprise_30_tables.sql:566)
- `documents.ocr_runs` (00027_enterprise_30_tables.sql:455)
- `execution.alerts` (00000_master_schema.sql:986)
- `execution.delivery_events` (00000_master_schema.sql:950)
- `execution.installation_events` (00000_master_schema.sql:962)
- `execution.logistics_orders` (00000_master_schema.sql:933)
- `execution.project_blockers` (00010_enterprise_expansion_30_tables.sql:122)
- `execution.project_cost_plans` (00011_enterprise_expansion_30_more_tables.sql:253)
- `execution.project_milestones` (00000_master_schema.sql:853)
- `execution.project_phases` (00000_master_schema.sql:836)
- `execution.project_risks` (00010_enterprise_expansion_30_tables.sql:85)
- `execution.projects` (00000_master_schema.sql:802)
- `execution.signatures` (00000_master_schema.sql:972)
- `execution.task_attachments` (00010_enterprise_expansion_30_tables.sql:179)
- `execution.task_comments` (00010_enterprise_expansion_30_tables.sql:156)
- `execution.task_dependencies` (00000_master_schema.sql:924)
- `execution.tasks` (00000_master_schema.sql:905)
- `execution.work_order_qa_checklists` (00011_enterprise_expansion_30_more_tables.sql:277)
- `execution.work_order_qa_items` (00011_enterprise_expansion_30_more_tables.sql:299)
- `execution.work_order_tasks` (00000_master_schema.sql:891)
- `execution.work_orders` (00000_master_schema.sql:866)
- `finance.annual_tax_reports` (00000_master_schema.sql:1662)
- `finance.bank_files` (00000_master_schema.sql:1537)
- `finance.bank_matches` (00000_master_schema.sql:1550)
- `finance.budget_entries` (00000_master_schema.sql:1579)
- `finance.cashflow_entries` (00000_master_schema.sql:1564)
- `finance.collection_actions` (00011_enterprise_expansion_30_more_tables.sql:362)
- `finance.collection_cases` (00000_master_schema.sql:1626)
- `finance.consolidation_entries` (00000_master_schema.sql:1617)
- `finance.costing_entries` (00000_master_schema.sql:1591)
- `finance.dunning_campaigns` (00011_enterprise_expansion_30_more_tables.sql:322)
- `finance.dunning_steps` (00011_enterprise_expansion_30_more_tables.sql:341)
- `finance.expenses` (00000_master_schema.sql:1643)
- `finance.fx_rates` (00000_master_schema.sql:1607)
- `finance.gl_transactions` (00000_master_schema.sql:1483)
- `finance.invoice_lines` (00000_master_schema.sql:1429)
- `finance.invoices` (00000_master_schema.sql:1401)
- `finance.payment_allocations` (00010_enterprise_expansion_30_tables.sql:488)
- `finance.payments` (00000_master_schema.sql:1461)
- `finance.receipts` (00000_master_schema.sql:1448)
- `finance.reconciliation_exceptions` (00010_enterprise_expansion_30_tables.sql:459)
- `finance.reminder_schedules` (00011_enterprise_expansion_30_more_tables.sql:381)
- `finance.tax_exports` (00000_master_schema.sql:1523)
- `finance.tax_records` (00000_master_schema.sql:1512)
- `finance.vat_records` (00000_master_schema.sql:1499)
- `governance.alert_subscriptions` (00010_enterprise_expansion_30_tables.sql:654)
- `governance.audit_log_attachments` (00010_enterprise_expansion_30_tables.sql:727)
- `governance.audit_logs` (00000_master_schema.sql:133)
- `governance.command_logs` (00011_enterprise_expansion_30_more_tables.sql:583)
- `governance.config_entries` (00000_master_schema.sql:303)
- `governance.domain_events` (00000_master_schema.sql:172)
- `governance.escalation_rules` (00010_enterprise_expansion_30_tables.sql:631)
- `governance.event_deliveries` (00000_master_schema.sql:212)
- `governance.event_subscriptions` (00000_master_schema.sql:200)
- `governance.feature_flag_targets` (00010_enterprise_expansion_30_tables.sql:304)
- `governance.feature_flags` (00000_master_schema.sql:293)
- `governance.health_checks` (00000_master_schema.sql:329)
- `governance.idempotency_keys` (00008_idempotency_table.sql:9)
- `governance.integration_connections` (00010_enterprise_expansion_30_tables.sql:253)
- `governance.integration_sync_logs` (00010_enterprise_expansion_30_tables.sql:279)
- `governance.job_executions` (00010_enterprise_expansion_30_tables.sql:707)
- `governance.object_permissions` (00000_master_schema.sql:114)
- `governance.permissions` (00000_master_schema.sql:82)
- `governance.queue_jobs` (00000_master_schema.sql:312)
- `governance.role_permissions` (00000_master_schema.sql:95)
- `governance.roles` (00000_master_schema.sql:71)
- `governance.saved_filters` (00010_enterprise_expansion_30_tables.sql:347)
- `governance.security_events` (00011_enterprise_expansion_30_more_tables.sql:609)
- `governance.sla_timers` (00010_enterprise_expansion_30_tables.sql:678)
- `governance.state_history` (00000_master_schema.sql:156)
- `governance.user_preferences` (00010_enterprise_expansion_30_tables.sql:324)
- `governance.user_roles` (00000_master_schema.sql:104)
- `governance.users_profile` (00000_master_schema.sql:55)
- `governance.validations_log` (00000_master_schema.sql:280)
- `governance.webhook_deliveries` (00010_enterprise_expansion_30_tables.sql:223)
- `governance.webhook_endpoints` (00010_enterprise_expansion_30_tables.sql:198)
- `governance.workflow_instances` (00000_master_schema.sql:239)
- `governance.workflow_step_executions` (00000_master_schema.sql:269)
- `governance.workflow_steps` (00000_master_schema.sql:256)
- `governance.workflows` (00000_master_schema.sql:228)
- `intelligence.agent_jobs` (00023_ai_agent_registry_and_views.sql:19)
- `intelligence.agent_registry` (00023_ai_agent_registry_and_views.sql:8)
- `intelligence.ai_insights` (00000_master_schema.sql:1922)
- `intelligence.anomaly_cases` (00000_master_schema.sql:1940)
- `intelligence.anomaly_feedback` (00010_enterprise_expansion_30_tables.sql:743)
- `intelligence.decision_recommendations` (00000_master_schema.sql:2006)
- `intelligence.forecast_models` (00000_master_schema.sql:1957)
- `intelligence.model_executions` (00011_enterprise_expansion_30_more_tables.sql:524)
- `intelligence.model_registry` (00011_enterprise_expansion_30_more_tables.sql:501)
- `intelligence.quality_scores` (00000_master_schema.sql:1974)
- `intelligence.recommendation_feedback` (00011_enterprise_expansion_30_more_tables.sql:546)
- `intelligence.seasonality_patterns` (00000_master_schema.sql:1996)
- `intelligence.trend_signals` (00000_master_schema.sql:1985)
- `inventory.barcode_scans` (00000_master_schema.sql:1186)
- `inventory.inventory` (00000_master_schema.sql:1055)
- `inventory.inventory_issues` (00000_master_schema.sql:1088)
- `inventory.inventory_movements` (00011_enterprise_expansion_30_more_tables.sql:188)
- `inventory.inventory_receipts` (00000_master_schema.sql:1070)
- `inventory.inventory_reservations` (00000_master_schema.sql:1120)
- `inventory.inventory_transfers` (00000_master_schema.sql:1105)
- `inventory.manufacturing_batches` (00000_master_schema.sql:1198)
- `inventory.material_categories` (00000_master_schema.sql:1010)
- `inventory.material_lots` (00011_enterprise_expansion_30_more_tables.sql:160)
- `inventory.material_request_lines` (00000_master_schema.sql:1173)
- `inventory.material_requests` (00000_master_schema.sql:1159)
- `inventory.materials` (00000_master_schema.sql:1020)
- `inventory.reorder_rules` (00011_enterprise_expansion_30_more_tables.sql:212)
- `inventory.shortage_snapshots` (00011_enterprise_expansion_30_more_tables.sql:234)
- `inventory.stock_count_lines` (00000_master_schema.sql:1148)
- `inventory.stock_counts` (00000_master_schema.sql:1135)
- `inventory.warehouses` (00000_master_schema.sql:1040)
- `maintenance.assets` (00027_enterprise_30_tables.sql:328)
- `maintenance.work_orders` (00027_enterprise_30_tables.sql:348)
- `orchestration.job_queue` (00024_orchestration_tables.sql:73)
- `orchestration.notifications` (00024_orchestration_tables.sql:111)
- `orchestration.universal_inbox` (00024_orchestration_tables.sql:94)
- `orchestration.workflow_definitions` (00024_orchestration_tables.sql:10)
- `orchestration.workflow_runs` (00024_orchestration_tables.sql:38)
- `orchestration.workflow_step_runs` (00024_orchestration_tables.sql:54)
- `orchestration.workflow_steps` (00024_orchestration_tables.sql:22)
- `planning.capacity_calendars` (00027_enterprise_30_tables.sql:277)
- `planning.capacity_slots` (00027_enterprise_30_tables.sql:294)
- `planning.demand_forecasts` (00027_enterprise_30_tables.sql:309)
- `pricing.calculations` (00027_enterprise_30_tables.sql:386)
- `pricing.rule_sets` (00027_enterprise_30_tables.sql:369)
- `procurement.approval_steps` (00011_enterprise_expansion_30_more_tables.sql:88)
- `procurement.approvals` (00000_master_schema.sql:659)
- `procurement.contract_milestones` (00011_enterprise_expansion_30_more_tables.sql:137)
- `procurement.contracts` (00000_master_schema.sql:677)
- `procurement.purchase_order_lines` (00000_master_schema.sql:725)
- `procurement.purchase_orders` (00000_master_schema.sql:697)
- `procurement.returns` (00000_master_schema.sql:767)
- `procurement.rfq_comparison_snapshots` (00010_enterprise_expansion_30_tables.sql:439)
- `procurement.rfq_items` (00000_master_schema.sql:591)
- `procurement.rfq_supplier_invites` (00000_master_schema.sql:607)
- `procurement.rfqs` (00000_master_schema.sql:572)
- `procurement.supplier_contacts` (00010_enterprise_expansion_30_tables.sql:48)
- `procurement.supplier_invoices` (00000_master_schema.sql:748)
- `procurement.supplier_portal_accounts` (00000_master_schema.sql:1790)
- `procurement.supplier_quote_lines` (00000_master_schema.sql:640)
- `procurement.supplier_quotes` (00000_master_schema.sql:618)
- `procurement.supplier_scorecards` (00011_enterprise_expansion_30_more_tables.sql:114)
- `procurement.suppliers` (00000_master_schema.sql:537)
- `procurement.warranty_cases` (00000_master_schema.sql:781)
- `public.app_menu` (00017_app_menu.sql:6)
- `public.customers` (20260417000000_initial_schema.sql:21)
- `public.employees` (20260417000000_initial_schema.sql:85)
- `public.inventory_items` (20260417000000_initial_schema.sql:52)
- `public.orders` (20260417000000_initial_schema.sql:69)
- `public.properties` (20260417000000_initial_schema.sql:99)
- `public.suppliers` (20260417000000_initial_schema.sql:38)
- `public.user_profiles` (20260417000000_initial_schema.sql:8)
- `quality.defects` (00027_enterprise_30_tables.sql:169)
- `quality.inspection_plans` (00027_enterprise_30_tables.sql:130)
- `quality.inspection_runs` (00027_enterprise_30_tables.sql:148)
- `routing.menu_nodes` (00027_enterprise_30_tables.sql:425)
- `routing.route_permission_map` (00027_enterprise_30_tables.sql:443)
- `routing.route_registry` (00027_enterprise_30_tables.sql:406)
- `service.ticket_comments` (00027_enterprise_30_tables.sql:115)
- `service.tickets` (00027_enterprise_30_tables.sql:90)
- `treasury.bank_accounts` (00027_enterprise_30_tables.sql:224)
- `treasury.cash_forecasts` (00027_enterprise_30_tables.sql:259)
- `treasury.cash_positions` (00027_enterprise_30_tables.sql:243)
- `workforce.attendance` (00000_master_schema.sql:1283)
- `workforce.employee_expenses` (00000_master_schema.sql:1366)
- `workforce.employee_pay_components` (00011_enterprise_expansion_30_more_tables.sql:429)
- `workforce.employees` (00000_master_schema.sql:1229)
- `workforce.employers` (00000_master_schema.sql:1216)
- `workforce.hr_profiles` (00000_master_schema.sql:1254)
- `workforce.leave_requests` (00011_enterprise_expansion_30_more_tables.sql:473)
- `workforce.leave_types` (00011_enterprise_expansion_30_more_tables.sql:454)
- `workforce.pay_components` (00011_enterprise_expansion_30_more_tables.sql:407)
- `workforce.payroll_entries` (00000_master_schema.sql:1323)
- `workforce.payroll_exceptions` (00010_enterprise_expansion_30_tables.sql:529)
- `workforce.payroll_export_batches` (00010_enterprise_expansion_30_tables.sql:506)
- `workforce.payroll_runs` (00000_master_schema.sql:1305)
- `workforce.pension_records` (00000_master_schema.sql:1354)
- `workforce.shifts` (00000_master_schema.sql:1384)
- `workforce.wage_slips` (00000_master_schema.sql:1340)
- `workforce.workforce_assignments` (00000_master_schema.sql:1269)

## C. LIST OF ALL RELATIONSHIPS FOUND

All 346 unique FK relationships from migrations:

- `governance.role_permissions.role_id` → `governance.roles.id` (00000_master_schema.sql:97)
- `governance.role_permissions.permission_id` → `governance.permissions.id` (00000_master_schema.sql:98)
- `governance.role_permissions.granted_by` → `governance.users_profile.id` (00000_master_schema.sql:100)
- `governance.user_roles.user_id` → `governance.users_profile.id` (00000_master_schema.sql:106)
- `governance.user_roles.role_id` → `governance.roles.id` (00000_master_schema.sql:107)
- `governance.object_permissions.granted_by` → `governance.users_profile.id` (00000_master_schema.sql:123)
- `governance.audit_logs.performed_by_user_id` → `governance.users_profile.id` (00000_master_schema.sql:141)
- `governance.state_history.changed_by_user_id` → `governance.users_profile.id` (00000_master_schema.sql:163)
- `governance.event_deliveries.domain_event_id` → `governance.domain_events.id` (00000_master_schema.sql:214)
- `governance.event_deliveries.subscription_id` → `governance.event_subscriptions.id` (00000_master_schema.sql:215)
- `governance.workflow_instances.workflow_id` → `governance.workflows.id` (00000_master_schema.sql:242)
- `governance.workflow_steps.workflow_id` → `governance.workflows.id` (00000_master_schema.sql:258)
- `governance.workflow_step_executions.workflow_instance_id` → `governance.workflow_instances.id` (00000_master_schema.sql:271)
- `governance.workflow_step_executions.workflow_step_id` → `governance.workflow_steps.id` (00000_master_schema.sql:272)
- `governance.workflow_step_executions.executed_by_user_id` → `governance.users_profile.id` (00000_master_schema.sql:274)
- `commercial.customers.account_manager_user_id` → `governance.users_profile.id` (00000_master_schema.sql:378)
- `commercial.leads.pipeline_stage_id` → `commercial.pipeline_stages.id` (00000_master_schema.sql:415)
- `commercial.leads.assigned_user_id` → `governance.users_profile.id` (00000_master_schema.sql:416)
- `commercial.leads.customer_id` → `commercial.customers.id` (00000_master_schema.sql:417)
- `commercial.crm_activities.performed_by_user_id` → `governance.users_profile.id` (00000_master_schema.sql:440)
- `commercial.opportunities.lead_id` → `commercial.leads.id` (00000_master_schema.sql:453)
- `commercial.opportunities.customer_id` → `commercial.customers.id` (00000_master_schema.sql:454)
- `commercial.opportunities.owner_user_id` → `governance.users_profile.id` (00000_master_schema.sql:462)
- `commercial.quotes.customer_id` → `commercial.customers.id` (00000_master_schema.sql:471)
- `commercial.quotes.lead_id` → `commercial.leads.id` (00000_master_schema.sql:472)
- `commercial.quotes.opportunity_id` → `commercial.opportunities.id` (00000_master_schema.sql:473)
- `commercial.quotes.created_by` → `governance.users_profile.id` (00000_master_schema.sql:490)
- `commercial.quote_lines.quote_id` → `commercial.quotes.id` (00000_master_schema.sql:496)
- `commercial.pricing_snapshots.quote_id` → `commercial.quotes.id` (00000_master_schema.sql:519)
- `commercial.pricing_snapshots.created_by` → `governance.users_profile.id` (00000_master_schema.sql:525)
- `procurement.suppliers.created_by` → `governance.users_profile.id` (00000_master_schema.sql:567)
- `procurement.rfqs.winning_supplier_id` → `procurement.suppliers.id` (00000_master_schema.sql:583)
- `procurement.rfqs.created_by` → `governance.users_profile.id` (00000_master_schema.sql:587)
- `procurement.rfq_items.rfq_id` → `procurement.rfqs.id` (00000_master_schema.sql:593)
- `procurement.rfq_supplier_invites.rfq_id` → `procurement.rfqs.id` (00000_master_schema.sql:609)
- `procurement.rfq_supplier_invites.supplier_id` → `procurement.suppliers.id` (00000_master_schema.sql:610)
- `procurement.supplier_quotes.rfq_id` → `procurement.rfqs.id` (00000_master_schema.sql:621)
- `procurement.supplier_quotes.supplier_id` → `procurement.suppliers.id` (00000_master_schema.sql:622)
- `procurement.supplier_quote_lines.supplier_quote_id` → `procurement.supplier_quotes.id` (00000_master_schema.sql:642)
- `procurement.supplier_quote_lines.rfq_item_id` → `procurement.rfq_items.id` (00000_master_schema.sql:643)
- `procurement.approvals.requested_by_user_id` → `governance.users_profile.id` (00000_master_schema.sql:665)
- `procurement.contracts.customer_id` → `commercial.customers.id` (00000_master_schema.sql:682)
- `procurement.contracts.supplier_id` → `procurement.suppliers.id` (00000_master_schema.sql:683)
- `procurement.contracts.quote_id` → `commercial.quotes.id` (00000_master_schema.sql:684)
- `procurement.purchase_orders.supplier_id` → `procurement.suppliers.id` (00000_master_schema.sql:701)
- `procurement.purchase_orders.rfq_id` → `procurement.rfqs.id` (00000_master_schema.sql:703)
- `procurement.purchase_orders.contract_id` → `procurement.contracts.id` (00000_master_schema.sql:704)
- `procurement.purchase_orders.created_by` → `governance.users_profile.id` (00000_master_schema.sql:721)
- `procurement.purchase_order_lines.po_id` → `procurement.purchase_orders.id` (00000_master_schema.sql:727)
- `procurement.purchase_order_lines.supplier_quote_line_id` → `procurement.supplier_quote_lines.id` (00000_master_schema.sql:730)
- `procurement.supplier_invoices.supplier_id` → `procurement.suppliers.id` (00000_master_schema.sql:752)
- `procurement.supplier_invoices.po_id` → `procurement.purchase_orders.id` (00000_master_schema.sql:753)
- `procurement.returns.supplier_id` → `procurement.suppliers.id` (00000_master_schema.sql:771)
- `procurement.returns.po_id` → `procurement.purchase_orders.id` (00000_master_schema.sql:772)
- `procurement.warranty_cases.supplier_id` → `procurement.suppliers.id` (00000_master_schema.sql:785)
- `procurement.warranty_cases.customer_id` → `commercial.customers.id` (00000_master_schema.sql:786)
- `procurement.warranty_cases.po_id` → `procurement.purchase_orders.id` (00000_master_schema.sql:787)
- `execution.projects.customer_id` → `commercial.customers.id` (00000_master_schema.sql:807)
- `execution.projects.quote_id` → `commercial.quotes.id` (00000_master_schema.sql:808)
- `execution.projects.contract_id` → `procurement.contracts.id` (00000_master_schema.sql:809)
- `execution.projects.owner_user_id` → `governance.users_profile.id` (00000_master_schema.sql:815)
- `execution.project_phases.project_id` → `execution.projects.id` (00000_master_schema.sql:838)
- `execution.project_milestones.project_id` → `execution.projects.id` (00000_master_schema.sql:855)
- `execution.project_milestones.phase_id` → `execution.project_phases.id` (00000_master_schema.sql:856)
- `execution.work_orders.project_id` → `execution.projects.id` (00000_master_schema.sql:870)
- `execution.work_orders.owner_user_id` → `governance.users_profile.id` (00000_master_schema.sql:882)
- `execution.work_order_tasks.work_order_id` → `execution.work_orders.id` (00000_master_schema.sql:893)
- `execution.work_order_tasks.assignee_user_id` → `governance.users_profile.id` (00000_master_schema.sql:897)
- `execution.tasks.assignee_user_id` → `governance.users_profile.id` (00000_master_schema.sql:913)
- `execution.task_dependencies.predecessor_task_id` → `execution.tasks.id` (00000_master_schema.sql:926)
- `execution.logistics_orders.project_id` → `execution.projects.id` (00000_master_schema.sql:937)
- `execution.logistics_orders.work_order_id` → `execution.work_orders.id` (00000_master_schema.sql:938)
- `execution.delivery_events.project_id` → `execution.projects.id` (00000_master_schema.sql:952)
- `execution.delivery_events.work_order_id` → `execution.work_orders.id` (00000_master_schema.sql:953)
- `execution.delivery_events.logistics_order_id` → `execution.logistics_orders.id` (00000_master_schema.sql:954)
- `execution.delivery_events.delivered_by_user_id` → `governance.users_profile.id` (00000_master_schema.sql:956)
- `execution.installation_events.project_id` → `execution.projects.id` (00000_master_schema.sql:964)
- `execution.installation_events.work_order_id` → `execution.work_orders.id` (00000_master_schema.sql:965)
- `execution.installation_events.installed_by_user_id` → `governance.users_profile.id` (00000_master_schema.sql:967)
- `execution.alerts.assigned_to_user_id` → `governance.users_profile.id` (00000_master_schema.sql:996)
- `inventory.material_categories.parent_category_id` → `inventory.material_categories.id` (00000_master_schema.sql:1014)
- `inventory.materials.category_id` → `inventory.material_categories.id` (00000_master_schema.sql:1026)
- `inventory.materials.preferred_supplier_id` → `procurement.suppliers.id` (00000_master_schema.sql:1028)
- `inventory.materials.created_by` → `governance.users_profile.id` (00000_master_schema.sql:1036)
- `inventory.warehouses.manager_user_id` → `governance.users_profile.id` (00000_master_schema.sql:1048)
- `inventory.inventory.material_id` → `inventory.materials.id` (00000_master_schema.sql:1057)
- `inventory.inventory.warehouse_id` → `inventory.warehouses.id` (00000_master_schema.sql:1058)
- `inventory.inventory_receipts.po_id` → `procurement.purchase_orders.id` (00000_master_schema.sql:1074)
- `inventory.inventory_receipts.po_line_id` → `procurement.purchase_order_lines.id` (00000_master_schema.sql:1075)
- `inventory.inventory_receipts.material_id` → `inventory.materials.id` (00000_master_schema.sql:1076)
- `inventory.inventory_receipts.warehouse_id` → `inventory.warehouses.id` (00000_master_schema.sql:1077)
- `inventory.inventory_receipts.received_by_user_id` → `governance.users_profile.id` (00000_master_schema.sql:1082)
- `inventory.inventory_issues.project_id` → `execution.projects.id` (00000_master_schema.sql:1092)
- `inventory.inventory_issues.work_order_id` → `execution.work_orders.id` (00000_master_schema.sql:1093)
- `inventory.inventory_issues.material_id` → `inventory.materials.id` (00000_master_schema.sql:1094)
- `inventory.inventory_issues.warehouse_id` → `inventory.warehouses.id` (00000_master_schema.sql:1095)
- `inventory.inventory_issues.issued_by_user_id` → `governance.users_profile.id` (00000_master_schema.sql:1098)
- `inventory.inventory_transfers.material_id` → `inventory.materials.id` (00000_master_schema.sql:1109)
- `inventory.inventory_transfers.from_warehouse_id` → `inventory.warehouses.id` (00000_master_schema.sql:1110)
- `inventory.inventory_transfers.transferred_by_user_id` → `governance.users_profile.id` (00000_master_schema.sql:1114)
- `inventory.inventory_reservations.material_id` → `inventory.materials.id` (00000_master_schema.sql:1122)
- `inventory.inventory_reservations.warehouse_id` → `inventory.warehouses.id` (00000_master_schema.sql:1123)
- `inventory.inventory_reservations.project_id` → `execution.projects.id` (00000_master_schema.sql:1124)
- `inventory.inventory_reservations.work_order_id` → `execution.work_orders.id` (00000_master_schema.sql:1125)
- `inventory.inventory_reservations.reserved_by_user_id` → `governance.users_profile.id` (00000_master_schema.sql:1128)
- `inventory.stock_counts.warehouse_id` → `inventory.warehouses.id` (00000_master_schema.sql:1139)
- `inventory.stock_counts.counted_by_user_id` → `governance.users_profile.id` (00000_master_schema.sql:1141)
- `inventory.stock_count_lines.stock_count_id` → `inventory.stock_counts.id` (00000_master_schema.sql:1150)
- `inventory.stock_count_lines.material_id` → `inventory.materials.id` (00000_master_schema.sql:1151)
- `inventory.material_requests.project_id` → `execution.projects.id` (00000_master_schema.sql:1163)
- `inventory.material_requests.work_order_id` → `execution.work_orders.id` (00000_master_schema.sql:1164)
- `inventory.material_requests.requested_by_user_id` → `governance.users_profile.id` (00000_master_schema.sql:1165)
- `inventory.material_request_lines.material_request_id` → `inventory.material_requests.id` (00000_master_schema.sql:1175)
- `inventory.material_request_lines.material_id` → `inventory.materials.id` (00000_master_schema.sql:1176)
- `inventory.barcode_scans.material_id` → `inventory.materials.id` (00000_master_schema.sql:1189)
- `inventory.barcode_scans.warehouse_id` → `inventory.warehouses.id` (00000_master_schema.sql:1190)
- `inventory.barcode_scans.scanned_by_user_id` → `governance.users_profile.id` (00000_master_schema.sql:1193)
- `inventory.manufacturing_batches.project_id` → `execution.projects.id` (00000_master_schema.sql:1202)
- `inventory.manufacturing_batches.work_order_id` → `execution.work_orders.id` (00000_master_schema.sql:1203)
- `workforce.employees.employer_id` → `workforce.employers.id` (00000_master_schema.sql:1236)
- `workforce.employees.created_by` → `governance.users_profile.id` (00000_master_schema.sql:1249)
- `workforce.hr_profiles.employee_id` → `workforce.employees.id` (00000_master_schema.sql:1256)
- `workforce.workforce_assignments.employee_id` → `workforce.employees.id` (00000_master_schema.sql:1271)
- `workforce.workforce_assignments.project_id` → `execution.projects.id` (00000_master_schema.sql:1272)
- `workforce.workforce_assignments.work_order_id` → `execution.work_orders.id` (00000_master_schema.sql:1273)
- `workforce.workforce_assignments.assigned_by_user_id` → `governance.users_profile.id` (00000_master_schema.sql:1278)
- `workforce.attendance.employee_id` → `workforce.employees.id` (00000_master_schema.sql:1287)
- `workforce.attendance.project_id` → `execution.projects.id` (00000_master_schema.sql:1288)
- `workforce.attendance.work_order_id` → `execution.work_orders.id` (00000_master_schema.sql:1289)
- `workforce.attendance.approved_by_user_id` → `governance.users_profile.id` (00000_master_schema.sql:1298)
- `workforce.payroll_runs.employer_id` → `workforce.employers.id` (00000_master_schema.sql:1311)
- `workforce.payroll_runs.created_by` → `governance.users_profile.id` (00000_master_schema.sql:1317)
- `workforce.payroll_entries.payroll_run_id` → `workforce.payroll_runs.id` (00000_master_schema.sql:1325)
- `workforce.payroll_entries.employee_id` → `workforce.employees.id` (00000_master_schema.sql:1326)
- `workforce.wage_slips.payroll_entry_id` → `workforce.payroll_entries.id` (00000_master_schema.sql:1343)
- `workforce.wage_slips.employee_id` → `workforce.employees.id` (00000_master_schema.sql:1344)
- `workforce.pension_records.payroll_entry_id` → `workforce.payroll_entries.id` (00000_master_schema.sql:1356)
- `workforce.pension_records.employee_id` → `workforce.employees.id` (00000_master_schema.sql:1357)
- `workforce.employee_expenses.employee_id` → `workforce.employees.id` (00000_master_schema.sql:1370)
- `workforce.employee_expenses.project_id` → `execution.projects.id` (00000_master_schema.sql:1371)
- `workforce.shifts.employee_id` → `workforce.employees.id` (00000_master_schema.sql:1386)
- `workforce.shifts.project_id` → `execution.projects.id` (00000_master_schema.sql:1387)
- `workforce.shifts.work_order_id` → `execution.work_orders.id` (00000_master_schema.sql:1388)
- `finance.invoices.customer_id` → `commercial.customers.id` (00000_master_schema.sql:1406)
- `finance.invoices.supplier_id` → `procurement.suppliers.id` (00000_master_schema.sql:1407)
- `finance.invoices.project_id` → `execution.projects.id` (00000_master_schema.sql:1408)
- `finance.invoices.po_id` → `procurement.purchase_orders.id` (00000_master_schema.sql:1409)
- `finance.invoices.created_by` → `governance.users_profile.id` (00000_master_schema.sql:1425)
- `finance.invoice_lines.invoice_id` → `finance.invoices.id` (00000_master_schema.sql:1431)
- `finance.receipts.customer_id` → `commercial.customers.id` (00000_master_schema.sql:1452)
- `finance.payments.invoice_id` → `finance.invoices.id` (00000_master_schema.sql:1465)
- `finance.payments.customer_id` → `commercial.customers.id` (00000_master_schema.sql:1466)
- `finance.payments.supplier_id` → `procurement.suppliers.id` (00000_master_schema.sql:1467)
- `finance.payments.created_by` → `governance.users_profile.id` (00000_master_schema.sql:1479)
- `finance.gl_transactions.created_by` → `governance.users_profile.id` (00000_master_schema.sql:1496)
- `finance.vat_records.invoice_id` → `finance.invoices.id` (00000_master_schema.sql:1501)
- `finance.tax_records.invoice_id` → `finance.invoices.id` (00000_master_schema.sql:1514)
- `finance.tax_exports.exported_by_user_id` → `governance.users_profile.id` (00000_master_schema.sql:1531)
- `finance.bank_files.imported_by_user_id` → `governance.users_profile.id` (00000_master_schema.sql:1543)
- `finance.bank_matches.payment_id` → `finance.payments.id` (00000_master_schema.sql:1552)
- `finance.bank_matches.bank_file_id` → `finance.bank_files.id` (00000_master_schema.sql:1553)
- `finance.bank_matches.matched_by_user_id` → `governance.users_profile.id` (00000_master_schema.sql:1557)
- `finance.budget_entries.project_id` → `execution.projects.id` (00000_master_schema.sql:1581)
- `finance.costing_entries.project_id` → `execution.projects.id` (00000_master_schema.sql:1593)
- `finance.costing_entries.work_order_id` → `execution.work_orders.id` (00000_master_schema.sql:1594)
- `finance.costing_entries.material_id` → `inventory.materials.id` (00000_master_schema.sql:1595)
- `finance.costing_entries.employee_id` → `workforce.employees.id` (00000_master_schema.sql:1596)
- `finance.collection_cases.invoice_id` → `finance.invoices.id` (00000_master_schema.sql:1630)
- `finance.collection_cases.customer_id` → `commercial.customers.id` (00000_master_schema.sql:1631)
- `finance.collection_cases.assigned_to_user_id` → `governance.users_profile.id` (00000_master_schema.sql:1633)
- `finance.expenses.supplier_id` → `procurement.suppliers.id` (00000_master_schema.sql:1648)
- `finance.expenses.employee_id` → `workforce.employees.id` (00000_master_schema.sql:1649)
- `finance.expenses.project_id` → `execution.projects.id` (00000_master_schema.sql:1650)
- `docs.documents.uploaded_by_user_id` → `governance.users_profile.id` (00000_master_schema.sql:1696)
- `docs.document_classifications.document_id` → `docs.documents.id` (00000_master_schema.sql:1704)
- `docs.ocr_results.document_id` → `docs.documents.id` (00000_master_schema.sql:1714)
- `docs.attachments.document_id` → `docs.documents.id` (00000_master_schema.sql:1725)
- `docs.attachments.attached_by_user_id` → `governance.users_profile.id` (00000_master_schema.sql:1729)
- `docs.print_jobs.document_id` → `docs.documents.id` (00000_master_schema.sql:1735)
- `docs.print_jobs.requested_by_user_id` → `governance.users_profile.id` (00000_master_schema.sql:1740)
- `docs.scan_sessions.initiated_by_user_id` → `governance.users_profile.id` (00000_master_schema.sql:1751)
- `comms.portal_users.customer_id` → `commercial.customers.id` (00000_master_schema.sql:1770)
- `comms.portal_users.supplier_id` → `procurement.suppliers.id` (00000_master_schema.sql:1771)
- `commercial.customer_portal_accounts.customer_id` → `commercial.customers.id` (00000_master_schema.sql:1782)
- `commercial.customer_portal_accounts.portal_user_id` → `comms.portal_users.id` (00000_master_schema.sql:1783)
- `procurement.supplier_portal_accounts.supplier_id` → `procurement.suppliers.id` (00000_master_schema.sql:1792)
- `procurement.supplier_portal_accounts.portal_user_id` → `comms.portal_users.id` (00000_master_schema.sql:1793)
- `comms.notifications.user_id` → `governance.users_profile.id` (00000_master_schema.sql:1803)
- `comms.notifications.portal_user_id` → `comms.portal_users.id` (00000_master_schema.sql:1804)
- `comms.email_messages.thread_id` → `comms.comms_threads.id` (00000_master_schema.sql:1830)
- `comms.sms_messages.thread_id` → `comms.comms_threads.id` (00000_master_schema.sql:1848)
- `comms.whatsapp_messages.thread_id` → `comms.comms_threads.id` (00000_master_schema.sql:1861)
- `comms.chatbot_sessions.user_id` → `governance.users_profile.id` (00000_master_schema.sql:1875)
- `comms.chatbot_sessions.portal_user_id` → `comms.portal_users.id` (00000_master_schema.sql:1876)
- `comms.support_tickets.customer_id` → `commercial.customers.id` (00000_master_schema.sql:1890)
- `comms.support_tickets.supplier_id` → `procurement.suppliers.id` (00000_master_schema.sql:1891)
- `comms.support_tickets.portal_user_id` → `comms.portal_users.id` (00000_master_schema.sql:1892)
- `comms.support_tickets.assigned_to_user_id` → `governance.users_profile.id` (00000_master_schema.sql:1896)
- `commercial.customer_contacts.customer_id` → `commercial.customers.id` (00010_enterprise_expansion_30_tables.sql:14)
- `commercial.customer_contacts.created_by` → `governance.users_profile.id` (00010_enterprise_expansion_30_tables.sql:30)
- `procurement.supplier_contacts.supplier_id` → `procurement.suppliers.id` (00010_enterprise_expansion_30_tables.sql:51)
- `procurement.supplier_contacts.created_by` → `governance.users_profile.id` (00010_enterprise_expansion_30_tables.sql:67)
- `execution.project_risks.project_id` → `execution.projects.id` (00010_enterprise_expansion_30_tables.sql:88)
- `execution.project_risks.owner_user_id` → `governance.users_profile.id` (00010_enterprise_expansion_30_tables.sql:97)
- `execution.project_blockers.project_id` → `execution.projects.id` (00010_enterprise_expansion_30_tables.sql:125)
- `execution.project_blockers.owner_user_id` → `governance.users_profile.id` (00010_enterprise_expansion_30_tables.sql:131)
- `execution.project_blockers.linked_alert_id` → `execution.alerts.id` (00010_enterprise_expansion_30_tables.sql:136)
- `execution.project_blockers.linked_risk_id` → `execution.project_risks.id` (00010_enterprise_expansion_30_tables.sql:137)
- `execution.task_comments.task_id` → `execution.tasks.id` (00010_enterprise_expansion_30_tables.sql:159)
- `execution.task_comments.author_user_id` → `governance.users_profile.id` (00010_enterprise_expansion_30_tables.sql:163)
- `execution.task_attachments.task_id` → `execution.tasks.id` (00010_enterprise_expansion_30_tables.sql:181)
- `execution.task_attachments.document_id` → `docs.documents.id` (00010_enterprise_expansion_30_tables.sql:182)
- `execution.task_attachments.attached_by_user_id` → `governance.users_profile.id` (00010_enterprise_expansion_30_tables.sql:184)
- `governance.webhook_endpoints.created_by` → `governance.users_profile.id` (00010_enterprise_expansion_30_tables.sql:211)
- `governance.webhook_deliveries.webhook_endpoint_id` → `governance.webhook_endpoints.id` (00010_enterprise_expansion_30_tables.sql:225)
- `governance.webhook_deliveries.domain_event_id` → `governance.domain_events.id` (00010_enterprise_expansion_30_tables.sql:226)
- `governance.integration_connections.created_by` → `governance.users_profile.id` (00010_enterprise_expansion_30_tables.sql:267)
- `governance.integration_sync_logs.integration_connection_id` → `governance.integration_connections.id` (00010_enterprise_expansion_30_tables.sql:281)
- `governance.feature_flag_targets.feature_flag_id` → `governance.feature_flags.id` (00010_enterprise_expansion_30_tables.sql:306)
- `governance.user_preferences.user_id` → `governance.users_profile.id` (00010_enterprise_expansion_30_tables.sql:326)
- `governance.saved_filters.user_id` → `governance.users_profile.id` (00010_enterprise_expansion_30_tables.sql:350)
- `analytics.dashboard_widgets.dashboard_definition_id` → `analytics.dashboard_definitions.id` (00010_enterprise_expansion_30_tables.sql:393)
- `procurement.rfq_comparison_snapshots.rfq_id` → `procurement.rfqs.id` (00010_enterprise_expansion_30_tables.sql:442)
- `procurement.rfq_comparison_snapshots.selected_supplier_id` → `procurement.suppliers.id` (00010_enterprise_expansion_30_tables.sql:445)
- `procurement.rfq_comparison_snapshots.created_by` → `governance.users_profile.id` (00010_enterprise_expansion_30_tables.sql:448)
- `finance.reconciliation_exceptions.bank_file_id` → `finance.bank_files.id` (00010_enterprise_expansion_30_tables.sql:463)
- `finance.reconciliation_exceptions.payment_id` → `finance.payments.id` (00010_enterprise_expansion_30_tables.sql:464)
- `finance.reconciliation_exceptions.owner_user_id` → `governance.users_profile.id` (00010_enterprise_expansion_30_tables.sql:471)
- `finance.payment_allocations.payment_id` → `finance.payments.id` (00010_enterprise_expansion_30_tables.sql:490)
- `finance.payment_allocations.invoice_id` → `finance.invoices.id` (00010_enterprise_expansion_30_tables.sql:491)
- `finance.payment_allocations.allocated_by_user_id` → `governance.users_profile.id` (00010_enterprise_expansion_30_tables.sql:494)
- `workforce.payroll_export_batches.payroll_run_id` → `workforce.payroll_runs.id` (00010_enterprise_expansion_30_tables.sql:510)
- `workforce.payroll_export_batches.exported_by_user_id` → `governance.users_profile.id` (00010_enterprise_expansion_30_tables.sql:516)
- `workforce.payroll_exceptions.payroll_run_id` → `workforce.payroll_runs.id` (00010_enterprise_expansion_30_tables.sql:532)
- `workforce.payroll_exceptions.employee_id` → `workforce.employees.id` (00010_enterprise_expansion_30_tables.sql:533)
- `workforce.payroll_exceptions.owner_user_id` → `governance.users_profile.id` (00010_enterprise_expansion_30_tables.sql:540)
- `docs.document_signature_requests.document_id` → `docs.documents.id` (00010_enterprise_expansion_30_tables.sql:562)
- `docs.document_signature_requests.created_by_user_id` → `governance.users_profile.id` (00010_enterprise_expansion_30_tables.sql:573)
- `docs.document_versions.document_id` → `docs.documents.id` (00010_enterprise_expansion_30_tables.sql:591)
- `docs.document_versions.uploaded_by_user_id` → `governance.users_profile.id` (00010_enterprise_expansion_30_tables.sql:595)
- `comms.portal_sessions.portal_user_id` → `comms.portal_users.id` (00010_enterprise_expansion_30_tables.sql:610)
- `governance.alert_subscriptions.user_id` → `governance.users_profile.id` (00010_enterprise_expansion_30_tables.sql:656)
- `governance.sla_timers.owner_user_id` → `governance.users_profile.id` (00010_enterprise_expansion_30_tables.sql:688)
- `governance.job_executions.queue_job_id` → `governance.queue_jobs.id` (00010_enterprise_expansion_30_tables.sql:709)
- `governance.audit_log_attachments.audit_log_id` → `governance.audit_logs.id` (00010_enterprise_expansion_30_tables.sql:729)
- `governance.audit_log_attachments.document_id` → `docs.documents.id` (00010_enterprise_expansion_30_tables.sql:730)
- `governance.audit_log_attachments.attached_by_user_id` → `governance.users_profile.id` (00010_enterprise_expansion_30_tables.sql:732)
- `intelligence.anomaly_feedback.anomaly_case_id` → `intelligence.anomaly_cases.id` (00010_enterprise_expansion_30_tables.sql:745)
- `intelligence.anomaly_feedback.provided_by_user_id` → `governance.users_profile.id` (00010_enterprise_expansion_30_tables.sql:749)
- `commercial.lead_tag_assignments.lead_id` → `commercial.leads.id` (00011_enterprise_expansion_30_more_tables.sql:32)
- `commercial.lead_tag_assignments.tag_id` → `commercial.lead_tags.id` (00011_enterprise_expansion_30_more_tables.sql:33)
- `commercial.lead_tag_assignments.assigned_by` → `governance.users_profile.id` (00011_enterprise_expansion_30_more_tables.sql:35)
- `commercial.quote_revisions.quote_id` → `commercial.quotes.id` (00011_enterprise_expansion_30_more_tables.sql:49)
- `commercial.quote_revisions.created_by` → `governance.users_profile.id` (00011_enterprise_expansion_30_more_tables.sql:53)
- `procurement.approval_steps.approval_id` → `procurement.approvals.id` (00011_enterprise_expansion_30_more_tables.sql:90)
- `procurement.approval_steps.assigned_approver_user_id` → `governance.users_profile.id` (00011_enterprise_expansion_30_more_tables.sql:93)
- `procurement.supplier_scorecards.supplier_id` → `procurement.suppliers.id` (00011_enterprise_expansion_30_more_tables.sql:117)
- `procurement.contract_milestones.contract_id` → `procurement.contracts.id` (00011_enterprise_expansion_30_more_tables.sql:139)
- `inventory.material_lots.material_id` → `inventory.materials.id` (00011_enterprise_expansion_30_more_tables.sql:163)
- `inventory.material_lots.warehouse_id` → `inventory.warehouses.id` (00011_enterprise_expansion_30_more_tables.sql:164)
- `inventory.inventory_movements.material_id` → `inventory.materials.id` (00011_enterprise_expansion_30_more_tables.sql:191)
- `inventory.inventory_movements.warehouse_id` → `inventory.warehouses.id` (00011_enterprise_expansion_30_more_tables.sql:192)
- `inventory.inventory_movements.lot_id` → `inventory.material_lots.id` (00011_enterprise_expansion_30_more_tables.sql:193)
- `inventory.inventory_movements.moved_by_user_id` → `governance.users_profile.id` (00011_enterprise_expansion_30_more_tables.sql:200)
- `inventory.reorder_rules.material_id` → `inventory.materials.id` (00011_enterprise_expansion_30_more_tables.sql:215)
- `inventory.reorder_rules.preferred_supplier_id` → `procurement.suppliers.id` (00011_enterprise_expansion_30_more_tables.sql:219)
- `inventory.shortage_snapshots.material_id` → `inventory.materials.id` (00011_enterprise_expansion_30_more_tables.sql:237)
- `inventory.shortage_snapshots.warehouse_id` → `inventory.warehouses.id` (00011_enterprise_expansion_30_more_tables.sql:238)
- `execution.project_cost_plans.project_id` → `execution.projects.id` (00011_enterprise_expansion_30_more_tables.sql:256)
- `execution.work_order_qa_checklists.work_order_id` → `execution.work_orders.id` (00011_enterprise_expansion_30_more_tables.sql:280)
- `execution.work_order_qa_checklists.completed_by_user_id` → `governance.users_profile.id` (00011_enterprise_expansion_30_more_tables.sql:285)
- `execution.work_order_qa_items.checklist_id` → `execution.work_order_qa_checklists.id` (00011_enterprise_expansion_30_more_tables.sql:301)
- `execution.work_order_qa_items.checked_by_user_id` → `governance.users_profile.id` (00011_enterprise_expansion_30_more_tables.sql:307)
- `finance.dunning_steps.dunning_campaign_id` → `finance.dunning_campaigns.id` (00011_enterprise_expansion_30_more_tables.sql:343)
- `finance.collection_actions.collection_case_id` → `finance.collection_cases.id` (00011_enterprise_expansion_30_more_tables.sql:365)
- `finance.collection_actions.performed_by_user_id` → `governance.users_profile.id` (00011_enterprise_expansion_30_more_tables.sql:368)
- `finance.reminder_schedules.customer_id` → `commercial.customers.id` (00011_enterprise_expansion_30_more_tables.sql:384)
- `finance.reminder_schedules.invoice_id` → `finance.invoices.id` (00011_enterprise_expansion_30_more_tables.sql:385)
- `workforce.employee_pay_components.employee_id` → `workforce.employees.id` (00011_enterprise_expansion_30_more_tables.sql:431)
- `workforce.employee_pay_components.pay_component_id` → `workforce.pay_components.id` (00011_enterprise_expansion_30_more_tables.sql:432)
- `workforce.leave_requests.employee_id` → `workforce.employees.id` (00011_enterprise_expansion_30_more_tables.sql:477)
- `workforce.leave_requests.leave_type_id` → `workforce.leave_types.id` (00011_enterprise_expansion_30_more_tables.sql:478)
- `workforce.leave_requests.approved_by_user_id` → `governance.users_profile.id` (00011_enterprise_expansion_30_more_tables.sql:483)
- `intelligence.model_executions.model_registry_id` → `intelligence.model_registry.id` (00011_enterprise_expansion_30_more_tables.sql:526)
- `intelligence.recommendation_feedback.recommendation_id` → `intelligence.decision_recommendations.id` (00011_enterprise_expansion_30_more_tables.sql:548)
- `intelligence.recommendation_feedback.provided_by_user_id` → `governance.users_profile.id` (00011_enterprise_expansion_30_more_tables.sql:551)
- `governance.command_logs.actor_user_id` → `governance.users_profile.id` (00011_enterprise_expansion_30_more_tables.sql:589)
- `governance.security_events.user_profile_id` → `governance.users_profile.id` (00011_enterprise_expansion_30_more_tables.sql:615)
- `governance.security_events.portal_user_id` → `comms.portal_users.id` (00011_enterprise_expansion_30_more_tables.sql:616)
- `comms.notification_deliveries.notification_id` → `comms.notifications.id` (00011_enterprise_expansion_30_more_tables.sql:636)
- `comms.support_sla_tracking.support_ticket_id` → `comms.support_tickets.id` (00011_enterprise_expansion_30_more_tables.sql:661)
- `public.app_menu.parent_id` → `public.app_menu.id` (00017_app_menu.sql:11)
- `analytics.dashboard_board_widgets.board_id` → `analytics.dashboard_boards.id` (00021_dashboard_tables.sql:30)
- `analytics.dashboard_board_widgets.widget_id` → `analytics.dashboard_widgets.id` (00021_dashboard_tables.sql:31)
- `analytics.user_dashboard_boards.user_id` → `governance.users_profile.id` (00021_dashboard_tables.sql:45)
- `analytics.user_dashboard_boards.board_id` → `analytics.dashboard_boards.id` (00021_dashboard_tables.sql:46)
- `intelligence.agent_jobs.agent_id` → `intelligence.agent_registry.id` (00023_ai_agent_registry_and_views.sql:21)
- `orchestration.workflow_steps.workflow_definition_id` → `orchestration.workflow_definitions.id` (00024_orchestration_tables.sql:24)
- `orchestration.workflow_runs.workflow_definition_id` → `orchestration.workflow_definitions.id` (00024_orchestration_tables.sql:40)
- `orchestration.workflow_runs.triggered_by_user_id` → `governance.users_profile.id` (00024_orchestration_tables.sql:46)
- `orchestration.workflow_step_runs.workflow_run_id` → `orchestration.workflow_runs.id` (00024_orchestration_tables.sql:56)
- `orchestration.workflow_step_runs.workflow_step_id` → `orchestration.workflow_steps.id` (00024_orchestration_tables.sql:57)
- `orchestration.job_queue.workflow_run_id` → `orchestration.workflow_runs.id` (00024_orchestration_tables.sql:79)
- `orchestration.universal_inbox.assigned_to_user_id` → `governance.users_profile.id` (00024_orchestration_tables.sql:102)
- `crm.leads.owner_user_id` → `governance.users_profile.id` (00027_enterprise_30_tables.sql:38)
- `crm.lead_activities.lead_id` → `crm.leads.id` (00027_enterprise_30_tables.sql:52)
- `crm.lead_activities.performed_by_user_id` → `governance.users_profile.id` (00027_enterprise_30_tables.sql:56)
- `crm.opportunities.lead_id` → `crm.leads.id` (00027_enterprise_30_tables.sql:73)
- `crm.opportunities.customer_id` → `commercial.customers.id` (00027_enterprise_30_tables.sql:74)
- `crm.opportunities.owner_user_id` → `governance.users_profile.id` (00027_enterprise_30_tables.sql:79)
- `service.tickets.customer_id` → `commercial.customers.id` (00027_enterprise_30_tables.sql:94)
- `service.tickets.project_id` → `execution.projects.id` (00027_enterprise_30_tables.sql:95)
- `service.tickets.work_order_id` → `execution.work_orders.id` (00027_enterprise_30_tables.sql:96)
- `service.tickets.assigned_to_user_id` → `governance.users_profile.id` (00027_enterprise_30_tables.sql:102)
- `service.ticket_comments.ticket_id` → `service.tickets.id` (00027_enterprise_30_tables.sql:117)
- `service.ticket_comments.author_user_id` → `governance.users_profile.id` (00027_enterprise_30_tables.sql:120)
- `quality.inspection_runs.plan_id` → `quality.inspection_plans.id` (00027_enterprise_30_tables.sql:150)
- `quality.inspection_runs.project_id` → `execution.projects.id` (00027_enterprise_30_tables.sql:151)
- `quality.inspection_runs.work_order_id` → `execution.work_orders.id` (00027_enterprise_30_tables.sql:152)
- `quality.inspection_runs.inspector_user_id` → `governance.users_profile.id` (00027_enterprise_30_tables.sql:154)
- `quality.defects.inspection_run_id` → `quality.inspection_runs.id` (00027_enterprise_30_tables.sql:172)
- `quality.defects.project_id` → `execution.projects.id` (00027_enterprise_30_tables.sql:173)
- `quality.defects.work_order_id` → `execution.work_orders.id` (00027_enterprise_30_tables.sql:174)
- `quality.defects.owner_user_id` → `governance.users_profile.id` (00027_enterprise_30_tables.sql:179)
- `compliance.policy_acknowledgements.policy_id` → `compliance.policies.id` (00027_enterprise_30_tables.sql:212)
- `compliance.policy_acknowledgements.user_id` → `governance.users_profile.id` (00027_enterprise_30_tables.sql:213)
- `treasury.cash_positions.bank_account_id` → `treasury.bank_accounts.id` (00027_enterprise_30_tables.sql:245)
- `treasury.cash_forecasts.bank_account_id` → `treasury.bank_accounts.id` (00027_enterprise_30_tables.sql:262)
- `planning.capacity_slots.capacity_calendar_id` → `planning.capacity_calendars.id` (00027_enterprise_30_tables.sql:296)
- `maintenance.work_orders.asset_id` → `maintenance.assets.id` (00027_enterprise_30_tables.sql:351)
- `maintenance.work_orders.assigned_to_user_id` → `governance.users_profile.id` (00027_enterprise_30_tables.sql:357)
- `pricing.calculations.ruleset_id` → `pricing.rule_sets.id` (00027_enterprise_30_tables.sql:391)
- `routing.menu_nodes.route_registry_id` → `routing.route_registry.id` (00027_enterprise_30_tables.sql:429)
- `routing.menu_nodes.parent_node_id` → `routing.menu_nodes.id` (00027_enterprise_30_tables.sql:430)
- `routing.route_permission_map.route_registry_id` → `routing.route_registry.id` (00027_enterprise_30_tables.sql:445)
- `documents.ocr_runs.document_id` → `docs.documents.id` (00027_enterprise_30_tables.sql:458)
- `documents.classification_runs.document_id` → `docs.documents.id` (00027_enterprise_30_tables.sql:478)
- `documents.extraction_runs.document_id` → `docs.documents.id` (00027_enterprise_30_tables.sql:499)
- `documents.document_chunks.document_id` → `docs.documents.id` (00027_enterprise_30_tables.sql:518)
- `documents.entity_extractions.document_id` → `docs.documents.id` (00027_enterprise_30_tables.sql:535)
- `documents.entity_extractions.extraction_run_id` → `documents.extraction_runs.id` (00027_enterprise_30_tables.sql:536)
- `documents.document_relations.source_document_id` → `docs.documents.id` (00027_enterprise_30_tables.sql:553)
- `documents.knowledge_cards.document_id` → `docs.documents.id` (00027_enterprise_30_tables.sql:569)
- `public.user_profiles.id` → `auth.users.id` (20260417000000_initial_schema.sql:9)
- `public.inventory_items.supplier_id` → `public.suppliers.id` (20260417000000_initial_schema.sql:62)
- `public.orders.customer_id` → `public.customers.id` (20260417000000_initial_schema.sql:72)

## D. LIST OF EVERYTHING NOT CONNECTED

### D1. Orphan migration tables (no FK in, no FK out)

- `analytics.kpi_snapshots` (00010_enterprise_expansion_30_tables.sql:418)
- `analytics.read_model_invalidations` (00011_enterprise_expansion_30_more_tables.sql:563)
- `analytics.rm_ai_summary` (00000_master_schema.sql:2088)
- `analytics.rm_executive_summary` (00000_master_schema.sql:2028)
- `analytics.rm_finance_summary` (00000_master_schema.sql:2065)
- `analytics.rm_operations_summary` (00000_master_schema.sql:2041)
- `analytics.rm_procurement_summary` (00000_master_schema.sql:2053)
- `analytics.rm_workforce_summary` (00000_master_schema.sql:2077)
- `commercial.quote_approval_rules` (00011_enterprise_expansion_30_more_tables.sql:65)
- `comms.help_articles` (00000_master_schema.sql:1905)
- `execution.signatures` (00000_master_schema.sql:972)
- `finance.annual_tax_reports` (00000_master_schema.sql:1662)
- `finance.cashflow_entries` (00000_master_schema.sql:1564)
- `finance.consolidation_entries` (00000_master_schema.sql:1617)
- `finance.fx_rates` (00000_master_schema.sql:1607)
- `governance.config_entries` (00000_master_schema.sql:303)
- `governance.escalation_rules` (00010_enterprise_expansion_30_tables.sql:631)
- `governance.health_checks` (00000_master_schema.sql:329)
- `governance.idempotency_keys` (00008_idempotency_table.sql:9)
- `governance.validations_log` (00000_master_schema.sql:280)
- `intelligence.ai_insights` (00000_master_schema.sql:1922)
- `intelligence.forecast_models` (00000_master_schema.sql:1957)
- `intelligence.quality_scores` (00000_master_schema.sql:1974)
- `intelligence.seasonality_patterns` (00000_master_schema.sql:1996)
- `intelligence.trend_signals` (00000_master_schema.sql:1985)
- `orchestration.notifications` (00024_orchestration_tables.sql:111)
- `planning.demand_forecasts` (00027_enterprise_30_tables.sql:309)
- `public.employees` (20260417000000_initial_schema.sql:85)
- `public.properties` (20260417000000_initial_schema.sql:99)

### D2. Pipeline entities that do not map to a migration table

- Pipeline entity `contract` — declared in entity-map.js but no `<schema>.contract` or `<schema>.contracts` table exists in migrations.
- Pipeline entity `alert` — declared in entity-map.js but no `<schema>.alert` or `<schema>.alerts` table exists in migrations.

### D3. Menu routes with no `<Route>` registered (sample up to 60)

- `/operations` (תפעול) — supabase/migrations/00017_app_menu.sql
- `/workforce` (כח אדם) — supabase/migrations/00017_app_menu.sql
- `/rfqs` (בקשות הצעת מחיר) — supabase/migrations/00017_app_menu.sql
- `/pos` (הזמנות רכש) — supabase/migrations/00017_app_menu.sql
- `/dashboard` (דשבורד) — supabase/migrations/00034_app_menu_complete.sql
- `/sales` (מכירות ולקוחות) — supabase/migrations/00034_app_menu_complete.sql
- `/tax` (מיסוי) — supabase/migrations/00034_app_menu_complete.sql
- `/workforce` (כח אדם ושכר) — supabase/migrations/00034_app_menu_complete.sql
- `/realestate` (נדל"ן) — supabase/migrations/00034_app_menu_complete.sql
- `/system` (מערכת) — supabase/migrations/00034_app_menu_complete.sql
- `/executive` (Executive Control Tower) — supabase/migrations/00034_app_menu_complete.sql
- `/operations` (Operations Control Room) — supabase/migrations/00034_app_menu_complete.sql
- `/procurement-room` (Procurement Control Room) — supabase/migrations/00034_app_menu_complete.sql
- `/workforce-room` (Workforce Control Room) — supabase/migrations/00034_app_menu_complete.sql
- `/ai-room` (AI Control Room) — supabase/migrations/00034_app_menu_complete.sql
- `/command-center` (Command Center) — supabase/migrations/00034_app_menu_complete.sql
- `/kpi` (KPI Dashboard) — supabase/migrations/00034_app_menu_complete.sql
- `/leads` (לידים) — supabase/migrations/00034_app_menu_complete.sql
- `/customer-360` (Customer360) — supabase/migrations/00034_app_menu_complete.sql
- `/quotes` (הצעות מחיר) — supabase/migrations/00034_app_menu_complete.sql
- `/contracts` (חוזים) — supabase/migrations/00034_app_menu_complete.sql
- `/customer-portal` (פורטל לקוחות) — supabase/migrations/00034_app_menu_complete.sql
- `/crm-pipeline` (CRM Pipeline) — supabase/migrations/00034_app_menu_complete.sql
- `/sales-funnel` (שיעורי המרה) — supabase/migrations/00034_app_menu_complete.sql
- `/sales-leaders` (Leaderboard מכירות) — supabase/migrations/00034_app_menu_complete.sql
- `/supplier-360` (Supplier360) — supabase/migrations/00034_app_menu_complete.sql
- `/rfq-360` (RFQ360) — supabase/migrations/00034_app_menu_complete.sql
- `/po-360` (PO360) — supabase/migrations/00034_app_menu_complete.sql
- `/approvals` (אישורים) — supabase/migrations/00034_app_menu_complete.sql
- `/supplier-portal` (פורטל ספקים) — supabase/migrations/00034_app_menu_complete.sql
- `/subcontractors` (קבלנים משניים) — supabase/migrations/00034_app_menu_complete.sql
- `/procurement-analytics` (ניתוח רכש) — supabase/migrations/00034_app_menu_complete.sql
- `/project-360` (Project360) — supabase/migrations/00034_app_menu_complete.sql
- `/work-order-360` (WorkOrder360) — supabase/migrations/00034_app_menu_complete.sql
- `/tasks` (משימות) — supabase/migrations/00034_app_menu_complete.sql
- `/kanban` (Kanban) — supabase/migrations/00034_app_menu_complete.sql
- `/gantt` (Gantt) — supabase/migrations/00034_app_menu_complete.sql
- `/production-floor` (לוח ייצור) — supabase/migrations/00034_app_menu_complete.sql
- `/quality-control` (QC — בדיקות איכות) — supabase/migrations/00034_app_menu_complete.sql
- `/installations` (מעקב התקנות) — supabase/migrations/00034_app_menu_complete.sql
- `/warehouses` (מחסנים) — supabase/migrations/00034_app_menu_complete.sql
- `/movements` (תנועות מלאי) — supabase/migrations/00034_app_menu_complete.sql
- `/receipts` (קבלות מלאי) — supabase/migrations/00034_app_menu_complete.sql
- `/issues` (ניפוקי מלאי) — supabase/migrations/00034_app_menu_complete.sql
- `/stock-counts` (ספירת מלאי) — supabase/migrations/00034_app_menu_complete.sql
- `/bom` (BOM Calculator) — supabase/migrations/00034_app_menu_complete.sql
- `/finance-360` (Finance360) — supabase/migrations/00034_app_menu_complete.sql
- `/payments` (תשלומים) — supabase/migrations/00034_app_menu_complete.sql
- `/receipts-finance` (קבלות) — supabase/migrations/00034_app_menu_complete.sql
- `/expenses` (הוצאות) — supabase/migrations/00034_app_menu_complete.sql
- `/bank-reconciliation` (התאמות בנק) — supabase/migrations/00034_app_menu_complete.sql
- `/cashflow` (תזרים מזומנים) — supabase/migrations/00034_app_menu_complete.sql
- `/cashflow-forecast` (תחזית תזרים) — supabase/migrations/00034_app_menu_complete.sql
- `/balance-sheet` (מאזן) — supabase/migrations/00034_app_menu_complete.sql
- `/treasury` (Treasury) — supabase/migrations/00034_app_menu_complete.sql
- `/collections` (גביית חובות) — supabase/migrations/00034_app_menu_complete.sql
- `/vat-refund` (החזר מע"מ) — supabase/migrations/00034_app_menu_complete.sql
- `/annual-tax` (דיווח שנתי) — supabase/migrations/00034_app_menu_complete.sql
- `/form-102` (טופס 102) — supabase/migrations/00034_app_menu_complete.sql
- `/form-126` (טופס 126) — supabase/migrations/00034_app_menu_complete.sql
- … **450 more**

### D4. Routes registered but not reachable via menu (sample up to 60)

- `/` — erp-app/src/App.tsx:518
- `/operations-control-center` — erp-app/src/App.tsx:519
- `/executive/war-room` — erp-app/src/App.tsx:520
- `/executive/order-lifecycle` — erp-app/src/App.tsx:521
- `/executive/ceo-dashboard` — erp-app/src/App.tsx:522
- `/executive/live-ops` — erp-app/src/App.tsx:523
- `/executive/company-health` — erp-app/src/App.tsx:524
- `/executive/kpi-board` — erp-app/src/App.tsx:525
- `/executive/live-alerts` — erp-app/src/App.tsx:526
- `/executive/financial-risk` — erp-app/src/App.tsx:527
- `/executive/operational-bottlenecks` — erp-app/src/App.tsx:528
- `/executive/delayed-projects` — erp-app/src/App.tsx:529
- `/executive/procurement-risk` — erp-app/src/App.tsx:530
- `/executive/production-efficiency` — erp-app/src/App.tsx:531
- `/executive/profitability` — erp-app/src/App.tsx:532
- `/executive/workforce-status` — erp-app/src/App.tsx:533
- `/system/model-catalog` — erp-app/src/App.tsx:534
- `/products` — erp-app/src/App.tsx:536
- `/sales-orders` — erp-app/src/App.tsx:539
- `/manufacturing` — erp-app/src/App.tsx:544
- `/manufacturing/:rest*` — erp-app/src/App.tsx:545
- `/field-measurements` — erp-app/src/App.tsx:546
- `/accounting` — erp-app/src/App.tsx:547
- `/blackrock` — erp-app/src/App.tsx:548
- `/kimi` — erp-app/src/App.tsx:549
- `/kimi2` — erp-app/src/App.tsx:550
- `/platform` — erp-app/src/App.tsx:551
- `/builder` — erp-app/src/App.tsx:552
- `/builder/modules` — erp-app/src/App.tsx:553
- `/builder/module/:id/versions` — erp-app/src/App.tsx:554
- `/builder/module/:id` — erp-app/src/App.tsx:555
- `/builder/entity/:id` — erp-app/src/App.tsx:556
- `/builder/data/:entityId` — erp-app/src/App.tsx:557
- `/module/:entityId` — erp-app/src/App.tsx:558
- `/builder/entities` — erp-app/src/App.tsx:559
- `/builder/fields` — erp-app/src/App.tsx:560
- `/builder/relations` — erp-app/src/App.tsx:561
- `/builder/forms` — erp-app/src/App.tsx:562
- `/builder/views` — erp-app/src/App.tsx:563
- `/builder/details` — erp-app/src/App.tsx:564
- `/builder/categories` — erp-app/src/App.tsx:565
- `/builder/statuses` — erp-app/src/App.tsx:566
- `/builder/buttons` — erp-app/src/App.tsx:567
- `/builder/actions` — erp-app/src/App.tsx:568
- `/builder/validations` — erp-app/src/App.tsx:569
- `/builder/permissions` — erp-app/src/App.tsx:570
- `/builder/menus` — erp-app/src/App.tsx:571
- `/builder/dashboards` — erp-app/src/App.tsx:572
- `/builder/widgets` — erp-app/src/App.tsx:573
- `/builder/workflows` — erp-app/src/App.tsx:574
- `/builder/automations` — erp-app/src/App.tsx:575
- `/builder/automation-dashboard` — erp-app/src/App.tsx:576
- `/platform/data-flow-automations` — erp-app/src/App.tsx:577
- `/builder/templates` — erp-app/src/App.tsx:578
- `/builder/tools` — erp-app/src/App.tsx:579
- `/builder/contexts` — erp-app/src/App.tsx:580
- `/builder/publish` — erp-app/src/App.tsx:581
- `/menu-builder` — erp-app/src/App.tsx:582
- `/audit-log` — erp-app/src/App.tsx:583
- `/report-builder` — erp-app/src/App.tsx:584
- … **592 more**

### D5. Controlled-meaning declarations pointing at nonexistent tables (from source_of_truth_registry.json)

- `customer_master` → `crm.customers` (not found). Closest existing: commercial.customers, public.customers
- `contact_master` → `crm.contacts` (not found). Closest existing: (none)
- `project_master` → `projects.projects` (not found). Closest existing: execution.projects
- `quote_master` → `sales.quotes` (not found). Closest existing: commercial.quotes
- `inventory_balance` → `inventory.stock_balances` (not found). Closest existing: (none)
- `service_ticket_master` → `service.service_tickets` (not found). Closest existing: (none)
- `employee_master` → `hr_workforce.employees` (not found). Closest existing: public.employees, workforce.employees

### D6. Reports whose `sources[]` reference nonexistent tables

- Report `project_profitability_report` (RPT-0001) references nonexistent table `projects.projects`.
- Report `project_profitability_report` (RPT-0001) references nonexistent table `production.material_consumption`.
- Report `vat_report_pcn836` (RPT-0006) references nonexistent table `finance.invoice_items`.
- Report `production_kpi` (RPT-0007) references nonexistent table `production.production_orders`.
- Report `production_kpi` (RPT-0007) references nonexistent table `production.production_quality_checks`.
- Report `sales_pipeline` (RPT-0008) references nonexistent table `sales.opportunities`.
- Report `sales_pipeline` (RPT-0008) references nonexistent table `sales.quotes`.
- Report `inventory_turnover` (RPT-0010) references nonexistent table `inventory.stock_movements`.
- Report `inventory_turnover` (RPT-0010) references nonexistent table `inventory.items`.
- Report `payroll_summary` (RPT-0011) references nonexistent table `hr_workforce.payroll_inputs`.
- Report `attendance_report` (RPT-0012) references nonexistent table `hr_workforce.attendance_logs`.
- Report `service_sla` (RPT-0013) references nonexistent table `service.service_tickets`.
- Report `service_sla` (RPT-0013) references nonexistent table `service.sla_rules`.
- Report `customer_360` (RPT-0014) references nonexistent table `crm.customers`.
- Report `customer_360` (RPT-0014) references nonexistent table `sales.quotes`.
- Report `customer_360` (RPT-0014) references nonexistent table `projects.projects`.
- Report `supplier_scorecard` (RPT-0015) references nonexistent table `procurement.supplier_price_lists`.
- Report `overdue_projects_report` (RPT-0016) references nonexistent table `projects.projects`.
- Report `stock_reorder_suggestions` (RPT-0018) references nonexistent table `inventory.stock_balances`.
- Report `installation_completion` (RPT-0019) references nonexistent table `installation.installation_orders`.
- Report `installation_completion` (RPT-0019) references nonexistent table `installation.completion_reports`.
- Report `audit_log_review` (RPT-0020) references nonexistent table `governance.change_logs`.

### D7. Dashboards whose `sources[]` reference nonexistent tables

- Dashboard `dashboard_executive` (DSH-0001) references nonexistent table `projects.projects`.
- Dashboard `dashboard_operations` (DSH-0002) references nonexistent table `projects.project_tasks`.
- Dashboard `dashboard_operations` (DSH-0002) references nonexistent table `hr_workforce.attendance_logs`.
- Dashboard `dashboard_operations` (DSH-0002) references nonexistent table `production.production_orders`.
- Dashboard `dashboard_procurement` (DSH-0003) references nonexistent table `procurement.purchase_requests`.
- Dashboard `dashboard_workforce` (DSH-0004) references nonexistent table `hr_workforce.employees`.
- Dashboard `dashboard_workforce` (DSH-0004) references nonexistent table `hr_workforce.attendance_logs`.
- Dashboard `dashboard_workforce` (DSH-0004) references nonexistent table `hr_workforce.payroll_inputs`.
- Dashboard `dashboard_ai` (DSH-0005) references nonexistent table `ai_automation.automation_runs`.
- Dashboard `dashboard_ai` (DSH-0005) references nonexistent table `ai_automation.prediction_outputs`.
- Dashboard `dashboard_service` (DSH-0007) references nonexistent table `service.service_tickets`.
- Dashboard `dashboard_service` (DSH-0007) references nonexistent table `service.sla_rules`.
- Dashboard `dashboard_service` (DSH-0007) references nonexistent table `service.service_feedback`.
- Dashboard `dashboard_projects` (DSH-0008) references nonexistent table `projects.projects`.
- Dashboard `dashboard_projects` (DSH-0008) references nonexistent table `projects.milestones`.
- Dashboard `dashboard_production` (DSH-0009) references nonexistent table `production.production_orders`.
- Dashboard `dashboard_production` (DSH-0009) references nonexistent table `production.scrap_logs`.
- Dashboard `dashboard_production` (DSH-0009) references nonexistent table `production.work_centers`.
- Dashboard `dashboard_sales` (DSH-0010) references nonexistent table `sales.opportunities`.
- Dashboard `dashboard_sales` (DSH-0010) references nonexistent table `sales.quotes`.
- Dashboard `dashboard_sales` (DSH-0010) references nonexistent table `sales.sales_pipeline`.

### D8. Automations whose `trigger` or `side_effects` reference nonexistent tables

- Automation `quote_approved_create_project` (AUTO-0001) references `sales.quotes` — not found.
- Automation `quote_approved_create_project` (AUTO-0001) references `projects.projects` — not found.
- Automation `project_status_change_alert` (AUTO-0002) references `projects.projects` — not found.
- Automation `overdue_project_alert` (AUTO-0003) references `projects.projects` — not found.
- Automation `auto_reorder_on_low_stock` (AUTO-0004) references `inventory.stock_balances` — not found.
- Automation `auto_reorder_on_low_stock` (AUTO-0004) references `procurement.purchase_requests` — not found.
- Automation `compute_wage_on_attendance_close` (AUTO-0005) references `hr_workforce.attendance_logs` — not found.
- Automation `compute_wage_on_attendance_close` (AUTO-0005) references `hr_workforce.payroll_inputs` — not found.
- Automation `send_quote_email_on_approve` (AUTO-0010) references `sales.quotes` — not found.
- Automation `rfq_followup_no_response` (AUTO-0011) references `procurement.purchase_requests` — not found.
- Automation `service_sla_breach_alert` (AUTO-0012) references `service.service_tickets` — not found.

## E. RECOMMENDATION TO CLOSE GAPS

Ordered by impact. Each item gives the exact file(s) to edit.

### E1. Reconcile domain/schema naming (HIGHEST PRIORITY)

The single biggest integrity issue: 16 of 11 controlled_business_meanings and the entire `_master-registry/models_registry.json`, `dashboards_registry.json`, `reports_registry.json`, and `source_of_truth_registry.json` use schema names (`crm`, `sales`, `projects`, `hr_workforce`, `production`, `installation`, `engineering`, `ai_automation`) that **do not exist** in any migration. Actual schemas are `commercial`, `execution`, `workforce`, `intelligence`, `documents` (plus `procurement`, `inventory`, `finance` which do match).

**Fix options (choose ONE and apply consistently):**

- **Option A** (preferred — less code churn): Rename the registry files' schema references to match the actual migration schemas:
  - `_master-registry/models_registry.json`: map `crm`→`commercial`, `sales`→`commercial`, `projects`→`execution`, `hr_workforce`→`workforce`, `production`→`execution`, `installation`→`execution`, `engineering`→`execution`, `ai_automation`→`intelligence`.
  - `_master-registry/source_of_truth_registry.json` lines 5, 10, 16, 22, 28, 34, 60, 66, 72: same remapping.
  - `_master-registry/dashboards_registry.json`: all `sources[]` entries.
  - `_master-registry/reports_registry.json`: all `sources[]` entries.
  - `_master-registry/automations_registry.json`: all `trigger` and `side_effects[]` entries.
- **Option B** (high-risk): add new migrations that rename the schemas to match the registry (`commercial`→`crm`, `execution`→`projects`, `workforce`→`hr_workforce`). Requires touching every RLS policy, RPC, and read-model view — hundreds of lines across ~30 SQL files.

### E2. Remove duplicate table definitions

Five tables are recreated in a later migration (governance.roles/permissions/role_permissions/user_roles in 00000 + 00019; analytics.dashboard_widgets in 00010 + 00021). This causes `create table if not exists` to silently diverge when columns differ.

**Fix**: audit the 5 duplicates and consolidate to a single migration (add `alter table` migrations for the diff), then delete the later redundant `create table` statement or gate it with `drop table if exists ... cascade; create table`.

- `_master-registry/_scan_table_dupes.json` lists all 5 pairs with file:line.

### E3. Fill in missing state-machine/orchestrator coverage

- CLAUDE.md claims "13 stages / 91 transitions / 18 actions". Actual: 13 stages / 115 transitions / 18 actions. Update `CLAUDE.md` lines 20-24 to reflect actual counts, OR add the missing items:
  - state-machines.js: `material` entity has no state machine block — add one to `onyx-procurement/src/pipeline/state-machines.js` after line 297.
  - state-machines.js: `attendance` and `payroll` machines exist but `attendance` and `payroll` are not in entity-map.js — add them to `onyx-procurement/src/pipeline/entity-map.js` after line 356.

### E4. Attach the 29 orphan tables to a parent or document why they're islands

See §10a for the list. Each either needs: (a) a FK out (parent), (b) a FK in (child), or (c) explicit documentation that it is a standalone read-model/snapshot (which is true for `analytics.rm_*` views-as-tables, but `maintenance.equipment_logs`, `quality.inspection_results`, `routing.delivery_routes`, `pricing.price_lists`, `treasury.cash_positions`, `planning.demand_forecasts` etc. need parents).

### E5. Reconcile menu vs registered routes

The menu seed `00035_app_menu_FULL.sql` declares ~500 routes; only 39 of those are registered via `<Route path>` in the scanned services.

**Fix A**: for each menu route that has no `<Route>`, decide: (1) implement the page (add `<Route path=...>` + component), or (2) remove from menu. List is in `_master-registry/_scan_orphan_menu.json`.
**Fix B**: for the 652 routes registered but not in the menu: decide (1) add menu entry, or (2) mark as internal (e.g. modal-only) and delete the `<Route>`. List in `_master-registry/_scan_orphan_pages.json`.

### E6. Deduplicate API route registrations

171 method+path pairs are registered in more than one file. The first registered handler wins at runtime — the others are dead code. `_master-registry/_scan_api_dupes.json` contains the top 50.

### E7. Fix dangling source references in dashboards/reports/automations

Every entry in §D6 / §D7 / §D8 needs its `sources[]` / `trigger` updated to a real table name. A find-and-replace covers most: `projects.projects` → `execution.projects`, `sales.quotes` → `commercial.quotes`, `hr_workforce.*` → `workforce.*`, `crm.customers` → `commercial.customers`, `production.production_orders` → `execution.work_orders` (if that is the intent).

### E8. Add missing RLS policies

71 tables have no `create policy` statement. For production hardening, add at minimum a `select` and `insert` policy per table (see `00014_rls_policies_expansion_tables.sql` for pattern).

### E9. Clean up redundant pipeline entity definitions

Three files in `onyx-procurement/src/pipeline/` describe entities:
- `entity-map.js` (16 entities, authoritative per CLAUDE.md)
- `ontology.js` (344 lines — purpose unclear, likely overlaps)
- `domain-model.js` (335 lines — another overlap)

Decide which is source-of-truth and delete the other two (or make them pure re-exports of `entity-map.js`).

### E10. Verify CROSS_SERVICE_CONTRACTS endpoints actually exist

wiring-spec.js:243-292 declares 7 cross-service contracts with ~20 specific endpoints (`POST /api/purchase-orders`, `POST /api/rfq/send`, `POST /api/payroll/assignments`, `POST /api/ai/analyze`, `POST /api/ops/events`, …). Cross-check each against `_master-registry/_scan_api_routes.json` — any missing endpoint is a broken cross-service contract.

---
END OF AUDIT_REAL.md
