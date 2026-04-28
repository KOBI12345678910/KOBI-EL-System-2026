-- ============================================================
-- FILE: supabase/migrations/00087_analytics_views.sql
-- AGENT-249 / DB BUILD #4
-- ANALYTICS VIEWS: closes the dashboard gaps named in AGENT-122.
--
-- AGENT-122 documented two missing objects referenced by
-- analytics.get_dashboard_widget_data:
--   - analytics.v_ai_recommendation_queue (read view over
--     intelligence.decision_recommendations)
--   - analytics.rm_procurement_overdue_pos (matview over
--     procurement.purchase_orders filtered to overdue)
-- This migration creates both, plus three additional 360-grade
-- assets requested in the build plan:
--   - mv_executive_summary refresh schedule (pg_cron, 5 min)
--   - mv_customer_360_overview (per-customer 360 rollup)
--   - mv_supplier_scorecard (latest scorecard + KPI rollup)
-- ============================================================

-- Hard pre-flight: schema must exist (it does, but be explicit).
create schema if not exists analytics;

-- ============================================================
-- 1) analytics.v_ai_recommendation_queue
-- Shape (per AGENT-122 line 39, used by widget recommendation_queue
-- in 00022_dashboard_rpcs.sql):
--   recommendation_number, recommendation_text, created_at
-- We expose the full row plus a stable ordering key. The dashboard
-- RPC selects recommendation_number AS title and recommendation_text
-- AS subtitle and orders by created_at desc.
-- ============================================================

create or replace view analytics.v_ai_recommendation_queue as
select
  r.id                          as recommendation_id,
  r.public_id                   as recommendation_uuid,
  r.recommendation_number,
  r.parent_entity_type,
  r.parent_entity_id,
  r.recommendation_type,
  r.recommendation_text,
  coalesce(r.priority, 'medium') as priority,
  r.confidence_score,
  r.action_code,
  r.state,
  r.generated_at,
  r.actioned_at,
  r.created_at,
  r.updated_at,
  -- numeric weight for stable widget ordering (high priority first,
  -- then newest)
  case lower(coalesce(r.priority, 'medium'))
    when 'critical' then 1
    when 'high'     then 2
    when 'medium'   then 3
    when 'low'      then 4
    else                 5
  end                           as priority_rank,
  -- age in hours, used by AI panel sort
  extract(epoch from (now() - r.generated_at)) / 3600.0 as age_hours
from intelligence.decision_recommendations r
where r.state in ('New', 'UnderReview', 'Pending')
  and r.actioned_at is null;

comment on view analytics.v_ai_recommendation_queue is
  'Open AI recommendation queue. Source for dashboard widget '
  '"recommendation_queue" and AI control room. Filters out '
  'actioned/closed recommendations. AGENT-249.';

-- ============================================================
-- 2) analytics.rm_procurement_overdue_pos (MATERIALIZED)
-- Stored as a matview because the dashboard polls it every 30s
-- and the source table grows linearly with PO count. AGENT-122
-- (line 91-93) flags this as a runtime-broken widget today.
-- Definition: every PO whose expected_delivery_date is in the
-- past and whose state is not a terminal state (Received/Closed/
-- Cancelled). Mirrors the live filter in 00002_secure_rpc_functions
-- line 844 and 00022_dashboard_rpcs line 137.
-- ============================================================

drop materialized view if exists analytics.rm_procurement_overdue_pos cascade;

create materialized view analytics.rm_procurement_overdue_pos as
select
  po.id                          as po_id,
  po.public_id                   as po_uuid,
  po.po_number,
  po.supplier_id,
  s.display_name                 as supplier_name,
  po.project_id,
  po.order_date,
  po.expected_delivery_date,
  (current_date - po.expected_delivery_date) as days_overdue,
  po.currency,
  po.grand_total,
  po.approval_status,
  po.receiving_status,
  po.payment_status,
  po.state,
  po.created_at,
  po.updated_at,
  case
    when (current_date - po.expected_delivery_date) >= 30 then 'critical'
    when (current_date - po.expected_delivery_date) >= 14 then 'high'
    when (current_date - po.expected_delivery_date) >=  7 then 'medium'
    else                                                       'low'
  end                            as overdue_severity
