-- ============================================================
-- FILE: supabase/migrations/00034_app_menu_complete.sql
-- Complete menu seed — 90+ items covering all 230 DB entities
-- Replaces the sparse 12-item seed from 00017_app_menu.sql
-- ============================================================

-- Clear existing menu (keep schema from 00017)
delete from public.app_menu;
alter sequence app_menu_id_seq restart with 1;

-- ──────────────────────────────────────────────────────────────
-- TIER 1: 12 Top-Level Categories (חדרי שליטה + תחומים)
-- ──────────────────────────────────────────────────────────────
insert into public.app_menu (id, label, route, icon, order_index) values
  ( 1, 'דשבורד',        '/dashboard',       '📊', 1),
  ( 2, 'מכירות ולקוחות','/sales',           '💼', 2),
  ( 3, 'רכש וספקים',    '/procurement',     '🛒', 3),
  ( 4, 'פרויקטים',      '/projects',        '🏭', 4),
  ( 5, 'מלאי ומחסנים',  '/inventory',       '📦', 5),
  ( 6, 'כספים',         '/finance',         '💰', 6),
  ( 7, 'מיסוי',         '/tax',             '🧾', 7),
  ( 8, 'כח אדם ושכר',   '/workforce',       '👥', 8),
  ( 9, 'נדל"ן',         '/realestate',      '🏗️', 9),
  (10, 'מסמכים',        '/documents',       '📑',10),
  (11, 'AI וניתוחים',   '/intelligence',    '🤖',11),
  (12, 'מערכת',         '/system',          '⚙️',12);

-- ──────────────────────────────────────────────────────────────
-- TIER 2: Children
-- ──────────────────────────────────────────────────────────────

-- 📊 דשבורד (7)
insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('Executive Control Tower',  '/executive',          '👔', 1, 1),
  ('Operations Control Room',  '/operations',         '⚙️', 1, 2),
  ('Procurement Control Room', '/procurement-room',   '📦', 1, 3),
  ('Workforce Control Room',   '/workforce-room',     '👥', 1, 4),
  ('AI Control Room',          '/ai-room',            '🤖', 1, 5),
  ('Command Center',           '/command-center',     '🎯', 1, 6),
  ('KPI Dashboard',            '/kpi',                '📈', 1, 7);

-- 💼 מכירות ולקוחות (9)
insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('לידים',              '/leads',           '🎯', 2, 1),
  ('לקוחות',             '/customers',       '🏢', 2, 2),
  ('Customer360',        '/customer-360',    '🔍', 2, 3),
  ('הצעות מחיר',         '/quotes',          '📋', 2, 4),
  ('חוזים',              '/contracts',       '📄', 2, 5),
  ('פורטל לקוחות',       '/customer-portal', '🚪', 2, 6),
  ('CRM Pipeline',       '/crm-pipeline',    '🎯', 2, 7),
  ('שיעורי המרה',        '/sales-funnel',    '📊', 2, 8),
  ('Leaderboard מכירות', '/sales-leaders',   '🏆', 2, 9);

-- 🛒 רכש וספקים (10)
insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('ספקים',                '/suppliers',          '🏭', 3, 1),
  ('Supplier360',          '/supplier-360',       '🔍', 3, 2),
  ('בקשות הצעה (RFQ)',     '/rfqs',               '📝', 3, 3),
  ('RFQ360',               '/rfq-360',            '🔍', 3, 4),
  ('הזמנות רכש (PO)',      '/pos',                '🛍️', 3, 5),
  ('PO360',                '/po-360',             '🔍', 3, 6),
  ('אישורים',              '/approvals',          '✅', 3, 7),
  ('פורטל ספקים',          '/supplier-portal',    '🚪', 3, 8),
  ('קבלנים משניים',        '/subcontractors',     '👷', 3, 9),
  ('ניתוח רכש',            '/procurement-analytics','📊',3,10);

