-- ============================================================
-- FILE: supabase/migrations/00058_intelligence_menu_wiring.sql
-- TECHNO-KOL UZI ERP 2026 — Intelligence Menu Wiring
-- Created: 2026-04-18
-- Purpose:
--   Idempotently insert menu entries for the intelligence domain
--   under the "בינה מלאכותית" ("AI / Intelligence") category.
--   Every INSERT is guarded so re-running is a no-op. No DELETEs.
-- ============================================================

do $$
declare
  v_parent_id bigint;
begin
  -- Locate or create the "בינה מלאכותית" category at top level
  select id into v_parent_id
    from public.app_menu
   where label in ('בינה מלאכותית','AI / Intelligence','AI / אינטליג׳נס')
     and (parent_id is null or parent_id = 0)
   limit 1;

  if v_parent_id is null then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('בינה מלאכותית', null, '🧠', null, 70)
    returning id into v_parent_id;
  end if;

  -- ---------- AI Insights ----------
  if not exists (select 1 from public.app_menu where route = '/ai-insights') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('תובנות AI', '/ai-insights', '💡', v_parent_id, 10);
  end if;

  -- ---------- Anomalies ----------
  if not exists (select 1 from public.app_menu where route = '/anomalies') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('אנומליות', '/anomalies', '⚠️', v_parent_id, 20);
  end if;

  -- ---------- Recommendations ----------
  if not exists (select 1 from public.app_menu where route = '/recommendations') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('מרכז המלצות', '/recommendations', '🎯', v_parent_id, 30);
  end if;

  -- ---------- Forecast Models ----------
  if not exists (select 1 from public.app_menu where route = '/forecast-models') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('מודלי תחזיות', '/forecast-models', '📈', v_parent_id, 40);
  end if;

  -- ---------- Agents ----------
  if not exists (select 1 from public.app_menu where route = '/agents') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('רישום סוכנים', '/agents', '🤖', v_parent_id, 50);
  end if;

  -- ---------- Agent Jobs ----------
  if not exists (select 1 from public.app_menu where route = '/agent-jobs') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('משימות סוכנים', '/agent-jobs', '📋', v_parent_id, 51);
  end if;

  -- ---------- Executive War Room ----------
  if not exists (select 1 from public.app_menu where route = '/executive-war-room') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('חדר מלחמה', '/executive-war-room', '🎖️', v_parent_id, 60);
  end if;

  -- ---------- Predictive Analytics ----------
  if not exists (select 1 from public.app_menu where route = '/predictive-analytics') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('אנליטיקה חזויה', '/predictive-analytics', '🔮', v_parent_id, 70);
  end if;

  -- ---------- Process Mining ----------
  if not exists (select 1 from public.app_menu where route = '/process-mining') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('חציבת תהליכים', '/process-mining', '⛏️', v_parent_id, 80);
  end if;

  -- ---------- Prompt Templates ----------
  if not exists (select 1 from public.app_menu where route = '/prompt-templates') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('תבניות פרומפטים', '/prompt-templates', '📝', v_parent_id, 90);
  end if;

  -- ---------- Orchestration Flows ----------
  if not exists (select 1 from public.app_menu where route = '/orchestration-flows') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('תזמורת זרימות', '/orchestration-flows', '🎼', v_parent_id, 100);
  end if;
end $$;

-- Reset sequence to avoid future id conflicts
select setval('app_menu_id_seq', (select max(id) from public.app_menu))
  where exists (select 1 from pg_sequences where sequencename = 'app_menu_id_seq');

select 'Migration 00058 applied — intelligence menu wiring (11 entries) complete' as status;
