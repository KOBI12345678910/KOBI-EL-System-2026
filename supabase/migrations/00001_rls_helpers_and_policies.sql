-- =========================================================
-- RLS HELPERS + ROW LEVEL SECURITY POLICIES
-- Based on MASTER_RLS_POLICY_MATRIX
-- =========================================================

-- =========================================================
-- STEP 1: HELPER FUNCTIONS
-- =========================================================

create or replace function governance.current_user_profile_id()
returns bigint
language sql
security definer
stable
as $$
  select id from governance.users_profile
  where auth_user_id = auth.uid()
  limit 1;
$$;

create or replace function governance.current_user_has_role(p_role_code text)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1
    from governance.user_roles ur
    join governance.roles r on r.id = ur.role_id
    where ur.user_id = governance.current_user_profile_id()
      and r.role_code = p_role_code
      and (ur.expires_at is null or ur.expires_at > now())
  );
$$;

create or replace function governance.current_user_has_permission(p_permission_code text)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1
    from governance.user_roles ur
    join governance.role_permissions rp on rp.role_id = ur.role_id
    join governance.permissions p on p.id = rp.permission_id
    where ur.user_id = governance.current_user_profile_id()
      and (p.permission_code = p_permission_code or p.permission_code = 'admin.all')
      and (ur.expires_at is null or ur.expires_at > now())
  );
$$;

create or replace function governance.current_user_is_admin()
returns boolean
language sql
security definer
stable
as $$
  select governance.current_user_has_role('super_admin')
      or governance.current_user_has_role('admin');
$$;

create or replace function governance.current_user_is_executive()
returns boolean
language sql
security definer
stable
as $$
  select governance.current_user_has_role('ceo')
      or governance.current_user_has_role('cfo')
      or governance.current_user_is_admin();
$$;

create or replace function governance.current_user_is_finance()
returns boolean
language sql
security definer
stable
as $$
  select governance.current_user_has_role('finance_mgr')
      or governance.current_user_has_role('finance_agent')
      or governance.current_user_has_role('cfo')
      or governance.current_user_is_admin();
$$;

create or replace function governance.current_user_is_procurement()
returns boolean
language sql
security definer
stable
as $$
  select governance.current_user_has_role('procurement_mgr')
      or governance.current_user_has_role('procurement_agent')
      or governance.current_user_is_admin();
$$;

create or replace function governance.current_user_is_ops()
returns boolean
language sql
security definer
stable
as $$
  select governance.current_user_has_role('ops_manager')
      or governance.current_user_has_role('ops_agent')
      or governance.current_user_has_role('project_manager')
      or governance.current_user_has_role('technician')
      or governance.current_user_is_admin();
$$;

create or replace function governance.current_user_is_payroll_hr()
returns boolean
language sql
security definer
stable
as $$
  select governance.current_user_has_role('hr_manager')
      or governance.current_user_has_role('payroll_admin')
      or governance.current_user_is_admin();
$$;

create or replace function governance.current_user_is_sales()
returns boolean
language sql
security definer
stable
as $$
  select governance.current_user_has_role('sales_manager')
      or governance.current_user_has_role('sales_rep')
      or governance.current_user_is_admin();
$$;

create or replace function governance.current_user_is_inventory()
returns boolean
language sql
security definer
stable
as $$
  select governance.current_user_has_role('warehouse_mgr')
      or governance.current_user_has_role('warehouse_agent')
      or governance.current_user_is_procurement()
      or governance.current_user_is_admin();
$$;

create or replace function governance.current_portal_user_id()
returns bigint
language sql
security definer
stable
as $$
  select id from comms.portal_users
  where auth_user_id = auth.uid()
  limit 1;
$$;

-- =========================================================
-- STEP 2: ENABLE RLS ON ALL TABLES
-- =========================================================

