-- ============================================================
-- FILE: supabase/migrations/00044_commercial_menu_wiring.sql
-- TECHNO-KOL UZI ERP 2026 — Commercial Menu Wiring
-- Created: 2026-04-18
-- Purpose:
--   Idempotently insert menu entries for the commercial domain pages
--   under category 2 ("מכירות ולקוחות"), including both long-standing
--   surfaces and the 4 new pages introduced in migration 00043.
--
--   Guard: every INSERT uses `where not exists (... where route = '...')`
--   so re-running is a no-op. No DELETEs, no mass UPDATEs.
--
--   Category id reference (seeded by 00017/00036/00041):
--     2 = 'מכירות ולקוחות'
-- ============================================================

do $$
begin
  if not exists (select 1 from public.app_menu where id = 2) then
    raise notice 'Category 2 (מכירות ולקוחות) not seeded. Skipping 00044 menu wiring.';
    return;
  end if;

  -- Customers
  if not exists (select 1 from public.app_menu where route = '/commercial/customers') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('לקוחות', '/commercial/customers', '👥', 2, 10);
  end if;

  if not exists (select 1 from public.app_menu where route = '/commercial/customers/:id') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('Customer 360', '/commercial/customers/:id', '🧭', 2, 11);
  end if;

  -- Leads
  if not exists (select 1 from public.app_menu where route = '/commercial/leads') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('לידים', '/commercial/leads', '🎯', 2, 20);
  end if;

  if not exists (select 1 from public.app_menu where route = '/commercial/leads/:id') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('פרטי ליד', '/commercial/leads/:id', '📄', 2, 21);
  end if;

  -- Opportunities
  if not exists (select 1 from public.app_menu where route = '/commercial/opportunities') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('הזדמנויות', '/commercial/opportunities', '💼', 2, 30);
  end if;

  -- Quotes
  if not exists (select 1 from public.app_menu where route = '/commercial/quotes') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('הצעות מחיר', '/commercial/quotes', '📋', 2, 40);
  end if;

  if not exists (select 1 from public.app_menu where route = '/commercial/quotes/:id') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('Quote 360', '/commercial/quotes/:id', '🧾', 2, 41);
  end if;

  if not exists (select 1 from public.app_menu where route = '/commercial/quotes/:id/revisions') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('גרסאות הצעה', '/commercial/quotes/:id/revisions', '🕒', 2, 42);
  end if;

  if not exists (select 1 from public.app_menu where route = '/commercial/quote-approval-rules') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('כללי אישור הצעות', '/commercial/quote-approval-rules', '✅', 2, 43);
  end if;

  if not exists (select 1 from public.app_menu where route = '/commercial/pricing-snapshots') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('תצלומי תמחור', '/commercial/pricing-snapshots', '📸', 2, 44);
  end if;

  -- Pipeline
  if not exists (select 1 from public.app_menu where route = '/commercial/pipeline-stages') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('שלבי Pipeline', '/commercial/pipeline-stages', '🚦', 2, 50);
  end if;

  -- CRM Activities
  if not exists (select 1 from public.app_menu where route = '/commercial/crm-activities') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('פעילות CRM', '/commercial/crm-activities', '📞', 2, 60);
  end if;

  -- Lead Tags
  if not exists (select 1 from public.app_menu where route = '/commercial/lead-tags') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('תגיות לידים', '/commercial/lead-tags', '🏷️', 2, 70);
  end if;

  -- ========== NEW IN 00043 ==========

  -- Lead Sources (new)
  if not exists (select 1 from public.app_menu where route = '/commercial/lead-sources') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('מקורות לידים', '/commercial/lead-sources', '📡', 2, 80);
  end if;

  -- Customer Segments (new)
  if not exists (select 1 from public.app_menu where route = '/commercial/customer-segments') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('פילוח לקוחות', '/commercial/customer-segments', '🧩', 2, 90);
  end if;

  -- Sales Orders (new)
  if not exists (select 1 from public.app_menu where route = '/commercial/sales-orders') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('הזמנות מכירה', '/commercial/sales-orders', '🧾', 2, 100);
  end if;

  -- Pricing Rules (new)
  if not exists (select 1 from public.app_menu where route = '/commercial/pricing-rules') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('כללי תמחור', '/commercial/pricing-rules', '⚖️', 2, 110);
  end if;
end $$;

-- Reset sequence to avoid future id conflicts
select setval('app_menu_id_seq', (select max(id) from public.app_menu))
  where exists (select 1 from pg_sequences where sequencename = 'app_menu_id_seq');

select 'Migration 00044 applied — commercial menu wiring (17 entries) complete' as status;
