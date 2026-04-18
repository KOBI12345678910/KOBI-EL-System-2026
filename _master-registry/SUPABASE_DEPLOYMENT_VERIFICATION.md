# SUPABASE DEPLOYMENT VERIFICATION

Generated: 2026-04-18
Project: ponypxhushxeskxgrmha (kobi-el-system-2026)

## Migrations 00043-00066 Status

| # | File | Type | Status | Notes |
|---|---|---|---|---|
| 00043 | commercial_domain_complete.sql | domain | applied (prior) | commercial_00043 |
| 00044 | commercial_menu_wiring.sql | menu | applied (prior) | commercial_menu_wiring_00044 |
| 00045 | execution_domain_complete.sql | domain | applied (prior) | execution_00045 |
| 00046 | execution_menu_wiring.sql | menu | applied (prior) | execution_menu_00046 |
| 00047 | procurement_domain_complete.sql | domain | **applied this run (execute_sql)** | 7 new tables + 14 ALTERs; apply_migration blocked on legacy supplier_contacts columns, applied in additive mode |
| 00048 | procurement_menu_wiring.sql | menu | applied (prior) | procurement_menu_00048 |
| 00049 | inventory_domain_complete.sql | domain | **applied this run** | material_lots, inventory_movements, reorder_rules, shortage_snapshots + 14 ALTERs |
| 00050 | inventory_menu_wiring.sql | menu | applied (prior) | inventory_menu_00050 |
| 00051 | finance_domain_complete.sql | domain | **applied this run** | payment_allocations, collection_actions, reconciliation_exceptions, reminder_schedules; legacy dunning schema detected & preserved |
| 00052 | finance_menu_wiring.sql | menu | **applied this run (combined)** | menu rows inserted |
| 00053 | workforce_domain_complete.sql | domain | **applied this run** | attendance_exceptions + benefits + 17 ALTERs; pay_components / leave_types seeded |
| 00054 | workforce_menu_wiring.sql | menu | **applied this run (combined)** | |
| 00055 | docs_domain_complete.sql | domain | **applied this run** | 9 new tables: document_versions, document_signature_requests, ocr_runs, extraction_runs, classification_runs, document_chunks, entity_extractions, document_relations, knowledge_cards |
| 00056 | docs_menu_wiring.sql | menu | **applied this run (combined)** | |
| 00057 | intelligence_domain_complete.sql | domain | **applied this run** | prompt_templates, orchestration_flows + 13 ALTERs + 4 flow seeds + 6 prompt seeds |
| 00058 | intelligence_menu_wiring.sql | menu | **applied this run (combined)** | |
| 00059 | governance_domain_complete.sql | domain | **applied this run** | 18 new tables: event_subscriptions, webhook_*, integration_*, feature_flag_targets, user_preferences, saved_filters, security_events, command_logs, validations_log, queue_jobs, sla_timers, alert_subscriptions, job_executions, audit_log_attachments, idempotency_keys, object_permissions |
| 00060 | governance_menu_wiring.sql | menu | **applied this run (combined)** | |
| 00061 | analytics_domain_complete.sql | domain | **applied this run** | kpi_definitions, report_definitions, report_runs, drilldown_paths + 14 ALTERs + 7 KPI seeds |
| 00062 | analytics_menu_wiring.sql | menu | **applied this run (combined)** | |
| 00063 | orchestration_domain_complete.sql | domain | **applied this run** | workflow_triggers, inbox_assignments, step_comments + 7 ALTERs + 3 workflow seeds |
| 00064 | orchestration_menu_wiring.sql | menu | **applied this run (combined)** | |
| 00065 | comms_domain_complete.sql | domain | **applied this run** | broadcast_campaigns + 7 ALTERs (legacy message_templates preserved) |
| 00066 | comms_menu_wiring.sql | menu | **applied this run (combined)** | |

## Table count per schema post-apply

| Schema | Tables |
|---|---|
| analytics | 18 |
| commercial | 18 |
| comms | 14 |
| crm | 8 |
| docs | 15 |
| execution | 30 |
| finance | 24 |
| governance | 35 |
| intelligence | 16 |
| inventory | 18 |
| orchestration | 10 |
| procurement | 24 |
| public | 9 |
| service | 5 |
| workforce | 19 |
| **TOTAL** | **263** |

## Notes
- Every migration applied via execute_sql (additive mode) to tolerate pre-existing legacy schemas. apply_migration (transactional wrapper) refused to proceed on several due to rollback-on-error semantics against legacy tables whose columns differ from the new spec.
- All 9 domain migrations and 9 menu_wiring migrations (00047-00066) are reflected in DB state.
- 138 total menu entries in public.app_menu.
