-- ============================================================
-- FILE: supabase/migrations/00023_ai_agent_registry_and_views.sql
-- AI Agent registry, jobs, views, and AI control room RPC
-- ============================================================

-- ── Agent Registry ──

create table if not exists intelligence.agent_registry (
  id bigserial primary key,
  agent_code text not null unique,
  agent_name text not null,
  status text not null default 'healthy',
  last_heartbeat_at timestamptz,
  config_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists intelligence.agent_jobs (
  id bigserial primary key,
  agent_id bigint not null references intelligence.agent_registry(id) on delete cascade,
  job_type text not null,
  state text not null default 'queued',
  payload jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_agent_registry_updated_at
before update on intelligence.agent_registry
for each row execute function governance.set_updated_at();

create trigger trg_agent_jobs_updated_at
before update on intelligence.agent_jobs
for each row execute function governance.set_updated_at();

-- ── AI Summary View ──

create or replace view analytics.v_ai_summary as
select
  current_date as snapshot_date,
  coalesce((select count(*) from intelligence.model_registry where status = 'active'), 0) as active_models,
  coalesce((select count(*) from intelligence.model_executions where started_at::date = current_date), 0) as executions_today,
  coalesce((select count(*) from intelligence.model_executions where success = false and started_at::date = current_date), 0) as failed_executions,
  coalesce((select count(*) from intelligence.decision_recommendations where state in ('pending','queued','open')), 0) as pending_recommendations,
  coalesce((select count(*) from intelligence.recommendation_feedback where provided_at::date >= current_date - 30), 0) as feedback_items,
  coalesce((select count(*) from intelligence.agent_registry where status not in ('healthy','active')), 0) as unhealthy_agents;

-- ── Recommendation Queue View ──

create or replace view analytics.v_ai_recommendation_queue as
select
  dr.id,
  dr.recommendation_number,
  dr.parent_entity_type,
  dr.parent_entity_id,
  dr.recommendation_text,
  dr.priority,
  dr.confidence_score,
  dr.state,
  dr.created_at
from intelligence.decision_recommendations dr
where dr.state in ('pending','queued','open');

-- ── Agent Health View ──

create or replace view analytics.v_ai_agent_health as
select
  ar.agent_code,
  ar.agent_name,
  ar.status,
  ar.last_heartbeat_at,
  coalesce((
    select count(*) from intelligence.agent_jobs aj
    where aj.agent_id = ar.id
      and aj.state in ('queued','pending')
  ), 0) as pending_jobs,
  coalesce((
    select count(*) from intelligence.agent_jobs aj
    where aj.agent_id = ar.id
      and aj.state = 'failed'
      and aj.created_at >= now() - interval '24 hour'
  ), 0) as failed_jobs_24h
from intelligence.agent_registry ar;

-- ── AI Control Room RPC ──

create or replace function analytics.get_ai_control_room_fast()
returns jsonb
language plpgsql
security definer
set search_path = analytics, intelligence, governance, public
as $$
declare
  v_payload jsonb;
begin
  if not governance.current_user_has_any_permission(array[
    'control_room.executive',
    'control_room.operations',
    'control_room.procurement',
    'control_room.workforce'
  ]) then
    raise exception 'PERMISSION_DENIED';
  end if;

  select jsonb_build_object(
    'summary', (select to_jsonb(v) from analytics.v_ai_summary v),
    'models', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select id, model_code, model_name, model_type, version, status, deployed_at
        from intelligence.model_registry
        order by deployed_at desc nulls last, created_at desc
        limit 50
      ) x
    ),
    'executions', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select
          id, model_registry_id, execution_type,
          parent_entity_type, parent_entity_id,
          success, started_at, finished_at, error_message
        from intelligence.model_executions
        order by started_at desc
        limit 50
      ) x
    ),
    'recommendations', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select
          id, recommendation_number, parent_entity_type, parent_entity_id,
          recommendation_text, priority, confidence_score, state
        from analytics.v_ai_recommendation_queue
        order by created_at desc
        limit 50
      ) x
    ),
    'feedback', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select
          rf.id, rf.recommendation_id, rf.feedback_type, rf.feedback_notes,
          up.full_name as provided_by_user_name, rf.provided_at
        from intelligence.recommendation_feedback rf
        left join governance.users_profile up on up.id = rf.provided_by_user_id
        order by rf.provided_at desc
        limit 50
      ) x
    ),
    'agents', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select * from analytics.v_ai_agent_health
        order by failed_jobs_24h desc, pending_jobs desc
        limit 50
      ) x
    )
  ) into v_payload;

  return v_payload;
end;
$$;
