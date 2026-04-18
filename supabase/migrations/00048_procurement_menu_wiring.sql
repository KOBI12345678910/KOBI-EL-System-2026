-- ============================================================
-- FILE: supabase/migrations/00048_procurement_menu_wiring.sql
-- TECHNO-KOL UZI ERP 2026 — Procurement Menu Wiring
-- Created: 2026-04-18
-- Purpose:
--   Idempotently insert menu entries for the procurement domain under
--   the "רכש וספקים" category. Every INSERT is guarded so re-running
--   is a no-op. No DELETEs, no mass UPDATEs.
--
--   The category id is looked up (not hard-coded) — falls back to
--   creating the category if absent.
-- ============================================================

do $$
declare
  v_parent_id bigint;
begin
  -- Locate or create the "רכש וספקים" category at top level
  select id into v_parent_id
    from public.app_menu
   where label = 'רכש וספקים'
     and (parent_id is null or parent_id = 0)
   limit 1;

  if v_parent_id is null then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('רכש וספקים', null, '🛒', null, 30)
    returning id into v_parent_id;
  end if;

  -- ---------- Suppliers ----------
  if not exists (select 1 from public.app_menu where route = '/suppliers') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('ספקים', '/suppliers', '🏭', v_parent_id, 10);
  end if;

  if not exists (select 1 from public.app_menu where route = '/suppliers/:id') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('Supplier 360', '/suppliers/:id', '🧭', v_parent_id, 11);
  end if;

  -- ---------- RFQ ----------
  if not exists (select 1 from public.app_menu where route = '/rfqs') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('בקשות הצעה (RFQ)', '/rfqs', '📣', v_parent_id, 20);
  end if;

  if not exists (select 1 from public.app_menu where route = '/rfqs/:id') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('RFQ 360', '/rfqs/:id', '🧾', v_parent_id, 21);
  end if;

  if not exists (select 1 from public.app_menu where route = '/rfqs/:id/items') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('שורות RFQ', '/rfqs/:id/items', '📝', v_parent_id, 22);
  end if;

  -- ---------- Purchase Orders ----------
  if not exists (select 1 from public.app_menu where route = '/purchase-orders') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('הזמנות רכש', '/purchase-orders', '📦', v_parent_id, 30);
  end if;

  if not exists (select 1 from public.app_menu where route = '/purchase-orders/:id') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('Purchase Order 360', '/purchase-orders/:id', '🧭', v_parent_id, 31);
  end if;

  if not exists (select 1 from public.app_menu where route = '/purchase-orders/:id/lines') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('שורות הזמנה', '/purchase-orders/:id/lines', '📝', v_parent_id, 32);
  end if;

  -- ---------- Goods Receipts ----------
  if not exists (select 1 from public.app_menu where route = '/goods-receipts') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('קבלות סחורה', '/goods-receipts', '📬', v_parent_id, 40);
  end if;

  -- ---------- Three-Way Match ----------
  if not exists (select 1 from public.app_menu where route = '/three-way-match') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('התאמה תלת-כיוונית', '/three-way-match', '🔀', v_parent_id, 50);
  end if;

  -- ---------- Supplier Invoices ----------
  if not exists (select 1 from public.app_menu where route = '/supplier-invoices') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('חשבוניות ספקים', '/supplier-invoices', '🧾', v_parent_id, 60);
  end if;

  -- ---------- Supplier Evaluations ----------
  if not exists (select 1 from public.app_menu where route = '/supplier-evaluations') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('הערכות ספקים', '/supplier-evaluations', '📊', v_parent_id, 70);
  end if;

  -- ---------- Procurement Approvals ----------
  if not exists (select 1 from public.app_menu where route = '/procurement-approvals') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('אישורי רכש', '/procurement-approvals', '✅', v_parent_id, 80);
  end if;

  -- ---------- Contracts ----------
  if not exists (select 1 from public.app_menu where route = '/contracts') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('חוזים', '/contracts', '📃', v_parent_id, 90);
  end if;

  if not exists (select 1 from public.app_menu where route = '/contracts/:id') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('Contract 360', '/contracts/:id', '🧭', v_parent_id, 91);
  end if;

  -- ---------- Subcontractors ----------
  if not exists (select 1 from public.app_menu where route = '/subcontractors') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('קבלני משנה', '/subcontractors', '👷', v_parent_id, 100);
  end if;
end $$;

-- Reset sequence to avoid future id conflicts
select setval('app_menu_id_seq', (select max(id) from public.app_menu))
  where exists (select 1 from pg_sequences where sequencename = 'app_menu_id_seq');

select 'Migration 00048 applied — procurement menu wiring (16 entries) complete' as status;
