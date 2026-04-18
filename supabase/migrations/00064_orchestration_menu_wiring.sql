-- ============================================================
-- FILE: supabase/migrations/00064_orchestration_menu_wiring.sql
-- TECHNO-KOL UZI ERP 2026 — Orchestration Menu Wiring
-- Created: 2026-04-18
-- Purpose:
--   Idempotently insert menu entries under the "תזמור ותהליכים"
--   top-level category. Every INSERT is guarded; every re-run
--   is a no-op.
--   Surfaces: workflows, workflow-runs, job-queue, universal-inbox,
--   notifications, workflow-triggers.
-- ============================================================

do $$
declare
  v_parent_id bigint;
begin
  -- Locate or create the orchestration category
  select id into v_parent_id
    from public.app_menu
   where label = 'תזמור ותהליכים'
     and (parent_id is null or parent_id = 0)
   limit 1;

  if v_parent_id is null then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('תזמור ותהליכים', null, '🧩', null, 90)
    returning id into v_parent_id;
  end if;

  -- ---------- Workflows (definitions) ----------
  if not exists (select 1 from public.app_menu where route = '/workflows') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('Workflows', '/workflows', '🔀', v_parent_id, 10);
  end if;

  -- ---------- Workflow Runs ----------
  if not exists (select 1 from public.app_menu where route = '/workflow-runs') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('ריצות Workflow', '/workflow-runs', '▶️', v_parent_id, 20);
  end if;

  -- ---------- Workflow Triggers ----------
  if not exists (select 1 from public.app_menu where route = '/workflow-triggers') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('טריגרים', '/workflow-triggers', '⚡', v_parent_id, 30);
  end if;

  -- ---------- Job Queue ----------
  if not exists (select 1 from public.app_menu where route = '/job-queue') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('תור משימות', '/job-queue', '📥', v_parent_id, 40);
  end if;

  -- ---------- Universal Inbox ----------
  if not exists (select 1 from public.app_menu where route = '/universal-inbox') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('תיבת עבודה', '/universal-inbox', '📬', v_parent_id, 50);
  end if;

  -- ---------- Notifications ----------
  if not exists (select 1 from public.app_menu where route = '/notifications') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('התראות', '/notifications', '🔔', v_parent_id, 60);
  end if;
end$$;

-- ==============================================================
-- END 00064_orchestration_menu_wiring.sql
-- ==============================================================
