-- ============================================================
-- FILE: supabase/migrations/00014_rls_policies_expansion_tables.sql
-- RLS POLICIES for 60 expansion tables (migrations 00010 + 00011)
-- ============================================================

-- ============================================================
-- HELPER: enable RLS on all new tables
-- ============================================================

alter table commercial.customer_contacts enable row level security;
alter table commercial.lead_tags enable row level security;
alter table commercial.lead_tag_assignments enable row level security;
alter table commercial.quote_revisions enable row level security;
alter table commercial.quote_approval_rules enable row level security;

alter table procurement.supplier_contacts enable row level security;
alter table procurement.approval_steps enable row level security;
alter table procurement.supplier_scorecards enable row level security;
alter table procurement.contract_milestones enable row level security;
alter table procurement.rfq_comparison_snapshots enable row level security;

alter table execution.project_risks enable row level security;
alter table execution.project_blockers enable row level security;
alter table execution.task_comments enable row level security;
alter table execution.task_attachments enable row level security;
alter table execution.project_cost_plans enable row level security;
alter table execution.work_order_qa_checklists enable row level security;
alter table execution.work_order_qa_items enable row level security;

alter table finance.reconciliation_exceptions enable row level security;
alter table finance.payment_allocations enable row level security;
alter table finance.dunning_campaigns enable row level security;
alter table finance.dunning_steps enable row level security;
alter table finance.collection_actions enable row level security;
alter table finance.reminder_schedules enable row level security;

alter table workforce.payroll_export_batches enable row level security;
alter table workforce.payroll_exceptions enable row level security;
alter table workforce.pay_components enable row level security;
alter table workforce.employee_pay_components enable row level security;
alter table workforce.leave_types enable row level security;
alter table workforce.leave_requests enable row level security;

alter table inventory.material_lots enable row level security;
alter table inventory.inventory_movements enable row level security;
alter table inventory.reorder_rules enable row level security;
alter table inventory.shortage_snapshots enable row level security;

alter table docs.document_signature_requests enable row level security;
alter table docs.document_versions enable row level security;

alter table comms.portal_sessions enable row level security;
alter table comms.notification_deliveries enable row level security;
alter table comms.support_sla_tracking enable row level security;

alter table analytics.dashboard_definitions enable row level security;
alter table analytics.dashboard_widgets enable row level security;
alter table analytics.kpi_snapshots enable row level security;
alter table analytics.read_model_invalidations enable row level security;

alter table governance.webhook_endpoints enable row level security;
alter table governance.webhook_deliveries enable row level security;
alter table governance.integration_connections enable row level security;
alter table governance.integration_sync_logs enable row level security;
alter table governance.feature_flag_targets enable row level security;
alter table governance.user_preferences enable row level security;
alter table governance.saved_filters enable row level security;
alter table governance.escalation_rules enable row level security;
alter table governance.alert_subscriptions enable row level security;
alter table governance.sla_timers enable row level security;
alter table governance.job_executions enable row level security;
alter table governance.audit_log_attachments enable row level security;
alter table governance.command_logs enable row level security;
alter table governance.security_events enable row level security;

alter table intelligence.anomaly_feedback enable row level security;
alter table intelligence.model_registry enable row level security;
alter table intelligence.model_executions enable row level security;
alter table intelligence.recommendation_feedback enable row level security;

-- ============================================================
-- SERVICE ROLE BYPASS (edge functions use service_role)
-- All tables get a service_role bypass policy
-- ============================================================

do $$
declare
  tbl record;
  policy_name text;
begin
  for tbl in
    select schemaname, tablename
    from pg_tables
    where schemaname in (
      'commercial','procurement','execution','finance',
      'workforce','inventory','docs','comms',
      'analytics','governance','intelligence'
    )
    and tablename in (
      'customer_contacts','lead_tags','lead_tag_assignments','quote_revisions','quote_approval_rules',
      'supplier_contacts','approval_steps','supplier_scorecards','contract_milestones','rfq_comparison_snapshots',
      'project_risks','project_blockers','task_comments','task_attachments','project_cost_plans',
      'work_order_qa_checklists','work_order_qa_items',
      'reconciliation_exceptions','payment_allocations','dunning_campaigns','dunning_steps',
      'collection_actions','reminder_schedules',
      'payroll_export_batches','payroll_exceptions','pay_components','employee_pay_components',
      'leave_types','leave_requests',
      'material_lots','inventory_movements','reorder_rules','shortage_snapshots',
      'document_signature_requests','document_versions',
      'portal_sessions','notification_deliveries','support_sla_tracking',
      'dashboard_definitions','dashboard_widgets','kpi_snapshots','read_model_invalidations',
      'webhook_endpoints','webhook_deliveries','integration_connections','integration_sync_logs',
      'feature_flag_targets','user_preferences','saved_filters',
      'escalation_rules','alert_subscriptions','sla_timers','job_executions',
      'audit_log_attachments','command_logs','security_events',
      'anomaly_feedback','model_registry','model_executions','recommendation_feedback'
    )
  loop
    policy_name := 'srv_' || tbl.tablename || '_all';

    execute format(
      'create policy if not exists %I on %I.%I for all to service_role using (true) with check (true)',
      policy_name,
      tbl.schemaname,
      tbl.tablename
    );
  end loop;
end;
$$;

-- ============================================================
-- AUTHENTICATED USER READ POLICIES (domain-based)
-- ============================================================

-- Commercial: authenticated users with commercial domain permissions
create policy rls_customer_contacts_read on commercial.customer_contacts
  for select to authenticated
  using (governance.current_user_has_permission('customers.read'));

