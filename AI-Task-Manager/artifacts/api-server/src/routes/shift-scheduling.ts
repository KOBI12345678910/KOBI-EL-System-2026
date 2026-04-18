import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

// ─── Auto-create tables ───────────────────────────────────────────────────────
async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shift_templates (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      break_duration_min INT DEFAULT 30,
      total_hours NUMERIC(4,1),
      color VARCHAR(20) DEFAULT '#3b82f6',
      department VARCHAR(100),
      is_default BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS shift_schedules (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER,
      employee_name VARCHAR(200),
      department VARCHAR(100),
      shift_template_id INTEGER REFERENCES shift_templates(id),
      date DATE NOT NULL,
      start_time TIME,
      end_time TIME,
      status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled','confirmed','started','completed','absent','late','early_leave')),
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS attendance_records (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER,
      employee_name VARCHAR(200),
      date DATE DEFAULT CURRENT_DATE,
      clock_in TIMESTAMPTZ,
      clock_out TIMESTAMPTZ,
      break_start TIMESTAMPTZ,
      break_end TIMESTAMPTZ,
      total_hours NUMERIC(5,2) DEFAULT 0,
      overtime_hours NUMERIC(5,2) DEFAULT 0,
      late_minutes INT DEFAULT 0,
      early_leave_minutes INT DEFAULT 0,
      status VARCHAR(20) DEFAULT 'present' CHECK (status IN ('present','late','absent','holiday','sick','vacation')),
      source VARCHAR(20) DEFAULT 'manual' CHECK (source IN ('manual','app','biometric','gps')),
      location_in VARCHAR(200),
      location_out VARCHAR(200),
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS overtime_requests (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER,
      employee_name VARCHAR(200),
      date DATE,
      hours NUMERIC(4,1),
      reason TEXT,
      approved_by VARCHAR(200),
      status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS leave_balances (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER,
      employee_name VARCHAR(200),
      year INT DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
      vacation_total INT DEFAULT 14,
      vacation_used INT DEFAULT 0,
      vacation_remaining INT DEFAULT 14,
      sick_total INT DEFAULT 18,
      sick_used INT DEFAULT 0,
      sick_remaining INT DEFAULT 18,
      personal_total INT DEFAULT 3,
      personal_used INT DEFAULT 0,
      personal_remaining INT DEFAULT 3,
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);
}

// ─── Pre-seed shift templates ─────────────────────────────────────────────────
async function seedData() {
  const { rows } = await pool.query(`SELECT COUNT(*) as c FROM shift_templates`);
  if (Number(rows[0].c) > 0) return;

  const templates = [
    { name: 'בוקר', start: '06:00', end: '14:00', brk: 30, hours: 7.5, color: '#f59e0b', dept: null, def: true },
    { name: 'צהריים', start: '14:00', end: '22:00', brk: 30, hours: 7.5, color: '#3b82f6', dept: null, def: false },
    { name: 'לילה', start: '22:00', end: '06:00', brk: 30, hours: 7.5, color: '#8b5cf6', dept: null, def: false },
    { name: 'יום מלא', start: '07:00', end: '17:00', brk: 60, hours: 9, color: '#10b981', dept: null, def: false },
    { name: 'משמרת קצרה', start: '08:00', end: '13:00', brk: 0, hours: 5, color: '#ec4899', dept: null, def: false },
  ];
  for (const t of templates) {
    await pool.query(`
      INSERT INTO shift_templates (name, start_time, end_time, break_duration_min, total_hours, color, department, is_default)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    `, [t.name, t.start, t.end, t.brk, t.hours, t.color, t.dept, t.def]);
  }
}

ensureTables().then(() => seedData()).catch(e => console.error("shift-scheduling init:", e));

// ═══════════════════════════════════════════════════════════════════════════════
//  SHIFT TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/api/shifts/templates", async (_req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM shift_templates ORDER BY start_time`);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/api/shifts/templates", async (req, res) => {
  try {
    const b = req.body;
    const { rows } = await pool.query(`
      INSERT INTO shift_templates (name, start_time, end_time, break_duration_min, total_hours, color, department, is_default)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
    `, [b.name, b.start_time, b.end_time, b.break_duration_min, b.total_hours, b.color, b.department, b.is_default || false]);
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/api/shifts/templates/:id", async (req, res) => {
  try {
    const b = req.body;
    const { rows } = await pool.query(`
      UPDATE shift_templates SET name=$1, start_time=$2, end_time=$3, break_duration_min=$4, total_hours=$5, color=$6, department=$7, is_default=$8
      WHERE id=$9 RETURNING *
    `, [b.name, b.start_time, b.end_time, b.break_duration_min, b.total_hours, b.color, b.department, b.is_default, req.params.id]);
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/api/shifts/templates/:id", async (req, res) => {
  try {
    await pool.query(`DELETE FROM shift_templates WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  SHIFT SCHEDULES
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/api/shifts/schedules", async (_req, res) => {
  try {
    const { date_from, date_to, department, employee_id } = _req.query;
    let q = `SELECT s.*, t.name as template_name, t.color FROM shift_schedules s LEFT JOIN shift_templates t ON t.id = s.shift_template_id WHERE 1=1`;
    const params: any[] = [];
    let i = 1;
    if (date_from) { q += ` AND s.date >= $${i}`; params.push(date_from); i++; }
    if (date_to) { q += ` AND s.date <= $${i}`; params.push(date_to); i++; }
    if (department) { q += ` AND s.department = $${i}`; params.push(department); i++; }
    if (employee_id) { q += ` AND s.employee_id = $${i}`; params.push(employee_id); i++; }
    q += ` ORDER BY s.date, s.start_time`;
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/api/shifts/schedules", async (req, res) => {
  try {
    const b = req.body;
    // Supports bulk insert if array is passed
    const items = Array.isArray(b) ? b : [b];
    const results: any[] = [];
    for (const it of items) {
      const { rows } = await pool.query(`
        INSERT INTO shift_schedules (employee_id, employee_name, department, shift_template_id, date, start_time, end_time, status, notes)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *
      `, [it.employee_id, it.employee_name, it.department, it.shift_template_id, it.date, it.start_time, it.end_time, it.status || 'scheduled', it.notes]);
      results.push(rows[0]);
    }
    res.json(results.length === 1 ? results[0] : results);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/api/shifts/schedules/:id", async (req, res) => {
  try {
    const b = req.body;
    const { rows } = await pool.query(`
      UPDATE shift_schedules SET employee_id=$1, employee_name=$2, department=$3, shift_template_id=$4, date=$5, start_time=$6, end_time=$7, status=$8, notes=$9
      WHERE id=$10 RETURNING *
    `, [b.employee_id, b.employee_name, b.department, b.shift_template_id, b.date, b.start_time, b.end_time, b.status, b.notes, req.params.id]);
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/api/shifts/schedules/:id", async (req, res) => {
  try {
    await pool.query(`DELETE FROM shift_schedules WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/api/shifts/weekly-schedule/:department", async (req, res) => {
  try {
    const { week_start } = req.query as any;
    const start = week_start || new Date().toISOString().split('T')[0];
    const { rows } = await pool.query(`
      SELECT s.*, t.name as template_name, t.color FROM shift_schedules s
      LEFT JOIN shift_templates t ON t.id = s.shift_template_id
      WHERE s.department = $1 AND s.date >= $2::date AND s.date < $2::date + INTERVAL '7 days'
      ORDER BY s.employee_name, s.date
    `, [req.params.department, start]);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  CLOCK IN / OUT
// ═══════════════════════════════════════════════════════════════════════════════

router.post("/api/shifts/clock-in", async (req, res) => {
  try {
    const b = req.body;
    // Check if already clocked in today
    const existing = await pool.query(`SELECT id FROM attendance_records WHERE employee_id=$1 AND date=CURRENT_DATE AND clock_out IS NULL`, [b.employee_id]);
    if (existing.rows[0]) return res.status(400).json({ error: "כבר נרשמה כניסה היום" });

    // Check for late arrival
    const schedule = await pool.query(`
      SELECT s.start_time FROM shift_schedules s WHERE s.employee_id=$1 AND s.date=CURRENT_DATE LIMIT 1
    `, [b.employee_id]);
    let lateMin = 0;
    let status = 'present';
    if (schedule.rows[0]) {
      const schStart = schedule.rows[0].start_time;
      const now = new Date();
      const [h, m] = schStart.split(':').map(Number);
      const schDate = new Date(); schDate.setHours(h, m, 0, 0);
      const diff = Math.floor((now.getTime() - schDate.getTime()) / 60000);
      if (diff > 5) { lateMin = diff; status = 'late'; }
    }

    const { rows } = await pool.query(`
      INSERT INTO attendance_records (employee_id, employee_name, date, clock_in, late_minutes, status, source, location_in)
      VALUES ($1,$2,CURRENT_DATE,NOW(),$3,$4,$5,$6) RETURNING *
    `, [b.employee_id, b.employee_name, lateMin, status, b.source || 'app', b.location]);
    // Update schedule status
    await pool.query(`UPDATE shift_schedules SET status=$1 WHERE employee_id=$2 AND date=CURRENT_DATE`, [status === 'late' ? 'late' : 'started', b.employee_id]);
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/api/shifts/clock-out", async (req, res) => {
  try {
    const b = req.body;
    const { rows } = await pool.query(`
      UPDATE attendance_records SET clock_out=NOW(), location_out=$1,
        total_hours = ROUND(EXTRACT(EPOCH FROM (NOW() - clock_in))/3600, 2),
        overtime_hours = GREATEST(0, ROUND(EXTRACT(EPOCH FROM (NOW() - clock_in))/3600 - 8.5, 2))
      WHERE employee_id=$2 AND date=CURRENT_DATE AND clock_out IS NULL
      RETURNING *
    `, [b.location, b.employee_id]);
    if (rows[0]) {
      await pool.query(`UPDATE shift_schedules SET status='completed' WHERE employee_id=$1 AND date=CURRENT_DATE`, [b.employee_id]);
    }
    res.json(rows[0] || { error: "לא נמצאה כניסה פתוחה" });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  ATTENDANCE
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/api/shifts/attendance/:employeeId/:month", async (req, res) => {
  try {
    const { employeeId, month } = req.params; // month = YYYY-MM
    const { rows } = await pool.query(`
      SELECT * FROM attendance_records
      WHERE employee_id = $1 AND TO_CHAR(date, 'YYYY-MM') = $2
      ORDER BY date
    `, [employeeId, month]);
    const summary = await pool.query(`
      SELECT
        COUNT(*) as total_days,
        SUM(total_hours) as total_hours,
        SUM(overtime_hours) as overtime_hours,
        SUM(late_minutes) as total_late_minutes,
        COUNT(*) FILTER (WHERE status='late') as late_days,
        COUNT(*) FILTER (WHERE status='absent') as absent_days,
        COUNT(*) FILTER (WHERE status='sick') as sick_days,
        COUNT(*) FILTER (WHERE status='vacation') as vacation_days
      FROM attendance_records WHERE employee_id = $1 AND TO_CHAR(date, 'YYYY-MM') = $2
    `, [employeeId, month]);
    res.json({ records: rows, summary: summary.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/api/shifts/daily-report", async (_req, res) => {
  try {
    const date = (_req.query.date as string) || new Date().toISOString().split('T')[0];
    const { rows } = await pool.query(`
      SELECT a.*, s.start_time as scheduled_start, s.end_time as scheduled_end, t.name as shift_name
      FROM attendance_records a
      LEFT JOIN shift_schedules s ON s.employee_id = a.employee_id AND s.date = a.date
      LEFT JOIN shift_templates t ON t.id = s.shift_template_id
      WHERE a.date = $1 ORDER BY a.clock_in
    `, [date]);
    const absent = await pool.query(`
      SELECT s.employee_id, s.employee_name, s.department, t.name as shift_name
      FROM shift_schedules s LEFT JOIN shift_templates t ON t.id=s.shift_template_id
      WHERE s.date=$1 AND s.employee_id NOT IN (SELECT employee_id FROM attendance_records WHERE date=$1)
    `, [date]);
    res.json({ attendance: rows, absent: absent.rows, date });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/api/shifts/late-report", async (_req, res) => {
  try {
    const month = (_req.query.month as string) || new Date().toISOString().slice(0, 7);
    const { rows } = await pool.query(`
      SELECT employee_id, employee_name,
        COUNT(*) as late_count,
        SUM(late_minutes) as total_late_minutes,
        ROUND(AVG(late_minutes),1) as avg_late_minutes
      FROM attendance_records
      WHERE status = 'late' AND TO_CHAR(date, 'YYYY-MM') = $1
      GROUP BY employee_id, employee_name ORDER BY total_late_minutes DESC
    `, [month]);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  OVERTIME
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/api/shifts/overtime", async (_req, res) => {
  try {
    const { status, employee_id } = _req.query;
    let q = `SELECT * FROM overtime_requests WHERE 1=1`;
    const params: any[] = [];
    let i = 1;
    if (status) { q += ` AND status=$${i}`; params.push(status); i++; }
    if (employee_id) { q += ` AND employee_id=$${i}`; params.push(employee_id); i++; }
    q += ` ORDER BY created_at DESC`;
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/api/shifts/overtime", async (req, res) => {
  try {
    const b = req.body;
    const { rows } = await pool.query(`
      INSERT INTO overtime_requests (employee_id, employee_name, date, hours, reason, status)
      VALUES ($1,$2,$3,$4,$5,'pending') RETURNING *
    `, [b.employee_id, b.employee_name, b.date, b.hours, b.reason]);
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/api/shifts/overtime/:id", async (req, res) => {
  try {
    const b = req.body;
    const { rows } = await pool.query(`
      UPDATE overtime_requests SET status=$1, approved_by=$2 WHERE id=$3 RETURNING *
    `, [b.status, b.approved_by, req.params.id]);
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  LEAVE BALANCE
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/api/shifts/leave-balance/:employeeId", async (req, res) => {
  try {
    const year = (req.query.year as string) || new Date().getFullYear().toString();
    const { rows } = await pool.query(`SELECT * FROM leave_balances WHERE employee_id=$1 AND year=$2`, [req.params.employeeId, year]);
    res.json(rows[0] || { vacation_remaining: 0, sick_remaining: 0, personal_remaining: 0 });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/api/shifts/request-leave", async (req, res) => {
  try {
    const b = req.body; // employee_id, employee_name, leave_type (vacation/sick/personal), date, days
    const year = new Date(b.date).getFullYear();
    // Ensure balance row exists
    await pool.query(`
      INSERT INTO leave_balances (employee_id, employee_name, year) VALUES ($1,$2,$3)
      ON CONFLICT DO NOTHING
    `, [b.employee_id, b.employee_name, year]);
    const col = b.leave_type === 'sick' ? 'sick' : b.leave_type === 'personal' ? 'personal' : 'vacation';
    const { rows } = await pool.query(`
      UPDATE leave_balances SET ${col}_used = ${col}_used + $1, ${col}_remaining = ${col}_total - (${col}_used + $1), updated_at=NOW()
      WHERE employee_id=$2 AND year=$3 RETURNING *
    `, [b.days || 1, b.employee_id, year]);
    // Record attendance as leave type
    for (let d = 0; d < (b.days || 1); d++) {
      const dt = new Date(b.date);
      dt.setDate(dt.getDate() + d);
      const status = b.leave_type === 'sick' ? 'sick' : 'vacation';
      await pool.query(`
        INSERT INTO attendance_records (employee_id, employee_name, date, status, source)
        VALUES ($1,$2,$3,$4,'manual') ON CONFLICT DO NOTHING
      `, [b.employee_id, b.employee_name, dt.toISOString().split('T')[0], status]);
    }
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/api/shifts/dashboard", async (_req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const todayScheduled = await pool.query(`SELECT COUNT(*) as c FROM shift_schedules WHERE date=$1`, [today]);
    const todayPresent = await pool.query(`SELECT COUNT(*) as c FROM attendance_records WHERE date=$1 AND clock_in IS NOT NULL`, [today]);
    const todayLate = await pool.query(`SELECT COUNT(*) as c FROM attendance_records WHERE date=$1 AND status='late'`, [today]);
    const todayAbsent = await pool.query(`
      SELECT COUNT(*) as c FROM shift_schedules
      WHERE date=$1 AND employee_id NOT IN (SELECT employee_id FROM attendance_records WHERE date=$1)
    `, [today]);
    const stillIn = await pool.query(`SELECT COUNT(*) as c FROM attendance_records WHERE date=$1 AND clock_in IS NOT NULL AND clock_out IS NULL`, [today]);
    const pendingOT = await pool.query(`SELECT COUNT(*) as c FROM overtime_requests WHERE status='pending'`);
    const monthHours = await pool.query(`
      SELECT SUM(total_hours) as hours, SUM(overtime_hours) as overtime
      FROM attendance_records WHERE TO_CHAR(date,'YYYY-MM') = TO_CHAR(CURRENT_DATE,'YYYY-MM')
    `);
    const byDept = await pool.query(`
      SELECT department, COUNT(*) as scheduled, COUNT(*) FILTER (WHERE status IN ('started','completed','late')) as present
      FROM shift_schedules WHERE date=$1 GROUP BY department
    `, [today]);

    res.json({
      today_scheduled: Number(todayScheduled.rows[0].c),
      today_present: Number(todayPresent.rows[0].c),
      today_late: Number(todayLate.rows[0].c),
      today_absent: Number(todayAbsent.rows[0].c),
      still_clocked_in: Number(stillIn.rows[0].c),
      pending_overtime: Number(pendingOT.rows[0].c),
      month_total_hours: Number(monthHours.rows[0]?.hours || 0),
      month_overtime_hours: Number(monthHours.rows[0]?.overtime || 0),
      departments: byDept.rows,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
