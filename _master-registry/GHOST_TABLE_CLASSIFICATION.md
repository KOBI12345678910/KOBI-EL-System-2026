# GHOST TABLE CLASSIFICATION

Generated: 2026-04-18

119 tables with no FK in/out, classified:

| Class | Count | Meaning |
|---|---|---|
| active_connected | 3 | Actually wired, audit marks wrongly as unused |
| built_not_exposed | 66 | Exists, should have menu/UI — highest value |
| built_internal_only | 44 | Intentional (queues, audit, read-models) |
| planned_locked | 6 | Future, not yet active |
| **TOTAL** | **119** | |

## active_connected (3)

| # | Table | Recommendation |
|---|---|---|
| 1 | execution.task_attachments | no action — already wired via parent FK indirect |
| 2 | execution.task_comments | no action — already wired via parent FK indirect |
| 3 | service.ticket_comments | no action — already wired via parent FK indirect |

## built_not_exposed (66)

| # | Table | Recommendation |
|---|---|---|
| 1 | commercial.customer_contacts | add menu entry + API route + list page |
| 2 | commercial.customer_portal_accounts | add menu entry + API route + list page |
| 3 | commercial.lead_tag_assignments | add menu entry + API route + list page |
| 4 | commercial.quote_lines | add menu entry + API route + list page |
| 5 | comms.chatbot_sessions | add menu entry + API route + list page |
| 6 | comms.email_messages | add menu entry + API route + list page |
| 7 | comms.help_articles | add menu entry + API route + list page |
| 8 | comms.sms_messages | add menu entry + API route + list page |
| 9 | docs.document_classifications | add menu entry + API route + list page |
| 10 | docs.document_signature_requests | add menu entry + API route + list page |
| 11 | docs.ocr_results | add menu entry + API route + list page |
| 12 | docs.print_jobs | add menu entry + API route + list page |
| 13 | docs.scan_sessions | add menu entry + API route + list page |
| 14 | documents.document_relations | add menu entry + API route + list page |
| 15 | documents.entity_extractions | add menu entry + API route + list page |
| 16 | documents.knowledge_cards | add menu entry + API route + list page |
| 17 | execution.project_blockers | add menu entry + API route + list page |
| 18 | execution.project_cost_plans | add menu entry + API route + list page |
| 19 | execution.task_dependencies | add menu entry + API route + list page |
| 20 | execution.work_order_qa_items | add menu entry + API route + list page |
| 21 | execution.work_order_tasks | add menu entry + API route + list page |
| 22 | finance.annual_tax_reports | add menu entry + API route + list page |
| 23 | finance.budget_entries | add menu entry + API route + list page |
| 24 | finance.collection_actions | add menu entry + API route + list page |
| 25 | finance.consolidation_entries | add menu entry + API route + list page |
| 26 | finance.costing_entries | add menu entry + API route + list page |
| 27 | finance.dunning_steps | add menu entry + API route + list page |
| 28 | finance.fx_rates | add menu entry + API route + list page |
| 29 | finance.gl_transactions | add menu entry + API route + list page |
| 30 | finance.invoice_lines | add menu entry + API route + list page |
| 31 | finance.payment_allocations | add menu entry + API route + list page |
| 32 | finance.reconciliation_exceptions | add menu entry + API route + list page |
| 33 | finance.reminder_schedules | add menu entry + API route + list page |
| 34 | finance.tax_exports | add menu entry + API route + list page |
| 35 | finance.vat_records | add menu entry + API route + list page |
| 36 | governance.alert_subscriptions | add menu entry + API route + list page |
| 37 | governance.escalation_rules | add menu entry + API route + list page |
| 38 | governance.feature_flag_targets | add menu entry + API route + list page |
| 39 | governance.object_permissions | add menu entry + API route + list page |
| 40 | governance.sla_timers | add menu entry + API route + list page |
| 41 | intelligence.agent_jobs | add menu entry + API route + list page |
| 42 | intelligence.ai_insights | add menu entry + API route + list page |
| 43 | intelligence.forecast_models | add menu entry + API route + list page |
| 44 | intelligence.quality_scores | add menu entry + API route + list page |
| 45 | intelligence.seasonality_patterns | add menu entry + API route + list page |
| 46 | intelligence.trend_signals | add menu entry + API route + list page |
| 47 | inventory.inventory_issues | add menu entry + API route + list page |
| 48 | inventory.inventory_receipts | add menu entry + API route + list page |
| 49 | inventory.inventory_transfers | add menu entry + API route + list page |
| 50 | inventory.manufacturing_batches | add menu entry + API route + list page |
| 51 | inventory.material_request_lines | add menu entry + API route + list page |
| 52 | inventory.stock_count_lines | add menu entry + API route + list page |
| 53 | orchestration.universal_inbox | add menu entry + API route + list page |
| 54 | procurement.approval_steps | add menu entry + API route + list page |
| 55 | procurement.contract_milestones | add menu entry + API route + list page |
| 56 | procurement.rfq_supplier_invites | add menu entry + API route + list page |
| 57 | procurement.supplier_scorecards | add menu entry + API route + list page |
| 58 | procurement.warranty_cases | add menu entry + API route + list page |
| 59 | workforce.employee_expenses | add menu entry + API route + list page |
| 60 | workforce.employee_pay_components | add menu entry + API route + list page |
| 61 | workforce.hr_profiles | add menu entry + API route + list page |
| 62 | workforce.payroll_exceptions | add menu entry + API route + list page |
| 63 | workforce.payroll_export_batches | add menu entry + API route + list page |
| 64 | workforce.pension_records | add menu entry + API route + list page |
| 65 | workforce.wage_slips | add menu entry + API route + list page |
| 66 | workforce.workforce_assignments | add menu entry + API route + list page |