-- Governance
alter table governance.users_profile enable row level security;
alter table governance.roles enable row level security;
alter table governance.permissions enable row level security;
alter table governance.role_permissions enable row level security;
alter table governance.user_roles enable row level security;
alter table governance.object_permissions enable row level security;
alter table governance.audit_logs enable row level security;
alter table governance.state_history enable row level security;
alter table governance.domain_events enable row level security;
alter table governance.event_subscriptions enable row level security;
alter table governance.event_deliveries enable row level security;
alter table governance.workflows enable row level security;
alter table governance.workflow_instances enable row level security;
alter table governance.workflow_steps enable row level security;
alter table governance.workflow_step_executions enable row level security;
alter table governance.validations_log enable row level security;
alter table governance.feature_flags enable row level security;
alter table governance.config_entries enable row level security;
alter table governance.queue_jobs enable row level security;
alter table governance.health_checks enable row level security;

-- Commercial
alter table commercial.pipeline_stages enable row level security;
alter table commercial.customers enable row level security;
alter table commercial.leads enable row level security;
alter table commercial.crm_activities enable row level security;
alter table commercial.opportunities enable row level security;
alter table commercial.quotes enable row level security;
alter table commercial.quote_lines enable row level security;
alter table commercial.pricing_snapshots enable row level security;
alter table commercial.customer_portal_accounts enable row level security;

-- Procurement
alter table procurement.suppliers enable row level security;
alter table procurement.rfqs enable row level security;
alter table procurement.rfq_items enable row level security;
alter table procurement.rfq_supplier_invites enable row level security;
alter table procurement.supplier_quotes enable row level security;
alter table procurement.supplier_quote_lines enable row level security;
alter table procurement.approvals enable row level security;
alter table procurement.contracts enable row level security;
alter table procurement.purchase_orders enable row level security;
alter table procurement.purchase_order_lines enable row level security;
alter table procurement.supplier_invoices enable row level security;
alter table procurement.returns enable row level security;
alter table procurement.warranty_cases enable row level security;
alter table procurement.supplier_portal_accounts enable row level security;

-- Execution
alter table execution.projects enable row level security;
alter table execution.project_phases enable row level security;
alter table execution.project_milestones enable row level security;
alter table execution.work_orders enable row level security;
alter table execution.work_order_tasks enable row level security;
alter table execution.tasks enable row level security;
alter table execution.task_dependencies enable row level security;
alter table execution.logistics_orders enable row level security;
alter table execution.delivery_events enable row level security;
alter table execution.installation_events enable row level security;
alter table execution.signatures enable row level security;
alter table execution.alerts enable row level security;

-- Inventory
alter table inventory.material_categories enable row level security;
alter table inventory.materials enable row level security;
alter table inventory.warehouses enable row level security;
alter table inventory.inventory enable row level security;
alter table inventory.inventory_receipts enable row level security;
alter table inventory.inventory_issues enable row level security;
alter table inventory.inventory_transfers enable row level security;
alter table inventory.inventory_reservations enable row level security;
alter table inventory.stock_counts enable row level security;
alter table inventory.stock_count_lines enable row level security;
alter table inventory.material_requests enable row level security;
alter table inventory.material_request_lines enable row level security;
alter table inventory.barcode_scans enable row level security;
alter table inventory.manufacturing_batches enable row level security;

-- Workforce
alter table workforce.employers enable row level security;
alter table workforce.employees enable row level security;
alter table workforce.hr_profiles enable row level security;
alter table workforce.workforce_assignments enable row level security;
alter table workforce.attendance enable row level security;
alter table workforce.payroll_runs enable row level security;
alter table workforce.payroll_entries enable row level security;
alter table workforce.wage_slips enable row level security;
alter table workforce.pension_records enable row level security;
alter table workforce.employee_expenses enable row level security;
alter table workforce.shifts enable row level security;

-- Finance
alter table finance.invoices enable row level security;
alter table finance.invoice_lines enable row level security;
alter table finance.receipts enable row level security;
alter table finance.payments enable row level security;
alter table finance.gl_transactions enable row level security;
alter table finance.vat_records enable row level security;
alter table finance.tax_records enable row level security;
alter table finance.tax_exports enable row level security;
alter table finance.bank_files enable row level security;
alter table finance.bank_matches enable row level security;
alter table finance.cashflow_entries enable row level security;
alter table finance.budget_entries enable row level security;
alter table finance.costing_entries enable row level security;
alter table finance.fx_rates enable row level security;
alter table finance.consolidation_entries enable row level security;
alter table finance.collection_cases enable row level security;
alter table finance.expenses enable row level security;
alter table finance.annual_tax_reports enable row level security;

