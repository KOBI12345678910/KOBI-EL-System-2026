# SOURCE-OF-TRUTH CANONICAL MAP

Generated: 2026-04-18

Principle: every critical business meaning maps to exactly one canonical table.

| Business Meaning | Canonical Schema | Canonical Table | Derived / Snapshots | Duplicate Risk | Final Decision |
|---|---|---|---|---|---|
| customer_master | commercial | commercial.customers | commercial.customer_segments<br>commercial.customer_contacts | LOW | Canonical in commercial — fold crm.customers references |
| contact_master | commercial | commercial.crm_activities | — | LOW | contacts live as commercial.customer_contacts / commercial.crm_activities |
| lead_master | commercial | commercial.leads | commercial.lead_sources<br>commercial.lead_tag_assignments | LOW | commercial.leads |
| opportunity_master | commercial | commercial.opportunities | — | LOW | commercial.opportunities |
| quote_master | commercial | commercial.quotes | commercial.quote_lines<br>commercial.quote_revisions<br>commercial.quote_approval_rules | LOW | commercial.quotes |
| quote_line_master | commercial | commercial.quote_lines | — | LOW | commercial.quote_lines (new), fold sales.quote_items |
| project_master | execution | execution.projects | execution.project_phases<br>execution.milestones | LOW | execution.projects |
| task_master | execution | execution.tasks | execution.task_dependencies<br>execution.task_attachments<br>execution.task_comments | MEDIUM | execution.tasks |
| work_order_master | execution | execution.work_orders | execution.work_order_tasks<br>execution.work_order_qa_items | LOW | execution.work_orders |
| supplier_master | procurement | procurement.suppliers | procurement.supplier_contacts<br>procurement.supplier_price_lists<br>procurement.supplier_scorecards | LOW | procurement.suppliers |
| rfq_master | procurement | procurement.rfqs | procurement.rfq_items<br>procurement.rfq_supplier_invites<br>procurement.rfq_comparison_snapshots | LOW | procurement.rfqs |
| purchase_order_master | procurement | procurement.purchase_orders | procurement.purchase_order_lines<br>procurement.contracts<br>procurement.contract_milestones | LOW | procurement.purchase_orders |
| goods_receipt_master | procurement | procurement.goods_receipts | procurement.goods_receipt_lines<br>procurement.three_way_matches | LOW | procurement.goods_receipts (new) |
| material_master | inventory | inventory.materials | inventory.material_categories<br>inventory.material_lots | LOW | inventory.materials |
| inventory_balance | inventory | inventory.inventory | inventory.stock_balances<br>inventory.reorder_rules<br>inventory.shortage_snapshots | MEDIUM | inventory.inventory (canonical) — public.inventory_items is legacy |
| invoice_master | finance | finance.invoices | finance.invoice_lines<br>finance.payment_allocations | LOW | finance.invoices |
| payment_master | finance | finance.payments | finance.payment_allocations<br>finance.cashflow_entries<br>finance.receipts | LOW | finance.payments |
| payroll_run_master | workforce | workforce.payroll_runs | workforce.payroll_entries<br>workforce.wage_slips<br>workforce.payroll_exceptions | LOW | workforce.payroll_runs |
| employee_master | workforce | workforce.employees | workforce.hr_profiles<br>workforce.workforce_assignments | MEDIUM | workforce.employees (canonical). public.employees is legacy view |
| document_master | docs | docs.documents | docs.document_versions<br>docs.attachments<br>docs.document_classifications | LOW | docs.documents (canonical). Prior documents.* is retired |
| ai_agent_master | intelligence | intelligence.agent_registry | intelligence.agent_jobs | LOW | intelligence.agent_registry |
| permissions_master | governance | governance.permissions | governance.role_permissions<br>governance.object_permissions | LOW | governance.permissions |
| role_master | governance | governance.roles | governance.role_permissions<br>governance.user_roles | LOW | governance.roles |

## Canonical schema map applied across registry

| Old schema (registry) | New canonical schema (DB reality) |
|---|---|
| crm | commercial |
| sales | commercial |
| projects | execution |
| production | execution |
| installation | execution |
| engineering | execution |
| hr_workforce | workforce |
| ai_automation | intelligence |
| documents | docs |
