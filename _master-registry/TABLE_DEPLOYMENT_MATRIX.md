# TABLE DEPLOYMENT MATRIX — Techno-Kol Uzi ERP 2026

| Field | Value |
|---|---|
| Generated | 2026-04-18 |
| Source of table list | `_master-registry/_all_tables.txt` (237 rows) |
| Source of migrations | `supabase/migrations/00000_*…00042_*.sql` (43 files) |
| `deployed_to_supabase` default | **pending — Phase 11** (no verification run yet; per B-D004/B-D013) |
| `api_connected` / `ui_connected` | derived from MODEL_COVERAGE_MATRIX Block A |

Columns: `schema.table | migration_file | migration_exists | deployed_to_supabase | verified | api_connected | ui_connected | permission_decided | rls_decision | source_of_truth_role`

Value legend:
- `migration_exists` — Y if a `CREATE TABLE` statement for this name appears in any migration file
- `deployed_to_supabase` — `pending` (all rows — Phase 11 sets to `Y`/`N`)
- `verified` — always `N` at Phase 1 (per B-D013)
- `api_connected` — Y/partial/N derived from MODEL_COVERAGE Block A `found_in_api`
- `ui_connected` — Y/partial/N from Block A `found_in_page`
- `permission_decided` — Y if 17×9 matrix entry exists per D029 (most = N at Phase 1)
- `rls_decision` — Y/partial/N from Block A `rls_decision_defined`
- `source_of_truth_role` — `canonical | duplicate | legacy | infra | orphan | missing`

Evidence: each row cites `B-E013` baseline + `B-E014` migration count + migration number column.

---

## Block A — 237 rows

Migration file assignment convention: `00000_master_schema.sql` owns the initial create for most canonical tables (per SUMMARY baseline). Expansion tables mapped to `00010/00011/00027/00029` and named variants. When the exact migration is uncertain, we list the most plausible owner; Phase 2 confirms with `grep`.

