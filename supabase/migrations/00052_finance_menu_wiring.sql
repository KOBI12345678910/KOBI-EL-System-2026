-- ============================================================
-- FILE: supabase/migrations/00052_finance_menu_wiring.sql
-- TECHNO-KOL UZI ERP 2026 — Finance Menu Wiring
-- Created: 2026-04-18
-- Purpose:
--   Idempotently insert menu entries for the finance domain pages
--   under category 6 ("כספים"). Includes both the core 360 surfaces
--   (Invoice360 / Payment360) and follow-up finance pages.
--
--   Guard: every INSERT uses `where not exists (... where route = '...')`
--   so re-running is a no-op. No DELETEs, no mass UPDATEs.
--
--   Category id reference (seeded by 00017/00036/00041):
--     6 = 'כספים'
-- ============================================================

do $$
begin
  if not exists (select 1 from public.app_menu where id = 6) then
    raise notice 'Category 6 (כספים) not seeded. Skipping 00052 menu wiring.';
    return;
  end if;

  -- ========== Invoices (core 360) ==========
  if not exists (select 1 from public.app_menu where route = '/invoices') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('חשבוניות', '/invoices', '🧾', 6, 10);
  end if;

  if not exists (select 1 from public.app_menu where route = '/invoices/:id') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('Invoice 360', '/invoices/:id', '📄', 6, 11);
  end if;

  -- ========== Payments (core 360) ==========
  if not exists (select 1 from public.app_menu where route = '/payments') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('תשלומים', '/payments', '💰', 6, 20);
  end if;

  if not exists (select 1 from public.app_menu where route = '/payments/:id') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('Payment 360', '/payments/:id', '💳', 6, 21);
  end if;

  -- ========== VAT & Tax ==========
  if not exists (select 1 from public.app_menu where route = '/finance/vat-records') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('רישומי מע״מ', '/finance/vat-records', '📊', 6, 30);
  end if;

  if not exists (select 1 from public.app_menu where route = '/finance/tax-records') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('רישומי מס', '/finance/tax-records', '📑', 6, 31);
  end if;

  if not exists (select 1 from public.app_menu where route = '/finance/tax-exports') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('ייצוא מס (PCN836)', '/finance/tax-exports', '📤', 6, 32);
  end if;

  -- ========== Receipts / Expenses / GL ==========
  if not exists (select 1 from public.app_menu where route = '/finance/receipts') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('קבלות', '/finance/receipts', '🧾', 6, 40);
  end if;

  if not exists (select 1 from public.app_menu where route = '/finance/expenses') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('הוצאות', '/finance/expenses', '💸', 6, 41);
  end if;

  if not exists (select 1 from public.app_menu where route = '/finance/gl-transactions') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('תנועות יומן', '/finance/gl-transactions', '📒', 6, 42);
  end if;

  -- ========== Bank / Reconciliation ==========
  if not exists (select 1 from public.app_menu where route = '/finance/bank-files') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('קבצי בנק', '/finance/bank-files', '🏦', 6, 50);
  end if;

  if not exists (select 1 from public.app_menu where route = '/finance/bank-matches') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('התאמות בנק', '/finance/bank-matches', '🔗', 6, 51);
  end if;

  if not exists (select 1 from public.app_menu where route = '/finance/reconciliation-exceptions') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('חריגים בהתאמות', '/finance/reconciliation-exceptions', '⚠️', 6, 52);
  end if;

  -- ========== Collection / Dunning ==========
  if not exists (select 1 from public.app_menu where route = '/finance/collection-cases') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('תיקי גבייה', '/finance/collection-cases', '📂', 6, 60);
  end if;

  if not exists (select 1 from public.app_menu where route = '/finance/collection-actions') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('פעולות גבייה', '/finance/collection-actions', '📞', 6, 61);
  end if;

  if not exists (select 1 from public.app_menu where route = '/finance/dunning-campaigns') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('קמפיינים חוזרים', '/finance/dunning-campaigns', '📣', 6, 62);
  end if;

  if not exists (select 1 from public.app_menu where route = '/finance/reminder-schedules') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('תזכורות מתוזמנות', '/finance/reminder-schedules', '⏰', 6, 63);
  end if;

  -- ========== Budget / Cashflow / Costing ==========
  if not exists (select 1 from public.app_menu where route = '/finance/budget-entries') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('תקציב', '/finance/budget-entries', '📈', 6, 70);
  end if;

  if not exists (select 1 from public.app_menu where route = '/finance/cashflow-entries') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('תזרים מזומנים', '/finance/cashflow-entries', '💵', 6, 71);
  end if;

  if not exists (select 1 from public.app_menu where route = '/finance/costing-entries') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('תמחיר', '/finance/costing-entries', '🧮', 6, 72);
  end if;

  -- ========== FX / Consolidation / Annual ==========
  if not exists (select 1 from public.app_menu where route = '/finance/fx-rates') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('שערי חליפין', '/finance/fx-rates', '💱', 6, 80);
  end if;

  if not exists (select 1 from public.app_menu where route = '/finance/consolidation-entries') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('איחוד דוחות', '/finance/consolidation-entries', '🧷', 6, 81);
  end if;

  if not exists (select 1 from public.app_menu where route = '/finance/annual-tax-reports') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('דוחות מס שנתיים', '/finance/annual-tax-reports', '📅', 6, 82);
  end if;
end $$;

-- Reset sequence to avoid future id conflicts
select setval('app_menu_id_seq', (select max(id) from public.app_menu))
  where exists (select 1 from pg_sequences where sequencename = 'app_menu_id_seq');

select 'Migration 00052 applied — finance menu wiring (23 entries under category 6) complete' as status;