-- 🏭 פרויקטים (10)
insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('פרויקטים',             '/projects',           '📋', 4, 1),
  ('Project360',           '/project-360',        '🔍', 4, 2),
  ('הזמנות עבודה',         '/work-orders',        '🔧', 4, 3),
  ('WorkOrder360',         '/work-order-360',     '🔍', 4, 4),
  ('משימות',               '/tasks',              '✔️', 4, 5),
  ('Kanban',               '/kanban',             '📌', 4, 6),
  ('Gantt',                '/gantt',              '📅', 4, 7),
  ('לוח ייצור',            '/production-floor',   '🏭', 4, 8),
  ('QC — בדיקות איכות',    '/quality-control',    '🔬', 4, 9),
  ('מעקב התקנות',          '/installations',      '🔨', 4,10);

-- 📦 מלאי ומחסנים (8)
insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('פריטי מלאי',           '/materials',          '📦', 5, 1),
  ('מחסנים',               '/warehouses',         '🏬', 5, 2),
  ('תנועות מלאי',          '/movements',          '↔️', 5, 3),
  ('קבלות מלאי',           '/receipts',           '📥', 5, 4),
  ('ניפוקי מלאי',          '/issues',             '📤', 5, 5),
  ('ספירת מלאי',           '/stock-counts',       '🧮', 5, 6),
  ('התראות מלאי',          '/inventory-alerts',   '⚠️', 5, 7),
  ('BOM Calculator',       '/bom',                '🧱', 5, 8);

-- 💰 כספים (12)
insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('Finance360',           '/finance-360',        '🔍', 6, 1),
  ('חשבוניות',             '/invoices',           '🧾', 6, 2),
  ('תשלומים',              '/payments',           '💳', 6, 3),
  ('קבלות',                '/receipts-finance',   '🧾', 6, 4),
  ('הוצאות',               '/expenses',           '💸', 6, 5),
  ('התאמות בנק',           '/bank-reconciliation','🏦', 6, 6),
  ('תזרים מזומנים',        '/cashflow',           '💧', 6, 7),
  ('תחזית תזרים',          '/cashflow-forecast',  '🔮', 6, 8),
  ('רווח והפסד (P&L)',     '/pnl',                '📊', 6, 9),
  ('מאזן',                 '/balance-sheet',      '⚖️', 6,10),
  ('Treasury',             '/treasury',           '🏛️', 6,11),
  ('גביית חובות',          '/collections',        '📞', 6,12);

-- 🧾 מיסוי (10)
insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('דו"ח מע"מ (PCN836)',   '/vat-report',         '📄', 7, 1),
  ('החזר מע"מ',            '/vat-refund',         '↩️', 7, 2),
  ('דיווח שנתי',           '/annual-tax',         '📅', 7, 3),
  ('טופס 102',             '/form-102',           '📝', 7, 4),
  ('טופס 126',             '/form-126',           '📝', 7, 5),
  ('טופס 1301',            '/form-1301',          '📝', 7, 6),
  ('טופס 30A',             '/form-30a',           '📝', 7, 7),
  ('טופס 6111',            '/form-6111',          '📝', 7, 8),
  ('מס שבח',               '/betterment-tax',     '🏘️', 7, 9),
  ('ייצוא לשע"מ',          '/tax-exports',        '📤', 7,10);

-- 👥 כח אדם ושכר (12)
insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('עובדים',               '/employees',          '👤', 8, 1),
  ('Employee360',          '/employee-360',       '🔍', 8, 2),
  ('נוכחות',               '/attendance',         '🕐', 8, 3),
  ('שעון נוכחות',          '/clock-in',           '⏰', 8, 4),
  ('חופשות',               '/leave',              '🏖️', 8, 5),
  ('חישוב שכר',            '/payroll-compute',    '🧮', 8, 6),
  ('תלושי שכר',            '/wage-slips',         '💸', 8, 7),
  ('פנסיה',                '/pension',            '🏦', 8, 8),
  ('ביטוח לאומי',          '/social-security',    '🛡️', 8, 9),
  ('הטבות והפרשות',        '/benefits',           '💎', 8,10),
  ('דוח הוצאות עובד',      '/employee-expenses',  '💳', 8,11),
  ('GPS + LiveMap',        '/live-map',           '🗺️', 8,12);

