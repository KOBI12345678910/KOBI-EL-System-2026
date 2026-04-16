-- =========================================================
-- Migration 005: Row-Level Security Policies
-- TechnoKol Uzi ERP 2026
--
-- Enables RLS on all core tables and creates per-entity
-- SELECT/INSERT/UPDATE policies using the governance.*
-- helper functions from migration 004.
-- =========================================================

-- ── Enable RLS ──
alter table commercial.customers          enable row level security;
alter table commercial.leads              enable row level security;
alter table commercial.quotes             enable row level security;
alter table commercial.quote_lines        enable row level security;
alter table procurement.suppliers         enable row level security;
alter table procurement.rfqs              enable row level security;
alter table procurement.rfq_items         enable row level security;
alter table procurement.rfq_supplier_invites enable row level security;
alter table procurement.purchase_orders   enable row level security;
alter table procurement.purchase_order_lines enable row level security;
alter table procurement.approvals         enable row level security;
alter table execution.projects            enable row level security;
alter table execution.work_orders         enable row level security;
alter table execution.work_order_tasks    enable row level security;
alter table execution.tasks               enable row level security;
alter table execution.alerts              enable row level security;
alter table execution.logistics_orders    enable row level security;
alter table inventory.materials           enable row level security;
alter table inventory.inventory           enable row level security;
alter table inventory.inventory_receipts  enable row level security;
alter table inventory.inventory_issues    enable row level security;
alter table inventory.inventory_reservations enable row level security;
alter table workforce.employees           enable row level security;
alter table workforce.attendance          enable row level security;
alter table workforce.payroll_runs        enable row level security;
alter table workforce.payroll_entries     enable row level security;
alter table workforce.workforce_assignments enable row level security;
alter table workforce.employee_expenses   enable row level security;
alter table finance.invoices              enable row level security;
alter table finance.invoice_lines         enable row level security;
alter table finance.payments              enable row level security;
alter table finance.collection_cases      enable row level security;
alter table finance.gl_transactions       enable row level security;
alter table finance.vat_records           enable row level security;
alter table docs.documents                enable row level security;
alter table docs.attachments              enable row level security;
alter table intelligence.ai_insights      enable row level security;
alter table intelligence.anomaly_cases    enable row level security;
alter table intelligence.forecast_models  enable row level security;
alter table intelligence.decision_recommendations enable row level security;

-- ═══════════════════════════════════════════════════════════
-- CUSTOMERS
-- ═══════════════════════════════════════════════════════════
create policy customers_select on commercial.customers for select
  using (governance.can_read_customer(id));
create policy customers_insert on commercial.customers for insert
  with check (governance.current_user_has_permission('customers.create') or governance.current_user_is_admin());
create policy customers_update on commercial.customers for update
  using (governance.can_write_customer(id))
  with check (governance.can_write_customer(id));

-- ═══════════════════════════════════════════════════════════
-- SUPPLIERS
-- ═══════════════════════════════════════════════════════════
create policy suppliers_select on procurement.suppliers for select
  using (governance.can_read_supplier(id));
create policy suppliers_insert on procurement.suppliers for insert
  with check (governance.current_user_has_permission('suppliers.create') or governance.current_user_is_admin());
create policy suppliers_update on procurement.suppliers for update
  using (governance.can_write_supplier(id))
  with check (governance.can_write_supplier(id));

-- ═══════════════════════════════════════════════════════════
-- PROJECTS
-- ═══════════════════════════════════════════════════════════
create policy projects_select on execution.projects for select
  using (governance.can_read_project(id));
create policy projects_insert on execution.projects for insert
  with check (governance.current_user_has_permission('projects.create') or governance.current_user_is_admin());
create policy projects_update on execution.projects for update
  using (governance.can_write_project(id))
  with check (governance.can_write_project(id));

-- ═══════════════════════════════════════════════════════════
-- WORK ORDERS
-- ═══════════════════════════════════════════════════════════
create policy work_orders_select on execution.work_orders for select
  using (governance.can_read_work_order(id));
create policy work_orders_insert on execution.work_orders for insert
  with check (governance.current_user_has_permission('workorders.create') or governance.current_user_is_admin());
