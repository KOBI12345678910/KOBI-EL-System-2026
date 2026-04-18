-- ============================================================
-- FILE: supabase/migrations/00062_analytics_menu_wiring.sql
-- TECHNO-KOL UZI ERP 2026 — Analytics Menu Wiring
-- Created: 2026-04-18
-- Purpose:
--   Idempotently insert analytics menu entries under "דשבורד"
--   (Dashboards / Analytics) category. Every INSERT is guarded
--   so re-running is a no-op. No DELETEs.
-- ============================================================

do $$
declare
  v_parent_id bigint;
begin
  -- Locate or create the "דשבורד" category at top level
  select id into v_parent_id
    from public.app_menu
   where label in ('דשבורד','דשבורדים','Analytics / דשבורד')
     and (parent_id is null or parent_id = 0)
   limit 1;

  if v_parent_id is null then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('דשבורד', null, '📊', null, 75)
    returning id into v_parent_id;
  end if;

  -- ---------- Dashboards ----------
  if not exists (select 1 from public.app_menu where route = '/dashboards') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('דשבורדים', '/dashboards', '📊', v_parent_id, 10);
  end if;

  -- Note: /dashboards/:id is a dynamic detail route, not a static menu entry.
  -- We register a canonical placeholder so the route is discoverable.
  if not exists (select 1 from public.app_menu where route = '/dashboards/:id') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('צפיה בדשבורד', '/dashboards/:id', '📈', v_parent_id, 11);
  end if;

  -- ---------- Reports ----------
  if not exists (select 1 from public.app_menu where route = '/reports') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('דוחות', '/reports', '📑', v_parent_id, 20);
  end if;

  if not exists (select 1 from public.app_menu where route = '/reports/:id') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('צפיה בדוח', '/reports/:id', '📄', v_parent_id, 21);
  end if;

  -- ---------- KPI ----------
  if not exists (select 1 from public.app_menu where route = '/kpi-definitions') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('הגדרות KPI', '/kpi-definitions', '🎯', v_parent_id, 30);
  end if;

  if not exists (select 1 from public.app_menu where route = '/kpi-snapshots') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('סנאפשוטים של KPI', '/kpi-snapshots', '📸', v_parent_id, 31);
  end if;

  -- ---------- Drilldown ----------
  if not exists (select 1 from public.app_menu where route = '/drilldown-paths') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('מסלולי Drilldown', '/drilldown-paths', '🧭', v_parent_id, 40);
  end if;

  -- ---------- Read-model invalidations ----------
  if not exists (select 1 from public.app_menu where route = '/read-model-invalidations') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('חידוש מודל קריאה', '/read-model-invalidations', '♻️', v_parent_id, 50);
  end if;

  -- ---------- Custom metrics ----------
  if not exists (select 1 from public.app_menu where route = '/custom-metrics') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('מדדים מותאמים', '/custom-metrics', '📐', v_parent_id, 60);
  end if;
end$$;

-- ==============================================================
-- END 00062_analytics_menu_wiring.sql
-- ==============================================================
