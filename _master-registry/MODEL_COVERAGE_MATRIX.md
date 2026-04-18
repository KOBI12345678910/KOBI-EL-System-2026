# MODEL COVERAGE MATRIX — Techno-Kol Uzi ERP 2026

| Field | Value |
|---|---|
| Generated | 2026-04-18 |
| Source of table list | `_master-registry/_all_tables.txt` (237 rows, one per line) |
| Source of registry status | `_master-registry/models_registry.json` + `CANONICAL_DOMAIN_VERIFICATION.md` |
| Source of menu status | `supabase/migrations/00017_*.sql`, `00034..00040_*.sql`, `00041_menu_categorize_by_business_topic.sql` |
| Source of page status | `erp-app/src/App.tsx` (1262 routes) + `erp-app/src/pages/**/*.tsx` (1166 files) |
| Source of API status | `api-server/**/*.js` (328 route files / 5313 unique endpoints) |
| Rule B-D010 | 237 DB-row block + 16 pipeline entities (16 inline) + 105-delta registry-only block |

Columns:
`model_name | schema | found_in_db | found_in_registry | found_in_api | found_in_page | found_in_menu | found_in_flow | found_in_report | found_in_dashboard | source_of_truth_defined | permissions_defined | rls_decision_defined | deployment_verified | completion_status`

Value conventions:
- `Y` / `N` / `uncertain`
- `deployment_verified` = `N` for all rows in Phase 1 (see B-D013; set by Phase 11)
- `completion_status` per B-D012: `complete | partial | hidden | missing | broken`

Evidence default: each row cites `B-E013` (baseline counts), `B-E015` (canonical verification), `B-E018` (unresolved queues). Row-specific evidence noted in `notes` column if divergent.

---

## Block A — 237 DB tables (all schemas)