create policy work_orders_update on execution.work_orders for update
  using (governance.current_user_has_permission('workorders.update') or governance.current_user_is_admin())
  with check (governance.current_user_has_permission('workorders.update') or governance.current_user_is_admin());

-- ═══════════════════════════════════════════════════════════
-- EMPLOYEES
-- ═══════════════════════════════════════════════════════════
create policy employees_select on workforce.employees for select
  using (governance.can_read_employee(id));
create policy employees_insert on workforce.employees for insert
  with check (governance.current_user_has_permission('employees.create') or governance.current_user_is_admin());
create policy employees_update on workforce.employees for update
  using (governance.can_write_employee(id))
  with check (governance.can_write_employee(id));

-- ═══════════════════════════════════════════════════════════
-- ATTENDANCE
-- ═══════════════════════════════════════════════════════════
create policy attendance_select on workforce.attendance for select
  using (
    governance.current_user_has_any_role(array['payroll','payroll_manager','hr','hr_manager','ops','ops_manager'])
    or exists (
      select 1 from workforce.employees e
      join governance.users_profile up on up.email = e.email
      where e.id = workforce.attendance.employee_id
        and up.id = governance.current_user_profile_id()
    )
    or governance.current_user_is_admin()
    or governance.current_user_is_executive()
  );
create policy attendance_insert on workforce.attendance for insert
  with check (governance.current_user_has_permission('attendance.create') or governance.current_user_is_admin());
create policy attendance_update on workforce.attendance for update
  using (governance.current_user_has_permission('attendance.update')
    or governance.current_user_has_permission('attendance.approve')
    or governance.current_user_is_admin())
  with check (governance.current_user_has_permission('attendance.update')
    or governance.current_user_has_permission('attendance.approve')
    or governance.current_user_is_admin());

-- ═══════════════════════════════════════════════════════════
-- INVOICES
-- ═══════════════════════════════════════════════════════════
create policy invoices_select on finance.invoices for select
  using (governance.can_read_invoice(id));
create policy invoices_insert on finance.invoices for insert
  with check (governance.current_user_has_permission('invoices.create') or governance.current_user_is_admin());
create policy invoices_update on finance.invoices for update
  using (governance.current_user_has_permission('invoices.update')
    or governance.current_user_has_permission('invoices.issue')
    or governance.current_user_is_admin())
  with check (governance.current_user_has_permission('invoices.update')
    or governance.current_user_has_permission('invoices.issue')
    or governance.current_user_is_admin());

-- ═══════════════════════════════════════════════════════════
-- PAYMENTS
-- ═══════════════════════════════════════════════════════════
create policy payments_select on finance.payments for select
  using (governance.current_user_has_any_role(array['finance','finance_manager'])
    or governance.current_user_is_admin()
    or governance.current_user_is_executive());
create policy payments_insert on finance.payments for insert
  with check (governance.current_user_has_permission('payments.create') or governance.current_user_is_admin());
create policy payments_update on finance.payments for update
  using (governance.current_user_has_permission('payments.update')
    or governance.current_user_has_permission('payments.reconcile')
    or governance.current_user_is_admin())
  with check (governance.current_user_has_permission('payments.update')
    or governance.current_user_has_permission('payments.reconcile')
    or governance.current_user_is_admin());

-- ═══════════════════════════════════════════════════════════
-- DOCUMENTS (polymorphic parent)
-- ═══════════════════════════════════════════════════════════
create policy documents_select on docs.documents for select
  using (governance.can_read_document(id));
create policy documents_insert on docs.documents for insert
  with check (governance.current_user_has_permission('documents.create') or governance.current_user_is_admin());
create policy documents_update on docs.documents for update
  using (governance.current_user_has_permission('documents.update') or governance.current_user_is_admin())
  with check (governance.current_user_has_permission('documents.update') or governance.current_user_is_admin());

-- ═══════════════════════════════════════════════════════════
-- AI INSIGHTS (parent-scoped)
-- ═══════════════════════════════════════════════════════════
create policy ai_insights_select on intelligence.ai_insights for select
  using (governance.can_read_parent_entity(parent_entity_type, parent_entity_id)
    or governance.current_user_is_admin()
    or governance.current_user_is_executive());
