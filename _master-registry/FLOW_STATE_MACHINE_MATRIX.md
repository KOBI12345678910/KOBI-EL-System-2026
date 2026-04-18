# FLOW + STATE-MACHINE MATRIX

Generated: 2026-04-18

Sources: onyx-procurement/src/pipeline/workflow-flows.js, state-machines.js, migration 00063_orchestration.

## Business Flows

| Flow | Entities Involved | Stages | Related Pages | Related APIs |
|---|---|---|---|---|
| Sales to Project | Lead, Quote, Opportunity, Project | lead_captured -> quote_sent -> quote_approved -> project_created | /leads /quotes /projects | POST /api/leads, /quotes, /projects |
| Project to Procurement | Project, Work Order, RFQ, PO | project_active -> wo_created -> rfq_issued -> po_approved | /projects /work-orders /rfqs /purchase-orders | POST /api/projects, /work-orders, /rfqs, /purchase-orders |
| Procurement to Inventory | PO, Goods Receipt, Inventory, Three Way Match | po_sent -> goods_received -> inventory_updated -> matched | /purchase-orders /goods-receipts /inventory-movements | POST /api/goods-receipts, /three-way-matches |
| Execution to Cash | WO, Delivery, Invoice, Payment | wo_completed -> delivery_signed -> invoice_issued -> payment_received | /work-orders /invoices /payments | POST /api/invoices, /payments, /payment-allocations |
| Employee to Payroll | Employee, Attendance, Payroll Run, Wage Slip | attendance_submitted -> payroll_run -> wage_slip -> paid | /employees /attendance /payroll-runs /wage-slips | POST /api/payroll-runs, /wage-slips |

## State Machines (13)

| Entity | States | Transitions | Side Effects |
|---|---|---|---|
| lead | new, contacted, qualified, converted, lost | 5 | create_opportunity, send_email |
| opportunity | open, proposing, negotiating, won, lost | 6 | create_quote, update_forecast |
| quote | draft, sent, approved, rejected, expired | 7 | create_project, notify_sales |
| project | planned, active, on_hold, completed, cancelled | 8 | create_wo, allocate_budget |
| work_order | draft, issued, in_progress, completed, signed, invoiced | 9 | allocate_materials, schedule_crew |
| rfq | draft, published, receiving, awarded, cancelled | 6 | notify_suppliers, create_po |
| purchase_order | draft, approved, sent, received, invoiced, closed | 8 | reserve_budget, expect_goods |
| goods_receipt | draft, received, partial, inspected, accepted, rejected | 7 | update_inventory, create_tmw |
| invoice | draft, issued, sent, partially_paid, paid, overdue, cancelled | 10 | send_email, update_ar |
| payment | pending, cleared, reconciled, failed, refunded | 6 | update_cashflow, allocate_to_invoices |
| collection_case | open, in_progress, payment_plan, resolved, written_off | 6 | dunning_schedule, escalate |
| payroll_run | draft, in_progress, approved, paid, closed | 5 | generate_wage_slips, export_bank_file |
| document | draft, pending_review, approved, archived, deleted | 5 | send_signature, notify_owner |