-- Docs
alter table docs.documents enable row level security;
alter table docs.document_classifications enable row level security;
alter table docs.ocr_results enable row level security;
alter table docs.attachments enable row level security;
alter table docs.print_jobs enable row level security;
alter table docs.scan_sessions enable row level security;

-- Comms
alter table comms.portal_users enable row level security;
alter table comms.notifications enable row level security;
alter table comms.comms_threads enable row level security;
alter table comms.email_messages enable row level security;
alter table comms.sms_messages enable row level security;
alter table comms.whatsapp_messages enable row level security;
alter table comms.chatbot_sessions enable row level security;
alter table comms.support_tickets enable row level security;
alter table comms.help_articles enable row level security;

-- Intelligence
alter table intelligence.ai_insights enable row level security;
alter table intelligence.anomaly_cases enable row level security;
alter table intelligence.forecast_models enable row level security;
alter table intelligence.quality_scores enable row level security;
alter table intelligence.trend_signals enable row level security;
alter table intelligence.seasonality_patterns enable row level security;
alter table intelligence.decision_recommendations enable row level security;

-- Analytics
alter table analytics.rm_executive_summary enable row level security;
alter table analytics.rm_operations_summary enable row level security;
alter table analytics.rm_procurement_summary enable row level security;
alter table analytics.rm_finance_summary enable row level security;
alter table analytics.rm_workforce_summary enable row level security;
alter table analytics.rm_ai_summary enable row level security;

-- =========================================================
-- STEP 3: GOVERNANCE POLICIES
-- =========================================================

-- users_profile: own + admins
create policy "users_select_own" on governance.users_profile for select to authenticated
  using (auth_user_id = auth.uid() or governance.current_user_is_admin());

create policy "users_update_own_or_admin" on governance.users_profile for update to authenticated
  using (auth_user_id = auth.uid() or governance.current_user_is_admin());

-- roles/permissions: read-only for authenticated
create policy "roles_select" on governance.roles for select to authenticated using (true);
create policy "permissions_select" on governance.permissions for select to authenticated using (true);
create policy "role_permissions_select" on governance.role_permissions for select to authenticated using (true);

-- user_roles: own + admin
create policy "user_roles_select" on governance.user_roles for select to authenticated
  using (user_id = governance.current_user_profile_id() or governance.current_user_is_admin());

-- audit_logs: admin + executives
create policy "audit_select" on governance.audit_logs for select to authenticated
  using (governance.current_user_is_admin() or governance.current_user_is_executive());

-- state_history: read by anyone who can see the entity (simplified: authenticated)
create policy "state_history_select" on governance.state_history for select to authenticated using (true);

-- feature_flags: all authenticated read
create policy "flags_select" on governance.feature_flags for select to authenticated using (true);

-- config: admin only
create policy "config_select" on governance.config_entries for select to authenticated
  using (governance.current_user_is_admin());

-- workflows: authenticated read
create policy "workflows_select" on governance.workflows for select to authenticated using (true);
create policy "workflow_instances_select" on governance.workflow_instances for select to authenticated using (true);
create policy "workflow_steps_select" on governance.workflow_steps for select to authenticated using (true);
create policy "workflow_step_executions_select" on governance.workflow_step_executions for select to authenticated using (true);

-- domain events / deliveries / queue: admin only
create policy "domain_events_select" on governance.domain_events for select to authenticated
  using (governance.current_user_is_admin());
create policy "event_subs_select" on governance.event_subscriptions for select to authenticated
  using (governance.current_user_is_admin());
create policy "event_deliveries_select" on governance.event_deliveries for select to authenticated
  using (governance.current_user_is_admin());
create policy "queue_jobs_select" on governance.queue_jobs for select to authenticated
  using (governance.current_user_is_admin());
create policy "health_checks_select" on governance.health_checks for select to authenticated
  using (governance.current_user_is_admin());

-- object_permissions + validations_log: admin
create policy "obj_perms_select" on governance.object_permissions for select to authenticated
  using (governance.current_user_is_admin());
