-- ============================================================
-- FILE: supabase/migrations/00022_dashboard_rpcs.sql
-- Dashboard RPC: board loader + widget data dispatcher
-- ============================================================

create or replace function analytics.get_dashboard_board(p_board_code text)
returns jsonb
language plpgsql
security definer
set search_path = analytics, governance, public
as $$
declare
  v_user_id bigint;
  v_payload jsonb;
begin
  v_user_id := governance.current_user_profile_id();

  select jsonb_build_object(
    'board_code', b.board_code,
    'board_name', b.board_name,
    'widgets', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.order_index), '[]'::jsonb)
      from (
        select
          bw.id,
          w.widget_code,
          bw.title,
          bw.width_units,
          bw.height_units,
          bw.order_index,
          coalesce(bw.config_payload, w.default_config) as config_payload
        from analytics.dashboard_board_widgets bw
        join analytics.dashboard_widgets w on w.id = bw.widget_id
        where bw.board_id = b.id
          and bw.active = true
          and w.active = true
      ) x
    )
  )
  into v_payload
  from analytics.dashboard_boards b
  where b.board_code = p_board_code
    and b.active = true;

  return v_payload;
end;
$$;

create or replace function analytics.get_dashboard_widget_data(p_widget_code text, p_config jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = analytics, public
as $$
declare
  v_payload jsonb;
begin
  if p_widget_code = 'executive_total_revenue' then
    select jsonb_build_object(
      'value', coalesce((select total_revenue from analytics.v_executive_summary), 0),
      'subtitle', 'From executive summary'
    ) into v_payload;

  elsif p_widget_code = 'finance_overdue_amount' then
    select jsonb_build_object(
      'value', coalesce((select overdue_amount from analytics.v_finance_summary), 0),
      'subtitle', 'Customer overdue amount'
    ) into v_payload;

  elsif p_widget_code = 'procurement_pending_approvals' then
    select jsonb_build_object(
      'value', coalesce((select pending_approvals from analytics.v_procurement_summary), 0),
      'subtitle', 'Pending procurement approvals'
    ) into v_payload;

  elsif p_widget_code = 'operations_delayed_work_orders' then
    select jsonb_build_object(
      'value', coalesce((select delayed_work_orders from analytics.v_operations_summary), 0),
      'subtitle', 'Delayed execution items'
    ) into v_payload;

  elsif p_widget_code = 'workforce_missing_attendance' then
    select jsonb_build_object(
      'value', coalesce((select missing_attendance from analytics.v_workforce_summary), 0),
      'subtitle', 'Employees missing attendance today'
    ) into v_payload;

  elsif p_widget_code = 'ai_unhealthy_agents' then
    select jsonb_build_object(
      'value', coalesce((select unhealthy_agents from analytics.v_ai_summary), 0),
      'subtitle', 'AI agents requiring attention'
    ) into v_payload;

  elsif p_widget_code = 'recommendation_queue' then
    select jsonb_build_object(
      'items',
      coalesce((
        select jsonb_agg(to_jsonb(x))
        from (
          select
            recommendation_number as title,
            recommendation_text as subtitle
          from analytics.v_ai_recommendation_queue
          order by created_at desc
          limit 10
        ) x
      ), '[]'::jsonb)
    ) into v_payload;

  elsif p_widget_code = 'operational_alerts_feed' then
    select jsonb_build_object(
      'items',
      coalesce((
        select jsonb_agg(to_jsonb(x))
        from (
          select
            alert_number as title,
            title || ' • ' || coalesce(severity,'') as subtitle
          from execution.alerts
          where state in ('Open','Acknowledged','Reopened')
          order by created_at desc
          limit 10
        ) x
      ), '[]'::jsonb)
    ) into v_payload;

  elsif p_widget_code = 'procurement_overdue_pos_feed' then
    select jsonb_build_object(
      'items',
      coalesce((
        select jsonb_agg(to_jsonb(x))
        from (
          select
            po_number as title,
            'Supplier #' || supplier_id || ' • Due ' || coalesce(expected_delivery_date::text,'—') as subtitle
          from analytics.rm_procurement_overdue_pos
          order by expected_delivery_date asc nulls last
          limit 10
        ) x
      ), '[]'::jsonb)
    ) into v_payload;

  else
    select jsonb_build_object(
      'value', null,
      'subtitle', 'Unknown widget code'
    ) into v_payload;
  end if;

  return v_payload;
end;
$$;
