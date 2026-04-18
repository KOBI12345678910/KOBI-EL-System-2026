-- ============================================================
-- FILE: supabase/migrations/00039_final_merge_menu_additions.sql
-- Purpose:
--   Add menu entries for pages discovered in the FINAL merge from
--   technokoluzi-erp-main (1).zip and KOBI-EL-System-2026-master.zip.
--
--   Guarded against collisions with 00034/00035/00036/00037/00038.
-- Categories 1..15 (post-real-estate scheme):
--   1 Executive | 2 Sales/CRM | 3 Procurement | 4 Projects | 5 Inventory
--   6 Finance | 7 Tax | 8 HR | 9 Communications | 10 Documents
--   11 AI | 12 Compliance | 13 Infra | 14 Integrations | 15 System
-- ============================================================

-- category 1 — 5 new route(s)
delete from public.app_menu where route in (
  '/executive/daily-profit-monitor',
  '/executive/fraud-detection',
  '/executive/risk-management',
  '/reports/esg-sustainability',
  '/reports/metric-dictionary'
);

insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('מוניטור רווח יומי', '/executive/daily-profit-monitor', '📊', 1, 900),
  ('זיהוי הונאות', '/executive/fraud-detection', '📊', 1, 901),
  ('ניהול סיכונים', '/executive/risk-management', '📊', 1, 902),
  ('ESG וקיימות', '/reports/esg-sustainability', '📊', 1, 903),
  ('מילון מדדים', '/reports/metric-dictionary', '📊', 1, 904);

-- category 2 — 6 new route(s)
delete from public.app_menu where route in (
  '/crm/agent-performance',
  '/crm/call-analysis',
  '/crm/contract-intelligence',
  '/crm/customer-experience',
  '/crm/whatsapp-hub',
  '/marketing/social-marketing'
);

insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('ביצועי סוכנים', '/crm/agent-performance', '💼', 2, 910),
  ('ניתוח שיחות', '/crm/call-analysis', '💼', 2, 911),
  ('אינטליגנציית חוזים', '/crm/contract-intelligence', '💼', 2, 912),
  ('חוויית לקוח', '/crm/customer-experience', '💼', 2, 913),
  ('מרכז WhatsApp', '/crm/whatsapp-hub', '💼', 2, 914),
  ('שיווק ברשתות חברתיות', '/marketing/social-marketing', '💼', 2, 915);

-- category 3 — 1 new route(s)
delete from public.app_menu where route in (
  '/procurement/vmi-consignment'
);

insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('VMI / קונסיגנציה', '/procurement/vmi-consignment', '🛒', 3, 921);

-- category 4 — 14 new route(s)
delete from public.app_menu where route in (
  '/installations/installation-scheduler',
  '/production/bom-builder',
  '/production/cpq-configurator',
  '/production/cut-nesting',
  '/production/dispatch-planning',
  '/production/engineering-change',
  '/production/iot-sensor-hub',
  '/production/measurement-comparison',
  '/production/safety-incidents',
  '/production/scrap-tracker',
  '/production/supply-chain-traceability',
  '/production/supply-chain-workflow',
  '/production/tool-equipment',
  '/projects/variation-orders'
);

insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('תזמון התקנות', '/installations/installation-scheduler', '🏗️', 4, 927),
  ('בונה עץ מוצר', '/production/bom-builder', '🏗️', 4, 928),
  ('קונפיגורטור CPQ', '/production/cpq-configurator', '🏗️', 4, 929),
  ('חיתוך וקינון', '/production/cut-nesting', '🏗️', 4, 930),
  ('תכנון שילוח', '/production/dispatch-planning', '🏗️', 4, 931),
  ('שינויים הנדסיים', '/production/engineering-change', '🏗️', 4, 932),
  ('מרכז חיישנים IoT', '/production/iot-sensor-hub', '🏗️', 4, 933),
  ('השוואת מדידות', '/production/measurement-comparison', '🏗️', 4, 934),
  ('אירועי בטיחות', '/production/safety-incidents', '🏗️', 4, 935),
  ('מעקב גרוטאות', '/production/scrap-tracker', '🏗️', 4, 936),
  ('עקיבות שרשרת אספקה', '/production/supply-chain-traceability', '🏗️', 4, 937),
  ('זרימת שרשרת אספקה', '/production/supply-chain-workflow', '🏗️', 4, 938),
  ('כלים וציוד', '/production/tool-equipment', '🏗️', 4, 939),
  ('הוראות שינוי', '/projects/variation-orders', '🏗️', 4, 940);

-- category 5 — 2 new route(s)
delete from public.app_menu where route in (
  '/inventory/raw-material-catalog',
  '/inventory/remnant-management'
);

insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('קטלוג חומרי גלם', '/inventory/raw-material-catalog', '📦', 5, 946),
  ('ניהול שאריות', '/inventory/remnant-management', '📦', 5, 947);