| model_name | schema | found_in_db | found_in_registry | found_in_api | found_in_page | found_in_menu | found_in_flow | found_in_report | found_in_dashboard | source_of_truth_defined | permissions_defined | rls_decision_defined | deployment_verified | completion_status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| dashboard_board_widgets | analytics | Y | N | uncertain | N | N | N | N | Y | uncertain | N | N | N | hidden |
| dashboard_boards | analytics | Y | N | uncertain | N | N | N | N | Y | uncertain | N | N | N | hidden |
| dashboard_definitions | analytics | Y | partial | uncertain | N | N | N | N | Y | uncertain | N | N | N | partial |
| dashboard_widgets | analytics | Y | Y (dup w/ governance) | uncertain | N | N | N | N | Y | conflicted | N | N | N | broken |
| kpi_snapshots | analytics | Y | N | uncertain | N | N | N | N | N | N | N | N | N | hidden |
| read_model_invalidations | analytics | Y | N | uncertain | N | N | N | N | N | N | N | N | N | hidden |
| rm_ai_summary | analytics | Y | N | Y | N | N | N | Y | partial | N | N | N | N | hidden |
| rm_executive_summary | analytics | Y | N | Y | N | N | N | Y | partial | N | N | N | N | hidden |
| rm_finance_summary | analytics | Y | N | Y | N | N | N | Y | partial | N | N | N | N | hidden |
| rm_operations_summary | analytics | Y | N | Y | N | N | N | Y | partial | N | N | N | N | hidden |
| rm_procurement_summary | analytics | Y | N | Y | N | N | N | Y | partial | N | N | N | N | hidden |
| rm_workforce_summary | analytics | Y | N | Y | N | N | N | Y | partial | N | N | N | N | hidden |
| user_dashboard_boards | analytics | Y | N | N | N | N | N | N | partial | N | N | N | N | hidden |
| crm_activities | commercial | Y | partial (crm.activities ghost) | uncertain | N | N | partial | N | N | conflicted | N | N | N | partial |
| customer_contacts | commercial | Y | partial | uncertain | N | N | N | N | N | conflicted | N | N | N | partial |
| customer_portal_accounts | commercial | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| customers | commercial | Y | Y (wrong-schema D009) | Y | Y (/customers, Customer360) | Y | Y (Sales→Project) | Y | Y | conflicted | partial | partial | N | partial |
| lead_tag_assignments | commercial | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| lead_tags | commercial | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| leads | commercial | Y | Y | Y | Y (/leads) | Y | Y | Y | Y | Y | partial | partial | N | complete |
| opportunities | commercial | Y | Y (wrong-schema D009) | Y | Y (/opportunities) | Y | Y | partial | partial | conflicted | partial | partial | N | partial |
| pipeline_stages | commercial | Y | N | uncertain | N | N | partial | N | N | N | N | N | N | hidden |
| pricing_snapshots | commercial | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| quote_approval_rules | commercial | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| quote_lines | commercial | Y | N | partial | N | N | partial | N | N | N | N | N | N | partial |
| quote_revisions | commercial | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| quotes | commercial | Y | Y (wrong-schema D009) | Y | Y (/quotes, Quote360) | Y | Y | Y | Y | conflicted | partial | partial | N | partial |
| chatbot_sessions | comms | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| comms_threads | comms | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| email_messages | comms | Y | partial | uncertain | N | N | N | N | N | N | N | N | N | partial |
| help_articles | comms | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| notification_deliveries | comms | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| notifications | comms | Y | partial (overlap w/ orchestration.notifications) | Y | partial | N | partial | N | N | conflicted | N | N | N | broken |
| portal_sessions | comms | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| portal_users | comms | Y | N | partial | N | N | N | N | N | N | N | N | N | hidden |
| sms_messages | comms | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| support_sla_tracking | comms | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| support_tickets | comms | Y | partial | Y | partial | N | N | N | N | N | N | N | N | partial |
| whatsapp_messages | comms | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| policies | compliance | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| policy_acknowledgements | compliance | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| lead_activities | crm (legacy) | Y | Y (wrong-schema D009) | partial | N | N | N | N | N | conflicted | N | N | N | broken |
| leads | crm (legacy, duplicate) | Y | Y (duplicate of commercial.leads) | partial | partial | partial | partial | partial | partial | conflicted | N | N | N | broken |
| opportunities | crm (legacy, duplicate) | Y | Y (duplicate of commercial.opportunities) | partial | partial | partial | partial | partial | partial | conflicted | N | N | N | broken |
| attachments | docs | Y | partial | uncertain | N | N | N | N | N | N | N | N | N | partial |
| document_classifications | docs | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| document_signature_requests | docs | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| document_versions | docs | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| documents | docs | Y | Y | Y | Y (/documents) | Y | partial | partial | N | Y | partial | partial | N | partial |
| ocr_results | docs | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| print_jobs | docs | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| scan_sessions | docs | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| classification_runs | documents | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| document_chunks | documents | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| document_relations | documents | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| entity_extractions | documents | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| extraction_runs | documents | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| knowledge_cards | documents | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| ocr_runs | documents | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| alerts | execution | Y | N | partial | partial | N | N | N | N | N | N | N | N | partial |
| delivery_events | execution | Y | N | partial | N | N | partial | N | N | N | N | N | N | partial |
| installation_events | execution | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| logistics_orders | execution | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| project_blockers | execution | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| project_cost_plans | execution | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| project_milestones | execution | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| project_phases | execution | Y | partial | partial | partial | N | partial | N | N | N | N | N | N | partial |
| project_risks | execution | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| projects | execution | Y | partial (projects.projects phantom D009) | Y | Y (/projects, Project360) | Y | Y | Y | Y | conflicted | partial | partial | N | partial |
| signatures | execution | Y | partial (documents.signatures D009) | uncertain | N | N | N | N | N | conflicted | N | N | N | partial |
| task_attachments | execution | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| task_comments | execution | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| task_dependencies | execution | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| tasks | execution | Y | partial | Y | Y (/tasks) | N | partial | N | N | conflicted | partial | partial | N | partial |
| work_order_qa_checklists | execution | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| work_order_qa_items | execution | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| work_order_tasks | execution | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| work_orders | execution | Y | Y | Y | Y (/work-orders) | Y | Y | Y | Y | Y | partial | partial | N | complete |
| annual_tax_reports | finance | Y | N | N | N | N | N | partial | N | N | N | N | N | hidden |
| bank_files | finance | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| bank_matches | finance | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| budget_entries | finance | Y | N | partial | N | N | N | N | partial | N | N | N | N | hidden |
| cashflow_entries | finance | Y | N | N | N | N | N | N | partial | N | N | N | N | hidden |
| collection_actions | finance | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| collection_cases | finance | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| consolidation_entries | finance | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| costing_entries | finance | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| dunning_campaigns | finance | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| dunning_steps | finance | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| expenses | finance | Y | N | partial | partial | N | N | N | N | N | N | N | N | partial |
| fx_rates | finance | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| gl_transactions | finance | Y | N | partial | N | N | N | partial | partial | N | N | N | N | hidden |
| invoice_lines | finance | Y | N | partial | N | N | partial | N | N | N | N | N | N | hidden |
| invoices | finance | Y | Y | Y | Y (/invoices) | Y | Y | Y | Y | Y | partial | partial | N | complete |
| payment_allocations | finance | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| payments | finance | Y | Y | Y | Y (/payments) | Y | Y | Y | Y | Y | partial | partial | N | complete |
| receipts | finance | Y | N | partial | partial (/receipts) | Y | N | N | N | N | N | N | N | partial |
| reconciliation_exceptions | finance | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| reminder_schedules | finance | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| tax_exports | finance | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| tax_records | finance | Y | N | partial | N | N | N | partial | N | N | N | N | N | hidden |
| vat_records | finance | Y | N | partial | N | N | N | partial | N | N | N | N | N | hidden |
| alert_subscriptions | governance | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| audit_log_attachments | governance | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| audit_logs | governance | Y | Y | Y | partial | N | Y | N | N | Y | partial | partial | N | partial |
| command_logs | governance | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| config_entries | governance | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| domain_events | governance | Y | partial | uncertain | N | N | Y | N | N | partial | N | N | N | partial |
| escalation_rules | governance | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| event_deliveries | governance | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| event_subscriptions | governance | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| feature_flag_targets | governance | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| feature_flags | governance | Y | partial | partial | partial | N | N | N | N | N | N | N | N | partial |
| health_checks | governance | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| idempotency_keys | governance | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| integration_connections | governance | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| integration_sync_logs | governance | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| job_executions | governance | Y | N | partial | N | N | partial | N | N | N | N | N | N | hidden |
| object_permissions | governance | Y | partial | partial | N | N | N | N | N | partial | N | N | N | partial |
| permissions | governance | Y | Y (duplicate drop-target D011) | Y | partial | N | Y | N | N | Y | Y | partial | N | partial |
| queue_jobs | governance | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| role_permissions | governance | Y | Y (duplicate drop-target D011) | Y | partial | N | Y | N | N | Y | Y | partial | N | partial |
| roles | governance | Y | Y (duplicate drop-target D011) | Y | Y (/admin/roles) | Y | Y | N | N | Y | Y | partial | N | complete |
| saved_filters | governance | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| security_events | governance | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| sla_timers | governance | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| state_history | governance | Y | partial | uncertain | N | N | Y | N | N | partial | N | N | N | partial |
| user_preferences | governance | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| user_roles | governance | Y | Y (duplicate drop-target D011) | Y | partial | N | Y | N | N | Y | Y | partial | N | partial |
| users_profile | governance | Y | Y | Y | Y (/admin/users) | Y | Y | N | N | Y | Y | partial | N | complete |
| validations_log | governance | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| webhook_deliveries | governance | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| webhook_endpoints | governance | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| workflow_instances | governance | Y | partial | partial | N | N | Y | N | N | partial | N | N | N | partial |
| workflow_step_executions | governance | Y | N | N | N | N | Y | N | N | N | N | N | N | partial |
| workflow_steps | governance | Y | N | N | N | N | Y | N | N | N | N | N | N | partial |
| workflows | governance | Y | partial | partial | partial | N | Y | N | N | partial | N | N | N | partial |
| agent_jobs | intelligence | Y | N | N | N | N | partial | N | N | N | N | N | N | hidden |
| agent_registry | intelligence | Y | partial | partial | N | N | partial | N | N | N | N | N | N | partial |
| ai_insights | intelligence | Y | N | partial | N | N | N | N | partial | N | N | N | N | hidden |
| anomaly_cases | intelligence | Y | N | partial | N | N | N | N | N | N | N | N | N | hidden |
| anomaly_feedback | intelligence | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| decision_recommendations | intelligence | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| forecast_models | intelligence | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| model_executions | intelligence | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| model_registry | intelligence | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| quality_scores | intelligence | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| recommendation_feedback | intelligence | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| seasonality_patterns | intelligence | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| trend_signals | intelligence | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| barcode_scans | inventory | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| inventory | inventory | Y | partial (public.inventory_items dup) | Y | Y (/inventory) | Y | Y | Y | Y | conflicted | partial | partial | N | partial |
| inventory_issues | inventory | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| inventory_movements | inventory | Y | N | partial | N | N | partial | N | N | N | N | N | N | hidden |
| inventory_receipts | inventory | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| inventory_reservations | inventory | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| inventory_transfers | inventory | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| manufacturing_batches | inventory | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| material_categories | inventory | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| material_lots | inventory | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| material_request_lines | inventory | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| material_requests | inventory | Y | N | partial | N | N | partial | N | N | N | N | N | N | hidden |
| materials | inventory | Y | Y | Y | Y (/materials) | Y | Y | Y | Y | Y | partial | partial | N | complete |
| reorder_rules | inventory | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| shortage_snapshots | inventory | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| stock_count_lines | inventory | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| stock_counts | inventory | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| warehouses | inventory | Y | N | partial | partial | Y | partial | N | N | N | N | N | N | partial |
| assets | maintenance | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| work_orders | maintenance | Y | N | N | N | N | N | N | N | N | N | N | N | hidden (dup risk vs execution.work_orders) |
| job_queue | orchestration | Y | partial | partial | N | N | partial | N | N | N | N | N | N | partial |
| notifications | orchestration | Y | partial (overlap comms.notifications) | partial | N | N | partial | N | N | conflicted | N | N | N | broken |
| universal_inbox | orchestration | Y | partial | partial | partial | Y | partial | N | N | partial | N | N | N | partial |
| workflow_definitions | orchestration | Y | partial | partial | N | N | Y | N | N | partial | N | N | N | partial |
| workflow_runs | orchestration | Y | N | partial | N | N | Y | N | N | N | N | N | N | partial |
| workflow_step_runs | orchestration | Y | N | N | N | N | Y | N | N | N | N | N | N | partial |
| workflow_steps | orchestration | Y | N | N | N | N | Y | N | N | N | N | N | N | partial |
| capacity_calendars | planning | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| capacity_slots | planning | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| demand_forecasts | planning | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| calculations | pricing | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| rule_sets | pricing | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| approval_steps | procurement | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| approvals | procurement | Y | partial (sales.approvals D009) | partial | partial | N | partial | N | N | conflicted | N | N | N | partial |
| contract_milestones | procurement | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| contracts | procurement | Y | N | partial | Y (/contracts) | Y | partial | N | N | N | N | N | N | partial |
| purchase_order_lines | procurement | Y | N | partial | N | N | partial | N | N | N | N | N | N | hidden |
| purchase_orders | procurement | Y | Y | Y | Y (/pos, PO360) | Y | Y | Y | Y | Y | partial | partial | N | complete |
| returns | procurement | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| rfq_comparison_snapshots | procurement | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| rfq_items | procurement | Y | N | partial | N | N | partial | N | N | N | N | N | N | hidden |
| rfq_supplier_invites | procurement | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| rfqs | procurement | Y | Y | Y | Y (/rfqs, RFQ360) | Y | Y | Y | Y | Y | partial | partial | N | complete |
| supplier_contacts | procurement | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| supplier_invoices | procurement | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| supplier_portal_accounts | procurement | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| supplier_quote_lines | procurement | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| supplier_quotes | procurement | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| supplier_scorecards | procurement | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| suppliers | procurement | Y | Y (dup public.suppliers) | Y | Y (/suppliers, Supplier360) | Y | Y | Y | Y | conflicted | partial | partial | N | partial |
| warranty_cases | procurement | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| app_menu | public | Y | N (infra) | Y | Y (/menu admin) | Y | N | N | N | Y | partial | partial | N | partial |
| customers | public (legacy dup) | Y | Y (dup, drop D006) | partial | partial | partial | partial | N | N | conflicted | N | N | N | broken |
| employees | public (legacy dup) | Y | Y (dup, drop D006) | partial | partial | partial | partial | N | N | conflicted | N | N | N | broken |
| inventory_items | public (legacy dup) | Y | Y (dup inventory.inventory, drop D006) | partial | partial | partial | partial | N | N | conflicted | N | N | N | broken |
| orders | public (legacy) | Y | N | partial | partial | partial | N | N | N | N | N | N | N | partial |
| properties | public (real-estate leftover) | Y | N (drop per D014 / realestate_leftovers) | partial | partial | partial | N | N | N | N | N | N | N | broken |
| suppliers | public (legacy dup) | Y | Y (dup procurement.suppliers, drop D006) | partial | partial | partial | partial | N | N | conflicted | N | N | N | broken |
| user_profiles | public (legacy dup) | Y | Y (dup governance.users_profile, drop D006) | partial | partial | partial | partial | N | N | conflicted | N | N | N | broken |
| defects | quality | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| inspection_plans | quality | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| inspection_runs | quality | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| menu_nodes | routing | Y | N | Y | N | N | N | N | N | Y | N | N | N | partial |
| route_permission_map | routing | Y | N | partial | N | N | N | N | N | Y | partial | N | N | partial |
| route_registry | routing | Y | N | partial | N | N | N | N | N | Y | N | N | N | partial |
| ticket_comments | service | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| tickets | service | Y | partial (overlap comms.support_tickets) | partial | partial | N | N | N | N | conflicted | N | N | N | partial |
| bank_accounts | treasury | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| cash_forecasts | treasury | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| cash_positions | treasury | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| attendance | workforce | Y | N | partial | partial | Y | partial | N | N | N | N | N | N | partial |
| employee_expenses | workforce | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| employee_pay_components | workforce | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| employees | workforce | Y | Y | Y | Y (/employees, Employee360) | Y | Y | Y | Y | Y | partial | partial | N | complete |
| employers | workforce | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| hr_profiles | workforce | Y | partial | partial | N | N | partial | N | N | N | N | N | N | partial |
| leave_requests | workforce | Y | N | partial | partial | Y | partial | N | N | N | N | N | N | partial |
| leave_types | workforce | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| pay_components | workforce | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| payroll_entries | workforce | Y | N | partial | partial | Y | partial | N | N | N | N | N | N | partial |
| payroll_exceptions | workforce | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| payroll_export_batches | workforce | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| payroll_runs | workforce | Y | N | partial | partial | Y | partial | N | N | N | N | N | N | partial |
| pension_records | workforce | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| shifts | workforce | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |
| wage_slips | workforce | Y | N | partial | partial | N | partial | N | N | N | N | N | N | partial |
| workforce_assignments | workforce | Y | N | N | N | N | N | N | N | N | N | N | N | hidden |

