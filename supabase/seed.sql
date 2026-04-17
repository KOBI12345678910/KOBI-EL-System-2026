-- =========================================================
-- KOBI-EL System 2026 — Comprehensive Seed Data
-- Hebrew demo data for local development / staging.
-- Idempotent: all INSERTs use ON CONFLICT DO NOTHING.
-- Schema-qualified names match 00000_master_schema.sql.
-- =========================================================

-- ─── Roles ───────────────────────────────────────────────
INSERT INTO public.roles (name, description) VALUES
  ('admin',    'System Administrator'),
  ('manager',  'Department Manager'),
  ('employee', 'Regular Employee'),
  ('viewer',   'Read-only access')
ON CONFLICT (name) DO NOTHING;

-- ─── Governance: users_profile ───────────────────────────
INSERT INTO governance.users_profile (email, full_name, phone, status, locale, timezone) VALUES
  ('kobi@techno-kol-uzi.co.il',    'קובי אלהרר',   '050-1001001', 'active', 'he-IL', 'Asia/Jerusalem'),
  ('dana@techno-kol-uzi.co.il',    'דנה ברק',       '050-1001002', 'active', 'he-IL', 'Asia/Jerusalem'),
  ('avi.sh@techno-kol-uzi.co.il',  'אבי שמעוני',   '050-1001003', 'active', 'he-IL', 'Asia/Jerusalem'),
  ('michal@techno-kol-uzi.co.il',  'מיכל רובין',   '050-1001004', 'active', 'he-IL', 'Asia/Jerusalem'),
  ('yossi.p@techno-kol-uzi.co.il', 'יוסי פרץ',      '050-1001005', 'active', 'he-IL', 'Asia/Jerusalem'),
  ('sarah@techno-kol-uzi.co.il',   'שרה כהן',       '050-1001006', 'active', 'he-IL', 'Asia/Jerusalem'),
  ('david.l@techno-kol-uzi.co.il', 'דוד לוי',       '050-1001007', 'active', 'he-IL', 'Asia/Jerusalem'),
  ('ron@techno-kol-uzi.co.il',     'רון אביב',      '050-1001009', 'active', 'he-IL', 'Asia/Jerusalem'),
  ('noa@techno-kol-uzi.co.il',     'נועה כהן',      '050-1001010', 'active', 'he-IL', 'Asia/Jerusalem')
ON CONFLICT DO NOTHING;

-- ─── Commercial: pipeline_stages ─────────────────────────
INSERT INTO commercial.pipeline_stages
  (stage_code, stage_name, stage_order, default_probability_percent, active)
VALUES
  ('LEAD',        'ליד',          1,  10, true),
  ('QUALIFY',     'כשירות',       2,  25, true),
  ('PROPOSAL',    'הצעת מחיר',    3,  50, true),
  ('NEGOTIATION', 'משא ומתן',     4,  75, true),
  ('WON',         'זכייה',        5, 100, true),
  ('LOST',        'הפסד',         6,   0, true)
ON CONFLICT (stage_code) DO NOTHING;

-- ─── Commercial: customers ───────────────────────────────
INSERT INTO commercial.customers
  (customer_number, legal_name, display_name, customer_type, tax_id, phone, email,
   address_line_1, city, country, status, credit_limit)
VALUES
  ('C001','כהן וילות בע"מ',         'כהן וילות',         'business','516111001','03-7771001','info@cohen-villas.co.il',   'דרך בגין 10',       'תל אביב',    'IL','active',500000),
  ('C002','לוי פרויקטים בע"מ',      'לוי פרויקטים',      'business','516111002','04-8881002','office@levi-projects.co.il', 'הנמל 5',            'חיפה',       'IL','active',350000),
  ('C003','דוד ובניו קבלנות',        'דוד ובניו',         'business','516111003','08-9991003','contact@david-sons.co.il',  'שדרות הרצל 20',     'ראשון לציון','IL','active',200000),
  ('C004','גולן מגורים בע"מ',        'גולן מגורים',       'business','516111004','09-7771004','golan@golan-living.co.il',  'ויצמן 8',           'נתניה',      'IL','active',400000),
  ('C005','אבן בנייה ועיצוב בע"מ',  'אבן בנייה',         'business','516111005','02-6661005','aven@aven-design.co.il',    'יפו 44',            'ירושלים',    'IL','active',150000),
  ('C006','כוכב אחזקות בע"מ',        'כוכב אחזקות',       'business','516111006','03-5551006','info@kochav-holdings.co.il','אחד העם 22',        'בני ברק',    'IL','active',250000),
  ('C007','ים תיכון בנייה בע"מ',     'ים תיכון בנייה',    'business','516111007','04-4441007','office@med-build.co.il',    'שלמה 18',           'נהריה',      'IL','active',300000)
