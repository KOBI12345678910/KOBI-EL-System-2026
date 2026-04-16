-- =========================================================
-- Migration 006: Read Model Views & 360 RPCs
-- TechnoKol Uzi ERP 2026
--
-- Analytics views for control rooms + secure RPC functions
-- for 360 pages. All RPCs enforce governance checks before
-- returning data.
-- =========================================================

-- ═══════════════════════════════════════════════════════════
-- EXECUTIVE SUMMARY VIEW
-- ═══════════════════════════════════════════════════════════
create or replace view analytics.v_executive_summary as
select
  current_date as snapshot_date,
  coalesce((select sum(i.grand_total) from finance.invoices i where i.state in ('Issued','PartiallyPaid','Paid')), 0) as total_revenue,
  coalesce((select count(*) from execution.projects p where p.state not in ('Closed','Cancelled')), 0) as open_projects_count,
  coalesce((select sum(i.balance_due) from finance.invoices i where i.state = 'Overdue'), 0) as overdue_collections_amount,
  coalesce((select count(*) from procurement.purchase_orders po where po.state = 'SentToSupplier' and po.expected_delivery_date < current_date), 0) as procurement_bottlenecks_count,
  coalesce((select count(*) from execution.alerts a where a.category = 'payroll' and a.state in ('Open','Acknowledged')), 0) as payroll_risk_count,
  coalesce((select count(*) from execution.alerts a where a.category = 'inventory' and a.state in ('Open','Acknowledged')), 0) as inventory_shortage_count,
  coalesce((select count(*) from execution.alerts a where a.state in ('Open','Acknowledged','Reopened')), 0) as open_alerts_count;

-- ═══════════════════════════════════════════════════════════
-- OPERATIONS SUMMARY VIEW
-- ═══════════════════════════════════════════════════════════
create or replace view analytics.v_operations_summary as
select
  current_date as snapshot_date,
  coalesce((select count(*) from execution.work_orders w where w.state not in ('Completed','SignedOff','Cancelled')), 0) as active_work_orders,
  coalesce((select count(*) from execution.work_orders w where w.required_end_date < current_date and w.state not in ('Completed','SignedOff','Cancelled')), 0) as delayed_work_orders,
  coalesce((select avg(p.progress_percent) from execution.projects p where p.state not in ('Closed','Cancelled')), 0) as avg_project_progress,
  coalesce((select count(*) from execution.tasks t where t.state not in ('Completed','Cancelled')), 0) as open_tasks,
  coalesce((select count(*) from execution.alerts a where a.category = 'inventory' and a.state in ('Open','Acknowledged')), 0) as material_shortages,
  coalesce((select count(*) from execution.logistics_orders l where l.state not in ('Completed','Cancelled')), 0) as active_logistics_orders;

-- ═══════════════════════════════════════════════════════════
-- FINANCE SUMMARY VIEW
-- ═══════════════════════════════════════════════════════════
create or replace view analytics.v_finance_summary as
select
  current_date as snapshot_date,
  coalesce((select sum(balance_due) from finance.invoices where state in ('Issued','PartiallyPaid')), 0) as total_ar,
  coalesce((select sum(balance_due) from finance.invoices where state = 'Overdue'), 0) as overdue_ar,
  coalesce((select count(*) from finance.invoices where state = 'Overdue'), 0) as overdue_invoice_count,
  coalesce((select count(*) from finance.payments where bank_match_status != 'matched'), 0) as unreconciled_payments,
  coalesce((select sum(amount) from finance.payments where state = 'Registered'), 0) as pending_reconciliation_amount;

-- ═══════════════════════════════════════════════════════════
-- WORKFORCE SUMMARY VIEW
-- ═══════════════════════════════════════════════════════════
create or replace view analytics.v_workforce_summary as
select
  current_date as snapshot_date,
  coalesce((select count(*) from workforce.employees where status = 'Active'), 0) as active_employees,
  coalesce((select count(*) from workforce.payroll_runs where state in ('Draft','Calculated')), 0) as pending_payroll_runs,
  coalesce((select count(*) from workforce.employee_expenses where state = 'Submitted'), 0) as pending_expense_claims;