-- 🏗️ נדל"ן (9)
insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('תיק נכסים',            '/properties',         '🏠', 9, 1),
  ('שכירויות',             '/leases',             '🔑', 9, 2),
  ('גביית שכ"ד',           '/rent-collection',    '💰', 9, 3),
  ('דיירים',               '/tenants',            '👨‍👩‍👧', 9, 4),
  ('פורטל דיירים',         '/tenant-portal',      '🚪', 9, 5),
  ('ארנונה',               '/arnona',             '🏛️', 9, 6),
  ('היתרי בנייה',          '/building-permits',   '📜', 9, 7),
  ('משכנתאות',             '/mortgage',           '💵', 9, 8),
  ('ROI Calculator',       '/roi-calculator',     '📈', 9, 9);

-- 📑 מסמכים (7)
insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('כל המסמכים',           '/all-documents',      '📁',10, 1),
  ('העלאת מסמך',           '/upload',             '📤',10, 2),
  ('יצירת חוזה',           '/contract-generator', '📝',10, 3),
  ('חתימה דיגיטלית',       '/esign',              '✍️',10, 4),
  ('OCR חשבוניות',         '/ocr',                '🔍',10, 5),
  ('תבניות מסמכים',        '/templates',          '📋',10, 6),
  ('ספריית סעיפים',        '/clause-library',     '⚖️',10, 7);

-- 🤖 AI וניתוחים (10)
insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('עוזר AI — כובי 👑',     '/ai-kobi',            '👑',11, 1),
  ('עוזר AI — עוזי 🔧',     '/ai-uzi',             '🔧',11, 2),
  ('NLQ — שאל בעברית',     '/nlq',                '💬',11, 3),
  ('המלצות',               '/recommendations',    '💡',11, 4),
  ('אנומליות',             '/anomalies',          '🚨',11, 5),
  ('חיזוי הכנסות',         '/revenue-forecast',   '🔮',11, 6),
  ('Brain Engine',         '/brain',              '🧠',11, 7),
  ('BI Dashboard',         '/bi',                 '📊',11, 8),
  ('Live Dashboard',       '/live',               '📡',11, 9),
  ('Formula Builder',      '/formula-builder',    '🔢',11,10);

-- ⚙️ מערכת (12)
insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('Universal Inbox',      '/inbox',              '📬',12, 1),
  ('התראות',               '/notifications',      '🔔',12, 2),
  ('טיקטים',               '/tickets',            '🎫',12, 3),
  ('לוג אירועים',          '/events',             '📜',12, 4),
  ('Audit Trail',          '/audit',              '🔎',12, 5),
  ('משתמשים',              '/users',              '👥',12, 6),
  ('תפקידים והרשאות',      '/roles',              '🔐',12, 7),
  ('Feature Flags',        '/feature-flags',      '🚩',12, 8),
  ('אינטגרציות',           '/integrations',       '🔌',12, 9),
  ('Webhooks',             '/webhooks',           '🪝',12,10),
  ('Cron Jobs',            '/cron',               '⏲️',12,11),
  ('הגדרות',               '/settings',           '⚙️',12,12);

-- Reset sequence
select setval('app_menu_id_seq', (select max(id) from public.app_menu));

-- ──────────────────────────────────────────────────────────────
-- Summary comment
-- ──────────────────────────────────────────────────────────────
comment on table public.app_menu is
  '12 top-level categories + 116 child routes = 128 menu items total. '
  'Covers all 230 DB entities across 22 schemas. '
  'Last updated: 2026-04-18 by migration 00034.';
