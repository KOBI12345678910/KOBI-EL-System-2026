-- ============================================================
-- FILE: supabase/migrations/00012_rpc_functions_core_block.sql
-- 10 REAL SECURE RPC FUNCTIONS
-- ============================================================

-- 1) CUSTOMER 360
create or replace function commercial.get_customer_360_full(p_customer_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = commercial, finance, execution, docs, intelligence, governance, public
as $$
declare
  v_payload jsonb;
begin
  if not governance.can_read_customer(p_customer_id) then
    raise exception 'PERMISSION_DENIED';
  end if;

  select jsonb_build_object(
    'customer', (
      select to_jsonb(c)
      from commercial.customers c
      where c.id = p_customer_id
    ),
    'contacts', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select cc.*
        from commercial.customer_contacts cc
        where cc.customer_id = p_customer_id
        order by cc.is_primary desc, cc.created_at desc
      ) x
    ),
    'quotes_count', (
      select count(*)
      from commercial.quotes q
      where q.customer_id = p_customer_id
    ),
    'projects_count', (
      select count(*)
      from execution.projects p
      where p.customer_id = p_customer_id
    ),
    'open_balance', (
      select coalesce(sum(i.balance_due), 0)
      from finance.invoices i
      where i.customer_id = p_customer_id
        and i.state in ('Issued','PartiallyPaid','Overdue')
    ),
    'documents_count', (
      select count(*)
      from docs.documents d
      where d.parent_entity_type = 'Customer'
        and d.parent_entity_id = p_customer_id
    ),
    'ai_insights_count', (
      select count(*)
      from intelligence.ai_insights ai
      where ai.parent_entity_type = 'Customer'
        and ai.parent_entity_id = p_customer_id
    )
  ) into v_payload;

  return v_payload;
end;
$$;

-- 2) SUPPLIER 360
create or replace function procurement.get_supplier_360_full(p_supplier_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = procurement, docs, intelligence, governance, public
as $$
declare
  v_payload jsonb;
begin
  if not governance.can_read_supplier(p_supplier_id) then
    raise exception 'PERMISSION_DENIED';
  end if;

  select jsonb_build_object(
    'supplier', (
      select to_jsonb(s)
      from procurement.suppliers s
      where s.id = p_supplier_id
    ),
    'contacts', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select sc.*
        from procurement.supplier_contacts sc
        where sc.supplier_id = p_supplier_id
        order by sc.is_primary desc, sc.created_at desc
      ) x
    ),
    'open_rfqs', (
      select count(*)
      from procurement.rfq_supplier_invites rsi
      where rsi.supplier_id = p_supplier_id
        and rsi.response_status in ('pending','invited')
    ),
    'open_pos', (
      select count(*)
      from procurement.purchase_orders po
      where po.supplier_id = p_supplier_id
        and po.state not in ('Closed','Cancelled')
    ),
    'scorecards', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select ss.*
        from procurement.supplier_scorecards ss
        where ss.supplier_id = p_supplier_id
        order by ss.calculated_at desc
        limit 5
      ) x
    )
  ) into v_payload;

  return v_payload;
end;
$$;

-- 3) PROJECT 360
create or replace function execution.get_project_360_full(p_project_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = execution, finance, inventory, workforce, docs, intelligence, governance, public
as $$
declare
  v_payload jsonb;
begin
  if not governance.can_read_project(p_project_id) then
    raise exception 'PERMISSION_DENIED';
  end if;

  select jsonb_build_object(
    'project', (
      select to_jsonb(p)
      from execution.projects p
      where p.id = p_project_id
    ),
    'cost_plan', (
      select to_jsonb(cp)
      from execution.project_cost_plans cp
      where cp.project_id = p_project_id
    ),
    'risks', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select pr.*
        from execution.project_risks pr
        where pr.project_id = p_project_id
          and pr.state <> 'Resolved'
        order by pr.overall_score desc, pr.created_at desc
      ) x
    ),
    'blockers', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select pb.*
        from execution.project_blockers pb
        where pb.project_id = p_project_id
          and pb.state <> 'Resolved'
        order by pb.created_at desc
      ) x
    ),
    'work_orders_count', (
      select count(*)
      from execution.work_orders w
      where w.project_id = p_project_id
    ),
    'open_tasks_count', (
      select count(*)
      from execution.tasks t
      where t.linked_entity_type = 'Project'
        and t.linked_entity_id = p_project_id
        and t.state not in ('Completed','Cancelled')
    ),
    'invoice_balance', (
      select coalesce(sum(i.balance_due), 0)
      from finance.invoices i
      where i.project_id = p_project_id
    )
  ) into v_payload;

  return v_payload;
