-- ============================================================
-- FILE: supabase/migrations/00050_inventory_menu_wiring.sql
-- TECHNO-KOL UZI ERP 2026 — Inventory Menu Wiring
-- Created: 2026-04-18
-- Purpose:
--   Idempotently insert menu entries for the inventory domain under
--   the "מלאי ומחסנים" category. Every INSERT is guarded so re-running
--   is a no-op. No DELETEs, no mass UPDATEs.
-- ============================================================

do $$
declare
  v_parent_id bigint;
begin
  -- Locate or create the "מלאי ומחסנים" category at top level
  select id into v_parent_id
    from public.app_menu
   where label = 'מלאי ומחסנים'
     and (parent_id is null or parent_id = 0)
   limit 1;

  if v_parent_id is null then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('מלאי ומחסנים', null, '📦', null, 35)
    returning id into v_parent_id;
  end if;

  -- ---------- Materials ----------
  if not exists (select 1 from public.app_menu where route = '/materials') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('חומרים', '/materials', '🧱', v_parent_id, 10);
  end if;

  if not exists (select 1 from public.app_menu where route = '/materials/:id') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('Material 360', '/materials/:id', '🧭', v_parent_id, 11);
  end if;

  -- ---------- Material Requests ----------
  if not exists (select 1 from public.app_menu where route = '/material-requests') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('בקשות חומרים', '/material-requests', '📨', v_parent_id, 15);
  end if;

  -- ---------- Journal (movements) ----------
  if not exists (select 1 from public.app_menu where route = '/inventory/journal') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('יומן תנועות מלאי', '/inventory/journal', '📜', v_parent_id, 20);
  end if;

  -- ---------- Receipts / Issues / Transfers ----------
  if not exists (select 1 from public.app_menu where route = '/inventory/receipts') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('קבלות מלאי', '/inventory/receipts', '📥', v_parent_id, 30);
  end if;

  if not exists (select 1 from public.app_menu where route = '/inventory/issues') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('הנפקות מלאי', '/inventory/issues', '📤', v_parent_id, 31);
  end if;

  if not exists (select 1 from public.app_menu where route = '/inventory/transfers') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('העברות בין מחסנים', '/inventory/transfers', '🔄', v_parent_id, 32);
  end if;

  if not exists (select 1 from public.app_menu where route = '/inventory/reservations') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('שריונים', '/inventory/reservations', '🔒', v_parent_id, 33);
  end if;

  if not exists (select 1 from public.app_menu where route = '/inventory/lots') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('אצוות (Lots)', '/inventory/lots', '🏷️', v_parent_id, 34);
  end if;

  -- ---------- Warehouses ----------
  if not exists (select 1 from public.app_menu where route = '/warehouses') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('מחסנים', '/warehouses', '🏢', v_parent_id, 40);
  end if;

  -- ---------- Manufacturing Batches ----------
  if not exists (select 1 from public.app_menu where route = '/manufacturing-batches') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('אצוות ייצור', '/manufacturing-batches', '🏭', v_parent_id, 50);
  end if;

  -- ---------- Reorder Rules ----------
  if not exists (select 1 from public.app_menu where route = '/reorder-rules') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('כללי הזמנה חוזרת', '/reorder-rules', '♻️', v_parent_id, 60);
  end if;

  -- ---------- Shortage Snapshots ----------
  if not exists (select 1 from public.app_menu where route = '/shortage-snapshots') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('תמונות מחסור', '/shortage-snapshots', '⚠️', v_parent_id, 70);
  end if;

  -- ---------- Stock Counts ----------
  if not exists (select 1 from public.app_menu where route = '/stock-counts') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('ספירת מלאי', '/stock-counts', '🧮', v_parent_id, 80);
  end if;

  -- ---------- Barcode Scans ----------
  if not exists (select 1 from public.app_menu where route = '/barcode-scans') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('סריקות ברקוד', '/barcode-scans', '📟', v_parent_id, 90);
  end if;
end $$;

-- Reset sequence to avoid future id conflicts
select setval('app_menu_id_seq', (select max(id) from public.app_menu))
  where exists (select 1 from pg_sequences where sequencename = 'app_menu_id_seq');

select 'Migration 00050 applied — inventory menu wiring complete' as status;
