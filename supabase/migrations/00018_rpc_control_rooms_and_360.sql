-- ============================================================
-- FILE: supabase/migrations/00018_rpc_control_rooms_and_360.sql
-- Fast RPC endpoints for Control Rooms and 360 pages
-- ============================================================

-- ── OPERATIONS CONTROL ROOM ──

create or replace function analytics.get_operations_control_room_fast()
returns jsonb
language plpgsql
security definer
set search_path = analytics, public
as $$
declare
  v_payload jsonb;
begin
  select jsonb_build_object(
    'summary', (select to_jsonb(v) from analytics.v_operations_summary v),
    'active_work_orders', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select * from analytics.rm_operations_work_orders
        where delayed = false
        order by required_end_date nulls last, updated_at desc limit 50
      ) x
    ),
    'delayed_work_orders', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select * from analytics.rm_operations_work_orders
        where delayed = true
        order by required_end_date asc nulls last, updated_at desc limit 50
      ) x
    ),
    'open_tasks', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select * from analytics.rm_operations_tasks
        order by due_date asc nulls last, updated_at desc limit 50
      ) x
    ),
    'shortages', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select * from analytics.rm_operations_shortages
        order by snapshot_at desc limit 50
      ) x
    ),
    'logistics_orders', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select * from analytics.rm_operations_logistics
        order by scheduled_date asc nulls last, updated_at desc limit 50
      ) x
    ),
    'alerts', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select a.id, a.alert_number, a.category, a.severity, a.title,
               a.parent_entity_type, a.parent_entity_id, a.state
        from execution.alerts a
        where a.state in ('Open','Acknowledged','Reopened')
        order by a.created_at desc limit 50
      ) x
    ),
    'project_rows', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select p.project_id, p.project_number, p.project_name, p.state,
               p.progress_percent, p.blockers_count, p.risks_count
        from analytics.rm_project_360 p
        order by p.blockers_count desc, p.risks_count desc, p.updated_at desc limit 50
      ) x
    )
  ) into v_payload;
  return v_payload;
end;
$$;

-- ── PROCUREMENT CONTROL ROOM ──

create or replace function analytics.get_procurement_control_room_fast()
returns jsonb
language plpgsql
security definer
set search_path = analytics, public
as $$
declare
  v_payload jsonb;
begin
  select jsonb_build_object(
    'summary', (select to_jsonb(v) from analytics.v_procurement_summary v),
    'rfqs', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select * from analytics.rm_procurement_rfqs
        order by response_deadline asc nulls last, updated_at desc limit 50
      ) x
    ),
    'approvals', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select * from analytics.rm_procurement_approvals
        order by requested_at asc nulls last limit 50
      ) x
    ),
    'overdue_pos', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select * from analytics.rm_procurement_overdue_pos
        order by expected_delivery_date asc nulls last limit 50
      ) x
    ),
    'supplier_risks', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select * from analytics.rm_procurement_supplier_risks
        order by risk_level desc nulls last, overall_score asc nulls last limit 50
      ) x
    ),
    'receiving_today', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select po.id as po_id, po.po_number, po.supplier_id,
               po.expected_delivery_date, po.receiving_status, po.state
        from procurement.purchase_orders po
        where po.expected_delivery_date = current_date
        order by po.po_number limit 50
      ) x
    )
  ) into v_payload;
  return v_payload;
end;
$$;

-- ── WORKFORCE CONTROL ROOM ──

create or replace function analytics.get_workforce_control_room_fast()
returns jsonb
language plpgsql
security definer
set search_path = analytics, public
as $$
declare
  v_payload jsonb;
begin
  select jsonb_build_object(
    'summary', (select to_jsonb(v) from analytics.v_workforce_summary v),
    'missing_attendance', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select * from analytics.rm_workforce_missing_attendance
        order by employee_number limit 100
      ) x
    ),
    'payroll_runs', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select * from analytics.rm_workforce_payroll_queue
        order by payroll_period_end desc limit 50
      ) x
    ),
    'overtime_alerts', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select * from analytics.rm_workforce_overtime_alerts
        order by overtime_hours desc limit 50
      ) x
    ),
    'expenses', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select * from analytics.rm_workforce_expenses
        order by expense_date desc limit 50
      ) x
    ),
    'leave_requests', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select * from analytics.rm_workforce_leave_requests
        order by start_date asc limit 50
      ) x
    )
  ) into v_payload;
  return v_payload;
end;
$$;

-- ── CUSTOMER 360 ──

create or replace function analytics.get_customer_360_fast(p_customer_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = analytics, commercial, execution, finance, docs, intelligence, governance, public
as $$
declare
  v_payload jsonb;
begin
  select jsonb_build_object(
    'customer', (select to_jsonb(v) from analytics.rm_customer_360 v where v.customer_id = p_customer_id),
    'contacts', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select * from commercial.customer_contacts
        where customer_id = p_customer_id
        order by is_primary desc, created_at desc
      ) x
    ),
    'quotes', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select id, quote_number, quote_date, valid_until, grand_total, state, approval_status
        from commercial.quotes where customer_id = p_customer_id
        order by created_at desc limit 50
      ) x
    ),
    'projects', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select project_id as id, project_number, project_name, state, progress_percent, budget_amount, actual_cost
        from analytics.rm_project_360 where customer_id = p_customer_id
        order by updated_at desc limit 50
      ) x
    ),
    'invoices', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select id, invoice_number, issue_date, due_date, grand_total, balance_due, state
        from finance.invoices where customer_id = p_customer_id
        order by created_at desc limit 50
      ) x
    ),
    'documents', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select id, document_number, filename, document_type, classification_status, ocr_status
        from docs.documents
        where parent_entity_type = 'Customer' and parent_entity_id = p_customer_id
        order by created_at desc limit 50
      ) x
    ),
    'insights', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select id, insight_number, category, confidence_score, recommendation_text, state
        from intelligence.ai_insights
        where parent_entity_type = 'Customer' and parent_entity_id = p_customer_id
        order by created_at desc limit 50
      ) x
    ),
    'audit', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select al.id, al.action_name, al.performed_at, al.source_module,
               up.full_name as performed_by_user_name
        from governance.audit_logs al
        left join governance.users_profile up on up.id = al.performed_by_user_id
        where al.entity_type = 'Customer' and al.entity_id = p_customer_id
        order by al.performed_at desc limit 50
      ) x
    )
  ) into v_payload;
  return v_payload;
end;
$$;
