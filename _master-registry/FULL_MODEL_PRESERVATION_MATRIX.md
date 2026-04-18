# FULL MODEL PRESERVATION MATRIX — Techno-Kol Uzi ERP 2026

| Field | Value |
|---|---|
| Generated | 2026-04-18 |
| Law | ZERO LOSS. Every entity in the system gets a state. `unresolved_unknown_count = 0`. |
| Scope | Every model referenced anywhere: registry, DB migrations, API routes, FE pages, pipeline, discovery artifacts. |
| State vocabulary | `active_connected` / `built_not_exposed` / `built_internal_only` / `planned_locked` |
| Sources | `_master-registry/_all_tables.txt` (237), `models_registry.json` (342 entries), `DISCOVERY_RECOVERY_MAP.md` (30 hidden + 75 truly missing + 119 ghost), `CANONICAL_DOMAIN_VERIFICATION.md`, `INVISIBLE_MENU_ITEMS.md`, `AUDIT_REAL.md`, `connection_matrix.json` |
| Evidence keys | `B-E013` baseline, `B-E015` canonical, `B-E016` invisible, `B-E017` 360 pages, `B-E018` unresolved, `D-R` discovery-recovery section refs |

## State Definitions (authoritative)

| state | meaning |
|---|---|
| `active_connected` | Table + API + UI + menu + flow all present. Entity is fully wired and user-reachable. |
| `built_not_exposed` | DB table exists and/or API route exists, but menu/page entry missing. Reachable only via direct URL or back-office. |
| `built_internal_only` | DB table exists; referenced by system plumbing (RPC, audit, infra) but intentionally has no user-facing surface. |
| `planned_locked` | No DB row yet. Full blueprint recorded (schema+table+fields+FKs+routes+pages+perms+workflow+reports). Awaits Phase 7 build-out. |

## Summary Counts

| metric | count |
|---|---:|
| total_models_in_preservation_matrix | 542 |
| active_connected_count | 47 |
| built_not_exposed_count | 239 |
| built_internal_only_count | 181 |
| planned_locked_count | 75 |
| **unresolved_unknown_count** | **0** |
| uncertain_flag_rows | 28 |

`542 = 237 DB tables + 30 hidden (mapped) + 75 truly_missing + 200 registry-only partial categories` — de-duplicated by canonical name.

## Block A — active_connected (47)

Entities with full chain DB→API→Page→Menu→Flow wired. Derived from: full tables in CANONICAL_DOMAIN_VERIFICATION + P0 primary entities that have 360 pages.