-- ═══════════════════════════════════════════════════════════
-- EXECUTIVE CONTROL TOWER RPC
-- ═══════════════════════════════════════════════════════════
create or replace function analytics.get_executive_control_tower()
returns jsonb language plpgsql security definer
set search_path = analytics, governance, finance, execution, intelligence, public as $$
declare v_payload jsonb;
begin
  if not (governance.current_user_is_executive() or governance.current_user_is_admin()) then
    raise exception 'PERMISSION_DENIED: executive or admin role required';
  end if;

  select jsonb_build_object(
    'summary', (select to_jsonb(v) from analytics.v_executive_summary v),
    'open_alerts', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select a.id, a.alert_number, a.category, a.severity, a.title, a.state,
               a.parent_entity_type, a.parent_entity_id
        from execution.alerts a where a.state in ('Open','Acknowledged','Reopened')
        order by a.created_at desc limit 20
      ) x
    ),
    'recommendations', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select r.id, r.recommendation_number, r.parent_entity_type, r.parent_entity_id,
               r.recommendation_text, r.priority, r.confidence_score
        from intelligence.decision_recommendations r where r.state = 'New'
        order by r.generated_at desc limit 20
      ) x
    )
  ) into v_payload;

  return v_payload;
end; $$;

-- ═══════════════════════════════════════════════════════════
-- CUSTOMER 360 RPC
-- ═══════════════════════════════════════════════════════════
create or replace function commercial.get_customer_360(p_customer_id bigint)
returns jsonb language plpgsql security definer
set search_path = commercial, finance, execution, docs, intelligence, governance, public as $$
declare v_payload jsonb;
begin
  if not governance.can_read_customer(p_customer_id) then
    raise exception 'PERMISSION_DENIED: cannot read customer';
  end if;

  select jsonb_build_object(
    'customer', (select to_jsonb(c) from commercial.customers c where c.id = p_customer_id),
    'quotes', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select q.id, q.quote_number, q.quote_date, q.valid_until, q.grand_total, q.state
        from commercial.quotes q where q.customer_id = p_customer_id
        order by q.created_at desc limit 20
      ) x
    ),
    'projects', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select p.id, p.project_number, p.project_name, p.state, p.progress_percent, p.budget_amount, p.actual_cost
        from execution.projects p where p.customer_id = p_customer_id
        order by p.created_at desc limit 20
      ) x
    ),
    'invoices', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select i.id, i.invoice_number, i.issue_date, i.due_date, i.grand_total, i.balance_due, i.state
        from finance.invoices i where i.customer_id = p_customer_id
        order by i.created_at desc limit 20
      ) x
    ),
    'documents', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select d.id, d.document_number, d.filename, d.document_type, d.classification_status
        from docs.documents d where d.parent_entity_type = 'Customer' and d.parent_entity_id = p_customer_id
        order by d.created_at desc limit 20
      ) x
    ),
    'insights', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select ai.id, ai.insight_number, ai.category, ai.confidence_score, ai.recommendation_text, ai.state
        from intelligence.ai_insights ai
        where ai.parent_entity_type = 'Customer' and ai.parent_entity_id = p_customer_id
        order by ai.generated_at desc limit 20
      ) x
    )
  ) into v_payload;

  return v_payload;
end; $$;