from procurement.purchase_orders po
left join procurement.suppliers s on s.id = po.supplier_id
where po.expected_delivery_date is not null
  and po.expected_delivery_date < current_date
  and po.state not in ('Received', 'Closed', 'Cancelled')
  and po.receiving_status <> 'fully_received';

create unique index if not exists idx_rm_procurement_overdue_pos_id
  on analytics.rm_procurement_overdue_pos(po_id);

create index if not exists idx_rm_procurement_overdue_pos_supplier
  on analytics.rm_procurement_overdue_pos(supplier_id);

create index if not exists idx_rm_procurement_overdue_pos_due
  on analytics.rm_procurement_overdue_pos(expected_delivery_date);

create index if not exists idx_rm_procurement_overdue_pos_severity
  on analytics.rm_procurement_overdue_pos(overdue_severity);

comment on materialized view analytics.rm_procurement_overdue_pos is
  'Overdue purchase orders. Refreshed every 5 min by pg_cron. '
  'Source for dashboard widget "procurement_overdue_pos_feed" and '
  'PO360 escalation panel. AGENT-249.';

-- ============================================================
-- 3) analytics.mv_customer_360_overview
-- One row per active customer. Feeds Customer360 page header KPIs
-- and the "high-risk customers" board on the executive dashboard.
-- Distinct from existing mv_customer_health (00015): adds quote
-- conversion, AR aging buckets, last-activity timestamp.
-- ============================================================

drop materialized view if exists analytics.mv_customer_360_overview cascade;

create materialized view analytics.mv_customer_360_overview as
select
  c.id                             as customer_id,
  c.public_id                      as customer_uuid,
  c.customer_number,
  c.display_name,
  c.legal_name,
  c.status,
  c.risk_level,
  c.account_manager_user_id,
  c.credit_limit,
  c.current_balance,
  c.preferred_currency,
  c.created_at                     as customer_since,

  -- Pipeline / commercial
  coalesce((
    select count(*) from commercial.quotes q
    where q.customer_id = c.id
  ), 0)                            as total_quotes,
  coalesce((
    select count(*) from commercial.quotes q
    where q.customer_id = c.id and q.state in ('Sent', 'Negotiating')
  ), 0)                            as open_quotes,
  coalesce((
    select count(*) from commercial.quotes q
    where q.customer_id = c.id and q.state = 'Accepted'
  ), 0)                            as won_quotes,

  -- Projects
  coalesce((
    select count(*) from execution.projects p
    where p.customer_id = c.id and p.state not in ('Closed', 'Cancelled')
  ), 0)                            as active_projects,

  -- Invoicing
  coalesce((
    select sum(i.grand_total) from finance.invoices i
    where i.customer_id = c.id and i.state in ('Paid','PartiallyPaid','Issued')
  ), 0)                            as lifetime_revenue,
  coalesce((
    select sum(i.balance_due) from finance.invoices i
    where i.customer_id = c.id and i.state in ('Issued','PartiallyPaid','Overdue')
  ), 0)                            as open_ar_balance,
  coalesce((
    select sum(i.balance_due) from finance.invoices i
    where i.customer_id = c.id and i.state = 'Overdue'
  ), 0)                            as overdue_ar_amount,
  coalesce((
    select count(*) from finance.invoices i
    where i.customer_id = c.id and i.state = 'Overdue'
  ), 0)                            as overdue_invoices_count,

  -- Aging buckets
  coalesce((
    select sum(i.balance_due) from finance.invoices i
    where i.customer_id = c.id and i.state in ('Issued','PartiallyPaid','Overdue')
      and (current_date - i.due_date) between 0 and 30
  ), 0)                            as ar_0_30,
  coalesce((
    select sum(i.balance_due) from finance.invoices i
    where i.customer_id = c.id and i.state in ('Issued','PartiallyPaid','Overdue')
      and (current_date - i.due_date) between 31 and 60
  ), 0)                            as ar_31_60,
  coalesce((
    select sum(i.balance_due) from finance.invoices i
    where i.customer_id = c.id and i.state in ('Issued','PartiallyPaid','Overdue')
      and (current_date - i.due_date) > 60
  ), 0)                            as ar_60_plus,

  -- Last touch
  coalesce((
    select max(p.payment_date) from finance.payments p
    where p.customer_id = c.id
  ), null)                         as last_payment_date,
  coalesce((
    select max(a.activity_date) from commercial.crm_activities a
    where a.related_entity_type = 'Customer' and a.related_entity_id = c.id
  ), null)                         as last_activity_date,

  -- Health flag
  case
    when c.status <> 'active'                                            then 'inactive'
    when coalesce((select sum(i.balance_due) from finance.invoices i
                   where i.customer_id = c.id and i.state = 'Overdue'),0) > 0 then 'at_risk'
    when c.credit_limit is not null
         and c.current_balance >= c.credit_limit                         then 'over_limit'
    else                                                                      'healthy'
  end                              as health_status,

  now()                            as snapshot_at
