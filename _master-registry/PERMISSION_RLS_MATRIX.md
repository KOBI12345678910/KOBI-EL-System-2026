# PERMISSION + RLS MATRIX

Generated: 2026-04-18

| Schema | Table | RLS Enabled | Policies | Auth Scope | Audit Trigger | Notes |
|---|---|---|---|---|---|---|
| commercial | customers | yes | 3 | authenticated/role/owner | yes | core CRM |
| commercial | leads | yes | 3 | authenticated | yes | sales pipeline |
| commercial | quotes | yes | 3 | authenticated | yes | sales approval |
| commercial | opportunities | yes | 3 | authenticated | yes |  |
| execution | projects | yes | 3 | authenticated/team | yes | operations core |
| execution | work_orders | yes | 3 | authenticated/team | yes | field ops |
| execution | tasks | yes | 3 | authenticated/owner | yes |  |
| procurement | suppliers | yes | 3 | authenticated | yes |  |
| procurement | rfqs | yes | 3 | procurement_role | yes |  |
| procurement | purchase_orders | yes | 3 | procurement_role | yes |  |
| procurement | goods_receipts | yes | 3 | warehouse_role | yes | new 00047 |
| procurement | three_way_matches | yes | 3 | finance_role | yes | new 00047 |
| procurement | approval_steps | yes | 3 | admin | yes | new 00047 |
| inventory | materials | yes | 3 | warehouse_role | yes |  |
| inventory | inventory | yes | 3 | warehouse_role | yes | canonical balance |
| inventory | inventory_movements | yes | 3 | warehouse_role | yes | new 00049 |
| inventory | material_lots | yes | 3 | warehouse_role | yes | new 00049 |
| inventory | reorder_rules | yes | 3 | procurement | yes | new 00049 |
| finance | invoices | yes | 3 | finance_role | yes | core AR |
| finance | payments | yes | 3 | finance_role | yes |  |
| finance | payment_allocations | yes | 3 | finance_role | yes | new 00051 |
| finance | collection_cases | yes | 3 | finance_role | yes |  |
| finance | dunning_campaigns | yes | 3 | finance_role | yes | new 00051 |
| finance | reconciliation_exceptions | yes | 3 | finance_role | yes | new 00051 |
| workforce | employees | yes | 3 (self_only) | hr_role | yes | PII sensitive |
| workforce | wage_slips | yes | 3 (self_only) | payroll_role | yes | PII sensitive |
| workforce | pension_records | yes | 3 (self_only) | payroll_role | yes | PII sensitive |
| workforce | payroll_runs | yes | 3 | payroll_role | yes |  |
| workforce | attendance | yes | 3 | hr_role | yes |  |
| workforce | attendance_exceptions | yes | 3 | hr_role | yes | new 00053 |
| docs | documents | yes | 3 | authenticated | yes | canonical |
| docs | document_versions | yes | 3 | authenticated | yes | new 00055 |
| docs | document_signature_requests | yes | 3 | authenticated | yes | new 00055 |
| docs | ocr_runs | yes | 3 | authenticated | yes | new 00055 |
| intelligence | ai_insights | yes | 3 | authenticated | yes |  |
| intelligence | prompt_templates | yes | 3 | analyst | yes | new 00057 |
| intelligence | orchestration_flows | yes | 3 | analyst | yes | new 00057 |
| intelligence | forecast_models | yes | 3 | analyst | yes | canonical |
| governance | users_profile | yes | 3 | admin | yes | core identity |
| governance | roles | yes | 3 | admin | yes |  |
| governance | permissions | yes | 3 | admin | yes |  |
| governance | audit_logs | yes | 3 | admin | no (is the audit) |  |
| governance | queue_jobs | yes | 3 | service_role | yes | new 00059 |
| governance | sla_timers | yes | 3 | service_role | yes | new 00059 |
| governance | security_events | yes | 3 | admin | yes | new 00059 |
| analytics | kpi_definitions | yes | 3 | analyst | yes | new 00061 |
| analytics | report_definitions | yes | 3 | analyst | yes | new 00061 |
| analytics | report_runs | yes | 3 | authenticated | yes | new 00061 |
| orchestration | workflow_definitions | yes | 3 | admin | yes |  |
| orchestration | workflow_runs | yes | 3 | service_role | yes |  |
| orchestration | job_queue | yes | 3 | service_role | yes |  |
| orchestration | universal_inbox | yes | 3 | authenticated | yes |  |
| comms | notifications | yes | 3 | authenticated/owner | yes |  |
| comms | email_messages | yes | 3 | authenticated | yes |  |
| comms | support_tickets | yes | 3 | support_role | yes |  |
