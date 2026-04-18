# Discovery + Recovery Mapping
Generated: 2026-04-18T07:40:39.779Z
Method: pure read-only scan of C:\Users\kobi\Projects\techno-kol-uzi-2026, zero modifications

## Executive Summary
- total_registry_models: 342 (from _master-registry/models_registry.json)
- total_db_tables: 237 (from supabase/migrations/*.sql)
- total_db_views: 17
- total_db_functions (RPCs): 128
- total_fk_references: 382
- total_hidden_models_found: 30
- total_registry_missing_models: 105
- total_duplicates: 17
- total_schema_mismatches: 12
- total_dead_orphan_tables: 119
- total_unused_rpc_functions: 127 (of 128 created — literal-name strings never referenced in api-server source; may be called via migrations or dynamic RPC names)
- total_unmounted_route_files: 3 (dashboard, fin-router, saved-places)
- **How much of "missing" is actually hidden-but-existing: 29%**
- **How much is truly absent: 71%**

## The Hypothesis Answer
The user was **partially right**. Of 105 registry models with no matching DB table, 30 (29%) physically exist in the repo — 12 as tables in the wrong schema, 14 as implemented API routes without a backing table, and 4 as front-end API calls without a backing table. The remaining 75 (71%) are truly absent.

However, the bigger discovery is the **119 dead orphan tables** that exist in the DB and registry but have no FK-in and are not referenced in API SQL — the inverse problem: data structures exist but are disconnected from the working system. Combining both directions, roughly half of the registry surface area is shadow infrastructure (present but unwired). The user's hypothesis was right in spirit: a meaningful share of "missing" models are hiding in plain sight. But 75 of 105 missing registry entries (71%) still need to be built from scratch.

## Top 20 Recovery Wins

| # | entity | where found | what is missing | complexity |
|---|---|---|---|---|
| 1 | customers | commercial.customers, public.customers (DB) | registry says crm.customers — fix registry reference | low |
| 2 | opportunities | commercial.opportunities, crm.opportunities (DB) | registry says sales.opportunities — pick canonical schema | low |
| 3 | quotes | commercial.quotes (DB) | registry says sales.quotes — update table_name | low |
| 4 | approvals | procurement.approvals (DB) | registry says sales.approvals — rename registry pointer | low |
| 5 | projects | execution.projects (DB) | registry says projects.projects — update schema | low |
| 6 | project_phases | execution.project_phases (DB) | registry says projects.project_phases — fix schema | low |
| 7 | employees | workforce.employees, public.employees (DB) | registry says hr_workforce.employees — collapse duplicate | low |
| 8 | documents | docs.documents (DB) | registry says documents.documents — rename pointer | low |
| 9 | document_versions | docs.document_versions (DB) | registry says documents.document_versions — fix | low |
| 10 | signatures | execution.signatures (DB) | registry says documents.signatures — fix schema | low |
| 11 | attachments | docs.attachments (DB) | registry says documents.attachments — fix | low |
| 12 | forecast_models | intelligence.forecast_models (DB) | registry says analytics.forecast_models — rename | low |
| 13 | contacts | api-server/src/routes/supplier-details.ts, suppliers.ts | no DB table — add crm.contacts migration + wire routes | medium |
| 14 | activities | api-server/src/routes/crm-ultimate.ts | no DB table — map to commercial.crm_activities existing | low |
| 15 | milestones | api-server/src/routes/projects-module.ts, route-aliases.ts | create projects.milestones table | medium |
| 16 | items | api-server/src/routes/delivery-returns.ts, finance-enterprise.ts | map to inventory.inventory_items (public) or create alias | low |
| 17 | users | api-server/src/routes/audit-log.ts, auth.ts, chat.ts | create governance.users view over auth.users | low |
| 18 | templates | api-server/src/routes/contract-templates.ts, ai-prompt-templates.ts | create documents.templates table | medium |
| 19 | drawings | erp-app/src/pages/engineering/drawing-management | create engineering.drawings table | medium |
| 20 | dashboardRouter | api-server/src/routes/index.ts (imported not mounted) | add router.use('/dashboard', dashboardRouter) | low |

## Top 20 Critical Missing (truly absent)

| # | model | expected_table | evidence | priority |
|---|---|---|---|---|
| 1 | lead_sources | crm.lead_sources | none | P1_crm_core |
| 2 | communication_logs | crm.communication_logs | none | P1_crm_core |
| 3 | customer_segments | crm.customer_segments | none | P2_crm_analytics |
| 4 | quote_items | sales.quote_items | none | P0_sales_required |
| 5 | pricing_rules | sales.pricing_rules | none | P1_sales |
| 6 | discounts | sales.discounts | none | P1_sales |
| 7 | sales_orders | sales.sales_orders | none | P0_order_flow |
| 8 | sales_pipeline | sales.sales_pipeline | none | P1_pipeline |
| 9 | purchase_requests | procurement.purchase_requests | none | P0_procurement |
| 10 | purchase_order_items | procurement.purchase_order_items | none | P0_procurement |
| 11 | goods_receipts | procurement.goods_receipts | none | P0_procurement |
| 12 | stock_balances | inventory.stock_balances | none | P0_inventory |
| 13 | stock_movements | inventory.stock_movements | none | P0_inventory |
| 14 | batch_lots | inventory.batch_lots | none | P1_inventory |
| 15 | production_orders | production.production_orders | none | P0_production |
| 16 | work_centers | production.work_centers | none | P0_production |
| 17 | bom_headers | engineering.bom_headers | none | P0_engineering |
| 18 | bom_items | engineering.bom_items | none | P0_engineering |
| 19 | service_tickets | service.service_tickets | none | P0_service |
| 20 | sla_rules | service.sla_rules | none | P1_service |

## A. hidden_existing_models (30)

### A.1 Wrong-schema (12) — table exists at different schema than registry claims

| model | registry_expects | db_found_at | confidence |
|---|---|---|---|
| customers | crm.customers | commercial.customers, public.customers | high |
| opportunities | sales.opportunities | commercial.opportunities, crm.opportunities | high |
| quotes | sales.quotes | commercial.quotes | high |
| approvals | sales.approvals | procurement.approvals | high |
| projects | projects.projects | execution.projects | high |
| project_phases | projects.project_phases | execution.project_phases | high |
| employees | hr_workforce.employees | public.employees, workforce.employees | high |
| documents | documents.documents | docs.documents | high |
| document_versions | documents.document_versions | docs.document_versions | high |
| signatures | documents.signatures | execution.signatures | high |
| attachments | documents.attachments | docs.attachments | high |
| forecast_models | analytics.forecast_models | intelligence.forecast_models | high |

### A.2 Has API route, no DB table (14)

| model | expected_table | api_files | confidence |
|---|---|---|---|
| contacts | crm.contacts | supplier-details.ts, suppliers.ts | medium |
| activities | crm.activities | crm-ultimate.ts | medium |
| meetings | crm.meetings | crm-ultimate.ts, hr-enterprise.ts | medium |
| milestones | projects.milestones | projects-module.ts, route-aliases.ts | medium |
| items | inventory.items | delivery-returns.ts, dispatch-planning.ts, finance-enterprise.ts | medium |
| reservations | inventory.reservations | quote-builder.ts | medium |
| schedules | installation.schedules | ai-agents-system.ts, bi-scheduled-reports.ts, cashflow-management.ts | medium |
| contractors | hr_workforce.contractors | contractor-payment-engine.ts, hr.ts, payroll-module.ts | medium |
| assignments | hr_workforce.assignments | hr-enterprise.ts, sla-management.ts, work-orders.ts | medium |
| templates | documents.templates | ai-prompt-templates.ts, communication-marketing-engine.ts, contract-templates.ts | medium |
| dashboards | analytics.dashboards | bi-dashboards.ts | medium |
| reports | analytics.reports | ai-business-automation.ts, crm-analytics-sync.ts, external-api.ts | medium |
| scorecards | analytics.scorecards | shipping-freight.ts, supplier-intelligence-new.ts | medium |
| users | governance.users | audit-log.ts, auth.ts, chat.ts | medium |

### A.3 Has FE page/call, no DB table (4)

| model | expected_table | fe_calls | confidence |
|---|---|---|---|
| dependencies | projects.dependencies | supply-chain/bom-where-used/dependencies | medium |
| drawings | engineering.drawings | engineering/drawing-management/drawings, engineering/engineering-command-center/recentdrawings, engineering/engineering-office/drawings | medium |
| raw_materials | inventory.raw_materials | procurement/raw_materials_dashboard, procurement/raw_materials_list | medium |
| teams | hr_workforce.teams | fabrication/fab-installation-orders/teams, installation/installation-scheduling/teams, installation/installation-teams/availability | medium |

## B. registry_models_without_real_data (105 total)
Registry models where database.table_name points to a table that does NOT exist in any migration.

| # | model | expected_table | domain | category |
|---|---|---|---|---|
| 1 | lead_sources | crm.lead_sources | crm | truly_absent |
| 2 | customers | crm.customers | crm | hidden_in_other_schema |
| 3 | contacts | crm.contacts | crm | has_api_route_no_db |
| 4 | activities | crm.activities | crm | has_api_route_no_db |
| 5 | meetings | crm.meetings | crm | has_api_route_no_db |
| 6 | communication_logs | crm.communication_logs | crm | truly_absent |
| 7 | customer_segments | crm.customer_segments | crm | truly_absent |
| 8 | opportunities | sales.opportunities | sales | hidden_in_other_schema |
| 9 | quotes | sales.quotes | sales | hidden_in_other_schema |
| 10 | quote_items | sales.quote_items | sales | truly_absent |
| 11 | pricing_rules | sales.pricing_rules | sales | truly_absent |
| 12 | discounts | sales.discounts | sales | truly_absent |
| 13 | approvals | sales.approvals | sales | hidden_in_other_schema |
| 14 | sales_orders | sales.sales_orders | sales | truly_absent |
| 15 | sales_pipeline | sales.sales_pipeline | sales | truly_absent |
| 16 | projects | projects.projects | projects | hidden_in_other_schema |
| 17 | project_phases | projects.project_phases | projects | hidden_in_other_schema |
| 18 | project_tasks | projects.project_tasks | projects | truly_absent |
| 19 | milestones | projects.milestones | projects | has_api_route_no_db |
| 20 | dependencies | projects.dependencies | projects | has_fe_call_no_db |
| 21 | project_resources | projects.project_resources | projects | truly_absent |
| 22 | project_risk_entries | projects.project_risk_entries | projects | truly_absent |
| 23 | project_progress_logs | projects.project_progress_logs | projects | truly_absent |
| 24 | technical_specs | engineering.technical_specs | engineering | truly_absent |
| 25 | drawings | engineering.drawings | engineering | has_fe_call_no_db |
| 26 | bom_headers | engineering.bom_headers | engineering | truly_absent |
| 27 | bom_items | engineering.bom_items | engineering | truly_absent |
| 28 | revision_control | engineering.revision_control | engineering | truly_absent |
| 29 | product_configurations | engineering.product_configurations | engineering | truly_absent |
| 30 | engineering_requests | engineering.engineering_requests | engineering | truly_absent |
| 31 | approval_drawings | engineering.approval_drawings | engineering | truly_absent |
| 32 | supplier_price_lists | procurement.supplier_price_lists | procurement | truly_absent |
| 33 | purchase_requests | procurement.purchase_requests | procurement | truly_absent |
| 34 | purchase_order_items | procurement.purchase_order_items | procurement | truly_absent |
| 35 | goods_receipts | procurement.goods_receipts | procurement | truly_absent |
| 36 | procurement_approvals | procurement.procurement_approvals | procurement | truly_absent |
| 37 | items | inventory.items | inventory | has_api_route_no_db |
| 38 | raw_materials | inventory.raw_materials | inventory | has_fe_call_no_db |
| 39 | stock_balances | inventory.stock_balances | inventory | truly_absent |
| 40 | stock_movements | inventory.stock_movements | inventory | truly_absent |
| 41 | reservations | inventory.reservations | inventory | has_api_route_no_db |
| 42 | batch_lots | inventory.batch_lots | inventory | truly_absent |
| 43 | production_orders | production.production_orders | production | truly_absent |
| 44 | production_steps | production.production_steps | production | truly_absent |
| 45 | work_centers | production.work_centers | production | truly_absent |
| 46 | labor_logs | production.labor_logs | production | truly_absent |
| 47 | machine_logs | production.machine_logs | production | truly_absent |
| 48 | material_consumption | production.material_consumption | production | truly_absent |
| 49 | scrap_logs | production.scrap_logs | production | truly_absent |
| 50 | production_quality_checks | production.production_quality_checks | production | truly_absent |
| 51 | installation_orders | installation.installation_orders | installation | truly_absent |
| 52 | installation_tasks | installation.installation_tasks | installation | truly_absent |
| 53 | installation_teams | installation.installation_teams | installation | truly_absent |
| 54 | schedules | installation.schedules | installation | has_api_route_no_db |
| 55 | site_visits | installation.site_visits | installation | truly_absent |
| 56 | completion_reports | installation.completion_reports | installation | truly_absent |
| 57 | handover_documents | installation.handover_documents | installation | truly_absent |
| 58 | punch_lists | installation.punch_lists | installation | truly_absent |
| 59 | service_tickets | service.service_tickets | service | truly_absent |
| 60 | warranty_records | service.warranty_records | service | truly_absent |
| 61 | service_visits | service.service_visits | service | truly_absent |
| 62 | issue_categories | service.issue_categories | service | truly_absent |
| 63 | resolution_logs | service.resolution_logs | service | truly_absent |
| 64 | maintenance_plans | service.maintenance_plans | service | truly_absent |
| 65 | service_feedback | service.service_feedback | service | truly_absent |
| 66 | sla_rules | service.sla_rules | service | truly_absent |
| 67 | invoice_items | finance.invoice_items | finance | truly_absent |
| 68 | expense_categories | finance.expense_categories | finance | truly_absent |
| 69 | profitability_snapshots | finance.profitability_snapshots | finance | truly_absent |
| 70 | employees | hr_workforce.employees | hr_workforce | hidden_in_other_schema |
| 71 | contractors | hr_workforce.contractors | hr_workforce | has_api_route_no_db |
| 72 | teams | hr_workforce.teams | hr_workforce | has_fe_call_no_db |
| 73 | attendance_logs | hr_workforce.attendance_logs | hr_workforce | truly_absent |
| 74 | assignments | hr_workforce.assignments | hr_workforce | has_api_route_no_db |
| 75 | payroll_inputs | hr_workforce.payroll_inputs | hr_workforce | truly_absent |
| 76 | performance_reviews | hr_workforce.performance_reviews | hr_workforce | truly_absent |
| 77 | skill_matrix | hr_workforce.skill_matrix | hr_workforce | truly_absent |
| 78 | documents | documents.documents | documents | hidden_in_other_schema |
| 79 | document_links | documents.document_links | documents | truly_absent |
| 80 | document_versions | documents.document_versions | documents | hidden_in_other_schema |
| 81 | templates | documents.templates | documents | has_api_route_no_db |
| 82 | generated_files | documents.generated_files | documents | truly_absent |
| 83 | signatures | documents.signatures | documents | hidden_in_other_schema |
| 84 | attachments | documents.attachments | documents | hidden_in_other_schema |
| 85 | archive_records | documents.archive_records | documents | truly_absent |
| 86 | dashboards | analytics.dashboards | analytics | has_api_route_no_db |
| 87 | kpi_definitions | analytics.kpi_definitions | analytics | truly_absent |
| 88 | reports | analytics.reports | analytics | has_api_route_no_db |
| 89 | report_sources | analytics.report_sources | analytics | truly_absent |
| 90 | forecast_models | analytics.forecast_models | analytics | hidden_in_other_schema |
| 91 | scenario_models | analytics.scenario_models | analytics | truly_absent |
| 92 | scorecards | analytics.scorecards | analytics | has_api_route_no_db |
| 93 | automation_rules | ai_automation.automation_rules | ai_automation | truly_absent |
| 94 | automation_runs | ai_automation.automation_runs | ai_automation | truly_absent |
| 95 | ai_agents | ai_automation.ai_agents | ai_automation | truly_absent |
| 96 | ai_actions | ai_automation.ai_actions | ai_automation | truly_absent |
| 97 | prediction_outputs | ai_automation.prediction_outputs | ai_automation | truly_absent |
| 98 | recommendation_logs | ai_automation.recommendation_logs | ai_automation | truly_absent |
| 99 | prompt_templates | ai_automation.prompt_templates | ai_automation | truly_absent |
| 100 | orchestration_flows | ai_automation.orchestration_flows | ai_automation | truly_absent |
| 101 | users | governance.users | governance | has_api_route_no_db |
| 102 | change_logs | governance.change_logs | governance | truly_absent |
| 103 | system_settings | governance.system_settings | governance | truly_absent |
| 104 | validation_rules | governance.validation_rules | governance | truly_absent |
| 105 | data_quality_issues | governance.data_quality_issues | governance | truly_absent |

## C. duplicate_models_different_names (17)

| logical_entity | versions_found | suggested_canonical |
|---|---|---|
| leads | crm.leads / commercial.leads | crm.leads |
| customers | crm.customers / commercial.customers / public.customers | crm.customers |
| opportunities | sales.opportunities / commercial.opportunities / crm.opportunities | sales.opportunities |
| quotes | sales.quotes / commercial.quotes | sales.quotes |
| approvals | sales.approvals / procurement.approvals | sales.approvals |
| projects | projects.projects / execution.projects | projects.projects |
| project_phases | projects.project_phases / execution.project_phases | projects.project_phases |
| suppliers | procurement.suppliers / public.suppliers | procurement.suppliers |
| employees | hr_workforce.employees / public.employees / workforce.employees | hr_workforce.employees |
| documents | documents.documents / docs.documents | documents.documents |
| document_versions | documents.document_versions / docs.document_versions | documents.document_versions |
| signatures | documents.signatures / execution.signatures | documents.signatures |
| attachments | documents.attachments / docs.attachments | documents.attachments |
| forecast_models | analytics.forecast_models / intelligence.forecast_models | analytics.forecast_models |
| notifications | comms.notifications / orchestration.notifications | comms.notifications |
| work_orders | execution.work_orders / maintenance.work_orders | execution.work_orders |
| workflow_steps | governance.workflow_steps / orchestration.workflow_steps | governance.workflow_steps |

## D. orphan_real_tables (dead, no FK-in, not referenced in API SQL) — 119
These tables exist in DB migrations and appear in the registry, but no FK points to them and the api-server source never references their literal name. They are effectively unreachable.

| # | table |
|---|---|
| 1 | analytics.dashboard_board_widgets |
| 2 | analytics.kpi_snapshots |
| 3 | analytics.read_model_invalidations |
| 4 | analytics.rm_ai_summary |
| 5 | analytics.rm_executive_summary |
| 6 | analytics.rm_finance_summary |
| 7 | analytics.rm_operations_summary |
| 8 | analytics.rm_procurement_summary |
| 9 | analytics.rm_workforce_summary |
| 10 | analytics.user_dashboard_boards |
| 11 | commercial.customer_contacts |
| 12 | commercial.customer_portal_accounts |
| 13 | commercial.lead_tag_assignments |
| 14 | commercial.quote_approval_rules |
| 15 | commercial.quote_lines |
| 16 | commercial.quote_revisions |
| 17 | comms.chatbot_sessions |
| 18 | comms.email_messages |
| 19 | comms.help_articles |
| 20 | comms.notification_deliveries |
| 21 | comms.sms_messages |
| 22 | comms.support_sla_tracking |
| 23 | compliance.policy_acknowledgements |
| 24 | crm.lead_activities |
| 25 | docs.document_classifications |
| 26 | docs.document_signature_requests |
| 27 | docs.ocr_results |
| 28 | docs.print_jobs |
| 29 | docs.scan_sessions |
| 30 | documents.classification_runs |
| 31 | documents.document_chunks |
| 32 | documents.document_relations |
| 33 | documents.entity_extractions |
| 34 | documents.knowledge_cards |
| 35 | documents.ocr_runs |
| 36 | execution.delivery_events |
| 37 | execution.installation_events |
| 38 | execution.project_blockers |
| 39 | execution.project_cost_plans |
| 40 | execution.task_attachments |
| 41 | execution.task_comments |
| 42 | execution.task_dependencies |
| 43 | execution.work_order_qa_items |
| 44 | execution.work_order_tasks |
| 45 | finance.annual_tax_reports |
| 46 | finance.bank_matches |
| 47 | finance.budget_entries |
| 48 | finance.collection_actions |
| 49 | finance.consolidation_entries |
| 50 | finance.costing_entries |
| 51 | finance.dunning_steps |
| 52 | finance.fx_rates |
| 53 | finance.gl_transactions |
| 54 | finance.invoice_lines |
| 55 | finance.payment_allocations |
| 56 | finance.reconciliation_exceptions |
| 57 | finance.reminder_schedules |
| 58 | finance.tax_exports |
| 59 | finance.vat_records |
| 60 | governance.alert_subscriptions |
| 61 | governance.audit_log_attachments |
| 62 | governance.command_logs |
| 63 | governance.config_entries |
| 64 | governance.escalation_rules |
| 65 | governance.event_deliveries |
| 66 | governance.feature_flag_targets |
| 67 | governance.health_checks |
| 68 | governance.idempotency_keys |
| 69 | governance.job_executions |
| 70 | governance.object_permissions |
| 71 | governance.saved_filters |
| 72 | governance.security_events |
| 73 | governance.sla_timers |
| 74 | governance.state_history |
| 75 | governance.user_preferences |
| 76 | governance.validations_log |
| 77 | governance.webhook_deliveries |
| 78 | governance.workflow_step_executions |
| 79 | intelligence.agent_jobs |
| 80 | intelligence.ai_insights |
| 81 | intelligence.anomaly_feedback |
| 82 | intelligence.forecast_models |
| 83 | intelligence.model_executions |
| 84 | intelligence.quality_scores |
| 85 | intelligence.recommendation_feedback |
| 86 | intelligence.seasonality_patterns |
| 87 | intelligence.trend_signals |
| 88 | inventory.barcode_scans |
| 89 | inventory.inventory_issues |
| 90 | inventory.inventory_receipts |
| 91 | inventory.inventory_transfers |
| 92 | inventory.manufacturing_batches |
| 93 | inventory.material_request_lines |
| 94 | inventory.reorder_rules |
| 95 | inventory.shortage_snapshots |
| 96 | inventory.stock_count_lines |
| 97 | orchestration.job_queue |
| 98 | orchestration.universal_inbox |
| 99 | orchestration.workflow_step_runs |
| 100 | planning.capacity_slots |
| 101 | procurement.approval_steps |
| 102 | procurement.contract_milestones |
| 103 | procurement.rfq_comparison_snapshots |
| 104 | procurement.rfq_supplier_invites |
| 105 | procurement.supplier_scorecards |
| 106 | procurement.warranty_cases |
| 107 | public.user_profiles |
| 108 | routing.route_permission_map |
| 109 | service.ticket_comments |
| 110 | treasury.cash_forecasts |
| 111 | treasury.cash_positions |
| 112 | workforce.employee_expenses |
| 113 | workforce.employee_pay_components |
| 114 | workforce.hr_profiles |
| 115 | workforce.payroll_exceptions |
| 116 | workforce.payroll_export_batches |
| 117 | workforce.pension_records |
| 118 | workforce.wage_slips |
| 119 | workforce.workforce_assignments |

## E. unused_but_existing_data_structures

### E.1 Unmounted route files (imported in routes/index.ts but never mounted)

| name | type | file | risk_if_removed |
|---|---|---|---|
| dashboardRouter | api_route | api-server/src/routes/dashboard.ts | low — multiple dashboard-* routers exist |
| finRouterRouter | api_route | api-server/src/routes/fin-router.ts | low — many fin-* routers exist |
| savedPlacesRouter | api_route | api-server/src/routes/saved-places.ts | medium — check if UI uses /api/saved-places |

### E.2 Dead RPC functions (127 of 128 created)
Literal-string names never appear in api-server source code. They may be invoked via migrations only or via dynamic RPC names — manual review required.
Sample names: analytics.get_advanced_ai_agent_console_fast, analytics.get_ai_control_room_fast, analytics.get_command_center_fast, analytics.get_crm_control_room_fast, analytics.get_customer_360_fast, analytics.get_dashboard_board, analytics.get_dashboard_widget_data, analytics.get_document_intelligence_center_fast, analytics.get_executive_control_tower, analytics.get_finance_control_room_fast, analytics.get_finance_control_room_full, analytics.get_notification_center_fast, analytics.get_operations_control_room_fast, analytics.get_procurement_control_room_fast, analytics.get_service_control_room_fast, analytics.get_treasury_control_room_fast, analytics.get_universal_inbox_fast, analytics.get_workforce_control_room_fast, analytics.get_workforce_control_room_full, analytics.invalidate_read_model_rpc, analytics.refresh_all_materialized_views, analytics.refresh_executive_summary_snapshot, analytics.rpc_ai_control_room, analytics.rpc_executive_control_tower, analytics.rpc_finance_control_room, analytics.rpc_operations_control_room, analytics.rpc_procurement_control_room, analytics.rpc_refresh_all_read_models, analytics.rpc_workforce_control_room, commercial.approve_quote

## F. mismatched_schema_usage (12)

| wrong_reference | correct_reference | registry_location |
|---|---|---|
| crm.customers | commercial.customers or public.customers | _master-registry/models_registry.json (model_name_en=customers) |
| sales.opportunities | commercial.opportunities or crm.opportunities | _master-registry/models_registry.json (model_name_en=opportunities) |
| sales.quotes | commercial.quotes | _master-registry/models_registry.json (model_name_en=quotes) |
| sales.approvals | procurement.approvals | _master-registry/models_registry.json (model_name_en=approvals) |
| projects.projects | execution.projects | _master-registry/models_registry.json (model_name_en=projects) |
| projects.project_phases | execution.project_phases | _master-registry/models_registry.json (model_name_en=project_phases) |
| hr_workforce.employees | public.employees or workforce.employees | _master-registry/models_registry.json (model_name_en=employees) |
| documents.documents | docs.documents | _master-registry/models_registry.json (model_name_en=documents) |
| documents.document_versions | docs.document_versions | _master-registry/models_registry.json (model_name_en=document_versions) |
| documents.signatures | execution.signatures | _master-registry/models_registry.json (model_name_en=signatures) |
| documents.attachments | docs.attachments | _master-registry/models_registry.json (model_name_en=attachments) |
| analytics.forecast_models | intelligence.forecast_models | _master-registry/models_registry.json (model_name_en=forecast_models) |

## G. lost_connections (sample)
Pipeline entity-map declares 144 links between 16 entities. Sampling relationships declared at wiring-spec level where the target is missing, duplicated, or unwired:

| model_a | model_b | expected_relationship | evidence |
|---|---|---|---|
| lead | sales_opportunity | can_create (onyx-procurement/src/pipeline/entity-map.js:22) | target table sales.opportunities missing; exists as commercial.opportunities |
| customer | contract | has_many (wiring-spec.js:48) | registry says documents.contracts but DB has procurement.contracts |
| project | work_order | has_many (wiring-spec.js:54) | registry says projects.projects; DB has execution.projects — FK wiring uncertain |
| employee | payroll | has_many (wiring-spec.js:59) | workforce.employees exists; hr_workforce.payroll in registry missing |
| po | supplier_invoice | has_many (wiring-spec.js:52) | procurement.supplier_invoices exists but orphan (0 FK-in) |
| quote | quote_line | has_many (wiring-spec.js:50) | commercial.quote_lines exists as orphan (no FK-in) |
| project | material_request | has_many (wiring-spec.js:54) | inventory.material_request_lines orphan, no parent header table referenced |
| work_order | work_order_task | has_many (wiring-spec.js:55) | execution.work_order_tasks is orphan, no FK-in |
| invoice | invoice_line | implicit (registry) | finance.invoice_lines is orphan (no FK-in) |
| payroll | wage_slip | has_many (wiring-spec.js:61) | workforce.wage_slips is orphan (no FK-in) |

## H. recovery_candidates (sorted by complexity)

### H.1 LOW complexity (registry pointer fix, zero DB change) — 12 entries

| entity | where_found | what_is_missing_to_activate |
|---|---|---|
| customers | DB=commercial.customers | update registry.database.table_name to commercial.customers |
| opportunities | DB=commercial.opportunities | update registry.database.table_name to commercial.opportunities |
| quotes | DB=commercial.quotes | update registry.database.table_name to commercial.quotes |
| approvals | DB=procurement.approvals | update registry.database.table_name to procurement.approvals |
| projects | DB=execution.projects | update registry.database.table_name to execution.projects |
| project_phases | DB=execution.project_phases | update registry.database.table_name to execution.project_phases |
| employees | DB=public.employees | update registry.database.table_name to public.employees |
| documents | DB=docs.documents | update registry.database.table_name to docs.documents |
| document_versions | DB=docs.document_versions | update registry.database.table_name to docs.document_versions |
| signatures | DB=execution.signatures | update registry.database.table_name to execution.signatures |
| attachments | DB=docs.attachments | update registry.database.table_name to docs.attachments |
| forecast_models | DB=intelligence.forecast_models | update registry.database.table_name to intelligence.forecast_models |

### H.2 MEDIUM complexity (API route exists, add DB table) — 14 entries

| entity | where_found | what_is_missing_to_activate |
|---|---|---|
| contacts | API routes: supplier-details.ts,suppliers.ts | create migration for crm.contacts, then FK-wire |
| activities | API routes: crm-ultimate.ts | create migration for crm.activities, then FK-wire |
| meetings | API routes: crm-ultimate.ts,hr-enterprise.ts | create migration for crm.meetings, then FK-wire |
| milestones | API routes: projects-module.ts,route-aliases.ts | create migration for projects.milestones, then FK-wire |
| items | API routes: delivery-returns.ts,dispatch-planning.ts,finance-enterprise.ts | create migration for inventory.items, then FK-wire |
| reservations | API routes: quote-builder.ts | create migration for inventory.reservations, then FK-wire |
| schedules | API routes: ai-agents-system.ts,bi-scheduled-reports.ts,cashflow-management.ts | create migration for installation.schedules, then FK-wire |
| contractors | API routes: contractor-payment-engine.ts,hr.ts,payroll-module.ts | create migration for hr_workforce.contractors, then FK-wire |
| assignments | API routes: hr-enterprise.ts,sla-management.ts,work-orders.ts | create migration for hr_workforce.assignments, then FK-wire |
| templates | API routes: ai-prompt-templates.ts,communication-marketing-engine.ts,contract-templates.ts | create migration for documents.templates, then FK-wire |
| dashboards | API routes: bi-dashboards.ts | create migration for analytics.dashboards, then FK-wire |
| reports | API routes: ai-business-automation.ts,crm-analytics-sync.ts,external-api.ts | create migration for analytics.reports, then FK-wire |
| scorecards | API routes: shipping-freight.ts,supplier-intelligence-new.ts | create migration for analytics.scorecards, then FK-wire |
| users | API routes: audit-log.ts,auth.ts,chat.ts | create migration for governance.users, then FK-wire |

### H.3 MEDIUM complexity (FE page exists, add DB + route) — 4 entries

| entity | where_found | what_is_missing_to_activate |
|---|---|---|
| dependencies | FE paths: supply-chain/bom-where-used/dependencies | create migration, create route file, mount in routes/index.ts |
| drawings | FE paths: engineering/drawing-management/drawings,engineering/engineering-command-center/recentdrawings,engineering/engineering-office/drawings | create migration, create route file, mount in routes/index.ts |
| raw_materials | FE paths: procurement/raw_materials_dashboard,procurement/raw_materials_list | create migration, create route file, mount in routes/index.ts |
| teams | FE paths: fabrication/fab-installation-orders/teams,installation/installation-scheduling/teams,installation/installation-teams/availability | create migration, create route file, mount in routes/index.ts |

### H.4 HIGH complexity (truly absent — 75 entries, must build DB+API+FE+registry)
See Section B for the full list filtered where category=truly_absent.

### H.5 ORPHAN RECOVERY (reverse direction — 119 dead tables that could be reactivated)
DB has 119 tables with no FK-in and zero code references. Many are high-value subsystems that just need API routes + FE pages to come online. Examples:
- finance.gl_transactions, finance.vat_records, finance.invoice_lines, finance.payment_allocations (core finance disconnected)
- intelligence.* (13 AI tables — forecast_models, ai_insights, anomaly_feedback, trend_signals, etc. — all dead)
- workforce.wage_slips, workforce.pension_records, workforce.attendance, workforce.hr_profiles (HR core disconnected)
- governance.webhook_deliveries, governance.event_deliveries, governance.sla_timers, governance.state_history (platform plumbing dead)
- execution.work_order_tasks, execution.task_comments, execution.delivery_events, execution.project_blockers (project detail tables unused)
- inventory.inventory_receipts, inventory.inventory_issues, inventory.inventory_transfers, inventory.barcode_scans (warehouse ops dead)
- procurement.warranty_cases, procurement.rfq_comparison_snapshots, procurement.supplier_scorecards (procurement tail dead)
See Section D for the full list of 119 tables.

## Appendix: raw data sources
- supabase/migrations/*.sql — 42 files (237 tables, 17 views, 128 RPCs, 382 FK edges)
- api-server/src/routes/*.ts — 335 files including index.ts (4,909 endpoints across 328 mounted routers)
- api-server/src/routes/index.ts — 858 lines; 331 imports, 328 mounts, 3 unmounted
- onyx-procurement/src/pipeline/entity-map.js — 16 entities, 144 declared links
- onyx-procurement/src/pipeline/wiring-spec.js — ENTITY_RELATIONSHIPS for 22 entities
- _master-registry/models_registry.json — 342 model entries
- lib-client/api-zod/src/generated/api.ts — 4,175-line Zod schema (generated from OpenAPI)
- erp-app/src/pages — 109 top-level page files, 1,651 FE source files, 1,362 distinct /api/ paths referenced

### Cross-reference index files produced during scan (in _audit_tmp/)
- _scan_db.json (DB tables/views/RPCs/FKs per migration)
- _scan_api.json (API routes + endpoints per file)
- _cross.json (registry vs DB cross-reference)
- _categorized.json (105 missing models classified)
- _hidden.json (12 schema-mismatched)
- _orphans_dead_v3.json (119 truly dead tables)
- _fe.json (FE API call inventory)
- _rpcs.json (RPC usage analysis)
- _unmounted.json (unmounted routers)