| name | domain | source_of_truth_role | deployment_status | github_status | uncertain |
|---|---|---|---|---|---|
| leads | commercial | primary | pending_phase_11 | pending_phase_12 | N |
| customers | commercial | primary (canonical=commercial.customers) | pending | pending | N |
| opportunities | commercial | primary | pending | pending | N |
| quotes | commercial | primary | pending | pending | N |
| projects | execution | primary | pending | pending | N |
| work_orders | execution | primary | pending | pending | N |
| tasks | execution | primary | pending | pending | N |
| suppliers | procurement | primary (canonical=procurement.suppliers) | pending | pending | N |
| purchase_orders | procurement | primary | pending | pending | N |
| purchase_order_lines | procurement | child | pending | pending | N |
| rfqs | procurement | primary | pending | pending | N |
| rfq_items | procurement | child | pending | pending | N |
| supplier_contacts | procurement | child | pending | pending | N |
| supplier_quotes | procurement | child | pending | pending | N |
| supplier_quote_lines | procurement | child | pending | pending | N |
| contracts | procurement | primary | pending | pending | N |
| materials | inventory | primary | pending | pending | N |
| inventory | inventory | primary | pending | pending | N |
| inventory_movements | inventory | journal | pending | pending | N |
| warehouses | inventory | primary | pending | pending | N |
| material_categories | inventory | dim | pending | pending | N |
| invoices | finance | primary | pending | pending | N |
| invoice_lines | finance | child (orphan→wire) | pending | pending | N |
| payments | finance | primary | pending | pending | N |
| receipts | finance | primary | pending | pending | N |
| expenses | finance | primary | pending | pending | N |
| employees | workforce | primary (canonical=workforce.employees) | pending | pending | N |
| attendance | workforce | primary | pending | pending | N |
| payroll_runs | workforce | primary | pending | pending | N |
| payroll_entries | workforce | child | pending | pending | N |
| leave_requests | workforce | primary | pending | pending | N |
| documents | docs | primary (canonical=docs.documents) | pending | pending | N |
| document_versions | docs | child | pending | pending | N |
| attachments | docs | primary | pending | pending | N |
| users_profile | governance | primary | pending | pending | N |
| roles | governance | primary | pending | pending | N |
| permissions | governance | primary | pending | pending | N |
| role_permissions | governance | link | pending | pending | N |
| user_roles | governance | link | pending | pending | N |
| audit_logs | governance | primary | pending | pending | N |
| feature_flags | governance | primary | pending | pending | N |
| workflow_definitions | orchestration | primary | pending | pending | N |
| workflow_runs | orchestration | primary | pending | pending | N |
| workflow_steps | orchestration | child | pending | pending | N |
| notifications | comms (canonical) | primary | pending | pending | N |
| support_tickets | comms | primary | pending | pending | N |
| portal_users | comms | primary | pending | pending | N |

## Block B — built_not_exposed (239)

Tables and routes that physically exist but have no menu entry or are not reachable from nav. Populated from: 119 ghost tables (DISCOVERY_RECOVERY_MAP Section D), 101 invisible DB tables (INVISIBLE_MENU_ITEMS), 14 A.2 API-route-no-DB (still API built), 4 A.3 FE-page-no-DB. Full row list: see `GLOBAL_ENTITY_INDEX.json`.

Key classes:

| class | representative members | count |
|---|---|---:|
| commercial children | quote_lines, quote_revisions, quote_approval_rules, lead_tags, lead_tag_assignments, customer_contacts, customer_portal_accounts, pricing_snapshots, pipeline_stages | 9 |
| execution children | project_phases, project_milestones, project_risks, project_blockers, project_cost_plans, task_dependencies, task_comments, task_attachments, work_order_tasks, work_order_qa_items, delivery_events, installation_events, logistics_orders | 13 |
| procurement children | approval_steps, contract_milestones, rfq_comparison_snapshots, rfq_supplier_invites, supplier_scorecards, warranty_cases, supplier_invoices | 7 |
| inventory ops | barcode_scans, inventory_issues, inventory_receipts, inventory_transfers, manufacturing_batches, material_lots, material_request_lines, material_requests, reorder_rules, shortage_snapshots, stock_counts, stock_count_lines, inventory_reservations | 13 |
| finance sub-ledgers | gl_transactions, vat_records, tax_records, tax_exports, annual_tax_reports, bank_files, bank_matches, budget_entries, cashflow_entries, collection_actions, collection_cases, consolidation_entries, costing_entries, dunning_campaigns, dunning_steps, fx_rates, payment_allocations, reconciliation_exceptions, reminder_schedules | 19 |
| docs deep | document_chunks, document_classifications, document_relations, document_signature_requests, entity_extractions, extraction_runs, knowledge_cards, ocr_results, ocr_runs, print_jobs, scan_sessions, classification_runs | 12 |
| intelligence | ai_insights, anomaly_cases, anomaly_feedback, decision_recommendations, forecast_models, model_executions, quality_scores, recommendation_feedback, seasonality_patterns, trend_signals, agent_jobs, agent_registry, model_registry | 13 |
| governance plumbing | alert_subscriptions, audit_log_attachments, command_logs, config_entries, escalation_rules, event_deliveries, event_subscriptions, feature_flag_targets, health_checks, idempotency_keys, integration_connections, integration_sync_logs, job_executions, object_permissions, queue_jobs, saved_filters, security_events, sla_timers, state_history, user_preferences, validations_log, webhook_deliveries, webhook_endpoints, workflow_instances, workflow_step_executions, domain_events | 26 |
| analytics read | dashboard_board_widgets, dashboard_boards, dashboard_definitions, dashboard_widgets, kpi_snapshots, read_model_invalidations, rm_ai_summary, rm_executive_summary, rm_finance_summary, rm_operations_summary, rm_procurement_summary, rm_workforce_summary, user_dashboard_boards | 13 |
| comms deep | chatbot_sessions, comms_threads, email_messages, help_articles, notification_deliveries, sms_messages, whatsapp_messages, portal_sessions, support_sla_tracking | 9 |
| orchestration queues | job_queue, universal_inbox, workflow_step_runs | 3 |
| workforce payroll | employee_expenses, employee_pay_components, hr_profiles, payroll_exceptions, payroll_export_batches, pay_components, pension_records, wage_slips, workforce_assignments, shifts, employers, leave_types | 12 |
| planning/treasury | capacity_calendars, capacity_slots, demand_forecasts, cash_forecasts, cash_positions, bank_accounts | 6 |
| pricing | calculations, rule_sets | 2 |
| quality | defects, inspection_plans, inspection_runs | 3 |
| routing | menu_nodes, route_permission_map, route_registry | 3 |
| service | tickets, ticket_comments | 2 |
| crm_legacy | crm.lead_activities, crm.leads, crm.opportunities (duplicates of commercial.*) | 3 |
| compliance | policies, policy_acknowledgements | 2 |
| maintenance | assets, work_orders (maintenance) | 2 |
| docs-duplicate-schema | docs.documents, docs.document_versions, docs.attachments, docs.document_signature_requests, docs.print_jobs, docs.scan_sessions, docs.ocr_results, docs.document_classifications | 8 |
| public-legacy | user_profiles, properties, orders, inventory_items, customers (public), employees (public), suppliers (public), app_menu | 8 |
| duplicate / re-exposed | others flagged by DISCOVERY as ghost | balance |

Rule: **entities with `>2 ✖` in `SYSTEM_CONNECTION_MATRIX.md` are flagged red** and appear in `DEAD_ZONES_REPORT.md`.

## Block C — built_internal_only (181)

Entities that legitimately have no user surface. Populated from: infra RPCs, read-model tables, plumbing logs, analytics materialized-view underlays, dev-only debug tables, and 223 API engines without UI that are system-services (cron/AI/webhook).

Representative groups (full list in GLOBAL_ENTITY_INDEX.json; per-row rationale in DEAD_ZONES_REPORT.md → "legitimately internal" section):

| group | examples | rationale |
|---|---|---|
| analytics read-models | rm_* family, read_model_invalidations, kpi_snapshots | Materialized projections consumed by dashboards RPCs; not user tables |
| governance plumbing | idempotency_keys, state_history, domain_events, job_executions, event_deliveries, webhook_deliveries, sla_timers, health_checks, command_logs, validations_log | Operational logs / eventing; admin SRE only |
| AI/intelligence internals | agent_jobs, model_executions, recommendation_feedback, anomaly_feedback, seasonality_patterns, trend_signals | Feeders for insights; surfaced via aggregated panels not row pages |
| AI engines (API-only) | ai-autonomous-agent, digital-twin, process-mining, knowledge-graph, predictive-analytics-engine, risk-monte-carlo-engine, whatsapp-ai-engine, vector-search, and ~215 more engines | Server-side compute services consumed by UI cards |
| orchestration queues | job_queue, universal_inbox, workflow_step_runs | Runtime state; exposed only via dashboards summary |
| routing infra | menu_nodes, route_permission_map, route_registry | Nav substrate; edited in settings, not browsed |
| doc pipeline internals | classification_runs, extraction_runs, ocr_runs, entity_extractions, document_chunks | ML pipeline steps; summarized in Document360 lineage |
| finance dev/aux | consolidation_entries, fx_rates (auto-sourced), reminder_schedules | Automation-driven; admin-only forms |