create policy ai_insights_insert on intelligence.ai_insights for insert
  with check (governance.current_user_has_any_role(array['ai_service','admin','platform_admin'])
    or governance.current_user_is_admin());
create policy ai_insights_update on intelligence.ai_insights for update
  using (governance.can_read_parent_entity(parent_entity_type, parent_entity_id)
    or governance.current_user_has_any_role(array['ai_service'])
    or governance.current_user_is_admin())
  with check (governance.can_read_parent_entity(parent_entity_type, parent_entity_id)
    or governance.current_user_has_any_role(array['ai_service'])
    or governance.current_user_is_admin());

-- ═══════════════════════════════════════════════════════════
-- QUOTES (customer-scoped read)
-- ═══════════════════════════════════════════════════════════
create policy quotes_select on commercial.quotes for select
  using (governance.can_read_customer(customer_id)
    or governance.current_user_is_admin());
create policy quotes_insert on commercial.quotes for insert
  with check (governance.current_user_has_permission('quotes.create') or governance.current_user_is_admin());
create policy quotes_update on commercial.quotes for update
  using (governance.current_user_has_permission('quotes.update')
    or governance.current_user_has_permission('quotes.approve')
    or governance.current_user_is_admin())
  with check (governance.current_user_has_permission('quotes.update')
    or governance.current_user_has_permission('quotes.approve')
    or governance.current_user_is_admin());

-- ═══════════════════════════════════════════════════════════
-- PURCHASE ORDERS (supplier-scoped read)
-- ═══════════════════════════════════════════════════════════
create policy po_select on procurement.purchase_orders for select
  using (governance.can_read_supplier(supplier_id) or governance.current_user_is_admin());
create policy po_insert on procurement.purchase_orders for insert
  with check (governance.current_user_has_permission('po.create') or governance.current_user_is_admin());
create policy po_update on procurement.purchase_orders for update
  using (governance.current_user_has_permission('po.update')
    or governance.current_user_has_permission('po.approve')
    or governance.current_user_is_admin())
  with check (governance.current_user_has_permission('po.update')
    or governance.current_user_has_permission('po.approve')
    or governance.current_user_is_admin());

-- ═══════════════════════════════════════════════════════════
-- RFQs
-- ═══════════════════════════════════════════════════════════
create policy rfqs_select on procurement.rfqs for select
  using (governance.current_user_has_any_role(array['procurement','procurement_manager','finance','finance_manager'])
    or governance.current_user_is_admin()
    or governance.current_user_is_executive());
create policy rfqs_insert on procurement.rfqs for insert
  with check (governance.current_user_has_permission('rfq.create') or governance.current_user_is_admin());
create policy rfqs_update on procurement.rfqs for update
  using (governance.current_user_has_permission('rfq.update')
    or governance.current_user_has_permission('rfq.approve')
    or governance.current_user_is_admin())
  with check (governance.current_user_has_permission('rfq.update')
    or governance.current_user_has_permission('rfq.approve')
    or governance.current_user_is_admin());

-- ═══════════════════════════════════════════════════════════
-- GL TRANSACTIONS (finance-only read)
-- ═══════════════════════════════════════════════════════════
create policy gl_select on finance.gl_transactions for select
  using (governance.current_user_has_any_role(array['finance','finance_manager'])
    or governance.current_user_is_admin()
    or governance.current_user_is_executive());
create policy gl_insert on finance.gl_transactions for insert
  with check (governance.current_user_has_any_role(array['finance','finance_manager','ai_service'])
    or governance.current_user_is_admin());

-- ═══════════════════════════════════════════════════════════
-- ALERTS (broad read, restricted write)
-- ═══════════════════════════════════════════════════════════
create policy alerts_select on execution.alerts for select
  using (governance.can_read_parent_entity(parent_entity_type, parent_entity_id)
    or governance.current_user_is_admin()
    or governance.current_user_is_executive());
create policy alerts_insert on execution.alerts for insert
  with check (governance.current_user_is_admin()
    or governance.current_user_has_any_role(array['ai_service','platform_admin']));
create policy alerts_update on execution.alerts for update
  using (governance.can_read_parent_entity(parent_entity_type, parent_entity_id)
    or governance.current_user_is_admin());
