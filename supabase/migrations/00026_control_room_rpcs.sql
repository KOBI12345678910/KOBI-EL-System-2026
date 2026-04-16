-- 00026_control_room_rpcs.sql
-- RPCs for Notification Center, Universal Inbox, Finance Control Room, Formula Builder

create or replace function analytics.get_notification_center_fast()
returns jsonb
language plpgsql
security definer
set search_path = analytics, orchestration, governance, public
as $$
declare
  v_payload jsonb;
begin
  if not governance.current_user_is_admin()
     and not governance.current_user_is_executive() then
    raise exception 'PERMISSION_DENIED';
  end if;

  select jsonb_build_object(
    'summary', jsonb_build_object(
      'open_count', coalesce((select count(*) from orchestration.notifications where state in ('open','acknowledged')), 0),
      'critical_count', coalesce((select count(*) from orchestration.notifications where severity = 'critical' and state in ('open','acknowledged')), 0),
      'high_count', coalesce((select count(*) from orchestration.notifications where severity = 'high' and state in ('open','acknowledged')), 0),
      'resolved_count', coalesce((select count(*) from orchestration.notifications where state in ('resolved','closed')), 0)
    ),
    'notifications', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select
          id,
          notification_number,
          recipient_type,
          recipient_id,
          title,
          message_text,
          severity,
          channel,
          state,
          created_at,
          updated_at
        from orchestration.notifications
        order by created_at desc
        limit 200
      ) x
    )
  ) into v_payload;

  return v_payload;
end;
$$;

create or replace function analytics.get_universal_inbox_fast()
returns jsonb
language plpgsql
security definer
set search_path = analytics, orchestration, governance, public
as $$
declare
  v_payload jsonb;
begin
  if not governance.current_user_is_admin()
     and not governance.current_user_is_executive() then
    raise exception 'PERMISSION_DENIED';
  end if;

  select jsonb_build_object(
    'summary', jsonb_build_object(
      'open_count', coalesce((select count(*) from orchestration.universal_inbox where state = 'open'), 0),
      'assigned_count', coalesce((select count(*) from orchestration.universal_inbox where state = 'assigned'), 0),
      'resolved_count', coalesce((select count(*) from orchestration.universal_inbox where state in ('resolved','closed')), 0),
      'high_priority_count', coalesce((select count(*) from orchestration.universal_inbox where priority in ('high','critical') and state in ('open','assigned')), 0)
    ),
    'inbox', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select
          ui.id,
          ui.inbox_number,
          ui.item_type,
          ui.parent_entity_type,
          ui.parent_entity_id,
          ui.title,
          ui.description,
          ui.assigned_to_user_id,
          up.full_name as assigned_to_user_name,
          ui.priority,
          ui.state,
          ui.created_at,
          ui.updated_at
        from orchestration.universal_inbox ui
        left join governance.users_profile up on up.id = ui.assigned_to_user_id
        order by ui.created_at desc
        limit 200
      ) x
    ),
    'assignable_users', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select id, full_name
        from governance.users_profile
        where active = true
        order by full_name
      ) x
    )
  ) into v_payload;

  return v_payload;
end;
$$;

create or replace function analytics.get_finance_control_room_fast()
returns jsonb
language plpgsql
security definer
set search_path = analytics, finance, procurement, governance, public
as $$
declare
  v_payload jsonb;
begin
  if not governance.current_user_has_permission('finance.read')
     and not governance.current_user_is_admin()
     and not governance.current_user_is_executive() then
    raise exception 'PERMISSION_DENIED';
  end if;

  select jsonb_build_object(
    'summary', (select to_jsonb(v) from analytics.v_finance_summary v),
    'customer_invoices', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select
          id,
          invoice_number,
          customer_id,
          issue_date,
          due_date,
          grand_total,
          balance_due,
          state
        from finance.invoices
        where state in ('Issued','PartiallyPaid','Overdue')
        order by due_date asc nulls last
        limit 100
      ) x
    ),
    'supplier_invoices', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select
          id,
          supplier_invoice_number,
          supplier_id,
          invoice_date,
          due_date,
          grand_total,
          balance_due,
          state
        from procurement.supplier_invoices
        where state in ('Issued','PartiallyPaid','Overdue')
        order by due_date asc nulls last
        limit 100
      ) x
    ),
    'payments', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select
          id,
          payment_number,
          customer_id,
          amount,
          payment_date,
          bank_match_status
        from finance.payments
        order by payment_date desc nulls last
        limit 100
      ) x
    )
  ) into v_payload;

  return v_payload;
end;
$$;

create or replace function intelligence.get_formula_builder_fast()
returns jsonb
language plpgsql
security definer
set search_path = intelligence, governance, public
as $$
declare
  v_payload jsonb;
begin
  if not governance.current_user_is_admin()
     and not governance.current_user_is_executive() then
    raise exception 'PERMISSION_DENIED';
  end if;

  select jsonb_build_object(
    'definitions', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select
          id,
          kpi_code,
          kpi_name,
          category,
          formula_type,
          source_ref,
          formula_payload,
          unit_label,
          lower_threshold,
          upper_threshold,
          active
        from intelligence.kpi_definitions
        order by kpi_code
      ) x
    )
  ) into v_payload;

  return v_payload;
end;
$$;