-- category 6 — 7 new route(s)
delete from public.app_menu where route in (
  '/finance/ap-ar-control',
  '/finance/cashflow-management',
  '/finance/financial-statements',
  '/finance/intercompany',
  '/finance/project-cost-calculator',
  '/finance/revenue-recognition',
  '/finance/three-way-match'
);

insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('בקרת חייבים/זכאים', '/finance/ap-ar-control', '💰', 6, 953),
  ('ניהול תזרים מזומנים', '/finance/cashflow-management', '💰', 6, 954),
  ('דוחות כספיים', '/finance/financial-statements', '💰', 6, 955),
  ('בין-חברתי', '/finance/intercompany', '💰', 6, 956),
  ('מחשבון עלויות פרויקט', '/finance/project-cost-calculator', '💰', 6, 957),
  ('הכרת הכנסה', '/finance/revenue-recognition', '💰', 6, 958),
  ('התאמה משולשת', '/finance/three-way-match', '💰', 6, 959);

-- category 8 — 4 new route(s)
delete from public.app_menu where route in (
  '/hr/employee-value-analysis',
  '/hr/performance-okr',
  '/hr/shift-scheduling',
  '/hr/smart-payroll'
);

insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('ניתוח ערך עובד', '/hr/employee-value-analysis', '👥', 8, 965),
  ('ביצועים OKR', '/hr/performance-okr', '👥', 8, 966),
  ('תזמון משמרות', '/hr/shift-scheduling', '👥', 8, 967),
  ('שכר חכם', '/hr/smart-payroll', '👥', 8, 968);

-- category 9 — 2 new route(s)
delete from public.app_menu where route in (
  '/mobile/field-operations',
  '/support/warranty-management'
);

insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('פעולות שדה', '/mobile/field-operations', '💬', 9, 974),
  ('ניהול אחריות', '/support/warranty-management', '💬', 9, 975);

-- category 10 — 1 new route(s)
delete from public.app_menu where route in (
  '/documents/document-templates'
);

insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('תבניות מסמכים', '/documents/document-templates', '📄', 10, 981);

-- category 11 — 8 new route(s)
delete from public.app_menu where route in (
  '/ai-engine/agent-orchestration',
  '/ai-engine/ai-agents-dashboard',
  '/ai-engine/digital-twin',
  '/ai-engine/document-intelligence',
  '/ai-engine/knowledge-graph',
  '/ai-engine/optimization-lab',
  '/ai-engine/process-mining',
  '/strategy/competitor-intelligence'
);

insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('תזמור סוכני AI', '/ai-engine/agent-orchestration', '🤖', 11, 987),
  ('לוח בקרת סוכני AI', '/ai-engine/ai-agents-dashboard', '🤖', 11, 988),
  ('תאום דיגיטלי', '/ai-engine/digital-twin', '🤖', 11, 989),
  ('אינטליגנציית מסמכים', '/ai-engine/document-intelligence', '🤖', 11, 990),
  ('גרף ידע', '/ai-engine/knowledge-graph', '🤖', 11, 991),
  ('מעבדת אופטימיזציה', '/ai-engine/optimization-lab', '🤖', 11, 992),
  ('כריית תהליכים', '/ai-engine/process-mining', '🤖', 11, 993),
  ('אינטליגנציית מתחרים', '/strategy/competitor-intelligence', '🤖', 11, 994);

-- category 14 — 2 new route(s)
delete from public.app_menu where route in (
  '/portal/customer-portal',
  '/portal/supplier-portal-new'
);

insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('פורטל לקוחות', '/portal/customer-portal', '🔗', 14, 1000),
  ('פורטל ספקים (חדש)', '/portal/supplier-portal-new', '🔗', 14, 1001);

-- category 15 — 9 new route(s)
delete from public.app_menu where route in (
  '/import/import-management',
  '/settings/department-manager',
  '/settings/duplicate-resolution',
  '/settings/feature-flags',
  '/settings/import-staging',
  '/settings/intelligent-notifications',
  '/settings/multi-site',
  '/settings/realtime-collaboration',
  '/settings/sla-management'
);

insert into public.app_menu (label, route, icon, parent_id, order_index) values
  ('ניהול יבוא', '/import/import-management', '⚙️', 15, 1007),
  ('ניהול מחלקות', '/settings/department-manager', '⚙️', 15, 1008),
  ('פתרון כפילויות', '/settings/duplicate-resolution', '⚙️', 15, 1009),
  ('דגלי פיצ׳רים', '/settings/feature-flags', '⚙️', 15, 1010),
  ('staging יבוא', '/settings/import-staging', '⚙️', 15, 1011),
  ('התראות חכמות', '/settings/intelligent-notifications', '⚙️', 15, 1012),
  ('ריבוי אתרים', '/settings/multi-site', '⚙️', 15, 1013),
  ('שיתוף פעולה בזמן אמת', '/settings/realtime-collaboration', '⚙️', 15, 1014),
  ('ניהול SLA', '/settings/sla-management', '⚙️', 15, 1015);

