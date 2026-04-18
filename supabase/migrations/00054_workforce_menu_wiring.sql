-- ============================================================
-- FILE: supabase/migrations/00054_workforce_menu_wiring.sql
-- TECHNO-KOL UZI ERP 2026 — Workforce Menu Wiring (net-new only)
-- Created: 2026-04-18
-- Purpose:
--   Add ONLY menu entries for new/gap-filled workforce surfaces.
--   Legacy hr/* menu entries remain untouched (53 existing pages).
--   Every insert is guarded with `where not exists`.
-- ============================================================

do $$
declare
  v_parent_id bigint;
begin
  -- Locate parent "HR / כוח אדם" or create
  select id into v_parent_id
    from public.app_menu
   where label in ('כוח אדם','משאבי אנוש','HR','HR / משאבי אנוש')
     and (parent_id is null or parent_id = 0)
   order by id
   limit 1;

  if v_parent_id is null then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('כוח אדם', null, 'users', null, 35)
    returning id into v_parent_id;
  end if;

  -- PayrollRun360 — gap-fill page per registry completion_gate
  if not exists (select 1 from public.app_menu where route = '/payroll-run/:id') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('תלוש ריצת שכר (360)', '/payroll-runs', 'dollar-sign', v_parent_id, 210);
  end if;

  -- WageSlipsArchive
  if not exists (select 1 from public.app_menu where route = '/wage-slips-archive') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('ארכיון תלושי שכר', '/wage-slips-archive', 'file-text', v_parent_id, 215);
  end if;

  -- Attendance exceptions surface (new table)
  if not exists (select 1 from public.app_menu where route = '/attendance-exceptions') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('חריגי נוכחות', '/attendance-exceptions', 'alert-triangle', v_parent_id, 220);
  end if;

  -- Payroll exceptions
  if not exists (select 1 from public.app_menu where route = '/payroll-exceptions') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('חריגי שכר', '/payroll-exceptions', 'alert-octagon', v_parent_id, 225);
  end if;

  -- Payroll export batches
  if not exists (select 1 from public.app_menu where route = '/payroll-export-batches') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('אצוות ייצוא לבנק', '/payroll-export-batches', 'upload', v_parent_id, 230);
  end if;

  -- Pay components admin (new surface)
  if not exists (select 1 from public.app_menu where route = '/pay-components') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('רכיבי שכר', '/pay-components', 'sliders', v_parent_id, 235);
  end if;

  -- Benefits
  if not exists (select 1 from public.app_menu where route = '/benefits-admin') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('הטבות', '/benefits-admin', 'gift', v_parent_id, 240);
  end if;
end$$;

-- ==============================================================
-- END 00054_workforce_menu_wiring.sql
-- ==============================================================
