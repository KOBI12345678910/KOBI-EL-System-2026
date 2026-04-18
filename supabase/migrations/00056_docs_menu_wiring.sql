-- ============================================================
-- FILE: supabase/migrations/00056_docs_menu_wiring.sql
-- TECHNO-KOL UZI ERP 2026 — Docs Menu Wiring
-- Created: 2026-04-18
-- Purpose:
--   Idempotently insert menu entries for the docs domain under the
--   "מסמכים" category. Every INSERT is guarded so re-running is a no-op.
--   No DELETEs, no mass UPDATEs. Category id is looked up; created if
--   absent.
-- ============================================================

do $$
declare
  v_parent_id bigint;
begin
  -- Locate or create the "מסמכים" category at top level
  select id into v_parent_id
    from public.app_menu
   where label = 'מסמכים'
     and (parent_id is null or parent_id = 0)
   limit 1;

  if v_parent_id is null then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('מסמכים', null, '📁', null, 40)
    returning id into v_parent_id;
  end if;

  -- ---------- Documents ----------
  if not exists (select 1 from public.app_menu where route = '/documents') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('מסמכים', '/documents', '📄', v_parent_id, 10);
  end if;

  if not exists (select 1 from public.app_menu where route = '/documents/:id') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('Document 360', '/documents/:id', '🧭', v_parent_id, 11);
  end if;

  if not exists (select 1 from public.app_menu where route = '/documents/:id/versions') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('גרסאות מסמך', '/documents/:id/versions', '🗂️', v_parent_id, 12);
  end if;

  -- ---------- Attachments ----------
  if not exists (select 1 from public.app_menu where route = '/attachments') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('קבצים מצורפים', '/attachments', '📎', v_parent_id, 20);
  end if;

  -- ---------- OCR ----------
  if not exists (select 1 from public.app_menu where route = '/ocr-center') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('מרכז OCR', '/ocr-center', '🔎', v_parent_id, 30);
  end if;

  if not exists (select 1 from public.app_menu where route = '/ocr-runs') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('ריצות OCR', '/ocr-runs', '🧪', v_parent_id, 31);
  end if;

  -- ---------- AI processing runs ----------
  if not exists (select 1 from public.app_menu where route = '/extraction-runs') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('ריצות חילוץ שדות', '/extraction-runs', '🧲', v_parent_id, 40);
  end if;

  if not exists (select 1 from public.app_menu where route = '/classification-runs') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('ריצות סיווג', '/classification-runs', '🏷️', v_parent_id, 41);
  end if;

  -- ---------- Signatures ----------
  if not exists (select 1 from public.app_menu where route = '/signature-requests') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('בקשות חתימה', '/signature-requests', '✍️', v_parent_id, 50);
  end if;

  -- ---------- Knowledge ----------
  if not exists (select 1 from public.app_menu where route = '/knowledge-cards') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('כרטיסי ידע', '/knowledge-cards', '🧠', v_parent_id, 60);
  end if;

  if not exists (select 1 from public.app_menu where route = '/document-relations') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('קשרי מסמכים', '/document-relations', '🔗', v_parent_id, 70);
  end if;
end $$;

-- Reset sequence to avoid future id conflicts
select setval('app_menu_id_seq', (select max(id) from public.app_menu))
  where exists (select 1 from pg_sequences where sequencename = 'app_menu_id_seq');

select 'Migration 00056 applied — docs menu wiring (11 entries) complete' as status;