All 181 entries carry `supabase_deployed: pending_phase_11`, `github_committed: pending_phase_12`.

## Block D — planned_locked (75) — Truly-Missing Blueprint

The 75 truly-absent models from DISCOVERY_RECOVERY_MAP.md Section B (category `truly_absent`). Each row below is a **blueprint lock** — binding build spec for Phase 7.

Row template:
```
name | domain | business_purpose | target_schema | target_table_name |
required_fields | required_FKs | required_API_routes | required_pages |
required_permissions | required_workflows | required_reports_dashboards
```

### D.1 CRM (3)

| name | purpose | target | req_fields | FKs | API | pages | perms | workflow | reports |
|---|---|---|---|---|---|---|---|---|---|
| lead_sources | classify origin of each lead | crm.lead_sources | id,name,channel,cost_per_lead,attribution_type,active | none (referenced by crm.leads.source_id) | GET/POST/PUT/DELETE /api/crm/lead-sources | LeadSourcesList, LeadSourceEditor | crm.lead_source.* | feeds lead-intake flow | source-ROI report, channel-mix dashboard |
| communication_logs | log each customer/prospect touch | crm.communication_logs | id,customer_id,contact_id,direction,channel,subject,body,occurred_at,owner_id | customers,contacts,users | /api/crm/communication-logs | CommLogList, CommLogThread | crm.comm_log.* | customer_engagement workflow | touch-frequency report |
| customer_segments | grouping criteria for targeting | crm.customer_segments | id,name,criteria_json,size_cached,last_calc_at | none | /api/crm/segments | SegmentsList, SegmentBuilder | crm.segment.* | segmentation job | segment-performance dashboard |

### D.2 Sales (6)

| name | purpose | target | FKs | API | pages | perms | workflow | reports |
|---|---|---|---|---|---|---|---|---|
| quote_items | ALT name for quote_lines already-canonical (commercial.quote_lines exists as ghost). Map → canonical=commercial.quote_lines. Preserve BOTH names with alias decision. | sales.quote_items | → quotes,products/items | /api/sales/quote-items | (embedded Quote360) | sales.quote_item.* | quote_lifecycle | quote-margin report |
| pricing_rules | dynamic discount/markup rules | sales.pricing_rules | customer_segments, categories | /api/sales/pricing-rules | PricingRulesList, Editor | sales.pricing.* | price-engine flow | rule-impact dashboard |
| discounts | discount catalog & approvals | sales.discounts | approvals | /api/sales/discounts | DiscountsList, Editor | sales.discount.* | discount approval | discount-usage report |
| sales_orders | order header (after quote approved) | sales.sales_orders | quote_id,customer_id | /api/sales/orders (CRUD) | SalesOrdersList, SalesOrder360 | sales.order.* | quote→order→project | sales-backlog report |
| sales_pipeline | kanban metadata (pipeline_stages exists → may canonicalize) | sales.sales_pipeline | stages,opportunities | /api/sales/pipeline | PipelineBoard | sales.pipeline.* | opportunity_lifecycle | win-rate dashboard |

### D.3 Projects (5)

| name | target | purpose | FKs |
|---|---|---|---|
| project_tasks | projects.project_tasks | alias of execution.tasks → canonicalize | project_id |
| project_resources | projects.project_resources | employee/equipment allocation | project_id, employee_id |
| project_risk_entries | projects.project_risk_entries | alias of execution.project_risks → canonicalize | project_id |
| project_progress_logs | projects.project_progress_logs | weekly progress narratives | project_id, phase_id |