ON CONFLICT (customer_number) DO NOTHING;

-- ─── Procurement: suppliers ──────────────────────────────
INSERT INTO procurement.suppliers
  (supplier_number, legal_name, display_name, supplier_category, tax_id,
   phone, email, address_line_1, city, country,
   primary_contact_name, primary_contact_phone, status)
VALUES
  ('S001','מתכות אשדוד בע"מ',         'מתכות אשדוד',    'חומרי גלם',  '514201001','08-8521001','jacob@metals-ashdod.co.il',  'אזה"ת צפון 15',   'אשדוד',       'IL','יעקב מזרחי',    '054-1234567','Active'),
  ('S002','אלומיניום הצפון בע"מ',      'אלומיניום הצפון','אלומיניום',  '514202002','04-9871002','simcha@alum-north.co.il',    'עמק זבולון 30',   'קריית אתא',   'IL','שמחה ברגר',     '052-9876543','Active'),
  ('S003','צביעה ועיבוד שטחים בע"מ',  'צביעה ועיבוד',   'צביעה',      '514203003','09-7531003','roni@paint-surface.co.il',   'התעשייה 7',       'פתח תקווה',   'IL','רוני אוחיון',   '050-1112233','Active'),
  ('S004','חלקי חילוף מכניים בע"מ',   'חח"מ',           'חלקי חילוף', '514204004','03-6421004','shlomi@parts-mech.co.il',    'מסגר 22',         'תל אביב',     'IL','שלומי גבאי',    '053-4445556','Active'),
  ('S005','כבלים וחשמל ישראל בע"מ',   'כח"י',           'חשמל וכבלים','514205005','02-5311005','menashe@cables-il.co.il',    'בית המלאכה 3',    'ירושלים',     'IL','מנשה בן-ארצי', '058-7778889','Active')
ON CONFLICT (supplier_number) DO NOTHING;

-- ─── Workforce: employer ─────────────────────────────────
INSERT INTO workforce.employers
  (employer_number, legal_name, tax_id, phone, email, status)
VALUES
  ('EMP-001','טכנו-קול עוזי בע"מ','514785236','03-5551234','hr@techno-kol-uzi.co.il','active')
ON CONFLICT (employer_number) DO NOTHING;

-- ─── Workforce: employees ────────────────────────────────
INSERT INTO workforce.employees
  (employee_number, full_name, phone, email, employer_id, role_title, department,
   employment_type, salary_base, national_id, status, start_date)
SELECT
  v.employee_number, v.full_name, v.phone, v.email,
  (SELECT id FROM workforce.employers WHERE employer_number = 'EMP-001'),
  v.role_title, v.department, v.employment_type,
  v.salary_base::numeric, v.national_id, 'Active', v.start_date::date