create policy "validations_select" on governance.validations_log for select to authenticated
  using (governance.current_user_is_admin());

-- =========================================================
-- STEP 4: COMMERCIAL POLICIES
-- =========================================================

create policy "pipeline_stages_select" on commercial.pipeline_stages for select to authenticated using (true);

create policy "customers_select" on commercial.customers for select to authenticated
  using (governance.current_user_is_sales() or governance.current_user_is_finance()
      or governance.current_user_is_ops() or governance.current_user_is_procurement()
      or governance.current_user_is_executive());

create policy "leads_select" on commercial.leads for select to authenticated
  using (governance.current_user_is_sales() or governance.current_user_is_executive()
      or governance.current_user_is_ops());

create policy "crm_activities_select" on commercial.crm_activities for select to authenticated
  using (governance.current_user_is_sales() or governance.current_user_is_ops()
      or governance.current_user_is_executive());

create policy "opportunities_select" on commercial.opportunities for select to authenticated
  using (governance.current_user_is_sales() or governance.current_user_is_executive());

create policy "quotes_select" on commercial.quotes for select to authenticated
  using (governance.current_user_is_sales() or governance.current_user_is_finance()
      or governance.current_user_is_ops() or governance.current_user_is_executive());

create policy "quote_lines_select" on commercial.quote_lines for select to authenticated
  using (governance.current_user_is_sales() or governance.current_user_is_finance()
      or governance.current_user_is_ops() or governance.current_user_is_executive());

create policy "pricing_snapshots_select" on commercial.pricing_snapshots for select to authenticated
  using (governance.current_user_is_sales() or governance.current_user_is_finance());

create policy "customer_portal_select" on commercial.customer_portal_accounts for select to authenticated
  using (governance.current_user_is_sales() or governance.current_user_is_admin());

-- =========================================================
-- STEP 5: PROCUREMENT POLICIES
-- =========================================================

create policy "suppliers_select" on procurement.suppliers for select to authenticated
  using (governance.current_user_is_procurement() or governance.current_user_is_finance()
      or governance.current_user_is_ops() or governance.current_user_is_executive());

create policy "rfqs_select" on procurement.rfqs for select to authenticated
  using (governance.current_user_is_procurement() or governance.current_user_is_executive()
      or governance.current_user_is_ops());

create policy "rfq_items_select" on procurement.rfq_items for select to authenticated
  using (governance.current_user_is_procurement() or governance.current_user_is_executive());

create policy "rfq_invites_select" on procurement.rfq_supplier_invites for select to authenticated
  using (governance.current_user_is_procurement());

create policy "supplier_quotes_select" on procurement.supplier_quotes for select to authenticated
  using (governance.current_user_is_procurement() or governance.current_user_is_executive());

create policy "supplier_quote_lines_select" on procurement.supplier_quote_lines for select to authenticated
  using (governance.current_user_is_procurement() or governance.current_user_is_executive());

create policy "approvals_select" on procurement.approvals for select to authenticated
  using (assigned_approver_user_id = governance.current_user_profile_id()
      or requested_by_user_id = governance.current_user_profile_id()
      or governance.current_user_is_admin() or governance.current_user_is_executive());

create policy "contracts_select" on procurement.contracts for select to authenticated
  using (governance.current_user_is_procurement() or governance.current_user_is_finance()
      or governance.current_user_is_executive());

create policy "po_select" on procurement.purchase_orders for select to authenticated
  using (governance.current_user_is_procurement() or governance.current_user_is_finance()
      or governance.current_user_is_ops() or governance.current_user_is_executive());

create policy "po_lines_select" on procurement.purchase_order_lines for select to authenticated
  using (governance.current_user_is_procurement() or governance.current_user_is_finance()
      or governance.current_user_is_executive());

create policy "supplier_invoices_select" on procurement.supplier_invoices for select to authenticated
  using (governance.current_user_is_procurement() or governance.current_user_is_finance()
      or governance.current_user_is_executive());

create policy "returns_select" on procurement.returns for select to authenticated
  using (governance.current_user_is_procurement() or governance.current_user_is_executive());

create policy "warranty_select" on procurement.warranty_cases for select to authenticated
  using (governance.current_user_is_procurement() or governance.current_user_is_ops()
      or governance.current_user_is_executive());