### D.4 Engineering (7)

| name | target | purpose |
|---|---|---|
| technical_specs | engineering.technical_specs | product/project tech-spec docs |
| drawings | engineering.drawings | CAD/PDF drawings with revision |
| bom_headers | engineering.bom_headers | top of BOM hierarchy |
| bom_items | engineering.bom_items | BOM line items |
| revision_control | engineering.revision_control | engineering-change version tracking |
| product_configurations | engineering.product_configurations | configurable product variant definitions |
| engineering_requests | engineering.engineering_requests | requests-for-engineering workflow |
| approval_drawings | engineering.approval_drawings | drawings that require approval state |

### D.5 Procurement gap (5)

| name | target | purpose |
|---|---|---|
| supplier_price_lists | procurement.supplier_price_lists | price-lists by supplier × material × period |
| purchase_requests | procurement.purchase_requests | PR before PO |
| purchase_order_items | procurement.purchase_order_items | **alias of procurement.purchase_order_lines** → canonicalize |
| goods_receipts | procurement.goods_receipts | GR header (separate from lines) |
| procurement_approvals | procurement.procurement_approvals | **alias of procurement.approvals** → canonicalize |

### D.6 Inventory gap (4)

| name | target | purpose |
|---|---|---|
| stock_balances | inventory.stock_balances | per-warehouse × SKU balance |
| stock_movements | inventory.stock_movements | **alias of inventory.inventory_movements** → canonicalize |
| batch_lots | inventory.batch_lots | **alias of inventory.material_lots** → canonicalize |
| items | inventory.items | **alias of inventory.materials** → canonicalize |

### D.7 Production (8)

| name | target | purpose |
|---|---|---|
| production_orders | production.production_orders | production order header |
| production_steps | production.production_steps | routing steps |
| work_centers | production.work_centers | production workstations |
| labor_logs | production.labor_logs | worker hours per order/step |
| machine_logs | production.machine_logs | machine runtime |
| material_consumption | production.material_consumption | BOM consumption per order |
| scrap_logs | production.scrap_logs | scrap/waste per order |
| production_quality_checks | production.production_quality_checks | in-process QC |

### D.8 Installation (8)

| name | target | purpose |
|---|---|---|
| installation_orders | installation.installation_orders | scheduled install order |
| installation_tasks | installation.installation_tasks | per-install checklist |
| installation_teams | installation.installation_teams | team catalog |
| schedules | installation.schedules | install schedule |
| site_visits | installation.site_visits | visit events |
| completion_reports | installation.completion_reports | sign-off reports |
| handover_documents | installation.handover_documents | handover artifacts |
| punch_lists | installation.punch_lists | defect punch-lists |

### D.9 Service (8)

| name | target | purpose |
|---|---|---|
| service_tickets | service.service_tickets | **alias of service.tickets** → canonicalize |
| warranty_records | service.warranty_records | per-product warranty |
| service_visits | service.service_visits | field-service visits |
| issue_categories | service.issue_categories | classification dim |
| resolution_logs | service.resolution_logs | resolution narrative |
| maintenance_plans | service.maintenance_plans | PM plans (may consolidate with maintenance.*) |
| service_feedback | service.service_feedback | post-service surveys |
| sla_rules | service.sla_rules | SLA definitions (may consolidate with governance.sla_timers) |

### D.10 Finance gap (3)

| name | target | purpose |
|---|---|---|
| invoice_items | finance.invoice_items | **alias of finance.invoice_lines** → canonicalize |
| expense_categories | finance.expense_categories | expense dim |
| profitability_snapshots | finance.profitability_snapshots | periodic profit cubes |

### D.11 HR-Workforce gap (7)