FROM (VALUES
  ('E001','אבי כהן',     '050-2001001','avi.cohen@techno-kol-uzi.co.il',    'מרתך בכיר',        'ייצור',     'full_time',12000,'123456789','2020-01-15'),
  ('E002','משה לוי',     '050-2001002','moshe.levi@techno-kol-uzi.co.il',   'מתקין',            'שטח',       'full_time',10500,'234567890','2019-06-01'),
  ('E003','יוסי דוד',    '050-2001003','yossi.david@techno-kol-uzi.co.il',  'נהג משאית',        'לוגיסטיקה', 'full_time', 9800,'345678901','2021-03-10'),
  ('E004','רחל גולן',    '050-2001004','rachel.golan@techno-kol-uzi.co.il', 'מנהלת חשבונות',    'כספים',     'full_time',14000,'456789012','2018-09-01'),
  ('E005','דני שרון',    '050-2001005','dani.sharon@techno-kol-uzi.co.il',  'מנהל ייצור',       'ייצור',     'full_time',18000,'567890123','2015-01-01'),
  ('E006','ליאת אמיר',   '050-2001006','liat.amir@techno-kol-uzi.co.il',    'טכנאית מעבדה',     'איכות',     'full_time',11200,'678901234','2022-07-01'),
  ('E007','יונתן כץ',    '050-2001007','yonatan.katz@techno-kol-uzi.co.il', 'מרתך',             'ייצור',     'full_time', 9500,'789012345','2023-02-15'),
  ('E008','נועה פרידמן', '050-2001008','noa.friedman@techno-kol-uzi.co.il', 'מנהלת רכש',        'רכש',       'full_time',15000,'890123456','2017-11-01'),
  ('E009','אייל ברק',    '050-2001009','eyal.barak@techno-kol-uzi.co.il',   'מנהל לוגיסטיקה',  'לוגיסטיקה', 'full_time',16000,'901234567','2016-05-10'),
  ('E010','תמר חדד',     '050-2001010','tamar.hadad@techno-kol-uzi.co.il',  'מזכירה ראשית',     'מנהלה',     'part_time', 7800,'012345678','2024-01-01')
) AS v(employee_number, full_name, phone, email, role_title, department,
       employment_type, salary_base, national_id, start_date)
ON CONFLICT (employee_number) DO NOTHING;

-- ─── Inventory: material_categories ──────────────────────
INSERT INTO inventory.material_categories (category_code, category_name)
VALUES
  ('RAW-METAL',  'מתכות גלם'),
  ('ALUMINUM',   'אלומיניום'),
  ('PAINT',      'חומרי צביעה'),
  ('HARDWARE',   'חומרת הרכבה'),
  ('ELECTRICAL', 'חשמל וכבלים')
ON CONFLICT (category_code) DO NOTHING;

-- ─── Inventory: materials ────────────────────────────────
INSERT INTO inventory.materials
  (material_number, material_name, material_description, unit_of_measure,
   unit_cost, standard_cost, category_id, status)
SELECT
  v.material_number, v.material_name, v.material_description, v.uom,
  v.unit_cost::numeric, v.unit_cost::numeric,
  (SELECT id FROM inventory.material_categories WHERE category_code = v.cat_code),
  'active'
FROM (VALUES
  ('MAT-001','פלדה גלוונית 2מ"מ',     'לוח פלדה גלוונית עובי 2מ"מ',   'kg',   18.50,'RAW-METAL'),
  ('MAT-002','פלדה גלוונית 3מ"מ',     'לוח פלדה גלוונית עובי 3מ"מ',   'kg',   20.00,'RAW-METAL'),
  ('MAT-003','פרופיל אלומיניום 40×40','פרופיל אלומיניום חלול 40×40',  'ml',   45.00,'ALUMINUM'),
  ('MAT-004','פרופיל אלומיניום 60×60','פרופיל אלומיניום חלול 60×60',  'ml',   68.00,'ALUMINUM'),
  ('MAT-005','צבע אפוקסי שחור',        'צבע אפוקסי עמיד — 5 ק"ג',     'can',  95.00,'PAINT'),
  ('MAT-006','צבע אלקיד לבן',          'צבע אלקיד עמיד למים 4 ל',      'can',  72.00,'PAINT'),
  ('MAT-007','בורג M8×20',             'בורג נירוסטה M8 אורך 20מ"מ',  'pcs',   0.85,'HARDWARE'),
  ('MAT-008','אום M8',                 'אום נירוסטה M8',                'pcs',   0.45,'HARDWARE'),
  ('MAT-009','כבל חשמל 2.5מ"מ',       'כבל NYY 2.5מ"מ לחיצוני',       'ml',   12.00,'ELECTRICAL'),
  ('MAT-010','לוח חשמל 24 מפסקים',    'לוח חשמל מאורגן 24 מפסקים',    'pcs', 380.00,'ELECTRICAL')
) AS v(material_number, material_name, material_description, uom, unit_cost, cat_code)
ON CONFLICT (material_number) DO NOTHING;

-- ─── Inventory: warehouses ───────────────────────────────
INSERT INTO inventory.warehouses
  (warehouse_code, warehouse_name, address_line_1, city, country, active)