create policy "supplier_portal_select" on procurement.supplier_portal_accounts for select to authenticated
  using (governance.current_user_is_procurement() or governance.current_user_is_admin());

-- =========================================================
-- STEP 6: EXECUTION POLICIES
-- =========================================================

create policy "projects_select" on execution.projects for select to authenticated
  using (governance.current_user_is_ops() or governance.current_user_is_finance()
      or governance.current_user_is_procurement() or governance.current_user_is_executive());

create policy "phases_select" on execution.project_phases for select to authenticated
  using (governance.current_user_is_ops() or governance.current_user_is_executive());

create policy "milestones_select" on execution.project_milestones for select to authenticated
  using (governance.current_user_is_ops() or governance.current_user_is_executive()
      or governance.current_user_is_finance());

create policy "wo_select" on execution.work_orders for select to authenticated
  using (governance.current_user_is_ops() or governance.current_user_is_executive()
      or governance.current_user_is_finance());

create policy "wo_tasks_select" on execution.work_order_tasks for select to authenticated
  using (governance.current_user_is_ops() or governance.current_user_is_executive()
      or assignee_user_id = governance.current_user_profile_id());

create policy "tasks_select" on execution.tasks for select to authenticated
  using (assignee_user_id = governance.current_user_profile_id()
      or created_by = governance.current_user_profile_id()
      or governance.current_user_is_ops() or governance.current_user_is_executive());

create policy "task_deps_select" on execution.task_dependencies for select to authenticated using (true);

create policy "logistics_select" on execution.logistics_orders for select to authenticated
  using (governance.current_user_is_ops() or governance.current_user_is_executive());

create policy "delivery_events_select" on execution.delivery_events for select to authenticated
  using (governance.current_user_is_ops() or governance.current_user_is_executive());

create policy "installation_events_select" on execution.installation_events for select to authenticated
  using (governance.current_user_is_ops() or governance.current_user_is_executive());

create policy "signatures_select" on execution.signatures for select to authenticated using (true);

create policy "alerts_select" on execution.alerts for select to authenticated
  using (governance.current_user_is_ops() or governance.current_user_is_executive()
      or assigned_to_user_id = governance.current_user_profile_id());

-- =========================================================
-- STEP 7: INVENTORY POLICIES
-- =========================================================

create policy "categories_select" on inventory.material_categories for select to authenticated using (true);

create policy "materials_select" on inventory.materials for select to authenticated
  using (governance.current_user_is_inventory() or governance.current_user_is_ops()
      or governance.current_user_is_finance() or governance.current_user_is_executive());

create policy "warehouses_select" on inventory.warehouses for select to authenticated
  using (governance.current_user_is_inventory() or governance.current_user_is_ops());

create policy "inv_select" on inventory.inventory for select to authenticated
  using (governance.current_user_is_inventory() or governance.current_user_is_ops());

create policy "receipts_select" on inventory.inventory_receipts for select to authenticated
  using (governance.current_user_is_inventory() or governance.current_user_is_finance());

create policy "issues_select" on inventory.inventory_issues for select to authenticated
  using (governance.current_user_is_inventory() or governance.current_user_is_ops());

create policy "transfers_select" on inventory.inventory_transfers for select to authenticated
  using (governance.current_user_is_inventory() or governance.current_user_is_ops());

create policy "reservations_select" on inventory.inventory_reservations for select to authenticated
  using (governance.current_user_is_inventory() or governance.current_user_is_ops());

create policy "stock_counts_select" on inventory.stock_counts for select to authenticated
  using (governance.current_user_is_inventory());

create policy "stock_count_lines_select" on inventory.stock_count_lines for select to authenticated
  using (governance.current_user_is_inventory());

create policy "material_requests_select" on inventory.material_requests for select to authenticated
  using (governance.current_user_is_ops() or governance.current_user_is_procurement()
      or governance.current_user_is_executive());

create policy "material_request_lines_select" on inventory.material_request_lines for select to authenticated
  using (governance.current_user_is_ops() or governance.current_user_is_procurement());

