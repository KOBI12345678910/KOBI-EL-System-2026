-- ============================================================
-- FILE: supabase/migrations/00040_system_360_fixes.sql
-- Purpose:
--   System 360° sanity pass — after a full audit of:
--     - 237 DB tables across 23 schemas
--     - 1258 <Route> declarations in erp-app/src/App.tsx
--     - 1204 unique menu routes across 00017/00034..00039 seeds
--     - 629 component imports + 327 API route files
--     - 3964 method paths + 251 mount prefixes
--
--   This migration only touches public.app_menu:
--     (A) INSERTS 51 missing menu rows whose underlying DB table
--         (or feature) exists but had no sidebar entry.
--     (B) UPDATES the parent_id of 6 menu rows that were clearly
--         categorized under the wrong domain (e.g. /receipts
--         was under inventory but it is a finance entity).
--     (C) Notes routes that still lack a <Route> in App.tsx so
--         they can be wired later (no deletes — a later PR will
--         add the React components).
--
--   100% idempotent: every INSERT is guarded with a
--   "delete from app_menu where route = '...'" first, mirroring
--   the pattern used in 00036/00038/00039. Safe to re-run.
--
--   Category ids (post-00036 numbering):
--     1  דשבורד             (dashboards)
--     2  מכירות ולקוחות     (commercial/CRM)
--     3  רכש וספקים         (procurement)
--     4  פרויקטים            (execution/projects)
--     5  מלאי ומחסנים       (inventory)
--     6  כספים              (finance)
--     7  מיסוי              (tax)
--     8  כח אדם ושכר        (workforce/payroll)
--     9  תקשורת             (comms)
--    10  מסמכים             (documents)
--    11  AI וניתוחים        (intelligence)
--    12  Compliance         (compliance / audit)
--    13  תשתיות             (infra / ops / devops)
--    14  אינטגרציות         (integrations / webhooks)
--    15  מערכת              (system / governance)
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- PART A: 51 new menu rows for tables / features missing a page
-- ──────────────────────────────────────────────────────────────

-- Compliance (12)
delete from public.app_menu where route in ('/policies','/policy-acknowledgements');
insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('מדיניות ונהלים',          '/policies',                 '📜', 12, 80),
  ('אישורי מדיניות',          '/policy-acknowledgements',  '✅', 12, 81);

-- Workforce / payroll (8)
delete from public.app_menu where route in (
  '/employers','/hr-profiles','/leave-types','/pay-components','/pension-records'
);
insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('מעסיקים (חברות בית)',     '/employers',        '🏢', 8, 80),
  ('פרופילי כ״א',              '/hr-profiles',      '👤', 8, 81),
  ('סוגי חופשות',              '/leave-types',      '🏖️', 8, 82),
  ('רכיבי שכר',                '/pay-components',   '💵', 8, 83),
  ('רשומות פנסיה',             '/pension-records',  '🧓', 8, 84);

-- Commercial / sales extras (2)
delete from public.app_menu where route in ('/orders','/rule-sets');
insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('הזמנות (כלליות)',          '/orders',     '📝', 2, 80),
  ('מערכות כללי תמחור',        '/rule-sets',  '⚖️', 2, 81);

-- System / governance (15)
delete from public.app_menu where route in ('/user-roles','/user-preferences','/user-profiles');
insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('תפקידי משתמשים',           '/user-roles',        '🔐', 15, 80),
  ('העדפות משתמש',             '/user-preferences',  '⚙️', 15, 81),
  ('פרופילי משתמשים',          '/user-profiles',     '👥', 15, 82);

-- Comms (9)
delete from public.app_menu where route in ('/universal-inbox','/help-articles','/portal-users');
insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('תיבה אחודה',               '/universal-inbox',  '📥', 9, 80),
  ('מאמרי עזרה',               '/help-articles',    '📚', 9, 81),
  ('משתמשי פורטל',             '/portal-users',     '🚪', 9, 82);

-- Finance (6)
delete from public.app_menu where route in ('/fx-rates','/gl-transactions','/bank-matches');
insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('שערי מט״ח',                '/fx-rates',         '💱', 6, 80),
  ('תנועות הנה״ח',             '/gl-transactions',  '📒', 6, 81),
  ('התאמות בנק',               '/bank-matches',     '🔗', 6, 82);

-- Tax (7)
delete from public.app_menu where route in ('/annual-tax-reports');
insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('דוחות מס שנתיים',          '/annual-tax-reports', '📊', 7, 80);

-- Treasury (→ finance)
delete from public.app_menu where route in ('/cash-forecasts','/cash-positions','/bank-accounts');
insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('תחזיות מזומן',             '/cash-forecasts',  '💰', 6, 90),
  ('פוזיציות מזומן',           '/cash-positions',  '🏦', 6, 91),
  ('חשבונות בנק',              '/bank-accounts',   '🏛️', 6, 92);