from commercial.customers c
where c.deleted_at is null;

create unique index if not exists idx_mv_customer_360_overview_id
  on analytics.mv_customer_360_overview(customer_id);

create index if not exists idx_mv_customer_360_overview_health
  on analytics.mv_customer_360_overview(health_status);

create index if not exists idx_mv_customer_360_overview_manager
  on analytics.mv_customer_360_overview(account_manager_user_id);

comment on materialized view analytics.mv_customer_360_overview is
  'Customer 360 header rollup. One row per active customer. '
  'Refreshed every 5 min by pg_cron. AGENT-249.';

-- ============================================================
-- 4) analytics.mv_supplier_scorecard
-- Latest scorecard joined with live PO performance signals.
-- Feeds Supplier360 + supplier risk widget.
-- ============================================================

drop materialized view if exists analytics.mv_supplier_scorecard cascade;

create materialized view analytics.mv_supplier_scorecard as
with latest_score as (
  select distinct on (sc.supplier_id)
    sc.supplier_id,
    sc.score_period,
    sc.quality_score,
    sc.delivery_score,
    sc.price_score,
    sc.responsiveness_score,
    sc.overall_score,
    sc.calculated_at
  from procurement.supplier_scorecards sc
  order by sc.supplier_id, sc.calculated_at desc
)
select
  s.id                              as supplier_id,
  s.public_id                       as supplier_uuid,
  s.supplier_number,
  s.display_name,
  s.legal_name,
  s.supplier_category,
  s.status,
  s.risk_level,
  s.preferred_supplier,
  s.performance_score               as supplier_performance_score,

  ls.score_period                   as latest_score_period,
  ls.quality_score,
  ls.delivery_score,
  ls.price_score,
  ls.responsiveness_score,
  ls.overall_score                  as latest_overall_score,
  ls.calculated_at                  as latest_score_at,

  -- Live PO signals
  coalesce((
    select count(*) from procurement.purchase_orders po
    where po.supplier_id = s.id
  ), 0)                             as total_pos,
  coalesce((
    select count(*) from procurement.purchase_orders po
    where po.supplier_id = s.id and po.state not in ('Closed','Cancelled')
  ), 0)                             as open_pos,
  coalesce((
    select count(*) from analytics.rm_procurement_overdue_pos op
    where op.supplier_id = s.id
  ), 0)                             as overdue_pos,
  coalesce((
    select sum(po.grand_total) from procurement.purchase_orders po
    where po.supplier_id = s.id
  ), 0)                             as total_po_value,
  coalesce((
    select sum(po.grand_total) from procurement.purchase_orders po
    where po.supplier_id = s.id and po.state not in ('Closed','Cancelled')
  ), 0)                             as open_po_value,
  coalesce((
    select count(*) from procurement.rfq_supplier_invites rsi
    where rsi.supplier_id = s.id and rsi.response_status in ('pending','invited')
  ), 0)                             as pending_rfqs,

  -- Computed risk band based on overall score and overdue ratio
  case
    when ls.overall_score is null                                       then 'unrated'
    when ls.overall_score >= 85                                         then 'A'
    when ls.overall_score >= 70                                         then 'B'
    when ls.overall_score >= 50                                         then 'C'
    else                                                                     'D'
  end                               as score_grade,

  now()                             as snapshot_at
from procurement.suppliers s
left join latest_score ls on ls.supplier_id = s.id
where s.deleted_at is null;

