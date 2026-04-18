/**
 * WARNING — PRODUCTION SYSTEM: טכנו-כל עוזי
 * This file contains DEMO/SAMPLE data for development testing ONLY.
 * seedAllTables() is NOT called at server startup — it is only accessible
 * via a protected admin route (/seed-data).
 * 
 * DO NOT run this on the production database.
 * The production system uses only real data entered by operators.
 */

import { pool } from "@workspace/db";
import { clearKpiCache } from "./routes/dashboard-kpi";

export async function seedAllTables() {
  if (process.env.ENABLE_SEED !== "true") {
    return { results: [], errors: ["Seed is disabled by default. Set ENABLE_SEED=true to allow seeding."] };
  }
  const client = await pool.connect();
  const results: string[] = [];
  const errors: string[] = [];

  const run = async (label: string, sql: string) => {
    try { await client.query(sql); results.push(label); } catch (e: any) { errors.push(`${label}: ${e.message}`); }
  };

  try {
    await run("purchase_orders", `INSERT INTO purchase_orders (order_number, supplier_id, order_date, expected_delivery, status, total_before_tax, tax_amount, total_amount, currency, notes, supplier_name, created_at, updated_at)
      SELECT v.order_number, s.id, v.order_date::date, v.expected_delivery::date, v.status, v.total_before_tax, v.tax_amount, v.total_amount, v.currency, v.notes, s.supplier_name, NOW(), NOW()
      FROM (VALUES
        ('PO-2026-0001', 28, '2026-01-05', '2026-02-05', 'approved', 1500000, 270000, 1770000, 'ILS', 'הזמנת אלומיניום'),
        ('PO-2026-0002', 29, '2026-01-10', '2026-02-10', 'received', 2300000, 414000, 2714000, 'ILS', 'הזמנת פלדה'),
        ('PO-2026-0003', 30, '2026-01-15', '2026-02-15', 'sent', 800000, 144000, 944000, 'ILS', 'הזמנת זכוכית'),
        ('PO-2026-0004', 31, '2026-02-01', '2026-03-01', 'draft', 3500000, 630000, 4130000, 'ILS', 'הזמנת ברזל'),
        ('PO-2026-0005', 32, '2026-02-05', '2026-03-05', 'approved', 950000, 171000, 1121000, 'ILS', 'הזמנת חומרי ריתוך'),
        ('PO-2026-0006', 33, '2026-02-10', '2026-03-10', 'received', 1200000, 216000, 1416000, 'ILS', 'הזמנת צבע'),
        ('PO-2026-0007', 34, '2026-02-15', '2026-03-15', 'partial_received', 4200000, 756000, 4956000, 'ILS', 'הזמנת נירוסטה'),
        ('PO-2026-0008', 35, '2026-03-01', '2026-04-01', 'sent', 670000, 120600, 790600, 'ILS', 'הזמנת אטמים'),
        ('PO-2026-0009', 36, '2026-03-05', '2026-04-05', 'approved', 1800000, 324000, 2124000, 'ILS', 'הזמנת פרופילים'),
        ('PO-2026-0010', 37, '2026-03-10', '2026-04-10', 'draft', 560000, 100800, 660800, 'ILS', 'הזמנת ברגים')
      ) AS v(order_number, sid, order_date, expected_delivery, status, total_before_tax, tax_amount, total_amount, currency, notes)
      JOIN suppliers s ON s.id = v.sid::int
      ON CONFLICT DO NOTHING`);

    await run("leave_requests", `INSERT INTO leave_requests (request_number, employee_name, employee_id, leave_type, start_date, end_date, days_count, status, reason, created_at) VALUES
      ('LR-2026-001', 'אברהם כהן', 1, 'vacation', '2026-04-01', '2026-04-05', 5, 'approved', 'חופשת פסח', NOW()),
      ('LR-2026-002', 'דוד לוי', 5, 'sick', '2026-03-10', '2026-03-12', 3, 'approved', 'אישור מחלה', NOW()),
      ('LR-2026-003', 'יוסף מזרחי', 10, 'vacation', '2026-05-01', '2026-05-07', 7, 'pending', 'טיול משפחתי', NOW()),
      ('LR-2026-004', 'משה ישראלי', 15, 'military', '2026-06-01', '2026-06-14', 14, 'approved', 'שירות מילואים', NOW()),
      ('LR-2026-005', 'רונן אברהם', 20, 'personal', '2026-03-20', '2026-03-20', 1, 'approved', 'טיפול אישי', NOW()),
      ('LR-2026-006', 'שירה כהן', 25, 'vacation', '2026-07-15', '2026-07-25', 11, 'pending', 'חופשת קיץ', NOW()),
      ('LR-2026-007', 'אמיר לוי', 30, 'sick', '2026-03-05', '2026-03-07', 3, 'rejected', 'לא צורף אישור רפואי', NOW()),
      ('LR-2026-008', 'נועה ישראלי', 50, 'vacation', '2026-08-01', '2026-08-10', 10, 'approved', 'חופשה בחול', NOW()),
      ('LR-2026-009', 'עמית פרץ', 75, 'personal', '2026-03-15', '2026-03-16', 2, 'pending', 'אירוע משפחתי', NOW()),
      ('LR-2026-010', 'ליאור חדד', 100, 'military', '2026-04-10', '2026-04-20', 11, 'approved', 'אימון מילואים', NOW()),
      ('LR-2026-011', 'מיכל דוד', 120, 'vacation', '2026-09-01', '2026-09-05', 5, 'pending', 'ימי חג', NOW()),
      ('LR-2026-012', 'יעקב רוזן', 150, 'sick', '2026-03-18', '2026-03-19', 2, 'approved', 'שפעת', NOW())
    ON CONFLICT DO NOTHING`);

    await run("machines", `INSERT INTO machines (name, machine_number, machine_type, manufacturer, model, location, status, purchase_date, notes, created_at, updated_at) VALUES
      ('מכונת חיתוך CNC', 'MCH-001', 'production', 'Trumpf', 'TruLaser 3030', 'אולם A', 'active', '2022-06-15', 'מכונת לייזר ראשית', NOW(), NOW()),
      ('מכונת כיפוף', 'MCH-002', 'production', 'Bystronic', 'Xpert 320', 'אולם A', 'active', '2021-03-20', 'כיפוף פח עד 3מ', NOW(), NOW()),
      ('מקדחת עמוד', 'MCH-003', 'production', 'Heller', 'BRK 160', 'אולם B', 'active', '2020-01-10', 'קידוח עד 50מם', NOW(), NOW()),
      ('מכונת ריתוך MIG', 'MCH-004', 'welding', 'Lincoln', 'Power MIG 360MP', 'מחלקת ריתוך', 'active', '2023-05-01', 'ריתוך MIG/MAG', NOW(), NOW()),
      ('מכונת ריתוך TIG', 'MCH-005', 'welding', 'Miller', 'Dynasty 350', 'מחלקת ריתוך', 'active', '2023-05-01', 'ריתוך TIG נירוסטה', NOW(), NOW()),
      ('מסור סרט', 'MCH-006', 'production', 'Behringer', 'HBP530A', 'אולם B', 'maintenance', '2019-08-15', 'בתחזוקה — החלפת להב', NOW(), NOW()),
      ('מכונת שיוף', 'MCH-007', 'finishing', 'Timesavers', '42-WRB-900', 'אולם C', 'active', '2021-11-01', 'שיוף משטחי מתכת', NOW(), NOW()),
      ('מכונת צביעה אלקטרוסטטית', 'MCH-008', 'finishing', 'Gema', 'OptiFlex Pro', 'מחלקת צבע', 'active', '2022-09-01', 'צביעה אבקתית', NOW(), NOW()),
      ('מכבש הידראולי 200 טון', 'MCH-009', 'production', 'Ermak', 'CNCAP 200', 'אולם A', 'active', '2020-04-01', 'עיבוד פח כבד', NOW(), NOW()),
      ('לייזר חיתוך סיבי', 'MCH-010', 'production', 'Trumpf', 'TruLaser 5030', 'אולם A', 'active', '2024-01-15', 'לייזר סיבי 6KW', NOW(), NOW())
    ON CONFLICT DO NOTHING`);

    await run("quality_inspections", `INSERT INTO quality_inspections (inspection_number, inspection_type, product_name, inspector_name, result, passed, inspection_date, notes, created_at) VALUES
      ('QC-2026-001', 'incoming', 'אלומיניום 6063', 'יוסי כהן', 'pass', true, '2026-01-15', 'בדיקת חומר גלם — תקין', NOW()),
      ('QC-2026-002', 'in_process', 'דלת פלדה D-100', 'דני לוי', 'pass', true, '2026-01-20', 'בדיקת ריתוך — תקין', NOW()),
      ('QC-2026-003', 'final', 'חלון אלומיניום W-50', 'משה ישראלי', 'fail', false, '2026-02-01', 'סטייה במידות — לתיקון', NOW()),
      ('QC-2026-004', 'incoming', 'פלדה S235', 'יוסי כהן', 'pass', true, '2026-02-05', 'אישור תעודת בדיקה', NOW()),
      ('QC-2026-005', 'in_process', 'מעקה נירוסטה R-200', 'דני לוי', 'pending', NULL, '2026-02-10', 'בדיקת הלחמות', NOW()),
      ('QC-2026-006', 'final', 'שער חנייה G-300', 'משה ישראלי', 'pass', true, '2026-02-15', 'בדיקה סופית — אושר', NOW()),
      ('QC-2026-007', 'incoming', 'זכוכית מחוסמת 10מם', 'רונן אברהמי', 'pass', true, '2026-03-01', 'בדיקת עובי ושלמות', NOW()),
      ('QC-2026-008', 'in_process', 'פרגולה אלומיניום P-400', 'דני לוי', 'pending', NULL, '2026-03-05', 'ממתין לבדיקה', NOW())
    ON CONFLICT DO NOTHING`);

    await run("customer_invoices", `INSERT INTO customer_invoices (invoice_number, invoice_date, due_date, customer_name, status, subtotal, vat_amount, total_amount, amount_paid, currency, notes, created_at, updated_at) VALUES
      ('INV-2026-0001', '2026-01-10', '2026-02-10', 'שמעון בניין ופיתוח בע"מ', 'paid', 5000000, 900000, 5900000, 5900000, 'ILS', 'פרויקט מגורים רמת גן — 48 חלונות אלומיניום', NOW(), NOW()),
      ('INV-2026-0002', '2026-01-15', '2026-02-15', 'ברזילי קונסטרוקציות', 'paid', 3200000, 576000, 3776000, 3776000, 'ILS', 'שער חנייה חשמלי 6x3 מ — כולל מנוע', NOW(), NOW()),
      ('INV-2026-0003', '2026-01-20', '2026-02-20', 'אדריכלות גולן ושות''', 'sent', 1800000, 324000, 2124000, 0, 'ILS', '12 חלונות אלומיניום דו-כנפי למשרדים', NOW(), NOW()),
      ('INV-2026-0004', '2026-02-01', '2026-03-01', 'דניאל הנדסת מבנים', 'overdue', 4500000, 810000, 5310000, 0, 'ILS', 'מעקות נירוסטה 120 מ"ל — בניין 8 קומות', NOW(), NOW()),
      ('INV-2026-0005', '2026-02-05', '2026-03-05', 'חברת בניין הנגב', 'paid', 2700000, 486000, 3186000, 3186000, 'ILS', '6 דלתות פלדה למפעל — כולל צביעה', NOW(), NOW()),
      ('INV-2026-0006', '2026-02-10', '2026-03-10', 'מגורי השרון בע"מ', 'partial', 6000000, 1080000, 7080000, 3540000, 'ILS', 'פרגולות אלומיניום 4 יחידות — וילה פרטית', NOW(), NOW()),
      ('INV-2026-0007', '2026-02-15', '2026-03-15', 'תעשיות בן-ארי', 'sent', 1500000, 270000, 1770000, 0, 'ILS', 'תיקון שער תעשייתי + החלפת מסילות', NOW(), NOW()),
      ('INV-2026-0008', '2026-03-01', '2026-04-01', 'מרכזי מסחר ישראל', 'draft', 8500000, 1530000, 10030000, 0, 'ILS', 'חזית קיר מסך אלומיניום+זכוכית — 250 מ"ר', NOW(), NOW()),
      ('INV-2026-0009', '2026-03-05', '2026-04-05', 'חיים כהן קבלנות', 'paid', 950000, 171000, 1121000, 1121000, 'ILS', 'אביזרי אלומיניום — ידיות, צירים, מנעולים', NOW(), NOW()),
      ('INV-2026-0010', '2026-03-10', '2026-04-10', 'אופק נכסים והשקעות', 'sent', 3100000, 558000, 3658000, 0, 'ILS', 'התקנת חלונות ותריסים — בניין משרדים', NOW(), NOW())
    ON CONFLICT DO NOTHING`);

    await run("inventory_transactions", `INSERT INTO inventory_transactions (material_id, transaction_type, quantity, unit, document_number, notes, created_at) VALUES
      (1, 'receipt', 500, 'kg', 'PO-2026-0001', 'קבלת אלומיניום 6063', NOW()),
      (2, 'receipt', 300, 'kg', 'PO-2026-0002', 'קבלת פלדה S235', NOW()),
      (3, 'issue', 50, 'unit', 'WO-2026-001', 'הוצאה לייצור חלונות', NOW()),
      (5, 'receipt', 200, 'meter', 'PO-2026-0003', 'קבלת פרופילים', NOW()),
      (7, 'issue', 30, 'unit', 'WO-2026-003', 'הוצאה לייצור דלתות', NOW()),
      (10, 'adjustment', -15, 'unit', 'ADJ-001', 'תיקון מלאי — ספירה', NOW()),
      (12, 'receipt', 1000, 'unit', 'PO-2026-0004', 'קבלת ברגים נירוסטה', NOW()),
      (15, 'transfer', 100, 'kg', 'TRF-001', 'העברה למחלקת ריתוך', NOW()),
      (20, 'issue', 75, 'meter', 'WO-2026-005', 'הוצאה לפרויקט מסחרי', NOW()),
      (25, 'receipt', 400, 'sheet', 'PO-2026-0005', 'קבלת גיליונות אלומיניום', NOW()),
      (30, 'issue', 20, 'unit', 'WO-2026-007', 'הוצאה לייצור שערים', NOW()),
      (35, 'receipt', 150, 'kg', 'PO-2026-0006', 'קבלת אבקת צביעה', NOW()),
      (40, 'adjustment', 5, 'unit', 'ADJ-002', 'תיקון מלאי — מצאנו יחידות', NOW()),
      (45, 'issue', 60, 'meter', 'WO-2026-009', 'הוצאה לייצור מעקות', NOW()),
      (50, 'transfer', 200, 'unit', 'TRF-002', 'העברה למחלקת הרכבה', NOW())
    ON CONFLICT DO NOTHING`);

    await run("delivery_notes", `INSERT INTO delivery_notes (delivery_number, sales_order_id, customer_id, delivery_date, status, shipping_method, driver_name, notes, created_at, updated_at) VALUES
      ('DN-2026-0001', 1, 1, '2026-01-20', 'delivered', 'משאית מפעל', 'עופר דוידוב', 'נמסר ונחתם', NOW(), NOW()),
      ('DN-2026-0002', 2, 2, '2026-01-25', 'delivered', 'משאית מפעל', 'אבי כהן', 'נמסר באתר', NOW(), NOW()),
      ('DN-2026-0003', 3, 3, '2026-02-01', 'shipped', 'הובלה חיצונית', 'חברת הובלות צפון', 'בדרך ללקוח', NOW(), NOW()),
      ('DN-2026-0004', 5, 5, '2026-02-10', 'delivered', 'משאית מפעל', 'עופר דוידוב', 'התקנה בוצעה', NOW(), NOW()),
      ('DN-2026-0005', 7, 7, '2026-02-15', 'shipped', 'הובלה חיצונית', 'חברת הובלות דרום', 'משלוח לאילת', NOW(), NOW()),
      ('DN-2026-0006', 10, 10, '2026-03-01', 'draft', 'משאית מפעל', '', 'ממתין לאישור', NOW(), NOW()),
      ('DN-2026-0007', 12, 12, '2026-03-05', 'delivered', 'איסוף עצמי', '', 'לקוח אסף מהמפעל', NOW(), NOW()),
      ('DN-2026-0008', 15, 15, '2026-03-10', 'shipped', 'משאית מפעל', 'אבי כהן', 'משלוח מרכז', NOW(), NOW())
    ON CONFLICT DO NOTHING`);

    await run("employees", `INSERT INTO employees (employee_number, first_name, last_name, full_name, email, phone, department, job_title, employment_type, start_date, base_salary, status, created_at, updated_at) VALUES
      ('EMP-001', 'אברהם', 'כהן', 'אברהם כהן', 'avraham@techno.co.il', '050-1111111', 'ייצור', 'מפעיל מכונות בכיר', 'full_time', '2020-03-01', 1800000, 'active', NOW(), NOW()),
      ('EMP-002', 'דוד', 'לוי', 'דוד לוי', 'david@techno.co.il', '050-2222222', 'ייצור', 'מפעיל CNC', 'full_time', '2021-06-15', 1500000, 'active', NOW(), NOW()),
      ('EMP-003', 'יוסף', 'מזרחי', 'יוסף מזרחי', 'yosef@techno.co.il', '050-3333333', 'הנהלה', 'סמנכ"ל תפעול', 'full_time', '2018-01-01', 2000000, 'active', NOW(), NOW()),
      ('EMP-004', 'משה', 'ישראלי', 'משה ישראלי', 'moshe@techno.co.il', '050-4444444', 'מחסן', 'מנהל מחסן', 'full_time', '2019-09-01', 1600000, 'active', NOW(), NOW()),
      ('EMP-005', 'רונן', 'אברהם', 'רונן אברהם', 'ronen@techno.co.il', '050-5555555', 'ייצור', 'מנהל משמרת', 'full_time', '2020-01-01', 1200000, 'active', NOW(), NOW()),
      ('EMP-006', 'שירה', 'כהן', 'שירה כהן', 'shira@techno.co.il', '050-6666666', 'משרד', 'רואת חשבון', 'full_time', '2021-03-01', 1700000, 'active', NOW(), NOW()),
      ('EMP-007', 'אמיר', 'לוי', 'אמיר לוי', 'amir@techno.co.il', '050-7777777', 'ריתוך', 'רתך בכיר', 'full_time', '2019-05-01', 1400000, 'active', NOW(), NOW()),
      ('EMP-008', 'נועה', 'ישראלי', 'נועה ישראלי', 'noa@techno.co.il', '050-8888888', 'איכות', 'בודקת איכות', 'full_time', '2022-08-01', 1600000, 'active', NOW(), NOW()),
      ('EMP-009', 'עמית', 'פרץ', 'עמית פרץ', 'amit@techno.co.il', '050-9999999', 'ייצור', 'מנהל ייצור', 'full_time', '2017-02-01', 2200000, 'active', NOW(), NOW()),
      ('EMP-010', 'ליאור', 'חדד', 'ליאור חדד', 'lior@techno.co.il', '051-1111111', 'התקנות', 'טכנאי התקנות', 'full_time', '2023-01-01', 1300000, 'active', NOW(), NOW()),
      ('EMP-011', 'מיכל', 'דוד', 'מיכל דוד', 'michal@techno.co.il', '051-2222222', 'משרד', 'מנהלת משרד', 'full_time', '2020-06-01', 1100000, 'active', NOW(), NOW()),
      ('EMP-012', 'יעקב', 'רוזן', 'יעקב רוזן', 'yaakov@techno.co.il', '051-3333333', 'ייצור', 'מפעיל', 'full_time', '2021-11-01', 1700000, 'active', NOW(), NOW())
    ON CONFLICT DO NOTHING`);

    await run("payroll_records", `INSERT INTO payroll_records (employee_id, employee_name, period_month, period_year, base_salary, overtime_hours, overtime_pay, bonus, income_tax, national_insurance, health_insurance, pension_employee, status, notes, created_at) VALUES
      (1, 'אברהם כהן', 3, 2026, 1800000, 20, 225000, 50000, 200000, 80000, 50000, 50000, 'paid', 'שכר מרץ 2026', NOW()),
      (5, 'דוד לוי', 3, 2026, 1500000, 15, 150000, 0, 160000, 70000, 45000, 45000, 'paid', 'שכר מרץ 2026', NOW()),
      (10, 'יוסף מזרחי', 3, 2026, 2000000, 10, 166000, 100000, 250000, 90000, 55000, 55000, 'paid', 'שכר מרץ + בונוס', NOW()),
      (20, 'רונן אברהם', 3, 2026, 1200000, 25, 200000, 0, 140000, 60000, 40000, 40000, 'pending', 'שכר מרץ 2026', NOW()),
      (30, 'אמיר לוי', 3, 2026, 1400000, 0, 0, 30000, 150000, 65000, 42000, 42000, 'pending', 'שכר מרץ 2026', NOW()),
      (50, 'נועה ישראלי', 3, 2026, 1600000, 8, 100000, 0, 170000, 75000, 48000, 48000, 'paid', 'שכר מרץ 2026', NOW()),
      (75, 'עמית פרץ', 3, 2026, 2200000, 5, 90000, 200000, 280000, 95000, 58000, 58000, 'paid', 'שכר מרץ + בונוס', NOW()),
      (100, 'ליאור חדד', 3, 2026, 1300000, 30, 325000, 0, 155000, 62000, 41000, 41000, 'pending', 'שעות נוספות רבות', NOW()),
      (120, 'מיכל דוד', 3, 2026, 1100000, 0, 0, 0, 110000, 55000, 38000, 38000, 'draft', 'שכר מרץ 2026', NOW()),
      (150, 'יעקב רוזן', 3, 2026, 1700000, 12, 170000, 50000, 190000, 78000, 49000, 49000, 'paid', 'שכר מרץ 2026', NOW())
    ON CONFLICT DO NOTHING`);

    await run("budgets", `INSERT INTO budgets (budget_name, category, department, fiscal_year, fiscal_month, budgeted_amount, amount, spent, status, notes, period_start, period_end, created_at, updated_at) VALUES
      ('תקציב ייצור 2026', 'תפעול', 'ייצור', 2026, 1, 500000000, 500000000, 120000000, 'פעיל', 'תקציב שנתי מחלקת ייצור', '2026-01-01', '2026-12-31', NOW(), NOW()),
      ('תקציב חומרי גלם', 'רכש', 'רכש', 2026, 1, 300000000, 300000000, 85000000, 'פעיל', 'תקציב חומרי גלם שנתי', '2026-01-01', '2026-12-31', NOW(), NOW()),
      ('תקציב שכר', 'שכר', 'משאבי אנוש', 2026, 1, 400000000, 400000000, 100000000, 'פעיל', 'תקציב שכר שנתי', '2026-01-01', '2026-12-31', NOW(), NOW()),
      ('תקציב שיווק', 'שיווק', 'שיווק', 2026, 1, 50000000, 50000000, 12000000, 'פעיל', 'תקציב שיווק ופרסום', '2026-01-01', '2026-12-31', NOW(), NOW()),
      ('תקציב תחזוקה', 'תחזוקה', 'תחזוקה', 2026, 1, 80000000, 80000000, 15000000, 'פעיל', 'תקציב תחזוקת ציוד ומכונות', '2026-01-01', '2026-12-31', NOW(), NOW()),
      ('תקציב IT', 'טכנולוגיה', 'מערכות מידע', 2026, 1, 30000000, 30000000, 8000000, 'פעיל', 'תקציב מערכות ותוכנה', '2026-01-01', '2026-12-31', NOW(), NOW())
    ON CONFLICT DO NOTHING`);

    await run("fixed_assets", `INSERT INTO fixed_assets (asset_name, asset_number, category, location, purchase_date, purchase_cost, depreciation_method, useful_life_years, salvage_value, status, notes, created_at, updated_at) VALUES
      ('מכונת לייזר Trumpf 3030', 'FA-001', 'ציוד ייצור', 'אולם A', '2022-06-15', 120000000, 'straight_line', 10, 12000000, 'active', 'מכונת חיתוך לייזר ראשית', NOW(), NOW()),
      ('מכונת כיפוף Bystronic', 'FA-002', 'ציוד ייצור', 'אולם A', '2021-03-20', 85000000, 'straight_line', 10, 8500000, 'active', 'כיפוף פח', NOW(), NOW()),
      ('מלגזה Toyota 3.5T', 'FA-003', 'ציוד הובלה', 'מחסן ראשי', '2023-01-10', 25000000, 'straight_line', 8, 2500000, 'active', 'מלגזה ראשית', NOW(), NOW()),
      ('משאית Isuzu NPR', 'FA-004', 'ציוד הובלה', 'חנייה', '2024-06-01', 35000000, 'straight_line', 7, 3500000, 'active', 'משאית משלוחים', NOW(), NOW()),
      ('מערכת צביעה אלקטרוסטטית', 'FA-005', 'ציוד ייצור', 'מחלקת צבע', '2022-09-01', 45000000, 'straight_line', 10, 4500000, 'active', 'קו צביעה אבקתית', NOW(), NOW()),
      ('מכבש הידראולי 200T', 'FA-006', 'ציוד ייצור', 'אולם A', '2020-04-01', 65000000, 'straight_line', 10, 6500000, 'active', 'מכבש לעיבוד כבד', NOW(), NOW()),
      ('מערכת ERP', 'FA-007', 'תוכנה', 'משרדים', '2025-01-01', 15000000, 'straight_line', 5, 0, 'active', 'מערכת ניהול מפעל', NOW(), NOW()),
      ('לייזר סיבי Trumpf 5030', 'FA-008', 'ציוד ייצור', 'אולם A', '2024-01-15', 180000000, 'straight_line', 10, 18000000, 'active', 'לייזר סיבי 6KW', NOW(), NOW())
    ON CONFLICT DO NOTHING`);

    await run("machine_maintenance", `INSERT INTO machine_maintenance (machine_id, maintenance_type, scheduled_date, completed_date, status, performed_by, description, parts_used, cost, downtime_hours, priority, notes, created_at, updated_at) VALUES
      (1, 'preventive', '2026-02-01', '2026-02-01', 'completed', 'רועי טכנאי', 'תחזוקה מונעת — ניקוי ושימון', 'שמן תעשייתי, מסנן אוויר', 250000, 4, 'medium', 'בוצע כמתוכנן', NOW(), NOW()),
      (2, 'corrective', '2026-01-15', '2026-01-16', 'completed', 'משה טכנאי', 'תיקון מערכת הידראולית', 'צינור הידראולי, אטם', 850000, 12, 'high', 'דליפת שמן — תוקן', NOW(), NOW()),
      (3, 'preventive', '2026-02-20', '2026-02-20', 'completed', 'רועי טכנאי', 'החלפת להב ושימון', 'להב מקדח HSS', 120000, 2, 'low', 'שגרתי', NOW(), NOW()),
      (6, 'corrective', '2026-03-10', NULL, 'in_progress', 'דוד טכנאי', 'החלפת להב מסור', 'להב מסור סרט 5300מם', 350000, 8, 'high', 'מכונה מושבתת', NOW(), NOW()),
      (8, 'preventive', '2026-04-01', NULL, 'scheduled', '', 'ניקוי תא ריסוס', '', 0, 0, 'medium', 'מתוכנן לאפריל', NOW(), NOW()),
      (10, 'calibration', '2026-03-05', '2026-03-05', 'completed', 'טכנאי חיצוני', 'כיול מערכת לייזר', 'עדשת מיקוד', 450000, 6, 'high', 'כיול שנתי', NOW(), NOW())
    ON CONFLICT DO NOTHING`);

    await run("financial_transactions", `INSERT INTO financial_transactions (transaction_number, transaction_type, amount, currency, description, transaction_date, status, created_by, notes, created_at) VALUES
      ('FT-2026-0001', 'income', 5900000, 'ILS', 'תשלום לקוח — חשבונית INV-2026-0001', '2026-01-25', 'posted', 1, 'תשלום מלא', NOW()),
      ('FT-2026-0002', 'expense', 1770000, 'ILS', 'תשלום ספק — הזמנה PO-2026-0001', '2026-02-01', 'posted', 1, 'שילמנו עם קבלה', NOW()),
      ('FT-2026-0003', 'income', 3776000, 'ILS', 'תשלום לקוח — חשבונית INV-2026-0002', '2026-02-10', 'posted', 1, 'העברה בנקאית', NOW()),
      ('FT-2026-0004', 'expense', 2714000, 'ILS', 'תשלום ספק — הזמנה PO-2026-0002', '2026-02-15', 'posted', 1, 'צק', NOW()),
      ('FT-2026-0005', 'expense', 1545000, 'ILS', 'שכר עובדים — מרץ (חלקי)', '2026-03-01', 'draft', 1, 'העברה אוטומטית', NOW()),
      ('FT-2026-0006', 'income', 3186000, 'ILS', 'תשלום לקוח — חשבונית INV-2026-0005', '2026-03-10', 'posted', 1, 'כרטיס אשראי', NOW()),
      ('FT-2026-0007', 'expense', 944000, 'ILS', 'תשלום ספק — הזמנה PO-2026-0003', '2026-03-01', 'posted', 1, 'העברה', NOW()),
      ('FT-2026-0008', 'income', 3540000, 'ILS', 'תשלום חלקי — חשבונית INV-2026-0006', '2026-03-15', 'posted', 1, 'תשלום ראשון מתוך 2', NOW())
    ON CONFLICT DO NOTHING`);

    await run("projects_module", `INSERT INTO projects_module (name, description, client, status, start_date, end_date, budget, completion, manager, priority, created_at, updated_at) VALUES
      ('בניין מגורים רמת גן', 'חלונות ודלתות 120 יחידות', 'חברת בנייה א.ב.', 'active', '2026-01-01', '2026-12-31', 250000000, 18, 'אבי מנהל', 'high', NOW(), NOW()),
      ('מרכז מסחרי נתניה', 'חזיתות אלומיניום וזכוכית', 'נדלן בעמ', 'active', '2026-02-01', '2026-08-30', 180000000, 16, 'דני מנהל', 'high', NOW(), NOW()),
      ('בית ספר חולון', 'שערים ומעקות', 'עיריית חולון', 'planning', '2026-04-01', '2026-11-30', 95000000, 0, 'משה מנהל', 'medium', NOW(), NOW()),
      ('מפעל ראשלצ', 'קונסטרוקציית פלדה', 'תעשיות מתקדמות בעמ', 'active', '2025-11-01', '2026-06-30', 320000000, 47, 'יוסי מנהל', 'critical', NOW(), NOW()),
      ('מרפאה הרצליה', 'חלונות וויטרינות', 'כללית שירותי בריאות', 'completed', '2025-06-01', '2026-01-15', 45000000, 100, 'אבי מנהל', 'medium', NOW(), NOW()),
      ('מלון אילת', 'חזיתות + מעקות + דלתות', 'רשת מלונות', 'active', '2026-01-15', '2027-03-31', 550000000, 14, 'דני מנהל', 'high', NOW(), NOW()),
      ('משרדים תל אביב', 'מחיצות זכוכית — בהמתנה לאישור', 'הייטק ישראל בעמ', 'on_hold', '2026-03-01', '2026-09-30', 120000000, 8, 'משה מנהל', 'low', NOW(), NOW()),
      ('אולם ספורט באר שבע', 'קונסטרוקציה + חיפוי', 'עיריית באר שבע', 'planning', '2026-05-01', '2027-02-28', 280000000, 0, 'יוסי מנהל', 'medium', NOW(), NOW())
    ON CONFLICT DO NOTHING`);

    await run("leads", `INSERT INTO leads (source, status, first_name, last_name, company_name, email, phone, estimated_value, notes, created_at, updated_at) VALUES
      ('website', 'new', 'רונן', 'אברהם', 'בנייה ופיתוח', 'ronen@build.co.il', '050-1234567', 15000000, 'מעוניין בחלונות למגורים', NOW(), NOW()),
      ('referral', 'contacted', 'שירה', 'כהן', 'עיצוב פנים שירה', 'shira@design.co.il', '052-9876543', 8000000, 'דלתות מעוצבות', NOW(), NOW()),
      ('exhibition', 'qualified', 'אמיר', 'לוי', 'מפעלי מתכת הצפון', 'amir@north-metal.co.il', '054-5555555', 35000000, 'קונסטרוקציית פלדה', NOW(), NOW()),
      ('cold_call', 'proposal_sent', 'נועה', 'ישראלי', 'אדריכלות נועה', 'noa@arch.co.il', '053-1111111', 12000000, 'חזית אלומיניום למשרדים', NOW(), NOW()),
      ('website', 'new', 'יוסף', 'מזרחי', 'קבלן עצמאי', 'yosef@build.co.il', '050-2222222', 5000000, 'מעקות נירוסטה לבניין', NOW(), NOW()),
      ('linkedin', 'contacted', 'מיכל', 'דוד', 'רשת חנויות MK', 'michal@mk.co.il', '052-3333333', 20000000, 'ויטרינות זכוכית', NOW(), NOW()),
      ('referral', 'qualified', 'עמית', 'פרץ', 'בתי ספר ירוקים', 'amit@green.co.il', '054-4444444', 45000000, 'פרגולות ומעקות', NOW(), NOW()),
      ('exhibition', 'new', 'ליאור', 'חדד', 'הנדסת מבנים ל.ח.', 'lior@eng.co.il', '053-6666666', 28000000, 'שערי חנייה חשמליים', NOW(), NOW())
    ON CONFLICT DO NOTHING`);

    await run("alerts", `INSERT INTO alerts (user_id, alert_type, category, title, message, priority, is_read, created_at) VALUES
      (1, 'warning', 'inventory', 'מלאי נמוך — אלומיניום 6063', 'המלאי ירד מתחת ל-100 קג — יש להזמין', 1, false, NOW()),
      (1, 'critical', 'production', 'מכונה מושבתת — מסור סרט MCH-006', 'דרושה החלפת להב — מכונה לא פעילה', 1, false, NOW()),
      (1, 'info', 'finance', 'חשבונית באיחור — INV-2026-0004', 'חשבונית של 53,100 שח באיחור 22 יום', 2, false, NOW()),
      (1, 'warning', 'hr', 'בקשת חופשה ממתינה', '4 בקשות חופשה ממתינות לאישור', 2, true, NOW()),
      (1, 'info', 'quality', 'בדיקת איכות נכשלה — QC-2026-003', 'חלון אלומיניום W-50 — סטייה במידות', 2, false, NOW()),
      (1, 'critical', 'maintenance', 'תחזוקה מתוכננת — מכונת צביעה', 'תחזוקה מתוכננת ל-1.4.2026 — יש לתאם', 1, false, NOW()),
      (1, 'info', 'sales', 'הזמנה חדשה — PRJ-2026-006', 'פרויקט מלון אילת — 550,000 שח', 3, true, NOW()),
      (1, 'warning', 'delivery', 'משלוח באיחור — DN-2026-0005', 'משלוח לאילת באיחור 3 ימים', 2, false, NOW())
    ON CONFLICT DO NOTHING`);

    await run("warehouses", `INSERT INTO warehouses (name, code, warehouse_type, address, capacity, current_utilization, notes, is_active, created_at, updated_at) VALUES
      ('מחסן ראשי', 'WH-001', 'main', '{"street":"רחוב התעשייה 5","city":"חולון"}', 5000, 64.00, 'מחסן חומרי גלם ראשי', true, NOW(), NOW()),
      ('מחסן מוצרים מוגמרים', 'WH-002', 'finished', '{"street":"רחוב התעשייה 5","city":"חולון"}', 3000, 60.00, 'מחסן מוצרים מוגמרים', true, NOW(), NOW()),
      ('מחסן חיצוני נתניה', 'WH-003', 'external', '{"street":"אזור תעשייה","city":"נתניה"}', 2000, 30.00, 'מחסן חיצוני לאחסון עודפים', true, NOW(), NOW()),
      ('מחסן כלי עבודה', 'WH-004', 'tools', '{"street":"בניין B","city":"חולון"}', 500, 80.00, 'כלי עבודה וציוד', true, NOW(), NOW()),
      ('מחסן זכוכית', 'WH-005', 'specialized', '{"street":"מבנה ייעודי","city":"חולון"}', 1500, 60.00, 'אחסון זכוכית מחוסמת', true, NOW(), NOW())
    ON CONFLICT DO NOTHING`);

    await run("warehouse_locations", `INSERT INTO warehouse_locations (warehouse_id, location_code, zone, aisle, shelf, bin, is_occupied, is_active, created_at)
      SELECT w.id, v.loc, v.zone, v.aisle, v.shelf, v.bin, v.occ, true, NOW()
      FROM (VALUES
        ('WH-001', 'A-01-01', 'A', '01', '01', '01', true),
        ('WH-001', 'A-01-02', 'A', '01', '01', '02', true),
        ('WH-001', 'A-02-01', 'A', '02', '01', '01', false),
        ('WH-001', 'B-01-01', 'B', '01', '01', '01', true),
        ('WH-001', 'B-02-01', 'B', '02', '01', '01', true),
        ('WH-002', 'C-01-01', 'C', '01', '01', '01', true),
        ('WH-002', 'C-01-02', 'C', '01', '01', '02', false),
        ('WH-002', 'D-01-01', 'D', '01', '01', '01', true),
        ('WH-005', 'G-01-01', 'G', '01', '01', '01', true),
        ('WH-005', 'G-01-02', 'G', '01', '01', '02', true)
      ) AS v(wcode, loc, zone, aisle, shelf, bin, occ)
      JOIN warehouses w ON w.code = v.wcode
    ON CONFLICT DO NOTHING`);

    await run("contracts", `INSERT INTO contracts (contract_number, title, contract_type, party_type, party_name, start_date, end_date, value, currency, status, notes, is_active, created_at, updated_at) VALUES
      ('CON-2026-001', 'חוזה אספקת אלומיניום שנתי', 'supply', 'supplier', 'אלומיניום ישראל בעמ', '2026-01-01', '2026-12-31', 500000000, 'ILS', 'active', 'חוזה מסגרת שנתי', true, NOW(), NOW()),
      ('CON-2026-002', 'חוזה תחזוקת מכונות', 'service', 'supplier', 'שירותי תחזוקה מתקדמים', '2026-01-01', '2027-06-30', 120000000, 'ILS', 'active', 'תחזוקה מונעת למכונות CNC', true, NOW(), NOW()),
      ('CON-2026-003', 'חוזה פרויקט בניין מגורים', 'project', 'customer', 'חברת בנייה א.ב.', '2026-01-01', '2026-12-31', 250000000, 'ILS', 'active', 'חלונות ודלתות 120 יחידות', true, NOW(), NOW()),
      ('CON-2026-004', 'חוזה פרויקט מלון אילת', 'project', 'customer', 'רשת מלונות', '2026-01-15', '2027-03-31', 550000000, 'ILS', 'active', 'חזיתות + מעקות + דלתות', true, NOW(), NOW()),
      ('CON-2026-005', 'חוזה שכירות מחסן נתניה', 'lease', 'supplier', 'נדלן תעשייתי בעמ', '2025-07-01', '2027-06-30', 36000000, 'ILS', 'active', 'שכירות חודשית 150,000 אג', true, NOW(), NOW()),
      ('CON-2026-006', 'חוזה ביטוח מפעל', 'insurance', 'supplier', 'הראל ביטוח', '2026-01-01', '2026-12-31', 18000000, 'ILS', 'active', 'ביטוח מקיף + צד ג', true, NOW(), NOW()),
      ('CON-2025-007', 'חוזה פרויקט מרפאה', 'project', 'customer', 'כללית שירותי בריאות', '2025-06-01', '2026-01-15', 45000000, 'ILS', 'completed', 'הושלם בהצלחה', true, NOW(), NOW()),
      ('CON-2026-008', 'חוזה אספקת זכוכית', 'supply', 'supplier', 'זכוכית ירושלים', '2026-03-01', '2027-02-28', 200000000, 'ILS', 'active', 'זכוכית מחוסמת ומרובדת', true, NOW(), NOW())
    ON CONFLICT DO NOTHING`);

    await run("calendar_events", `INSERT INTO calendar_events (user_id, title, event_type, event_date, start_time, end_time, is_all_day, is_completed, priority, description, created_at, updated_at) VALUES
      (1, 'ישיבת הנהלה שבועית', 'meeting', '2026-03-23', '09:00', '10:30', false, false, 'high', 'סקירת פרויקטים + תקציב', NOW(), NOW()),
      (1, 'בדיקת איכות — פרויקט רמת גן', 'inspection', '2026-03-24', '08:00', '12:00', false, false, 'high', 'בדיקת חלונות לפני משלוח', NOW(), NOW()),
      (1, 'פגישה עם ספק אלומיניום', 'meeting', '2026-03-25', '14:00', '15:30', false, false, 'medium', 'סיכום הזמנה רבעונית', NOW(), NOW()),
      (1, 'תחזוקה מתוכננת — מכונת צביעה', 'maintenance', '2026-04-01', '07:00', '15:00', true, false, 'high', 'תחזוקה מונעת שנתית', NOW(), NOW()),
      (1, 'הדרכת בטיחות — כל המפעל', 'training', '2026-04-05', '08:00', '12:00', false, false, 'critical', 'הדרכה חובה לכל העובדים', NOW(), NOW()),
      (1, 'סיור לקוח באתר מלון אילת', 'visit', '2026-04-10', '10:00', '16:00', true, false, 'medium', 'בדיקת התקדמות עם לקוח', NOW(), NOW()),
      (1, 'ישיבת תכנון ייצור חודשית', 'meeting', '2026-04-02', '09:00', '11:00', false, false, 'high', 'תכנון עבודה לאפריל', NOW(), NOW()),
      (1, 'ביקורת ISO שנתית', 'audit', '2026-05-15', '08:00', '17:00', true, false, 'critical', 'ביקורת ISO 9001 חיצונית', NOW(), NOW())
    ON CONFLICT DO NOTHING`);

    await run("attendance_records", `INSERT INTO attendance_records (employee_name, attendance_date, check_in, check_out, total_hours, overtime_hours, status, shift_type, department, created_at, updated_at) VALUES
      ('אברהם כהן', '2026-03-20', '07:00', '16:30', 9.5, 1.5, 'present', 'morning', 'ייצור', NOW(), NOW()),
      ('דוד לוי', '2026-03-20', '07:15', '16:00', 8.75, 0.75, 'present', 'morning', 'ייצור', NOW(), NOW()),
      ('יוסף מזרחי', '2026-03-20', '07:00', '17:00', 10, 2, 'present', 'morning', 'הנהלה', NOW(), NOW()),
      ('משה ישראלי', '2026-03-20', '07:30', '16:00', 8.5, 0.5, 'present', 'morning', 'מחסן', NOW(), NOW()),
      ('רונן אברהם', '2026-03-20', NULL, NULL, 0, 0, 'absent', 'morning', 'ייצור', NOW(), NOW()),
      ('שירה כהן', '2026-03-20', '08:00', '17:00', 9, 1, 'present', 'morning', 'משרד', NOW(), NOW()),
      ('אמיר לוי', '2026-03-20', '06:45', '15:30', 8.75, 0.75, 'present', 'morning', 'ריתוך', NOW(), NOW()),
      ('נועה ישראלי', '2026-03-20', '07:00', '16:00', 9, 1, 'present', 'morning', 'איכות', NOW(), NOW()),
      ('עמית פרץ', '2026-03-20', '14:00', '22:00', 8, 0, 'present', 'evening', 'ייצור', NOW(), NOW()),
      ('ליאור חדד', '2026-03-20', '07:00', '16:00', 9, 1, 'present', 'morning', 'התקנות', NOW(), NOW()),
      ('אברהם כהן', '2026-03-19', '07:00', '16:00', 9, 1, 'present', 'morning', 'ייצור', NOW(), NOW()),
      ('דוד לוי', '2026-03-19', '07:00', '16:00', 9, 1, 'present', 'morning', 'ייצור', NOW(), NOW())
    ON CONFLICT DO NOTHING`);

    await run("training_records", `INSERT INTO training_records (training_number, training_name, training_type, category, trainer_name, location, start_date, duration_hours, status, is_mandatory, department, cost_per_person, notes, created_at, updated_at) VALUES
      ('TR-2026-001', 'הדרכת בטיחות כללית', 'safety', 'בטיחות', 'אורי מדריך', 'כיתת הדרכה', '2026-01-15', 4, 'completed', true, 'כל המפעל', 0, 'הדרכה שנתית חובה', NOW(), NOW()),
      ('TR-2026-002', 'הפעלת מכונת CNC', 'internal', 'הכשרה טכנית', 'דני טכנאי', 'אולם A', '2026-02-01', 16, 'completed', false, 'ייצור', 50000, 'הכשרה לעובדים חדשים', NOW(), NOW()),
      ('TR-2026-003', 'ריתוך TIG נירוסטה', 'certification', 'הסמכה', 'מכון התקנים', 'מכון התקנים ת"א', '2026-02-15', 40, 'completed', false, 'ריתוך', 250000, 'הסמכת רתכים', NOW(), NOW()),
      ('TR-2026-004', 'עבודה בגובה', 'safety', 'בטיחות', 'חברת בטיחות בגובה', 'שטח המפעל', '2026-03-01', 8, 'completed', true, 'התקנות', 30000, 'חובה להתקנות חיצוניות', NOW(), NOW()),
      ('TR-2026-005', 'ISO 9001 — מודעות עובדים', 'workshop', 'איכות', 'רונית מנהלת איכות', 'כיתת הדרכה', '2026-03-10', 4, 'in_progress', true, 'כל המפעל', 0, 'הכנה לביקורת ISO', NOW(), NOW()),
      ('TR-2026-006', 'הפעלת מלגזה', 'certification', 'הסמכה', 'מכון בטיחות', 'חצר המפעל', '2026-04-01', 24, 'planned', true, 'מחסן', 120000, 'חידוש רישיון מלגזה', NOW(), NOW()),
      ('TR-2026-007', 'שימוש במערכת ERP', 'online', 'מערכות', 'צוות IT', 'חדר ישיבות', '2026-03-20', 8, 'in_progress', false, 'כל המפעל', 0, 'הדרכה על מערכת חדשה', NOW(), NOW()),
      ('TR-2026-008', 'כיבוי אש ופינוי', 'safety', 'בטיחות', 'כיבוי אש חולון', 'שטח המפעל', '2026-04-15', 4, 'planned', true, 'כל המפעל', 0, 'תרגיל פינוי שנתי', NOW(), NOW())
    ON CONFLICT DO NOTHING`);

    await run("sales_orders", `INSERT INTO sales_orders (order_number, customer_id, customer_name, order_date, delivery_date, status, subtotal, discount_amount, tax_amount, total, paid_amount, payment_status, notes, created_at, updated_at) VALUES
      ('SO-2025-001', 1, 'אבא בניין בעמ', '2025-04-05', '2025-05-15', 'delivered', 350000, 0, 63000, 413000, 413000, 'paid', 'פרויקט ראשון Q2', NOW() - INTERVAL '12 months', NOW() - INTERVAL '12 months'),
      ('SO-2025-002', 2, 'דור אלומיניום תעשייתי', '2025-04-20', '2025-05-30', 'delivered', 520000, 0, 93600, 613600, 613600, 'paid', 'חלונות דירה', NOW() - INTERVAL '11 months 10 days', NOW() - INTERVAL '11 months 10 days'),
      ('SO-2025-003', 3, 'קונסטרוקט זכוכית בעמ', '2025-05-08', '2025-06-15', 'delivered', 890000, 0, 160200, 1050200, 1050200, 'paid', 'חזיתות מגורים', NOW() - INTERVAL '11 months', NOW() - INTERVAL '11 months'),
      ('SO-2025-004', 4, 'רנטקס מתכות', '2025-05-22', '2025-07-01', 'delivered', 2800000, 0, 504000, 3304000, 3304000, 'paid', 'חזית שלב א', NOW() - INTERVAL '10 months 10 days', NOW() - INTERVAL '10 months 10 days'),
      ('SO-2025-005', 5, 'סטודיו עיצוב ארכיטקטוני', '2025-06-03', '2025-07-15', 'delivered', 650000, 0, 117000, 767000, 767000, 'paid', 'שערים ומעקות ספריה', NOW() - INTERVAL '10 months', NOW() - INTERVAL '10 months'),
      ('SO-2025-006', 1, 'אבא בניין בעמ', '2025-06-18', '2025-08-01', 'delivered', 1200000, 0, 216000, 1416000, 1416000, 'paid', 'דלתות כניסה בניין ב', NOW() - INTERVAL '9 months 15 days', NOW() - INTERVAL '9 months 15 days'),
      ('SO-2025-007', 2, 'דור אלומיניום תעשייתי', '2025-07-02', '2025-08-15', 'delivered', 1750000, 0, 315000, 2065000, 2065000, 'paid', 'קונסטרוקציה שלב א', NOW() - INTERVAL '9 months', NOW() - INTERVAL '9 months'),
      ('SO-2025-008', 3, 'קונסטרוקט זכוכית בעמ', '2025-07-15', '2025-08-30', 'delivered', 480000, 0, 86400, 566400, 566400, 'paid', 'חלונות ויטרינות', NOW() - INTERVAL '8 months 15 days', NOW() - INTERVAL '8 months 15 days'),
      ('SO-2025-009', 4, 'רנטקס מתכות', '2025-08-01', '2025-09-10', 'delivered', 920000, 0, 165600, 1085600, 1085600, 'paid', 'מרכז מסחרי שלב א', NOW() - INTERVAL '8 months', NOW() - INTERVAL '8 months'),
      ('SO-2025-010', 5, 'סטודיו עיצוב ארכיטקטוני', '2025-08-20', '2025-10-01', 'delivered', 3200000, 0, 576000, 3776000, 3776000, 'paid', 'מעקות מלון', NOW() - INTERVAL '7 months 15 days', NOW() - INTERVAL '7 months 15 days'),
      ('SO-2025-011', 1, 'אבא בניין בעמ', '2025-09-05', '2025-10-20', 'delivered', 750000, 0, 135000, 885000, 885000, 'paid', 'מחיצות זכוכית', NOW() - INTERVAL '7 months', NOW() - INTERVAL '7 months'),
      ('SO-2025-012', 2, 'דור אלומיניום תעשייתי', '2025-09-18', '2025-11-01', 'delivered', 1100000, 0, 198000, 1298000, 1298000, 'paid', 'פרויקט מגדלים', NOW() - INTERVAL '6 months 15 days', NOW() - INTERVAL '6 months 15 days'),
      ('SO-2025-013', 3, 'קונסטרוקט זכוכית בעמ', '2025-10-02', '2025-11-15', 'delivered', 550000, 0, 99000, 649000, 649000, 'paid', 'שיפוץ שערים', NOW() - INTERVAL '6 months', NOW() - INTERVAL '6 months'),
      ('SO-2025-014', 4, 'רנטקס מתכות', '2025-10-20', '2025-12-01', 'delivered', 2100000, 0, 378000, 2478000, 2478000, 'paid', 'קונסטרוקציה שלב ב', NOW() - INTERVAL '5 months 15 days', NOW() - INTERVAL '5 months 15 days'),
      ('SO-2025-015', 5, 'סטודיו עיצוב ארכיטקטוני', '2025-11-03', '2025-12-20', 'delivered', 680000, 0, 122400, 802400, 802400, 'paid', 'דירות מגורים רמת גן', NOW() - INTERVAL '5 months', NOW() - INTERVAL '5 months'),
      ('SO-2025-016', 1, 'אבא בניין בעמ', '2025-11-15', '2026-01-15', 'delivered', 1450000, 0, 261000, 1711000, 1711000, 'paid', 'חזיתות שכונה חדשה', NOW() - INTERVAL '4 months 15 days', NOW() - INTERVAL '4 months 15 days'),
      ('SO-2025-017', 2, 'דור אלומיניום תעשייתי', '2025-12-01', '2026-01-30', 'delivered', 870000, 0, 156600, 1026600, 1026600, 'paid', 'מרכז מסחרי שלב ב', NOW() - INTERVAL '4 months', NOW() - INTERVAL '4 months'),
      ('SO-2025-018', 3, 'קונסטרוקט זכוכית בעמ', '2025-12-15', '2026-02-15', 'shipped', 1300000, 0, 234000, 1534000, 767000, 'partial', 'פרויקט יוקרה תל אביב', NOW() - INTERVAL '3 months 15 days', NOW() - INTERVAL '3 months 15 days'),
      ('SO-2026-001', 1, 'אבא בניין בעמ', '2026-01-15', '2026-06-30', 'confirmed', 3831000, 0, 689580, 4520580, 0, 'unpaid', 'מגדלי רמת גן — חלונות ודלתות', NOW() - INTERVAL '3 months', NOW() - INTERVAL '3 months'),
      ('SO-2026-002', 2, 'דור אלומיניום תעשייתי', '2026-01-20', '2026-08-31', 'confirmed', 9400000, 0, 1692000, 11092000, 0, 'unpaid', 'מרכז מסחרי נתניה — חזיתות', NOW() - INTERVAL '2 months 20 days', NOW() - INTERVAL '2 months 20 days'),
      ('SO-2026-003', 5, 'סטודיו עיצוב ארכיטקטוני', '2026-02-05', '2026-05-31', 'confirmed', 1700000, 0, 306000, 2006000, 0, 'unpaid', 'בית ספר חולון — מעקות ושערים', NOW() - INTERVAL '2 months', NOW() - INTERVAL '2 months'),
      ('SO-2026-004', 4, 'רנטקס מתכות', '2026-02-10', '2026-04-30', 'confirmed', 11300000, 0, 2034000, 13334000, 6000000, 'partial', 'מפעל ראשלצ — קונסטרוקציה', NOW() - INTERVAL '1 month 20 days', NOW() - INTERVAL '1 month 20 days'),
      ('SO-2026-005', 3, 'קונסטרוקט זכוכית בעמ', '2026-02-20', '2026-05-15', 'confirmed', 1100000, 0, 198000, 1298000, 0, 'unpaid', 'מרפאת הרצליה — חלונות וויטרינות', NOW() - INTERVAL '1 month 10 days', NOW() - INTERVAL '1 month 10 days'),
      ('SO-2026-006', 4, 'רנטקס מתכות', '2026-03-01', '2027-03-31', 'confirmed', 29400000, 0, 5292000, 34692000, 5000000, 'partial', 'מלון אילת — חזיתות מעקות ודלתות', NOW() - INTERVAL '1 month', NOW() - INTERVAL '1 month'),
      ('SO-2026-007', 3, 'קונסטרוקט זכוכית בעמ', '2026-03-10', '2026-09-30', 'draft', 4200000, 0, 756000, 4956000, 0, 'unpaid', 'פרויקט מגדלים ב — הצעה ראשונית', NOW() - INTERVAL '20 days', NOW() - INTERVAL '20 days'),
      ('SO-2026-008', 1, 'אבא בניין בעמ', '2026-03-15', '2026-06-30', 'draft', 750000, 0, 135000, 885000, 0, 'unpaid', 'משרדי הייטק — מחיצות זכוכית', NOW() - INTERVAL '15 days', NOW() - INTERVAL '15 days'),
      ('SO-2026-009', 2, 'דור אלומיניום תעשייתי', '2026-03-20', '2026-07-31', 'confirmed', 2800000, 0, 504000, 3304000, 0, 'unpaid', 'שכונת מגורים ב — חלונות', NOW() - INTERVAL '10 days', NOW() - INTERVAL '10 days'),
      ('SO-2026-010', 5, 'סטודיו עיצוב ארכיטקטוני', '2026-03-28', '2026-08-31', 'draft', 980000, 0, 176400, 1156400, 0, 'unpaid', 'בניין יוקרה — חלונות מיוחדים', NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days'),
      ('SO-2025-019', 4, 'רנטקס מתכות', '2025-04-12', '2025-06-01', 'delivered', 760000, 0, 136800, 896800, 896800, 'paid', 'פרופילים ושערים תעשייתיים', NOW() - INTERVAL '12 months', NOW() - INTERVAL '12 months'),
      ('SO-2025-020', 5, 'סטודיו עיצוב ארכיטקטוני', '2025-05-18', '2025-07-01', 'delivered', 430000, 0, 77400, 507400, 507400, 'paid', 'ויטרינות ודלתות זכוכית', NOW() - INTERVAL '11 months', NOW() - INTERVAL '11 months'),
      ('SO-2025-021', 1, 'אבא בניין בעמ', '2025-07-25', '2025-09-15', 'delivered', 980000, 0, 176400, 1156400, 1156400, 'paid', 'חלונות כיתות לבית ספר', NOW() - INTERVAL '8 months', NOW() - INTERVAL '8 months'),
      ('SO-2025-022', 2, 'דור אלומיניום תעשייתי', '2025-10-08', '2025-11-30', 'delivered', 1450000, 0, 261000, 1711000, 1711000, 'paid', 'פרופילים אלומיניום מחסן', NOW() - INTERVAL '6 months', NOW() - INTERVAL '6 months'),
      ('SO-2025-023', 3, 'קונסטרוקט זכוכית בעמ', '2025-11-20', '2026-01-20', 'delivered', 620000, 0, 111600, 731600, 731600, 'paid', 'מחיצות זכוכית אוניברסיטה', NOW() - INTERVAL '4 months', NOW() - INTERVAL '4 months'),
      ('SO-2025-024', 4, 'רנטקס מתכות', '2025-12-10', '2026-02-28', 'shipped', 1850000, 0, 333000, 2183000, 1091500, 'partial', 'שערים תעשייתיים + מעקות', NOW() - INTERVAL '3 months 20 days', NOW() - INTERVAL '3 months 20 days'),
      ('SO-2026-011', 5, 'סטודיו עיצוב ארכיטקטוני', '2026-01-08', '2026-04-15', 'confirmed', 720000, 0, 129600, 849600, 0, 'unpaid', 'ויטרינות חנויות קניון', NOW() - INTERVAL '2 months 25 days', NOW() - INTERVAL '2 months 25 days'),
      ('SO-2026-012', 1, 'אבא בניין בעמ', '2026-02-25', '2026-06-01', 'confirmed', 3100000, 0, 558000, 3658000, 0, 'unpaid', 'מגדל מגורים יוקרתי', NOW() - INTERVAL '1 month 5 days', NOW() - INTERVAL '1 month 5 days')
    ON CONFLICT (order_number) DO NOTHING`);

    await run("sales_order_items", `INSERT INTO sales_order_items (order_id, product_name, quantity, unit, unit_price, vat_percent, total_price, notes, created_at)
      SELECT o.id, v.pname, v.qty, v.u, v.uprice, v.vat, v.total, v.notes, NOW()
      FROM (VALUES
        ('SO-2026-001', 'חלון אלומיניום 120x150', 80, 'unit', 250000, 18, 23600000, 'פרויקט רמת גן'),
        ('SO-2026-001', 'דלת כניסה אלומיניום', 40, 'unit', 450000, 18, 21240000, 'פרויקט רמת גן'),
        ('SO-2026-002', 'חזית אלומיניום', 500, 'm2', 120000, 18, 70800000, 'מרכז מסחרי'),
        ('SO-2026-002', 'חזית זכוכית', 300, 'm2', 180000, 18, 63720000, 'מרכז מסחרי'),
        ('SO-2026-003', 'שער חנייה חשמלי', 2, 'unit', 3500000, 18, 8260000, 'בית ספר'),
        ('SO-2026-003', 'מעקה נירוסטה', 150, 'm', 85000, 18, 15045000, 'בית ספר'),
        ('SO-2026-004', 'קונסטרוקציית פלדה', 45, 'ton', 2800000, 18, 148680000, 'מפעל ראשלצ'),
        ('SO-2026-005', 'חלון אלומיניום 100x120', 30, 'unit', 200000, 18, 7080000, 'מרפאה הרצליה'),
        ('SO-2026-005', 'ויטרינת זכוכית', 8, 'unit', 650000, 18, 6136000, 'מרפאה הרצליה'),
        ('SO-2026-006', 'חזית אלומיניום מלון', 1200, 'm2', 150000, 18, 212400000, 'מלון אילת'),
        ('SO-2026-006', 'מעקה נירוסטה מלון', 400, 'm', 90000, 18, 42480000, 'מלון אילת'),
        ('SO-2026-006', 'דלת אלומיניום מלון', 200, 'unit', 380000, 18, 89680000, 'מלון אילת')
      ) AS v(onum, pname, qty, u, uprice, vat, total, notes)
      JOIN sales_orders o ON o.order_number = v.onum
    ON CONFLICT DO NOTHING`);

    // === שיקים ===
    await run("checks", `INSERT INTO checks (check_number, check_type, bank_name, branch, account_number, payee, payer, amount, currency, issue_date, due_date, status, partner_type, notes, created_at, updated_at) VALUES
      ('1001', 'received', 'בנק הפועלים', '123', '456789', 'טכנו-כל עוזי בעמ', 'חברת בנייה מרכזית', 15000000, 'ILS', '2026-01-15', '2026-03-15', 'deposited', 'customer', 'תשלום הזמנה SO-2026-001', NOW(), NOW()),
      ('1002', 'received', 'בנק לאומי', '045', '987654', 'טכנו-כל עוזי בעמ', 'קבלן רמת גן', 8500000, 'ILS', '2026-02-01', '2026-04-01', 'pending', 'customer', 'מקדמה פרויקט רמת גן', NOW(), NOW()),
      ('1003', 'issued', 'בנק דיסקונט', '067', '112233', 'אלומיניום ישראל בעמ', 'טכנו-כל עוזי בעמ', 25000000, 'ILS', '2026-02-10', '2026-04-10', 'cleared', 'supplier', 'תשלום חומרי גלם', NOW(), NOW()),
      ('1004', 'received', 'בנק מזרחי', '012', '334455', 'טכנו-כל עוזי בעמ', 'נדלן חולון בעמ', 42000000, 'ILS', '2026-02-20', '2026-05-20', 'pending', 'customer', 'תשלום פרויקט מגדלים', NOW(), NOW()),
      ('1005', 'issued', 'בנק הפועלים', '123', '456789', 'חברת חשמל נתניה', 'טכנו-כל עוזי בעמ', 3500000, 'ILS', '2026-03-01', '2026-03-30', 'cleared', 'supplier', 'חשבון חשמל רבעוני', NOW(), NOW()),
      ('1006', 'received', 'בנק לאומי', '078', '556677', 'טכנו-כל עוזי בעמ', 'מלון ים אילת', 55000000, 'ILS', '2026-03-05', '2026-06-05', 'pending', 'customer', 'מקדמה חזיתות מלון', NOW(), NOW()),
      ('1007', 'issued', 'בנק דיסקונט', '067', '112233', 'שירותי תחזוקה בעמ', 'טכנו-כל עוזי בעמ', 6000000, 'ILS', '2026-03-10', '2026-04-10', 'pending', 'supplier', 'תשלום תחזוקה חודשי', NOW(), NOW()),
      ('1008', 'received', 'בנק הפועלים', '034', '889900', 'טכנו-כל עוזי בעמ', 'עיריית חולון', 18000000, 'ILS', '2026-03-15', '2026-05-15', 'deposited', 'customer', 'פרויקט ספריה עירונית', NOW(), NOW())
    ON CONFLICT DO NOTHING`);

    // === תזרים מזומנים ===
    await run("cash_flow_records", `INSERT INTO cash_flow_records (record_number, record_date, flow_type, category, description, amount, currency, customer_name, supplier_name, is_forecast, status, fiscal_year, fiscal_period, created_at, updated_at) VALUES
      ('CF-2026-001', '2026-01-15', 'inflow', 'מכירות', 'קבלה מפרויקט רמת גן', 1500000.00, 'ILS', 'חברת בנייה מרכזית', NULL, false, 'actual', 2026, 1, NOW(), NOW()),
      ('CF-2026-002', '2026-01-20', 'outflow', 'חומרי גלם', 'רכישת אלומיניום', 800000.00, 'ILS', NULL, 'אלומיניום ישראל בעמ', false, 'actual', 2026, 1, NOW(), NOW()),
      ('CF-2026-003', '2026-02-01', 'outflow', 'שכר עבודה', 'משכורות ינואר 2026', 2500000.00, 'ILS', NULL, NULL, false, 'actual', 2026, 2, NOW(), NOW()),
      ('CF-2026-004', '2026-02-10', 'inflow', 'מכירות', 'קבלה ממלון אילת', 2000000.00, 'ILS', 'מלון ים אילת', NULL, false, 'actual', 2026, 2, NOW(), NOW()),
      ('CF-2026-005', '2026-02-15', 'outflow', 'ציוד', 'רכישת כלי חיתוך חדשים', 350000.00, 'ILS', NULL, 'כלי עבודה פרו', false, 'actual', 2026, 2, NOW(), NOW()),
      ('CF-2026-006', '2026-03-01', 'outflow', 'שכר עבודה', 'משכורות פברואר 2026', 2500000.00, 'ILS', NULL, NULL, false, 'actual', 2026, 3, NOW(), NOW()),
      ('CF-2026-007', '2026-03-15', 'inflow', 'מכירות', 'קבלה מעיריית חולון', 1800000.00, 'ILS', 'עיריית חולון', NULL, false, 'actual', 2026, 3, NOW(), NOW()),
      ('CF-2026-008', '2026-04-01', 'inflow', 'מכירות', 'תחזית — פרויקט נתניה', 3500000.00, 'ILS', 'קבלן נתניה', NULL, true, 'forecast', 2026, 4, NOW(), NOW()),
      ('CF-2026-009', '2026-04-15', 'outflow', 'חומרי גלם', 'תחזית — רכישת פלדה', 1200000.00, 'ILS', NULL, 'פלדת ישראל', true, 'forecast', 2026, 4, NOW(), NOW()),
      ('CF-2026-010', '2026-05-01', 'outflow', 'שכר עבודה', 'תחזית — משכורות אפריל', 2600000.00, 'ILS', NULL, NULL, true, 'forecast', 2026, 5, NOW(), NOW())
    ON CONFLICT DO NOTHING`);

    // === זיכויים ===
    await run("credit_notes", `INSERT INTO credit_notes (credit_number, credit_type, credit_date, customer_name, reason, reason_description, status, subtotal, vat_rate, vat_amount, total_amount, notes, created_at, updated_at) VALUES
      ('CN-2026-001', 'credit', '2026-01-20', 'חברת בנייה מרכזית', 'return', 'החזרת 5 חלונות פגומים מפרויקט רמת גן', 'approved', 125000.00, 18, 22500.00, 147500.00, 'זיכוי מלא — חלונות לא תקינים', NOW(), NOW()),
      ('CN-2026-002', 'credit', '2026-02-05', 'קבלן נתניה', 'defect', 'ציפוי לא אחיד על 10 פרופילים', 'draft', 85000.00, 18, 15300.00, 100300.00, 'ממתין לאישור מנהל', NOW(), NOW()),
      ('CN-2026-003', 'credit', '2026-02-18', 'נדלן חולון בעמ', 'overcharge', 'חישוב יתר במשלוח DN-2026-0003', 'approved', 45000.00, 18, 8100.00, 53100.00, 'הפרש מחיר מתוקן', NOW(), NOW()),
      ('CN-2026-004', 'debit', '2026-03-01', 'מלון ים אילת', 'return', 'מעקות נירוסטה — מידה שגויה', 'pending', 360000.00, 18, 64800.00, 424800.00, 'ייצור מחדש בתהליך', NOW(), NOW()),
      ('CN-2026-005', 'credit', '2026-03-10', 'עיריית חולון', 'discount', 'הנחת כמות רטרואקטיבית 5%', 'approved', 90000.00, 18, 16200.00, 106200.00, 'הנחה לפי הסכם מסגרת', NOW(), NOW())
    ON CONFLICT DO NOTHING`);

    // === פעילויות CRM ===
    await run("crm_activities", `INSERT INTO crm_activities (activity_type, subject, description, status, start_time, duration_minutes, outcome, location, is_active, created_at, updated_at) VALUES
      ('call', 'שיחת מעקב — קבלן נתניה', 'מעקב אחרי הצעת מחיר שנשלחה', 'completed', '2026-01-15 10:00', 15, 'הלקוח מעוניין — לשלוח חוזה', NULL, true, NOW(), NOW()),
      ('meeting', 'פגישה — פרויקט מלון אילת', 'סיכום דרישות לחזיתות ומעקות', 'completed', '2026-01-20 14:00', 90, 'סוכם מפרט טכני מלא', 'משרדי המלון אילת', true, NOW(), NOW()),
      ('email', 'הצעת מחיר — בית ספר חולון', 'שליחת הצעת מחיר מעודכנת', 'completed', '2026-02-01 09:00', 5, 'נשלח בהצלחה', NULL, true, NOW(), NOW()),
      ('task', 'הכנת מצגת למכרז עירוני', 'הכנת מצגת טכנית למכרז עיריית ת"א', 'in_progress', '2026-03-25 08:00', 120, NULL, 'משרד ראשי', true, NOW(), NOW()),
      ('call', 'שיחה — מפעל ראשלצ', 'בירור מועד התקנה מועדף', 'pending', '2026-03-28 11:00', 10, NULL, NULL, true, NOW(), NOW()),
      ('meeting', 'ביקור אתר — פרויקט הרצליה', 'מדידות שטח למרפאה', 'scheduled', '2026-04-02 10:00', 60, NULL, 'הרצליה — רח הנשיא 12', true, NOW(), NOW()),
      ('note', 'הערה — לקוח חדש פתח תקווה', 'לקוח פוטנציאלי — בניין משרדים 8 קומות', 'completed', '2026-03-10 16:00', 5, 'הועבר לצוות מכירות', NULL, true, NOW(), NOW()),
      ('task', 'עדכון קטלוג מוצרים', 'עדכון מחירון פרופילי אלומיניום Q2', 'pending', '2026-04-01 09:00', 180, NULL, 'משרד ראשי', true, NOW(), NOW())
    ON CONFLICT DO NOTHING`);

    // === מסמכים ===
    await run("documents", `INSERT INTO documents (title, description, type, file_path, status, created_at, updated_at) VALUES
      ('הצעת מחיר — פרויקט רמת גן', 'הצעת מחיר מפורטת לחלונות ודלתות', 'quote', '/documents/quotes/Q-2026-001.pdf', 'approved', NOW(), NOW()),
      ('חוזה — מלון אילת', 'חוזה ביצוע חזיתות ומעקות', 'contract', '/documents/contracts/CON-2026-003.pdf', 'active', NOW(), NOW()),
      ('תעודת ISO 9001', 'תעודת איכות ISO 9001:2015', 'certificate', '/documents/certs/ISO-9001.pdf', 'active', NOW(), NOW()),
      ('ביטוח אחריות מקצועית', 'פוליסת ביטוח אחריות מקצועית 2026', 'insurance', '/documents/insurance/prof-liability-2026.pdf', 'active', NOW(), NOW()),
      ('מפרט טכני — חזית אלומיניום', 'מפרט ביצוע חזיתות אלומיניום תרמי', 'technical', '/documents/specs/facade-spec.pdf', 'active', NOW(), NOW()),
      ('דוח בדיקת חומרים', 'תוצאות בדיקת מתיחה — פרופיל 6063', 'report', '/documents/reports/material-test-6063.pdf', 'active', NOW(), NOW()),
      ('אישור בטיחות מפעל', 'אישור בטיחות ממשרד העבודה', 'safety', '/documents/safety/factory-approval-2026.pdf', 'active', NOW(), NOW()),
      ('נוהל עבודה — ריתוך נירוסטה', 'נוהל עבודה מס 17 — ריתוך TIG', 'procedure', '/documents/procedures/welding-tig-proc.pdf', 'active', NOW(), NOW())
    ON CONFLICT DO NOTHING`);

    // === קווי ייצור ===
    await run("production_lines", `INSERT INTO production_lines (name, code, department, line_type, capacity_per_hour, status, notes, is_active, created_at, updated_at) VALUES
      ('קו חיתוך אלומיניום', 'PL-01', 'ייצור', 'cutting', 120.00, 'active', 'קו חיתוך ראשי — מסורים אוטומטיים', true, NOW(), NOW()),
      ('קו עיבוד CNC', 'PL-02', 'ייצור', 'machining', 45.00, 'active', 'קו CNC — 4 מכונות', true, NOW(), NOW()),
      ('קו הרכבה חלונות', 'PL-03', 'הרכבה', 'assembly', 30.00, 'active', 'הרכבת חלונות ודלתות אלומיניום', true, NOW(), NOW()),
      ('קו ריתוך נירוסטה', 'PL-04', 'ריתוך', 'welding', 20.00, 'active', 'ריתוך TIG/MIG נירוסטה', true, NOW(), NOW()),
      ('קו צביעה אלקטרוסטטית', 'PL-05', 'גמר', 'coating', 80.00, 'active', 'צביעה אלקטרוסטטית + תנור ייבוש', true, NOW(), NOW()),
      ('קו זיגוג', 'PL-06', 'זכוכית', 'glazing', 25.00, 'maintenance', 'קו הכנסת זכוכית לחלונות', true, NOW(), NOW()),
      ('קו כיפוף פלדה', 'PL-07', 'ייצור', 'bending', 15.00, 'active', 'כיפוף פרופילי פלדה', true, NOW(), NOW()),
      ('קו אריזה ומשלוח', 'PL-08', 'לוגיסטיקה', 'packing', 50.00, 'active', 'אריזה והכנה למשלוח', true, NOW(), NOW())
    ON CONFLICT DO NOTHING`);

    // === ציוד ===
    await run("equipment", `INSERT INTO equipment (asset_number, name, description, category, manufacturer, model, serial_number, purchase_date, purchase_price, location, department, status, is_active, created_at, updated_at) VALUES
      ('EQ-001', 'מסור אלומיניום דו-ראשי', 'מסור דו-ראשי אוטומטי לחיתוך פרופילים', 'cutting', 'Elumatec', 'DG-244', 'SN-2024-001', '2024-03-15', 18500000, 'אולם A', 'ייצור', 'active', true, NOW(), NOW()),
      ('EQ-002', 'מכונת CNC 5 צירים', 'מרכז עיבוד CNC רב-צירי', 'machining', 'Emmegi', 'Phantos T4', 'SN-2023-015', '2023-06-01', 45000000, 'אולם A', 'ייצור', 'active', true, NOW(), NOW()),
      ('EQ-003', 'מכונת ריתוך TIG', 'ריתוך TIG DC/AC לנירוסטה ואלומיניום', 'welding', 'Fronius', 'MagicWave 230i', 'SN-2024-022', '2024-01-10', 3500000, 'אולם B', 'ריתוך', 'active', true, NOW(), NOW()),
      ('EQ-004', 'מלגזה חשמלית 2.5 טון', 'מלגזה חשמלית לשינוע חומרים', 'material_handling', 'Toyota', 'Traigo 25', 'SN-2022-008', '2022-09-20', 12000000, 'מחסן ראשי', 'מחסן', 'active', true, NOW(), NOW()),
      ('EQ-005', 'מכונת כיפוף CNC', 'מכונת כיפוף פרופילים CNC', 'bending', 'Akyapak', 'APK 81', 'SN-2024-033', '2024-07-01', 22000000, 'אולם A', 'ייצור', 'active', true, NOW(), NOW()),
      ('EQ-006', 'קו צביעה אלקטרוסטטית', 'קו צביעה אבקתית מלא + תנור', 'coating', 'Gema', 'OptiCenter OC07', 'SN-2021-005', '2021-11-15', 85000000, 'אולם C', 'גמר', 'active', true, NOW(), NOW()),
      ('EQ-007', 'שולחן חיתוך זכוכית', 'שולחן חיתוך זכוכית אוטומטי', 'cutting', 'Bottero', '363 BCS', 'SN-2023-041', '2023-04-20', 35000000, 'אולם D', 'זכוכית', 'active', true, NOW(), NOW()),
      ('EQ-008', 'מגנוף הידראולי', 'מגנוף הידראולי 200 טון', 'pressing', 'Baykal', 'APHS 3108', 'SN-2020-012', '2020-08-10', 28000000, 'אולם A', 'ייצור', 'maintenance', true, NOW(), NOW()),
      ('EQ-009', 'מכונת נקודות ריתוך', 'מכונת ריתוך נקודתי לפלדה', 'welding', 'TECNA', '8204', 'SN-2024-055', '2024-02-28', 4500000, 'אולם B', 'ריתוך', 'active', true, NOW(), NOW()),
      ('EQ-010', 'מנוף גשר 5 טון', 'מנוף גשר חשמלי לאולם ייצור', 'lifting', 'Konecranes', 'CXT', 'SN-2019-003', '2019-12-01', 15000000, 'אולם A', 'ייצור', 'active', true, NOW(), NOW())
    ON CONFLICT DO NOTHING`);

    // === פרויקטים ===
    await run("projects", `INSERT INTO projects (project_number, project_name, customer_name, start_date, end_date, estimated_revenue, estimated_cost, status, department, manager_name, description, created_at, updated_at) VALUES
      ('PRJ-2026-001', 'מגדלי רמת גן — חלונות ודלתות', 'חברת בנייה מרכזית', '2026-01-15', '2026-06-30', 4500000.00, 2800000.00, 'active', 'ייצור', 'אבי כהן', 'ייצור והתקנת 800 חלונות ו-200 דלתות אלומיניום', NOW(), NOW()),
      ('PRJ-2026-002', 'מרכז מסחרי נתניה — חזיתות', 'קבלן נתניה', '2026-02-01', '2026-08-31', 8500000.00, 5200000.00, 'active', 'ייצור', 'דני לוי', 'חזיתות אלומיניום וזכוכית — 3,000 מר', NOW(), NOW()),
      ('PRJ-2026-003', 'בית ספר חולון — מעקות ושערים', 'עיריית חולון', '2026-03-01', '2026-05-31', 1200000.00, 750000.00, 'planning', 'התקנות', 'יוסי מזרחי', 'מעקות נירוסטה ושערי חנייה חשמליים', NOW(), NOW()),
      ('PRJ-2026-004', 'מפעל ראשלצ — קונסטרוקציה', 'תעשיות ראשלצ', '2026-01-10', '2026-04-30', 15000000.00, 9500000.00, 'active', 'ייצור', 'משה ברקוביץ', 'קונסטרוקציית פלדה — 45 טון', NOW(), NOW()),
      ('PRJ-2026-005', 'מרפאת הרצליה — חלונות וויטרינות', 'מרפאת שלום הרצליה', '2026-03-15', '2026-05-15', 950000.00, 580000.00, 'planning', 'ייצור', 'רונית שמיר', 'חלונות אלומיניום וויטרינות זכוכית', NOW(), NOW()),
      ('PRJ-2026-006', 'מלון אילת — חזיתות ומעקות', 'מלון ים אילת', '2026-02-15', '2026-10-31', 25000000.00, 16000000.00, 'active', 'ייצור', 'אבי כהן', 'חזיתות אלומיניום 1,200 מר + מעקות נירוסטה 400 מט', NOW(), NOW()),
      ('PRJ-2026-007', 'ספריה עירונית חולון', 'עיריית חולון', '2026-04-01', '2026-07-31', 3500000.00, 2100000.00, 'planning', 'ייצור', 'דני לוי', 'חלונות זכוכית כפולה + דלתות אוטומטיות', NOW(), NOW()),
      ('PRJ-2026-008', 'בניין משרדים ת"א — חלונות', 'נדלן תל אביב בעמ', '2026-05-01', '2026-09-30', 6000000.00, 3800000.00, 'planning', 'מכירות', 'רונית שמיר', 'חלונות אלומיניום תרמי — בניין 12 קומות', NOW(), NOW())
    ON CONFLICT DO NOTHING`);

    // === שערי חליפין ===
    await run("exchange_rates", `INSERT INTO exchange_rates (rate_number, currency_code, currency_name, base_currency, rate, previous_rate, change_percent, rate_date, source, rate_type, status, created_at, updated_at) VALUES
      ('ER-2026-001', 'USD', 'דולר אמריקאי', 'ILS', 3.6500, 3.6200, 0.83, '2026-03-22', 'bank_of_israel', 'official', 'active', NOW(), NOW()),
      ('ER-2026-002', 'EUR', 'אירו', 'ILS', 3.9800, 3.9500, 0.76, '2026-03-22', 'bank_of_israel', 'official', 'active', NOW(), NOW()),
      ('ER-2026-003', 'GBP', 'לירה שטרלינג', 'ILS', 4.6200, 4.5900, 0.65, '2026-03-22', 'bank_of_israel', 'official', 'active', NOW(), NOW()),
      ('ER-2026-004', 'CHF', 'פרנק שוויצרי', 'ILS', 4.1500, 4.1200, 0.73, '2026-03-22', 'bank_of_israel', 'official', 'active', NOW(), NOW()),
      ('ER-2026-005', 'JPY', 'ין יפני (100)', 'ILS', 2.4500, 2.4300, 0.82, '2026-03-22', 'bank_of_israel', 'official', 'active', NOW(), NOW()),
      ('ER-2026-006', 'CNY', 'יואן סיני', 'ILS', 0.5020, 0.4980, 0.80, '2026-03-22', 'bank_of_israel', 'official', 'active', NOW(), NOW())
    ON CONFLICT DO NOTHING`);

    // === צבעים ===
    await run("colors", `INSERT INTO colors (color_code, color_name, color_name_he, color_system, ral_number, hex_value, color_family, is_metallic, surcharge_percent, created_at, updated_at) VALUES
      ('RAL9016', 'Traffic White', 'לבן תנועה', 'RAL', '9016', '#F7F9EF', 'white', false, 0, NOW(), NOW()),
      ('RAL7016', 'Anthracite Grey', 'אפור אנתרציט', 'RAL', '7016', '#383E42', 'grey', false, 0, NOW(), NOW()),
      ('RAL9005', 'Jet Black', 'שחור עמוק', 'RAL', '9005', '#0E0E10', 'black', false, 0, NOW(), NOW()),
      ('RAL8017', 'Chocolate Brown', 'חום שוקולד', 'RAL', '8017', '#44322D', 'brown', false, 0, NOW(), NOW()),
      ('RAL1015', 'Light Ivory', 'שנהב בהיר', 'RAL', '1015', '#E6D2B5', 'beige', false, 0, NOW(), NOW()),
      ('RAL9006', 'White Aluminium', 'אלומיניום לבן', 'RAL', '9006', '#A5A8A6', 'silver', true, 15, NOW(), NOW()),
      ('RAL9007', 'Grey Aluminium', 'אלומיניום אפור', 'RAL', '9007', '#8F8F8C', 'silver', true, 15, NOW(), NOW()),
      ('ANO-NAT', 'Natural Anodized', 'אנודייז טבעי', 'ANODIZE', NULL, '#C0C0C0', 'silver', true, 25, NOW(), NOW()),
      ('ANO-BRZ', 'Bronze Anodized', 'אנודייז ברונזה', 'ANODIZE', NULL, '#8C7853', 'bronze', true, 30, NOW(), NOW()),
      ('WDG-OAK', 'Wood Grain Oak', 'דמוי עץ אלון', 'WOODGRAIN', NULL, '#9F7F5E', 'wood', false, 40, NOW(), NOW())
    ON CONFLICT DO NOTHING`);

    // === קטלוג זכוכית ===
    await run("glass_catalog", `INSERT INTO glass_catalog (glass_code, glass_name, glass_type, thickness_mm, is_laminated, is_insulated, is_tempered, is_heat_strengthened, coating, status, created_at, updated_at) VALUES
      ('GL-CLR-6', 'שקוף 6 ממ', 'clear', 6, false, false, false, false, NULL, 'active', NOW(), NOW()),
      ('GL-CLR-8T', 'שקוף 8 ממ מחוסם', 'clear', 8, false, false, true, false, NULL, 'active', NOW(), NOW()),
      ('GL-CLR-10T', 'שקוף 10 ממ מחוסם', 'clear', 10, false, false, true, false, NULL, 'active', NOW(), NOW()),
      ('GL-LAM-66', 'למינציה 6+6 שקוף', 'laminated', 12, true, false, false, false, NULL, 'active', NOW(), NOW()),
      ('GL-DGU-44', 'דאבל זיגוג 4-12-4', 'insulated', 20, false, true, false, false, NULL, 'active', NOW(), NOW()),
      ('GL-DGU-66T', 'דאבל זיגוג 6-16-6 מחוסם', 'insulated', 28, false, true, true, false, NULL, 'active', NOW(), NOW()),
      ('GL-LOWΕ-6', 'Low-E 6 ממ', 'low_e', 6, false, false, false, false, 'low_e', 'active', NOW(), NOW()),
      ('GL-TIN-8', 'גוון אפור 8 ממ', 'tinted', 8, false, false, false, false, NULL, 'active', NOW(), NOW()),
      ('GL-FRO-6T', 'חלבי 6 ממ מחוסם', 'frosted', 6, false, false, true, false, 'acid_etch', 'active', NOW(), NOW()),
      ('GL-REFL-8', 'רפלקטיבי 8 ממ', 'reflective', 8, false, false, false, false, 'reflective', 'active', NOW(), NOW())
    ON CONFLICT DO NOTHING`);

    // === פגישות ===
    await run("meetings", `INSERT INTO meetings (title, description, meeting_type, location, start_time, end_time, duration_minutes, status, outcome, is_active, created_at, updated_at) VALUES
      ('פגישת תכנון — מלון אילת', 'סיכום דרישות חזיתות ומעקות', 'project', 'חדר ישיבות ראשי', '2026-01-20 10:00', '2026-01-20 12:00', 120, 'completed', 'סוכם מפרט טכני מלא', true, NOW(), NOW()),
      ('סקירת ייצור שבועית', 'סקירת התקדמות כל הוראות העבודה', 'internal', 'חדר ישיבות', '2026-03-17 08:00', '2026-03-17 09:00', 60, 'completed', 'עדכוני סטטוס — 3 הוראות עבודה מאחרות', true, NOW(), NOW()),
      ('פגישת מכירות — בניין ת"א', 'הצגת הצעת מחיר לבניין משרדים', 'sales', 'משרדי הלקוח ת"א', '2026-03-25 14:00', '2026-03-25 15:30', 90, 'scheduled', NULL, true, NOW(), NOW()),
      ('ביקור אתר הרצליה', 'מדידות שטח למרפאה', 'site_visit', 'הרצליה — רח הנשיא 12', '2026-04-02 10:00', '2026-04-02 12:00', 120, 'planned', NULL, true, NOW(), NOW()),
      ('פגישת בטיחות חודשית', 'סקירת אירועי בטיחות ומעקב', 'safety', 'חדר ישיבות', '2026-03-20 07:30', '2026-03-20 08:30', 60, 'completed', 'אפס תאונות החודש', true, NOW(), NOW()),
      ('ישיבת הנהלה', 'סקירה חודשית — תוצאות כספיות ותפעוליות', 'management', 'חדר הנהלה', '2026-03-31 09:00', '2026-03-31 11:00', 120, 'scheduled', NULL, true, NOW(), NOW())
    ON CONFLICT DO NOTHING`);

    // === מפרטי ייצור (BOM) ===
    await run("bom_headers", `INSERT INTO bom_headers (bom_number, name, product_name, product_sku, version, status, description, total_cost, created_at, updated_at) VALUES
      ('BOM-001', 'חלון אלומיניום 120x150', 'חלון אלומיניום 120x150', 'WIN-AL-120150', '1.0', 'active', 'מפרט ייצור — חלון דו-כנפי אלומיניום תרמי', 185000, NOW(), NOW()),
      ('BOM-002', 'דלת כניסה אלומיניום', 'דלת כניסה אלומיניום', 'DOR-AL-ENT', '1.0', 'active', 'מפרט ייצור — דלת כניסה ראשית אלומיניום', 380000, NOW(), NOW()),
      ('BOM-003', 'מעקה נירוסטה מטר', 'מעקה נירוסטה', 'RAIL-SS-1M', '2.0', 'active', 'מפרט ייצור — מעקה נירוסטה 316L למטר רץ', 72000, NOW(), NOW()),
      ('BOM-004', 'חזית אלומיניום מר', 'חזית אלומיניום תרמי', 'FAC-AL-1M2', '1.0', 'active', 'מפרט ייצור — חזית מבנה אלומיניום תרמי למטר רבוע', 105000, NOW(), NOW()),
      ('BOM-005', 'שער חנייה חשמלי', 'שער חנייה חשמלי', 'GAT-EL-STD', '1.0', 'active', 'מפרט ייצור — שער חנייה הזזה חשמלי', 2800000, NOW(), NOW()),
      ('BOM-006', 'ויטרינת זכוכית', 'ויטרינת זכוכית מחוסמת', 'VIT-GL-STD', '1.0', 'active', 'מפרט ייצור — ויטרינת זכוכית מחוסמת עם מסגרת אלומיניום', 520000, NOW(), NOW())
    ON CONFLICT DO NOTHING`);

    // === הוראות תחזוקה ===
    await run("maintenance_orders", `INSERT INTO maintenance_orders (order_number, maintenance_type, title, description, priority, status, equipment_name, equipment_code, equipment_location, department, reported_by, reported_date, assigned_to, created_at, updated_at) VALUES
      ('MO-2026-001', 'preventive', 'תחזוקה מונעת — מסור דו-ראשי', 'החלפת להבים + כיול + סיכה', 'medium', 'completed', 'מסור אלומיניום דו-ראשי', 'EQ-001', 'אולם A', 'ייצור', 'דני טכנאי', '2026-01-10', 'מוטי תחזוקה', NOW(), NOW()),
      ('MO-2026-002', 'corrective', 'תיקון — מכונת CNC ציר Y', 'רעידות בציר Y — בדיקת מסבים', 'high', 'in_progress', 'מכונת CNC 5 צירים', 'EQ-002', 'אולם A', 'ייצור', 'אבי מפעיל', '2026-03-15', 'שירות Emmegi', NOW(), NOW()),
      ('MO-2026-003', 'preventive', 'תחזוקה שנתית — מלגזה', 'שירות שנתי + בדיקת בטיחות', 'medium', 'open', 'מלגזה חשמלית 2.5 טון', 'EQ-004', 'מחסן ראשי', 'מחסן', 'יוסי מחסנאי', '2026-03-20', 'שירות Toyota', NOW(), NOW()),
      ('MO-2026-004', 'corrective', 'תיקון — מגנוף הידראולי', 'דליפת שמן הידראולי — החלפת אטמים', 'high', 'completed', 'מגנוף הידראולי', 'EQ-008', 'אולם A', 'ייצור', 'משה מפעיל', '2026-02-20', 'מוטי תחזוקה', NOW(), NOW()),
      ('MO-2026-005', 'predictive', 'בדיקת רעידות — מנוף גשר', 'בדיקת רעידות תקופתית + מתיחת כבלים', 'low', 'open', 'מנוף גשר 5 טון', 'EQ-010', 'אולם A', 'ייצור', 'בודק חיצוני', '2026-04-01', 'חברת מנופים', NOW(), NOW()),
      ('MO-2026-006', 'preventive', 'תחזוקה — קו צביעה', 'ניקוי אקדחי ריסוס + החלפת פילטרים', 'medium', 'completed', 'קו צביעה אלקטרוסטטית', 'EQ-006', 'אולם C', 'גמר', 'רון גמר', '2026-03-01', 'מוטי תחזוקה', NOW(), NOW())
    ON CONFLICT DO NOTHING`);

    // === פריטי הזמנות רכש ===
    await run("purchase_order_items", `INSERT INTO purchase_order_items (order_id, item_code, item_description, quantity, unit, unit_price, tax_percent, total_price, received_quantity, created_at)
      SELECT po.id, v.item_code, v.item_description, v.quantity, v.unit, v.unit_price, 18, v.total_price, v.received_quantity, NOW()
      FROM (VALUES
        ('PO-2026-0001', 'AL-6063-T5', 'פרופיל אלומיניום 6063 T5 — 6 מטר', 200, 'מטר', 7500, 1500000, 200),
        ('PO-2026-0001', 'AL-GASKET', 'אטם EPDM לחלונות', 500, 'מטר', 800, 400000, 500),
        ('PO-2026-0002', 'ST-Q235', 'פלדה Q235 — פס 50x5', 300, 'מטר', 4500, 1350000, 300),
        ('PO-2026-0002', 'ST-TUBE-40', 'צינור פלדה 40x40x2', 150, 'מטר', 6200, 930000, 150),
        ('PO-2026-0003', 'GL-CLR-8', 'זכוכית שקופה 8 ממ מחוסמת', 50, 'מר', 16000, 800000, 30),
        ('PO-2026-0004', 'FE-IPE-120', 'ברזל IPE 120 — 6 מטר', 100, 'יחידה', 18000, 1800000, 0),
        ('PO-2026-0004', 'FE-PLATE-6', 'פלטה ברזל 6 ממ 1.5x3', 40, 'יחידה', 42500, 1700000, 0),
        ('PO-2026-0005', 'WLD-MIG-08', 'חוט ריתוך MIG 0.8 ממ', 50, 'ק"ג', 8500, 425000, 50),
        ('PO-2026-0005', 'WLD-GAS-MIX', 'גז מעורב CO2/Argon', 10, 'בלון', 52000, 520000, 10),
        ('PO-2026-0006', 'PNT-POWDER-W', 'צבע אבקתי לבן RAL 9016', 80, 'ק"ג', 9500, 760000, 80),
        ('PO-2026-0006', 'PNT-PRIMER', 'פריימר אפוקסי', 30, 'ליטר', 14500, 435000, 30),
        ('PO-2026-0007', 'SS-316L-TUBE', 'צינור נירוסטה 316L 50.8x1.5', 200, 'מטר', 12000, 2400000, 120),
        ('PO-2026-0007', 'SS-316L-PLATE', 'פלטת נירוסטה 316L 3 ממ', 30, 'יחידה', 58000, 1740000, 15),
        ('PO-2026-0008', 'SEAL-SIL-W', 'סיליקון לבן 310 מל', 100, 'יחידה', 3200, 320000, 100),
        ('PO-2026-0008', 'SEAL-BUTYL', 'בוטיל סרט 6 ממ', 200, 'מטר', 1750, 350000, 200),
        ('PO-2026-0009', 'AL-4520-TH', 'פרופיל תרמי 4520', 300, 'מטר', 3800, 1140000, 0),
        ('PO-2026-0009', 'AL-CORNER', 'זווית אלומיניום 30x30', 500, 'מטר', 1300, 650000, 0),
        ('PO-2026-0010', 'HW-BOLT-M10', 'בורג M10x30 נירוסטה', 1000, 'יחידה', 280, 280000, 0),
        ('PO-2026-0010', 'HW-NUT-M10', 'אום M10 נירוסטה', 1000, 'יחידה', 120, 120000, 0),
        ('PO-2026-0010', 'HW-ANCHOR-M12', 'עוגן כימי M12', 200, 'יחידה', 850, 170000, 0)
      ) AS v(order_number, item_code, item_description, quantity, unit, unit_price, total_price, received_quantity)
      JOIN purchase_orders po ON po.order_number = v.order_number
      ON CONFLICT DO NOTHING`);

    // === שורות מפרט ייצור (BOM Lines) ===
    await run("bom_lines", `INSERT INTO bom_lines (bom_header_id, component_name, component_sku, quantity, unit, unit_cost, total_cost, level, position_number, is_critical, created_at, updated_at)
      SELECT bh.id, v.component_name, v.component_sku, v.qty, v.unit, v.unit_cost, v.total_cost, 1, v.pos, v.is_critical, NOW(), NOW()
      FROM (VALUES
        ('BOM-001', 'פרופיל אלומיניום 4520', 'AL-4520', 6.4, 'מטר', 3800, 24320, 1, true),
        ('BOM-001', 'זכוכית תרמית 24 ממ', 'GL-THERM-24', 1.8, 'מר', 45000, 81000, 2, true),
        ('BOM-001', 'אטם EPDM', 'SEAL-EPDM', 6.4, 'מטר', 800, 5120, 3, false),
        ('BOM-001', 'ידית חלון', 'HW-HANDLE-W', 2, 'יחידה', 8500, 17000, 4, false),
        ('BOM-002', 'פרופיל כניסה אלומיניום', 'AL-DOOR-ENT', 8.2, 'מטר', 5200, 42640, 1, true),
        ('BOM-002', 'זכוכית מחוסמת 10 ממ', 'GL-TEMP-10', 1.2, 'מר', 28000, 33600, 2, true),
        ('BOM-002', 'מנעול רב-נקודתי', 'HW-LOCK-MP', 1, 'יחידה', 85000, 85000, 3, true),
        ('BOM-002', 'צירים הידראוליים', 'HW-HINGE-HYD', 3, 'יחידה', 22000, 66000, 4, false),
        ('BOM-003', 'צינור נירוסטה 50.8', 'SS-TUBE-50', 3, 'מטר', 12000, 36000, 1, true),
        ('BOM-003', 'פלנג נירוסטה', 'SS-FLANGE', 2, 'יחידה', 4500, 9000, 2, false),
        ('BOM-003', 'זכוכית מחוסמת 12 ממ', 'GL-TEMP-12', 1, 'מר', 32000, 32000, 3, true),
        ('BOM-004', 'פרופיל חזית תרמי', 'AL-FACADE', 5, 'מטר', 6800, 34000, 1, true),
        ('BOM-004', 'זכוכית תרמית Low-E', 'GL-LOWE-24', 1, 'מר', 55000, 55000, 2, true),
        ('BOM-004', 'בורג נירוסטה M8', 'HW-BOLT-M8', 20, 'יחידה', 180, 3600, 3, false),
        ('BOM-005', 'צינור פלדה 80x80', 'ST-TUBE-80', 12, 'מטר', 8500, 102000, 1, true),
        ('BOM-005', 'מנוע חשמלי 380V', 'EL-MOTOR-380', 1, 'יחידה', 280000, 280000, 2, true),
        ('BOM-005', 'גלגלת פלדה V', 'HW-WHEEL-V', 8, 'יחידה', 15000, 120000, 3, true),
        ('BOM-005', 'שלט רחוק + מקלט', 'EL-REMOTE', 1, 'סט', 45000, 45000, 4, false),
        ('BOM-006', 'זכוכית מחוסמת 10 ממ', 'GL-TEMP-10-V', 3, 'מר', 28000, 84000, 1, true),
        ('BOM-006', 'מסגרת אלומיניום חזית', 'AL-FRAME-VIT', 8, 'מטר', 4200, 33600, 2, true),
        ('BOM-006', 'סיליקון מבני', 'SEAL-STRUCT', 4, 'שפופרת', 12000, 48000, 3, false)
      ) AS v(bom_number, component_name, component_sku, qty, unit, unit_cost, total_cost, pos, is_critical)
      JOIN bom_headers bh ON bh.bom_number = v.bom_number
      ON CONFLICT DO NOTHING`);

    // === משימות פרויקט ===
    await run("project_tasks", `INSERT INTO project_tasks (project_id, title, description, assignee, status, priority, due_date, created_at, updated_at)
      SELECT p.id, v.title, v.description, v.assignee, v.status, v.priority, v.due_date::date, NOW(), NOW()
      FROM (VALUES
        (1, 'תכנון ראשוני', 'עיצוב ושרטוט ראשוני של חזיתות המבנה', 'דוד כהן', 'done', 'high', '2026-02-01'),
        (1, 'הזמנת חומרים', 'הזמנת אלומיניום וזכוכית למלון', 'יוסי לוי', 'done', 'high', '2026-02-15'),
        (1, 'חיתוך פרופילים', 'חיתוך כל הפרופילים לפי רשימת חיתוך', 'אבי מזרחי', 'in_progress', 'medium', '2026-03-01'),
        (1, 'הרכבה — קומה 1', 'הרכבת חלונות וחזיתות קומה ראשונה', 'צוות הרכבה', 'todo', 'medium', '2026-04-01'),
        (2, 'מדידות שטח', 'מדידות מדויקות באתר הבנייה', 'רון שמעון', 'done', 'high', '2026-01-20'),
        (2, 'אישור שרטוטים', 'אישור שרטוטי ייצור עם אדריכל', 'דוד כהן', 'in_progress', 'high', '2026-02-28'),
        (2, 'ייצור שערים', 'ייצור 4 שערי כניסה', 'מחלקת ייצור', 'todo', 'medium', '2026-03-30'),
        (3, 'סקר מבנה', 'סקר מצב המבנה הקיים', 'מהנדס מבנים', 'done', 'high', '2026-01-15'),
        (3, 'תכנון מעקות', 'תכנון מעקות נירוסטה + זכוכית 8 קומות', 'דוד כהן', 'in_progress', 'high', '2026-03-15'),
        (4, 'הכנת הצעת מחיר', 'הצעת מחיר מפורטת למרכז מסחרי', 'שרון מכירות', 'done', 'high', '2026-02-05'),
        (4, 'חתימת חוזה', 'חתימת חוזה עם הקבלן הראשי', 'מנהל פרויקטים', 'done', 'high', '2026-02-20'),
        (4, 'ייצור חזיתות', 'ייצור חזיתות אלומיניום למרכז מסחרי', 'מחלקת ייצור', 'todo', 'high', '2026-05-01'),
        (5, 'בחירת גוון', 'בחירת גוון RAL עם הלקוח', 'שרון מכירות', 'done', 'low', '2026-01-25'),
        (5, 'ייצור פרגולה', 'ייצור פרגולה ביוקלימטית 5x8', 'מחלקת ייצור', 'in_progress', 'medium', '2026-03-20'),
        (6, 'תכנון מדרגות', 'תכנון מדרגות ספירלה נירוסטה', 'דוד כהן', 'in_progress', 'high', '2026-03-25'),
        (7, 'סקר בטיחות', 'סקר בטיחות גדרות בית ספר', 'בודק בטיחות', 'done', 'high', '2026-01-30'),
        (7, 'ייצור גדרות', 'ייצור 120 מטר גדר אלומיניום', 'מחלקת ייצור', 'in_progress', 'medium', '2026-04-15'),
        (8, 'אישור תב"ע', 'אישור היתר בנייה מהעירייה', 'מנהל פרויקטים', 'todo', 'high', '2026-05-01')
      ) AS v(pid, title, description, assignee, status, priority, due_date)
      JOIN projects p ON p.id = v.pid
      ON CONFLICT DO NOTHING`);

    // === פריטי הצעות מחיר ===
    await run("quote_items", `INSERT INTO quote_items (quote_id, line_number, description, quantity, unit, unit_price, discount_percent, tax_rate, line_total, delivery_days, notes, created_at, updated_at)
      SELECT q.id, v.line_number, v.description, v.quantity, 'מטר', v.unit_price, 0, 18, v.line_total, v.delivery_days, v.notes, NOW(), NOW()
      FROM (VALUES
        (1, 1, 'מעקה אלומיניום כולל זכוכית', 45, 95000, 4275000, 21, 'כולל התקנה'),
        (1, 2, 'מאחז יד נירוסטה 316L', 45, 12000, 540000, 21, ''),
        (2, 1, 'שער חשמלי הזזה 5 מטר', 1, 1200000, 1200000, 30, 'כולל שלט'),
        (2, 2, 'גדר אלומיניום 1.5 מטר', 30, 35000, 1050000, 21, ''),
        (3, 1, 'חלונות אלומיניום תרמי', 25, 250000, 6250000, 30, 'כולל התקנה וזיגוג'),
        (3, 2, 'דלתות כניסה אלומיניום', 4, 800000, 3200000, 30, 'דלת כניסה ראשית'),
        (4, 1, 'חזית אלומיניום תרמי', 200, 120000, 24000000, 45, 'חזית קיר מסך מלא'),
        (5, 1, 'פרגולה ביוקלימטית 5x8', 1, 4500000, 4500000, 30, 'כולל מנוע'),
        (5, 2, 'תאורת LED פרגולה', 1, 250000, 250000, 14, 'תאורה מובנית'),
        (6, 1, 'מדרגות ספירלה נירוסטה', 1, 5000000, 5000000, 45, 'כולל מעקה זכוכית'),
        (7, 1, 'סורגים דקורטיביים', 12, 180000, 2160000, 14, 'סורג ברזל מעוצב'),
        (8, 1, 'מעקה מרפסת זכוכית', 80, 95000, 7600000, 30, 'זכוכית 12 ממ'),
        (9, 1, 'גדר תעשייתית 2 מטר', 200, 28000, 5600000, 21, 'גדר ברזל + שער'),
        (9, 2, 'שער כניסה תעשייתי', 2, 950000, 1900000, 30, 'שער חשמלי'),
        (10, 1, 'תריסי אלומיניום חשמליים', 15, 350000, 5250000, 21, 'כולל מנוע ושלט')
      ) AS v(qid, line_number, description, quantity, unit_price, line_total, delivery_days, notes)
      JOIN quotes q ON q.id = v.qid
      ON CONFLICT DO NOTHING`);

    // === חשבונות חייבים (AR) ===
    await run("accounts_receivable", `INSERT INTO accounts_receivable (ar_number, invoice_number, customer_name, customer_phone, invoice_date, due_date, amount, vat_amount, paid_amount, status, payment_terms, description, category, salesperson, created_at, updated_at) VALUES
      ('AR-2026-001', 'INV-2026-0001', 'חברת בנייה ליבי בע"מ', '03-5552001', '2026-01-15', '2026-03-15', 450000, 81000, 450000, 'partial', 'שוטף+60', 'מעקות אלומיניום — פרויקט ת"א', 'מעקות', 'שרון מכירות', NOW(), NOW()),
      ('AR-2026-002', 'INV-2026-0002', 'נכסי השקעות ים', '03-5552002', '2026-01-20', '2026-02-20', 1200000, 216000, 1416000, 'paid', 'שוטף+30', 'שער חשמלי + גדר — הרצליה', 'שערים', 'שרון מכירות', NOW(), NOW()),
      ('AR-2026-003', 'INV-2026-0003', 'עיריית באר שבע', '08-6292003', '2026-02-01', '2026-05-01', 6250000, 1125000, 0, 'open', 'שוטף+90', 'חלונות למבנה ציבורי', 'חלונות', 'אמיר מכירות', NOW(), NOW()),
      ('AR-2026-004', 'INV-2026-0004', 'קבוצת כרמל בנייה', '04-8552004', '2026-02-10', '2026-04-10', 24000000, 4320000, 12000000, 'partial', 'שוטף+60', 'חזית אלומיניום — מגדל חיפה', 'חזיתות', 'שרון מכירות', NOW(), NOW()),
      ('AR-2026-005', 'INV-2026-0005', 'מלונות הים התיכון', '03-5552005', '2026-02-15', '2026-03-15', 4500000, 810000, 5310000, 'paid', 'שוטף+30', 'פרגולה ביוקלימטית — מלון נתניה', 'פרגולות', 'שרון מכירות', NOW(), NOW()),
      ('AR-2026-006', 'INV-2026-0006', 'משה כהן — קבלן פרטי', '050-5552009', '2026-03-01', '2026-04-01', 180000, 32400, 0, 'open', 'שוטף+30', 'סורגים — בית פרטי', 'סורגים', 'אמיר מכירות', NOW(), NOW()),
      ('AR-2026-007', 'INV-2026-0007', 'דירות יוקרה ת"א', '03-5552011', '2026-03-05', '2026-05-05', 7600000, 1368000, 3000000, 'partial', 'שוטף+60', 'מעקות זכוכית — 16 קומות', 'מעקות', 'שרון מכירות', NOW(), NOW()),
      ('AR-2026-008', 'INV-2026-0008', 'פארק תעשייה ערד', '08-9952024', '2026-03-10', '2026-04-10', 5600000, 1008000, 0, 'overdue', 'שוטף+30', 'גדר תעשייתית + שערים', 'גדרות', 'אמיר מכירות', NOW(), NOW())
    ON CONFLICT DO NOTHING`);

    // === חשבונות ספקים (AP) ===
    await run("accounts_payable", `INSERT INTO accounts_payable (ap_number, invoice_number, supplier_name, invoice_date, due_date, amount, vat_amount, paid_amount, status, payment_terms, description, category, department, created_at, updated_at) VALUES
      ('AP-2026-001', 'SINV-8001', 'אלומיניום הצפון', '2026-01-10', '2026-03-10', 1500000, 270000, 1770000, 'paid', 'שוטף+60', 'פרופילי אלומיניום 6063', 'חומרי גלם', 'רכש', NOW(), NOW()),
      ('AP-2026-002', 'SINV-8002', 'ברזל ופלדה ישראל', '2026-01-15', '2026-03-15', 2300000, 414000, 0, 'open', 'שוטף+60', 'פלדה Q235 + צינורות', 'חומרי גלם', 'רכש', NOW(), NOW()),
      ('AP-2026-003', 'SINV-8003', 'זכוכית הדרום', '2026-02-01', '2026-03-01', 800000, 144000, 944000, 'paid', 'שוטף+30', 'זכוכית מחוסמת 8 ממ', 'חומרי גלם', 'רכש', NOW(), NOW()),
      ('AP-2026-004', 'SINV-8004', 'חומרי ריתוך מקצועיים', '2026-02-10', '2026-03-10', 950000, 171000, 0, 'overdue', 'שוטף+30', 'חוטי ריתוך + גז', 'מתכלים', 'ייצור', NOW(), NOW()),
      ('AP-2026-005', 'SINV-8005', 'צבעים תעשייתיים', '2026-02-15', '2026-04-15', 1200000, 216000, 600000, 'partial', 'שוטף+60', 'צבע אבקתי + פריימר', 'מתכלים', 'גמר', NOW(), NOW()),
      ('AP-2026-006', 'SINV-8006', 'נירוסטה פלוס', '2026-03-01', '2026-05-01', 4200000, 756000, 0, 'open', 'שוטף+60', 'צינורות ופלטות נירוסטה 316L', 'חומרי גלם', 'רכש', NOW(), NOW()),
      ('AP-2026-007', 'SINV-8007', 'ברגים ואביזרים', '2026-03-05', '2026-04-05', 560000, 100800, 660800, 'paid', 'שוטף+30', 'ברגים + אומים + עוגנים', 'אביזרים', 'מחסן', NOW(), NOW()),
      ('AP-2026-008', 'SINV-8008', 'איטום ובידוד', '2026-03-10', '2026-04-10', 670000, 120600, 0, 'open', 'שוטף+30', 'סיליקון + בוטיל', 'מתכלים', 'ייצור', NOW(), NOW())
    ON CONFLICT DO NOTHING`);

    // === ספר חשבון ראשי (General Ledger) ===
    await run("general_ledger", `INSERT INTO general_ledger (entry_number, entry_date, account_number, account_name, account_type, description, source_type, debit_amount, credit_amount, balance, currency, fiscal_year, fiscal_period, status, created_at, updated_at) VALUES
      ('GL-2026-0001', '2026-01-15', '1110', 'קופה ראשית', 'asset', 'תשלום מלקוח — חברת ליבי', 'receipt', 531000, 0, 531000, 'ILS', 2026, 1, 'posted', NOW(), NOW()),
      ('GL-2026-0002', '2026-01-15', '4100', 'הכנסות ממכירות', 'revenue', 'חשבונית — מעקות אלומיניום', 'invoice', 0, 450000, -450000, 'ILS', 2026, 1, 'posted', NOW(), NOW()),
      ('GL-2026-0003', '2026-01-15', '4500', 'מע"מ עסקאות', 'liability', 'מע"מ על חשבונית', 'invoice', 0, 81000, -81000, 'ILS', 2026, 1, 'posted', NOW(), NOW()),
      ('GL-2026-0004', '2026-01-20', '5100', 'רכישת חומרי גלם', 'expense', 'הזמנת אלומיניום — PO-2026-0001', 'purchase', 1500000, 0, 1500000, 'ILS', 2026, 1, 'posted', NOW(), NOW()),
      ('GL-2026-0005', '2026-01-20', '4600', 'מע"מ תשומות', 'asset', 'מע"מ על הזמנת רכש', 'purchase', 270000, 0, 270000, 'ILS', 2026, 1, 'posted', NOW(), NOW()),
      ('GL-2026-0006', '2026-01-20', '2110', 'ספקים', 'liability', 'חוב לספק — אלומיניום הצפון', 'purchase', 0, 1770000, -1770000, 'ILS', 2026, 1, 'posted', NOW(), NOW()),
      ('GL-2026-0007', '2026-02-01', '6100', 'הוצאות שכר', 'expense', 'משכורת ינואר 2026', 'payroll', 1850000, 0, 1850000, 'ILS', 2026, 2, 'posted', NOW(), NOW()),
      ('GL-2026-0008', '2026-02-01', '1100', 'בנק לאומי', 'asset', 'העברה למשכורות', 'payroll', 0, 1850000, -1850000, 'ILS', 2026, 2, 'posted', NOW(), NOW()),
      ('GL-2026-0009', '2026-02-10', '1110', 'קופה ראשית', 'asset', 'תשלום מלקוח — השקעות ים', 'receipt', 1416000, 0, 1416000, 'ILS', 2026, 2, 'posted', NOW(), NOW()),
      ('GL-2026-0010', '2026-02-10', '4100', 'הכנסות ממכירות', 'revenue', 'חשבונית — שער + גדר', 'invoice', 0, 1200000, -1200000, 'ILS', 2026, 2, 'posted', NOW(), NOW()),
      ('GL-2026-0011', '2026-03-01', '5200', 'הוצאות ייצור', 'expense', 'חומרי מתכלים — חודש פברואר', 'production', 380000, 0, 380000, 'ILS', 2026, 3, 'posted', NOW(), NOW()),
      ('GL-2026-0012', '2026-03-01', '6200', 'הוצאות אחזקה', 'expense', 'תחזוקת מכונות — פברואר', 'maintenance', 85000, 0, 85000, 'ILS', 2026, 3, 'posted', NOW(), NOW()),
      ('GL-2026-0013', '2026-03-10', '2110', 'ספקים', 'liability', 'תשלום לספק — זכוכית הדרום', 'payment', 944000, 0, 944000, 'ILS', 2026, 3, 'posted', NOW(), NOW()),
      ('GL-2026-0014', '2026-03-10', '1100', 'בנק לאומי', 'asset', 'תשלום לספק', 'payment', 0, 944000, -944000, 'ILS', 2026, 3, 'posted', NOW(), NOW()),
      ('GL-2026-0015', '2026-03-15', '7100', 'פחת ציוד', 'expense', 'פחת ציוד — רבעון 1', 'depreciation', 125000, 0, 125000, 'ILS', 2026, 3, 'posted', NOW(), NOW())
    ON CONFLICT DO NOTHING`);

    // === הכנסות (columns: revenue_number, revenue_date, category, amount, tax_amount, description, department, created_at, updated_at) ===
    await run("revenues", `INSERT INTO revenues (revenue_number, revenue_date, category, amount, tax_amount, description, department, created_at, updated_at) VALUES
      ('REV-2026-001', '2026-01-15', 'מעקות', 450000, 81000, 'מעקות אלומיניום — פרויקט ת"א', 'מכירות', NOW(), NOW()),
      ('REV-2026-002', '2026-01-25', 'שערים', 1200000, 216000, 'שער חשמלי + גדר — הרצליה', 'מכירות', NOW(), NOW()),
      ('REV-2026-003', '2026-02-10', 'פרגולות', 4500000, 810000, 'פרגולה ביוקלימטית — מלון נתניה', 'מכירות', NOW(), NOW()),
      ('REV-2026-004', '2026-02-20', 'חזיתות', 12000000, 2160000, 'מקדמה — חזית אלומיניום מגדל חיפה', 'מכירות', NOW(), NOW()),
      ('REV-2026-005', '2026-03-01', 'מעקות', 285000, 51300, 'מעקה מרפסת זכוכית', 'מכירות', NOW(), NOW()),
      ('REV-2026-006', '2026-03-10', 'שירותים', 150000, 27000, 'שירותי התקנה', 'שירות', NOW(), NOW()),
      ('REV-2026-007', '2026-03-15', 'מעקות', 3000000, 540000, 'מקדמה — מעקות זכוכית 16 קומות', 'מכירות', NOW(), NOW()),
      ('REV-2026-008', '2026-03-20', 'גדרות', 1680000, 302400, 'גדרות בטיחות בית ספר', 'מכירות', NOW(), NOW())
    ON CONFLICT DO NOTHING`);

    // === תקנות מתקנות ===
    await run("adjusting_entries", `INSERT INTO adjusting_entries (entry_number, entry_date, entry_type, account_number, account_name, debit_amount, credit_amount, description, fiscal_year, fiscal_period, status, created_at, updated_at) VALUES
      ('ADJ-2026-001', '2026-01-31', 'accrual', '6100', 'הוצאות שכר', 185000, 0, 'הפרשת שכר 13 — ינואר', 2026, 1, 'posted', NOW(), NOW()),
      ('ADJ-2026-002', '2026-01-31', 'accrual', '2200', 'הפרשות שכר', 0, 185000, 'הפרשת שכר 13 — ינואר', 2026, 1, 'posted', NOW(), NOW()),
      ('ADJ-2026-003', '2026-02-28', 'depreciation', '7100', 'פחת ציוד', 42000, 0, 'פחת חודשי — ציוד ייצור', 2026, 2, 'posted', NOW(), NOW()),
      ('ADJ-2026-004', '2026-02-28', 'depreciation', '1500', 'פחת נצבר ציוד', 0, 42000, 'פחת חודשי — ציוד ייצור', 2026, 2, 'posted', NOW(), NOW()),
      ('ADJ-2026-005', '2026-03-31', 'provision', '6300', 'הוצאות חופשה', 95000, 0, 'הפרשת ימי חופשה — Q1', 2026, 3, 'posted', NOW(), NOW()),
      ('ADJ-2026-006', '2026-03-31', 'provision', '2300', 'הפרשות חופשה', 0, 95000, 'הפרשת ימי חופשה — Q1', 2026, 3, 'posted', NOW(), NOW()),
      ('ADJ-2026-007', '2026-03-31', 'reclassification', '5100', 'חומרי גלם', 120000, 0, 'סיווג מחדש — חומרים לפרויקט חיפה', 2026, 3, 'draft', NOW(), NOW()),
      ('ADJ-2026-008', '2026-03-31', 'reclassification', '5200', 'עבודה בביצוע', 0, 120000, 'סיווג מחדש — חומרים לפרויקט חיפה', 2026, 3, 'draft', NOW(), NOW())
    ON CONFLICT DO NOTHING`);

    // === דרישות רכש (requested_by is UUID — skip it) ===
    await run("purchase_requisitions", `INSERT INTO purchase_requisitions (requisition_number, department, urgency, status, justification, notes, created_at, updated_at) VALUES
      ('PR-2026-001', 'ייצור', 'high', 'approved', 'חוטי ריתוך MIG 0.8 ממ — מלאי קריטי נמוך', 'נדרש דחוף לייצור', NOW(), NOW()),
      ('PR-2026-002', 'מחסן', 'medium', 'pending', 'ברגים נירוסטה M10x30 — אזל מהמלאי', 'הזמנה שגרתית', NOW(), NOW()),
      ('PR-2026-003', 'הנדסה', 'medium', 'approved', 'פרופיל אלומיניום תרמי 4520 — לפרויקט מגדל חיפה', '500 מטר', NOW(), NOW()),
      ('PR-2026-004', 'גמר', 'low', 'draft', 'צבע אבקתי RAL 7016 אנתרציט — גוון פופולרי', '150 ק"ג', NOW(), NOW()),
      ('PR-2026-005', 'תחזוקה', 'critical', 'approved', 'להבים למסור סרט Bi-Metal — מסור לא פעיל', 'דחוף — עצירת ייצור', NOW(), NOW()),
      ('PR-2026-006', 'מכירות', 'low', 'pending', 'כרטיסי דוגמאות RAL ללקוח VIP', '3 סטים', NOW(), NOW())
    ON CONFLICT DO NOTHING`);

    // === הערכות ביצוע (review_period: monthly|quarterly|semi_annual|annual|probation|special; status: draft|in_progress|submitted|approved|disputed|final) ===
    await run("performance_reviews", `INSERT INTO performance_reviews (review_number, employee_name, reviewer_name, review_period, review_date, overall_score, technical_score, teamwork_score, attendance_score, quality_score, status, strengths, improvements, goals_next_period, reviewer_comments, created_at, updated_at) VALUES
      ('PR-2026-001', 'אברהם כהן', 'מנהל ייצור', 'semi_annual', '2026-01-15', 4.2, 4.5, 4.0, 4.0, 4.3, 'final', 'עבודה מדויקת, ידע טכני מעולה', 'שיפור ניהול זמן', 'הכשרה למכונת CNC חדשה', 'עובד מצטיין ותיק', NOW(), NOW()),
      ('PR-2026-002', 'דוד לוי', 'מנהל ייצור', 'semi_annual', '2026-01-15', 3.8, 4.0, 3.5, 4.0, 3.8, 'final', 'יכולת טכנית גבוהה', 'עבודת צוות, תקשורת', 'להוביל צוות משמרת', 'צריך עוד ניסיון ניהולי', NOW(), NOW()),
      ('PR-2026-003', 'יוסף מזרחי', 'מנהל מחסן', 'semi_annual', '2026-01-20', 4.5, 4.0, 4.8, 4.5, 4.5, 'approved', 'סדר ארגוני, אחריות', 'הכרת מערכת ERP', 'הסמכת מלגזה', 'עובד מצטיין', NOW(), NOW()),
      ('PR-2026-004', 'משה ישראלי', 'מנהל שירות', 'annual', '2026-01-20', 3.5, 3.8, 3.5, 3.0, 3.5, 'approved', 'מקצועיות בשטח', 'דיוק בדיווחים', 'קורס בטיחות', 'נדרש שיפור בנוכחות', NOW(), NOW()),
      ('PR-2026-005', 'רונן אברהם', 'סמנכ"ל תפעול', 'annual', '2026-02-01', 4.7, 4.5, 4.8, 4.8, 4.5, 'final', 'מנהיגות, חזון, ניהול צוות', 'דלגציה', 'פרויקט מגדל חיפה', 'מנהל מצטיין', NOW(), NOW()),
      ('PR-2026-006', 'שירה כהן', 'מנהל כספים', 'annual', '2026-02-01', 4.3, 4.5, 4.0, 4.5, 4.2, 'approved', 'דיוק, שליטה במערכות', 'יוזמה', 'הובלת פרויקט דיגיטציה', 'רואת חשבון מעולה', NOW(), NOW())
    ON CONFLICT DO NOTHING`);

    // === הסמכות עובדים (employee_id is UUID — skip it) ===
    await run("employee_certifications", `INSERT INTO employee_certifications (certification_name, certificate_number, issue_date, expiry_date, status, notes, created_at) VALUES
      ('הסמכת רתך MIG/MAG', 'WLD-2024-0128', '2024-06-01', '2027-06-01', 'active', 'מכון התקנים — ריתוך MIG/MAG', NOW()),
      ('בטיחות עבודה בגובה', 'SAF-HGT-2025-042', '2025-01-15', '2026-01-15', 'expired', 'מכון יונתן — לחדש דחוף', NOW()),
      ('הסמכת רתך TIG נירוסטה', 'WLD-TIG-2025-0056', '2025-03-01', '2028-03-01', 'active', 'מכון התקנים', NOW()),
      ('רישיון מלגזה', 'FRK-2024-1892', '2024-09-01', '2027-09-01', 'active', 'משרד העבודה', NOW()),
      ('הסמכת מתקין בגובה', 'INS-HGT-2025-078', '2025-06-01', '2026-06-01', 'active', 'מכון יונתן', NOW()),
      ('הסמכת מנהל עבודה', 'MGR-2023-0234', '2023-01-01', '2028-01-01', 'active', 'משרד הבינוי', NOW()),
      ('הסמכת מפעיל מנוף', 'CRN-2024-0567', '2024-11-01', '2027-11-01', 'active', 'משרד העבודה', NOW()),
      ('הסמכת בודק איכות', 'QC-2025-0189', '2025-02-01', '2028-02-01', 'active', 'מכון התקנים', NOW()),
      ('תעודת חשמלאי מוסמך', 'ELEC-2022-1456', '2022-07-01', '2027-07-01', 'active', 'משרד התעשייה', NOW()),
      ('עזרה ראשונה — מגיש', 'FA-2025-3421', '2025-08-01', '2026-08-01', 'active', 'מד"א', NOW())
    ON CONFLICT DO NOTHING`);

    // === אירועי בטיחות (severity: negligible|minor|moderate|major|critical|catastrophic; status: reported|under_investigation|corrective_action|monitoring|closed|reopened) ===
    await run("safety_incidents", `INSERT INTO safety_incidents (incident_number, title, incident_type, incident_date, severity, location, department, description, employee_name, injury_type, treatment, root_cause, corrective_action, status, reported_by, created_at, updated_at) VALUES
      ('SI-2026-001', 'שבב מתכת עף ליד עובד', 'near_miss', '2026-01-12', 'negligible', 'אולם A', 'ייצור', 'שבב מתכת עף ליד עובד — ללא פגיעה', 'אבי מפעיל', 'none', 'אין', 'חוסר משקפי מגן', 'הנחיה מחודשת לציוד מגן', 'closed', 'מנהל בטיחות', NOW(), NOW()),
      ('SI-2026-002', 'כוויה קלה מריתוך', 'first_aid', '2026-02-03', 'minor', 'מחלקת ריתוך', 'ייצור', 'כוויה קלה ביד שמאל מניצוצות ריתוך', 'משה רתך', 'burn', 'טיפול ראשוני באתר', 'כפפת ריתוך קרועה', 'החלפת ציוד מגן + הדרכה', 'closed', 'ראש צוות ריתוך', NOW(), NOW()),
      ('SI-2026-003', 'נפילת פרופילים ממדף', 'near_miss', '2026-02-18', 'major', 'מחסן ראשי', 'מחסן', 'נפילת חבילת פרופילים ממדף — ללא נפגעים', NULL, 'none', 'אין', 'עומס יתר על מדף', 'הגבלת משקל למדף + שלטים', 'closed', 'מנהל מחסן', NOW(), NOW()),
      ('SI-2026-004', 'חתך באצבע מפרופיל', 'first_aid', '2026-03-05', 'negligible', 'אולם C', 'גמר', 'חתך קל באצבע מקצה פרופיל', 'רון גמר', 'cut', 'חבישה', 'חוסר זהירות', 'תדריך בטיחות', 'closed', 'מנהל גמר', NOW(), NOW()),
      ('SI-2026-005', 'נזק ללהב מסור', 'property_damage', '2026-03-15', 'moderate', 'אולם A', 'ייצור', 'נזק ללהב מסור — חומר זר בפרופיל', NULL, 'none', 'אין', 'בדיקת חומר גלם לקויה', 'בדיקת QC קפדנית יותר לחומר נכנס', 'under_investigation', 'מפעיל מסור', NOW(), NOW()),
      ('SI-2026-006', 'מלגזה כמעט פגעה בהולך רגל', 'near_miss', '2026-03-20', 'moderate', 'חצר', 'לוגיסטיקה', 'מלגזה כמעט פגעה בהולך רגל', NULL, 'none', 'אין', 'נתיב הולכי רגל לא מסומן', 'סימון נתיבי הליכה + מראות בפינות', 'corrective_action', 'מנהל בטיחות', NOW(), NOW())
    ON CONFLICT DO NOTHING`);

    // === הערכות סיכון (columns: risk_type, title, description, probability, impact, risk_score, mitigation_plan, status, review_date, created_at, updated_at) ===
    await run("risk_assessments", `INSERT INTO risk_assessments (risk_type, title, description, probability, impact, risk_score, mitigation_plan, status, review_date, created_at, updated_at) VALUES
      ('health', 'חשיפה לרעש מכונות', 'סיכון חשיפה לרעש באולם ייצור A — אטמי אוזניים זמינים', 4, 3, 12, 'בדיקת שמיעה תקופתית + אכיפת ציוד מגן', 'active', '2026-07-01', NOW(), NOW()),
      ('fire', 'סיכון שריפה מריתוך', 'סיכון שריפה מניצוצות ריתוך — מטפי כיבוי + שמיכות', 3, 5, 15, 'הוספת מערכת ספרינקלרים למחלקת ריתוך', 'active', '2026-04-01', NOW(), NOW()),
      ('mechanical', 'נפילת חומרים ממדפים', 'סיכון נפילת פרופילים ממדפים במחסן ראשי', 3, 4, 12, 'בדיקה רבעונית של מדפים + חיזוק', 'active', '2026-04-10', NOW(), NOW()),
      ('chemical', 'חשיפה לאדי צבע', 'סיכון חשיפה כימית באולם גמר — מערכת שאיבה + מסכות', 4, 3, 12, 'שדרוג מערכת אוורור + בדיקות חשיפה', 'active', '2026-07-15', NOW(), NOW()),
      ('operational', 'סיכון תאונת מלגזה', 'סיכון תאונת מלגזה בחצר — נתיבים מסומנים', 3, 5, 15, 'מצלמות בפינות + חיישני קרבה למלגזה', 'active', '2026-05-01', NOW(), NOW()),
      ('safety', 'סיכון נפילה מגובה', 'סיכון נפילה בעבודות התקנה — רתמות + קסדות', 4, 5, 20, 'בדיקת ציוד חודשית + הסמכה שנתית', 'active', '2026-06-01', NOW(), NOW())
    ON CONFLICT DO NOTHING`);

    // Fix any sales_orders rows where total is NULL or 0 but subtotal is set
    await run("fix_sales_orders_total", `
      UPDATE sales_orders
      SET total = COALESCE(subtotal, 0) - COALESCE(discount_amount, 0) + COALESCE(tax_amount, 0),
          updated_at = NOW()
      WHERE (total IS NULL OR total = 0)
        AND COALESCE(subtotal, 0) > 0
    `);

    await run("bank_accounts", `INSERT INTO bank_accounts (bank_name, branch_number, account_number, account_type, currency, current_balance, available_balance, credit_limit, is_active, account_holder_name, notes, created_at, updated_at) VALUES
      ('בנק הפועלים', '601', '12345678', 'checking', 'ILS', 850000, 820000, 500000, true, 'טכנו-כל עוזי בעמ', 'חשבון עו"ש ראשי', NOW(), NOW()),
      ('בנק לאומי', '802', '23456789', 'checking', 'ILS', 620000, 590000, 300000, true, 'טכנו-כל עוזי בעמ', 'חשבון עו"ש משני', NOW(), NOW()),
      ('בנק דיסקונט', '100', '34567890', 'savings', 'ILS', 420000, 420000, 0, true, 'טכנו-כל עוזי בעמ', 'חשבון חסכון', NOW(), NOW()),
      ('בנק מזרחי-טפחות', '500', '45678901', 'checking', 'ILS', 180000, 180000, 100000, true, 'טכנו-כל עוזי בעמ', 'חשבון שכר', NOW(), NOW()),
      ('בנק הבינלאומי', '200', '56789012', 'checking', 'USD', 95000, 95000, 0, true, 'טכנו-כל עוזי בעמ', 'חשבון דולרי', NOW(), NOW()),
      ('בנק ירושלים', '300', '67890123', 'checking', 'ILS', 315000, 295000, 200000, true, 'טכנו-כל עוזי בעמ', 'חשבון פיקדון', NOW(), NOW())
    ON CONFLICT DO NOTHING`);

    await run("expenses", `INSERT INTO expenses (expense_number, expense_date, category, description, amount, vat_amount, currency, status, vendor_name, department, created_at, updated_at) VALUES
      ('EXP-2026-0001', '2026-01-05', 'חומרי גלם', 'רכש אלומיניום 6063 — 500 ק"ג', 1500000, 270000, 'ILS', 'approved', 'אלומיניום ישראל בעמ', 'רכש', NOW(), NOW()),
      ('EXP-2026-0002', '2026-01-10', 'חומרי גלם', 'רכש פלדה S235 — 300 ק"ג', 2300000, 414000, 'ILS', 'approved', 'פלדה ישירה בעמ', 'רכש', NOW(), NOW()),
      ('EXP-2026-0003', '2026-01-15', 'תחזוקה', 'תחזוקה מונעת מכונת כיפוף', 250000, 45000, 'ILS', 'approved', 'שירותי תחזוקה מתקדמים', 'תחזוקה', NOW(), NOW()),
      ('EXP-2026-0004', '2026-01-20', 'שכר', 'שכר עובדים ינואר 2026', 8500000, 0, 'ILS', 'approved', '', 'משאבי אנוש', NOW(), NOW()),
      ('EXP-2026-0005', '2026-02-01', 'חומרי גלם', 'רכש זכוכית מחוסמת — 200 יחידות', 800000, 144000, 'ILS', 'approved', 'זכוכית ירושלים', 'רכש', NOW(), NOW()),
      ('EXP-2026-0006', '2026-02-05', 'שיווק', 'קמפיין פרסום בגוגל — פברואר', 120000, 21600, 'ILS', 'approved', 'גוגל ישראל', 'שיווק', NOW(), NOW()),
      ('EXP-2026-0007', '2026-02-10', 'תחזוקה', 'תיקון מערכת הידראולית — מכונת כיפוף', 850000, 153000, 'ILS', 'approved', 'תיקוני מתכת בעמ', 'תחזוקה', NOW(), NOW()),
      ('EXP-2026-0008', '2026-02-15', 'שכר', 'שכר עובדים פברואר 2026', 8500000, 0, 'ILS', 'approved', '', 'משאבי אנוש', NOW(), NOW()),
      ('EXP-2026-0009', '2026-02-20', 'חומרי גלם', 'רכש ברזל ופלדה — 1000 ק"ג', 3500000, 630000, 'ILS', 'approved', 'יצרני פלדה לאומי', 'רכש', NOW(), NOW()),
      ('EXP-2026-0010', '2026-03-01', 'שכר', 'שכר עובדים מרץ 2026', 8500000, 0, 'ILS', 'approved', '', 'משאבי אנוש', NOW(), NOW()),
      ('EXP-2026-0011', '2026-03-05', 'IT', 'רישיונות תוכנה שנתיים', 180000, 32400, 'ILS', 'approved', 'מיקרוסופט ישראל', 'מערכות מידע', NOW(), NOW()),
      ('EXP-2026-0012', '2026-03-10', 'חומרי גלם', 'רכש חומרי ריתוך', 950000, 171000, 'ILS', 'approved', 'חומרי ריתוך בעמ', 'רכש', NOW(), NOW()),
      ('EXP-2026-0013', '2026-03-15', 'שיווק', 'תערוכה ענפית — אגרת השתתפות', 350000, 63000, 'ILS', 'approved', 'מרכז אומניה', 'שיווק', NOW(), NOW()),
      ('EXP-2026-0014', '2026-03-18', 'תחזוקה', 'החלפת להב מסור MCH-006', 350000, 63000, 'ILS', 'approved', 'שירותי תחזוקה מתקדמים', 'תחזוקה', NOW(), NOW()),
      ('EXP-2026-0015', '2026-03-20', 'שכירות', 'שכירות מחסן נתניה — מרץ', 150000, 27000, 'ILS', 'approved', 'נדלן תעשייתי בעמ', 'לוגיסטיקה', NOW(), NOW())
    ON CONFLICT DO NOTHING`);

    // Clear KPI cache so the dashboard immediately reflects new data
    try { clearKpiCache(); } catch (err) { console.warn("[seed] clearKpiCache failed:", err); }

    await run("bank_accounts_fix_balances", `
      UPDATE bank_accounts SET
        current_balance = CASE account_number
          WHEN '12345678' THEN 850000
          WHEN '23456789' THEN 620000
          WHEN '34567890' THEN 420000
          WHEN '45678901' THEN 180000
          WHEN '56789012' THEN 95000
          WHEN '67890123' THEN 315000
          ELSE current_balance
        END,
        available_balance = CASE account_number
          WHEN '12345678' THEN 820000
          WHEN '23456789' THEN 590000
          WHEN '34567890' THEN 420000
          WHEN '45678901' THEN 180000
          WHEN '56789012' THEN 95000
          WHEN '67890123' THEN 295000
          ELSE available_balance
        END,
        updated_at = NOW()
      WHERE account_number IN ('12345678','23456789','34567890','45678901','56789012','67890123')
    `);

    return { success: true, seeded: results, errors };
  } finally {
    client.release();
  }
}