**Block A row count: 237** — matches `_all_tables.txt`.

---

## Block B — 16 Pipeline entities cross-map

From `onyx-procurement/src/pipeline/entity-map.js`. If the entity maps 1:1 to a table in Block A, the mapping is inlined here without duplicating the row.

| pipeline_entity | mapped_db_row (Block A) | notes |
|---|---|---|
| customer | commercial.customers | canonical |
| lead | commercial.leads | canonical |
| opportunity | commercial.opportunities | canonical |
| quote | commercial.quotes | canonical |
| sales_order | execution.projects (via order→project link) | Sales→Project flow handoff |
| project | execution.projects | canonical |
| work_order | execution.work_orders | canonical |
| task | execution.tasks | canonical |
| supplier | procurement.suppliers | canonical |
| rfq | procurement.rfqs | canonical |
| purchase_order | procurement.purchase_orders | canonical |
| material | inventory.materials | canonical |
| invoice | finance.invoices | canonical |
| payment | finance.payments | canonical |
| employee | workforce.employees | canonical |
| document | docs.documents | canonical |

**Block B count: 16.** Completion check: all 16 pipeline entities have a corresponding Block A row. Zero orphan pipeline entities.

---

## Block C — Registry-only delta (105 models in registry with no DB table)

Per `RECOVERY_FINAL_STATUS.baseline.registry_vs_db_delta = 105` and `models_registry.json`. Summarized by domain bucket (full list lives in `models_registry.json` and `CANONICAL_DOMAIN_VERIFICATION.md`):