-- ═══════════════════════════════════════════════════════════
-- PROJECT 360 RPC
-- ═══════════════════════════════════════════════════════════
create or replace function execution.get_project_360(p_project_id bigint)
returns jsonb language plpgsql security definer
set search_path = execution, procurement, finance, workforce, docs, intelligence, governance, public as $$
declare v_payload jsonb;
begin
  if not governance.can_read_project(p_project_id) then
    raise exception 'PERMISSION_DENIED: cannot read project';
  end if;

  select jsonb_build_object(
    'project', (select to_jsonb(p) from execution.projects p where p.id = p_project_id),
    'work_orders', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select w.id, w.work_order_number, w.title, w.state, w.progress_percent
        from execution.work_orders w where w.project_id = p_project_id
        order by w.created_at desc limit 50
      ) x
    ),
    'purchase_orders', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select po.id, po.po_number, po.supplier_id, po.grand_total, po.state
        from procurement.purchase_orders po where po.project_id = p_project_id
        order by po.created_at desc limit 20
      ) x
    ),
    'invoices', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select i.id, i.invoice_number, i.grand_total, i.balance_due, i.state
        from finance.invoices i where i.project_id = p_project_id
        order by i.created_at desc limit 20
      ) x
    ),
    'team', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select wa.id, wa.employee_id, e.full_name, wa.assignment_role, wa.state
        from workforce.workforce_assignments wa
        join workforce.employees e on e.id = wa.employee_id
        where wa.project_id = p_project_id and wa.state = 'Active'
      ) x
    ),
    'alerts', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select a.id, a.alert_number, a.category, a.severity, a.title, a.state
        from execution.alerts a
        where a.parent_entity_type = 'Project' and a.parent_entity_id = p_project_id
          and a.state in ('Open','Acknowledged')
        order by a.created_at desc limit 10
      ) x
    )
  ) into v_payload;

  return v_payload;
end; $$;

-- ═══════════════════════════════════════════════════════════
-- EMPLOYEE 360 RPC
-- ═══════════════════════════════════════════════════════════
create or replace function workforce.get_employee_360(p_employee_id bigint)
returns jsonb language plpgsql security definer
set search_path = workforce, governance, public as $$
declare v_payload jsonb;
begin
  if not governance.can_read_employee(p_employee_id) then
    raise exception 'PERMISSION_DENIED: cannot read employee';
  end if;

  select jsonb_build_object(
    'employee', (select to_jsonb(e) from workforce.employees e where e.id = p_employee_id),
    'recent_attendance', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select a.id, a.work_date, a.regular_hours, a.overtime_hours, a.state
        from workforce.attendance a where a.employee_id = p_employee_id
        order by a.work_date desc limit 30
      ) x
    ),
    'assignments', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select wa.id, wa.project_id, wa.work_order_id, wa.assignment_role, wa.state
        from workforce.workforce_assignments wa where wa.employee_id = p_employee_id and wa.state = 'Active'
      ) x
    ),
    'expenses', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select ex.id, ex.amount, ex.expense_date, ex.category, ex.state
        from workforce.employee_expenses ex where ex.employee_id = p_employee_id
        order by ex.expense_date desc limit 20
      ) x
    )
  ) into v_payload;

  return v_payload;
end; $$;

-- ═══════════════════════════════════════════════════════════
-- APPROVE QUOTE RPC (full governance pattern)
-- ═══════════════════════════════════════════════════════════
create or replace function commercial.approve_quote(p_quote_id bigint)
returns jsonb language plpgsql security definer
set search_path = commercial, governance, public as $$
declare
  v_quote record;
  v_user_id bigint;
begin
  v_user_id := governance.current_user_profile_id();

  if not governance.current_user_has_permission('quotes.approve') then
    raise exception 'PERMISSION_DENIED: quotes.approve required';
  end if;

  select * into v_quote from commercial.quotes where id = p_quote_id for update;
  if not found then raise exception 'QUOTE_NOT_FOUND'; end if;
  if v_quote.state not in ('Sent','UnderReview') then raise exception 'INVALID_TRANSITION'; end if;

  update commercial.quotes set
    state = 'Approved', approval_status = 'Approved',
    approved_by = v_user_id, approved_at = now(), updated_at = now()
  where id = p_quote_id;

  perform governance.write_state_history_rpc('Quote', p_quote_id, v_quote.state, 'Approved', 'manual approval', null);
  perform governance.write_audit_log_rpc('Quote', p_quote_id, 'quote.approve',
    to_jsonb(v_quote), jsonb_build_object('state','Approved'), 'COMMERCIAL', 'quotes', null, null);
  perform governance.write_domain_event_rpc('quote.approved', 'commercial.quotes', 'COMMERCIAL', 'quotes',
    'Quote', p_quote_id, 'Quote:' || p_quote_id, null, null, 'user', v_user_id,
    jsonb_build_object('quote_id', p_quote_id, 'customer_id', v_quote.customer_id, 'grand_total', v_quote.grand_total), null);

  return jsonb_build_object('success', true, 'quote_id', p_quote_id, 'state', 'Approved');
end; $$;
