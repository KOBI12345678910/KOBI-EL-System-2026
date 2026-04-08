import { Router, Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { validateSession } from "../lib/auth";
import { Pool } from "pg";

const router = Router();

// Initialize pool for parameterized queries
let pool: Pool;
async function getPool(): Promise<Pool> {
  if (!pool) {
    const { pool: p } = await import("@workspace/db") as any;
    pool = p;
  }
  return pool;
}

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.substring(7) : (req.query.token as string) || null;
  if (!token) { res.status(401).json({ error: "נדרשת התחברות" }); return; }
  const result = await validateSession(token);
  if (result.error || !result.user) { res.status(401).json({ error: "הסשן פג תוקף" }); return; }
  (req as any).user = result.user;
  next();
}

router.use(requireAuth as any);

// Safe raw query for DDL/migrations only (no user input)
async function rawDdl(query: string) {
  try { const r = await db.execute(sql.raw(query)); return r.rows || []; }
  catch (e: any) { console.error("HR-Attendance DDL error:", e.message.slice(0, 120)); return []; }
}

// Parameterized query for all user-data operations
async function pq(text: string, params: any[] = []): Promise<any[]> {
  try {
    const p = await getPool();
    const r = await p.query(text, params);
    return r.rows || [];
  } catch (e: any) { console.error("HR-Attendance pq error:", e.message.slice(0, 120)); return []; }
}

// =================== INIT TABLES ===================
async function ensureAdvancedTables() {
  const ddlStatements = [
    `CREATE TABLE IF NOT EXISTS work_sites (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      address TEXT,
      lat NUMERIC(10,7),
      lng NUMERIC(10,7),
      radius_meters INTEGER DEFAULT 200,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS attendance_clock_events (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER,
      employee_name VARCHAR(255),
      clock_type VARCHAR(20) DEFAULT 'manual',
      event_type VARCHAR(10) DEFAULT 'in',
      event_time TIMESTAMP DEFAULT NOW(),
      gps_lat NUMERIC(10,7),
      gps_lng NUMERIC(10,7),
      gps_accuracy NUMERIC(8,2),
      work_site_id INTEGER REFERENCES work_sites(id),
      within_geofence BOOLEAN,
      distance_meters NUMERIC(8,1),
      badge_number VARCHAR(100),
      device_info TEXT,
      biometric_verified BOOLEAN DEFAULT false,
      notes TEXT,
      attendance_record_id INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS leave_types (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      code VARCHAR(50) UNIQUE NOT NULL,
      is_statutory BOOLEAN DEFAULT false,
      accrual_rule JSONB DEFAULT '{}',
      paid_percentage_rules JSONB DEFAULT '[]',
      max_days_per_year NUMERIC(6,2),
      carry_over_days NUMERIC(6,2) DEFAULT 0,
      color VARCHAR(20) DEFAULT '#6366f1',
      requires_approval BOOLEAN DEFAULT true,
      is_active BOOLEAN DEFAULT true,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS leave_balances (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER,
      employee_name VARCHAR(255) NOT NULL,
      leave_type_id INTEGER REFERENCES leave_types(id),
      leave_type_code VARCHAR(50),
      year INTEGER NOT NULL,
      accrued NUMERIC(8,2) DEFAULT 0,
      used NUMERIC(8,2) DEFAULT 0,
      pending NUMERIC(8,2) DEFAULT 0,
      carried_over NUMERIC(8,2) DEFAULT 0,
      adjusted NUMERIC(8,2) DEFAULT 0,
      last_accrual_date DATE,
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(employee_name, leave_type_code, year)
    )`,
    `CREATE TABLE IF NOT EXISTS leave_approval_rules (
      id SERIAL PRIMARY KEY,
      leave_type_id INTEGER REFERENCES leave_types(id),
      leave_type_code VARCHAR(50),
      min_days_threshold NUMERIC(6,2) DEFAULT 0,
      approver_role VARCHAR(100),
      approval_level INTEGER DEFAULT 1,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS leave_approval_flow (
      id SERIAL PRIMARY KEY,
      leave_request_id INTEGER NOT NULL,
      approval_level INTEGER DEFAULT 1,
      approver_role VARCHAR(100),
      approver_name VARCHAR(255),
      status VARCHAR(20) DEFAULT 'pending',
      decision_at TIMESTAMP,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS shift_templates (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      shift_type VARCHAR(50) DEFAULT 'morning',
      start_time VARCHAR(10),
      end_time VARCHAR(10),
      break_minutes INTEGER DEFAULT 30,
      days_of_week INTEGER[] DEFAULT '{0,1,2,3,4}',
      is_friday BOOLEAN DEFAULT false,
      is_saturday BOOLEAN DEFAULT false,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS shift_swap_requests (
      id SERIAL PRIMARY KEY,
      requester_name VARCHAR(255) NOT NULL,
      requester_shift_id INTEGER,
      target_name VARCHAR(255),
      target_shift_id INTEGER,
      swap_date DATE,
      reason TEXT,
      status VARCHAR(20) DEFAULT 'pending',
      approved_by VARCHAR(255),
      approved_at TIMESTAMP,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`,
    `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS clock_method VARCHAR(20) DEFAULT 'manual'`,
    `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS gps_lat NUMERIC(10,7)`,
    `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS gps_lng NUMERIC(10,7)`,
    `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS within_geofence BOOLEAN`,
    `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS regular_hours NUMERIC(6,2) DEFAULT 0`,
    `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS overtime_125_hours NUMERIC(6,2) DEFAULT 0`,
    `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS overtime_150_hours NUMERIC(6,2) DEFAULT 0`,
    `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS is_friday BOOLEAN DEFAULT false`,
    `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS is_saturday BOOLEAN DEFAULT false`,
  ];

  for (const stmt of ddlStatements) {
    await rawDdl(stmt);
  }

  await seedDefaultLeaveTypes();
  await seedDefaultWorkSites();
}

async function seedDefaultLeaveTypes() {
  const existing = await pq(`SELECT COUNT(*)::int as cnt FROM leave_types`);
  if (Number((existing[0] as any)?.cnt || 0) > 0) return;

  const types = [
    { name: "חופשה שנתית", code: "vacation", statutory: true, max_days: 28, carry_over: 5, color: "#3b82f6",
      accrual: { type: "seniority", rates: [{ years_min: 0, years_max: 4, days: 12 }, { years_min: 4, years_max: 6, days: 16 }, { years_min: 6, years_max: 7, days: 18 }, { years_min: 7, years_max: 99, days: 28 }] },
      paid_rules: [{ day_from: 1, percentage: 100 }] },
    { name: "מחלה", code: "sick", statutory: true, max_days: 90, carry_over: 90, color: "#ef4444",
      accrual: { type: "monthly", days_per_month: 1.5 },
      paid_rules: [{ day_from: 1, day_to: 1, percentage: 0 }, { day_from: 2, day_to: 2, percentage: 0 }, { day_from: 3, day_to: 3, percentage: 50 }, { day_from: 4, percentage: 100 }] },
    // Seeded as "military" to match existing UI + leave_requests.leave_type field
    { name: "מילואים", code: "military", statutory: true, max_days: 365, carry_over: 0, color: "#f59e0b",
      accrual: { type: "none" },
      paid_rules: [{ day_from: 1, percentage: 100, government_reimbursement: true }] },
    { name: "לידה ואימהות", code: "maternity", statutory: true, max_days: 182, carry_over: 0, color: "#ec4899",
      accrual: { type: "none" },
      paid_rules: [{ day_from: 1, day_to: 98, percentage: 100 }, { day_from: 99, percentage: 0 }] },
    { name: "אבהות", code: "paternity", statutory: true, max_days: 7, carry_over: 0, color: "#06b6d4",
      accrual: { type: "none" },
      paid_rules: [{ day_from: 1, percentage: 100 }] },
    { name: "אבל", code: "bereavement", statutory: true, max_days: 7, carry_over: 0, color: "#6b7280",
      accrual: { type: "none" },
      paid_rules: [{ day_from: 1, percentage: 100 }] },
    { name: "אישי", code: "personal", statutory: false, max_days: 5, carry_over: 0, color: "#8b5cf6",
      accrual: { type: "annual", days: 3 },
      paid_rules: [{ day_from: 1, percentage: 100 }] },
    { name: "לימודים", code: "study", statutory: false, max_days: 14, carry_over: 0, color: "#0ea5e9",
      accrual: { type: "none" },
      paid_rules: [{ day_from: 1, percentage: 0 }] },
    { name: "ללא תשלום", code: "unpaid", statutory: false, max_days: 365, carry_over: 0, color: "#94a3b8",
      accrual: { type: "none" },
      paid_rules: [{ day_from: 1, percentage: 0 }] },
  ];

  for (let i = 0; i < types.length; i++) {
    const t = types[i];
    await pq(
      `INSERT INTO leave_types (name, code, is_statutory, accrual_rule, paid_percentage_rules, max_days_per_year, carry_over_days, color, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (code) DO NOTHING`,
      [t.name, t.code, t.statutory, JSON.stringify(t.accrual), JSON.stringify(t.paid_rules), t.max_days, t.carry_over, t.color, i]
    );
  }
}