create policy "barcode_scans_select" on inventory.barcode_scans for select to authenticated
  using (governance.current_user_is_inventory());

create policy "batches_select" on inventory.manufacturing_batches for select to authenticated
  using (governance.current_user_is_ops() or governance.current_user_is_inventory()
      or governance.current_user_is_executive());

-- =========================================================
-- STEP 8: WORKFORCE POLICIES
-- =========================================================

create policy "employers_select" on workforce.employers for select to authenticated
  using (governance.current_user_is_payroll_hr());

create policy "employees_select" on workforce.employees for select to authenticated
  using (governance.current_user_is_payroll_hr() or governance.current_user_is_ops()
      or governance.current_user_is_executive());

create policy "hr_profiles_select" on workforce.hr_profiles for select to authenticated
  using (governance.current_user_is_payroll_hr());

create policy "assignments_select" on workforce.workforce_assignments for select to authenticated
  using (governance.current_user_is_payroll_hr() or governance.current_user_is_ops());

create policy "attendance_select" on workforce.attendance for select to authenticated
  using (governance.current_user_is_payroll_hr() or governance.current_user_is_ops());

create policy "payroll_runs_select" on workforce.payroll_runs for select to authenticated
  using (governance.current_user_is_payroll_hr());

create policy "payroll_entries_select" on workforce.payroll_entries for select to authenticated
  using (governance.current_user_is_payroll_hr());

create policy "wage_slips_select" on workforce.wage_slips for select to authenticated
  using (governance.current_user_is_payroll_hr());

create policy "pension_select" on workforce.pension_records for select to authenticated
  using (governance.current_user_is_payroll_hr());

create policy "emp_expenses_select" on workforce.employee_expenses for select to authenticated
  using (governance.current_user_is_payroll_hr());

create policy "shifts_select" on workforce.shifts for select to authenticated
  using (governance.current_user_is_payroll_hr() or governance.current_user_is_ops());

-- =========================================================
-- STEP 9: FINANCE POLICIES
-- =========================================================

create policy "invoices_select" on finance.invoices for select to authenticated
  using (governance.current_user_is_finance() or governance.current_user_is_executive());

create policy "invoice_lines_select" on finance.invoice_lines for select to authenticated
  using (governance.current_user_is_finance() or governance.current_user_is_executive());

create policy "receipts_select" on finance.receipts for select to authenticated
  using (governance.current_user_is_finance() or governance.current_user_is_executive());

create policy "payments_select" on finance.payments for select to authenticated
  using (governance.current_user_is_finance() or governance.current_user_is_executive());

create policy "gl_select" on finance.gl_transactions for select to authenticated
  using (governance.current_user_is_finance());

create policy "vat_select" on finance.vat_records for select to authenticated
  using (governance.current_user_is_finance());

create policy "tax_records_select" on finance.tax_records for select to authenticated
  using (governance.current_user_is_finance());

create policy "tax_exports_select" on finance.tax_exports for select to authenticated
  using (governance.current_user_is_finance() or governance.current_user_is_executive());

create policy "bank_files_select" on finance.bank_files for select to authenticated
  using (governance.current_user_is_finance());

create policy "bank_matches_select" on finance.bank_matches for select to authenticated
  using (governance.current_user_is_finance());

create policy "cashflow_select" on finance.cashflow_entries for select to authenticated
  using (governance.current_user_is_finance() or governance.current_user_is_executive());

create policy "budget_select" on finance.budget_entries for select to authenticated
  using (governance.current_user_is_finance() or governance.current_user_is_ops()
      or governance.current_user_is_executive());

create policy "costing_select" on finance.costing_entries for select to authenticated
  using (governance.current_user_is_finance() or governance.current_user_is_ops()
      or governance.current_user_is_executive());

create policy "fx_select" on finance.fx_rates for select to authenticated using (true);

create policy "consolidation_select" on finance.consolidation_entries for select to authenticated
  using (governance.current_user_is_finance() or governance.current_user_is_executive());

create policy "collections_select" on finance.collection_cases for select to authenticated
  using (governance.current_user_is_finance() or governance.current_user_is_executive());

create policy "expenses_select" on finance.expenses for select to authenticated
  using (governance.current_user_is_finance() or governance.current_user_is_executive());

