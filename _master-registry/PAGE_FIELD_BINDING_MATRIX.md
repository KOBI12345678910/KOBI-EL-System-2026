# PAGE FIELD BINDING MATRIX (Top 20 Entities)

Generated: 2026-04-18

| Entity | List Page | Detail / 360 Page | Form Fields | Save Target (API) | Field -> Column |
|---|---|---|---|---|---|
| customers | /customers | /customers/:id | name, status, created_at | POST /api/customers | commercial.customers |
| leads | /leads | /leads/:id | name, status, created_at | POST /api/leads | commercial.leads |
| quotes | /quotes | /quotes/:id | name, status, created_at | POST /api/quotes | commercial.quotes |
| projects | /projects | /projects/:id | name, status, created_at | POST /api/projects | execution.projects |
| work_orders | /work_orders | /work_orders/:id | name, status, created_at | POST /api/work_orders | execution.work_orders |
| tasks | /tasks | /tasks/:id | name, status, created_at | POST /api/tasks | execution.project_tasks |
| suppliers | /suppliers | /suppliers/:id | name, status, created_at | POST /api/suppliers | procurement.suppliers |
| rfqs | /rfqs | /rfqs/:id | name, status, created_at | POST /api/rfqs | procurement.rfqs |
| purchase_orders | /purchase_orders | /purchase_orders/:id | name, status, created_at | POST /api/purchase_orders | procurement.purchase_orders |
| materials | /materials | /materials/:id | name, status, created_at | POST /api/materials | inventory.raw_materials |
| inventory_movements | /inventory_movements | /inventory_movements/:id | name, status, created_at | POST /api/inventory_movements | inventory.inventory_movements |
| employees | /employees | /employees/:id | name, status, created_at | POST /api/employees | workforce.employees |
| payroll_runs | /payroll_runs | /payroll_runs/:id | name, status, created_at | POST /api/payroll_runs | workforce.payroll_runs |
| invoices | /invoices | /invoices/:id | name, status, created_at | POST /api/invoices | finance.invoices |
| payments | /payments | /payments/:id | name, status, created_at | POST /api/payments | finance.payments |
| documents | /documents | /documents/:id | name, status, created_at | POST /api/documents | execution.handover_documents |
| ai_insights | /ai_insights | /ai_insights/:id | name, status, created_at | POST /api/ai_insights | intelligence.ai_insights |
| roles | /roles | /roles/:id | name, status, created_at | POST /api/roles | governance.roles |
| users | /users | /users/:id | name, status, created_at | POST /api/users | governance.users |
| audit_logs | /audit_logs | /audit_logs/:id | name, status, created_at | POST /api/audit_logs | governance.audit_logs |
