# DASHBOARD + REPORT SOURCE MATRIX

Generated: 2026-04-18

## Dashboards (10)

| ID | Name | Domain | Sources (canonical) | Drilldown | Permission | Status |
|---|---|---|---|---|---|---|
| DSH-0001 | דשבורד מנכ״ל | governance | finance.cashflow_entries<br>execution.projects | /dashboards/DSH-0001 | authenticated | active |
| DSH-0002 | דשבורד תפעול | execution | execution.project_tasks<br>workforce.attendance_logs<br>execution.production_orders | /dashboards/DSH-0002 | authenticated | active |
| DSH-0003 | דשבורד רכש | procurement | procurement.purchase_requests<br>procurement.purchase_orders | /dashboards/DSH-0003 | authenticated | active |
| DSH-0004 | דשבורד כח אדם | workforce | workforce.employees<br>workforce.attendance_logs<br>workforce.payroll_inputs | /dashboards/DSH-0004 | authenticated | active |
| DSH-0005 | דשבורד AI | intelligence | intelligence.automation_runs<br>intelligence.prediction_outputs | /dashboards/DSH-0005 | authenticated | active |
| DSH-0006 | דשבורד פיננסי | finance | finance.invoices<br>finance.payments<br>finance.cashflow_entries | /dashboards/DSH-0006 | authenticated | active |
| DSH-0007 | דשבורד שירות | service | service.service_tickets<br>service.sla_rules<br>service.service_feedback | /dashboards/DSH-0007 | authenticated | active |
| DSH-0008 | דשבורד פרויקטים | execution | execution.projects<br>execution.milestones | /dashboards/DSH-0008 | authenticated | active |
| DSH-0009 | דשבורד ייצור | execution | execution.production_orders<br>execution.scrap_logs<br>execution.work_centers | /dashboards/DSH-0009 | authenticated | active |
| DSH-0010 | דשבורד מכירות | commercial | commercial.opportunities<br>commercial.quotes<br>commercial.sales_pipeline | /dashboards/DSH-0010 | authenticated | active |

## Reports (20)

| ID | Name | Domain | Sources (canonical) | Output | Permission | Status |
|---|---|---|---|---|---|---|
| RPT-0001 | project_profitability_report | execution | execution.projects<br>finance.invoices<br>procurement.purchase_orders<br>execution.material_consumption | table/csv/pdf | authenticated | active |
| RPT-0002 | aging_report | finance | finance.invoices<br>finance.payments | table/csv/pdf | authenticated | active |
| RPT-0003 | pnl | finance | finance.cashflow_entries<br>finance.expenses | table/csv/pdf | authenticated | active |
| RPT-0004 | balance_sheet | finance | finance.cashflow_entries | table/csv/pdf | authenticated | active |
| RPT-0005 | cash_flow | finance | finance.cashflow_entries | table/csv/pdf | authenticated | active |
| RPT-0006 | vat_report_pcn836 | finance | finance.invoices<br>finance.invoice_items | table/csv/pdf | authenticated | active |
| RPT-0007 | production_kpi | execution | execution.production_orders<br>execution.production_quality_checks | table/csv/pdf | authenticated | active |
| RPT-0008 | sales_pipeline | commercial | commercial.leads<br>commercial.opportunities<br>commercial.quotes | table/csv/pdf | authenticated | active |
| RPT-0009 | procurement_savings | procurement | procurement.purchase_orders | table/csv/pdf | authenticated | active |
| RPT-0010 | inventory_turnover | inventory | inventory.stock_movements<br>inventory.items | table/csv/pdf | authenticated | active |
| RPT-0011 | payroll_summary | workforce | workforce.payroll_inputs | table/csv/pdf | authenticated | active |
| RPT-0012 | attendance_report | workforce | workforce.attendance_logs | table/csv/pdf | authenticated | active |
| RPT-0013 | service_sla | service | service.service_tickets<br>service.sla_rules | table/csv/pdf | authenticated | active |
| RPT-0014 | customer_360 | commercial | commercial.customers<br>commercial.quotes<br>execution.projects<br>finance.invoices | table/csv/pdf | authenticated | active |
| RPT-0015 | supplier_scorecard | procurement | procurement.suppliers<br>procurement.supplier_price_lists | table/csv/pdf | authenticated | active |
| RPT-0016 | overdue_projects_report | execution | execution.projects | table/csv/pdf | authenticated | active |
| RPT-0017 | bank_reconciliation | finance | finance.cashflow_entries<br>finance.payments | table/csv/pdf | authenticated | active |
| RPT-0018 | stock_reorder_suggestions | inventory | inventory.stock_balances<br>inventory.reorder_rules | table/csv/pdf | authenticated | active |
| RPT-0019 | installation_completion | execution | execution.installation_orders<br>execution.completion_reports | table/csv/pdf | authenticated | active |
| RPT-0020 | audit_log_review | governance | governance.audit_logs<br>governance.change_logs | table/csv/pdf | authenticated | active |
