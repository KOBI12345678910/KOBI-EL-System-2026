# ENTITY LINEAGE MAP

Generated: 2026-04-18

For every entity in entity-map.js / models_registry / Supabase: aliases, DB reality, registry reality, chosen canonical.

| Canonical Name | Aliases | DB Reality (actual table) | Registry Reality (old pointer) | Chosen Canonical |
|---|---|---|---|---|
| customer | customers, client | commercial.customers (+public.customers legacy) | crm.customers (fixed -> commercial.customers) | commercial.customers |
| lead | leads, prospect | commercial.leads (+crm.leads legacy) | crm.leads (fixed -> commercial.leads) | commercial.leads |
| opportunity | opportunities, deal | commercial.opportunities (+crm.opportunities legacy) | sales.opportunities (fixed) | commercial.opportunities |
| quote | quotes, proposal, הצעת מחיר | commercial.quotes | sales.quotes (fixed) | commercial.quotes |
| quote_line | quote_items, quote_lines | commercial.quote_lines (orphan, no FK in) | sales.quote_items (planned) | commercial.quote_lines |
| approval | approvals, authorizations | procurement.approvals | sales.approvals (fixed) | procurement.approvals |
| project | projects, פרויקט | execution.projects | projects.projects (fixed) | execution.projects |
| project_phase | phases, stages | execution.project_phases | projects.project_phases (fixed) | execution.project_phases |
| task | tasks, משימות | execution.tasks | projects.project_tasks (fixed) | execution.tasks |
| milestone | milestones, אבני דרך | execution.milestones (if exists) | projects.milestones (planned) | execution.milestones |
| work_order | work_orders, פקודת עבודה | execution.work_orders | execution.work_orders (maintenance.work_orders is legacy) | execution.work_orders |
| supplier | suppliers, vendors, ספקים | procurement.suppliers (+public.suppliers legacy) | procurement.suppliers | procurement.suppliers |
| rfq | rfqs, הצעות מחיר נכנסות | procurement.rfqs | procurement.rfqs | procurement.rfqs |
| purchase_order | pos, purchase_orders, הזמנות רכש | procurement.purchase_orders | procurement.purchase_orders | procurement.purchase_orders |
| goods_receipt | grn, receipts | procurement.goods_receipts (new 00047) | procurement.goods_receipts | procurement.goods_receipts |
| material | materials, items, חומרים | inventory.materials | inventory.materials | inventory.materials |
| inventory_balance | stock, stock_balances | inventory.inventory | inventory.stock_balances (planned) | inventory.inventory |
| inventory_movement | stock_movements, ledger | inventory.inventory_movements (new 00049) | inventory.stock_movements (planned) | inventory.inventory_movements |
| invoice | invoices, חשבוניות | finance.invoices | finance.invoices | finance.invoices |
| invoice_line | invoice_lines, invoice_items | finance.invoice_lines | finance.invoice_items (planned) | finance.invoice_lines |
| payment | payments, תשלומים | finance.payments | finance.payments | finance.payments |
| employee | employees, עובדים | workforce.employees (+public.employees legacy) | hr_workforce.employees (fixed) | workforce.employees |
| payroll_run | payroll_runs, ריצות שכר | workforce.payroll_runs | hr_workforce.payroll_runs (fixed) | workforce.payroll_runs |
| wage_slip | wage_slips, תלושי שכר | workforce.wage_slips | hr_workforce.wage_slips (fixed) | workforce.wage_slips |
| document | documents, מסמכים | docs.documents | documents.documents (fixed) | docs.documents |
| document_version | document_versions | docs.document_versions (new 00055) | documents.document_versions (fixed) | docs.document_versions |
| signature | signatures, חתימות | execution.signatures | documents.signatures (fixed) | execution.signatures |
| attachment | attachments | docs.attachments | documents.attachments (fixed) | docs.attachments |
| forecast_model | forecast_models | intelligence.forecast_models | analytics.forecast_models (fixed) | intelligence.forecast_models |
| ai_insight | ai_insights, תובנות AI | intelligence.ai_insights | ai_automation.* (fixed) | intelligence.ai_insights |
| ai_agent | ai_agents, agents | intelligence.agent_registry | ai_automation.ai_agents (fixed) | intelligence.agent_registry |
| prompt_template | prompt_templates, prompts | intelligence.prompt_templates (new 00057) | ai_automation.prompt_templates (fixed) | intelligence.prompt_templates |
| notification | notifications, התראות | comms.notifications (+orchestration.notifications legacy) | orchestration.notifications | comms.notifications |
| user | users, משתמשים | governance.users_profile | governance.users (planned view) | governance.users_profile |
| role | roles, תפקידים | governance.roles | governance.roles | governance.roles |
| permission | permissions, הרשאות | governance.permissions | governance.permissions | governance.permissions |
| audit_log | audit_logs, יומן ביקורת | governance.audit_logs | governance.audit_logs | governance.audit_logs |
