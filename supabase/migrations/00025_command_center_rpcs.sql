-- ============================================================
-- FILE: supabase/migrations/00025_command_center_rpcs.sql
-- Command Center view + RPCs + WorkflowRun360 RPC
-- ============================================================

-- ── Command Center Summary View ──

create or replace view analytics.v_command_center_summary as
select
  current_date as snapshot_date,
  coalesce((select count(*) from orchestration.workflow_runs where state in ('queued','running','pending')), 0) as active_workflows,
  coalesce((select count(*) from orchestration.workflow_runs where state = 'failed'), 0) as failed_workflows,
  coalesce((select count(*) from orchestration.job_queue where state = 'queued'), 0) as queued_jobs,
  coalesce((select count(*) from orchestration.job_queue where state in ('running') and started_at < now() - interval '30 minute'), 0) as stuck_jobs,
  coalesce((select count(*) from orchestration.notifications where state = 'open'), 0) as open_notifications,
  coalesce((select count(*) from orchestration.universal_inbox where state in ('open','assigned')), 0) as inbox_items;

-- ── Command Center RPC ──

create or replace function analytics.get_command_center_fast()
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
    'summary', (select to_jsonb(v) from analytics.v_command_center_summary v),
    'workflows', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select wr.id, wr.workflow_code, wr.workflow_name,
               wr.parent_entity_type, wr.parent_entity_id,
               wr.started_at, wr.finished_at, wr.state
        from orchestration.workflow_runs wr
        order by wr.created_at desc limit 50
      ) x
    ),
    'jobs', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select jq.id, jq.queue_name, jq.job_type,
               jq.parent_entity_type, jq.parent_entity_id,
               jq.attempts_count, jq.available_at, jq.started_at, jq.state
        from orchestration.job_queue jq
        order by jq.created_at desc limit 50
      ) x
    ),
    'notifications', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select n.id, n.notification_number, n.recipient_type, n.recipient_id,
               n.title, n.message_text, n.severity, n.state, n.created_at
        from orchestration.notifications n
        order by n.created_at desc limit 50
      ) x
    ),
    'inbox', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select ui.id, ui.inbox_number, ui.item_type,
               ui.parent_entity_type, ui.parent_entity_id,
               ui.title, up.full_name as assigned_to_user_name,
               ui.priority, ui.state, ui.created_at
        from orchestration.universal_inbox ui
        left join governance.users_profile up on up.id = ui.assigned_to_user_id
        order by ui.created_at desc limit 50
      ) x
    )
  ) into v_payload;

  return v_payload;
end;
$$;

-- ── Workflow Run 360 RPC ──

create or replace function orchestration.get_workflow_run_360(p_run_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = orchestration, governance, public
as $$
declare
  v_payload jsonb;
begin
  if not governance.current_user_is_admin()
     and not governance.current_user_is_executive() then
    raise exception 'PERMISSION_DENIED';
  end if;

  select jsonb_build_object(
    'run', (
      select to_jsonb(x)
      from (
        select wr.id, wr.workflow_code, wr.workflow_name,
               wr.parent_entity_type, wr.parent_entity_id,
               wr.correlation_id, wr.state, wr.started_at, wr.finished_at,
               up.full_name as triggered_by_user_name
        from orchestration.workflow_runs wr
        left join governance.users_profile up on up.id = wr.triggered_by_user_id
        where wr.id = p_run_id
      ) x
    ),
    'steps', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.sequence_order), '[]'::jsonb)
      from (
        select wsr.id, wsr.step_code, wsr.step_name, wsr.step_type,
               wsr.sequence_order, wsr.state, wsr.started_at,
               wsr.finished_at, wsr.error_message
        from orchestration.workflow_step_runs wsr
        where wsr.workflow_run_id = p_run_id
      ) x
    )
  ) into v_payload;

  return v_payload;
end;
$$;