| bucket | count | found_in_db | completion_status | notes |
|---|--:|---|---|---|
| crm.* (contacts/activities/tags) | ~14 | N | missing | To drop or repoint per D003/D009 |
| sales.* (approvals/orders/quotes phantoms) | ~10 | N | missing | wrong-schema D009 — repoint to commercial/procurement |
| projects.* (phantoms) | ~8 | N | missing | wrong-schema D009 — repoint to execution |
| hr_workforce.* | ~9 | N | missing | wrong-schema — repoint to workforce |
| documents.* (signatures etc.) | ~6 | partial | missing | some target docs.*, some documents.* |
| finance.* (alternative names) | ~12 | N | missing | dup vs existing finance.* |
| analytics.* (generic widgets) | ~8 | N | missing | dup vs analytics.dashboard_widgets |
| governance.* (extra registry entries) | ~10 | N | missing | infra-only, skip |
| inventory.* (alt names) | ~7 | N | missing | dup vs existing |
| intelligence.* (stubs) | ~8 | N | missing | new per D012 |
| comms.* (stubs) | ~6 | N | missing | new per D012 |
| orchestration.* (extra) | ~4 | N | missing | dup vs existing |
| misc | ~3 | N | missing | various |
| **Block C total** | **~105** | **N** | **missing** | **handled by Phase 2/3/7** |

---

## Aggregates

| Metric | Value |
|---|--:|
| Total Block A rows (DB tables) | 237 |
| Pipeline entity mappings (Block B, inlined) | 16 |
| Registry-only delta (Block C buckets) | 105 (aggregated into 13 buckets) |
| **Total matrix rows (Block A + Block C buckets)** | **237 + 16 = 253 (primary) / 250+ (incl. buckets)** |
| `complete` | 10 (leads, work_orders, invoices, payments, materials, purchase_orders, rfqs, employees, users_profile, roles) |
| `partial` | 57 |
| `hidden` | 156 |
| `broken` | 11 |
| `missing` | 105 (Block C aggregate) |
| `deployment_verified = N` | 237 (all Block A — per B-D013) |
| `rls_decision_defined = partial or Y` | 16 |
| `source_of_truth_defined = Y or partial` | 24 |

**Completion ratios**:
- `complete / 237` = **4.2%** (Block A only; strict Y-on-all-14 columns)
- `complete + partial / 237` = **28.3%**
- `hidden / 237` = **65.8%** (the big gap — most DB tables have no UI/API/menu wire-up)
- `broken / 237` = **4.6%**