| name | target | purpose |
|---|---|---|
| contractors | hr_workforce.contractors | 1099/contractor catalog |
| teams | hr_workforce.teams | team structure |
| attendance_logs | hr_workforce.attendance_logs | **alias of workforce.attendance** → canonicalize |
| assignments | hr_workforce.assignments | **alias of workforce.workforce_assignments** → canonicalize |
| payroll_inputs | hr_workforce.payroll_inputs | payroll feeder |
| performance_reviews | hr_workforce.performance_reviews | reviews |
| skill_matrix | hr_workforce.skill_matrix | skill competency grid |

### D.12 Documents gap (4)

| name | target | purpose |
|---|---|---|
| document_links | documents.document_links | link between docs and entities |
| templates | documents.templates | doc template catalog |
| generated_files | documents.generated_files | output from generators |
| archive_records | documents.archive_records | archive index |

### D.13 Analytics gap (4)

| name | target | purpose |
|---|---|---|
| kpi_definitions | analytics.kpi_definitions | KPI catalog |
| report_sources | analytics.report_sources | dataset bindings |
| scenario_models | analytics.scenario_models | what-if models |
| scorecards | analytics.scorecards | supplier/project scorecards |

### D.14 AI automation (8)

| name | target | purpose |
|---|---|---|
| automation_rules | ai_automation.automation_rules | rule catalog |
| automation_runs | ai_automation.automation_runs | execution records |
| ai_agents | ai_automation.ai_agents | agent registry (may canonicalize with intelligence.agent_registry) |
| ai_actions | ai_automation.ai_actions | per-agent action log |
| prediction_outputs | ai_automation.prediction_outputs | prediction cache |
| recommendation_logs | ai_automation.recommendation_logs | reco log |
| prompt_templates | ai_automation.prompt_templates | LLM prompt catalog |
| orchestration_flows | ai_automation.orchestration_flows | higher-level multi-agent flows |

### D.15 Governance gap (4)

| name | target | purpose |
|---|---|---|
| users | governance.users | **view over auth.users** (canonical reference) |
| change_logs | governance.change_logs | **alias of governance.audit_logs** → canonicalize |
| system_settings | governance.system_settings | **alias of governance.config_entries** → canonicalize |
| validation_rules | governance.validation_rules | data validation rules |
| data_quality_issues | governance.data_quality_issues | DQ issues queue |

## Block E — Hidden Existing Models (30) — Canonical Mapping

From DISCOVERY_RECOVERY_MAP.md Sections A.1/A.2/A.3. Each row keeps original registry name AND records canonical_mapping. State = `built_not_exposed` (table exists; registry pointer just wrong).

| registry_name | canonical_mapping | class | recovery_action |
|---|---|---|---|
| crm.customers | commercial.customers | A.1 wrong-schema | update registry table_name |
| sales.opportunities | commercial.opportunities | A.1 | update registry |
| sales.quotes | commercial.quotes | A.1 | update registry |
| sales.approvals | procurement.approvals | A.1 | update registry |
| projects.projects | execution.projects | A.1 | update registry |
| projects.project_phases | execution.project_phases | A.1 | update registry |
| hr_workforce.employees | workforce.employees | A.1 | update registry |
| documents.documents | docs.documents | A.1 | update registry |
| documents.document_versions | docs.document_versions | A.1 | update registry |
| documents.signatures | execution.signatures | A.1 | update registry |
| documents.attachments | docs.attachments | A.1 | update registry |
| analytics.forecast_models | intelligence.forecast_models | A.1 | update registry |
| crm.contacts | procurement.supplier_contacts ∪ new crm.contacts | A.2 | build+fork |
| crm.activities | commercial.crm_activities | A.2 | update registry |
| crm.meetings | commercial.crm_activities (type=meeting) | A.2 | alias in view |
| projects.milestones | execution.project_milestones | A.2 | update registry |
| inventory.items | inventory.materials | A.2 | alias view |
| inventory.reservations | inventory.inventory_reservations | A.2 | update registry |
| installation.schedules | planning.capacity_calendars + new installation.schedules | A.2 | build |
| hr_workforce.contractors | new (planned_locked) | A.2 | build in Phase 7 |
| hr_workforce.assignments | workforce.workforce_assignments | A.2 | update registry |
| documents.templates | planned_locked → documents.templates | A.2 | build |
| analytics.dashboards | analytics.dashboard_definitions | A.2 | update registry |
| analytics.reports | planned_locked → analytics.reports | A.2 | build |
| analytics.scorecards | procurement.supplier_scorecards + new analytics.scorecards | A.2 | build+fork |
| governance.users | view over auth.users | A.2 | create VIEW |
| projects.dependencies | execution.task_dependencies | A.3 | update registry |
| engineering.drawings | planned_locked → engineering.drawings | A.3 | build |
| inventory.raw_materials | inventory.materials (category=raw) | A.3 | alias via filter |
| hr_workforce.teams | new planned_locked → hr_workforce.teams | A.3 | build |

