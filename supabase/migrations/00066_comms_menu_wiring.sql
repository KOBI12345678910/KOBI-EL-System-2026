-- ============================================================
-- FILE: supabase/migrations/00066_comms_menu_wiring.sql
-- TECHNO-KOL UZI ERP 2026 — Comms Menu Wiring
-- Created: 2026-04-18
-- Purpose:
--   Idempotently insert comms menu entries under a dedicated
--   "תקשורת ולקוחות" top-level category.
--   Every INSERT is guarded; re-run is a no-op.
-- ============================================================

do $$
declare
  v_parent_id bigint;
begin
  -- Locate or create the comms category
  select id into v_parent_id
    from public.app_menu
   where label = 'תקשורת ולקוחות'
     and (parent_id is null or parent_id = 0)
   limit 1;

  if v_parent_id is null then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('תקשורת ולקוחות', null, '💬', null, 75)
    returning id into v_parent_id;
  end if;

  -- ---------- Unified inbox ----------
  if not exists (select 1 from public.app_menu where route = '/communications') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('תיבת תקשורת מאוחדת', '/communications', '📬', v_parent_id, 10);
  end if;

  -- ---------- Channels ----------
  if not exists (select 1 from public.app_menu where route = '/email-messages') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('הודעות אימייל', '/email-messages', '📧', v_parent_id, 20);
  end if;

  if not exists (select 1 from public.app_menu where route = '/sms-messages') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('הודעות SMS', '/sms-messages', '📱', v_parent_id, 30);
  end if;

  if not exists (select 1 from public.app_menu where route = '/whatsapp-messages') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('הודעות WhatsApp', '/whatsapp-messages', '💚', v_parent_id, 40);
  end if;

  -- ---------- User-facing ----------
  if not exists (select 1 from public.app_menu where route = '/notifications') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('התראות', '/notifications', '🔔', v_parent_id, 50);
  end if;

  -- ---------- Support ----------
  if not exists (select 1 from public.app_menu where route = '/support-tickets') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('קריאות שירות', '/support-tickets', '🎫', v_parent_id, 60);
  end if;

  -- ---------- Admin ----------
  if not exists (select 1 from public.app_menu where route = '/portal-users') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('משתמשי פורטל', '/portal-users', '🪪', v_parent_id, 70);
  end if;

  if not exists (select 1 from public.app_menu where route = '/chatbot-sessions') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('שיחות צ׳אטבוט', '/chatbot-sessions', '🤖', v_parent_id, 80);
  end if;

  if not exists (select 1 from public.app_menu where route = '/help-articles') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('מאמרי עזרה', '/help-articles', '📚', v_parent_id, 90);
  end if;

  if not exists (select 1 from public.app_menu where route = '/message-templates') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('תבניות הודעה', '/message-templates', '📝', v_parent_id, 100);
  end if;

  if not exists (select 1 from public.app_menu where route = '/broadcast-campaigns') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('קמפיינים ושידור', '/broadcast-campaigns', '📢', v_parent_id, 110);
  end if;
end$$;

-- ============================================================
-- END 00066_comms_menu_wiring.sql
-- ============================================================