## built_internal_only (44)

| # | Table | Recommendation |
|---|---|---|
| 1 | analytics.dashboard_board_widgets | no user-facing exposure; ensure admin observability |
| 2 | analytics.kpi_snapshots | no user-facing exposure; ensure admin observability |
| 3 | analytics.read_model_invalidations | no user-facing exposure; ensure admin observability |
| 4 | analytics.rm_ai_summary | no user-facing exposure; ensure admin observability |
| 5 | analytics.rm_executive_summary | no user-facing exposure; ensure admin observability |
| 6 | analytics.rm_finance_summary | no user-facing exposure; ensure admin observability |
| 7 | analytics.rm_operations_summary | no user-facing exposure; ensure admin observability |
| 8 | analytics.rm_procurement_summary | no user-facing exposure; ensure admin observability |
| 9 | analytics.rm_workforce_summary | no user-facing exposure; ensure admin observability |
| 10 | analytics.user_dashboard_boards | no user-facing exposure; ensure admin observability |
| 11 | comms.notification_deliveries | no user-facing exposure; ensure admin observability |
| 12 | comms.support_sla_tracking | no user-facing exposure; ensure admin observability |
| 13 | compliance.policy_acknowledgements | no user-facing exposure; ensure admin observability |
| 14 | crm.lead_activities | no user-facing exposure; ensure admin observability |
| 15 | documents.classification_runs | no user-facing exposure; ensure admin observability |
| 16 | documents.document_chunks | no user-facing exposure; ensure admin observability |
| 17 | documents.ocr_runs | no user-facing exposure; ensure admin observability |
| 18 | execution.delivery_events | no user-facing exposure; ensure admin observability |
| 19 | execution.installation_events | no user-facing exposure; ensure admin observability |
| 20 | finance.bank_matches | no user-facing exposure; ensure admin observability |
| 21 | governance.audit_log_attachments | no user-facing exposure; ensure admin observability |
| 22 | governance.command_logs | no user-facing exposure; ensure admin observability |
| 23 | governance.config_entries | no user-facing exposure; ensure admin observability |
| 24 | governance.event_deliveries | no user-facing exposure; ensure admin observability |
| 25 | governance.health_checks | no user-facing exposure; ensure admin observability |
| 26 | governance.idempotency_keys | no user-facing exposure; ensure admin observability |
| 27 | governance.job_executions | no user-facing exposure; ensure admin observability |
| 28 | governance.saved_filters | no user-facing exposure; ensure admin observability |
| 29 | governance.security_events | no user-facing exposure; ensure admin observability |
| 30 | governance.state_history | no user-facing exposure; ensure admin observability |
| 31 | governance.user_preferences | no user-facing exposure; ensure admin observability |
| 32 | governance.validations_log | no user-facing exposure; ensure admin observability |
| 33 | governance.webhook_deliveries | no user-facing exposure; ensure admin observability |
| 34 | governance.workflow_step_executions | no user-facing exposure; ensure admin observability |
| 35 | intelligence.anomaly_feedback | no user-facing exposure; ensure admin observability |
| 36 | intelligence.model_executions | no user-facing exposure; ensure admin observability |
| 37 | intelligence.recommendation_feedback | no user-facing exposure; ensure admin observability |
| 38 | inventory.barcode_scans | no user-facing exposure; ensure admin observability |
| 39 | inventory.shortage_snapshots | no user-facing exposure; ensure admin observability |
| 40 | orchestration.job_queue | no user-facing exposure; ensure admin observability |
| 41 | orchestration.workflow_step_runs | no user-facing exposure; ensure admin observability |
| 42 | procurement.rfq_comparison_snapshots | no user-facing exposure; ensure admin observability |
| 43 | public.user_profiles | no user-facing exposure; ensure admin observability |
| 44 | routing.route_permission_map | no user-facing exposure; ensure admin observability |

## planned_locked (6)

| # | Table | Recommendation |
|---|---|---|
| 1 | commercial.quote_approval_rules | locked; activate in P2 roadmap |
| 2 | commercial.quote_revisions | locked; activate in P2 roadmap |
| 3 | inventory.reorder_rules | locked; activate in P2 roadmap |
| 4 | planning.capacity_slots | locked; activate in P2 roadmap |
| 5 | treasury.cash_forecasts | locked; activate in P2 roadmap |
| 6 | treasury.cash_positions | locked; activate in P2 roadmap |