create policy "annual_tax_select" on finance.annual_tax_reports for select to authenticated
  using (governance.current_user_is_finance() or governance.current_user_is_executive());

-- =========================================================
-- STEP 10: DOCS POLICIES
-- =========================================================

create policy "docs_select" on docs.documents for select to authenticated using (true);
create policy "classifications_select" on docs.document_classifications for select to authenticated using (true);
create policy "ocr_select" on docs.ocr_results for select to authenticated using (true);
create policy "attachments_select" on docs.attachments for select to authenticated using (true);
create policy "print_jobs_select" on docs.print_jobs for select to authenticated using (true);
create policy "scan_sessions_select" on docs.scan_sessions for select to authenticated
  using (governance.current_user_is_admin());

-- =========================================================
-- STEP 11: COMMS POLICIES
-- =========================================================

create policy "portal_users_select" on comms.portal_users for select to authenticated
  using (auth_user_id = auth.uid() or governance.current_user_is_admin());

create policy "notifications_select" on comms.notifications for select to authenticated
  using (user_id = governance.current_user_profile_id()
      or portal_user_id = governance.current_portal_user_id());

create policy "notifications_update_read" on comms.notifications for update to authenticated
  using (user_id = governance.current_user_profile_id());

create policy "threads_select" on comms.comms_threads for select to authenticated using (true);
create policy "emails_select" on comms.email_messages for select to authenticated using (true);
create policy "sms_select" on comms.sms_messages for select to authenticated using (true);
create policy "whatsapp_select" on comms.whatsapp_messages for select to authenticated using (true);

create policy "chatbot_select" on comms.chatbot_sessions for select to authenticated
  using (user_id = governance.current_user_profile_id() or governance.current_user_is_admin());

create policy "tickets_select" on comms.support_tickets for select to authenticated
  using (assigned_to_user_id = governance.current_user_profile_id()
      or governance.current_user_is_admin());

create policy "articles_select" on comms.help_articles for select to authenticated
  using (status = 'published' or governance.current_user_is_admin());

-- =========================================================
-- STEP 12: INTELLIGENCE POLICIES
-- =========================================================

create policy "insights_select" on intelligence.ai_insights for select to authenticated
  using (governance.current_user_is_executive() or governance.current_user_is_admin());

create policy "anomalies_select" on intelligence.anomaly_cases for select to authenticated
  using (governance.current_user_is_executive() or governance.current_user_is_admin());

create policy "forecasts_select" on intelligence.forecast_models for select to authenticated
  using (governance.current_user_is_executive() or governance.current_user_is_admin());

create policy "quality_select" on intelligence.quality_scores for select to authenticated
  using (governance.current_user_is_executive() or governance.current_user_is_admin());

create policy "trends_select" on intelligence.trend_signals for select to authenticated
  using (governance.current_user_is_executive() or governance.current_user_is_admin());

create policy "seasonality_select" on intelligence.seasonality_patterns for select to authenticated
  using (governance.current_user_is_admin());

create policy "recommendations_select" on intelligence.decision_recommendations for select to authenticated
  using (governance.current_user_is_executive() or governance.current_user_is_admin());

-- =========================================================
-- STEP 13: ANALYTICS POLICIES
-- =========================================================

create policy "rm_exec_select" on analytics.rm_executive_summary for select to authenticated
  using (governance.current_user_is_executive());

create policy "rm_ops_select" on analytics.rm_operations_summary for select to authenticated
  using (governance.current_user_is_ops() or governance.current_user_is_executive());

create policy "rm_proc_select" on analytics.rm_procurement_summary for select to authenticated
  using (governance.current_user_is_procurement() or governance.current_user_is_executive());

create policy "rm_fin_select" on analytics.rm_finance_summary for select to authenticated
  using (governance.current_user_is_finance() or governance.current_user_is_executive());

create policy "rm_work_select" on analytics.rm_workforce_summary for select to authenticated
  using (governance.current_user_is_payroll_hr() or governance.current_user_is_executive());

create policy "rm_ai_select" on analytics.rm_ai_summary for select to authenticated
  using (governance.current_user_is_admin() or governance.current_user_is_executive());