VALUES
  ('WH-MAIN',  'מחסן ראשי — אזה"ת',      'אזה"ת אשדוד מבנה 12', 'אשדוד',       'IL', true),
  ('WH-FIELD', 'מחסן שטח — פתח תקווה',  'התעשייה 55',            'פתח תקווה',   'IL', true),
  ('WH-PAINT', 'מחסן צביעה',              'הכבשן 3',               'ראשון לציון', 'IL', true)
ON CONFLICT (warehouse_code) DO NOTHING;

-- ─── Inventory: stock ────────────────────────────────────
INSERT INTO inventory.inventory
  (material_id, warehouse_id, quantity_on_hand, quantity_reserved,
   reorder_point, reorder_quantity, bin_location)
SELECT
  m.id, w.id,
  v.qty_on_hand::numeric, v.qty_reserved::numeric,
  v.reorder_point::numeric, v.reorder_qty::numeric,
  v.bin_location
FROM (VALUES
  ('MAT-001','WH-MAIN',  2500, 300,  500, 1000,'A-01-01'),
  ('MAT-002','WH-MAIN',  1800, 200,  400,  800,'A-01-02'),
  ('MAT-003','WH-MAIN',   600,  80,  100,  300,'B-02-01'),
  ('MAT-004','WH-MAIN',   400,  50,  100,  200,'B-02-02'),
  ('MAT-005','WH-PAINT',  150,  20,   30,   80,'C-01-01'),
  ('MAT-006','WH-PAINT',  120,  15,   25,   60,'C-01-02'),
  ('MAT-007','WH-MAIN',  5000, 600, 1000, 3000,'D-01-01'),
  ('MAT-008','WH-MAIN',  4800, 550, 1000, 2500,'D-01-02'),
  ('MAT-009','WH-FIELD',  800, 100,  200,  500,'E-01-01'),
  ('MAT-010','WH-FIELD',   25,   3,    5,   10,'E-02-01')
) AS v(mat_num, wh_code, qty_on_hand, qty_reserved, reorder_point, reorder_qty, bin_location)
JOIN inventory.materials  m ON m.material_number = v.mat_num
JOIN inventory.warehouses w ON w.warehouse_code  = v.wh_code
ON CONFLICT DO NOTHING;

-- ─── Commercial: quotes ──────────────────────────────────
INSERT INTO commercial.quotes
  (quote_number, customer_id, quote_date, valid_until, currency,
   subtotal, tax_amount, total_amount, state, title)
SELECT
  v.quote_number,
  (SELECT id FROM commercial.customers WHERE customer_number = v.cust_num),
  v.quote_date::date, v.valid_until::date, 'ILS',
  v.subtotal::numeric, v.tax_amount::numeric, v.total_amount::numeric,
  v.state, v.title
FROM (VALUES
  ('Q-2026-001','C001','2026-01-10','2026-02-10', 85000, 15300,100300,'Accepted','שערים אוטומטיים — פרויקט כהן'),
  ('Q-2026-002','C002','2026-02-01','2026-03-01', 62000, 11160, 73160,'Sent',   'מעקות אלומיניום — פרויקט לוי'),
  ('Q-2026-003','C003','2026-02-15','2026-03-15', 43000,  7740, 50740,'Draft',  'גדר פרמטר — דוד ובניו'),
  ('Q-2026-004','C004','2026-03-01','2026-04-01',110000, 19800,129800,'Accepted','מערכת שערים מורכבת — גולן מגורים'),
  ('Q-2026-005','C005','2026-03-10','2026-04-10', 35000,  6300, 41300,'Sent',   'עיצוב חזית מתכת — אבן בנייה')
) AS v(quote_number, cust_num, quote_date, valid_until, subtotal, tax_amount, total_amount, state, title)
ON CONFLICT (quote_number) DO NOTHING;

-- ─── Execution: projects ─────────────────────────────────
INSERT INTO execution.projects
  (project_number, project_name, customer_id, project_type, location_name,
   address_line_1, city, budget_amount, priority, planned_start_date,
   planned_end_date, state)
SELECT
  v.project_number, v.project_name,
  (SELECT id FROM commercial.customers WHERE customer_number = v.cust_num),
  v.project_type, v.location_name, v.address_line_1, v.city,
  v.budget_amount::numeric, v.priority,
  v.planned_start::date, v.planned_end::date, v.state
