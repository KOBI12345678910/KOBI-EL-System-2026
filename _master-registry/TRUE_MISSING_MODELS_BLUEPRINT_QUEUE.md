# TRUE MISSING MODELS BLUEPRINT QUEUE

Generated: 2026-04-18

75 models that are genuinely absent from both DB and registry-backed API surface. One row per model with build priority and design hints.

_(Canonical target schemas already applied where the original domain was crm/sales/projects/production/installation/engineering/hr_workforce/ai_automation/documents.)_

| Model | Original Domain | Canonical Schema | Priority | Target Table | Key Fields (best-effort) | Required FKs | State |
|---|---|---|---|---|---|---|---|
| lead_sources | crm | commercial | P1_crm_core | commercial.lead_sources | id, public_id, code, name, status, created_at, updated_at, metadata | commercial.customers.id | planned_locked |
| communication_logs | crm | commercial | P1_crm_core | commercial.communication_logs | id, public_id, code, name, status, created_at, updated_at, metadata | — | planned_locked |
| customer_segments | crm | commercial | P2_crm_analytics | commercial.customer_segments | id, public_id, code, name, status, created_at, updated_at, metadata | commercial.customers.id | planned_locked |
| quote_items | sales | commercial | P0_sales_required | commercial.quote_items | id, public_id, code, name, status, created_at, updated_at, metadata | commercial.customers.id | blueprint_ready |
| pricing_rules | sales | commercial | P1_sales | commercial.pricing_rules | id, public_id, code, name, status, created_at, updated_at, metadata | — | planned_locked |
| discounts | sales | commercial | P1_sales | commercial.discounts | id, public_id, code, name, status, created_at, updated_at, metadata | — | planned_locked |
| sales_orders | sales | commercial | P0_order_flow | commercial.sales_orders | id, public_id, code, name, status, created_at, updated_at, metadata | — | blueprint_ready |
| sales_pipeline | sales | commercial | P1_pipeline | commercial.sales_pipeline | id, public_id, code, name, status, created_at, updated_at, metadata | — | planned_locked |
| project_tasks | projects | execution | P0_project | execution.project_tasks | id, public_id, code, name, status, created_at, updated_at, metadata | execution.projects.id | blueprint_ready |
| project_resources | projects | execution | P1_project | execution.project_resources | id, public_id, code, name, status, created_at, updated_at, metadata | execution.projects.id | planned_locked |
| project_risk_entries | projects | execution | P1_project | execution.project_risk_entries | id, public_id, code, name, status, created_at, updated_at, metadata | execution.projects.id | planned_locked |
| project_progress_logs | projects | execution | P1_project | execution.project_progress_logs | id, public_id, code, name, status, created_at, updated_at, metadata | execution.projects.id | planned_locked |
| technical_specs | engineering | execution | P1_engineering | execution.technical_specs | id, public_id, code, name, status, created_at, updated_at, metadata | — | planned_locked |
| bom_headers | engineering | execution | P0_engineering | execution.bom_headers | id, public_id, code, name, status, created_at, updated_at, metadata | execution.projects.id | blueprint_ready |
| bom_items | engineering | execution | P0_engineering | execution.bom_items | id, public_id, code, name, status, created_at, updated_at, metadata | execution.projects.id | blueprint_ready |
| revision_control | engineering | execution | P1_engineering | execution.revision_control | id, public_id, code, name, status, created_at, updated_at, metadata | — | planned_locked |
| product_configurations | engineering | execution | P1_engineering | execution.product_configurations | id, public_id, code, name, status, created_at, updated_at, metadata | — | planned_locked |
| engineering_requests | engineering | execution | P1_engineering | execution.engineering_requests | id, public_id, code, name, status, created_at, updated_at, metadata | execution.projects.id | planned_locked |
| approval_drawings | engineering | execution | P1_engineering | execution.approval_drawings | id, public_id, code, name, status, created_at, updated_at, metadata | — | planned_locked |
| supplier_price_lists | procurement | procurement | P1_procurement | procurement.supplier_price_lists | id, public_id, code, name, status, created_at, updated_at, metadata | procurement.suppliers.id | planned_locked |
| purchase_requests | procurement | procurement | P0_procurement | procurement.purchase_requests | id, public_id, code, name, status, created_at, updated_at, metadata | procurement.suppliers.id | blueprint_ready |
| purchase_order_items | procurement | procurement | P0_procurement | procurement.purchase_order_items | id, public_id, code, name, status, created_at, updated_at, metadata | procurement.suppliers.id | blueprint_ready |
| procurement_approvals | procurement | procurement | P0_procurement | procurement.procurement_approvals | id, public_id, code, name, status, created_at, updated_at, metadata | procurement.suppliers.id | blueprint_ready |
| stock_balances | inventory | inventory | P0_inventory | inventory.stock_balances | id, public_id, code, name, status, created_at, updated_at, metadata | procurement.suppliers.id | blueprint_ready |
| stock_movements | inventory | inventory | P0_inventory | inventory.stock_movements | id, public_id, code, name, status, created_at, updated_at, metadata | procurement.suppliers.id | blueprint_ready |
| batch_lots | inventory | inventory | P1_inventory | inventory.batch_lots | id, public_id, code, name, status, created_at, updated_at, metadata | procurement.suppliers.id | planned_locked |
| production_orders | production | execution | P0_production | execution.production_orders | id, public_id, code, name, status, created_at, updated_at, metadata | execution.projects.id | blueprint_ready |
| production_steps | production | execution | P0_production | execution.production_steps | id, public_id, code, name, status, created_at, updated_at, metadata | execution.projects.id | blueprint_ready |
| work_centers | production | execution | P0_production | execution.work_centers | id, public_id, code, name, status, created_at, updated_at, metadata | execution.projects.id | blueprint_ready |
| labor_logs | production | execution | P1_production | execution.labor_logs | id, public_id, code, name, status, created_at, updated_at, metadata | execution.projects.id | planned_locked |
| machine_logs | production | execution | P1_production | execution.machine_logs | id, public_id, code, name, status, created_at, updated_at, metadata | — | planned_locked |
| material_consumption | production | execution | P0_production | execution.material_consumption | id, public_id, code, name, status, created_at, updated_at, metadata | procurement.suppliers.id | blueprint_ready |
| scrap_logs | production | execution | P1_production | execution.scrap_logs | id, public_id, code, name, status, created_at, updated_at, metadata | execution.projects.id | planned_locked |
| production_quality_checks | production | execution | P1_production | execution.production_quality_checks | id, public_id, code, name, status, created_at, updated_at, metadata | execution.projects.id | planned_locked |
| installation_orders | installation | execution | P0_install | execution.installation_orders | id, public_id, code, name, status, created_at, updated_at, metadata | execution.projects.id | blueprint_ready |
| installation_tasks | installation | execution | P0_install | execution.installation_tasks | id, public_id, code, name, status, created_at, updated_at, metadata | execution.projects.id | blueprint_ready |
| installation_teams | installation | execution | P0_install | execution.installation_teams | id, public_id, code, name, status, created_at, updated_at, metadata | execution.projects.id | blueprint_ready |
| site_visits | installation | execution | P1_install | execution.site_visits | id, public_id, code, name, status, created_at, updated_at, metadata | — | planned_locked |
| completion_reports | installation | execution | P1_install | execution.completion_reports | id, public_id, code, name, status, created_at, updated_at, metadata | procurement.suppliers.id | planned_locked |
| handover_documents | installation | execution | P1_install | execution.handover_documents | id, public_id, code, name, status, created_at, updated_at, metadata | docs.documents.id | planned_locked |
| punch_lists | installation | execution | P1_install | execution.punch_lists | id, public_id, code, name, status, created_at, updated_at, metadata | — | planned_locked |
| service_tickets | service | service | P0_service | service.service_tickets | id, public_id, code, name, status, created_at, updated_at, metadata | service.service_tickets.id | blueprint_ready |
| warranty_records | service | service | P1_service | service.warranty_records | id, public_id, code, name, status, created_at, updated_at, metadata | service.service_tickets.id | planned_locked |
| service_visits | service | service | P1_service | service.service_visits | id, public_id, code, name, status, created_at, updated_at, metadata | service.service_tickets.id | planned_locked |
| issue_categories | service | service | P1_service | service.issue_categories | id, public_id, code, name, status, created_at, updated_at, metadata | service.service_tickets.id | planned_locked |
| resolution_logs | service | service | P1_service | service.resolution_logs | id, public_id, code, name, status, created_at, updated_at, metadata | service.service_tickets.id | planned_locked |
| maintenance_plans | service | service | P2_service | service.maintenance_plans | id, public_id, code, name, status, created_at, updated_at, metadata | intelligence.ai_insights.id | planned_locked |
| service_feedback | service | service | P2_service | service.service_feedback | id, public_id, code, name, status, created_at, updated_at, metadata | service.service_tickets.id | planned_locked |
| sla_rules | service | service | P1_service | service.sla_rules | id, public_id, code, name, status, created_at, updated_at, metadata | service.service_tickets.id | planned_locked |
| invoice_items | finance | finance | P0_finance | finance.invoice_items | id, public_id, code, name, status, created_at, updated_at, metadata | finance.invoices.id | blueprint_ready |
| expense_categories | finance | finance | P1_finance | finance.expense_categories | id, public_id, code, name, status, created_at, updated_at, metadata | finance.invoices.id | planned_locked |
| profitability_snapshots | finance | finance | P2_finance | finance.profitability_snapshots | id, public_id, code, name, status, created_at, updated_at, metadata | — | planned_locked |
| attendance_logs | hr_workforce | workforce | P0_workforce | workforce.attendance_logs | id, public_id, code, name, status, created_at, updated_at, metadata | workforce.employees.id | blueprint_ready |
| payroll_inputs | hr_workforce | workforce | P0_workforce | workforce.payroll_inputs | id, public_id, code, name, status, created_at, updated_at, metadata | workforce.employees.id | blueprint_ready |
| performance_reviews | hr_workforce | workforce | P1_workforce | workforce.performance_reviews | id, public_id, code, name, status, created_at, updated_at, metadata | workforce.employees.id | planned_locked |
| skill_matrix | hr_workforce | workforce | P1_workforce | workforce.skill_matrix | id, public_id, code, name, status, created_at, updated_at, metadata | workforce.employees.id | planned_locked |
| document_links | documents | docs | P1_docs | docs.document_links | id, public_id, code, name, status, created_at, updated_at, metadata | docs.documents.id | planned_locked |
| generated_files | documents | docs | P1_docs | docs.generated_files | id, public_id, code, name, status, created_at, updated_at, metadata | — | planned_locked |
| archive_records | documents | docs | P2_docs | docs.archive_records | id, public_id, code, name, status, created_at, updated_at, metadata | docs.documents.id | planned_locked |
| kpi_definitions | analytics | analytics | P1_analytics | analytics.kpi_definitions | id, public_id, code, name, status, created_at, updated_at, metadata | — | planned_locked |
| report_sources | analytics | analytics | P1_analytics | analytics.report_sources | id, public_id, code, name, status, created_at, updated_at, metadata | procurement.suppliers.id | planned_locked |
| scenario_models | analytics | analytics | P2_analytics | analytics.scenario_models | id, public_id, code, name, status, created_at, updated_at, metadata | — | planned_locked |
| automation_rules | ai_automation | intelligence | P1_intel | intelligence.automation_rules | id, public_id, code, name, status, created_at, updated_at, metadata | intelligence.ai_insights.id | planned_locked |
| automation_runs | ai_automation | intelligence | P1_intel | intelligence.automation_runs | id, public_id, code, name, status, created_at, updated_at, metadata | intelligence.ai_insights.id | planned_locked |
| ai_agents | ai_automation | intelligence | P1_intel | intelligence.ai_agents | id, public_id, code, name, status, created_at, updated_at, metadata | intelligence.ai_insights.id | planned_locked |
| ai_actions | ai_automation | intelligence | P2_intel | intelligence.ai_actions | id, public_id, code, name, status, created_at, updated_at, metadata | intelligence.ai_insights.id | planned_locked |
| prediction_outputs | ai_automation | intelligence | P1_intel | intelligence.prediction_outputs | id, public_id, code, name, status, created_at, updated_at, metadata | intelligence.ai_insights.id | planned_locked |
| recommendation_logs | ai_automation | intelligence | P2_intel | intelligence.recommendation_logs | id, public_id, code, name, status, created_at, updated_at, metadata | intelligence.ai_insights.id | planned_locked |
| orchestration_flows | ai_automation | intelligence | P1_intel | intelligence.orchestration_flows | id, public_id, code, name, status, created_at, updated_at, metadata | intelligence.ai_insights.id | planned_locked |
| change_logs | governance | governance | P1_gov | governance.change_logs | id, public_id, code, name, status, created_at, updated_at, metadata | — | planned_locked |
| system_settings | governance | governance | P1_gov | governance.system_settings | id, public_id, code, name, status, created_at, updated_at, metadata | — | planned_locked |
| validation_rules | governance | governance | P1_gov | governance.validation_rules | id, public_id, code, name, status, created_at, updated_at, metadata | — | planned_locked |
| data_quality_issues | governance | governance | P2_gov | governance.data_quality_issues | id, public_id, code, name, status, created_at, updated_at, metadata | execution.projects.id | planned_locked |
| customer_portal_accounts | commercial | commercial | P2_commercial | commercial.customer_portal_accounts | id, public_id, code, name, status, created_at, updated_at, metadata | commercial.customers.id | planned_locked |
| mobile_scan_sessions | docs | docs | P2_docs | docs.mobile_scan_sessions | id, public_id, code, name, status, created_at, updated_at, metadata | — | planned_locked |
| dispatch_boards | execution | execution | P2_execution | execution.dispatch_boards | id, public_id, code, name, status, created_at, updated_at, metadata | — | planned_locked |

## Summary by Priority
- P0 (core business flow): 21
- P1 (next-value): 43
- P2 (future): 12

## Build cadence recommendation
1. Execute all P0 models as one migration bundle (sales_orders, purchase_requests, stock_movements, production_orders, service_tickets, invoice_items, attendance_logs, bom_headers, installation_orders).
2. Then P1 in-domain batches (one per canonical schema).
3. P2 items entry-locked; gate behind feature flag rollout.