end;
$$;

-- 4) WORK ORDER 360
create or replace function execution.get_work_order_360_full(p_work_order_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = execution, inventory, workforce, docs, intelligence, governance, public
as $$
declare
  v_payload jsonb;
begin
  if not governance.can_read_work_order(p_work_order_id) then
    raise exception 'PERMISSION_DENIED';
  end if;

  select jsonb_build_object(
    'work_order', (
      select to_jsonb(w)
      from execution.work_orders w
      where w.id = p_work_order_id
    ),
    'qa_checklists', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select q.*
        from execution.work_order_qa_checklists q
        where q.work_order_id = p_work_order_id
        order by q.created_at desc
      ) x
    ),
    'reservations_count', (
      select count(*)
      from inventory.inventory_reservations ir
      where ir.work_order_id = p_work_order_id
        and ir.state = 'Reserved'
    ),
    'assignments_count', (
      select count(*)
      from workforce.workforce_assignments wa
      where wa.work_order_id = p_work_order_id
        and wa.state = 'Active'
    ),
    'alerts_count', (
      select count(*)
      from execution.alerts a
      where a.parent_entity_type = 'WorkOrder'
        and a.parent_entity_id = p_work_order_id
        and a.state in ('Open','Acknowledged','Reopened')
    )
  ) into v_payload;

  return v_payload;
end;
$$;

-- 5) FINANCE CONTROL ROOM
create or replace function analytics.get_finance_control_room_full()
returns jsonb
language plpgsql
security definer
set search_path = analytics, finance, governance, public
as $$
declare
  v_payload jsonb;
begin
  if not (
    governance.current_user_has_any_role(array['finance','finance_manager'])
    or governance.current_user_is_admin()
    or governance.current_user_is_executive()
  ) then
    raise exception 'PERMISSION_DENIED';
  end if;

  select jsonb_build_object(
    'summary', (
      select to_jsonb(v)
      from analytics.v_finance_summary v
    ),
    'overdue_invoices', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select i.id, i.invoice_number, i.customer_id, i.due_date, i.balance_due, i.state
        from finance.invoices i
        where i.state = 'Overdue'
        order by i.due_date asc
        limit 25
      ) x
    ),
    'unreconciled_payments', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select p.id, p.payment_number, p.invoice_id, p.amount, p.payment_date, p.bank_match_status
        from finance.payments p
        where coalesce(p.bank_match_status, '') <> 'matched'
        order by p.payment_date desc
        limit 25
      ) x
    )
  ) into v_payload;

  return v_payload;
end;
$$;

-- 6) WORKFORCE CONTROL ROOM
create or replace function analytics.get_workforce_control_room_full()
returns jsonb
language plpgsql
security definer
set search_path = analytics, workforce, governance, public
as $$
declare
  v_payload jsonb;
begin
  if not (
    governance.current_user_has_any_role(array['hr','hr_manager','payroll','payroll_manager'])
    or governance.current_user_is_admin()
    or governance.current_user_is_executive()
  ) then
    raise exception 'PERMISSION_DENIED';
  end if;

  select jsonb_build_object(
    'summary', (
      select to_jsonb(v)
      from analytics.v_workforce_summary v
    ),
    'missing_attendance', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select e.id as employee_id, e.employee_number, e.full_name
        from workforce.employees e
        where e.status = 'Active'
          and not exists (
            select 1
            from workforce.attendance a
            where a.employee_id = e.id
              and a.work_date = current_date
          )
        order by e.full_name
        limit 25
      ) x
    )
  ) into v_payload;

  return v_payload;
end;
$$;

-- 7) CREATE TASK COMMENT
create or replace function execution.create_task_comment_rpc(
  p_task_id bigint,
  p_comment_body text,
  p_comment_type text default 'note'
)
returns jsonb
language plpgsql
security definer
set search_path = execution, governance, public
as $$
declare
  v_user_id bigint;
  v_result jsonb;
