-- ============================================================
-- FILE: supabase/migrations/00060_governance_menu_wiring.sql
-- TECHNO-KOL UZI ERP 2026 — Governance Menu Wiring
-- Created: 2026-04-18
-- Purpose:
--   Idempotently insert admin menu entries under the
--   "מערכת / הרשאות / Audit / אינטגרציות" top-level category.
--   Every INSERT is guarded; every re-run is a no-op.
--   Admin-only surface — pages are guarded at app layer by
--   adminMiddleware (req.isSuperAdmin === true).
-- ============================================================

do $$
declare
  v_parent_id bigint;
begin
  -- Locate or create the admin category
  select id into v_parent_id
    from public.app_menu
   where label = 'מערכת / הרשאות / Audit / אינטגרציות'
     and (parent_id is null or parent_id = 0)
   limit 1;

  if v_parent_id is null then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('מערכת / הרשאות / Audit / אינטגרציות', null, '⚙️', null, 95)
    returning id into v_parent_id;
  end if;

  -- ---------- Users & Identity ----------
  if not exists (select 1 from public.app_menu where route = '/users') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('משתמשים', '/users', '👥', v_parent_id, 10);
  end if;

  if not exists (select 1 from public.app_menu where route = '/roles') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('תפקידים', '/roles', '🛡️', v_parent_id, 20);
  end if;

  if not exists (select 1 from public.app_menu where route = '/permissions') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('הרשאות', '/permissions', '🔐', v_parent_id, 30);
  end if;

  -- ---------- Audit & State ----------
  if not exists (select 1 from public.app_menu where route = '/audit-logs') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('יומן ביקורת', '/audit-logs', '📜', v_parent_id, 40);
  end if;

  if not exists (select 1 from public.app_menu where route = '/state-history') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('היסטוריית סטטוסים', '/state-history', '🕑', v_parent_id, 50);
  end if;

  if not exists (select 1 from public.app_menu where route = '/domain-events') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('אירועי דומיין', '/domain-events', '📡', v_parent_id, 55);
  end if;

  -- ---------- Webhooks & Integrations ----------
  if not exists (select 1 from public.app_menu where route = '/webhooks') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('Webhooks', '/webhooks', '🔗', v_parent_id, 60);
  end if;

  if not exists (select 1 from public.app_menu where route = '/webhook-deliveries') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('Webhook Deliveries', '/webhook-deliveries', '📤', v_parent_id, 61);
  end if;

  if not exists (select 1 from public.app_menu where route = '/integrations') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('אינטגרציות', '/integrations', '🔌', v_parent_id, 70);
  end if;

  if not exists (select 1 from public.app_menu where route = '/integration-sync-logs') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('לוגים של סינכרון', '/integration-sync-logs', '🔄', v_parent_id, 71);
  end if;

  -- ---------- Feature flags & Preferences ----------
  if not exists (select 1 from public.app_menu where route = '/feature-flags') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('Feature Flags', '/feature-flags', '🚩', v_parent_id, 80);
  end if;

  if not exists (select 1 from public.app_menu where route = '/saved-filters') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('פילטרים שמורים', '/saved-filters', '💾', v_parent_id, 85);
  end if;

  if not exists (select 1 from public.app_menu where route = '/user-preferences') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('העדפות משתמש', '/user-preferences', '🎛️', v_parent_id, 86);
  end if;

  -- ---------- Health & Config ----------
  if not exists (select 1 from public.app_menu where route = '/health-checks') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('בדיקות תקינות', '/health-checks', '❤️‍🩹', v_parent_id, 90);
  end if;

  if not exists (select 1 from public.app_menu where route = '/validations-log') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('יומן ולידציות', '/validations-log', '✅', v_parent_id, 91);
  end if;

  if not exists (select 1 from public.app_menu where route = '/config') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('הגדרות מערכת', '/config', '⚙️', v_parent_id, 92);
  end if;

  -- ---------- Queue / SLA / Escalation ----------
  if not exists (select 1 from public.app_menu where route = '/queue-jobs') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('Queue Jobs', '/queue-jobs', '📥', v_parent_id, 100);
  end if;

  if not exists (select 1 from public.app_menu where route = '/sla-timers') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('SLA Timers', '/sla-timers', '⏱️', v_parent_id, 101);
  end if;

  if not exists (select 1 from public.app_menu where route = '/escalation-rules') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('Escalation Rules', '/escalation-rules', '🚨', v_parent_id, 102);
  end if;

  -- ---------- Security ----------
  if not exists (select 1 from public.app_menu where route = '/command-logs') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('לוגים של פקודות', '/command-logs', '🧾', v_parent_id, 110);
  end if;

  if not exists (select 1 from public.app_menu where route = '/security-events') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('אירועי אבטחה', '/security-events', '🛑', v_parent_id, 111);
  end if;
end$$;

-- ==============================================================
-- END 00060_governance_menu_wiring.sql
-- ==============================================================
