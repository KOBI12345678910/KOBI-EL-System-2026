-- ============================================================
-- FILE: supabase/migrations/00046_execution_menu_wiring.sql
-- TECHNO-KOL UZI ERP 2026 — Execution Menu Wiring
-- Created: 2026-04-18
-- Purpose:
--   Register execution-domain pages in public.app_menu under the
--   "פרויקטים / ייצור / התקנה / הנדסה" categories.
--
--   Idempotent: each insert uses a NOT EXISTS guard against route
--   (route is the stable identifier here; label is Hebrew).
-- ============================================================

-- Resolve or create parent categories. We look them up by label;
-- if any is missing we insert it and re-query.
do $$
declare
  v_projects_id    bigint;
  v_production_id  bigint;
  v_installation_id bigint;
  v_engineering_id bigint;
begin
  select id into v_projects_id    from public.app_menu where label = 'פרויקטים'    and parent_id is null limit 1;
  select id into v_production_id  from public.app_menu where label = 'ייצור'       and parent_id is null limit 1;
  select id into v_installation_id from public.app_menu where label = 'התקנה'      and parent_id is null limit 1;
  select id into v_engineering_id from public.app_menu where label = 'הנדסה'       and parent_id is null limit 1;

  if v_projects_id is null then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('פרויקטים', '/projects', 'FolderKanban', null, 40)
    returning id into v_projects_id;
  end if;
  if v_production_id is null then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('ייצור', '/production', 'Factory', null, 45)
    returning id into v_production_id;
  end if;
  if v_installation_id is null then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('התקנה', '/installations', 'Wrench', null, 50)
    returning id into v_installation_id;
  end if;
  if v_engineering_id is null then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('הנדסה', '/engineering', 'Ruler', null, 55)
    returning id into v_engineering_id;
  end if;

  -- ---------- Projects sub-items ----------
  perform 1 from public.app_menu where route = '/projects';
  if not found then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('רשימת פרויקטים', '/projects', 'FolderKanban', v_projects_id, 10);
  end if;

  perform 1 from public.app_menu where route = '/projects/new';
  if not found then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('פרויקט חדש', '/projects/new', 'FolderPlus', v_projects_id, 15);
  end if;

  perform 1 from public.app_menu where route = '/tasks';
  if not found then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('משימות', '/tasks', 'ListTodo', v_projects_id, 20);
  end if;

  perform 1 from public.app_menu where route = '/work-orders';
  if not found then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('הזמנות עבודה', '/work-orders', 'ClipboardList', v_projects_id, 30);
  end if;

  perform 1 from public.app_menu where route = '/delivery-events';
  if not found then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('אירועי משלוח', '/delivery-events', 'Truck', v_projects_id, 40);
  end if;

  perform 1 from public.app_menu where route = '/installation-events';
  if not found then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('אירועי התקנה', '/installation-events', 'Hammer', v_projects_id, 50);
  end if;

  perform 1 from public.app_menu where route = '/material-planning';
  if not found then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('תכנון חומרים', '/material-planning', 'Package', v_projects_id, 60);
  end if;

  -- ---------- Production sub-items ----------
  perform 1 from public.app_menu where route = '/production-orders';
  if not found then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('הזמנות ייצור', '/production-orders', 'Boxes', v_production_id, 10);
  end if;

  perform 1 from public.app_menu where route = '/work-centers';
  if not found then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('מרכזי עבודה', '/work-centers', 'Cog', v_production_id, 20);
  end if;

  perform 1 from public.app_menu where route = '/labor-logs';
  if not found then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('יומני עבודה', '/labor-logs', 'Clock', v_production_id, 30);
  end if;

  -- ---------- Installation sub-items ----------
  perform 1 from public.app_menu where route = '/installation-teams';
  if not found then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('צוותי התקנה', '/installation-teams', 'Users', v_installation_id, 10);
  end if;

  perform 1 from public.app_menu where route = '/site-visits';
  if not found then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('ביקורי שטח', '/site-visits', 'MapPin', v_installation_id, 20);
  end if;

  perform 1 from public.app_menu where route = '/punch-lists';
  if not found then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('רשימות תיקונים', '/punch-lists', 'ListChecks', v_installation_id, 30);
  end if;

  -- ---------- Engineering sub-items ----------
  perform 1 from public.app_menu where route = '/drawings';
  if not found then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('שרטוטים', '/drawings', 'Ruler', v_engineering_id, 10);
  end if;

  perform 1 from public.app_menu where route = '/bom-headers';
  if not found then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('עצי מוצר (BOM)', '/bom-headers', 'GitBranch', v_engineering_id, 20);
  end if;

  perform 1 from public.app_menu where route = '/revision-control';
  if not found then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('בקרת גרסאות', '/revision-control', 'History', v_engineering_id, 30);
  end if;
end $$;

select 'Migration 00046 applied — execution menu wiring complete' as status;
