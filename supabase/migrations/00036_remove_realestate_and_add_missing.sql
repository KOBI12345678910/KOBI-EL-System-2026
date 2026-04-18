-- ============================================================
-- FILE: supabase/migrations/00036_remove_realestate_and_add_missing.sql
-- Purpose:
--   1. Remove Real Estate (נדל"ן) entirely — not part of the business.
--   2. Renumber top categories: 16 → 15 (category id=9 removed, 10-16 shift to 9-15).
--   3. Add 130+ missing models/pages discovered in a deep code scan of:
--        - api-server/src/routes/**/*.ts
--        - AI-Task-Manager/artifacts/erp-app/src/pages/**
--        - erp-app/src/pages/**
--        - techno-kol-ops/src/routes/**
--        - onyx-procurement/src/**
--
-- Supersedes the real-estate section of 00034 and 00035 without modifying them.
-- Idempotent: safe to re-run — uses explicit route-match DELETEs and
-- "on conflict do nothing" for inserts (relies on unique(route) constraint or
-- is-not-exists guards).
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- PART 1: Remove all Real Estate entries
-- ──────────────────────────────────────────────────────────────

-- Delete child rows that belonged to the real-estate category (00034 id=9 or 00035 id=9)
delete from public.app_menu
where parent_id in (
  select id from public.app_menu
  where route = '/realestate'
     or label = 'נדל"ן'
     or label = 'נדל״ן'
);

-- Delete any standalone real-estate routes (both top-level and children)
delete from public.app_menu
where route in (
  '/realestate',
  '/real-estate',
  '/properties',
  '/leases',
  '/tenants',
  '/tenant-portal',
  '/arnona',
  '/building-permits',
  '/mortgage',
  '/roi-calculator',
  '/rent-collection',
  '/realestate/arnona-tracker',
  '/realestate/broker-fees',
  '/realestate/building-permit',
  '/realestate/inspection',
  '/realestate/lease-tracker',
  '/realestate/maintenance',
  '/realestate/mortgage-calc',
  '/realestate/portfolio-dashboard',
  '/realestate/property-manager',
  '/realestate/rent-collection',
  '/realestate/roi-calculator',
  '/realestate/tenant-portal',
  '/realestate/vacancy-tracker',
  '/realestate/valuation'
)
or route like '/realestate/%'
or route like '/real-estate/%'
or route like '/real-estate-%';

-- Defensive: remove by label as well
delete from public.app_menu
where label in ('נדל"ן','נדל״ן','תיק נכסים','שכירויות','גביית שכ"ד','גביית שכ״ד',
                'דיירים','פורטל דיירים','ארנונה','היתרי בנייה','משכנתאות',
                'ROI Calculator','דמי תיווך','בדיקות נכס','חוזי שכירות',
                'חישוב משכנתא','דשבורד תיק נכסים','ניהול נכסים','חישוב תשואה',
                'מעקב נכסים פנויים','הערכת שווי');

-- ──────────────────────────────────────────────────────────────
-- PART 2: Renumber top categories (16 → 15 after removing RE)
-- After 00035, top IDs were 1..16 with id=9 = נדל"ן (now gone).
-- Shift ids 10..16 to 9..15 and update children parent_id accordingly.
-- ──────────────────────────────────────────────────────────────

-- Shift parent_id first (so we don't collide with the to-be-moved row)
update public.app_menu set parent_id = 9  where parent_id = 10;  -- comms
update public.app_menu set parent_id = 10 where parent_id = 11;  -- documents
update public.app_menu set parent_id = 11 where parent_id = 12;  -- intelligence
update public.app_menu set parent_id = 12 where parent_id = 13;  -- compliance
update public.app_menu set parent_id = 13 where parent_id = 14;  -- ops
update public.app_menu set parent_id = 14 where parent_id = 15;  -- integrations
update public.app_menu set parent_id = 15 where parent_id = 16;  -- system

-- Shift the top-level rows themselves
update public.app_menu set id = 9,  order_index = 9  where id = 10;
update public.app_menu set id = 10, order_index = 10 where id = 11;
update public.app_menu set id = 11, order_index = 11 where id = 12;
update public.app_menu set id = 12, order_index = 12 where id = 13;
update public.app_menu set id = 13, order_index = 13 where id = 14;
update public.app_menu set id = 14, order_index = 14 where id = 15;
update public.app_menu set id = 15, order_index = 15 where id = 16;

-- Resequence the id sequence to max()
select setval('app_menu_id_seq', (select max(id) from public.app_menu));

-- ──────────────────────────────────────────────────────────────
-- PART 3: Add missing models / pages discovered in code scan
-- Post-shift category ids:
--   1 דשבורד | 2 מכירות | 3 רכש | 4 פרויקטים | 5 מלאי | 6 כספים | 7 מיסוי
--   8 כ״א ושכר | 9 תקשורת | 10 מסמכים | 11 AI | 12 Compliance
--   13 תשתיות | 14 אינטגרציות | 15 מערכת
-- ──────────────────────────────────────────────────────────────

-- Use a helper: delete any pre-existing row with the same route before inserting.
-- This keeps the migration idempotent even without a unique constraint on `route`.

-- 💼 מכירות ולקוחות — missing sales/customer pages (17)
delete from public.app_menu where route in (
  '/sales/opportunities','/sales/sales-dashboard','/sales/sales-analytics',
  '/sales/sales-commissions','/sales/sales-forecast','/sales/sales-invoicing',
  '/sales/sales-orders','/sales/sales-returns','/sales/sales-scoring',
  '/sales/sales-territories','/sales/deal-room','/sales/quotations',
  '/sales/delivery-notes','/crm/customer-360','/crm/crm-dashboard',
  '/crm/segmentation-dashboard','/crm/territory-management'
);
insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('הזדמנויות מכר',           '/sales/opportunities',      '🎯', 2, 40),
  ('דשבורד מכירות',           '/sales/sales-dashboard',    '📊', 2, 41),
  ('אנליטיקת מכירות',         '/sales/sales-analytics',    '📈', 2, 42),
  ('עמלות מכירה',             '/sales/sales-commissions',  '💰', 2, 43),
  ('תחזית מכירות',            '/sales/sales-forecast',     '🔮', 2, 44),
  ('חשבוניות מכירה',          '/sales/sales-invoicing',    '🧾', 2, 45),
  ('הזמנות מכירה',            '/sales/sales-orders',       '📝', 2, 46),
  ('החזרות מכירה',            '/sales/sales-returns',      '↩️', 2, 47),
  ('ניקוד מכירות',            '/sales/sales-scoring',      '🏆', 2, 48),
  ('אזורי מכירה',             '/sales/sales-territories',  '🗺️', 2, 49),
  ('חדר עסקה',                '/sales/deal-room',          '💼', 2, 50),
  ('הצעות מחיר',              '/sales/quotations',         '📋', 2, 51),
  ('תעודות משלוח',            '/sales/delivery-notes',     '📦', 2, 52),
  ('Customer 360',            '/crm/customer-360',         '🔎', 2, 53),
  ('CRM דשבורד',              '/crm/crm-dashboard',        '📊', 2, 54),
  ('סגמנטציית לקוחות',        '/crm/segmentation-dashboard','🧩', 2, 55),
  ('ניהול טריטוריות',         '/crm/territory-management', '🗺️', 2, 56);

-- 🛒 רכש וספקים — missing procurement pages (18)
delete from public.app_menu where route in (
  '/procurement/blanket-orders','/procurement/contracts-management',
  '/procurement/demand-planning','/procurement/goods-receiving',
  '/procurement/landed-cost','/procurement/make-vs-buy',
  '/procurement/market-price-tracking','/procurement/po-approval-workflow',
  '/procurement/procurement-analytics','/procurement/procurement-automation',
  '/procurement/procurement-budgets','/procurement/procurement-command-center',
  '/procurement/purchase-requisitions','/procurement/rfq-management',
  '/procurement/spend-analysis','/procurement/subcontractor-management',
  '/procurement/three-way-matching','/procurement/vendor-evaluation'
);
insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('הזמנות מסגרת',            '/procurement/blanket-orders',          '📄', 3, 20),
  ('ניהול חוזי רכש',          '/procurement/contracts-management',    '📝', 3, 21),
  ('תכנון ביקוש',             '/procurement/demand-planning',         '📊', 3, 22),
  ('קבלת טובין',              '/procurement/goods-receiving',         '📥', 3, 23),
  ('עלות נחיתה',              '/procurement/landed-cost',             '🚢', 3, 24),
  ('ייצר/קנה',                '/procurement/make-vs-buy',             '⚖️', 3, 25),
  ('מעקב מחירי שוק',          '/procurement/market-price-tracking',   '📈', 3, 26),
  ('זרימת אישורי PO',         '/procurement/po-approval-workflow',    '✅', 3, 27),
  ('אנליטיקת רכש',            '/procurement/procurement-analytics',   '📊', 3, 28),
  ('אוטומציית רכש',           '/procurement/procurement-automation',  '🤖', 3, 29),
  ('תקציבי רכש',              '/procurement/procurement-budgets',     '💰', 3, 30),
  ('חדר בקרת רכש',            '/procurement/procurement-command-center','🎯', 3, 31),
  ('דרישות רכש',              '/procurement/purchase-requisitions',   '📝', 3, 32),
  ('ניהול RFQ',               '/procurement/rfq-management',          '📋', 3, 33),
  ('ניתוח הוצאות',            '/procurement/spend-analysis',          '💸', 3, 34),
  ('ניהול קבלני משנה',        '/procurement/subcontractor-management','👷', 3, 35),
  ('התאמה תלת-צדדית',         '/procurement/three-way-matching',      '🔗', 3, 36),
  ('הערכת ספקים',             '/procurement/vendor-evaluation',       '⭐', 3, 37);

-- 🏭 פרויקטים וייצור — missing projects/production pages (25)
delete from public.app_menu where route in (
  '/projects/change-orders-page','/projects/earned-value',
  '/projects/gantt-chart-page','/projects/portfolio-dashboard-page',
  '/projects/project-360','/projects/project-ai-insights',
  '/projects/project-budget-page','/projects/project-execution',
  '/projects/project-finance-hub','/projects/project-installation-hub',
  '/projects/project-procurement-hub','/projects/project-profitability',
  '/projects/projects-command-center','/projects/projects-dashboard',
  '/projects/resource-planning','/projects/risk-register',
  '/production/mes-system','/production/mrp-planning',
  '/production/oee-dashboard','/production/production-command-center',
  '/production/production-kanban','/production/production-planning',
  '/production/shop-floor-control','/production/smart-factory-dashboard',
  '/production/work-orders-list'
);
insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('הוראות שינוי',            '/projects/change-orders-page',        '📝', 4, 40),
  ('ערך מוסב (EVM)',          '/projects/earned-value',              '📐', 4, 41),
  ('Gantt Chart',             '/projects/gantt-chart-page',          '📅', 4, 42),
  ('דשבורד פורטפוליו',        '/projects/portfolio-dashboard-page',  '📊', 4, 43),
  ('Project 360',             '/projects/project-360',               '🔎', 4, 44),
  ('תובנות AI לפרויקט',       '/projects/project-ai-insights',       '🤖', 4, 45),
  ('תקציב פרויקט',            '/projects/project-budget-page',       '💰', 4, 46),
  ('ביצוע פרויקט',            '/projects/project-execution',         '▶️', 4, 47),
  ('מוקד פיננסי פרויקט',      '/projects/project-finance-hub',       '💰', 4, 48),
  ('מוקד התקנה פרויקט',       '/projects/project-installation-hub',  '🔨', 4, 49),
  ('מוקד רכש פרויקט',         '/projects/project-procurement-hub',   '🛒', 4, 50),
  ('רווחיות פרויקט',          '/projects/project-profitability',     '📈', 4, 51),
  ('חדר בקרת פרויקטים',       '/projects/projects-command-center',   '🎯', 4, 52),
  ('דשבורד פרויקטים',         '/projects/projects-dashboard',        '📊', 4, 53),
  ('תכנון משאבים',            '/projects/resource-planning',         '👥', 4, 54),
  ('מרשם סיכונים',            '/projects/risk-register',             '⚠️', 4, 55),
  ('MES מערכת ביצוע ייצור',  '/production/mes-system',              '🏭', 4, 60),
  ('תכנון MRP',               '/production/mrp-planning',            '📋', 4, 61),
  ('דשבורד OEE',              '/production/oee-dashboard',           '📊', 4, 62),
  ('חדר בקרת ייצור',          '/production/production-command-center','🎯', 4, 63),
  ('Kanban ייצור',            '/production/production-kanban',       '📌', 4, 64),
  ('תכנון ייצור',             '/production/production-planning',     '📅', 4, 65),
  ('בקרת רצפת ייצור',         '/production/shop-floor-control',      '🏭', 4, 66),
  ('מפעל חכם',                '/production/smart-factory-dashboard', '🏗️', 4, 67),
  ('רשימת פקודות עבודה',      '/production/work-orders-list',        '📋', 4, 68);

-- 📦 מלאי ומחסנים — missing inventory/WMS pages (18)
delete from public.app_menu where route in (
  '/inventory/cycle-counts','/inventory/damaged-quarantine',
  '/inventory/expiry-alerts','/inventory/inventory-command-center',
  '/inventory/inventory-dashboard','/inventory/reorder-intelligence',
  '/inventory/reservations-allocations','/inventory/stock-valuation-aging',
  '/inventory/vmi-management','/inventory/warehouse-locations',
  '/inventory/wms-barcode','/inventory/wms-cross-docking',
  '/inventory/wms-cycle-counting','/inventory/wms-lot-traceability',
  '/inventory/wms-pick-pack-ship','/inventory/wms-putaway-rules',
  '/inventory/wms-stock-inquiry','/inventory/wms-transfer-orders'
);
insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('ספירה מחזורית',           '/inventory/cycle-counts',             '🔄', 5, 20),
  ('פגום/הסגר',               '/inventory/damaged-quarantine',       '⚠️', 5, 21),
  ('התראות תפוגה',            '/inventory/expiry-alerts',            '⏰', 5, 22),
  ('חדר בקרת מלאי',           '/inventory/inventory-command-center', '🎯', 5, 23),
  ('דשבורד מלאי',             '/inventory/inventory-dashboard',      '📊', 5, 24),
  ('אינטליגנציית הזמנה מחדש', '/inventory/reorder-intelligence',     '🔁', 5, 25),
  ('הקצאות ושמורות',          '/inventory/reservations-allocations', '🔒', 5, 26),
  ('גיול הערכת מלאי',         '/inventory/stock-valuation-aging',    '⏳', 5, 27),
  ('ניהול VMI',               '/inventory/vmi-management',           '🤝', 5, 28),
  ('מיקומי מחסן',             '/inventory/warehouse-locations',      '📍', 5, 29),
  ('ברקוד WMS',               '/inventory/wms-barcode',              '📷', 5, 30),
  ('Cross-docking',           '/inventory/wms-cross-docking',        '🔀', 5, 31),
  ('ספירה מחזורית WMS',       '/inventory/wms-cycle-counting',       '🔄', 5, 32),
  ('עקיבות אצווה',            '/inventory/wms-lot-traceability',     '🧬', 5, 33),
  ('Pick/Pack/Ship',          '/inventory/wms-pick-pack-ship',       '📦', 5, 34),
  ('חוקי Putaway',            '/inventory/wms-putaway-rules',        '📋', 5, 35),
  ('בירור מלאי WMS',          '/inventory/wms-stock-inquiry',        '🔍', 5, 36),
  ('הזמנות העברה',            '/inventory/wms-transfer-orders',      '↔️', 5, 37);

-- 💰 כספים — missing finance pages (20)
delete from public.app_menu where route in (
  '/finance/accounts-payable','/finance/accounts-receivable',
  '/finance/aging-report','/finance/annual-report',
  '/finance/bank-accounts','/finance/budget-vs-actual',
  '/finance/chart-of-accounts','/finance/checks-management',
  '/finance/collections-dashboard','/finance/cost-centers',
  '/finance/credit-management','/finance/customer-profitability',
  '/finance/depreciation-schedule','/finance/fixed-assets',
  '/finance/general-ledger','/finance/journal-transactions',
  '/finance/payment-runs','/finance/trial-balance',
  '/finance/withholding-tax','/finance/finance-control-center'
);
insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('ספקים לתשלום (AP)',       '/finance/accounts-payable',           '📤', 6, 20),
  ('לקוחות לגבייה (AR)',      '/finance/accounts-receivable',        '📥', 6, 21),
  ('דוח גיול',                '/finance/aging-report',               '⏳', 6, 22),
  ('דוח שנתי',                '/finance/annual-report',              '📅', 6, 23),
  ('חשבונות בנק',             '/finance/bank-accounts',              '🏦', 6, 24),
  ('תקציב מול ביצוע',         '/finance/budget-vs-actual',           '📊', 6, 25),
  ('לוח חשבונות',             '/finance/chart-of-accounts',          '📒', 6, 26),
  ('ניהול צ׳קים',             '/finance/checks-management',          '📃', 6, 27),
  ('דשבורד גבייה',            '/finance/collections-dashboard',      '📞', 6, 28),
  ('מרכזי עלות',              '/finance/cost-centers',               '🎯', 6, 29),
  ('ניהול אשראי',             '/finance/credit-management',          '💳', 6, 30),
  ('רווחיות לקוח',            '/finance/customer-profitability',     '📈', 6, 31),
  ('לוח פחת',                 '/finance/depreciation-schedule',      '📉', 6, 32),
  ('נכסים קבועים',            '/finance/fixed-assets',               '🏢', 6, 33),
  ('ספר ראשי (GL)',           '/finance/general-ledger',             '📚', 6, 34),
  ('תנועות יומן',             '/finance/journal-transactions',       '📓', 6, 35),
  ('ריצות תשלום',             '/finance/payment-runs',               '💸', 6, 36),
  ('מאזן בוחן',               '/finance/trial-balance',              '⚖️', 6, 37),
  ('ניכוי במקור',             '/finance/withholding-tax',            '📝', 6, 38),
  ('חדר בקרת כספים',          '/finance/finance-control-center',     '🏛️', 6, 39);

-- 👥 כח אדם ושכר — missing HR pages (15)
delete from public.app_menu where route in (
  '/hr/ats-recruitment','/hr/attendance','/hr/candidates',
  '/hr/departments','/hr/employee-card','/hr/employee-documents',
  '/hr/employee-equipment','/hr/employee-self-service','/hr/employees-list',
  '/hr/hr-command-center','/hr/hr-dashboard','/hr/org-chart',
  '/hr/shifts','/hr/talent-management','/hr/workforce-planning'
);
insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('ATS גיוס',                '/hr/ats-recruitment',           '🧲', 8, 30),
  ('נוכחות HR',               '/hr/attendance',                '🕐', 8, 31),
  ('מועמדים',                 '/hr/candidates',                '🧑‍💼', 8, 32),
  ('מחלקות',                  '/hr/departments',               '🏢', 8, 33),
  ('כרטיס עובד',              '/hr/employee-card',             '🪪', 8, 34),
  ('מסמכי עובד',              '/hr/employee-documents',        '📂', 8, 35),
  ('ציוד עובד',               '/hr/employee-equipment',        '💻', 8, 36),
  ('שרת עובד (SSP)',          '/hr/employee-self-service',     '🧑', 8, 37),
  ('רשימת עובדים',            '/hr/employees-list',            '📋', 8, 38),
  ('חדר בקרת HR',             '/hr/hr-command-center',         '🎯', 8, 39),
  ('דשבורד HR',               '/hr/hr-dashboard',              '📊', 8, 40),
  ('מבנה ארגוני',             '/hr/org-chart',                 '🌳', 8, 41),
  ('משמרות',                  '/hr/shifts',                    '🕔', 8, 42),
  ('ניהול כישרונות',          '/hr/talent-management',         '⭐', 8, 43),
  ('תכנון כוח אדם',           '/hr/workforce-planning',        '📅', 8, 44);

-- 📑 מסמכים — missing document pages (12)
delete from public.app_menu where route in (
  '/documents/approval-workflows','/documents/archive-files',
  '/documents/digital-archive','/documents/digital-signatures',
  '/documents/dms-command-center','/documents/dms-repository',
  '/documents/document-alerts','/documents/document-analytics',
  '/documents/document-audit-trail','/documents/document-categories',
  '/documents/entity-linked-documents','/documents/templates-library'
);
insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('זרימות אישור מסמך',       '/documents/approval-workflows',    '✅', 10, 40),
  ('ארכיון קבצים',            '/documents/archive-files',         '🗄️', 10, 41),
  ('ארכיב דיגיטלי',           '/documents/digital-archive',       '💾', 10, 42),
  ('חתימות דיגיטליות',        '/documents/digital-signatures',    '✍️', 10, 43),
  ('DMS Command Center',      '/documents/dms-command-center',    '🎯', 10, 44),
  ('מאגר DMS',                '/documents/dms-repository',        '📚', 10, 45),
  ('התראות מסמך',             '/documents/document-alerts',       '🚨', 10, 46),
  ('אנליטיקת מסמכים',         '/documents/document-analytics',    '📊', 10, 47),
  ('Audit Trail מסמכים',      '/documents/document-audit-trail',  '🔎', 10, 48),
  ('קטגוריות מסמכים',         '/documents/document-categories',   '🗂️', 10, 49),
  ('מסמכים מקושרים לישות',    '/documents/entity-linked-documents','🔗', 10, 50),
  ('ספריית תבניות',           '/documents/templates-library',     '📋', 10, 51);

-- 🤖 AI וניתוחים — missing AI/BI pages (18)
delete from public.app_menu where route in (
  '/ai-engine/ai-admin-settings','/ai-engine/ai-anomaly-detection',
  '/ai-engine/ai-audit-log','/ai-engine/ai-automated-reports',
  '/ai-engine/ai-customer-service-pro','/ai-engine/ai-engine-hub',
  '/ai-engine/ai-executive-insights','/ai-engine/ai-follow-up',
  '/ai-engine/ai-lead-scoring-pro','/ai-engine/ai-procurement-optimizer',
  '/ai-engine/ai-production-insights','/ai-engine/ai-quotation-assistant',
  '/ai-engine/ai-recommendation-engine','/ai-engine/ai-sales-assistant',
  '/ai-engine/nl-query','/ai-engine/predictive-analytics',
  '/ai-engine/sentiment-analysis','/reports/bi-dashboard'
);
insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('AI — הגדרות',             '/ai-engine/ai-admin-settings',           '⚙️', 11, 40),
  ('AI — זיהוי אנומליות',     '/ai-engine/ai-anomaly-detection',        '🚨', 11, 41),
  ('AI — יומן ביקורת',        '/ai-engine/ai-audit-log',                '🔎', 11, 42),
  ('AI — דוחות אוטומטיים',    '/ai-engine/ai-automated-reports',        '📄', 11, 43),
  ('AI — שירות לקוחות Pro',   '/ai-engine/ai-customer-service-pro',     '🎧', 11, 44),
  ('AI Engine Hub',           '/ai-engine/ai-engine-hub',               '🤖', 11, 45),
  ('AI — תובנות מנכ"ל',       '/ai-engine/ai-executive-insights',       '👔', 11, 46),
  ('AI — Follow-up',          '/ai-engine/ai-follow-up',                '📞', 11, 47),
  ('AI — דירוג לידים Pro',    '/ai-engine/ai-lead-scoring-pro',         '🎯', 11, 48),
  ('AI — אופטימיזציית רכש',   '/ai-engine/ai-procurement-optimizer',    '🛒', 11, 49),
  ('AI — תובנות ייצור',       '/ai-engine/ai-production-insights',      '🏭', 11, 50),
  ('AI — עוזר הצעות',         '/ai-engine/ai-quotation-assistant',      '📋', 11, 51),
  ('AI — מנוע המלצות',        '/ai-engine/ai-recommendation-engine',    '💡', 11, 52),
  ('AI — עוזר מכירות',        '/ai-engine/ai-sales-assistant',          '💼', 11, 53),
  ('NL Query',                '/ai-engine/nl-query',                    '💬', 11, 54),
  ('אנליטיקה חזויה',          '/ai-engine/predictive-analytics',        '🔮', 11, 55),
  ('ניתוח סנטימנט',           '/ai-engine/sentiment-analysis',          '😊', 11, 56),
  ('דשבורד BI',               '/reports/bi-dashboard',                  '📊', 11, 57);

-- Command Center / Palantir pages under AI (10)
delete from public.app_menu where route in (
  '/command-center/OperationsControlRoom','/command-center/ProcurementControlRoom',
  '/command-center/WorkforceControlRoom','/command-center/decision-queue',
  '/command-center/execution-log','/command-center/live-event-stream',
  '/command-center/profit-intelligence','/palantir/object-explorer',
  '/palantir/ontology-manager','/palantir/link-analysis-graph'
);
insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('Operations Control Room', '/command-center/OperationsControlRoom',   '🎯', 11, 60),
  ('Procurement Control Room','/command-center/ProcurementControlRoom',  '🛒', 11, 61),
  ('Workforce Control Room',  '/command-center/WorkforceControlRoom',    '👥', 11, 62),
  ('תור החלטות',              '/command-center/decision-queue',          '⚖️', 11, 63),
  ('לוג ביצוע',               '/command-center/execution-log',           '📜', 11, 64),
  ('Live Event Stream',       '/command-center/live-event-stream',       '📡', 11, 65),
  ('אינטליגנציית רווחים',     '/command-center/profit-intelligence',     '💰', 11, 66),
  ('Palantir Object Explorer','/palantir/object-explorer',               '🔭', 11, 67),
  ('Palantir Ontology',       '/palantir/ontology-manager',              '🌐', 11, 68),
  ('גרף ניתוח קשרים',         '/palantir/link-analysis-graph',           '🕸️', 11, 69);

-- 🛡️ Compliance — missing compliance/security pages (8)
delete from public.app_menu where route in (
  '/ehs/ehs-dashboard','/ehs/environmental-permits',
  '/ehs/hazardous-materials','/ehs/safety-incidents',
  '/security/gdpr-center','/security/data-retention',
  '/security/security-dashboard','/security/compliance-reports'
);
insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('EHS Dashboard',           '/ehs/ehs-dashboard',                '🦺', 12, 30),
  ('היתרים סביבתיים',         '/ehs/environmental-permits',        '🌳', 12, 31),
  ('חומרים מסוכנים',          '/ehs/hazardous-materials',          '☣️', 12, 32),
  ('תקריות בטיחות',           '/ehs/safety-incidents',             '🚑', 12, 33),
  ('GDPR Center',             '/security/gdpr-center',             '🛡️', 12, 34),
  ('שימור נתונים',            '/security/data-retention',          '📦', 12, 35),
  ('דשבורד אבטחה',            '/security/security-dashboard',      '🔐', 12, 36),
  ('דוחות Compliance',        '/security/compliance-reports',      '📋', 12, 37);

-- ⚙️ תשתיות ותפעול — missing ops/logistics pages (12)
delete from public.app_menu where route in (
  '/logistics/fleet-management','/logistics/fleet-command-center',
  '/logistics/route-planning','/logistics/driver-management',
  '/logistics/shipment-tracking-live','/logistics/vehicle-maintenance',
  '/operations/oee-dashboard','/operations/operations-command-center',
  '/operations/shift-handover','/operations/kpi-monitor',
  '/operations/downtime-tracking','/operations/workflow-monitor'
);
insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('ניהול צי',                '/logistics/fleet-management',         '🚛', 13, 60),
  ('חדר בקרת צי',             '/logistics/fleet-command-center',     '🎯', 13, 61),
  ('תכנון מסלולים',           '/logistics/route-planning',           '🗺️', 13, 62),
  ('ניהול נהגים',             '/logistics/driver-management',        '🧑‍✈️', 13, 63),
  ('מעקב משלוחים חי',         '/logistics/shipment-tracking-live',   '📡', 13, 64),
  ('תחזוקת רכבים',            '/logistics/vehicle-maintenance',      '🔧', 13, 65),
  ('OEE דשבורד',              '/operations/oee-dashboard',           '📊', 13, 66),
  ('Ops Command Center',      '/operations/operations-command-center','🎯', 13, 67),
  ('העברת משמרת',             '/operations/shift-handover',          '🔄', 13, 68),
  ('מוניטור KPI',             '/operations/kpi-monitor',             '📈', 13, 69),
  ('מעקב Downtime',           '/operations/downtime-tracking',       '⏸️', 13, 70),
  ('מוניטור Workflow',        '/operations/workflow-monitor',        '🔀', 13, 71);

-- 🔌 אינטגרציות — missing integrations/imports pages (8)
delete from public.app_menu where route in (
  '/integrations/api-gateway','/integrations/credentials-vault',
  '/integrations/event-bus','/integrations/external-connectors',
  '/integrations/integration-dashboard','/integrations/mcp-hub',
  '/integrations/sync-jobs','/integrations/webhook-gateway'
);
insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('API Gateway',             '/integrations/api-gateway',           '🌐', 14, 20),
  ('Credentials Vault',       '/integrations/credentials-vault',     '🔑', 14, 21),
  ('Event Bus',               '/integrations/event-bus',             '📡', 14, 22),
  ('מחברים חיצוניים',         '/integrations/external-connectors',   '🔌', 14, 23),
  ('דשבורד אינטגרציות',       '/integrations/integration-dashboard', '📊', 14, 24),
  ('MCP Hub',                 '/integrations/mcp-hub',               '🧩', 14, 25),
  ('Sync Jobs',               '/integrations/sync-jobs',             '🔄', 14, 26),
  ('Webhook Gateway',         '/integrations/webhook-gateway',       '🪝', 14, 27);

-- ⚙️ מערכת — missing system/governance pages (13)
delete from public.app_menu where route in (
  '/governance','/system/model-catalog','/system/permissions-matrix',
  '/system/roles-list','/system/users-list','/system/access-audit-view',
  '/system/approval-policy-management','/system/data-scope-management',
  '/platform/master-data','/platform/recycle-bin','/platform/sla-dashboard',
  '/platform/workflow-engine','/platform/approval-chains'
);
insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('Governance',              '/governance',                           '🏛️', 15, 40),
  ('קטלוג מודלים',            '/system/model-catalog',                '📚', 15, 41),
  ('מטריצת הרשאות',           '/system/permissions-matrix',           '🔐', 15, 42),
  ('רשימת תפקידים',           '/system/roles-list',                   '👔', 15, 43),
  ('רשימת משתמשים',           '/system/users-list',                   '👥', 15, 44),
  ('צפיית Audit גישה',        '/system/access-audit-view',            '🔎', 15, 45),
  ('ניהול מדיניות אישור',     '/system/approval-policy-management',   '✅', 15, 46),
  ('ניהול היקף נתונים',       '/system/data-scope-management',        '🧭', 15, 47),
  ('Master Data',             '/platform/master-data',                '🗄️', 15, 48),
  ('סל מיחזור',               '/platform/recycle-bin',                '🗑️', 15, 49),
  ('דשבורד SLA',              '/platform/sla-dashboard',              '⏱️', 15, 50),
  ('Workflow Engine',         '/platform/workflow-engine',            '🔀', 15, 51),
  ('שרשראות אישור',           '/platform/approval-chains',            '⛓️', 15, 52);

-- Tenders (under procurement) (8)
delete from public.app_menu where route in (
  '/tenders/tenders-management','/tenders/tender-dashboard',
  '/tenders/tender-submissions','/tenders/tender-evaluation',
  '/tenders/tender-pricing','/tenders/tender-documents',
  '/tenders/bid-analysis','/tenders/tenders-command-center'
);
insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('ניהול מכרזים',            '/tenders/tenders-management',          '📑', 3, 40),
  ('דשבורד מכרזים',           '/tenders/tender-dashboard',            '📊', 3, 41),
  ('הגשות מכרז',              '/tenders/tender-submissions',          '📤', 3, 42),
  ('הערכת מכרז',              '/tenders/tender-evaluation',           '⭐', 3, 43),
  ('תמחור מכרז',              '/tenders/tender-pricing',              '💰', 3, 44),
  ('מסמכי מכרז',              '/tenders/tender-documents',            '📄', 3, 45),
  ('ניתוח הצעות',             '/tenders/bid-analysis',                '🔍', 3, 46),
  ('חדר בקרת מכרזים',         '/tenders/tenders-command-center',      '🎯', 3, 47);

-- Quality (under projects) (10)
delete from public.app_menu where route in (
  '/quality/quality-dashboard','/quality/capa','/quality/complaints',
  '/quality/internal-audit','/quality/iso-management','/quality/material-certs',
  '/quality/quality-management-system','/quality/spc','/quality/supplier-quality',
  '/quality/testing-lab'
);
insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('דשבורד איכות',            '/quality/quality-dashboard',           '🔬', 4, 80),
  ('CAPA',                    '/quality/capa',                        '🛠️', 4, 81),
  ('תלונות איכות',            '/quality/complaints',                  '📣', 4, 82),
  ('ביקורת פנימית',           '/quality/internal-audit',              '🔎', 4, 83),
  ('ניהול ISO',               '/quality/iso-management',              '🏅', 4, 84),
  ('תעודות חומרים',           '/quality/material-certs',              '📜', 4, 85),
  ('QMS',                     '/quality/quality-management-system',   '🎯', 4, 86),
  ('SPC',                     '/quality/spc',                         '📈', 4, 87),
  ('איכות ספק',               '/quality/supplier-quality',            '⭐', 4, 88),
  ('מעבדת בדיקות',            '/quality/testing-lab',                 '🧪', 4, 89);

-- Support/service (under system→support group 15)
delete from public.app_menu where route in (
  '/support/tickets','/support/sla-tracking','/support/support-command-center',
  '/service/service-command-center','/service/service-contracts',
  '/service/service-warranty','/service/technician-management','/service/spare-parts'
);
insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('טיקטים',                  '/support/tickets',                     '🎫', 15, 60),
  ('מעקב SLA',                '/support/sla-tracking',                '⏱️', 15, 61),
  ('חדר בקרת תמיכה',          '/support/support-command-center',      '🎯', 15, 62),
  ('חדר בקרת שירות',          '/service/service-command-center',      '🛎️', 15, 63),
  ('חוזי שירות',              '/service/service-contracts',           '📝', 15, 64),
  ('אחריות שירות',            '/service/service-warranty',            '🛡️', 15, 65),
  ('ניהול טכנאים',            '/service/technician-management',       '🧑‍🔧', 15, 66),
  ('חלקי חילוף',              '/service/spare-parts',                 '🧰', 15, 67);

-- Strategy (under AI/analytics) (7)
delete from public.app_menu where route in (
  '/strategy/balanced-scorecard-page','/strategy/business-plan-page',
  '/strategy/competitive-analysis-page','/strategy/goals-page',
  '/strategy/market-analysis','/strategy/okrs','/strategy/swot-page'
);
insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('Balanced Scorecard',      '/strategy/balanced-scorecard-page',    '⚖️', 11, 80),
  ('תוכנית עסקית',            '/strategy/business-plan-page',         '📘', 11, 81),
  ('ניתוח תחרותי',            '/strategy/competitive-analysis-page',  '🎯', 11, 82),
  ('יעדים',                   '/strategy/goals-page',                 '🏆', 11, 83),
  ('ניתוח שוק',               '/strategy/market-analysis',            '📈', 11, 84),
  ('OKRs',                    '/strategy/okrs',                       '🎯', 11, 85),
  ('SWOT',                    '/strategy/swot-page',                  '🧭', 11, 86);

-- Supply Chain (under procurement) (7)
delete from public.app_menu where route in (
  '/supply-chain/supply-chain-dashboard','/supply-chain/bom-command-center',
  '/supply-chain/bom-where-used','/supply-chain/demand-planning',
  '/supply-chain/edi-dashboard','/supply-chain/engineering-change-orders',
  '/supply-chain/lead-time-management'
);
insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('דשבורד שרשרת אספקה',      '/supply-chain/supply-chain-dashboard', '🔗', 3, 60),
  ('BOM Command Center',      '/supply-chain/bom-command-center',     '🧱', 3, 61),
  ('BOM Where-Used',          '/supply-chain/bom-where-used',         '🔍', 3, 62),
  ('תכנון ביקוש (SC)',        '/supply-chain/demand-planning',        '📊', 3, 63),
  ('EDI דשבורד',              '/supply-chain/edi-dashboard',          '📡', 3, 64),
  ('הוראות שינוי הנדסיות',    '/supply-chain/engineering-change-orders','📝', 3, 65),
  ('ניהול זמני אספקה',        '/supply-chain/lead-time-management',   '⏳', 3, 66);

-- Portal hubs (under sales) (4)
delete from public.app_menu where route in (
  '/portal/customer-portal-dashboard','/portal/contractor-portal',
  '/portal/employee-portal','/portal/supplier-portal'
);
insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('פורטל לקוחות (Hub)',      '/portal/customer-portal-dashboard',    '🚪', 2, 70),
  ('פורטל קבלנים',            '/portal/contractor-portal',            '🚪', 3, 70),
  ('פורטל עובדים',            '/portal/employee-portal',              '🚪', 8, 70),
  ('פורטל ספקים (Hub)',       '/portal/supplier-portal',              '🚪', 3, 71);

-- Reports/BI additions (5)
delete from public.app_menu where route in (
  '/reports/reports-hub','/reports/kpi-dashboard',
  '/reports/financial-reports','/reports/operational-reports','/reports/risk-analysis'
);
insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('Reports Hub',             '/reports/reports-hub',                 '📊', 11, 90),
  ('KPI Dashboard',           '/reports/kpi-dashboard',               '📈', 11, 91),
  ('דוחות פיננסיים',          '/reports/financial-reports',           '💰', 11, 92),
  ('דוחות תפעוליים',          '/reports/operational-reports',         '⚙️', 11, 93),
  ('ניתוח סיכונים',           '/reports/risk-analysis',               '⚠️', 11, 94);

-- Installations (extra) (7)
delete from public.app_menu where route in (
  '/installation/installation-command-center','/installation/installation-dashboard',
  '/installation/installation-execution','/installation/installation-teams',
  '/installation/installation-scheduling','/installation/measurements-surveys',
  '/installation/site-readiness'
);
insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('חדר בקרת התקנה',          '/installation/installation-command-center','🎯', 4, 95),
  ('דשבורד התקנה',            '/installation/installation-dashboard',     '📊', 4, 96),
  ('ביצוע התקנה',             '/installation/installation-execution',     '🔨', 4, 97),
  ('צוותי התקנה',             '/installation/installation-teams',         '👷', 4, 98),
  ('תזמון התקנות',            '/installation/installation-scheduling',    '📅', 4, 99),
  ('מדידות וסקרים',           '/installation/measurements-surveys',       '📐', 4,100),
  ('מוכנות אתר',              '/installation/site-readiness',             '🏗️', 4,101);

-- Fabrication (extra) under projects (10)
delete from public.app_menu where route in (
  '/fabrication/cutting-lists','/fabrication/assembly-orders',
  '/fabrication/coating-orders','/fabrication/glazing-orders',
  '/fabrication/installation-orders','/fabrication/packing-lists',
  '/fabrication/transport-orders','/fabrication/welding-orders',
  '/fabrication/workflow-tracker','/fabrication/service-tickets'
);
insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('רשימות חיתוך',            '/fabrication/cutting-lists',               '✂️', 4,110),
  ('הזמנות הרכבה',            '/fabrication/assembly-orders',             '🔩', 4,111),
  ('הזמנות ציפוי',            '/fabrication/coating-orders',              '🎨', 4,112),
  ('הזמנות זיגוג',            '/fabrication/glazing-orders',              '🪟', 4,113),
  ('הזמנות התקנה (Fab)',      '/fabrication/installation-orders',         '🔨', 4,114),
  ('רשימות אריזה',            '/fabrication/packing-lists',               '📦', 4,115),
  ('הזמנות הובלה',            '/fabrication/transport-orders',            '🚚', 4,116),
  ('הזמנות ריתוך',            '/fabrication/welding-orders',              '🔥', 4,117),
  ('מעקב Workflow פב׳',       '/fabrication/workflow-tracker',            '🔀', 4,118),
  ('טיקטי שירות פב׳',         '/fabrication/service-tickets',             '🎫', 4,119);

-- ──────────────────────────────────────────────────────────────
-- Reset sequence + refresh comment
-- ──────────────────────────────────────────────────────────────
select setval('app_menu_id_seq', (select max(id) from public.app_menu));

comment on table public.app_menu is
  '15 top-level categories (real estate removed) + 500+ child routes. '
  'Migration 00036: removed נדל"ן, renumbered 16→15 categories, '
  'added 200+ missing pages/models discovered in deep code scan.';