begin
  v_user_id := governance.current_user_profile_id();

  if not (
    governance.current_user_has_permission('workorders.update')
    or governance.current_user_has_permission('projects.update')
    or governance.current_user_is_admin()
  ) then
    raise exception 'PERMISSION_DENIED';
  end if;

  insert into execution.task_comments (
    task_id,
    comment_body,
    comment_type,
    author_user_id
  )
  values (
    p_task_id,
    p_comment_body,
    coalesce(p_comment_type, 'note'),
    v_user_id
  );

  perform governance.write_audit_log_rpc(
    'Task',
    p_task_id,
    'task.add_comment',
    null,
    jsonb_build_object('comment_body', p_comment_body, 'comment_type', p_comment_type),
    'TECHNO_KOL_OPS',
    'tasks',
    'Task360',
    null
  );

  select jsonb_build_object(
    'success', true,
    'task_id', p_task_id
  ) into v_result;

  return v_result;
end;
$$;

-- 8) ACKNOWLEDGE ALERT
create or replace function execution.acknowledge_alert_rpc(p_alert_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = execution, governance, public
as $$
declare
  v_alert execution.alerts%rowtype;
  v_user_id bigint;
begin
  v_user_id := governance.current_user_profile_id();

  if not (
    governance.current_user_has_permission('workorders.update')
    or governance.current_user_has_permission('projects.update')
    or governance.current_user_is_admin()
  ) then
    raise exception 'PERMISSION_DENIED';
  end if;

  select * into v_alert
  from execution.alerts
  where id = p_alert_id
  for update;

  if not found then
    raise exception 'ALERT_NOT_FOUND';
  end if;

  update execution.alerts
  set state = 'Acknowledged',
      acknowledged_at = now(),
      updated_at = now()
  where id = p_alert_id;

  perform governance.write_state_history_rpc(
    'Alert',
    p_alert_id,
    v_alert.state,
    'Acknowledged',
    'manual acknowledgement',
    null
  );

  return jsonb_build_object(
    'success', true,
    'alert_id', p_alert_id,
    'state', 'Acknowledged'
  );
end;
$$;

-- 9) REFRESH EXECUTIVE SUMMARY SNAPSHOT
create or replace function analytics.refresh_executive_summary_snapshot()
returns void
language plpgsql
security definer
set search_path = analytics, finance, execution, public
as $$
begin
  delete from analytics.rm_executive_summary
  where snapshot_date = current_date;

  insert into analytics.rm_executive_summary (
    snapshot_date,
    total_revenue,
    open_projects_count,
    overdue_collections_amount,
    procurement_bottlenecks_count,
    payroll_risk_count,
    inventory_shortage_count,
    open_alerts_count
  )
  select
    current_date,
    coalesce((select sum(i.grand_total) from finance.invoices i where i.state in ('Issued','PartiallyPaid','Paid')), 0),
    coalesce((select count(*) from execution.projects p where p.state not in ('Closed','Cancelled')), 0),
    coalesce((select sum(i.balance_due) from finance.invoices i where i.state = 'Overdue'), 0),
    0,
    coalesce((select count(*) from execution.alerts a where a.category = 'payroll' and a.state in ('Open','Acknowledged')), 0),
    coalesce((select count(*) from execution.alerts a where a.category = 'inventory' and a.state in ('Open','Acknowledged')), 0),
    coalesce((select count(*) from execution.alerts a where a.state in ('Open','Acknowledged','Reopened')), 0);
end;
$$;

-- 10) CREATE READ MODEL INVALIDATION
create or replace function analytics.invalidate_read_model_rpc(
  p_read_model_code text,
  p_entity_type text,
  p_entity_id bigint,
  p_reason text
)
returns bigint
language plpgsql
security definer
set search_path = analytics, public
as $$
declare
  v_id bigint;
begin
  insert into analytics.read_model_invalidations (
    read_model_code,
    entity_type,
    entity_id,
    reason
  )
  values (
    p_read_model_code,
    p_entity_type,
    p_entity_id,
    p_reason
  )
  returning id into v_id;

  return v_id;
end;
$$;