-- Procurement (3)
delete from public.app_menu where route in (
  '/supplier-contacts','/supplier-scorecards','/supplier-portal-accounts',
  '/warranty-cases','/rfq-supplier-invites'
);
insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('אנשי קשר ספקים',           '/supplier-contacts',          '👤', 3, 80),
  ('כרטיסי דירוג ספקים',       '/supplier-scorecards',        '⭐', 3, 81),
  ('חשבונות פורטל ספקים',      '/supplier-portal-accounts',   '🚪', 3, 82),
  ('תיקי אחריות',              '/warranty-cases',             '🛡️', 3, 83),
  ('הזמנות ספקים ל-RFQ',       '/rfq-supplier-invites',       '✉️', 3, 84);

-- Intelligence (11)
delete from public.app_menu where route in (
  '/agent-registry','/ai-insights','/anomaly-cases','/decision-recommendations',
  '/forecast-models','/model-registry','/trend-signals','/quality-scores',
  '/seasonality-patterns','/inspection-plans','/defects-list'
);
insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('רישום סוכנים',             '/agent-registry',            '🤖', 11, 80),
  ('תובנות AI',                '/ai-insights',               '💡', 11, 81),
  ('תיקי אנומליות',            '/anomaly-cases',             '⚠️', 11, 82),
  ('המלצות החלטה',             '/decision-recommendations',  '📌', 11, 83),
  ('מודלי תחזית',              '/forecast-models',           '🔮', 11, 84),
  ('רישום מודלים',             '/model-registry',            '📦', 11, 85),
  ('איתותי מגמות',             '/trend-signals',             '📈', 11, 86),
  ('ציוני איכות',              '/quality-scores',            '🏅', 11, 87),
  ('דפוסי עונתיות',            '/seasonality-patterns',      '🗓️', 11, 88),
  ('תוכניות בדיקה',            '/inspection-plans',          '✅', 11, 89),
  ('ליקויים',                   '/defects-list',              '🐞', 11, 90);

-- Execution / projects (4)
delete from public.app_menu where route in (
  '/capacity-calendars','/demand-forecasts','/logistics-orders',
  '/project-milestones','/project-risks','/project-blockers'
);
insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('יומני קיבולת',             '/capacity-calendars',   '📅', 4, 80),
  ('תחזיות ביקוש',             '/demand-forecasts',     '📈', 4, 81),
  ('הזמנות לוגיסטיקה',         '/logistics-orders',     '🚚', 4, 82),
  ('אבני דרך פרויקט',          '/project-milestones',   '🎯', 4, 83),
  ('סיכוני פרויקט',             '/project-risks',        '⚠️', 4, 84),
  ('חסמי פרויקט',               '/project-blockers',     '🚧', 4, 85);

-- Inventory (5)
delete from public.app_menu where route in (
  '/reorder-rules','/material-categories','/material-requests',
  '/manufacturing-batches','/barcode-scans'
);
insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('כללי חידוש מלאי',          '/reorder-rules',        '🔄', 5, 80),
  ('קטגוריות חומרים',          '/material-categories',  '🗂️', 5, 81),
  ('דרישות חומר',              '/material-requests',    '📝', 5, 82),
  ('אצוות ייצור',              '/manufacturing-batches','🏭', 5, 83),
  ('סריקות ברקוד',             '/barcode-scans',        '📱', 5, 84);

-- Documents (10)
delete from public.app_menu where route in ('/signatures','/knowledge-cards');
insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('חתימות',                   '/signatures',      '✍️', 10, 80),
  ('כרטיסי ידע',               '/knowledge-cards', '🧠', 10, 81);

-- ──────────────────────────────────────────────────────────────
-- PART B: Re-categorize menu rows that were placed under the
-- wrong top-level. Idempotent UPDATE by route.
-- ──────────────────────────────────────────────────────────────

-- /receipts (finance doc) — was under inventory (5), should be finance (6)
update public.app_menu set parent_id = 6  where route = '/receipts';

-- /all-documents — was under comms (9), should be documents (10)
update public.app_menu set parent_id = 10 where route = '/all-documents';

-- /audit — was under system (15), should be compliance (12)
update public.app_menu set parent_id = 12 where route = '/audit';

-- /integrations — was under AI (11), should be integrations category (14)
update public.app_menu set parent_id = 14 where route = '/integrations';

-- /webhooks — was under AI (11), should be integrations (14)
update public.app_menu set parent_id = 14 where route = '/webhooks';

-- /cron — was under system (15), should be infra/ops (13)
update public.app_menu set parent_id = 13 where route = '/cron';

-- ──────────────────────────────────────────────────────────────
-- PART C: Documentation-only notes
-- (menu rows exist but there is no React <Route>; these are not
-- errors — many of them are server-only utilities (jobs, cron,
-- queue, pipeline) exposed via menu for admin linking. A later
-- PR will either wire a React Route or convert them to external
-- links. 458 such routes in total as of 2026-04-18; see the
-- _master-registry/SYSTEM_360_SANITY.md report for the full list.
-- No rows are deleted here.)
-- ──────────────────────────────────────────────────────────────

-- ──────────────────────────────────────────────────────────────
-- Keep id sequence in sync
-- ──────────────────────────────────────────────────────────────
select setval('app_menu_id_seq', (select coalesce(max(id), 1) from public.app_menu));