| schema.table | migration_file | migration_exists | deployed_to_supabase | verified | api_connected | ui_connected | permission_decided | rls_decision | source_of_truth_role |
|---|---|---|---|---|---|---|---|---|---|
| analytics.dashboard_board_widgets | 00021_dashboard_tables.sql | Y | pending | N | uncertain | N | N | N | orphan |
| analytics.dashboard_boards | 00021_dashboard_tables.sql | Y | pending | N | uncertain | N | N | N | canonical |
| analytics.dashboard_definitions | 00021_dashboard_tables.sql | Y | pending | N | uncertain | N | N | N | canonical |
| analytics.dashboard_widgets | 00021_dashboard_tables.sql | Y | pending | N | uncertain | N | N | N | duplicate |
| analytics.kpi_snapshots | 00021_dashboard_tables.sql | Y | pending | N | uncertain | N | N | N | orphan |
| analytics.read_model_invalidations | 00015_read_model_views.sql | Y | pending | N | uncertain | N | N | N | orphan |
| analytics.rm_ai_summary | 00015_read_model_views.sql | Y | pending | N | Y | N | N | N | canonical |
| analytics.rm_executive_summary | 00015_read_model_views.sql | Y | pending | N | Y | N | N | N | canonical |
| analytics.rm_finance_summary | 00015_read_model_views.sql | Y | pending | N | Y | N | N | N | canonical |
| analytics.rm_operations_summary | 00015_read_model_views.sql | Y | pending | N | Y | N | N | N | canonical |
| analytics.rm_procurement_summary | 00015_read_model_views.sql | Y | pending | N | Y | N | N | N | canonical |
| analytics.rm_workforce_summary | 00015_read_model_views.sql | Y | pending | N | Y | N | N | N | canonical |
| analytics.user_dashboard_boards | 00021_dashboard_tables.sql | Y | pending | N | N | N | N | N | orphan |
| commercial.crm_activities | 00000_master_schema.sql | Y | pending | N | uncertain | N | N | N | canonical |
| commercial.customer_contacts | 00000_master_schema.sql | Y | pending | N | uncertain | N | N | N | canonical |
| commercial.customer_portal_accounts | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| commercial.customers | 00000_master_schema.sql | Y | pending | N | Y | Y | partial | partial | canonical |
| commercial.lead_tag_assignments | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| commercial.lead_tags | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| commercial.leads | 00000_master_schema.sql | Y | pending | N | Y | Y | partial | partial | canonical |
| commercial.opportunities | 00000_master_schema.sql | Y | pending | N | Y | Y | partial | partial | canonical |
| commercial.pipeline_stages | 00000_master_schema.sql | Y | pending | N | uncertain | N | N | N | canonical |
| commercial.pricing_snapshots | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| commercial.quote_approval_rules | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| commercial.quote_lines | 00000_master_schema.sql | Y | pending | N | partial | N | N | N | canonical |
| commercial.quote_revisions | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| commercial.quotes | 00000_master_schema.sql | Y | pending | N | Y | Y | partial | partial | canonical |
| comms.chatbot_sessions | 00010/00011 expansion | Y | pending | N | N | N | N | N | orphan |
| comms.comms_threads | 00010/00011 expansion | Y | pending | N | N | N | N | N | orphan |
| comms.email_messages | 00010/00011 expansion | Y | pending | N | uncertain | N | N | N | canonical |
| comms.help_articles | 00010/00011 expansion | Y | pending | N | N | N | N | N | orphan |
| comms.notification_deliveries | 00010/00011 expansion | Y | pending | N | N | N | N | N | orphan |
| comms.notifications | 00010/00011 expansion | Y | pending | N | Y | partial | N | N | duplicate |
| comms.portal_sessions | 00010/00011 expansion | Y | pending | N | N | N | N | N | orphan |
| comms.portal_users | 00010/00011 expansion | Y | pending | N | partial | N | N | N | canonical |
| comms.sms_messages | 00010/00011 expansion | Y | pending | N | N | N | N | N | orphan |
| comms.support_sla_tracking | 00010/00011 expansion | Y | pending | N | N | N | N | N | orphan |
| comms.support_tickets | 00010/00011 expansion | Y | pending | N | Y | partial | N | N | canonical |
| comms.whatsapp_messages | 00010/00011 expansion | Y | pending | N | N | N | N | N | orphan |
| compliance.policies | 00010/00011 expansion | Y | pending | N | N | N | N | N | orphan |
| compliance.policy_acknowledgements | 00010/00011 expansion | Y | pending | N | N | N | N | N | orphan |
| crm.lead_activities | 00000_master_schema.sql | Y | pending | N | partial | N | N | N | legacy |
| crm.leads | 00000_master_schema.sql | Y | pending | N | partial | partial | N | N | duplicate |
| crm.opportunities | 00000_master_schema.sql | Y | pending | N | partial | partial | N | N | duplicate |
| docs.attachments | 00000_master_schema.sql | Y | pending | N | uncertain | N | N | N | canonical |
| docs.document_classifications | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| docs.document_signature_requests | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| docs.document_versions | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| docs.documents | 00000_master_schema.sql | Y | pending | N | Y | Y | partial | partial | canonical |
| docs.ocr_results | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| docs.print_jobs | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| docs.scan_sessions | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| documents.classification_runs | 00010/00011 expansion | Y | pending | N | N | N | N | N | orphan |
| documents.document_chunks | 00010/00011 expansion | Y | pending | N | N | N | N | N | orphan |
| documents.document_relations | 00010/00011 expansion | Y | pending | N | N | N | N | N | orphan |
| documents.entity_extractions | 00010/00011 expansion | Y | pending | N | N | N | N | N | orphan |
| documents.extraction_runs | 00010/00011 expansion | Y | pending | N | N | N | N | N | orphan |
| documents.knowledge_cards | 00010/00011 expansion | Y | pending | N | N | N | N | N | orphan |
| documents.ocr_runs | 00010/00011 expansion | Y | pending | N | N | N | N | N | orphan |
| execution.alerts | 00000_master_schema.sql | Y | pending | N | partial | partial | N | N | canonical |
| execution.delivery_events | 00000_master_schema.sql | Y | pending | N | partial | N | N | N | canonical |
| execution.installation_events | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| execution.logistics_orders | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| execution.project_blockers | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| execution.project_cost_plans | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| execution.project_milestones | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| execution.project_phases | 00000_master_schema.sql | Y | pending | N | partial | partial | N | N | canonical |
| execution.project_risks | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| execution.projects | 00000_master_schema.sql | Y | pending | N | Y | Y | partial | partial | canonical |
| execution.signatures | 00000_master_schema.sql | Y | pending | N | uncertain | N | N | N | canonical |
| execution.task_attachments | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| execution.task_comments | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| execution.task_dependencies | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| execution.tasks | 00000_master_schema.sql | Y | pending | N | Y | Y | partial | partial | canonical |
| execution.work_order_qa_checklists | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| execution.work_order_qa_items | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| execution.work_order_tasks | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| execution.work_orders | 00000_master_schema.sql | Y | pending | N | Y | Y | partial | partial | canonical |
| finance.annual_tax_reports | 00010/00011 expansion | Y | pending | N | N | N | N | N | orphan |
| finance.bank_files | 00010/00011 expansion | Y | pending | N | N | N | N | N | orphan |
| finance.bank_matches | 00010/00011 expansion | Y | pending | N | N | N | N | N | orphan |
| finance.budget_entries | 00010/00011 expansion | Y | pending | N | partial | N | N | N | orphan |
| finance.cashflow_entries | 00010/00011 expansion | Y | pending | N | N | N | N | N | orphan |
| finance.collection_actions | 00010/00011 expansion | Y | pending | N | N | N | N | N | orphan |
| finance.collection_cases | 00010/00011 expansion | Y | pending | N | N | N | N | N | orphan |
| finance.consolidation_entries | 00010/00011 expansion | Y | pending | N | N | N | N | N | orphan |
| finance.costing_entries | 00010/00011 expansion | Y | pending | N | N | N | N | N | orphan |
| finance.dunning_campaigns | 00010/00011 expansion | Y | pending | N | N | N | N | N | orphan |
| finance.dunning_steps | 00010/00011 expansion | Y | pending | N | N | N | N | N | orphan |
| finance.expenses | 00000_master_schema.sql | Y | pending | N | partial | partial | N | N | canonical |
| finance.fx_rates | 00010/00011 expansion | Y | pending | N | N | N | N | N | orphan |
| finance.gl_transactions | 00000_master_schema.sql | Y | pending | N | partial | N | N | N | canonical |
| finance.invoice_lines | 00000_master_schema.sql | Y | pending | N | partial | N | N | N | canonical |
| finance.invoices | 00000_master_schema.sql | Y | pending | N | Y | Y | partial | partial | canonical |
| finance.payment_allocations | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| finance.payments | 00000_master_schema.sql | Y | pending | N | Y | Y | partial | partial | canonical |
| finance.receipts | 00000_master_schema.sql | Y | pending | N | partial | partial | N | N | canonical |
| finance.reconciliation_exceptions | 00010/00011 expansion | Y | pending | N | N | N | N | N | orphan |
| finance.reminder_schedules | 00010/00011 expansion | Y | pending | N | N | N | N | N | orphan |
| finance.tax_exports | 00010/00011 expansion | Y | pending | N | N | N | N | N | orphan |
| finance.tax_records | 00000_master_schema.sql | Y | pending | N | partial | N | N | N | canonical |
| finance.vat_records | 00000_master_schema.sql | Y | pending | N | partial | N | N | N | canonical |
| governance.alert_subscriptions | 00027/00029 expansion | Y | pending | N | N | N | N | N | orphan |
| governance.audit_log_attachments | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| governance.audit_logs | 00000_master_schema.sql | Y | pending | N | Y | partial | partial | partial | canonical |
| governance.command_logs | 00027/00029 expansion | Y | pending | N | N | N | N | N | orphan |
| governance.config_entries | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| governance.domain_events | 00000_master_schema.sql | Y | pending | N | uncertain | N | N | N | canonical |
| governance.escalation_rules | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| governance.event_deliveries | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| governance.event_subscriptions | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| governance.feature_flag_targets | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| governance.feature_flags | 00000_master_schema.sql | Y | pending | N | partial | partial | N | N | canonical |
| governance.health_checks | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| governance.idempotency_keys | 00008_idempotency_table.sql | Y | pending | N | N | N | N | N | infra |
| governance.integration_connections | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| governance.integration_sync_logs | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| governance.job_executions | 00000_master_schema.sql | Y | pending | N | partial | N | N | N | orphan |
| governance.object_permissions | 00000_master_schema.sql | Y | pending | N | partial | N | N | N | canonical |
| governance.permissions | 00000_master_schema.sql | Y | pending | N | Y | partial | Y | partial | duplicate |
| governance.queue_jobs | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| governance.role_permissions | 00000_master_schema.sql | Y | pending | N | Y | partial | Y | partial | duplicate |
| governance.roles | 00000_master_schema.sql | Y | pending | N | Y | Y | Y | partial | duplicate |
| governance.saved_filters | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| governance.security_events | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| governance.sla_timers | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| governance.state_history | 00000_master_schema.sql | Y | pending | N | uncertain | N | N | N | canonical |
| governance.user_preferences | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| governance.user_roles | 00000_master_schema.sql | Y | pending | N | Y | partial | Y | partial | duplicate |
| governance.users_profile | 00000_master_schema.sql | Y | pending | N | Y | Y | Y | partial | canonical |
| governance.validations_log | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| governance.webhook_deliveries | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| governance.webhook_endpoints | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| governance.workflow_instances | 00000_master_schema.sql | Y | pending | N | partial | N | N | N | canonical |
| governance.workflow_step_executions | 00000_master_schema.sql | Y | pending | N | N | N | N | N | canonical |
| governance.workflow_steps | 00000_master_schema.sql | Y | pending | N | N | N | N | N | canonical |
| governance.workflows | 00000_master_schema.sql | Y | pending | N | partial | partial | N | N | canonical |
| intelligence.agent_jobs | 00023_ai_agent_registry_and_views.sql | Y | pending | N | N | N | N | N | canonical |
| intelligence.agent_registry | 00023_ai_agent_registry_and_views.sql | Y | pending | N | partial | N | N | N | canonical |
| intelligence.ai_insights | 00023_ai_agent_registry_and_views.sql | Y | pending | N | partial | N | N | N | canonical |
| intelligence.anomaly_cases | 00023_ai_agent_registry_and_views.sql | Y | pending | N | partial | N | N | N | canonical |
| intelligence.anomaly_feedback | 00023_ai_agent_registry_and_views.sql | Y | pending | N | N | N | N | N | orphan |
| intelligence.decision_recommendations | 00023_ai_agent_registry_and_views.sql | Y | pending | N | N | N | N | N | orphan |
| intelligence.forecast_models | 00023_ai_agent_registry_and_views.sql | Y | pending | N | N | N | N | N | orphan |
| intelligence.model_executions | 00023_ai_agent_registry_and_views.sql | Y | pending | N | N | N | N | N | orphan |
| intelligence.model_registry | 00023_ai_agent_registry_and_views.sql | Y | pending | N | N | N | N | N | orphan |
| intelligence.quality_scores | 00023_ai_agent_registry_and_views.sql | Y | pending | N | N | N | N | N | orphan |
| intelligence.recommendation_feedback | 00023_ai_agent_registry_and_views.sql | Y | pending | N | N | N | N | N | orphan |
| intelligence.seasonality_patterns | 00023_ai_agent_registry_and_views.sql | Y | pending | N | N | N | N | N | orphan |
| intelligence.trend_signals | 00023_ai_agent_registry_and_views.sql | Y | pending | N | N | N | N | N | orphan |
| inventory.barcode_scans | 00010/00011 expansion | Y | pending | N | N | N | N | N | orphan |
| inventory.inventory | 00000_master_schema.sql | Y | pending | N | Y | Y | partial | partial | canonical |
| inventory.inventory_issues | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| inventory.inventory_movements | 00000_master_schema.sql | Y | pending | N | partial | N | N | N | canonical |
| inventory.inventory_receipts | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| inventory.inventory_reservations | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| inventory.inventory_transfers | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| inventory.manufacturing_batches | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| inventory.material_categories | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| inventory.material_lots | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| inventory.material_request_lines | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| inventory.material_requests | 00000_master_schema.sql | Y | pending | N | partial | N | N | N | canonical |
| inventory.materials | 00000_master_schema.sql | Y | pending | N | Y | Y | partial | partial | canonical |
| inventory.reorder_rules | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| inventory.shortage_snapshots | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| inventory.stock_count_lines | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| inventory.stock_counts | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| inventory.warehouses | 00000_master_schema.sql | Y | pending | N | partial | partial | N | N | canonical |
| maintenance.assets | 00027/00029 expansion | Y | pending | N | N | N | N | N | orphan |
| maintenance.work_orders | 00027/00029 expansion | Y | pending | N | N | N | N | N | duplicate (vs execution.work_orders) |
| orchestration.job_queue | 00024_orchestration_tables.sql | Y | pending | N | partial | N | N | N | canonical |
| orchestration.notifications | 00024_orchestration_tables.sql | Y | pending | N | partial | N | N | N | duplicate |
| orchestration.universal_inbox | 00024_orchestration_tables.sql | Y | pending | N | partial | partial | N | N | canonical |
| orchestration.workflow_definitions | 00024_orchestration_tables.sql | Y | pending | N | partial | N | N | N | canonical |
| orchestration.workflow_runs | 00024_orchestration_tables.sql | Y | pending | N | partial | N | N | N | canonical |
| orchestration.workflow_step_runs | 00024_orchestration_tables.sql | Y | pending | N | N | N | N | N | canonical |
| orchestration.workflow_steps | 00024_orchestration_tables.sql | Y | pending | N | N | N | N | N | canonical |
| planning.capacity_calendars | 00010/00011 expansion | Y | pending | N | N | N | N | N | orphan |
| planning.capacity_slots | 00010/00011 expansion | Y | pending | N | N | N | N | N | orphan |
| planning.demand_forecasts | 00010/00011 expansion | Y | pending | N | N | N | N | N | orphan |
| pricing.calculations | 00010/00011 expansion | Y | pending | N | N | N | N | N | orphan |
| pricing.rule_sets | 00010/00011 expansion | Y | pending | N | N | N | N | N | orphan |
| procurement.approval_steps | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| procurement.approvals | 00000_master_schema.sql | Y | pending | N | partial | partial | N | N | canonical |
| procurement.contract_milestones | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| procurement.contracts | 00000_master_schema.sql | Y | pending | N | partial | Y | N | N | canonical |
| procurement.purchase_order_lines | 00000_master_schema.sql | Y | pending | N | partial | N | N | N | canonical |
| procurement.purchase_orders | 00000_master_schema.sql | Y | pending | N | Y | Y | partial | partial | canonical |
| procurement.returns | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| procurement.rfq_comparison_snapshots | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| procurement.rfq_items | 00000_master_schema.sql | Y | pending | N | partial | N | N | N | canonical |
| procurement.rfq_supplier_invites | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| procurement.rfqs | 00000_master_schema.sql | Y | pending | N | Y | Y | partial | partial | canonical |
| procurement.supplier_contacts | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| procurement.supplier_invoices | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| procurement.supplier_portal_accounts | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| procurement.supplier_quote_lines | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| procurement.supplier_quotes | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| procurement.supplier_scorecards | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| procurement.suppliers | 00000_master_schema.sql | Y | pending | N | Y | Y | partial | partial | canonical |
| procurement.warranty_cases | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| public.app_menu | 00017_app_menu.sql | Y | pending | N | Y | Y | partial | partial | infra |
| public.customers | 00000_master_schema.sql | Y | pending | N | partial | partial | N | N | duplicate |
| public.employees | 00000_master_schema.sql | Y | pending | N | partial | partial | N | N | duplicate |
| public.inventory_items | 00000_master_schema.sql | Y | pending | N | partial | partial | N | N | duplicate |
| public.orders | 00000_master_schema.sql | Y | pending | N | partial | partial | N | N | legacy |
| public.properties | 00000_master_schema.sql | Y | pending | N | partial | partial | N | N | legacy (realestate leftover) |
| public.suppliers | 00000_master_schema.sql | Y | pending | N | partial | partial | N | N | duplicate |
| public.user_profiles | 00000_master_schema.sql | Y | pending | N | partial | partial | N | N | duplicate |
| quality.defects | 00010/00011 expansion | Y | pending | N | N | N | N | N | orphan |
| quality.inspection_plans | 00010/00011 expansion | Y | pending | N | N | N | N | N | orphan |
| quality.inspection_runs | 00010/00011 expansion | Y | pending | N | N | N | N | N | orphan |
| routing.menu_nodes | 00028_routing_and_ai_rpcs.sql | Y | pending | N | Y | N | N | N | canonical |
| routing.route_permission_map | 00028_routing_and_ai_rpcs.sql | Y | pending | N | partial | N | partial | N | canonical |
| routing.route_registry | 00028_routing_and_ai_rpcs.sql | Y | pending | N | partial | N | N | N | canonical |
| service.ticket_comments | 00010/00011 expansion | Y | pending | N | N | N | N | N | orphan |
| service.tickets | 00010/00011 expansion | Y | pending | N | partial | partial | N | N | duplicate (overlap comms.support_tickets) |
| treasury.bank_accounts | 00010/00011 expansion | Y | pending | N | N | N | N | N | orphan |
| treasury.cash_forecasts | 00010/00011 expansion | Y | pending | N | N | N | N | N | orphan |
| treasury.cash_positions | 00010/00011 expansion | Y | pending | N | N | N | N | N | orphan |
| workforce.attendance | 00000_master_schema.sql | Y | pending | N | partial | partial | N | N | canonical |
| workforce.employee_expenses | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| workforce.employee_pay_components | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| workforce.employees | 00000_master_schema.sql | Y | pending | N | Y | Y | partial | partial | canonical |
| workforce.employers | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| workforce.hr_profiles | 00000_master_schema.sql | Y | pending | N | partial | N | N | N | canonical |
| workforce.leave_requests | 00000_master_schema.sql | Y | pending | N | partial | partial | N | N | canonical |
| workforce.leave_types | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| workforce.pay_components | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| workforce.payroll_entries | 00000_master_schema.sql | Y | pending | N | partial | partial | N | N | canonical |
| workforce.payroll_exceptions | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| workforce.payroll_export_batches | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| workforce.payroll_runs | 00000_master_schema.sql | Y | pending | N | partial | partial | N | N | canonical |
| workforce.pension_records | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| workforce.shifts | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |
| workforce.wage_slips | 00000_master_schema.sql | Y | pending | N | partial | partial | N | N | canonical |
| workforce.workforce_assignments | 00000_master_schema.sql | Y | pending | N | N | N | N | N | orphan |

**Row count: 237 (matches `_all_tables.txt`).**

---

## Aggregates

| Metric | Value |
|---|--:|
| Total tables | 237 |
| `migration_exists = Y` | 237 |
| `deployed_to_supabase = pending` | 237 (all — Phase 11 will verify) |
| `verified = N` | 237 |
| `api_connected = Y` | 24 |
| `api_connected = partial` | 34 |
| `api_connected = N or uncertain` | 179 |
| `ui_connected = Y` | 15 |
| `ui_connected = partial` | 20 |
| `ui_connected = N` | 202 |
| `permission_decided = Y` | 5 |
| `permission_decided = partial` | 14 |
| `permission_decided = N` | 218 |
| `rls_decision = partial` | 16 |
| `rls_decision = N` | 221 |
| `source_of_truth_role = canonical` | ~110 |
| `source_of_truth_role = duplicate` | ~14 |
| `source_of_truth_role = legacy` | ~3 |
| `source_of_truth_role = orphan` | ~108 |
| `source_of_truth_role = infra` | ~2 |

**Key insight**: every table has a migration on disk, but none are verified-deployed. Phase 11 runs `mcp__supabase__list_tables` to flip each row's `deployed_to_supabase` / `verified`.
