-- ============================================================
-- FILE: supabase/migrations/039_analytics_views_and_rpcs.sql
-- ANALYTICS VIEWS AND RPCs FOR CRM, SERVICE, DOCUMENT INTELLIGENCE
-- ============================================================

create or replace view analytics.v_crm_summary as
select
  current_date as snapshot_date,
  coalesce((select count(*) from crm.leads), 0) as total_leads,
  coalesce((select count(*) from crm.leads where lead_status in ('New','Qualified','Proposal')), 0) as open_leads,
  coalesce((select count(*) from crm.opportunities where state = 'Open'), 0) as open_opportunities,
  coalesce((select sum(opportunity_value) from crm.opportunities where state = 'Open'), 0) as open_pipeline_value;

create or replace view analytics.v_service_summary as
select
  current_date as snapshot_date,
  coalesce((select count(*) from service.tickets where state in ('Open','Assigned','InProgress')), 0) as open_tickets,
  coalesce((select count(*) from service.tickets where severity in ('high','critical') and state in ('Open','Assigned','InProgress')), 0) as high_severity_tickets;

create or replace view analytics.v_document_intelligence_summary as
select
  current_date as snapshot_date,
  coalesce((select count(*) from docs.documents), 0) as total_documents,
  coalesce((select count(*) from documents.ocr_runs where state = 'completed'), 0) as completed_ocr_runs,
  coalesce((select count(*) from documents.classification_runs where state = 'completed'), 0) as completed_classification_runs,
  coalesce((select count(*) from documents.extraction_runs where state = 'completed'), 0) as completed_extraction_runs,
  coalesce((select count(*) from documents.knowledge_cards where published = true), 0) as published_knowledge_cards;

create or replace function analytics.get_crm_control_room_fast()
returns jsonb
language plpgsql
security definer
set search_path = analytics, crm, governance, public
as $$
declare
  v_payload jsonb;
begin
  if not governance.can_read_crm() then
    raise exception 'PERMISSION_DENIED';
  end if;

  select jsonb_build_object(
    'summary', (select to_jsonb(v) from analytics.v_crm_summary v),
    'leads', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select *
        from crm.leads
        order by created_at desc
        limit 100
      ) x
    ),
    'opportunities', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select *
        from crm.opportunities
        order by created_at desc
        limit 100
      ) x
    )
  ) into v_payload;

  return v_payload;
end;
$$;

create or replace function analytics.get_service_control_room_fast()
returns jsonb
language plpgsql
security definer
set search_path = analytics, service, governance, public
as $$
declare
  v_payload jsonb;
begin
  if not governance.can_read_service() then
    raise exception 'PERMISSION_DENIED';
  end if;

  select jsonb_build_object(
    'summary', (select to_jsonb(v) from analytics.v_service_summary v),
    'tickets', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select *
        from service.tickets
        order by opened_at desc
        limit 100
      ) x
    )
  ) into v_payload;

  return v_payload;
end;
$$;