FROM (VALUES
  ('PRJ-2026-001','שערים אוטומטיים — בית כהן',        'C001','installation','בית פרטי רמת אביב','הנשיא 14',       'תל אביב',   100300,'High',  '2026-02-01','2026-03-15','Active'),
  ('PRJ-2026-002','מעקות אלומיניום — קריית הים',       'C002','manufacturing','קומפלקס מגורים',   'יוחנן הסנדלר 5','חיפה',        73160,'Normal','2026-02-15','2026-04-01','Active'),
  ('PRJ-2026-003','גדר פרמטר — אזה"ת ראשון',          'C003','installation','מפעל',             'שדרות הרצל 20', 'ראשון לציון', 50740,'Low',   '2026-03-01','2026-05-01','Planning'),
  ('PRJ-2026-004','שערים מורכבים — גולן מגורים',       'C004','installation','פרויקט יוקרתי',    'ויצמן 8',        'נתניה',      129800,'High',  '2026-03-15','2026-06-01','Active'),
  ('PRJ-2026-005','חזית מתכת — משרדי אבן',             'C005','manufacturing','בניין משרדים',     'יפו 44',         'ירושלים',    41300,'Normal','2026-04-01','2026-05-15','Planning')
) AS v(project_number, project_name, cust_num, project_type, location_name,
       address_line_1, city, budget_amount, priority, planned_start, planned_end, state)
ON CONFLICT (project_number) DO NOTHING;

-- ─── Execution: work_orders ──────────────────────────────
INSERT INTO execution.work_orders
  (work_order_number, project_id, title, description,
   required_start_date, required_end_date, priority, state)
SELECT
  v.wo_number,
  (SELECT id FROM execution.projects WHERE project_number = v.proj_num),
  v.title, v.description,
  v.req_start::date, v.req_end::date, v.priority, v.state
FROM (VALUES
  ('WO-2026-001','PRJ-2026-001','מדידות ותכנון — בית כהן',   'מדידות ותכנון ראשוניות בשטח',   '2026-02-01','2026-02-05','High',  'Completed'),
  ('WO-2026-002','PRJ-2026-001','ייצור שערים — בית כהן',     'ייצור שני שערים נפתחים',        '2026-02-06','2026-02-25','High',  'In Progress'),
  ('WO-2026-003','PRJ-2026-001','התקנה — בית כהן',           'התקנת שערים ומנועים',           '2026-03-01','2026-03-10','High',  'Open'),
  ('WO-2026-004','PRJ-2026-002','ייצור מעקות — קריית הים',   'ייצור 40 מ"ר מעקות אלומיניום', '2026-02-15','2026-03-15','Normal','In Progress'),
  ('WO-2026-005','PRJ-2026-002','התקנת מעקות — קריית הים',   'התקנה בקומות 1-4',              '2026-03-15','2026-04-01','Normal','Open'),
  ('WO-2026-006','PRJ-2026-004','תכנון הנדסי — גולן מגורים', 'תכנון ושרטוט מערכת שלמה',       '2026-03-15','2026-03-25','High',  'In Progress'),
  ('WO-2026-007','PRJ-2026-004','ייצור מרכיבים — גולן',       'ייצור כלל מרכיבי הפרויקט',      '2026-03-25','2026-05-01','High',  'Open'),
  ('WO-2026-008','PRJ-2026-003','סקר שטח — ראשון לציון',     'סקר שטח ראשוני',                '2026-03-01','2026-03-05','Low',   'Completed'),
  ('WO-2026-009','PRJ-2026-005','עיצוב וייצור חזית',         'עיצוב ואישור, ייצור פאנלים',    '2026-04-01','2026-04-25','Normal','Open'),
  ('WO-2026-010','PRJ-2026-004','התקנה — גולן מגורים',       'התקנת כל המערכות',               '2026-05-01','2026-06-01','High',  'Open')
) AS v(wo_number, proj_num, title, description, req_start, req_end, priority, state)
ON CONFLICT (work_order_number) DO NOTHING;

-- ─── Execution: alerts ───────────────────────────────────
INSERT INTO execution.alerts
  (alert_number, category, severity, title, description, state)
