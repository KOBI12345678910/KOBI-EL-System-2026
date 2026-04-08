// ============================================================
// מנוע נוכחות, משמרות וחופשות - TechnoKoluzi ERP
// ניהול נוכחות ל-200 עובדים, משמרות, שעות נוספות, חופשות
// בהתאם לחוקי עבודה ישראליים
// ============================================================

import { Router, Request, Response } from "express";
import { pool } from "@workspace/db";

const router = Router();

// ============================================================
// יצירת טבלאות + נתוני בסיס
// ============================================================
router.post("/init", async (_req: Request, res: Response) => {
  try {
    // טבלת רשומות נוכחות
    await pool.query(`
      CREATE TABLE IF NOT EXISTS attendance_records (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL,
        employee_name VARCHAR(255) NOT NULL,
        date DATE NOT NULL,
        clock_in TIMESTAMPTZ,
        clock_out TIMESTAMPTZ,
        clock_in_location JSONB,
        clock_out_location JSONB,
        total_hours NUMERIC(5,2) DEFAULT 0,
        overtime_hours NUMERIC(5,2) DEFAULT 0,
        break_minutes INTEGER DEFAULT 0,
        shift_type VARCHAR(20) DEFAULT 'regular',
        status VARCHAR(20) DEFAULT 'present',
        late_minutes INTEGER DEFAULT 0,
        early_leave_minutes INTEGER DEFAULT 0,
        approved BOOLEAN DEFAULT false,
        approved_by VARCHAR(255),
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // טבלת בקשות חופשה
    await pool.query(`
      CREATE TABLE IF NOT EXISTS leave_requests (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL,
        employee_name VARCHAR(255) NOT NULL,
        department VARCHAR(100),
        leave_type VARCHAR(30) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        total_days NUMERIC(4,1) DEFAULT 0,
        reason TEXT,
        replacement_employee VARCHAR(255),
        documents JSONB DEFAULT '[]',
        status VARCHAR(20) DEFAULT 'pending',
        approved_by VARCHAR(255),
        approved_at TIMESTAMPTZ,
        rejection_reason TEXT,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // טבלת יתרות חופשה
    await pool.query(`
      CREATE TABLE IF NOT EXISTS leave_balances (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL,
        year INTEGER NOT NULL,
        vacation_days_total NUMERIC(4,1) DEFAULT 12,
        vacation_days_used NUMERIC(4,1) DEFAULT 0,
        vacation_days_remaining NUMERIC(4,1) DEFAULT 12,
        sick_days_total NUMERIC(4,1) DEFAULT 18,
        sick_days_used NUMERIC(4,1) DEFAULT 0,
        sick_days_remaining NUMERIC(4,1) DEFAULT 18,
        personal_days_total NUMERIC(4,1) DEFAULT 3,
        personal_days_used NUMERIC(4,1) DEFAULT 0,
        personal_days_remaining NUMERIC(4,1) DEFAULT 3,
        military_days_used NUMERIC(4,1) DEFAULT 0,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // טבלת משמרות
    await pool.query(`
      CREATE TABLE IF NOT EXISTS shifts (
        id SERIAL PRIMARY KEY,
        shift_name VARCHAR(100) NOT NULL,
        shift_name_he VARCHAR(100),
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        break_duration_min INTEGER DEFAULT 30,
        is_overnight BOOLEAN DEFAULT false,
        overtime_after_hours NUMERIC(4,2) DEFAULT 8.5,
        overtime_rate NUMERIC(3,2) DEFAULT 1.25,
        overtime_rate_150 NUMERIC(3,2) DEFAULT 1.5,
        department VARCHAR(100),
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // אינדקסים לביצועים
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_attendance_employee_date ON attendance_records(employee_id, date)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance_records(date)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_attendance_status ON attendance_records(status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests(status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_leave_requests_employee ON leave_requests(employee_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_leave_balances_employee_year ON leave_balances(employee_id, year)`);

    // זריעת משמרות ברירת מחדל - משמרת בוקר, צהריים, לילה, משרד
    const existingShifts = await pool.query(`SELECT COUNT(*) FROM shifts`);
    if (parseInt(existingShifts.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO shifts (shift_name, shift_name_he, start_time, end_time, break_duration_min, is_overnight, overtime_after_hours, department) VALUES
        ('morning', 'משמרת בוקר', '07:00', '15:30', 30, false, 8.5, 'ייצור'),
        ('afternoon', 'משמרת צהריים', '15:30', '00:00', 30, true, 8.5, 'ייצור'),
        ('night', 'משמרת לילה', '00:00', '07:00', 20, false, 7.0, 'ייצור'),
        ('office', 'משמרת משרד', '08:30', '17:00', 30, false, 8.5, 'הנהלה')
      `);
    }

    // זריעת יתרות חופשה ל-10 עובדים לדוגמה
    const currentYear = new Date().getFullYear();
    const existingBalances = await pool.query(`SELECT COUNT(*) FROM leave_balances WHERE year = $1`, [currentYear]);
    if (parseInt(existingBalances.rows[0].count) === 0) {
      const employeeSeeds = [];
      for (let i = 1; i <= 10; i++) {
        // ותק שונה לכל עובד - משפיע על ימי חופשה
        const vacationDays = 12 + Math.floor(i / 3) * 2; // 12-18 ימים לפי ותק
        const usedVacation = Math.floor(Math.random() * 5);
        const usedSick = Math.floor(Math.random() * 4);
        const usedPersonal = Math.floor(Math.random() * 2);
        employeeSeeds.push(
          `(${i}, ${currentYear}, ${vacationDays}, ${usedVacation}, ${vacationDays - usedVacation}, 18, ${usedSick}, ${18 - usedSick}, 3, ${usedPersonal}, ${3 - usedPersonal}, 0)`
        );
      }
      await pool.query(`
        INSERT INTO leave_balances (employee_id, year, vacation_days_total, vacation_days_used, vacation_days_remaining, sick_days_total, sick_days_used, sick_days_remaining, personal_days_total, personal_days_used, personal_days_remaining, military_days_used)
        VALUES ${employeeSeeds.join(", ")}
      `);
    }

    res.json({
      success: true,
      message: "טבלאות נוכחות, חופשות, יתרות ומשמרות נוצרו בהצלחה",
      tables: ["attendance_records", "leave_requests", "leave_balances", "shifts"],
      seeded: { shifts: 4, leave_balances: 10 }
    });
  } catch (error: any) {
    console.error("שגיאה באתחול מנוע נוכחות:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// פונקציית עזר - חישוב שעות נוספות לפי חוק ישראלי
// 8.5 שעות רגילות, אחר כך 125% ל-2 שעות, אחר כך 150%
// יום שישי: 7 שעות ואז שעות נוספות
// שבת: 150% מההתחלה
// ============================================================
function calculateOvertimeIsrael(totalHours: number, date: Date): { regularHours: number; overtime125: number; overtime150: number; totalOvertimeHours: number } {
  const dayOfWeek = date.getDay(); // 0=ראשון, 5=שישי, 6=שבת

  // שבת - הכל ב-150%
  if (dayOfWeek === 6) {
    return {
      regularHours: 0,
      overtime125: 0,
      overtime150: totalHours,
      totalOvertimeHours: totalHours
    };
  }

  // שישי - 7 שעות רגילות
  const regularThreshold = dayOfWeek === 5 ? 7 : 8.5;
  const overtime125Limit = 2; // 2 שעות ב-125%

  if (totalHours <= regularThreshold) {
    return { regularHours: totalHours, overtime125: 0, overtime150: 0, totalOvertimeHours: 0 };
  }

  const overtimeTotal = totalHours - regularThreshold;
  const overtime125 = Math.min(overtimeTotal, overtime125Limit);
  const overtime150 = Math.max(0, overtimeTotal - overtime125Limit);

  return {
    regularHours: regularThreshold,
    overtime125,
    overtime150,
    totalOvertimeHours: overtime125 + overtime150
  };
}

// ============================================================
// כניסה לעבודה - רישום שעת כניסה עם מיקום GPS
// ============================================================
router.post("/clock-in", async (req: Request, res: Response) => {
  try {
    const { employee_id, employee_name, shift_type, location, notes } = req.body;

    if (!employee_id || !employee_name) {
      return res.status(400).json({ success: false, error: "נדרש מזהה עובד ושם עובד" });
    }

    const today = new Date().toISOString().split("T")[0];

    // בדיקה האם כבר נרשמה כניסה היום
    const existing = await pool.query(
      `SELECT id FROM attendance_records WHERE employee_id = $1 AND date = $2 AND clock_out IS NULL`,
      [employee_id, today]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ success: false, error: "העובד כבר רשום כנוכח - יש לבצע יציאה קודם" });
    }

    // חישוב איחור - לפי סוג המשמרת
    const shiftInfo = await pool.query(
      `SELECT start_time FROM shifts WHERE shift_name = $1 AND status = 'active' LIMIT 1`,
      [shift_type || "office"]
    );

    let lateMinutes = 0;
    if (shiftInfo.rows.length > 0) {
      const shiftStart = shiftInfo.rows[0].start_time;
      const now = new Date();
      const [shiftH, shiftM] = shiftStart.split(":").map(Number);
      const shiftStartDate = new Date(now);
      shiftStartDate.setHours(shiftH, shiftM, 0, 0);
      const diffMs = now.getTime() - shiftStartDate.getTime();
      if (diffMs > 0) {
        lateMinutes = Math.floor(diffMs / 60000);
      }
    }

    const status = lateMinutes > 15 ? "late" : "present";

    const result = await pool.query(
      `INSERT INTO attendance_records (employee_id, employee_name, date, clock_in, clock_in_location, shift_type, status, late_minutes, notes)
       VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7, $8)
       RETURNING *`,
      [employee_id, employee_name, today, location ? JSON.stringify(location) : null, shift_type || "regular", status, lateMinutes, notes || null]
    );

    res.json({
      success: true,
      message: `כניסה נרשמה בהצלחה${lateMinutes > 0 ? ` - איחור של ${lateMinutes} דקות` : ""}`,
      record: result.rows[0]
    });
  } catch (error: any) {
    console.error("שגיאה ברישום כניסה:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// יציאה מעבודה - רישום שעת יציאה, חישוב שעות ושעות נוספות
// ============================================================
router.post("/clock-out", async (req: Request, res: Response) => {
  try {
    const { employee_id, location, break_minutes, notes } = req.body;

    if (!employee_id) {
      return res.status(400).json({ success: false, error: "נדרש מזהה עובד" });
    }

    const today = new Date().toISOString().split("T")[0];

    // מציאת הרשומה הפתוחה של היום
    const openRecord = await pool.query(
      `SELECT * FROM attendance_records WHERE employee_id = $1 AND date = $2 AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1`,
      [employee_id, today]
    );

    if (openRecord.rows.length === 0) {
      return res.status(400).json({ success: false, error: "לא נמצאה רשומת כניסה פתוחה להיום" });
    }

    const record = openRecord.rows[0];
    const clockIn = new Date(record.clock_in);
    const clockOut = new Date();
    const breakMin = break_minutes || record.break_minutes || 0;

    // חישוב סה\"כ שעות (כולל הפחתת הפסקה)
    const totalMs = clockOut.getTime() - clockIn.getTime();
    const totalHoursRaw = totalMs / (1000 * 60 * 60);
    const totalHours = Math.max(0, totalHoursRaw - breakMin / 60);

    // חישוב שעות נוספות לפי חוק ישראלי
    const dateObj = new Date(today);
    const overtime = calculateOvertimeIsrael(totalHours, dateObj);

    // חישוב יציאה מוקדמת
    let earlyLeaveMinutes = 0;
    const shiftInfo = await pool.query(
      `SELECT end_time FROM shifts WHERE shift_name = $1 AND status = 'active' LIMIT 1`,
      [record.shift_type || "office"]
    );
    if (shiftInfo.rows.length > 0) {
      const [endH, endM] = shiftInfo.rows[0].end_time.split(":").map(Number);
      const shiftEnd = new Date(clockOut);
      shiftEnd.setHours(endH, endM, 0, 0);
      const diffMs = shiftEnd.getTime() - clockOut.getTime();
      if (diffMs > 0) {
        earlyLeaveMinutes = Math.floor(diffMs / 60000);
      }
    }

    const result = await pool.query(
      `UPDATE attendance_records
       SET clock_out = NOW(),
           clock_out_location = $1,
           total_hours = $2,
           overtime_hours = $3,
           break_minutes = $4,
           early_leave_minutes = $5,
           notes = COALESCE(notes, '') || $6,
           updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [
        location ? JSON.stringify(location) : null,
        Math.round(totalHours * 100) / 100,
        Math.round(overtime.totalOvertimeHours * 100) / 100,
        breakMin,
        earlyLeaveMinutes,
        notes ? `\n${notes}` : "",
        record.id
      ]
    );

    res.json({
      success: true,
      message: "יציאה נרשמה בהצלחה",
      record: result.rows[0],
      overtime_breakdown: overtime
    });
  } catch (error: any) {
    console.error("שגיאה ברישום יציאה:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// נוכחות היום - כל העובדים
// ============================================================
router.get("/today", async (_req: Request, res: Response) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const result = await pool.query(
      `SELECT * FROM attendance_records WHERE date = $1 ORDER BY clock_in DESC`,
      [today]
    );

    res.json({ success: true, date: today, count: result.rows.length, records: result.rows });
  } catch (error: any) {
    console.error("שגיאה בשליפת נוכחות יומית:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// דוח נוכחות חודשי לעובד
// ============================================================
router.get("/employee/:id/monthly/:month", async (req: Request, res: Response) => {
  try {
    const { id, month } = req.params; // month = 'YYYY-MM'
    const startDate = `${month}-01`;
    const endDate = `${month}-31`; // PostgreSQL יתעלם מתאריכים לא קיימים

    const records = await pool.query(
      `SELECT * FROM attendance_records
       WHERE employee_id = $1 AND date BETWEEN $2 AND $3
       ORDER BY date ASC`,
      [id, startDate, endDate]
    );

    // סיכום חודשי
    const summary = {
      employee_id: parseInt(id),
      month,
      total_days_worked: 0,
      total_hours: 0,
      total_overtime_hours: 0,
      total_late_minutes: 0,
      late_count: 0,
      absent_count: 0,
      remote_count: 0,
      sick_count: 0,
      vacation_count: 0,
      early_leave_count: 0
    };

    for (const rec of records.rows) {
      summary.total_days_worked++;
      summary.total_hours += parseFloat(rec.total_hours || 0);
      summary.total_overtime_hours += parseFloat(rec.overtime_hours || 0);
      summary.total_late_minutes += parseInt(rec.late_minutes || 0);
      if (rec.status === "late") summary.late_count++;
      if (rec.status === "absent") summary.absent_count++;
      if (rec.status === "remote") summary.remote_count++;
      if (rec.status === "sick_leave") summary.sick_count++;
      if (rec.status === "vacation") summary.vacation_count++;
      if (parseInt(rec.early_leave_minutes || 0) > 0) summary.early_leave_count++;
    }

    summary.total_hours = Math.round(summary.total_hours * 100) / 100;
    summary.total_overtime_hours = Math.round(summary.total_overtime_hours * 100) / 100;

    res.json({ success: true, summary, records: records.rows });
  } catch (error: any) {
    console.error("שגיאה בדוח חודשי עובד:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// נוכחות מחלקה היום
// ============================================================
router.get("/department/:dept/today", async (req: Request, res: Response) => {
  try {
    const { dept } = req.params;
    const today = new Date().toISOString().split("T")[0];

    // שליפת עובדים מהמחלקה שנרשמו היום
    const result = await pool.query(
      `SELECT ar.* FROM attendance_records ar
       WHERE ar.date = $1
       AND ar.shift_type IN (
         SELECT s.shift_name FROM shifts s WHERE s.department = $2
       )
       ORDER BY ar.clock_in ASC`,
      [today, dept]
    );

    // סטטיסטיקות מחלקה
    const stats = {
      department: dept,
      date: today,
      total_present: result.rows.filter((r: any) => r.status === "present").length,
      total_late: result.rows.filter((r: any) => r.status === "late").length,
      total_remote: result.rows.filter((r: any) => r.status === "remote").length,
      total_absent: result.rows.filter((r: any) => r.status === "absent").length,
      still_working: result.rows.filter((r: any) => !r.clock_out).length
    };

    res.json({ success: true, stats, records: result.rows });
  } catch (error: any) {
    console.error("שגיאה בנוכחות מחלקה:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// הגשת בקשת חופשה
// ============================================================
router.post("/leave-request", async (req: Request, res: Response) => {
  try {
    const {
      employee_id, employee_name, department, leave_type,
      start_date, end_date, reason, replacement_employee, documents, notes
    } = req.body;

    if (!employee_id || !employee_name || !leave_type || !start_date || !end_date) {
      return res.status(400).json({ success: false, error: "חסרים שדות חובה: מזהה עובד, שם, סוג חופשה, תאריך התחלה וסיום" });
    }

    // חישוב מספר ימים (לא כולל שבת)
    const start = new Date(start_date);
    const end = new Date(end_date);
    let totalDays = 0;
    const current = new Date(start);
    while (current <= end) {
      const dayOfWeek = current.getDay();
      if (dayOfWeek !== 6) { // לא סופרים שבת
        totalDays += dayOfWeek === 5 ? 0.5 : 1; // שישי = חצי יום
      }
      current.setDate(current.getDate() + 1);
    }

    // בדיקת יתרה
    const year = start.getFullYear();
    const balance = await pool.query(
      `SELECT * FROM leave_balances WHERE employee_id = $1 AND year = $2`,
      [employee_id, year]
    );

    if (balance.rows.length > 0) {
      const bal = balance.rows[0];
      let available = 0;
      if (leave_type === "vacation") available = parseFloat(bal.vacation_days_remaining);
      else if (leave_type === "sick") available = parseFloat(bal.sick_days_remaining);
      else if (leave_type === "personal") available = parseFloat(bal.personal_days_remaining);

      if (["vacation", "sick", "personal"].includes(leave_type) && totalDays > available) {
        return res.status(400).json({
          success: false,
          error: `אין מספיק יתרה. נדרש: ${totalDays} ימים, זמין: ${available} ימים`
        });
      }
    }

    const result = await pool.query(
      `INSERT INTO leave_requests (employee_id, employee_name, department, leave_type, start_date, end_date, total_days, reason, replacement_employee, documents, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [employee_id, employee_name, department, leave_type, start_date, end_date, totalDays, reason, replacement_employee, JSON.stringify(documents || []), notes]
    );

    res.json({
      success: true,
      message: `בקשת חופשה (${leave_type}) נשלחה לאישור - ${totalDays} ימים`,
      request: result.rows[0]
    });
  } catch (error: any) {
    console.error("שגיאה בהגשת בקשת חופשה:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// אישור בקשת חופשה - עדכון יתרה אוטומטי
// ============================================================
router.put("/leave-request/:id/approve", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { approved_by, notes } = req.body;

    // שליפת הבקשה
    const request = await pool.query(`SELECT * FROM leave_requests WHERE id = $1`, [id]);
    if (request.rows.length === 0) {
      return res.status(404).json({ success: false, error: "בקשת חופשה לא נמצאה" });
    }

    const leaveReq = request.rows[0];
    if (leaveReq.status !== "pending") {
      return res.status(400).json({ success: false, error: `הבקשה כבר טופלה - סטטוס: ${leaveReq.status}` });
    }

    // אישור הבקשה
    const result = await pool.query(
      `UPDATE leave_requests
       SET status = 'approved', approved_by = $1, approved_at = NOW(), notes = COALESCE(notes, '') || $2, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [approved_by || "מנהל", notes ? `\n${notes}` : "", id]
    );

    // עדכון יתרת חופשה
    const year = new Date(leaveReq.start_date).getFullYear();
    const days = parseFloat(leaveReq.total_days);

    if (leaveReq.leave_type === "vacation") {
      await pool.query(
        `UPDATE leave_balances SET vacation_days_used = vacation_days_used + $1, vacation_days_remaining = vacation_days_remaining - $1, updated_at = NOW()
         WHERE employee_id = $2 AND year = $3`,
        [days, leaveReq.employee_id, year]
      );
    } else if (leaveReq.leave_type === "sick") {
      await pool.query(
        `UPDATE leave_balances SET sick_days_used = sick_days_used + $1, sick_days_remaining = sick_days_remaining - $1, updated_at = NOW()
         WHERE employee_id = $2 AND year = $3`,
        [days, leaveReq.employee_id, year]
      );
    } else if (leaveReq.leave_type === "personal") {
      await pool.query(
        `UPDATE leave_balances SET personal_days_used = personal_days_used + $1, personal_days_remaining = personal_days_remaining - $1, updated_at = NOW()
         WHERE employee_id = $2 AND year = $3`,
        [days, leaveReq.employee_id, year]
      );
    } else if (leaveReq.leave_type === "military_reserve") {
      await pool.query(
        `UPDATE leave_balances SET military_days_used = military_days_used + $1, updated_at = NOW()
         WHERE employee_id = $2 AND year = $3`,
        [days, leaveReq.employee_id, year]
      );
    }

    // הוספת רשומות נוכחות לימי החופשה
    const start = new Date(leaveReq.start_date);
    const end = new Date(leaveReq.end_date);
    const current = new Date(start);
    while (current <= end) {
      const dayOfWeek = current.getDay();
      if (dayOfWeek !== 6) { // לא שבת
        const dateStr = current.toISOString().split("T")[0];
        const statusMap: Record<string, string> = {
          vacation: "vacation",
          sick: "sick_leave",
          military_reserve: "military_reserve",
          personal: "vacation",
          bereavement: "vacation",
          study: "vacation",
          maternity: "vacation",
          paternity: "vacation",
          unpaid: "absent"
        };
        await pool.query(
          `INSERT INTO attendance_records (employee_id, employee_name, date, status, notes)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT DO NOTHING`,
          [leaveReq.employee_id, leaveReq.employee_name, dateStr, statusMap[leaveReq.leave_type] || "vacation", `חופשה מאושרת: ${leaveReq.leave_type}`]
        );
      }
      current.setDate(current.getDate() + 1);
    }

    res.json({
      success: true,
      message: `בקשת חופשה אושרה - ${days} ימים עודכנו ביתרה`,
      request: result.rows[0]
    });
  } catch (error: any) {
    console.error("שגיאה באישור חופשה:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// דחיית בקשת חופשה
// ============================================================
router.put("/leave-request/:id/reject", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { approved_by, rejection_reason } = req.body;

    const result = await pool.query(
      `UPDATE leave_requests
       SET status = 'rejected', approved_by = $1, approved_at = NOW(), rejection_reason = $2, updated_at = NOW()
       WHERE id = $3 AND status = 'pending'
       RETURNING *`,
      [approved_by || "מנהל", rejection_reason || "לא אושר", id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "בקשה לא נמצאה או כבר טופלה" });
    }

    res.json({
      success: true,
      message: "בקשת חופשה נדחתה",
      request: result.rows[0]
    });
  } catch (error: any) {
    console.error("שגיאה בדחיית חופשה:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// כל הבקשות הממתינות לאישור
// ============================================================
router.get("/leave-requests/pending", async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT * FROM leave_requests WHERE status = 'pending' ORDER BY created_at ASC`
    );

    res.json({ success: true, count: result.rows.length, requests: result.rows });
  } catch (error: any) {
    console.error("שגיאה בשליפת בקשות ממתינות:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// יתרת חופשות עובד
// ============================================================
router.get("/leave-balance/:employeeId", async (req: Request, res: Response) => {
  try {
    const { employeeId } = req.params;
    const year = new Date().getFullYear();

    const result = await pool.query(
      `SELECT * FROM leave_balances WHERE employee_id = $1 AND year = $2`,
      [employeeId, year]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "לא נמצאה יתרת חופשות לעובד" });
    }

    // שליפת חופשות מאושרות עתידיות
    const upcoming = await pool.query(
      `SELECT * FROM leave_requests WHERE employee_id = $1 AND status = 'approved' AND start_date >= CURRENT_DATE ORDER BY start_date ASC`,
      [employeeId]
    );

    res.json({
      success: true,
      balance: result.rows[0],
      upcoming_leaves: upcoming.rows
    });
  } catch (error: any) {
    console.error("שגיאה בשליפת יתרת חופשות:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// דשבורד נוכחות - סיכום יומי מקיף
// ============================================================
router.get("/dashboard", async (_req: Request, res: Response) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const monthStart = today.substring(0, 7) + "-01";

    // סטטיסטיקות נוכחות היום
    const todayStats = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status IN ('present', 'late', 'remote', 'field_work')) as present_today,
        COUNT(*) FILTER (WHERE status = 'absent') as absent_today,
        COUNT(*) FILTER (WHERE status = 'late') as late_today,
        COUNT(*) FILTER (WHERE status = 'remote') as remote_today,
        COUNT(*) FILTER (WHERE status = 'sick_leave') as sick_today,
        COUNT(*) FILTER (WHERE status = 'vacation') as vacation_today,
        COUNT(*) FILTER (WHERE status = 'military_reserve') as military_today,
        COUNT(*) FILTER (WHERE clock_out IS NULL AND clock_in IS NOT NULL) as still_working,
        COALESCE(SUM(total_hours), 0) as total_hours_today,
        COALESCE(SUM(overtime_hours), 0) as overtime_hours_today,
        COALESCE(AVG(late_minutes) FILTER (WHERE late_minutes > 0), 0) as avg_late_minutes
      FROM attendance_records
      WHERE date = $1
    `, [today]);

    // סה\"כ שעות נוספות החודש
    const monthlyOvertime = await pool.query(`
      SELECT COALESCE(SUM(overtime_hours), 0) as monthly_overtime
      FROM attendance_records
      WHERE date >= $1 AND date <= $2
    `, [monthStart, today]);

    // עובדים עם הכי הרבה איחורים החודש
    const topLate = await pool.query(`
      SELECT employee_id, employee_name, COUNT(*) as late_count, SUM(late_minutes) as total_late_minutes
      FROM attendance_records
      WHERE date >= $1 AND status = 'late'
      GROUP BY employee_id, employee_name
      ORDER BY late_count DESC
      LIMIT 10
    `, [monthStart]);

    // בקשות חופשה ממתינות
    const pendingLeaves = await pool.query(
      `SELECT COUNT(*) as pending_count FROM leave_requests WHERE status = 'pending'`
    );

    res.json({
      success: true,
      date: today,
      today_stats: todayStats.rows[0],
      monthly_overtime: parseFloat(monthlyOvertime.rows[0].monthly_overtime),
      top_late_employees: topLate.rows,
      pending_leave_requests: parseInt(pendingLeaves.rows[0].pending_count)
    });
  } catch (error: any) {
    console.error("שגיאה בדשבורד נוכחות:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// דוח חודשי מלא - כל העובדים
// ============================================================
router.get("/monthly-report/:month", async (req: Request, res: Response) => {
  try {
    const { month } = req.params; // YYYY-MM
    const startDate = `${month}-01`;
    const endDate = `${month}-31`;

    const report = await pool.query(`
      SELECT
        employee_id,
        employee_name,
        COUNT(*) FILTER (WHERE status IN ('present', 'late', 'remote', 'field_work')) as days_worked,
        COUNT(*) FILTER (WHERE status = 'absent') as days_absent,
        COUNT(*) FILTER (WHERE status = 'late') as days_late,
        COUNT(*) FILTER (WHERE status = 'sick_leave') as days_sick,
        COUNT(*) FILTER (WHERE status = 'vacation') as days_vacation,
        COUNT(*) FILTER (WHERE status = 'remote') as days_remote,
        COUNT(*) FILTER (WHERE status = 'military_reserve') as days_military,
        COALESCE(SUM(total_hours), 0) as total_hours,
        COALESCE(SUM(overtime_hours), 0) as total_overtime,
        COALESCE(SUM(late_minutes), 0) as total_late_minutes,
        COALESCE(AVG(total_hours) FILTER (WHERE total_hours > 0), 0) as avg_daily_hours
      FROM attendance_records
      WHERE date BETWEEN $1 AND $2
      GROUP BY employee_id, employee_name
      ORDER BY employee_name ASC
    `, [startDate, endDate]);

    // סיכום כללי
    const totalSummary = await pool.query(`
      SELECT
        COUNT(DISTINCT employee_id) as unique_employees,
        COALESCE(SUM(total_hours), 0) as grand_total_hours,
        COALESCE(SUM(overtime_hours), 0) as grand_total_overtime,
        COUNT(*) FILTER (WHERE status = 'absent') as total_absences,
        COUNT(*) FILTER (WHERE status = 'late') as total_lates
      FROM attendance_records
      WHERE date BETWEEN $1 AND $2
    `, [startDate, endDate]);

    res.json({
      success: true,
      month,
      summary: totalSummary.rows[0],
      employees: report.rows
    });
  } catch (error: any) {
    console.error("שגיאה בדוח חודשי:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// דוח שעות נוספות חודשי - ניתוח לפי עובד ומחלקה
// ============================================================
router.get("/overtime-report/:month", async (req: Request, res: Response) => {
  try {
    const { month } = req.params;
    const startDate = `${month}-01`;
    const endDate = `${month}-31`;

    // שעות נוספות לפי עובד
    const byEmployee = await pool.query(`
      SELECT
        employee_id,
        employee_name,
        shift_type,
        COUNT(*) as days_with_overtime,
        COALESCE(SUM(overtime_hours), 0) as total_overtime_hours,
        COALESCE(MAX(overtime_hours), 0) as max_overtime_day,
        COALESCE(AVG(overtime_hours) FILTER (WHERE overtime_hours > 0), 0) as avg_overtime
      FROM attendance_records
      WHERE date BETWEEN $1 AND $2 AND overtime_hours > 0
      GROUP BY employee_id, employee_name, shift_type
      ORDER BY total_overtime_hours DESC
    `, [startDate, endDate]);

    // שעות נוספות לפי משמרת/מחלקה
    const byShift = await pool.query(`
      SELECT
        ar.shift_type,
        s.shift_name_he,
        s.department,
        COUNT(DISTINCT ar.employee_id) as employees_count,
        COALESCE(SUM(ar.overtime_hours), 0) as total_overtime,
        COALESCE(AVG(ar.overtime_hours) FILTER (WHERE ar.overtime_hours > 0), 0) as avg_overtime
      FROM attendance_records ar
      LEFT JOIN shifts s ON ar.shift_type = s.shift_name
      WHERE ar.date BETWEEN $1 AND $2
      GROUP BY ar.shift_type, s.shift_name_he, s.department
      ORDER BY total_overtime DESC
    `, [startDate, endDate]);

    // עלות מוערכת של שעות נוספות (הנחה: 50 ש"ח לשעה בסיס)
    const costEstimate = await pool.query(`
      SELECT
        COALESCE(SUM(
          CASE
            WHEN overtime_hours <= 2 THEN overtime_hours * 50 * 1.25
            ELSE (2 * 50 * 1.25) + ((overtime_hours - 2) * 50 * 1.5)
          END
        ), 0) as estimated_overtime_cost
      FROM attendance_records
      WHERE date BETWEEN $1 AND $2 AND overtime_hours > 0
    `, [startDate, endDate]);

    res.json({
      success: true,
      month,
      by_employee: byEmployee.rows,
      by_shift: byShift.rows,
      estimated_overtime_cost: Math.round(parseFloat(costEstimate.rows[0].estimated_overtime_cost)),
      note: "עלות מוערכת מבוססת על שכר בסיס 50 ש\"ח לשעה"
    });
  } catch (error: any) {
    console.error("שגיאה בדוח שעות נוספות:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// CRUD משמרות - יצירת משמרת
// ============================================================
router.post("/shifts", async (req: Request, res: Response) => {
  try {
    const {
      shift_name, shift_name_he, start_time, end_time,
      break_duration_min, is_overnight, overtime_after_hours,
      overtime_rate, overtime_rate_150, department
    } = req.body;

    if (!shift_name || !start_time || !end_time) {
      return res.status(400).json({ success: false, error: "נדרש שם משמרת, שעת התחלה ושעת סיום" });
    }

    const result = await pool.query(
      `INSERT INTO shifts (shift_name, shift_name_he, start_time, end_time, break_duration_min, is_overnight, overtime_after_hours, overtime_rate, overtime_rate_150, department)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [shift_name, shift_name_he, start_time, end_time, break_duration_min || 30, is_overnight || false, overtime_after_hours || 8.5, overtime_rate || 1.25, overtime_rate_150 || 1.5, department]
    );

    res.json({ success: true, message: "משמרת נוצרה בהצלחה", shift: result.rows[0] });
  } catch (error: any) {
    console.error("שגיאה ביצירת משמרת:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// שליפת כל המשמרות
router.get("/shifts", async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`SELECT * FROM shifts ORDER BY created_at ASC`);
    res.json({ success: true, shifts: result.rows });
  } catch (error: any) {
    console.error("שגיאה בשליפת משמרות:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// שליפת משמרת בודדת
router.get("/shifts/:id", async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`SELECT * FROM shifts WHERE id = $1`, [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "משמרת לא נמצאה" });
    }
    res.json({ success: true, shift: result.rows[0] });
  } catch (error: any) {
    console.error("שגיאה בשליפת משמרת:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// עדכון משמרת
router.put("/shifts/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const fields = req.body;
    const setClauses: string[] = [];
    const values: any[] = [];
    let idx = 1;

    // בניית עדכון דינמי
    const allowedFields = [
      "shift_name", "shift_name_he", "start_time", "end_time",
      "break_duration_min", "is_overnight", "overtime_after_hours",
      "overtime_rate", "overtime_rate_150", "department", "status"
    ];

    for (const field of allowedFields) {
      if (fields[field] !== undefined) {
        setClauses.push(`${field} = $${idx}`);
        values.push(fields[field]);
        idx++;
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ success: false, error: "לא נשלחו שדות לעדכון" });
    }

    values.push(id);
    const result = await pool.query(
      `UPDATE shifts SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "משמרת לא נמצאה" });
    }

    res.json({ success: true, message: "משמרת עודכנה בהצלחה", shift: result.rows[0] });
  } catch (error: any) {
    console.error("שגיאה בעדכון משמרת:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ביטול משמרת (לא מוחקים - רק משנים סטטוס)
router.delete("/shifts/:id", async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `UPDATE shifts SET status = 'inactive' WHERE id = $1 RETURNING *`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "משמרת לא נמצאה" });
    }

    res.json({ success: true, message: "משמרת בוטלה (לא נמחקה)", shift: result.rows[0] });
  } catch (error: any) {
    console.error("שגיאה בביטול משמרת:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
