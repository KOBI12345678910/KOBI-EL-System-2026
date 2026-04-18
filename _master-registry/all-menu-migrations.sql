-- Concatenated menu wirings

-- ==== 00046_execution_menu_wiring.sql ====
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


-- ==== 00048_procurement_menu_wiring.sql ====
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


-- ==== 00050_inventory_menu_wiring.sql ====
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


-- ==== 00052_finance_menu_wiring.sql ====
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


-- ==== 00054_workforce_menu_wiring.sql ====
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


-- ==== 00056_docs_menu_wiring.sql ====
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


-- ==== 00058_intelligence_menu_wiring.sql ====
-- ============================================================
-- FILE: supabase/migrations/00058_intelligence_menu_wiring.sql
-- TECHNO-KOL UZI ERP 2026 — Intelligence Menu Wiring
-- Created: 2026-04-18
-- Purpose:
--   Idempotently insert menu entries for the intelligence domain
--   under the "בינה מלאכותית" ("AI / Intelligence") category.
--   Every INSERT is guarded so re-running is a no-op. No DELETEs.
-- ============================================================

do $$
declare
  v_parent_id bigint;
begin
  -- Locate or create the "בינה מלאכותית" category at top level
  select id into v_parent_id
    from public.app_menu
   where label in ('בינה מלאכותית','AI / Intelligence','AI / אינטליג׳נס')
     and (parent_id is null or parent_id = 0)
   limit 1;

  if v_parent_id is null then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('בינה מלאכותית', null, '🧠', null, 70)
    returning id into v_parent_id;
  end if;

  -- ---------- AI Insights ----------
  if not exists (select 1 from public.app_menu where route = '/ai-insights') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('תובנות AI', '/ai-insights', '💡', v_parent_id, 10);
  end if;

  -- ---------- Anomalies ----------
  if not exists (select 1 from public.app_menu where route = '/anomalies') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('אנומליות', '/anomalies', '⚠️', v_parent_id, 20);
  end if;

  -- ---------- Recommendations ----------
  if not exists (select 1 from public.app_menu where route = '/recommendations') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('מרכז המלצות', '/recommendations', '🎯', v_parent_id, 30);
  end if;

  -- ---------- Forecast Models ----------
  if not exists (select 1 from public.app_menu where route = '/forecast-models') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('מודלי תחזיות', '/forecast-models', '📈', v_parent_id, 40);
  end if;

  -- ---------- Agents ----------
  if not exists (select 1 from public.app_menu where route = '/agents') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('רישום סוכנים', '/agents', '🤖', v_parent_id, 50);
  end if;

  -- ---------- Agent Jobs ----------
  if not exists (select 1 from public.app_menu where route = '/agent-jobs') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('משימות סוכנים', '/agent-jobs', '📋', v_parent_id, 51);
  end if;

  -- ---------- Executive War Room ----------
  if not exists (select 1 from public.app_menu where route = '/executive-war-room') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('חדר מלחמה', '/executive-war-room', '🎖️', v_parent_id, 60);
  end if;

  -- ---------- Predictive Analytics ----------
  if not exists (select 1 from public.app_menu where route = '/predictive-analytics') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('אנליטיקה חזויה', '/predictive-analytics', '🔮', v_parent_id, 70);
  end if;

  -- ---------- Process Mining ----------
  if not exists (select 1 from public.app_menu where route = '/process-mining') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('חציבת תהליכים', '/process-mining', '⛏️', v_parent_id, 80);
  end if;

  -- ---------- Prompt Templates ----------
  if not exists (select 1 from public.app_menu where route = '/prompt-templates') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('תבניות פרומפטים', '/prompt-templates', '📝', v_parent_id, 90);
  end if;

  -- ---------- Orchestration Flows ----------
  if not exists (select 1 from public.app_menu where route = '/orchestration-flows') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('תזמורת זרימות', '/orchestration-flows', '🎼', v_parent_id, 100);
  end if;
end $$;

-- Reset sequence to avoid future id conflicts
select setval('app_menu_id_seq', (select max(id) from public.app_menu))
  where exists (select 1 from pg_sequences where sequencename = 'app_menu_id_seq');

select 'Migration 00058 applied — intelligence menu wiring (11 entries) complete' as status;


-- ==== 00060_governance_menu_wiring.sql ====
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


-- ==== 00062_analytics_menu_wiring.sql ====
-- ============================================================
-- FILE: supabase/migrations/00062_analytics_menu_wiring.sql
-- TECHNO-KOL UZI ERP 2026 — Analytics Menu Wiring
-- Created: 2026-04-18
-- Purpose:
--   Idempotently insert analytics menu entries under "דשבורד"
--   (Dashboards / Analytics) category. Every INSERT is guarded
--   so re-running is a no-op. No DELETEs.
-- ============================================================

do $$
declare
  v_parent_id bigint;
begin
  -- Locate or create the "דשבורד" category at top level
  select id into v_parent_id
    from public.app_menu
   where label in ('דשבורד','דשבורדים','Analytics / דשבורד')
     and (parent_id is null or parent_id = 0)
   limit 1;

  if v_parent_id is null then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('דשבורד', null, '📊', null, 75)
    returning id into v_parent_id;
  end if;

  -- ---------- Dashboards ----------
  if not exists (select 1 from public.app_menu where route = '/dashboards') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('דשבורדים', '/dashboards', '📊', v_parent_id, 10);
  end if;

  -- Note: /dashboards/:id is a dynamic detail route, not a static menu entry.
  -- We register a canonical placeholder so the route is discoverable.
  if not exists (select 1 from public.app_menu where route = '/dashboards/:id') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('צפיה בדשבורד', '/dashboards/:id', '📈', v_parent_id, 11);
  end if;

  -- ---------- Reports ----------
  if not exists (select 1 from public.app_menu where route = '/reports') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('דוחות', '/reports', '📑', v_parent_id, 20);
  end if;

  if not exists (select 1 from public.app_menu where route = '/reports/:id') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('צפיה בדוח', '/reports/:id', '📄', v_parent_id, 21);
  end if;

  -- ---------- KPI ----------
  if not exists (select 1 from public.app_menu where route = '/kpi-definitions') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('הגדרות KPI', '/kpi-definitions', '🎯', v_parent_id, 30);
  end if;

  if not exists (select 1 from public.app_menu where route = '/kpi-snapshots') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('סנאפשוטים של KPI', '/kpi-snapshots', '📸', v_parent_id, 31);
  end if;

  -- ---------- Drilldown ----------
  if not exists (select 1 from public.app_menu where route = '/drilldown-paths') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('מסלולי Drilldown', '/drilldown-paths', '🧭', v_parent_id, 40);
  end if;

  -- ---------- Read-model invalidations ----------
  if not exists (select 1 from public.app_menu where route = '/read-model-invalidations') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('חידוש מודל קריאה', '/read-model-invalidations', '♻️', v_parent_id, 50);
  end if;

  -- ---------- Custom metrics ----------
  if not exists (select 1 from public.app_menu where route = '/custom-metrics') then
    insert into public.app_menu (label, route, icon, parent_id, order_index)
    values ('מדדים מותאמים', '/custom-metrics', '📐', v_parent_id, 60);
  end if;
end$$;

-- ==============================================================
-- END 00062_analytics_menu_wiring.sql
-- ==============================================================


-- ==== 00064_orchestration_menu_wiring.sql ====
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


-- ==== 00066_comms_menu_wiring.sql ====
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