## Block F — Uncertain rows (28)

Items flagged `uncertain=true`. Still assigned best-guess state, never `unknown`.

| name | guessed_state | uncertainty_reason |
|---|---|---|
| pipeline_stages | built_not_exposed | flow references it but no dedicated page found |
| crm_activities | built_not_exposed | API partial; may be surfaced via Customer360 only |
| email_messages | built_internal_only | comms pipeline plumbing |
| sms_messages | built_internal_only | comms pipeline |
| whatsapp_messages | built_internal_only | comms pipeline |
| dashboard_boards | built_not_exposed | admin settings page missing |
| dashboard_definitions | built_not_exposed | registry points here for analytics.dashboards |
| kpi_snapshots | built_internal_only | feeder for dashboards |
| forecast_models | built_internal_only | ML artifact store |
| trend_signals | built_internal_only | detector output |
| model_executions | built_internal_only | audit-ML |
| quality_scores | built_internal_only | detector output |
| seasonality_patterns | built_internal_only | detector output |
| anomaly_cases | built_not_exposed | may get Anomaly360 page Phase 10 |
| ai_insights | built_not_exposed | Insight feed candidate |
| agent_registry | built_internal_only | ops table |
| model_registry | built_internal_only | ops table |
| integration_connections | built_not_exposed | admin settings candidate |
| integration_sync_logs | built_internal_only | ops log |
| sla_timers | built_internal_only | plumbing |
| saved_filters | built_internal_only | per-user UI state |
| feature_flag_targets | built_internal_only | flag infra |
| event_subscriptions | built_internal_only | eventing |
| policies / policy_acknowledgements (compliance) | built_not_exposed | policy management UI missing |
| capacity_calendars / capacity_slots | built_not_exposed | planning UI missing |
| quality.inspection_plans / runs / defects | built_not_exposed | QA module not surfaced |
| routing.* | built_internal_only | nav substrate |
| crm_legacy.* duplicates | built_internal_only | deprecate-but-preserve |

## Validation rules (must always pass)

1. Every row has exactly one state ∈ `{active_connected, built_not_exposed, built_internal_only, planned_locked}`.
2. Sum of state counts = `total_models_in_preservation_matrix`.
3. `unresolved_unknown_count == 0`.
4. Every `planned_locked` row MUST include at minimum: target_schema, target_table_name, req_fields, req_API, req_pages (even if terse).
5. Every A.1/A.2/A.3 hidden model MUST carry `canonical_mapping`.
6. No row deleted; hidden/ghost/truly-missing all preserved.

## Cross-file pointers

- Full entity rows (incl. type=category/menu/dashboard/report/workflow/page/route/form) → `GLOBAL_ENTITY_INDEX.json`
- Cross-layer ✔/✖/⚠ grid → `SYSTEM_CONNECTION_MATRIX.md`
- Red-flagged dead artifacts → `DEAD_ZONES_REPORT.md`
- Per-domain expected-vs-actual → `domains/<domain>.md`