create policy rls_lead_tags_read on commercial.lead_tags
  for select to authenticated using (true);

create policy rls_lead_tag_assignments_read on commercial.lead_tag_assignments
  for select to authenticated
  using (governance.current_user_has_permission('customers.read'));

create policy rls_quote_revisions_read on commercial.quote_revisions
  for select to authenticated
  using (governance.current_user_has_permission('quotes.read'));

create policy rls_quote_approval_rules_read on commercial.quote_approval_rules
  for select to authenticated
  using (governance.current_user_has_permission('quotes.read'));

-- Procurement
create policy rls_supplier_contacts_read on procurement.supplier_contacts
  for select to authenticated
  using (governance.current_user_has_permission('suppliers.read'));

create policy rls_approval_steps_read on procurement.approval_steps
  for select to authenticated
  using (governance.current_user_has_permission('po.read'));

create policy rls_supplier_scorecards_read on procurement.supplier_scorecards
  for select to authenticated
  using (governance.current_user_has_permission('suppliers.read'));

create policy rls_contract_milestones_read on procurement.contract_milestones
  for select to authenticated
  using (governance.current_user_has_permission('po.read'));

create policy rls_rfq_comparison_snapshots_read on procurement.rfq_comparison_snapshots
  for select to authenticated
  using (governance.current_user_has_permission('rfq.read'));

-- Execution
create policy rls_project_risks_read on execution.project_risks
  for select to authenticated
  using (governance.current_user_has_permission('projects.read'));

create policy rls_project_blockers_read on execution.project_blockers
  for select to authenticated
  using (governance.current_user_has_permission('projects.read'));

create policy rls_task_comments_read on execution.task_comments
  for select to authenticated
  using (governance.current_user_has_permission('workorders.read'));

create policy rls_task_attachments_read on execution.task_attachments
  for select to authenticated
  using (governance.current_user_has_permission('workorders.read'));

create policy rls_project_cost_plans_read on execution.project_cost_plans
  for select to authenticated
  using (governance.current_user_has_permission('projects.read'));

create policy rls_wo_qa_checklists_read on execution.work_order_qa_checklists
  for select to authenticated
  using (governance.current_user_has_permission('workorders.read'));

create policy rls_wo_qa_items_read on execution.work_order_qa_items
  for select to authenticated
  using (governance.current_user_has_permission('workorders.read'));

-- Finance
create policy rls_recon_exceptions_read on finance.reconciliation_exceptions
  for select to authenticated
  using (governance.current_user_has_permission('payments.read'));

create policy rls_payment_allocations_read on finance.payment_allocations
  for select to authenticated
  using (governance.current_user_has_permission('payments.read'));

create policy rls_dunning_campaigns_read on finance.dunning_campaigns
  for select to authenticated
  using (governance.current_user_has_permission('invoices.read'));

create policy rls_dunning_steps_read on finance.dunning_steps
  for select to authenticated
  using (governance.current_user_has_permission('invoices.read'));

create policy rls_collection_actions_read on finance.collection_actions
  for select to authenticated
  using (governance.current_user_has_permission('payments.read'));

create policy rls_reminder_schedules_read on finance.reminder_schedules
  for select to authenticated
  using (governance.current_user_has_permission('invoices.read'));

-- Workforce
create policy rls_payroll_export_batches_read on workforce.payroll_export_batches
  for select to authenticated
  using (governance.current_user_has_permission('payroll.export'));

create policy rls_payroll_exceptions_read on workforce.payroll_exceptions
  for select to authenticated
  using (governance.current_user_has_permission('payroll.create'));

create policy rls_pay_components_read on workforce.pay_components
  for select to authenticated
  using (governance.current_user_has_permission('employees.read'));

create policy rls_employee_pay_components_read on workforce.employee_pay_components
  for select to authenticated
  using (governance.current_user_has_permission('employees.read'));

create policy rls_leave_types_read on workforce.leave_types
  for select to authenticated using (true);

create policy rls_leave_requests_read on workforce.leave_requests
  for select to authenticated
  using (governance.current_user_has_permission('employees.read'));

-- Governance: user_preferences — own row only
create policy rls_user_preferences_own on governance.user_preferences
  for all to authenticated
  using (user_id = governance.current_user_profile_id())
  with check (user_id = governance.current_user_profile_id());

-- Governance: saved_filters — own or shared
create policy rls_saved_filters_read on governance.saved_filters
  for select to authenticated
  using (user_id = governance.current_user_profile_id() or is_shared = true);

-- Governance: alert_subscriptions — own
create policy rls_alert_subscriptions_own on governance.alert_subscriptions
  for all to authenticated
  using (user_id = governance.current_user_profile_id())
  with check (user_id = governance.current_user_profile_id());

-- Analytics: dashboards are public read
create policy rls_dashboard_defs_read on analytics.dashboard_definitions
  for select to authenticated using (active = true);

create policy rls_dashboard_widgets_read on analytics.dashboard_widgets
  for select to authenticated using (active = true);

create policy rls_kpi_snapshots_read on analytics.kpi_snapshots
  for select to authenticated using (true);

-- Intelligence
create policy rls_anomaly_feedback_read on intelligence.anomaly_feedback
  for select to authenticated
  using (governance.current_user_has_permission('ai.read'));

create policy rls_model_registry_read on intelligence.model_registry
  for select to authenticated
  using (governance.current_user_has_permission('ai.read'));

create policy rls_model_executions_read on intelligence.model_executions
  for select to authenticated
  using (governance.current_user_has_permission('ai.read'));

create policy rls_recommendation_feedback_read on intelligence.recommendation_feedback
  for select to authenticated
  using (governance.current_user_has_permission('ai.read'));
