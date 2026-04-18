// ============================================================
// מנוע נוכחות, חופשות ושכר - Attendance, Leave & Payroll Engine
// ניהול מלא ל-200 עובדים: דיווח נוכחות, חופשות, חישוב משכורות
// ============================================================

import { Router, Request, Response } from 'express';
import pool from '@workspace/db';

const router = Router();

// ============================================================
// קבועי שכר ישראליים 2026
// ============================================================
const ISRAEL_PAYROLL_CONSTANTS = {
  // מדרגות מס הכנסה 2026 (חודשי)
  income_tax_brackets: [
    { from: 0, to: 7010, rate: 0.10 },
    { from: 7010, to: 10060, rate: 0.14 },
    { from: 10060, to: 16150, rate: 0.20 },
    { from: 16150, to: 22440, rate: 0.31 },
    { from: 22440, to: 46690, rate: 0.35 },
    { from: 46690, to: 60130, rate: 0.47 },
    { from: 60130, to: Infinity, rate: 0.50 }
  ],
  // ביטוח לאומי - עובד / מעסיק
  national_insurance_employee: 0.035,
  national_insurance_employer: 0.12,
  // מס בריאות - עובד / מעסיק
  health_tax_employee: 0.031,
  health_tax_employer: 0.05,
  // פנסיה - עובד / מעסיק
  pension_employee: 0.06,
  pension_employer: 0.065,
  // פיצויים
  severance_rate: 0.0833,
  // שעות נוספות
  overtime_first_2_hours_rate: 1.25,
  overtime_after_2_hours_rate: 1.50,
  // ימי עבודה רגילים בחודש
  standard_working_days: 22,
  standard_daily_hours: 8.6
};

// סוגי חופשה
const LEAVE_TYPES = ['vacation', 'sick', 'personal', 'military_reserve', 'maternity', 'bereavement', 'marriage'];

// ============================================================
// חישוב מס הכנסה לפי מדרגות
// ============================================================
function calculateIncomeTax(grossSalary: number): number {
  let tax = 0;
  let remaining = grossSalary;

  for (const bracket of ISRAEL_PAYROLL_CONSTANTS.income_tax_brackets) {
    if (remaining <= 0) break;
    const taxableInBracket = Math.min(remaining, bracket.to - bracket.from);
    tax += taxableInBracket * bracket.rate;
    remaining -= taxableInBracket;
  }

  // נקודות זיכוי (2.25 נקודות × 242 ₪ = 544.5 ₪ לחודש)
  const creditPoints = 2.25 * 242;
  tax = Math.max(0, tax - creditPoints);

  return parseFloat(tax.toFixed(2));
}