async function seedDefaultWorkSites() {
  const existing = await pq(`SELECT COUNT(*)::int as cnt FROM work_sites`);
  if (Number((existing[0] as any)?.cnt || 0) > 0) return;
  await pq(`INSERT INTO work_sites (name, address, lat, lng, radius_meters) VALUES ($1, $2, $3, $4, $5)`,
    ["משרד ראשי", "תל אביב", 32.0853, 34.7818, 200]);
}

ensureAdvancedTables().catch(console.error);

// =================== AUTHORIZATION HELPER ===================
const PRIVILEGED_ROLES = ["manager", "hr", "admin", "hr_manager", "department_head", "director", "super_admin", "superadmin"];
function isPrivilegedUser(user: any): boolean {
  if (!user) return false;
  if (user.is_super_admin === true || user.isSuperAdmin === true) return true;
  const role = (user.role || "").toLowerCase();
  return PRIVILEGED_ROLES.some(r => role.includes(r));
}

// =================== OVERTIME CALCULATION (ISRAELI LAW) ===================
/**
 * Israeli overtime law (Hours of Work and Rest Law, 5711-1951):
 * - Standard day: 8.6 hours (43h/5-day week divided daily, or 42h/6-day week)
 * - First 2 OT hours: 125% of hourly rate
 * - Further OT hours: 150% of hourly rate
 * - Friday: regular hours paid normally, OT hours at 150% (Shabbat eve premium)
 * - Saturday (Shabbat): ALL hours at 150% minimum
 * Weekly threshold: 42 hours/week — excess is overtime regardless of daily hours
 */
function calcIsraeliOvertime(totalHours: number, isFriday: boolean, isSaturday: boolean): {
  regular: number; ot125: number; ot150: number; totalCost: number;
} {
  const dailyRegular = 8.6; // Standard daily hours per Israeli law

  if (totalHours <= 0) return { regular: 0, ot125: 0, ot150: 0, totalCost: 0 };

  let regular = 0, ot125 = 0, ot150 = 0;

  if (isSaturday) {
    // All Shabbat work is at 150% minimum
    regular = 0;
    ot125 = 0;
    ot150 = totalHours;
  } else if (isFriday) {
    // Friday (Erev Shabbat): regular hours paid at standard rate,
    // overtime hours (beyond 8.6h) paid at 150%
    regular = Math.min(totalHours, dailyRegular);
    const overtime = Math.max(0, totalHours - dailyRegular);
    ot125 = 0; // Friday OT skips 125% tier, goes directly to 150%
    ot150 = overtime;
  } else {
    // Weekday: first 2 OT hours at 125%, rest at 150%
    regular = Math.min(totalHours, dailyRegular);
    const overtime = Math.max(0, totalHours - dailyRegular);
    ot125 = Math.min(overtime, 2);
    ot150 = Math.max(0, overtime - 2);
  }

  const totalCost = regular + ot125 * 1.25 + ot150 * 1.5;
  return { regular, ot125, ot150, totalCost };
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// =================== WORK SITES ===================

router.get("/work-sites", async (_req, res) => {
  const rows = await pq(`SELECT * FROM work_sites ORDER BY name ASC`);
  res.json(rows);
});

router.post("/work-sites", async (req, res) => {
  const b = req.body;
  if (!b.name) { res.status(400).json({ error: "שם אתר נדרש" }); return; }
  await pq(
    `INSERT INTO work_sites (name, address, lat, lng, radius_meters) VALUES ($1, $2, $3, $4, $5)`,
    [b.name, b.address || null, b.lat || null, b.lng || null, b.radius_meters || 200]
  );
  res.json({ success: true });
});

router.put("/work-sites/:id", async (req, res) => {
  const b = req.body; const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const sets: string[] = [];
  const params: any[] = [];
  let i = 1;
  if (b.name !== undefined) { sets.push(`name=$${i++}`); params.push(b.name); }
  if (b.address !== undefined) { sets.push(`address=$${i++}`); params.push(b.address); }
  if (b.lat !== undefined) { sets.push(`lat=$${i++}`); params.push(b.lat || null); }
  if (b.lng !== undefined) { sets.push(`lng=$${i++}`); params.push(b.lng || null); }
  if (b.radius_meters !== undefined) { sets.push(`radius_meters=$${i++}`); params.push(b.radius_meters || 200); }
  if (b.is_active !== undefined) { sets.push(`is_active=$${i++}`); params.push(b.is_active); }
  if (!sets.length) { res.json({ success: true }); return; }
  sets.push(`updated_at=NOW()`);
  params.push(id);
  await pq(`UPDATE work_sites SET ${sets.join(",")} WHERE id=$${i}`, params);
  res.json({ success: true });
});

router.delete("/work-sites/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await pq(`DELETE FROM work_sites WHERE id=$1`, [id]);
  res.json({ success: true });
});

// =================== GPS CLOCK IN/OUT ===================

/**
 * @openapi
 * /api/attendance/clock-in-gps:
 *   post:
 *     tags: [HR & Attendance]
 *     summary: כניסה לעבודה עם GPS — GPS Clock-in
 *     description: |
 *       רישום כניסה לעבודה עם אימות מיקום GPS.
 *       מאמת שהעובד נמצא באתר העבודה בהתאם לרדיוס המוגדר.
 *       ממשק מובייל בלבד — נדרשים קואורדינטות GPS.
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [latitude, longitude]
 *             properties:
 *               latitude: { type: number, format: double, example: 32.0853 }
 *               longitude: { type: number, format: double, example: 34.7818 }
 *               employeeName: { type: string, description: "ברירת מחדל: שם המשתמש המחובר" }
 *               notes: { type: string }
 *     responses:
 *       200:
 *         description: כניסה נרשמה בהצלחה
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 checkInTime: { type: string, format: time }
 *                 siteName: { type: string }
 *       400: { description: "מחוץ לאתר העבודה / כבר רשום כניסה" }
 *       401: { description: "נדרשת התחברות" }
 */