create unique index if not exists idx_mv_supplier_scorecard_id
  on analytics.mv_supplier_scorecard(supplier_id);

create index if not exists idx_mv_supplier_scorecard_grade
  on analytics.mv_supplier_scorecard(score_grade);

create index if not exists idx_mv_supplier_scorecard_overdue
  on analytics.mv_supplier_scorecard(overdue_pos);

comment on materialized view analytics.mv_supplier_scorecard is
  'Supplier 360 + scorecard rollup. One row per active supplier. '
  'Refreshed every 5 min by pg_cron after rm_procurement_overdue_pos '
  'so the join sees fresh data. AGENT-249.';

-- ============================================================
-- 5) Refresh function: extend the existing analytics one to also
-- refresh the new objects in deterministic order (overdue_pos
-- before supplier_scorecard so the cross-matview join is fresh).
-- ============================================================

create or replace function analytics.refresh_dashboard_matviews()
returns void
language plpgsql
security definer
set search_path = analytics, public
as $$
begin
  -- Concurrent refresh requires a unique index; we have one on every
  -- target. Order matters: rm_procurement_overdue_pos feeds
  -- mv_supplier_scorecard.
  refresh materialized view concurrently analytics.mv_executive_summary;
  refresh materialized view concurrently analytics.rm_procurement_overdue_pos;
  refresh materialized view concurrently analytics.mv_customer_360_overview;
  refresh materialized view concurrently analytics.mv_supplier_scorecard;
exception
  when others then
    -- Concurrent refresh fails on first build; fall back.
    refresh materialized view analytics.mv_executive_summary;
    refresh materialized view analytics.rm_procurement_overdue_pos;
    refresh materialized view analytics.mv_customer_360_overview;
    refresh materialized view analytics.mv_supplier_scorecard;
end;
$$;

comment on function analytics.refresh_dashboard_matviews() is
  'Refreshes the four dashboard matviews in dependency order. '
  'Called by pg_cron every 5 minutes. AGENT-249.';

-- ============================================================
-- 6) Permissions
-- ============================================================

grant usage on schema analytics to authenticated;
grant select on analytics.v_ai_recommendation_queue       to authenticated;
grant select on analytics.rm_procurement_overdue_pos      to authenticated;
grant select on analytics.mv_customer_360_overview        to authenticated;
grant select on analytics.mv_supplier_scorecard           to authenticated;
grant execute on function analytics.refresh_dashboard_matviews() to service_role;

-- ============================================================
-- 7) pg_cron schedule (every 5 minutes)
-- pg_cron is a Supabase-supported extension. We guard against
-- environments where it is not enabled. The job name is unique;
-- unschedule any prior version before scheduling.
-- ============================================================

do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- Drop prior schedule if present (idempotent re-run safe).
    perform cron.unschedule(jobid)
      from cron.job
      where jobname in ('analytics_refresh_dashboard_matviews',
                        'analytics_refresh_mv_executive_summary');

    -- Master 5-minute job: refreshes all four matviews in order.
    perform cron.schedule(
      'analytics_refresh_dashboard_matviews',
      '*/5 * * * *',
      $job$ select analytics.refresh_dashboard_matviews(); $job$
    );
  else
    raise notice 'pg_cron not installed; scheduling skipped. '
                 'Run analytics.refresh_dashboard_matviews() from '
                 'an external scheduler instead.';
  end if;
exception
  when undefined_table then
    -- cron.job table missing on some hosts; treat as not-installed.
    raise notice 'pg_cron not initialized; scheduling skipped.';
end;
$cron$;

-- ============================================================
-- 8) Initial population
-- Materialized views are empty until first refresh. Populate now
-- so the dashboard does not return empty arrays on first hit.
-- We do NOT use concurrently here because the views were just
-- created (no prior data, no unique-index concurrency benefit on
-- empty matview).
-- ============================================================

refresh materialized view analytics.rm_procurement_overdue_pos;
refresh materialized view analytics.mv_customer_360_overview;
refresh materialized view analytics.mv_supplier_scorecard;

-- mv_executive_summary already exists and is populated by 00015;
-- not refreshed here to avoid lock contention with prior migrations.

-- ============================================================
-- END AGENT-249 / 00087
-- ============================================================