// ============================================================
// POST /init - יצירת טבלאות
// ============================================================
router.post('/init', async (_req: Request, res: Response) => {
  try {
    // טבלת רשומות נוכחות
    await pool.query(`
      CREATE TABLE IF NOT EXISTS attendance_records (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL,
        employee_name VARCHAR,
        date DATE NOT NULL,
        clock_in TIMESTAMPTZ,
        clock_out TIMESTAMPTZ,
        clock_in_location JSONB,
        clock_out_location JSONB,
        total_hours NUMERIC(5,2),
        overtime_hours NUMERIC(5,2),
        break_minutes INTEGER DEFAULT 0,
        status VARCHAR DEFAULT 'present',
        late_minutes INTEGER DEFAULT 0,
        early_leave_minutes INTEGER DEFAULT 0,
        shift_type VARCHAR DEFAULT 'regular',
        approved_by VARCHAR,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(employee_id, date)
      )
    `);

    // טבלת בקשות חופשה
    await pool.query(`
      CREATE TABLE IF NOT EXISTS leave_requests (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL,
        employee_name VARCHAR,
        leave_type VARCHAR NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        total_days NUMERIC(4,1),
        reason TEXT,
        status VARCHAR DEFAULT 'pending',
        approved_by VARCHAR,
        approved_at TIMESTAMPTZ,
        rejection_reason TEXT,
        documents JSONB DEFAULT '[]',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // טבלת יתרות חופשה
    await pool.query(`
      CREATE TABLE IF NOT EXISTS leave_balances (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL,
        leave_type VARCHAR NOT NULL,
        year INTEGER NOT NULL,
        entitled_days NUMERIC(5,1),
        used_days NUMERIC(5,1) DEFAULT 0,
        pending_days NUMERIC(5,1) DEFAULT 0,
        remaining_days NUMERIC(5,1),
        carry_over_days NUMERIC(5,1) DEFAULT 0,
        UNIQUE(employee_id, leave_type, year)
      )
    `);

    // טבלת ריצות שכר
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payroll_runs (
        id SERIAL PRIMARY KEY,
        run_number VARCHAR UNIQUE,
        period VARCHAR NOT NULL,
        run_date DATE NOT NULL,
        total_employees INTEGER,
        total_gross NUMERIC(15,2),
        total_deductions NUMERIC(15,2),
        total_net NUMERIC(15,2),
        total_employer_cost NUMERIC(15,2),
        status VARCHAR DEFAULT 'draft',
        approved_by VARCHAR,
        approved_at TIMESTAMPTZ,
        sent_to_accountant BOOLEAN DEFAULT false,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // טבלת תלושי שכר
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payroll_slips (
        id SERIAL PRIMARY KEY,
        run_id INTEGER REFERENCES payroll_runs(id),
        employee_id INTEGER NOT NULL,
        employee_name VARCHAR,
        period VARCHAR,
        base_salary NUMERIC(15,2),
        overtime_pay NUMERIC(15,2),
        commission NUMERIC(15,2) DEFAULT 0,
        bonuses NUMERIC(15,2) DEFAULT 0,
        travel_allowance NUMERIC(15,2) DEFAULT 0,
        phone_allowance NUMERIC(15,2) DEFAULT 0,
        gross_salary NUMERIC(15,2),
        income_tax NUMERIC(15,2),
        national_insurance_employee NUMERIC(15,2),
        health_tax_employee NUMERIC(15,2),
        pension_employee NUMERIC(15,2),
        union_fee NUMERIC(15,2) DEFAULT 0,
        total_deductions NUMERIC(15,2),
        net_salary NUMERIC(15,2),
        national_insurance_employer NUMERIC(15,2),
        pension_employer NUMERIC(15,2),
        severance_fund NUMERIC(15,2),
        education_fund_employer NUMERIC(15,2) DEFAULT 0,
        total_employer_cost NUMERIC(15,2),
        working_days INTEGER,
        actual_days_worked INTEGER,
        overtime_hours NUMERIC(5,2) DEFAULT 0,
        sick_days_used NUMERIC(4,1) DEFAULT 0,
        vacation_days_used NUMERIC(4,1) DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    res.json({
      success: true,
      message: 'מנוע נוכחות, חופשות ושכר אותחל בהצלחה',
      tables: ['attendance_records', 'leave_requests', 'leave_balances', 'payroll_runs', 'payroll_slips'],
      payroll_constants: ISRAEL_PAYROLL_CONSTANTS,
      leave_types: LEAVE_TYPES
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// POST /clock-in/:employeeId - דיווח כניסה עם מיקום GPS
// ============================================================
/**
 * @openapi
 * /api/clock-in/{employeeId}:
 *   post:
 *     tags: [HR & Attendance]
 *     summary: כניסה לעבודה — Employee clock-in
 *     description: |
 *       רושם כניסה לעבודה לעובד לפי מזהה. אם כבר רשום כניסה להיום, מחזיר שגיאה.
 *       ניתן לציין מיקום GPS, סוג משמרת והערות.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: employeeId
 *         in: path
 *         required: true
 *         schema: { type: integer, example: 42 }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               employee_name: { type: string }
 *               location: { type: string, example: "מפעל ראשי" }
 *               shift_type: { type: string, enum: [morning, afternoon, night] }
 *               notes: { type: string }
 *     responses:
 *       200: { description: "כניסה נרשמה בהצלחה" }
 *       400: { description: "כבר רשום כניסה היום" }
 *       401: { description: "נדרשת התחברות" }
 */
router.post('/clock-in/:employeeId', async (req: Request, res: Response) => {
  try {
    const { employeeId } = req.params;
    const { employee_name, location, shift_type, notes } = req.body;
    const today = new Date().toISOString().split('T')[0];
    const now = new Date().toISOString();

    // בדיקה אם כבר דיווח היום
    const existing = await pool.query(`
      SELECT id FROM attendance_records WHERE employee_id = $1 AND date = $2
    `, [employeeId, today]);

    if (existing.rows.length > 0) {
      return res.status(400).json({ success: false, error: 'כבר קיים דיווח נוכחות להיום' });
    }

    // חישוב איחור - שעת התחלה רגילה 08:00
    const clockInTime = new Date(now);
    const expectedStart = new Date(today + 'T08:00:00');
    const lateMinutes = Math.max(0, Math.round((clockInTime.getTime() - expectedStart.getTime()) / 60000));

    const result = await pool.query(`
      INSERT INTO attendance_records (employee_id, employee_name, date, clock_in, clock_in_location, status, late_minutes, shift_type, notes)
      VALUES ($1, $2, $3, $4, $5, 'present', $6, $7, $8)
      RETURNING *
    `, [employeeId, employee_name, today, now, location ? JSON.stringify(location) : null, lateMinutes, shift_type || 'regular', notes]);

    res.json({
      success: true,
      message: lateMinutes > 0 ? `דיווח כניסה נרשם - איחור ${lateMinutes} דקות` : 'דיווח כניסה נרשם בהצלחה',
      attendance: result.rows[0]
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// POST /clock-out/:employeeId - דיווח יציאה
// ============================================================
router.post('/clock-out/:employeeId', async (req: Request, res: Response) => {
  try {
    const { employeeId } = req.params;
    const { location, break_minutes, notes } = req.body;
    const today = new Date().toISOString().split('T')[0];
    const now = new Date().toISOString();

    // שליפת רשומת כניסה של היום
    const attendance = await pool.query(`
      SELECT * FROM attendance_records WHERE employee_id = $1 AND date = $2
    `, [employeeId, today]);

    if (attendance.rows.length === 0) {
      return res.status(400).json({ success: false, error: 'לא נמצא דיווח כניסה להיום' });
    }

    const record = attendance.rows[0];
    if (record.clock_out) {
      return res.status(400).json({ success: false, error: 'כבר דווחה יציאה להיום' });
    }

    // חישוב שעות
    const clockIn = new Date(record.clock_in);
    const clockOut = new Date(now);
    const totalMinutes = (clockOut.getTime() - clockIn.getTime()) / 60000 - (break_minutes || record.break_minutes || 0);
    const totalHours = parseFloat((totalMinutes / 60).toFixed(2));

    // חישוב שעות נוספות
    const standardHours = ISRAEL_PAYROLL_CONSTANTS.standard_daily_hours;
    const overtimeHours = Math.max(0, parseFloat((totalHours - standardHours).toFixed(2)));

    // חישוב יציאה מוקדמת - שעת סיום רגילה 17:00
    const expectedEnd = new Date(today + 'T17:00:00');
    const earlyLeaveMinutes = Math.max(0, Math.round((expectedEnd.getTime() - clockOut.getTime()) / 60000));

    const result = await pool.query(`
      UPDATE attendance_records SET
        clock_out = $1, clock_out_location = $2, total_hours = $3, overtime_hours = $4,
        break_minutes = COALESCE($5, break_minutes), early_leave_minutes = $6,
        notes = COALESCE($7, notes)
      WHERE employee_id = $8 AND date = $9
      RETURNING *
    `, [now, location ? JSON.stringify(location) : null, totalHours, overtimeHours, break_minutes, earlyLeaveMinutes, notes, employeeId, today]);

    res.json({
      success: true,
      message: `דיווח יציאה נרשם - ${totalHours} שעות${overtimeHours > 0 ? ` (${overtimeHours} שעות נוספות)` : ''}`,
      attendance: result.rows[0]
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /attendance-report/:month - דוח נוכחות חודשי
// ============================================================
/**
 * @openapi
 * /api/attendance-report/{month}:
 *   get:
 *     tags: [HR & Attendance]
 *     summary: דוח נוכחות חודשי — Monthly attendance report
 *     description: |
 *       מחזיר סיכום נוכחות לכל העובדים לחודש נבחר.
 *       כולל: ימי נוכחות, שעות עבודה, שעות נוספות, אחוז נוכחות.
 *       שימוש בחישוב שכר ודוחות HR.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: month
 *         in: path
 *         required: true
 *         description: "חודש בפורמט YYYY-MM"
 *         schema: { type: string, example: "2025-03" }
 *     responses:
 *       200:
 *         description: דוח נוכחות חודשי לכל העובדים
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   employee_id: { type: integer }
 *                   employee_name: { type: string }
 *                   total_days_present: { type: integer }
 *                   total_hours: { type: number }
 *                   total_overtime: { type: number }
 *       401: { description: "נדרשת התחברות" }
 */
router.get('/attendance-report/:month', async (req: Request, res: Response) => {
  try {
    const { month } = req.params; // פורמט: YYYY-MM
    const startDate = `${month}-01`;
    const endDate = `${month}-31`;

    const result = await pool.query(`
      SELECT
        employee_id, employee_name,
        COUNT(*) as total_days_present,
        SUM(total_hours) as total_hours,
        SUM(overtime_hours) as total_overtime,
        SUM(late_minutes) as total_late_minutes,
        COUNT(*) FILTER (WHERE late_minutes > 0) as late_days,
        COUNT(*) FILTER (WHERE early_leave_minutes > 0) as early_leave_days,
        AVG(total_hours) as avg_daily_hours
      FROM attendance_records
      WHERE date BETWEEN $1 AND $2
      GROUP BY employee_id, employee_name
      ORDER BY employee_name
    `, [startDate, endDate]);

    // סיכום כללי
    const summary = await pool.query(`
      SELECT
        COUNT(DISTINCT employee_id) as unique_employees,
        COUNT(*) as total_records,
        SUM(total_hours) as total_hours,
        SUM(overtime_hours) as total_overtime_hours,
        AVG(total_hours) as avg_hours_per_day,
        COUNT(*) FILTER (WHERE late_minutes > 0) as total_late_incidents
      FROM attendance_records
      WHERE date BETWEEN $1 AND $2
    `, [startDate, endDate]);

    res.json({
      success: true,
      period: month,
      summary: summary.rows[0],
      employees: result.rows
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// POST /request-leave - הגשת בקשת חופשה
// ============================================================
/**
 * @openapi
 * /api/request-leave:
 *   post:
 *     tags: [HR & Attendance]
 *     summary: הגשת בקשת חופשה — Submit leave request
 *     description: |
 *       מגיש בקשת חופשה לעובד. הבקשה ממתינה לאישור מנהל.
 *       סוגי חופשה תקינים: annual, sick, personal, maternity, paternity, reserve_duty, bereavement, unpaid.
 *       מחשב אוטומטית ימי עסקים (לא כולל שישי-שבת).
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [employee_id, leave_type, start_date, end_date]
 *             properties:
 *               employee_id: { type: integer, example: 42 }
 *               employee_name: { type: string }
 *               leave_type:
 *                 type: string
 *                 enum: [annual, sick, personal, maternity, paternity, reserve_duty, bereavement, unpaid]
 *               start_date: { type: string, format: date, example: "2025-03-10" }
 *               end_date: { type: string, format: date, example: "2025-03-14" }
 *               reason: { type: string }
 *     responses:
 *       200:
 *         description: בקשה הוגשה בהצלחה
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 request_id: { type: integer }
 *                 total_days: { type: integer }
 *                 status: { type: string, example: "pending" }
 *       400: { description: "נתונים חסרים / סוג חופשה לא תקין / יתרה לא מספיקה" }
 *       401: { description: "נדרשת התחברות" }
 */
router.post('/request-leave', async (req: Request, res: Response) => {
  try {
    const { employee_id, employee_name, leave_type, start_date, end_date, reason, documents } = req.body;

    if (!employee_id || !leave_type || !start_date || !end_date) {
      return res.status(400).json({ success: false, error: 'חובה: employee_id, leave_type, start_date, end_date' });
    }

    if (!LEAVE_TYPES.includes(leave_type)) {
      return res.status(400).json({ success: false, error: `סוג חופשה לא תקין. אפשרויות: ${LEAVE_TYPES.join(', ')}` });
    }

    // חישוב ימים (לא כולל שבת-ראשון)
    const start = new Date(start_date);
    const end = new Date(end_date);
    let totalDays = 0;
    const current = new Date(start);
    while (current <= end) {
      const day = current.getDay();
      if (day !== 5 && day !== 6) totalDays++; // לא שישי-שבת
      current.setDate(current.getDate() + 1);
    }

    // בדיקת יתרה
    const year = new Date(start_date).getFullYear();
    const balance = await pool.query(`
      SELECT * FROM leave_balances WHERE employee_id = $1 AND leave_type = $2 AND year = $3
    `, [employee_id, leave_type, year]);

    if (balance.rows.length > 0 && balance.rows[0].remaining_days < totalDays) {
      return res.status(400).json({
        success: false,
        error: `אין מספיק ימים. יתרה: ${balance.rows[0].remaining_days}, מבוקש: ${totalDays}`
      });
    }

    const result = await pool.query(`
      INSERT INTO leave_requests (employee_id, employee_name, leave_type, start_date, end_date, total_days, reason, documents)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [employee_id, employee_name, leave_type, start_date, end_date, totalDays, reason, JSON.stringify(documents || [])]);

    // עדכון ימים ממתינים ביתרה
    if (balance.rows.length > 0) {
      await pool.query(`
        UPDATE leave_balances SET pending_days = pending_days + $1, remaining_days = remaining_days - $1
        WHERE employee_id = $2 AND leave_type = $3 AND year = $4
      `, [totalDays, employee_id, leave_type, year]);
    }

    res.json({
      success: true,
      message: `בקשת חופשה ל-${totalDays} ימים הוגשה בהצלחה`,
      request: result.rows[0]
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// POST /approve-leave/:requestId - אישור חופשה
// ============================================================
router.post('/approve-leave/:requestId', async (req: Request, res: Response) => {
  try {
    const { requestId } = req.params;
    const { approved_by } = req.body;

    const existing = await pool.query(`SELECT * FROM leave_requests WHERE id = $1`, [requestId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'בקשה לא נמצאה' });
    }

    if (existing.rows[0].status !== 'pending') {
      return res.status(400).json({ success: false, error: `בקשה כבר טופלה - סטטוס: ${existing.rows[0].status}` });
    }

    const result = await pool.query(`
      UPDATE leave_requests SET status = 'approved', approved_by = $1, approved_at = NOW(), updated_at = NOW()
      WHERE id = $2 RETURNING *
    `, [approved_by || 'manager', requestId]);

    const req_data = result.rows[0];

    // עדכון יתרה - העברה מממתין לנוצל
    const year = new Date(req_data.start_date).getFullYear();
    await pool.query(`
      UPDATE leave_balances SET
        pending_days = GREATEST(0, pending_days - $1),
        used_days = used_days + $1
      WHERE employee_id = $2 AND leave_type = $3 AND year = $4
    `, [req_data.total_days, req_data.employee_id, req_data.leave_type, year]);

    res.json({
      success: true,
      message: 'חופשה אושרה בהצלחה',
      request: result.rows[0]
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// POST /reject-leave/:requestId - דחיית חופשה
// ============================================================
router.post('/reject-leave/:requestId', async (req: Request, res: Response) => {
  try {
    const { requestId } = req.params;
    const { approved_by, rejection_reason } = req.body;

    const existing = await pool.query(`SELECT * FROM leave_requests WHERE id = $1`, [requestId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'בקשה לא נמצאה' });
    }

    if (existing.rows[0].status !== 'pending') {
      return res.status(400).json({ success: false, error: `בקשה כבר טופלה - סטטוס: ${existing.rows[0].status}` });
    }

    const result = await pool.query(`
      UPDATE leave_requests SET status = 'rejected', approved_by = $1, approved_at = NOW(), rejection_reason = $2, updated_at = NOW()
      WHERE id = $3 RETURNING *
    `, [approved_by || 'manager', rejection_reason, requestId]);

    // החזרת ימים ממתינים ליתרה
    const req_data = result.rows[0];
    const year = new Date(req_data.start_date).getFullYear();
    await pool.query(`
      UPDATE leave_balances SET
        pending_days = GREATEST(0, pending_days - $1),
        remaining_days = remaining_days + $1
      WHERE employee_id = $2 AND leave_type = $3 AND year = $4
    `, [req_data.total_days, req_data.employee_id, req_data.leave_type, year]);

    res.json({
      success: true,
      message: 'בקשת חופשה נדחתה',
      request: result.rows[0]
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /leave-balances/:employeeId - יתרות חופשה לעובד
// ============================================================
router.get('/leave-balances/:employeeId', async (req: Request, res: Response) => {
  try {
    const { employeeId } = req.params;
    const year = req.query.year || new Date().getFullYear();

    const result = await pool.query(`
      SELECT * FROM leave_balances WHERE employee_id = $1 AND year = $2 ORDER BY leave_type
    `, [employeeId, year]);

    // בקשות ממתינות
    const pending = await pool.query(`
      SELECT * FROM leave_requests WHERE employee_id = $1 AND status = 'pending' ORDER BY start_date
    `, [employeeId]);

    res.json({
      success: true,
      employee_id: employeeId,
      year,
      balances: result.rows,
      pending_requests: pending.rows
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// POST /run-payroll/:period - חישוב משכורות לתקופה
// ============================================================
router.post('/run-payroll/:period', async (req: Request, res: Response) => {
  try {
    const { period } = req.params; // פורמט: YYYY-MM
    const { employees, notes } = req.body;

    // בדיקה אם כבר קיימת ריצת שכר לתקופה
    const existingRun = await pool.query(`SELECT id FROM payroll_runs WHERE period = $1 AND status != 'cancelled'`, [period]);
    if (existingRun.rows.length > 0) {
      return res.status(400).json({ success: false, error: `כבר קיימת ריצת שכר לתקופה ${period}`, existing_run_id: existingRun.rows[0].id });
    }

    const runNumber = `PR-${period}-${Date.now().toString().slice(-6)}`;

    // יצירת ריצת שכר
    const runResult = await pool.query(`
      INSERT INTO payroll_runs (run_number, period, run_date, status, notes)
      VALUES ($1, $2, CURRENT_DATE, 'processing', $3)
      RETURNING *
    `, [runNumber, period, notes]);

    const runId = runResult.rows[0].id;
    const startDate = `${period}-01`;
    const endDate = `${period}-31`;

    // רשימת עובדים - מהבקשה או מנוכחות
    let employeeList = employees;
    if (!employeeList || employeeList.length === 0) {
      const attendanceEmployees = await pool.query(`
        SELECT DISTINCT employee_id, employee_name FROM attendance_records WHERE date BETWEEN $1 AND $2
      `, [startDate, endDate]);
      employeeList = attendanceEmployees.rows;
    }

    let totalGross = 0;
    let totalDeductions = 0;
    let totalNet = 0;
    let totalEmployerCost = 0;
    const slips: any[] = [];

    for (const emp of employeeList) {
      const empId = emp.employee_id || emp.id;
      const empName = emp.employee_name || emp.name || `עובד ${empId}`;
      const baseSalary = emp.base_salary || 12000;

      // שליפת נתוני נוכחות לחודש
      const attendance = await pool.query(`
        SELECT
          COUNT(*) as days_worked,
          COALESCE(SUM(total_hours), 0) as total_hours,
          COALESCE(SUM(overtime_hours), 0) as total_overtime
        FROM attendance_records
        WHERE employee_id = $1 AND date BETWEEN $2 AND $3
      `, [empId, startDate, endDate]);

      const daysWorked = parseInt(attendance.rows[0].days_worked) || ISRAEL_PAYROLL_CONSTANTS.standard_working_days;
      const overtimeHours = parseFloat(attendance.rows[0].total_overtime) || 0;

      // שליפת ימי מחלה וחופשה שנוצלו בחודש
      const leaveUsage = await pool.query(`
        SELECT leave_type, SUM(total_days) as days_used
        FROM leave_requests
        WHERE employee_id = $1 AND status = 'approved'
          AND start_date >= $2 AND start_date <= $3
        GROUP BY leave_type
      `, [empId, startDate, endDate]);

      let sickDays = 0;
      let vacationDays = 0;
      for (const leave of leaveUsage.rows) {
        if (leave.leave_type === 'sick') sickDays = parseFloat(leave.days_used);
        if (leave.leave_type === 'vacation') vacationDays = parseFloat(leave.days_used);
      }

      // חישוב שכר שעות נוספות
      const hourlyRate = baseSalary / (ISRAEL_PAYROLL_CONSTANTS.standard_working_days * ISRAEL_PAYROLL_CONSTANTS.standard_daily_hours);
      let overtimePay = 0;
      if (overtimeHours > 0) {
        const first2 = Math.min(overtimeHours, 2 * daysWorked); // 2 שעות ראשונות ליום
        const after2 = Math.max(0, overtimeHours - first2);
        overtimePay = (first2 * hourlyRate * ISRAEL_PAYROLL_CONSTANTS.overtime_first_2_hours_rate)
          + (after2 * hourlyRate * ISRAEL_PAYROLL_CONSTANTS.overtime_after_2_hours_rate);
        overtimePay = parseFloat(overtimePay.toFixed(2));
      }

      // תוספות
      const commission = emp.commission || 0;
      const bonuses = emp.bonuses || 0;
      const travelAllowance = emp.travel_allowance || 0;
      const phoneAllowance = emp.phone_allowance || 0;

      // ברוטו
      const grossSalary = parseFloat((baseSalary + overtimePay + commission + bonuses + travelAllowance + phoneAllowance).toFixed(2));

      // ניכויי עובד
      const incomeTax = calculateIncomeTax(grossSalary);
      const niEmployee = parseFloat((grossSalary * ISRAEL_PAYROLL_CONSTANTS.national_insurance_employee).toFixed(2));
      const healthTaxEmployee = parseFloat((grossSalary * ISRAEL_PAYROLL_CONSTANTS.health_tax_employee).toFixed(2));
      const pensionEmployee = parseFloat((grossSalary * ISRAEL_PAYROLL_CONSTANTS.pension_employee).toFixed(2));
      const unionFee = emp.union_fee || 0;

      const totalDeductionsEmp = parseFloat((incomeTax + niEmployee + healthTaxEmployee + pensionEmployee + unionFee).toFixed(2));
      const netSalary = parseFloat((grossSalary - totalDeductionsEmp).toFixed(2));

      // עלויות מעסיק
      const niEmployer = parseFloat((grossSalary * ISRAEL_PAYROLL_CONSTANTS.national_insurance_employer).toFixed(2));
      const pensionEmployer = parseFloat((grossSalary * ISRAEL_PAYROLL_CONSTANTS.pension_employer).toFixed(2));
      const severanceFund = parseFloat((grossSalary * ISRAEL_PAYROLL_CONSTANTS.severance_rate).toFixed(2));
      const educationFundEmployer = emp.education_fund_employer || 0;

      const totalEmployerCostEmp = parseFloat((grossSalary + niEmployer + pensionEmployer + severanceFund + educationFundEmployer).toFixed(2));

      // הכנסת תלוש שכר
      const slipResult = await pool.query(`
        INSERT INTO payroll_slips (
          run_id, employee_id, employee_name, period, base_salary, overtime_pay,
          commission, bonuses, travel_allowance, phone_allowance, gross_salary,
          income_tax, national_insurance_employee, health_tax_employee, pension_employee, union_fee,
          total_deductions, net_salary,
          national_insurance_employer, pension_employer, severance_fund, education_fund_employer,
          total_employer_cost, working_days, actual_days_worked, overtime_hours,
          sick_days_used, vacation_days_used
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
          $12, $13, $14, $15, $16, $17, $18,
          $19, $20, $21, $22, $23, $24, $25, $26, $27, $28
        ) RETURNING *
      `, [
        runId, empId, empName, period, baseSalary, overtimePay,
        commission, bonuses, travelAllowance, phoneAllowance, grossSalary,
        incomeTax, niEmployee, healthTaxEmployee, pensionEmployee, unionFee,
        totalDeductionsEmp, netSalary,
        niEmployer, pensionEmployer, severanceFund, educationFundEmployer,
        totalEmployerCostEmp, ISRAEL_PAYROLL_CONSTANTS.standard_working_days, daysWorked, overtimeHours,
        sickDays, vacationDays
      ]);

      slips.push(slipResult.rows[0]);
      totalGross += grossSalary;
      totalDeductions += totalDeductionsEmp;
      totalNet += netSalary;
      totalEmployerCost += totalEmployerCostEmp;
    }

    // עדכון ריצת שכר
    await pool.query(`
      UPDATE payroll_runs SET
        total_employees = $1, total_gross = $2, total_deductions = $3,
        total_net = $4, total_employer_cost = $5, status = 'draft', updated_at = NOW()
      WHERE id = $6
    `, [employeeList.length, totalGross.toFixed(2), totalDeductions.toFixed(2), totalNet.toFixed(2), totalEmployerCost.toFixed(2), runId]);

    res.json({
      success: true,
      message: `חישוב שכר הושלם ל-${employeeList.length} עובדים`,
      run: {
        id: runId,
        run_number: runNumber,
        period,
        total_employees: employeeList.length,
        total_gross: parseFloat(totalGross.toFixed(2)),
        total_deductions: parseFloat(totalDeductions.toFixed(2)),
        total_net: parseFloat(totalNet.toFixed(2)),
        total_employer_cost: parseFloat(totalEmployerCost.toFixed(2))
      },
      slips_count: slips.length
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /payroll-summary/:period - סיכום שכר לתקופה
// ============================================================
router.get('/payroll-summary/:period', async (req: Request, res: Response) => {
  try {
    const { period } = req.params;

    const run = await pool.query(`SELECT * FROM payroll_runs WHERE period = $1 AND status != 'cancelled' ORDER BY created_at DESC LIMIT 1`, [period]);
    if (run.rows.length === 0) {
      return res.status(404).json({ success: false, error: `לא נמצאה ריצת שכר לתקופה ${period}` });
    }

    const slips = await pool.query(`
      SELECT * FROM payroll_slips WHERE run_id = $1 ORDER BY employee_name
    `, [run.rows[0].id]);

    // סטטיסטיקות
    const stats = await pool.query(`
      SELECT
        AVG(gross_salary) as avg_gross,
        MIN(gross_salary) as min_gross,
        MAX(gross_salary) as max_gross,
        AVG(net_salary) as avg_net,
        SUM(overtime_pay) as total_overtime_pay,
        AVG(overtime_hours) as avg_overtime_hours
      FROM payroll_slips WHERE run_id = $1
    `, [run.rows[0].id]);

    res.json({
      success: true,
      run: run.rows[0],
      statistics: stats.rows[0],
      slips: slips.rows
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /payslip/:employeeId/:period - תלוש שכר לעובד
// ============================================================
router.get('/payslip/:employeeId/:period', async (req: Request, res: Response) => {
  try {
    const { employeeId, period } = req.params;

    const result = await pool.query(`
      SELECT ps.*, pr.run_number, pr.status as run_status
      FROM payroll_slips ps
      JOIN payroll_runs pr ON ps.run_id = pr.id
      WHERE ps.employee_id = $1 AND ps.period = $2
      ORDER BY ps.created_at DESC LIMIT 1
    `, [employeeId, period]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'תלוש שכר לא נמצא' });
    }

    res.json({
      success: true,
      payslip: result.rows[0]
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /dashboard - לוח מחוונים נוכחות ושכר
// ============================================================
router.get('/dashboard', async (_req: Request, res: Response) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    // נוכחות היום
    const todayAttendance = await pool.query(`
      SELECT
        COUNT(*) as total_present,
        COUNT(*) FILTER (WHERE late_minutes > 0) as late_count,
        COUNT(*) FILTER (WHERE clock_out IS NULL) as still_at_work,
        AVG(total_hours) FILTER (WHERE clock_out IS NOT NULL) as avg_hours
      FROM attendance_records WHERE date = $1
    `, [today]);

    // חישוב נעדרים (מספר עובדים צפוי פחות נוכחים)
    const totalEmployeesResult = await pool.query(`
      SELECT COUNT(DISTINCT employee_id) as total FROM attendance_records WHERE date >= CURRENT_DATE - INTERVAL '30 days'
    `);
    const expectedEmployees = parseInt(totalEmployeesResult.rows[0].total) || 200;
    const presentToday = parseInt(todayAttendance.rows[0].total_present) || 0;
    const absentCount = Math.max(0, expectedEmployees - presentToday);

    // חופשות ממתינות
    const pendingLeaves = await pool.query(`SELECT COUNT(*) as count FROM leave_requests WHERE status = 'pending'`);

    // חופשות פעילות היום
    const activeLeaves = await pool.query(`
      SELECT COUNT(*) as count FROM leave_requests
      WHERE status = 'approved' AND $1 BETWEEN start_date AND end_date
    `, [today]);

    // סטטוס שכר אחרון
    const latestPayroll = await pool.query(`
      SELECT * FROM payroll_runs ORDER BY created_at DESC LIMIT 1
    `);

    // חודש נוכחי - סיכום
    const currentMonth = today.substring(0, 7);
    const monthSummary = await pool.query(`
      SELECT
        COUNT(DISTINCT employee_id) as active_employees,
        COUNT(*) as total_attendance_records,
        SUM(overtime_hours) as total_overtime_hours
      FROM attendance_records WHERE date >= $1
    `, [`${currentMonth}-01`]);

    res.json({
      success: true,
      dashboard: {
        today: {
          date: today,
          present: presentToday,
          late: parseInt(todayAttendance.rows[0].late_count) || 0,
          absent: absentCount,
          still_at_work: parseInt(todayAttendance.rows[0].still_at_work) || 0,
          avg_hours: parseFloat(todayAttendance.rows[0].avg_hours) || 0,
          on_leave: parseInt(activeLeaves.rows[0].count) || 0
        },
        leaves: {
          pending_requests: parseInt(pendingLeaves.rows[0].count) || 0,
          active_today: parseInt(activeLeaves.rows[0].count) || 0
        },
        payroll: {
          latest_run: latestPayroll.rows[0] || null
        },
        month_summary: monthSummary.rows[0]
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// POST /send-payslips/:runId - סימון תלושים כנשלחו
// ============================================================
router.post('/send-payslips/:runId', async (req: Request, res: Response) => {
  try {
    const { runId } = req.params;

    const run = await pool.query(`SELECT * FROM payroll_runs WHERE id = $1`, [runId]);
    if (run.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'ריצת שכר לא נמצאה' });
    }

    await pool.query(`
      UPDATE payroll_runs SET sent_to_accountant = true, updated_at = NOW() WHERE id = $1
    `, [runId]);

    const slipsCount = await pool.query(`SELECT COUNT(*) as count FROM payroll_slips WHERE run_id = $1`, [runId]);

    res.json({
      success: true,
      message: `${slipsCount.rows[0].count} תלושי שכר סומנו כנשלחו`,
      run_id: runId,
      period: run.rows[0].period,
      slips_sent: parseInt(slipsCount.rows[0].count)
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /employer-cost-report/:period - דוח עלות מעסיק
// ============================================================
router.get('/employer-cost-report/:period', async (req: Request, res: Response) => {
  try {
    const { period } = req.params;

    const run = await pool.query(`SELECT * FROM payroll_runs WHERE period = $1 AND status != 'cancelled' ORDER BY created_at DESC LIMIT 1`, [period]);
    if (run.rows.length === 0) {
      return res.status(404).json({ success: false, error: `לא נמצאה ריצת שכר לתקופה ${period}` });
    }

    const costBreakdown = await pool.query(`
      SELECT
        SUM(gross_salary) as total_gross,
        SUM(national_insurance_employer) as total_ni_employer,
        SUM(pension_employer) as total_pension_employer,
        SUM(severance_fund) as total_severance,
        SUM(education_fund_employer) as total_education_fund,
        SUM(total_employer_cost) as total_cost,
        AVG(total_employer_cost) as avg_cost_per_employee,
        MIN(total_employer_cost) as min_cost,
        MAX(total_employer_cost) as max_cost
      FROM payroll_slips WHERE run_id = $1
    `, [run.rows[0].id]);

    const perEmployee = await pool.query(`
      SELECT employee_id, employee_name, gross_salary, total_employer_cost,
        national_insurance_employer, pension_employer, severance_fund, education_fund_employer
      FROM payroll_slips WHERE run_id = $1 ORDER BY total_employer_cost DESC
    `, [run.rows[0].id]);

    res.json({
      success: true,
      period,
      cost_breakdown: costBreakdown.rows[0],
      per_employee: perEmployee.rows,
      payroll_constants_used: {
        ni_employer_rate: ISRAEL_PAYROLL_CONSTANTS.national_insurance_employer,
        pension_employer_rate: ISRAEL_PAYROLL_CONSTANTS.pension_employer,
        severance_rate: ISRAEL_PAYROLL_CONSTANTS.severance_rate,
        health_tax_employer_rate: ISRAEL_PAYROLL_CONSTANTS.health_tax_employer
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// CRUD - נוכחות
// ============================================================

router.get('/attendance/today', async (req: Request, res: Response) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const result = await pool.query(
      `SELECT * FROM attendance_records WHERE date = $1 ORDER BY clock_in DESC`,
      [today]
    );
    const summary = await pool.query(
      `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'present') as present,
        COUNT(*) FILTER (WHERE status = 'absent') as absent,
        COUNT(*) FILTER (WHERE status = 'late') as late,
        AVG(total_hours)::numeric(5,2) as avg_hours
      FROM attendance_records WHERE date = $1`,
      [today]
    );
    res.json({ 
      success: true, 
      date: today, 
      records: result.rows,
      summary: summary.rows[0] || { total: 0, present: 0, absent: 0, late: 0, avg_hours: 0 }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/attendance', async (req: Request, res: Response) => {
  try {
    const { employee_id, date, status, limit = 50, offset = 0 } = req.query;
    let query = `SELECT * FROM attendance_records WHERE 1=1`;
    const params: any[] = [];
    let idx = 1;
    if (employee_id) { query += ` AND employee_id = $${idx++}`; params.push(employee_id); }
    if (date) { query += ` AND date = $${idx++}`; params.push(date); }
    if (status) { query += ` AND status = $${idx++}`; params.push(status); }
    query += ` ORDER BY date DESC, employee_name LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limit, offset);
    const result = await pool.query(query, params);
    res.json({ success: true, records: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/attendance', async (req: Request, res: Response) => {
  try {
    const { employee_id, employee_name, date, clock_in, clock_out, total_hours, overtime_hours, break_minutes, status, late_minutes, early_leave_minutes, shift_type, approved_by, notes } = req.body;
    const result = await pool.query(`
      INSERT INTO attendance_records (employee_id, employee_name, date, clock_in, clock_out, total_hours, overtime_hours, break_minutes, status, late_minutes, early_leave_minutes, shift_type, approved_by, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *
    `, [employee_id, employee_name, date, clock_in, clock_out, total_hours, overtime_hours, break_minutes || 0, status || 'present', late_minutes || 0, early_leave_minutes || 0, shift_type || 'regular', approved_by, notes]);
    res.json({ success: true, record: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/attendance/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const fields = req.body;
    const setClauses: string[] = [];
    const params: any[] = [];
    let idx = 1;
    for (const [key, value] of Object.entries(fields)) {
      setClauses.push(`${key} = $${idx++}`);
      params.push(value);
    }
    if (setClauses.length === 0) return res.status(400).json({ success: false, error: 'לא סופקו שדות לעדכון' });
    params.push(id);
    const result = await pool.query(`UPDATE attendance_records SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`, params);
    res.json({ success: true, record: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// CRUD - חופשות
// ============================================================
router.get('/leaves', async (req: Request, res: Response) => {
  try {
    const { employee_id, status, leave_type, limit = 50, offset = 0 } = req.query;
    let query = `SELECT * FROM leave_requests WHERE 1=1`;
    const params: any[] = [];
    let idx = 1;
    if (employee_id) { query += ` AND employee_id = $${idx++}`; params.push(employee_id); }
    if (status) { query += ` AND status = $${idx++}`; params.push(status); }
    if (leave_type) { query += ` AND leave_type = $${idx++}`; params.push(leave_type); }
    query += ` ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limit, offset);
    const result = await pool.query(query, params);
    res.json({ success: true, requests: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// CRUD - יתרות חופשה
// ============================================================
router.post('/leave-balances', async (req: Request, res: Response) => {
  try {
    const { employee_id, leave_type, year, entitled_days, carry_over_days } = req.body;
    const remaining = (entitled_days || 0) + (carry_over_days || 0);
    const result = await pool.query(`
      INSERT INTO leave_balances (employee_id, leave_type, year, entitled_days, remaining_days, carry_over_days)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (employee_id, leave_type, year) DO UPDATE SET entitled_days = $4, remaining_days = $5, carry_over_days = $6
      RETURNING *
    `, [employee_id, leave_type, year, entitled_days, remaining, carry_over_days || 0]);
    res.json({ success: true, balance: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// CRUD - ריצות שכר
// ============================================================
router.get('/payroll-runs', async (req: Request, res: Response) => {
  try {
    const { status, limit = 20, offset = 0 } = req.query;
    let query = `SELECT * FROM payroll_runs WHERE 1=1`;
    const params: any[] = [];
    let idx = 1;
    if (status) { query += ` AND status = $${idx++}`; params.push(status); }
    query += ` ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limit, offset);
    const result = await pool.query(query, params);
    res.json({ success: true, runs: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/payroll-runs/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, approved_by, notes } = req.body;
    const result = await pool.query(`
      UPDATE payroll_runs SET
        status = COALESCE($1, status),
        approved_by = COALESCE($2, approved_by),
        approved_at = CASE WHEN $1 = 'approved' THEN NOW() ELSE approved_at END,
        notes = COALESCE($3, notes),
        updated_at = NOW()
      WHERE id = $4 RETURNING *
    `, [status, approved_by, notes, id]);
    res.json({ success: true, run: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