router.post("/attendance/clock-in-gps", async (req, res) => {
  try {
    const user = (req as any).user;
    const b = req.body;
    const employeeName: string = (b.employeeName || user?.full_name || user?.username || user?.email || "").trim();
    if (!employeeName) { res.status(400).json({ error: "נדרש שם עובד" }); return; }

    const existing = await pq(
      `SELECT id FROM attendance_records WHERE employee_name ILIKE $1 AND attendance_date = CURRENT_DATE AND check_in IS NOT NULL AND check_out IS NULL LIMIT 1`,
      [employeeName]
    );
    if (existing.length > 0) { res.status(400).json({ error: "העובד כבר מחויב כניסה היום" }); return; }

    const lat: number | null = b.lat != null ? parseFloat(b.lat) : null;
    const lng: number | null = b.lng != null ? parseFloat(b.lng) : null;
    const accuracy: number | null = b.accuracy != null ? parseFloat(b.accuracy) : null;
    const method = ["manual", "gps", "nfc", "biometric"].includes(b.method) ? b.method : "manual";
    const badgeNumber: string | null = b.badge_number || null;

    let withinGeofence: boolean | null = null;
    let distanceMeters: number | null = null;
    let workSiteId: number | null = null;

    const sites = await pq(`SELECT * FROM work_sites WHERE is_active=true`);

    if (lat != null && lng != null) {
      for (const site of sites as any[]) {
        if (site.lat != null && site.lng != null) {
          const dist = haversineDistance(lat, lng, parseFloat(site.lat), parseFloat(site.lng));
          if (distanceMeters === null || dist < distanceMeters) {
            distanceMeters = dist;
            workSiteId = site.id;
            withinGeofence = dist <= site.radius_meters;
          }
        }
      }
    }

    // Enforce geofence for GPS clock-in method: reject if outside radius.
    // Override is only allowed for users with manager/HR/admin role (privileged users).
    // Employees cannot self-override geofence restrictions.
    const overrideGeofence = b.override_geofence === true && isPrivilegedUser(user);
    if (method === "gps" && withinGeofence === false && !overrideGeofence) {
      const siteRadius = (sites as any[]).find((s: any) => s.id === workSiteId)?.radius_meters || 200;
      const distStr = distanceMeters != null ? Math.round(distanceMeters) : "?";
      res.status(403).json({
        error: "לא ניתן לשייך כניסה מחוץ לאתר העבודה",
        withinGeofence: false,
        distanceMeters: distanceMeters != null ? Math.round(distanceMeters) : null,
        requiresOverride: true,
        requiresPrivilegedOverride: true,
        message: `המיקום הנוכחי רחוק ב-${distStr} מטר מאתר העבודה (מותר: ${siteRadius} מטר). אישור דורש הרשאת מנהל.`,
      });
      return;
    }

    const now = new Date();
    const checkIn = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
    const dow = now.getDay();
    const isFriday = dow === 5;
    const isSaturday = dow === 6;
    const shiftType = ["morning","afternoon","evening","night","full_day"].includes(b.shiftType) ? b.shiftType : "morning";
    const recNum = `ATT-GPS-${Date.now()}`;

    await pq(
      `INSERT INTO attendance_records (record_number, employee_name, attendance_date, check_in, status, shift_type, approval_status, clock_method, gps_lat, gps_lng, within_geofence, is_friday, is_saturday)
       VALUES ($1, $2, CURRENT_DATE, $3, 'present', $4, 'pending', $5, $6, $7, $8, $9, $10)`,
      [recNum, employeeName, checkIn, shiftType, method, lat, lng, withinGeofence, isFriday, isSaturday]
    );

    const newRec = await pq(
      `SELECT * FROM attendance_records WHERE employee_name ILIKE $1 AND attendance_date=CURRENT_DATE ORDER BY id DESC LIMIT 1`,
      [employeeName]
    );
    const recId: number | null = (newRec[0] as any)?.id || null;

    await pq(
      `INSERT INTO attendance_clock_events (employee_name, clock_type, event_type, event_time, gps_lat, gps_lng, gps_accuracy, work_site_id, within_geofence, distance_meters, badge_number, device_info, biometric_verified, attendance_record_id)
       VALUES ($1, $2, 'in', NOW(), $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [employeeName, method, lat, lng, accuracy, workSiteId, withinGeofence, distanceMeters != null ? Math.round(distanceMeters * 10) / 10 : null, badgeNumber, b.device_info || null, b.biometric_verified || false, recId]
    );

    res.json({
      success: true,
      record: newRec[0],
      checkInTime: checkIn,
      withinGeofence,
      distanceMeters: distanceMeters != null ? Math.round(distanceMeters) : null,
      overrideUsed: overrideGeofence && withinGeofence === false,
    });
  } catch (e: any) { res.status(500).json({ error: e.message || "שגיאה פנימית" }); }
});

router.post("/attendance/clock-out-overtime", async (req, res) => {
  try {
    const user = (req as any).user;
    const b = req.body;
    const employeeName: string = (b.employeeName || user?.full_name || user?.username || user?.email || "").trim();
    if (!employeeName) { res.status(400).json({ error: "נדרש שם עובד" }); return; }

    const openRec = await pq(
      `SELECT id, check_in, is_friday, is_saturday FROM attendance_records WHERE employee_name ILIKE $1 AND attendance_date = CURRENT_DATE AND check_in IS NOT NULL AND check_out IS NULL ORDER BY id DESC LIMIT 1`,
      [employeeName]
    );
    const record = openRec[0] as any;
    if (!record) { res.status(400).json({ error: "לא נמצאה כניסה פתוחה היום" }); return; }

    const now = new Date();
    const checkOut = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;

    const [ci_h, ci_m] = (record.check_in as string || "00:00").split(":").map(Number);
    const [co_h, co_m] = checkOut.split(":").map(Number);
    const totalMinutes = Math.max(0, co_h * 60 + co_m - ci_h * 60 - ci_m);
    const breakMinutes = Number(b.breakMinutes) || 30;
    const workedHours = Math.max(0, (totalMinutes - breakMinutes) / 60);

    const isFriday = record.is_friday === true;
    const isSaturday = record.is_saturday === true;

    // Compute daily overtime tiers (Israeli law: 8.6h/day threshold)
    const dailyOvertime = calcIsraeliOvertime(workedHours, isFriday, isSaturday);

    // Compute weekly hours for this employee to check 42h/week threshold
    // Get the start of the current week (Sunday)
    const nowDate = new Date();
    const dow = nowDate.getDay();
    const weekStart = new Date(nowDate);
    weekStart.setDate(nowDate.getDate() - dow);
    const weekStartStr = weekStart.toISOString().slice(0, 10);

    const weekRows = await pq(
      `SELECT COALESCE(SUM(total_hours), 0)::numeric as week_total FROM attendance_records WHERE employee_name ILIKE $1 AND attendance_date >= $2 AND attendance_date < CURRENT_DATE AND check_out IS NOT NULL`,
      [employeeName, weekStartStr]
    );
    const weekTotalSoFar = parseFloat((weekRows[0] as any)?.week_total || 0);
    const WEEKLY_REGULAR = 42;

    // Recalculate regular/overtime considering the weekly 42h threshold (Israeli law):
    // If adding today's hours exceeds 42h/week, reclassify regular hours as OT.
    // Saturday hours are already all OT — no further reclassification needed.
    const weeklyOverhang = Math.max(0, (weekTotalSoFar + workedHours) - WEEKLY_REGULAR);

    let finalRegular = dailyOvertime.regular;
    let finalOt125 = dailyOvertime.ot125;
    let finalOt150 = dailyOvertime.ot150;

    if (weeklyOverhang > 0 && !isSaturday) {
      // Reclassify up to weeklyOverhang from regular into OT tiers.
      // Cap to what's actually in regular (can't reclassify more than exists).
      const toReclassify = Math.min(weeklyOverhang, finalRegular);
      finalRegular -= toReclassify;

      // The reclassified hours fill 125% bucket first (if not already at cap 2h),
      // then spill into 150%.
      const ot125Headroom = Math.max(0, 2 - finalOt125);
      const addTo125 = Math.min(toReclassify, ot125Headroom);
      const addTo150 = toReclassify - addTo125;

      finalOt125 += addTo125;
      finalOt150 += addTo150;
    }

    const overtime = { regular: finalRegular, ot125: finalOt125, ot150: finalOt150, weeklyOt: weeklyOverhang };

    await pq(
      `UPDATE attendance_records SET check_out=$1, total_hours=$2, regular_hours=$3, overtime_hours=$4, overtime_125_hours=$5, overtime_150_hours=$6, updated_at=NOW() WHERE id=$7`,
      [checkOut, workedHours.toFixed(2), overtime.regular.toFixed(2), (overtime.ot125 + overtime.ot150).toFixed(2), overtime.ot125.toFixed(2), overtime.ot150.toFixed(2), record.id]
    );

    const lat: number | null = b.lat != null ? parseFloat(b.lat) : null;
    const lng: number | null = b.lng != null ? parseFloat(b.lng) : null;
    const method = ["manual", "gps", "nfc", "biometric"].includes(b.method) ? b.method : "manual";

    await pq(
      `INSERT INTO attendance_clock_events (employee_name, clock_type, event_type, event_time, gps_lat, gps_lng, attendance_record_id)
       VALUES ($1, $2, 'out', NOW(), $3, $4, $5)`,
      [employeeName, method, lat, lng, record.id]
    );

    const updated = await pq(`SELECT * FROM attendance_records WHERE id=$1 LIMIT 1`, [record.id]);
    res.json({ success: true, record: updated[0], checkOutTime: checkOut, workedHours, overtime });
  } catch (e: any) { res.status(500).json({ error: e.message || "שגיאה פנימית" }); }
});

// =================== REALTIME DASHBOARD ===================

router.get("/attendance/realtime-dashboard", async (_req, res) => {
  try {
    const today = await pq(`
      SELECT ar.*, ace.gps_lat as last_lat, ace.gps_lng as last_lng, ace.clock_type as last_method
      FROM attendance_records ar
      LEFT JOIN LATERAL (SELECT * FROM attendance_clock_events WHERE attendance_record_id=ar.id ORDER BY id DESC LIMIT 1) ace ON true
      WHERE ar.attendance_date = CURRENT_DATE
      ORDER BY ar.check_in DESC NULLS LAST
    `);

    const checkedIn = (today as any[]).filter(r => r.check_in && !r.check_out);
    const checkedOut = (today as any[]).filter(r => r.check_in && r.check_out);
    const lateCount = (today as any[]).filter(r => Number(r.late_minutes || 0) > 0).length;
    const totalOvertime = (today as any[]).reduce((s, r) => s + parseFloat(r.overtime_hours || 0), 0);
    const avgHours = checkedOut.length ? checkedOut.reduce((s: number, r: any) => s + parseFloat(r.total_hours || 0), 0) / checkedOut.length : 0;

    res.json({
      today_stats: {
        checked_in: checkedIn.length,
        checked_out: checkedOut.length,
        late_count: lateCount,
        total_overtime_hours: totalOvertime.toFixed(2),
        avg_hours: avgHours.toFixed(2),
      },
      live_checkins: checkedIn,
      recent_checkouts: checkedOut.slice(0, 10),
      all_today: today,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// =================== OVERTIME WEEKLY SUMMARY ===================

router.get("/attendance/overtime-summary", async (req, res) => {
  try {
    const week = (req.query.week as string) || new Date().toISOString().slice(0, 10);
    const d = new Date(week);
    const dow = d.getDay();
    const sunday = new Date(d); sunday.setDate(d.getDate() - dow);
    const saturday = new Date(sunday); saturday.setDate(sunday.getDate() + 6);
    const sunStr = sunday.toISOString().slice(0, 10);
    const satStr = saturday.toISOString().slice(0, 10);

    const rows = await pq(`
      SELECT employee_name,
        COALESCE(SUM(total_hours), 0)::numeric(8,2) as total_hours,
        COALESCE(SUM(regular_hours), 0)::numeric(8,2) as regular_hours,
        COALESCE(SUM(overtime_hours), 0)::numeric(8,2) as overtime_hours,
        COALESCE(SUM(overtime_125_hours), 0)::numeric(8,2) as ot125,
        COALESCE(SUM(overtime_150_hours), 0)::numeric(8,2) as ot150
      FROM attendance_records
      WHERE attendance_date >= $1 AND attendance_date <= $2 AND status IN ('present', 'late')
      GROUP BY employee_name
      ORDER BY overtime_hours DESC NULLS LAST
    `, [sunStr, satStr]);

    const WEEKLY_REGULAR = 42;
    const result = (rows as any[]).map(r => {
      const totalH = parseFloat(r.total_hours || 0);
      const weeklyOt = Math.max(0, totalH - WEEKLY_REGULAR);
      return { ...r, weekly_overtime: weeklyOt.toFixed(2) };
    });

    res.json({ week_start: sunStr, week_end: satStr, employees: result });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// =================== LEAVE TYPES ===================

router.get("/leave-types", async (_req, res) => {
  const rows = await pq(`SELECT * FROM leave_types ORDER BY sort_order ASC, name ASC`);
  res.json(rows);
});

router.post("/leave-types", async (req, res) => {
  const b = req.body;
  if (!b.name || !b.code) { res.status(400).json({ error: "שם וקוד נדרשים" }); return; }
  await pq(
    `INSERT INTO leave_types (name, code, is_statutory, accrual_rule, paid_percentage_rules, max_days_per_year, carry_over_days, color, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (code) DO NOTHING`,
    [b.name, b.code, b.is_statutory || false, JSON.stringify(b.accrual_rule || {}), JSON.stringify(b.paid_percentage_rules || []), b.max_days_per_year || null, b.carry_over_days || 0, b.color || "#6366f1", b.sort_order || 0]
  );
  res.json({ success: true });
});

router.put("/leave-types/:id", async (req, res) => {
  const b = req.body; const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const sets: string[] = []; const params: any[] = []; let i = 1;
  if (b.name !== undefined) { sets.push(`name=$${i++}`); params.push(b.name); }
  if (b.max_days_per_year !== undefined) { sets.push(`max_days_per_year=$${i++}`); params.push(b.max_days_per_year || null); }
  if (b.carry_over_days !== undefined) { sets.push(`carry_over_days=$${i++}`); params.push(b.carry_over_days || 0); }
  if (b.color !== undefined) { sets.push(`color=$${i++}`); params.push(b.color); }
  if (b.is_active !== undefined) { sets.push(`is_active=$${i++}`); params.push(b.is_active); }
  if (!sets.length) { res.json({ success: true }); return; }
  sets.push(`updated_at=NOW()`);
  params.push(id);
  await pq(`UPDATE leave_types SET ${sets.join(",")} WHERE id=$${i}`, params);
  res.json({ success: true });
});

// =================== LEAVE BALANCES ===================

router.get("/leave-balances", async (req, res) => {
  const year = parseInt(req.query.year as string) || new Date().getFullYear();
  const employee = (req.query.employee as string) || null;
  const params: any[] = [year];
  let empClause = "";
  if (employee) { empClause = ` AND lb.employee_name ILIKE $2`; params.push(`%${employee}%`); }
  const rows = await pq(`
    SELECT lb.*, lt.name as leave_type_name, lt.color, lt.max_days_per_year, lt.carry_over_days
    FROM leave_balances lb
    LEFT JOIN leave_types lt ON lb.leave_type_code = lt.code
    WHERE lb.year=$1 ${empClause}
    ORDER BY lb.employee_name, lt.sort_order ASC
  `, params);
  res.json(rows);
});

router.post("/leave-balances/accrue", async (req, res) => {
  try {
    const { employee_name, year } = req.body;
    if (!employee_name) { res.status(400).json({ error: "שם עובד נדרש" }); return; }
    const targetYear = year || new Date().getFullYear();

    const leaveTypes = await pq(`SELECT * FROM leave_types WHERE is_active=true`);
    for (const lt of leaveTypes as any[]) {
      const accrual = typeof lt.accrual_rule === 'string' ? JSON.parse(lt.accrual_rule) : (lt.accrual_rule || {});
      let accruedDays = 0;

      if (accrual.type === "annual") {
        accruedDays = accrual.days || 0;
      } else if (accrual.type === "monthly") {
        accruedDays = (accrual.days_per_month || 1.5) * 12;
      } else if (accrual.type === "seniority") {
        // Simple seniority: default to lowest tier if no hire date found
        accruedDays = accrual.rates?.[0]?.days || 12;
      }

      if (accruedDays > 0) {
        await pq(
          `INSERT INTO leave_balances (employee_name, leave_type_id, leave_type_code, year, accrued, last_accrual_date)
           VALUES ($1, $2, $3, $4, $5, CURRENT_DATE)
           ON CONFLICT (employee_name, leave_type_code, year)
           DO UPDATE SET accrued=$5, last_accrual_date=CURRENT_DATE, updated_at=NOW()`,
          [employee_name, lt.id, lt.code, targetYear, accruedDays]
        );
      }
    }

    // Update used from leave_requests
    const usedRows = await pq(`
      SELECT leave_type, COALESCE(SUM(total_days), 0) as used_days
      FROM leave_requests
      WHERE employee_name ILIKE $1 AND EXTRACT(YEAR FROM start_date)=$2 AND status IN ('approved','in_progress','completed')
      GROUP BY leave_type
    `, [employee_name, targetYear]);

    for (const ur of usedRows as any[]) {
      await pq(`UPDATE leave_balances SET used=$1, updated_at=NOW() WHERE employee_name ILIKE $2 AND leave_type_code=$3 AND year=$4`,
        [parseFloat(ur.used_days || 0).toFixed(2), employee_name, ur.leave_type, targetYear]);
    }

    // Update pending from leave_requests
    const pendingRows = await pq(`
      SELECT leave_type, COALESCE(SUM(total_days), 0) as pending_days
      FROM leave_requests
      WHERE employee_name ILIKE $1 AND EXTRACT(YEAR FROM start_date)=$2 AND status='pending'
      GROUP BY leave_type
    `, [employee_name, targetYear]);

    for (const pr of pendingRows as any[]) {
      await pq(`UPDATE leave_balances SET pending=$1, updated_at=NOW() WHERE employee_name ILIKE $2 AND leave_type_code=$3 AND year=$4`,
        [parseFloat(pr.pending_days || 0).toFixed(2), employee_name, pr.leave_type, targetYear]);
    }

    const balances = await pq(`
      SELECT lb.*, lt.name as leave_type_name, lt.color
      FROM leave_balances lb LEFT JOIN leave_types lt ON lb.leave_type_code=lt.code
      WHERE lb.employee_name ILIKE $1 AND lb.year=$2
    `, [employee_name, targetYear]);

    res.json({ success: true, balances });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/leave-balances/:id", async (req, res) => {
  const b = req.body; const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const sets: string[] = []; const params: any[] = []; let i = 1;
  if (b.accrued !== undefined) { sets.push(`accrued=$${i++}`); params.push(parseFloat(b.accrued) || 0); }
  if (b.used !== undefined) { sets.push(`used=$${i++}`); params.push(parseFloat(b.used) || 0); }
  if (b.carried_over !== undefined) { sets.push(`carried_over=$${i++}`); params.push(parseFloat(b.carried_over) || 0); }
  if (b.adjusted !== undefined) { sets.push(`adjusted=$${i++}`); params.push(parseFloat(b.adjusted) || 0); }
  if (!sets.length) { res.json({ success: true }); return; }
  sets.push(`updated_at=NOW()`);
  params.push(id);
  await pq(`UPDATE leave_balances SET ${sets.join(",")} WHERE id=$${i}`, params);
  res.json({ success: true });
});

// =================== LEAVE APPROVAL RULES ===================

router.get("/leave-approval-rules", async (_req, res) => {
  const rows = await pq(`
    SELECT lar.*, lt.name as leave_type_name
    FROM leave_approval_rules lar
    LEFT JOIN leave_types lt ON lar.leave_type_id=lt.id
    WHERE lar.is_active=true
    ORDER BY lar.leave_type_code, lar.approval_level ASC
  `);
  res.json(rows);
});

router.post("/leave-approval-rules", async (req, res) => {
  const b = req.body;
  await pq(
    `INSERT INTO leave_approval_rules (leave_type_id, leave_type_code, min_days_threshold, approver_role, approval_level)
     VALUES ($1, $2, $3, $4, $5)`,
    [b.leave_type_id || null, b.leave_type_code || null, b.min_days_threshold || 0, b.approver_role || "manager", b.approval_level || 1]
  );
  res.json({ success: true });
});

// =================== LEAVE REQUEST WITH APPROVAL WORKFLOW ===================
// Unified endpoint that both creates the leave request and initializes approval flow

router.post("/leave-requests-advanced", async (req, res) => {
  try {
    const b = req.body;
    const empName: string = (b.employeeName || "").trim();
    if (!empName || !b.startDate || !b.endDate) {
      res.status(400).json({ error: "שם עובד, תאריך התחלה וסיום נדרשים" }); return;
    }

    const totalDays = Number(b.totalDays) || 1;
    const leaveType: string = b.leaveType || "vacation";

    // Validate balance (skip for military, unpaid, maternity, paternity which have no caps)
    const noCapTypes = ["military", "unpaid", "maternity", "paternity", "bereavement"];
    if (!noCapTypes.includes(leaveType)) {
      const balanceRow = await pq(
        `SELECT * FROM leave_balances WHERE employee_name ILIKE $1 AND leave_type_code=$2 AND year=EXTRACT(YEAR FROM NOW())::int LIMIT 1`,
        [empName, leaveType]
      );
      const balance = balanceRow[0] as any;
      if (balance) {
        const available = parseFloat(balance.accrued || 0) + parseFloat(balance.carried_over || 0) - parseFloat(balance.used || 0) - parseFloat(balance.pending || 0);
        if (available < totalDays) {
          res.status(400).json({ error: `יתרת ${leaveType} לא מספיקה. זמין: ${available.toFixed(1)} ימים, נדרש: ${totalDays}` }); return;
        }
      }
    }

    const num = `LV-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
    await pq(
      `INSERT INTO leave_requests (request_number, employee_name, employee_id_ref, department, leave_type, start_date, end_date, total_days, is_half_day, reason, status, substitute_name, is_paid, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', $11, $12, $13)`,
      [num, empName, b.employeeIdRef || null, b.department || null, leaveType, b.startDate, b.endDate, totalDays, b.isHalfDay || false, b.reason || null, b.substituteName || null, b.isPaid !== false, b.notes || null]
    );

    const newReq = await pq(`SELECT * FROM leave_requests WHERE request_number=$1 LIMIT 1`, [num]);
    const reqId: number | null = (newReq[0] as any)?.id || null;

    if (reqId) {
      // Determine approval levels from rules table, default to single manager approval
      const rules = await pq(
        `SELECT * FROM leave_approval_rules WHERE leave_type_code=$1 AND is_active=true AND min_days_threshold <= $2 ORDER BY approval_level ASC`,
        [leaveType, totalDays]
      );

      if ((rules as any[]).length === 0) {
        await pq(`INSERT INTO leave_approval_flow (leave_request_id, approval_level, approver_role, status) VALUES ($1, 1, 'manager', 'pending')`, [reqId]);
      } else {
        for (const rule of rules as any[]) {
          await pq(`INSERT INTO leave_approval_flow (leave_request_id, approval_level, approver_role, status) VALUES ($1, $2, $3, 'pending')`,
            [reqId, rule.approval_level, rule.approver_role]);
        }
      }

      // Update pending balance
      await pq(
        `UPDATE leave_balances SET pending=pending+$1, updated_at=NOW() WHERE employee_name ILIKE $2 AND leave_type_code=$3 AND year=EXTRACT(YEAR FROM NOW())::int`,
        [totalDays, empName, leaveType]
      );
    }

    res.json({ success: true, request: newReq[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Also intercept the standard /leave-requests POST to inject approval flow
// This wraps legacy creation with approval flow creation
router.post("/leave-requests-with-flow", async (req, res) => {
  // Alias to leave-requests-advanced
  req.url = "/leave-requests-advanced";
  return router.handle(req as any, res as any, () => {});
});

router.post("/leave-requests/:id/approve", async (req, res) => {
  try {
    const user = (req as any).user;
    const reqId = parseInt(req.params.id);
    if (isNaN(reqId)) { res.status(400).json({ error: "Invalid id" }); return; }
    const b = req.body;
    const level = parseInt(b.level) || 1;
    const approved = b.approved !== false;
    const approverName: string = (user?.full_name || user?.username || "").trim();
    const notes: string = (b.notes || "").trim();

    // Authorization: only managers, HR roles, or super admins may approve.
    // We accept the role either from user.role or user.is_super_admin.
    const userRole: string = (user?.role || "").toLowerCase();
    const ALLOWED_APPROVER_ROLES = ["manager", "hr", "admin", "hr_manager", "department_head", "director", "super_admin", "superadmin"];
    const isSuperAdmin = user?.is_super_admin === true || user?.isSuperAdmin === true;
    const isAllowedToApprove = isSuperAdmin || ALLOWED_APPROVER_ROLES.some(r => userRole.includes(r));
    if (!isAllowedToApprove) {
      res.status(403).json({ error: "אין הרשאה לאשר בקשות חופשה. נדרשת הרשאת מנהל או HR." }); return;
    }

    // Verify this approval step is still pending
    const flowStep = await pq(
      `SELECT * FROM leave_approval_flow WHERE leave_request_id=$1 AND approval_level=$2 LIMIT 1`,
      [reqId, level]
    );
    const step = flowStep[0] as any;
    if (!step) { res.status(404).json({ error: "שלב אישור לא נמצא" }); return; }
    if (step.status !== 'pending') { res.status(400).json({ error: "שלב זה כבר טופל" }); return; }

    await pq(
      `UPDATE leave_approval_flow SET status=$1, approver_name=$2, decision_at=NOW(), notes=$3 WHERE leave_request_id=$4 AND approval_level=$5`,
      [approved ? 'approved' : 'rejected', approverName, notes, reqId, level]
    );

    if (!approved) {
      await pq(`UPDATE leave_requests SET status='rejected', rejection_reason=$1, updated_at=NOW() WHERE id=$2`, [notes, reqId]);
      const reqData = await pq(`SELECT employee_name, leave_type, total_days FROM leave_requests WHERE id=$1 LIMIT 1`, [reqId]);
      const rd = reqData[0] as any;
      if (rd) {
        await pq(`UPDATE leave_balances SET pending=GREATEST(0, pending-$1), updated_at=NOW() WHERE employee_name ILIKE $2 AND leave_type_code=$3 AND year=EXTRACT(YEAR FROM NOW())::int`,
          [rd.total_days, rd.employee_name, rd.leave_type]);
      }
      res.json({ success: true, status: 'rejected' }); return;
    }

    // Check if all levels are now approved
    const remainingPending = await pq(`SELECT COUNT(*)::int as cnt FROM leave_approval_flow WHERE leave_request_id=$1 AND status='pending'`, [reqId]);
    if (Number((remainingPending[0] as any)?.cnt || 0) === 0) {
      const approverId = user?.id || null;
      await pq(`UPDATE leave_requests SET status='approved', approved_by=$1, approved_by_name=$2, approved_at=NOW(), updated_at=NOW() WHERE id=$3`,
        [approverId, approverName, reqId]);
      const reqData = await pq(`SELECT employee_name, leave_type, total_days FROM leave_requests WHERE id=$1 LIMIT 1`, [reqId]);
      const rd = reqData[0] as any;
      if (rd) {
        await pq(`UPDATE leave_balances SET used=used+$1, pending=GREATEST(0, pending-$1), updated_at=NOW() WHERE employee_name ILIKE $2 AND leave_type_code=$3 AND year=EXTRACT(YEAR FROM NOW())::int`,
          [rd.total_days, rd.employee_name, rd.leave_type]);
      }
    }

    res.json({ success: true, status: 'approved' });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/leave-requests/:id/approval-flow", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const rows = await pq(`SELECT * FROM leave_approval_flow WHERE leave_request_id=$1 ORDER BY approval_level ASC`, [id]);
  res.json(rows);
});

// =================== ENHANCED BALANCE ENDPOINT ===================

router.get("/leave-balances-advanced", async (req, res) => {
  const year = parseInt(req.query.year as string) || new Date().getFullYear();
  const employee = (req.query.employee as string) || null;

  const params: any[] = [year];
  let empClause = "";
  if (employee) { empClause = ` AND lb.employee_name ILIKE $2`; params.push(`%${employee}%`); }

  const rows = await pq(`
    SELECT lb.*, lt.name as leave_type_name, lt.color, lt.max_days_per_year, lt.is_statutory, lt.paid_percentage_rules
    FROM leave_balances lb
    LEFT JOIN leave_types lt ON lb.leave_type_code = lt.code
    WHERE lb.year=$1 ${empClause}
    ORDER BY lb.employee_name, lt.sort_order ASC NULLS LAST
  `, params);

  if ((rows as any[]).length === 0) {
    // Fallback: compute from leave_requests
    const fallbackParams: any[] = [year];
    let fallbackEmpClause = "";
    if (employee) { fallbackEmpClause = ` AND employee_name ILIKE $2`; fallbackParams.push(`%${employee}%`); }
    const fallback = await pq(`
      SELECT employee_name, leave_type,
        COALESCE(SUM(total_days) FILTER (WHERE status IN ('approved','in_progress','completed')), 0)::numeric as taken_days,
        COALESCE(SUM(total_days) FILTER (WHERE status='pending'), 0)::numeric as pending_days
      FROM leave_requests
      WHERE EXTRACT(YEAR FROM start_date) = $1 AND status != 'cancelled' ${fallbackEmpClause}
      GROUP BY employee_name, leave_type ORDER BY employee_name, leave_type
    `, fallbackParams);

    const DEFAULT_ENTITLEMENTS: Record<string, number> = {
      vacation: 14, sick: 18, personal: 3, maternity: 182, bereavement: 3, military: 21, unpaid: 0, other: 5
    };
    const result = (fallback as any[]).map(r => ({
      employee_name: r.employee_name,
      leave_type_code: r.leave_type,
      year,
      accrued: parseFloat(r.taken_days || 0) + (DEFAULT_ENTITLEMENTS[r.leave_type] || 5),
      used: parseFloat(r.taken_days || 0),
      pending: parseFloat(r.pending_days || 0),
      carried_over: 0,
      leave_type_name: r.leave_type,
      max_days_per_year: DEFAULT_ENTITLEMENTS[r.leave_type] || 5,
    }));
    res.json(result);
  } else {
    res.json(rows);
  }
});

// =================== SHIFT TEMPLATES ===================

router.get("/shift-templates", async (_req, res) => {
  const rows = await pq(`SELECT * FROM shift_templates WHERE is_active=true ORDER BY shift_type, name`);
  res.json(rows);
});

router.post("/shift-templates", async (req, res) => {
  const b = req.body;
  if (!b.name) { res.status(400).json({ error: "שם תבנית נדרש" }); return; }
  const daysArray: number[] = Array.isArray(b.days_of_week) ? b.days_of_week.map(Number) : [0,1,2,3,4];
  await pq(
    `INSERT INTO shift_templates (name, description, shift_type, start_time, end_time, break_minutes, days_of_week, is_friday, is_saturday)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [b.name, b.description || null, b.shift_type || "morning", b.start_time || null, b.end_time || null, b.break_minutes || 30, daysArray, b.is_friday || false, b.is_saturday || false]
  );
  res.json({ success: true });
});

router.put("/shift-templates/:id", async (req, res) => {
  const b = req.body; const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const sets: string[] = []; const params: any[] = []; let i = 1;
  if (b.name !== undefined) { sets.push(`name=$${i++}`); params.push(b.name); }
  if (b.description !== undefined) { sets.push(`description=$${i++}`); params.push(b.description); }
  if (b.shift_type !== undefined) { sets.push(`shift_type=$${i++}`); params.push(b.shift_type); }
  if (b.start_time !== undefined) { sets.push(`start_time=$${i++}`); params.push(b.start_time); }
  if (b.end_time !== undefined) { sets.push(`end_time=$${i++}`); params.push(b.end_time); }
  if (b.break_minutes !== undefined) { sets.push(`break_minutes=$${i++}`); params.push(b.break_minutes || 30); }
  if (b.is_active !== undefined) { sets.push(`is_active=$${i++}`); params.push(b.is_active); }
  if (!sets.length) { res.json({ success: true }); return; }
  sets.push(`updated_at=NOW()`);
  params.push(id);
  await pq(`UPDATE shift_templates SET ${sets.join(",")} WHERE id=$${i}`, params);
  res.json({ success: true });
});

router.delete("/shift-templates/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await pq(`UPDATE shift_templates SET is_active=false WHERE id=$1`, [id]);
  res.json({ success: true });
});

router.post("/shift-templates/:id/generate-schedule", async (req, res) => {
  try {
    const templateId = parseInt(req.params.id);
    if (isNaN(templateId)) { res.status(400).json({ error: "Invalid id" }); return; }
    const { employees, week_start } = req.body;
    if (!Array.isArray(employees) || !week_start) { res.status(400).json({ error: "נדרשים עובדים ותאריך שבוע" }); return; }

    const templates = await pq(`SELECT * FROM shift_templates WHERE id=$1 LIMIT 1`, [templateId]);
    const tmpl = templates[0] as any;
    if (!tmpl) { res.status(404).json({ error: "תבנית לא נמצאה" }); return; }

    const daysOfWeek: number[] = Array.isArray(tmpl.days_of_week) ? tmpl.days_of_week : [0,1,2,3,4];
    const weekStart = new Date(week_start);
    const created: any[] = [];

    for (const employeeName of employees as string[]) {
      if (typeof employeeName !== "string" || !employeeName.trim()) continue;
      const empName = employeeName.trim();

      for (let d = 0; d < 7; d++) {
        if (!daysOfWeek.includes(d)) continue;
        const date = new Date(weekStart);
        date.setDate(weekStart.getDate() + d);
        const dateStr = date.toISOString().slice(0, 10);

        const existing = await pq(`SELECT id FROM shift_assignments WHERE employee_name ILIKE $1 AND shift_date=$2 LIMIT 1`, [empName, dateStr]);
        if (existing.length > 0) continue;

        const num = `SHF-${Date.now()}-${Math.random().toString(36).slice(2,5)}`;
        await pq(
          `INSERT INTO shift_assignments (assignment_number, employee_name, shift_date, shift_type, start_time, end_time, break_minutes, is_holiday, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, false, 'scheduled')`,
          [num, empName, dateStr, tmpl.shift_type, tmpl.start_time || null, tmpl.end_time || null, tmpl.break_minutes || 30]
        );
        created.push({ employee: empName, date: dateStr });
      }
    }

    res.json({ success: true, created_count: created.length, created });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// =================== SHIFT SWAP REQUESTS ===================

router.get("/shift-swap-requests", async (_req, res) => {
  const rows = await pq(`SELECT * FROM shift_swap_requests ORDER BY created_at DESC LIMIT 100`);
  res.json(rows);
});

router.post("/shift-swap-requests", async (req, res) => {
  const b = req.body;
  if (!b.requester_name) { res.status(400).json({ error: "שם מבקש נדרש" }); return; }
  await pq(
    `INSERT INTO shift_swap_requests (requester_name, requester_shift_id, target_name, target_shift_id, swap_date, reason)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [b.requester_name, b.requester_shift_id || null, b.target_name || null, b.target_shift_id || null,
     b.swap_date || null, b.reason || null]
  );
  res.json({ success: true });
});

router.put("/shift-swap-requests/:id/approve", async (req, res) => {
  try {
    const user = (req as any).user;
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    // Only managers and HR can approve/reject shift swaps
    if (!isPrivilegedUser(user)) {
      res.status(403).json({ error: "אישור החלפת משמרות דורש הרשאת מנהל או HR" }); return;
    }

    const approved = req.body.approved !== false;
    const approverName: string = (user?.full_name || user?.username || "").trim();
    const notes: string = (req.body.notes || "").trim();

    if (approved) {
      const swap = await pq(`SELECT * FROM shift_swap_requests WHERE id=$1 LIMIT 1`, [id]);
      const sw = swap[0] as any;
      // Swap shift assignments if both shift IDs are provided
      if (sw?.requester_shift_id && sw?.target_shift_id) {
        const s1 = await pq(`SELECT * FROM shift_assignments WHERE id=$1 LIMIT 1`, [sw.requester_shift_id]);
        const s2 = await pq(`SELECT * FROM shift_assignments WHERE id=$1 LIMIT 1`, [sw.target_shift_id]);
        const shift1 = s1[0] as any; const shift2 = s2[0] as any;
        if (shift1 && shift2) {
          // Swap employee names between the two shifts
          await pq(`UPDATE shift_assignments SET employee_name=$1, updated_at=NOW() WHERE id=$2`, [shift2.employee_name, shift1.id]);
          await pq(`UPDATE shift_assignments SET employee_name=$1, updated_at=NOW() WHERE id=$2`, [shift1.employee_name, shift2.id]);
        }
      }
      await pq(`UPDATE shift_swap_requests SET status='approved', approved_by=$1, approved_at=NOW(), updated_at=NOW() WHERE id=$2`, [approverName, id]);
    } else {
      await pq(`UPDATE shift_swap_requests SET status='rejected', approved_by=$1, approved_at=NOW(), notes=$2, updated_at=NOW() WHERE id=$3`, [approverName, notes, id]);
    }

    res.json({ success: true, status: approved ? 'approved' : 'rejected' });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// =================== WEEKLY CALENDAR VIEW ===================

router.get("/shifts/weekly-calendar", async (req, res) => {
  try {
    const week = (req.query.week as string) || new Date().toISOString().slice(0, 10);
    const d = new Date(week);
    const dow = d.getDay();
    const sunday = new Date(d); sunday.setDate(d.getDate() - dow);
    const saturday = new Date(sunday); saturday.setDate(sunday.getDate() + 6);
    const sunStr = sunday.toISOString().slice(0, 10);
    const satStr = saturday.toISOString().slice(0, 10);

    const shifts = await pq(`SELECT * FROM shift_assignments WHERE shift_date >= $1 AND shift_date <= $2 ORDER BY shift_date, start_time`, [sunStr, satStr]);
    const templates = await pq(`SELECT * FROM shift_templates WHERE is_active=true`);
    const swaps = await pq(`SELECT * FROM shift_swap_requests WHERE status='pending'`);

    const dates: string[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(sunday);
      date.setDate(sunday.getDate() + i);
      dates.push(date.toISOString().slice(0, 10));
    }

    const employees = [...new Set((shifts as any[]).map(s => s.employee_name).filter(Boolean))].sort();

    const calendar: Record<string, Record<string, any[]>> = {};
    for (const emp of employees) {
      calendar[emp] = {};
      for (const date of dates) calendar[emp][date] = [];
    }
    for (const shift of shifts as any[]) {
      if (shift.employee_name && calendar[shift.employee_name]) {
        const dateStr = (shift.shift_date as string).slice(0, 10);
        if (calendar[shift.employee_name][dateStr]) {
          calendar[shift.employee_name][dateStr].push(shift);
        }
      }
    }

    res.json({ week_start: sunStr, week_end: satStr, dates, employees, calendar, shifts, templates, pending_swaps: swaps });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// =================== MILUIM TRACKING ===================

router.get("/leave-requests/miluim", async (_req, res) => {
  // Use "military" code (consistent with existing leave_requests.leave_type field)
  const rows = await pq(`SELECT * FROM leave_requests WHERE leave_type='military' ORDER BY start_date DESC`);
  res.json(rows);
});

router.put("/leave-requests/:id/miluim-reimburse", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const reimbursed = req.body.reimbursed !== false;
  const amount = parseFloat(req.body.amount) || 0;
  const note = `מילואים: ${reimbursed ? "הוחזר" : "לא הוחזר"} ₪${amount}`;
  await pq(`UPDATE leave_requests SET notes=COALESCE(notes,'') || $1, updated_at=NOW() WHERE id=$2`, [` | ${note}`, id]);
  res.json({ success: true, reimbursed, amount });
});

// ============ KIOSK SIMPLE CLOCK-IN / CLOCK-OUT ============
// These provide a simple name-based clock-in/out for the kiosk mode.

router.get("/attendance/current-status", async (req, res) => {
  const { employee, employeeId, kiosk } = req.query;
  try {
    let empId: number | null = null;
    if (employeeId) {
      empId = parseInt(String(employeeId));
    } else if (employee) {
      const empRows = await pq(
        `SELECT id FROM employees WHERE (first_name || ' ' || last_name) ILIKE $1 LIMIT 1`,
        [String(employee)]
      );
      empId = empRows[0]?.id ?? null;
    }
    if (!empId) {
      res.json({ checkedIn: false, checkInTime: null, employeeId: null });
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const rows = await pq(
      `SELECT id, clock_in, clock_out FROM attendance_records
       WHERE employee_id = $1 AND date = $2
       ORDER BY created_at DESC LIMIT 1`,
      [empId, today]
    );
    if (!rows.length || rows[0].clock_out) {
      res.json({ checkedIn: false, checkInTime: null, employeeId: empId, kiosk: !!kiosk });
    } else {
      res.json({ checkedIn: true, checkInTime: rows[0].clock_in, recordId: rows[0].id, employeeId: empId, kiosk: !!kiosk });
    }
  } catch (err: any) {
    console.error("attendance/current-status error:", err.message);
    res.status(500).json({ error: "שגיאת שרת" });
  }
});

router.post("/attendance/clock-in", async (req, res) => {
  const { employeeName, employeeId, kiosk } = req.body || {};
  try {
    let empId: number | null = employeeId ? parseInt(String(employeeId)) : null;
    let empName = employeeName || "";
    if (!empId && employeeName) {
      const empRows = await pq(
        `SELECT id, first_name, last_name FROM employees WHERE (first_name || ' ' || last_name) ILIKE $1 LIMIT 1`,
        [String(employeeName)]
      );
      if (!empRows.length) { res.status(404).json({ success: false, error: "עובד לא נמצא" }); return; }
      empId = empRows[0].id;
      empName = `${empRows[0].first_name} ${empRows[0].last_name}`;
    }
    if (!empId) { res.status(400).json({ success: false, error: "נדרש מזהה עובד" }); return; }

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const existing = await pq(
      `SELECT id FROM attendance_records WHERE employee_id=$1 AND date=$2 AND clock_out IS NULL LIMIT 1`,
      [empId, today]
    );
    if (existing.length) {
      res.json({ success: false, error: "עובד כבר נרשם כניסה היום", alreadyClockedIn: true });
      return;
    }
    const clockInTime = now.toTimeString().slice(0, 5);
    await pq(
      `INSERT INTO attendance_records (employee_id, date, clock_in, status, notes) VALUES ($1, $2, $3, 'present', $4)`,
      [empId, today, clockInTime, kiosk ? "כניסה דרך קיוסק" : "כניסה ידנית"]
    );
    res.json({ success: true, checkInTime: clockInTime, employeeId: empId, employeeName: empName });
  } catch (err: any) {
    console.error("attendance/clock-in error:", err.message);
    res.status(500).json({ success: false, error: "שגיאת שרת" });
  }
});

router.post("/attendance/clock-out", async (req, res) => {
  const { employeeName, employeeId, kiosk } = req.body || {};
  try {
    let empId: number | null = employeeId ? parseInt(String(employeeId)) : null;
    let empName = employeeName || "";
    if (!empId && employeeName) {
      const empRows = await pq(
        `SELECT id, first_name, last_name FROM employees WHERE (first_name || ' ' || last_name) ILIKE $1 LIMIT 1`,
        [String(employeeName)]
      );
      if (!empRows.length) { res.status(404).json({ success: false, error: "עובד לא נמצא" }); return; }
      empId = empRows[0].id;
      empName = `${empRows[0].first_name} ${empRows[0].last_name}`;
    }
    if (!empId) { res.status(400).json({ success: false, error: "נדרש מזהה עובד" }); return; }

    const today = new Date().toISOString().slice(0, 10);
    const record = await pq(
      `SELECT id FROM attendance_records WHERE employee_id=$1 AND date=$2 AND clock_out IS NULL ORDER BY created_at DESC LIMIT 1`,
      [empId, today]
    );
    if (!record.length) {
      res.json({ success: false, error: "לא נמצאה רשומת כניסה פתוחה להיום" });
      return;
    }
    const now = new Date();
    const clockOutTime = now.toTimeString().slice(0, 5);
    await pq(
      `UPDATE attendance_records SET clock_out=$1, notes=COALESCE(notes,'')||$3 WHERE id=$2`,
      [clockOutTime, record[0].id, kiosk ? " | יציאה דרך קיוסק" : " | יציאה ידנית"]
    );
    res.json({ success: true, checkOutTime: clockOutTime, employeeId: empId, employeeName: empName });
  } catch (err: any) {
    console.error("attendance/clock-out error:", err.message);
    res.status(500).json({ success: false, error: "שגיאת שרת" });
  }
});

export default router;