VALUES
  ('ALT-2026-001','schedule_risk',    'high',  'עיכוב פוטנציאלי — בית כהן',   'WO-2026-002 צפוי לאחר את לוח הזמנים','Open'),
  ('ALT-2026-002','material_shortage','medium','מחסור חומר — MAT-003',          'רמות מלאי אלומיניום 40×40 נמוכות',   'Open'),
  ('ALT-2026-003','quality_issue',    'low',   'בדיקת איכות נדרשת — WO-004',   'נדרש בקרת איכות לפני משלוח',         'Open'),
  ('ALT-2026-004','payment_overdue',  'high',  'חוב פג תאריך — לוי פרויקטים', 'חשבונית מ-2026-02 לא שולמה',         'Open'),
  ('ALT-2026-005','low_stock',        'medium','מלאי נמוך — MAT-009',           'כבל חשמל מתחת לנקודת הזמנה חוזרת',   'Open')
ON CONFLICT (alert_number) DO NOTHING;

-- ─── Comms: notifications ────────────────────────────────
INSERT INTO comms.notifications
  (notification_type, user_id, title, body, severity, read_at)
SELECT
  v.notification_type, u.id, v.title, v.body, v.severity, null
FROM (VALUES
  ('alert',   'kobi@techno-kol-uzi.co.il',  'עיכוב פרויקט',       'WO-2026-002 מאחר — בדוק לוח זמנים',  'high'),
  ('alert',   'dana@techno-kol-uzi.co.il',  'מחסור חומרים',       'יש לבצע הזמנה לאלומיניום 40×40',     'medium'),
  ('reminder','avi.sh@techno-kol-uzi.co.il','תזכורת: WO-2026-003', 'התקנה בבית כהן מתחילה 01/03',         'low'),
  ('info',    'noa@techno-kol-uzi.co.il',   'ציטוט חדש אושר',     'Q-2026-004 אושר על ידי גולן מגורים',  'low'),
  ('alert',   'kobi@techno-kol-uzi.co.il',  'תשלום באיחור',       'לקוח לוי פרויקטים — חשבונית 02/26',  'high')
) AS v(notification_type, user_email, title, body, severity)
JOIN governance.users_profile u ON u.email = v.user_email
ON CONFLICT DO NOTHING;

-- ─── Finance: invoices ───────────────────────────────────
INSERT INTO finance.invoices
  (invoice_number, invoice_type, customer_id, project_id, issue_date, due_date,
   currency, subtotal, vat_total, grand_total, state)
SELECT
  v.invoice_number, 'customer',
  (SELECT id FROM commercial.customers WHERE customer_number = v.cust_num),
  (SELECT id FROM execution.projects   WHERE project_number  = v.proj_num),
  v.issue_date::date, v.due_date::date, 'ILS',
  v.subtotal::numeric, v.vat_total::numeric, v.grand_total::numeric,
  v.state
FROM (VALUES
  ('INV-2026-001','C001','PRJ-2026-001','2026-02-28','2026-03-30', 40000,  7200, 47200,'Sent'),
  ('INV-2026-002','C001','PRJ-2026-001','2026-03-15','2026-04-15', 45000,  8100, 53100,'Draft'),
  ('INV-2026-003','C002','PRJ-2026-002','2026-03-01','2026-04-01', 62000, 11160, 73160,'Paid'),
  ('INV-2026-004','C004','PRJ-2026-004','2026-04-01','2026-05-01', 55000,  9900, 64900,'Sent'),
  ('INV-2026-005','C005','PRJ-2026-005','2026-04-10','2026-05-10', 35000,  6300, 41300,'Draft')
) AS v(invoice_number, cust_num, proj_num, issue_date, due_date,
       subtotal, vat_total, grand_total, state)
ON CONFLICT (invoice_number) DO NOTHING;

-- ─── Workforce: payroll_runs ─────────────────────────────
INSERT INTO workforce.payroll_runs
  (payroll_run_number, payroll_period_start, payroll_period_end,
   employer_id, state)
SELECT
  'PR-2026-03', '2026-03-01', '2026-03-31',
  (SELECT id FROM workforce.employers WHERE employer_number = 'EMP-001'),
  'Approved'
ON CONFLICT (payroll_run_number) DO NOTHING;

-- End of seed.sql
