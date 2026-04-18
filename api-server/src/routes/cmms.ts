import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

const VALID_EQUIPMENT_STATUSES = new Set(["active", "maintenance", "down", "retired"]);
const VALID_WO_STATUSES = new Set(["open", "in_progress", "completed", "waiting_parts", "cancelled", "closed"]);
const VALID_PRIORITIES = new Set(["low", "medium", "high", "critical"]);
const VALID_FREQUENCIES = new Set(["daily", "weekly", "monthly", "quarterly", "yearly"]);
const VALID_WORK_TYPES = new Set(["corrective", "preventive", "emergency"]);
const VALID_CRITICALITIES = new Set(["low", "medium", "high", "critical"]);

function safeEnum(v: unknown, validSet: Set<string>, fallback: string): string {
  const val = String(v || "");
  return validSet.has(val) ? val : fallback;
}

function safeInt(v: unknown, fallback = 0): number {
  const n = parseInt(String(v), 10);
  return isNaN(n) ? fallback : n;
}

function safeNum(v: unknown, fallback = 0): number {
  const n = parseFloat(String(v));
  return isNaN(n) ? fallback : n;
}

function safeDate(v: unknown): string {
  if (!v) return "NULL";
  const str = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const d = new Date(str);
    if (!isNaN(d.getTime())) return `'${str}'`;
  }
  return "NULL";
}

function safeDatetime(v: unknown): string {
  if (!v) return "NULL";
  const str = String(v).trim();
  const d = new Date(str);
  if (!isNaN(d.getTime())) return `'${d.toISOString()}'`;
  return "NULL";
}

function s(v: unknown): string {
  if (v === null || v === undefined || v === "") return "NULL";
  return `'${String(v).replace(/'/g, "''")}'`;
}

async function q(query: string): Promise<Record<string, unknown>[]> {
  try {
    const r = await db.execute(sql.raw(query));
    const rows = (r as unknown as { rows?: Record<string, unknown>[] }).rows;
    return rows || [];
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[CMMS] query error:", msg);
    return [];
  }
}

async function ensureTables() {
  await q(`CREATE TABLE IF NOT EXISTS cmms_equipment (
    id SERIAL PRIMARY KEY,
    equipment_number VARCHAR(32) UNIQUE,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    manufacturer VARCHAR(200),
    model VARCHAR(200),
    serial_number VARCHAR(200),
    location VARCHAR(200),
    department VARCHAR(200),
    production_line VARCHAR(100),
    status VARCHAR(30) DEFAULT 'active',
    purchase_date DATE,
    purchase_cost NUMERIC(14,2) DEFAULT 0,
    warranty_expiry DATE,
    image_url TEXT,
    criticality VARCHAR(20) DEFAULT 'medium',
    hours_used NUMERIC(10,1) DEFAULT 0,
    last_maintenance_date DATE,
    next_maintenance_date DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS cmms_pm_schedules (
    id SERIAL PRIMARY KEY,
    schedule_number VARCHAR(32) UNIQUE,
    equipment_id INT REFERENCES cmms_equipment(id) ON DELETE CASCADE,
    title VARCHAR(300) NOT NULL,
    description TEXT,
    frequency VARCHAR(30) DEFAULT 'monthly',
    frequency_days INT DEFAULT 30,
    frequency_hours INT,
    checklist JSONB DEFAULT '[]',
    assigned_to VARCHAR(200),
    estimated_hours NUMERIC(6,1) DEFAULT 1,
    last_executed DATE,
    next_due DATE,
    is_active BOOLEAN DEFAULT true,
    priority VARCHAR(20) DEFAULT 'medium',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS cmms_work_orders (
    id SERIAL PRIMARY KEY,
    wo_number VARCHAR(32) UNIQUE,
    equipment_id INT REFERENCES cmms_equipment(id) ON DELETE SET NULL,
    pm_schedule_id INT REFERENCES cmms_pm_schedules(id) ON DELETE SET NULL,
    title VARCHAR(300) NOT NULL,
    description TEXT,
    work_type VARCHAR(30) DEFAULT 'corrective',
    priority VARCHAR(20) DEFAULT 'medium',
    status VARCHAR(30) DEFAULT 'open',
    reported_by VARCHAR(200),
    assigned_to VARCHAR(200),
    failure_type VARCHAR(100),
    failure_description TEXT,
    solution TEXT,
    checklist JSONB DEFAULT '[]',
    parts_used JSONB DEFAULT '[]',
    parts_cost NUMERIC(12,2) DEFAULT 0,
    labor_cost NUMERIC(12,2) DEFAULT 0,
    total_cost NUMERIC(12,2) DEFAULT 0,
    estimated_hours NUMERIC(6,1) DEFAULT 0,
    actual_hours NUMERIC(6,1) DEFAULT 0,
    downtime_hours NUMERIC(6,1) DEFAULT 0,
    scheduled_date DATE,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
}

let tablesReady = false;
async function init() {
  if (!tablesReady) { await ensureTables(); tablesReady = true; }
}

async function nextNum(prefix: string, table: string, col: string): Promise<string> {
  const year = new Date().getFullYear();
  const rows = await q(`SELECT ${col} FROM ${table} WHERE ${col} LIKE '${prefix}${year}-%' ORDER BY id DESC LIMIT 1`);
  const last = rows[0]?.[col] as string | undefined;
  const seq = last ? parseInt(String(last).split("-").pop()!) + 1 : 1;
  return `${prefix}${year}-${String(seq).padStart(4, "0")}`;
}

// שליפת כל הציוד
router.get("/cmms/equipment", async (_req: Request, res: Response) => {
  try {
    await init();
    const rows = await q(`SELECT * FROM cmms_equipment ORDER BY name ASC`);
    res.json(rows);
  } catch (err: any) {
    console.error("Error fetching cmms equipment:", err);
    res.status(500).json({ error: "Internal server error / שגיאת שרת פנימית", details: err?.message });
  }
});

// סטטיסטיקות ציוד
router.get("/cmms/equipment/stats", async (_req: Request, res: Response) => {
  try {
    await init();
    const rows = await q(`SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status='active') as active,
      COUNT(*) FILTER (WHERE status='maintenance') as in_maintenance,
      COUNT(*) FILTER (WHERE status='down') as down,
      COUNT(*) FILTER (WHERE status='retired') as retired,
      COUNT(*) FILTER (WHERE criticality='critical') as critical_equipment,
      COALESCE(SUM(purchase_cost), 0) as total_asset_value,
      COALESCE(AVG(hours_used), 0) as avg_hours_used,
      COUNT(*) FILTER (WHERE next_maintenance_date IS NOT NULL AND next_maintenance_date <= CURRENT_DATE + INTERVAL '7 days') as due_soon
    FROM cmms_equipment`);
    res.json(rows[0] || {});
  } catch (err: any) {
    console.error("Error fetching equipment stats:", err);
    res.status(500).json({ error: "Internal server error / שגיאת שרת פנימית", details: err?.message });
  }
});

// שליפת ציוד לפי מזהה
router.get("/cmms/equipment/:id", async (req: Request, res: Response) => {
  try {
    await init();
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id / מזהה לא תקין" }); return; }
    const rows = await q(`SELECT * FROM cmms_equipment WHERE id=${id}`);
    if (!rows[0]) { res.status(404).json({ error: "Equipment not found / ציוד לא נמצא" }); return; }
    res.json(rows[0]);
  } catch (err: any) {
    console.error("Error fetching equipment by id:", err);
    res.status(500).json({ error: "Internal server error / שגיאת שרת פנימית", details: err?.message });
  }
});

// היסטוריית ציוד - הזמנות עבודה ותחזוקה מונעת
router.get("/cmms/equipment/:id/history", async (req: Request, res: Response) => {
  try {
    await init();
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id / מזהה לא תקין" }); return; }
    const workOrders = await q(`SELECT id, wo_number, title, work_type, status, priority,
      total_cost, downtime_hours, actual_hours, failure_type, scheduled_date, completed_at, created_at
      FROM cmms_work_orders WHERE equipment_id=${id} ORDER BY created_at DESC LIMIT 50`);
    const pmHistory = await q(`SELECT ps.id, ps.schedule_number, ps.title, ps.frequency, ps.last_executed, ps.next_due
      FROM cmms_pm_schedules ps WHERE ps.equipment_id=${id} ORDER BY ps.next_due ASC`);
    res.json({ workOrders, pmSchedules: pmHistory });
  } catch (err: any) {
    console.error("Error fetching equipment history:", err);
    res.status(500).json({ error: "Internal server error / שגיאת שרת פנימית", details: err?.message });
  }
});

// יצירת ציוד חדש
router.post("/cmms/equipment", async (req: Request, res: Response) => {
  try {
    await init();
    const d = req.body;
    // ולידציה - שם ציוד הוא שדה חובה
    if (!d || !d.name) { res.status(400).json({ error: "name is required / שם ציוד הוא שדה חובה" }); return; }
    const num = await nextNum("EQ-", "cmms_equipment", "equipment_number");
    await q(`INSERT INTO cmms_equipment (equipment_number, name, description, category, manufacturer, model, serial_number, location, department, production_line, status, purchase_date, purchase_cost, warranty_expiry, image_url, criticality, hours_used, last_maintenance_date, next_maintenance_date, notes)
      VALUES ('${num}', ${s(d.name)}, ${s(d.description)}, ${s(d.category)}, ${s(d.manufacturer)}, ${s(d.model)}, ${s(d.serialNumber)}, ${s(d.location)}, ${s(d.department)}, ${s(d.productionLine)}, '${safeEnum(d.status, VALID_EQUIPMENT_STATUSES, "active")}', ${safeDate(d.purchaseDate)}, ${safeNum(d.purchaseCost)}, ${safeDate(d.warrantyExpiry)}, ${s(d.imageUrl)}, '${safeEnum(d.criticality, VALID_CRITICALITIES, "medium")}', ${safeNum(d.hoursUsed)}, ${safeDate(d.lastMaintenanceDate)}, ${safeDate(d.nextMaintenanceDate)}, ${s(d.notes)})`);
    const row = await q(`SELECT * FROM cmms_equipment WHERE equipment_number='${num}'`);
    res.status(201).json(row[0]);
  } catch (err: any) {
    console.error("Error creating equipment:", err);
    res.status(500).json({ error: "Internal server error / שגיאת שרת פנימית", details: err?.message });
  }
});

// עדכון ציוד
router.put("/cmms/equipment/:id", async (req: Request, res: Response) => {
  try {
    await init();
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id / מזהה לא תקין" }); return; }
    const d = req.body;
    const sets: string[] = [];
    if (d.name !== undefined) sets.push(`name=${s(d.name)}`);
    if (d.description !== undefined) sets.push(`description=${s(d.description)}`);
    if (d.category !== undefined) sets.push(`category=${s(d.category)}`);
    if (d.manufacturer !== undefined) sets.push(`manufacturer=${s(d.manufacturer)}`);
    if (d.model !== undefined) sets.push(`model=${s(d.model)}`);
    if (d.serialNumber !== undefined) sets.push(`serial_number=${s(d.serialNumber)}`);
    if (d.location !== undefined) sets.push(`location=${s(d.location)}`);
    if (d.department !== undefined) sets.push(`department=${s(d.department)}`);
    if (d.productionLine !== undefined) sets.push(`production_line=${s(d.productionLine)}`);
    if (d.status !== undefined) sets.push(`status='${safeEnum(d.status, VALID_EQUIPMENT_STATUSES, "active")}'`);
    if (d.purchaseDate !== undefined) sets.push(`purchase_date=${safeDate(d.purchaseDate)}`);
    if (d.purchaseCost !== undefined) sets.push(`purchase_cost=${safeNum(d.purchaseCost)}`);
    if (d.warrantyExpiry !== undefined) sets.push(`warranty_expiry=${safeDate(d.warrantyExpiry)}`);
    if (d.criticality !== undefined) sets.push(`criticality='${safeEnum(d.criticality, VALID_CRITICALITIES, "medium")}'`);
    if (d.hoursUsed !== undefined) sets.push(`hours_used=${safeNum(d.hoursUsed)}`);
    if (d.lastMaintenanceDate !== undefined) sets.push(`last_maintenance_date=${safeDate(d.lastMaintenanceDate)}`);
    if (d.nextMaintenanceDate !== undefined) sets.push(`next_maintenance_date=${safeDate(d.nextMaintenanceDate)}`);
    if (d.imageUrl !== undefined) sets.push(`image_url=${s(d.imageUrl)}`);
    if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
    sets.push(`updated_at=NOW()`);
    await q(`UPDATE cmms_equipment SET ${sets.join(",")} WHERE id=${id}`);
    const row = await q(`SELECT * FROM cmms_equipment WHERE id=${id}`);
    if (!row[0]) { res.status(404).json({ error: "Equipment not found / ציוד לא נמצא" }); return; }
    res.json(row[0]);
  } catch (err: any) {
    console.error("Error updating equipment:", err);
    res.status(500).json({ error: "Internal server error / שגיאת שרת פנימית", details: err?.message });
  }
});

// מחיקת ציוד
router.delete("/cmms/equipment/:id", async (req: Request, res: Response) => {
  try {
    await init();
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id / מזהה לא תקין" }); return; }
    await q(`DELETE FROM cmms_equipment WHERE id=${id}`);
    res.json({ success: true });
  } catch (err: any) {
    console.error("Error deleting equipment:", err);
    res.status(500).json({ error: "Internal server error / שגיאת שרת פנימית", details: err?.message });
  }
});

// שליפת לוחות תחזוקה מונעת
router.get("/cmms/pm-schedules", async (_req: Request, res: Response) => {
  try {
    await init();
    const rows = await q(`SELECT ps.*, e.name as equipment_name, e.equipment_number, e.location as equipment_location
      FROM cmms_pm_schedules ps
      LEFT JOIN cmms_equipment e ON e.id = ps.equipment_id
      ORDER BY ps.next_due ASC NULLS LAST`);
    res.json(rows);
  } catch (err: any) {
    console.error("Error fetching PM schedules:", err);
    res.status(500).json({ error: "Internal server error / שגיאת שרת פנימית", details: err?.message });
  }
});

// יצירת לוח תחזוקה מונעת חדש
router.post("/cmms/pm-schedules", async (req: Request, res: Response) => {
  try {
    await init();
    const d = req.body;
    // ולידציה - כותרת היא שדה חובה
    if (!d || !d.title) { res.status(400).json({ error: "title is required / כותרת היא שדה חובה" }); return; }
    const num = await nextNum("PM-", "cmms_pm_schedules", "schedule_number");
    const checklist = d.checklist ? `'${JSON.stringify(d.checklist).replace(/'/g, "''")}'` : "'[]'";
    await q(`INSERT INTO cmms_pm_schedules (schedule_number, equipment_id, title, description, frequency, frequency_days, frequency_hours, checklist, assigned_to, estimated_hours, last_executed, next_due, is_active, priority, notes)
      VALUES ('${num}', ${safeInt(d.equipmentId) || "NULL"}, ${s(d.title)}, ${s(d.description)}, '${safeEnum(d.frequency, VALID_FREQUENCIES, "monthly")}', ${safeInt(d.frequencyDays, 30)}, ${d.frequencyHours ? safeInt(d.frequencyHours) : "NULL"}, ${checklist}, ${s(d.assignedTo)}, ${safeNum(d.estimatedHours, 1)}, ${safeDate(d.lastExecuted)}, ${safeDate(d.nextDue) !== "NULL" ? safeDate(d.nextDue) : "CURRENT_DATE + INTERVAL '30 days'"}, ${d.isActive !== false}, '${safeEnum(d.priority, VALID_PRIORITIES, "medium")}', ${s(d.notes)})`);
    const row = await q(`SELECT ps.*, e.name as equipment_name FROM cmms_pm_schedules ps LEFT JOIN cmms_equipment e ON e.id=ps.equipment_id WHERE ps.schedule_number='${num}'`);
    res.status(201).json(row[0]);
  } catch (err: any) {
    console.error("Error creating PM schedule:", err);
    res.status(500).json({ error: "Internal server error / שגיאת שרת פנימית", details: err?.message });
  }
});

// עדכון לוח תחזוקה מונעת
router.put("/cmms/pm-schedules/:id", async (req: Request, res: Response) => {
  try {
    await init();
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id / מזהה לא תקין" }); return; }
    const d = req.body;
    const sets: string[] = [];
    if (d.title !== undefined) sets.push(`title=${s(d.title)}`);
    if (d.description !== undefined) sets.push(`description=${s(d.description)}`);
    if (d.equipmentId !== undefined) sets.push(`equipment_id=${safeInt(d.equipmentId) || "NULL"}`);
    if (d.frequency !== undefined) sets.push(`frequency='${safeEnum(d.frequency, VALID_FREQUENCIES, "monthly")}'`);
    if (d.frequencyDays !== undefined) sets.push(`frequency_days=${safeInt(d.frequencyDays, 30)}`);
    if (d.frequencyHours !== undefined) sets.push(`frequency_hours=${d.frequencyHours ? safeInt(d.frequencyHours) : "NULL"}`);
    if (d.checklist !== undefined) sets.push(`checklist='${JSON.stringify(d.checklist).replace(/'/g, "''")}'`);
    if (d.assignedTo !== undefined) sets.push(`assigned_to=${s(d.assignedTo)}`);
    if (d.estimatedHours !== undefined) sets.push(`estimated_hours=${safeNum(d.estimatedHours)}`);
    if (d.lastExecuted !== undefined) sets.push(`last_executed=${safeDate(d.lastExecuted)}`);
    if (d.nextDue !== undefined) sets.push(`next_due=${safeDate(d.nextDue)}`);
    if (d.isActive !== undefined) sets.push(`is_active=${!!d.isActive}`);
    if (d.priority !== undefined) sets.push(`priority='${safeEnum(d.priority, VALID_PRIORITIES, "medium")}'`);
    if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
    sets.push(`updated_at=NOW()`);
    await q(`UPDATE cmms_pm_schedules SET ${sets.join(",")} WHERE id=${id}`);
    const row = await q(`SELECT ps.*, e.name as equipment_name FROM cmms_pm_schedules ps LEFT JOIN cmms_equipment e ON e.id=ps.equipment_id WHERE ps.id=${id}`);
    if (!row[0]) { res.status(404).json({ error: "PM schedule not found / לוח תחזוקה לא נמצא" }); return; }
    res.json(row[0]);
  } catch (err: any) {
    console.error("Error updating PM schedule:", err);
    res.status(500).json({ error: "Internal server error / שגיאת שרת פנימית", details: err?.message });
  }
});

// מחיקת לוח תחזוקה מונעת
router.delete("/cmms/pm-schedules/:id", async (req: Request, res: Response) => {
  try {
    await init();
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id / מזהה לא תקין" }); return; }
    await q(`DELETE FROM cmms_pm_schedules WHERE id=${id}`);
    res.json({ success: true });
  } catch (err: any) {
    console.error("Error deleting PM schedule:", err);
    res.status(500).json({ error: "Internal server error / שגיאת שרת פנימית", details: err?.message });
  }
});

// שליפת הזמנות עבודה עם סינון
router.get("/cmms/work-orders", async (req: Request, res: Response) => {
  try {
    await init();
    const status = req.query.status as string | undefined;
    const equipmentId = req.query.equipmentId as string | undefined;
    const conditions: string[] = [];
    if (status && status !== "all" && VALID_WO_STATUSES.has(status)) conditions.push(`wo.status='${status}'`);
    if (equipmentId) conditions.push(`wo.equipment_id=${safeInt(equipmentId)}`);
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = await q(`SELECT wo.*, e.name as equipment_name, e.equipment_number, e.location as equipment_location
      FROM cmms_work_orders wo
      LEFT JOIN cmms_equipment e ON e.id = wo.equipment_id
      ${where}
      ORDER BY CASE wo.status WHEN 'open' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'waiting_parts' THEN 3 ELSE 4 END, wo.created_at DESC`);
    res.json(rows);
  } catch (err: any) {
    console.error("Error fetching work orders:", err);
    res.status(500).json({ error: "Internal server error / שגיאת שרת פנימית", details: err?.message });
  }
});

// סטטיסטיקות הזמנות עבודה
router.get("/cmms/work-orders/stats", async (_req: Request, res: Response) => {
  try {
    await init();
    const rows = await q(`SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status='open') as open_count,
      COUNT(*) FILTER (WHERE status='in_progress') as in_progress,
      COUNT(*) FILTER (WHERE status='completed') as completed,
      COUNT(*) FILTER (WHERE status='waiting_parts') as waiting_parts,
      COUNT(*) FILTER (WHERE priority='critical') as critical,
      COALESCE(SUM(total_cost) FILTER (WHERE completed_at >= DATE_TRUNC('month', CURRENT_DATE)), 0) as monthly_cost,
      COALESCE(AVG(downtime_hours) FILTER (WHERE status='completed'), 0) as avg_downtime,
      COALESCE(AVG(actual_hours) FILTER (WHERE status='completed'), 0) as avg_repair_time,
      COALESCE(SUM(downtime_hours), 0) as total_downtime
    FROM cmms_work_orders`);
    res.json(rows[0] || {});
  } catch (err: any) {
    console.error("Error fetching work order stats:", err);
    res.status(500).json({ error: "Internal server error / שגיאת שרת פנימית", details: err?.message });
  }
});

// יצירת הזמנת עבודה חדשה
router.post("/cmms/work-orders", async (req: Request, res: Response) => {
  try {
    await init();
    const d = req.body;
    // ולידציה - כותרת היא שדה חובה
    if (!d || !d.title) { res.status(400).json({ error: "title is required / כותרת היא שדה חובה" }); return; }
    const num = await nextNum("WO-", "cmms_work_orders", "wo_number");
    const checklist = d.checklist ? `'${JSON.stringify(d.checklist).replace(/'/g, "''")}'` : "'[]'";
    const partsUsed = d.partsUsed ? `'${JSON.stringify(d.partsUsed).replace(/'/g, "''")}'` : "'[]'";
    await q(`INSERT INTO cmms_work_orders (wo_number, equipment_id, pm_schedule_id, title, description, work_type, priority, status, reported_by, assigned_to, failure_type, failure_description, checklist, parts_used, parts_cost, labor_cost, total_cost, estimated_hours, scheduled_date, notes)
      VALUES ('${num}', ${safeInt(d.equipmentId) || "NULL"}, ${safeInt(d.pmScheduleId) || "NULL"}, ${s(d.title)}, ${s(d.description)}, '${safeEnum(d.workType, VALID_WORK_TYPES, "corrective")}', '${safeEnum(d.priority, VALID_PRIORITIES, "medium")}', '${safeEnum(d.status, VALID_WO_STATUSES, "open")}', ${s(d.reportedBy)}, ${s(d.assignedTo)}, ${s(d.failureType)}, ${s(d.failureDescription)}, ${checklist}, ${partsUsed}, ${safeNum(d.partsCost)}, ${safeNum(d.laborCost)}, ${safeNum(d.totalCost)}, ${safeNum(d.estimatedHours)}, ${safeDate(d.scheduledDate)}, ${s(d.notes)})`);
    const row = await q(`SELECT wo.*, e.name as equipment_name FROM cmms_work_orders wo LEFT JOIN cmms_equipment e ON e.id=wo.equipment_id WHERE wo.wo_number='${num}'`);
    res.status(201).json(row[0]);
  } catch (err: any) {
    console.error("Error creating work order:", err);
    res.status(500).json({ error: "Internal server error / שגיאת שרת פנימית", details: err?.message });
  }
});

// עדכון הזמנת עבודה
router.put("/cmms/work-orders/:id", async (req: Request, res: Response) => {
  try {
    await init();
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id / מזהה לא תקין" }); return; }
    const d = req.body;
    const sets: string[] = [];
    if (d.title !== undefined) sets.push(`title=${s(d.title)}`);
    if (d.description !== undefined) sets.push(`description=${s(d.description)}`);
    if (d.equipmentId !== undefined) sets.push(`equipment_id=${safeInt(d.equipmentId) || "NULL"}`);
    if (d.workType !== undefined) sets.push(`work_type='${safeEnum(d.workType, VALID_WORK_TYPES, "corrective")}'`);
    if (d.priority !== undefined) sets.push(`priority='${safeEnum(d.priority, VALID_PRIORITIES, "medium")}'`);
    if (d.status !== undefined) {
      const safeStatus = safeEnum(d.status, VALID_WO_STATUSES, "open");
      sets.push(`status='${safeStatus}'`);
      if (safeStatus === "in_progress") sets.push(`started_at=COALESCE(started_at, NOW())`);
      if (safeStatus === "completed") sets.push(`completed_at=COALESCE(completed_at, NOW())`);
    }
    if (d.assignedTo !== undefined) sets.push(`assigned_to=${s(d.assignedTo)}`);
    if (d.failureType !== undefined) sets.push(`failure_type=${s(d.failureType)}`);
    if (d.failureDescription !== undefined) sets.push(`failure_description=${s(d.failureDescription)}`);
    if (d.solution !== undefined) sets.push(`solution=${s(d.solution)}`);
    if (d.checklist !== undefined) sets.push(`checklist='${JSON.stringify(d.checklist).replace(/'/g, "''")}'`);
    if (d.partsUsed !== undefined) sets.push(`parts_used='${JSON.stringify(d.partsUsed).replace(/'/g, "''")}'`);
    if (d.partsCost !== undefined) sets.push(`parts_cost=${safeNum(d.partsCost)}`);
    if (d.laborCost !== undefined) sets.push(`labor_cost=${safeNum(d.laborCost)}`);
    if (d.totalCost !== undefined) sets.push(`total_cost=${safeNum(d.totalCost)}`);
    if (d.actualHours !== undefined) sets.push(`actual_hours=${safeNum(d.actualHours)}`);
    if (d.downtimeHours !== undefined) sets.push(`downtime_hours=${safeNum(d.downtimeHours)}`);
    if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
    sets.push(`updated_at=NOW()`);
    await q(`UPDATE cmms_work_orders SET ${sets.join(",")} WHERE id=${id}`);
    const row = await q(`SELECT wo.*, e.name as equipment_name FROM cmms_work_orders wo LEFT JOIN cmms_equipment e ON e.id=wo.equipment_id WHERE wo.id=${id}`);
    if (!row[0]) { res.status(404).json({ error: "Work order not found / הזמנת עבודה לא נמצאה" }); return; }
    res.json(row[0]);
  } catch (err: any) {
    console.error("Error updating work order:", err);
    res.status(500).json({ error: "Internal server error / שגיאת שרת פנימית", details: err?.message });
  }
});

// מחיקת הזמנת עבודה
router.delete("/cmms/work-orders/:id", async (req: Request, res: Response) => {
  try {
    await init();
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id / מזהה לא תקין" }); return; }
    await q(`DELETE FROM cmms_work_orders WHERE id=${id}`);
    res.json({ success: true });
  } catch (err: any) {
    console.error("Error deleting work order:", err);
    res.status(500).json({ error: "Internal server error / שגיאת שרת פנימית", details: err?.message });
  }
});

// דשבורד CMMS - נתונים מרוכזים
router.get("/cmms/dashboard", async (_req: Request, res: Response) => {
  try {
  await init();

  const [eqStats] = await Promise.all([
    q(`SELECT
      COUNT(*) as total_equipment,
      COUNT(*) FILTER (WHERE status='active') as active,
      COUNT(*) FILTER (WHERE status='maintenance') as in_maintenance,
      COUNT(*) FILTER (WHERE status='down') as down,
      COUNT(*) FILTER (WHERE next_maintenance_date IS NOT NULL AND next_maintenance_date <= CURRENT_DATE) as overdue_pm,
      COUNT(*) FILTER (WHERE next_maintenance_date IS NOT NULL AND next_maintenance_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days') as due_this_week
    FROM cmms_equipment`),
  ]);

  const [woStats] = await Promise.all([
    q(`SELECT
      COUNT(*) FILTER (WHERE status IN ('open','in_progress','waiting_parts')) as open_work_orders,
      COUNT(*) FILTER (WHERE priority='critical' AND status NOT IN ('completed','cancelled')) as critical_open,
      COALESCE(SUM(total_cost) FILTER (WHERE completed_at >= DATE_TRUNC('month', CURRENT_DATE)), 0) as monthly_cost,
      COALESCE(SUM(downtime_hours) FILTER (WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)), 0) as monthly_downtime
    FROM cmms_work_orders`),
  ]);

  const mtbfRows = await q(`WITH failure_gaps AS (
    SELECT equipment_id,
      EXTRACT(EPOCH FROM (created_at - LAG(created_at) OVER (PARTITION BY equipment_id ORDER BY created_at))) / 3600.0 as hours_between
    FROM cmms_work_orders
    WHERE work_type = 'corrective' AND equipment_id IS NOT NULL
  )
  SELECT COALESCE(AVG(hours_between), 0) as avg_mtbf FROM failure_gaps WHERE hours_between IS NOT NULL`);

  const mttrRows = await q(`SELECT COALESCE(AVG(actual_hours), 0) as avg_mttr 
    FROM cmms_work_orders WHERE status='completed' AND actual_hours > 0`);

  const recentWo = await q(`SELECT wo.id, wo.wo_number, wo.title, wo.work_type, wo.priority, wo.status, wo.assigned_to, wo.created_at, e.name as equipment_name
    FROM cmms_work_orders wo LEFT JOIN cmms_equipment e ON e.id=wo.equipment_id
    WHERE wo.status NOT IN ('completed','cancelled')
    ORDER BY CASE wo.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, wo.created_at DESC
    LIMIT 10`);

  const upcomingPm = await q(`SELECT ps.id, ps.schedule_number, ps.title, ps.frequency, ps.next_due, ps.assigned_to, e.name as equipment_name
    FROM cmms_pm_schedules ps LEFT JOIN cmms_equipment e ON e.id=ps.equipment_id
    WHERE ps.is_active=true AND ps.next_due IS NOT NULL AND ps.next_due <= CURRENT_DATE + INTERVAL '14 days'
    ORDER BY ps.next_due ASC LIMIT 10`);

  const downEquipment = await q(`SELECT id, equipment_number, name, location, department, status FROM cmms_equipment WHERE status IN ('down','maintenance') ORDER BY updated_at DESC LIMIT 10`);

  const todayWo = await q(`SELECT COUNT(*) as cnt FROM cmms_work_orders WHERE DATE(scheduled_date)=CURRENT_DATE OR (DATE(created_at)=CURRENT_DATE AND status NOT IN ('completed','cancelled'))`);
  const thisWeekWo = await q(`SELECT COUNT(*) as cnt FROM cmms_work_orders WHERE (scheduled_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days') OR (created_at >= DATE_TRUNC('week', CURRENT_DATE) AND status NOT IN ('completed','cancelled'))`);

  const weeklySchedule = await q(`SELECT wo.id, wo.wo_number, wo.title, wo.work_type, wo.priority, wo.status, wo.scheduled_date, wo.assigned_to, e.name as equipment_name
    FROM cmms_work_orders wo LEFT JOIN cmms_equipment e ON e.id=wo.equipment_id
    WHERE wo.scheduled_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
    ORDER BY wo.scheduled_date ASC, CASE wo.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END
    LIMIT 20`);

  const monthlyCosts = await q(`SELECT TO_CHAR(DATE_TRUNC('month', completed_at), 'YYYY-MM') as month,
    COALESCE(SUM(total_cost), 0) as cost,
    COUNT(*) as count
    FROM cmms_work_orders WHERE completed_at IS NOT NULL AND completed_at >= CURRENT_DATE - INTERVAL '12 months'
    GROUP BY DATE_TRUNC('month', completed_at) ORDER BY month ASC`);

  const failureTypes = await q(`SELECT COALESCE(failure_type, 'לא מסווג') as type, COUNT(*) as count
    FROM cmms_work_orders WHERE work_type='corrective' AND failure_type IS NOT NULL
    GROUP BY failure_type ORDER BY count DESC LIMIT 10`);

  const equipmentMtbf = await q(`WITH failures AS (
    SELECT equipment_id, COUNT(*) as failure_count,
      MIN(created_at) as first_failure, MAX(created_at) as last_failure,
      COALESCE(AVG(actual_hours), 0) as avg_repair_time
    FROM cmms_work_orders
    WHERE work_type='corrective' AND equipment_id IS NOT NULL
    GROUP BY equipment_id HAVING COUNT(*) > 1
  )
  SELECT e.name, e.equipment_number, f.failure_count,
    EXTRACT(EPOCH FROM (f.last_failure - f.first_failure)) / 3600.0 / GREATEST(f.failure_count - 1, 1) as mtbf_hours,
    f.avg_repair_time as mttr_hours
  FROM failures f JOIN cmms_equipment e ON e.id = f.equipment_id
  ORDER BY mtbf_hours ASC LIMIT 15`);

  res.json({
    equipment: eqStats[0] || {},
    workOrders: woStats[0] || {},
    mtbf: Number(mtbfRows[0]?.avg_mtbf || 0),
    mttr: Number(mttrRows[0]?.avg_mttr || 0),
    recentWorkOrders: recentWo,
    upcomingPm,
    downEquipment,
    monthlyCosts,
    failureTypes,
    equipmentMtbf,
    todayCount: Number(todayWo[0]?.cnt || 0),
    thisWeekCount: Number(thisWeekWo[0]?.cnt || 0),
    weeklySchedule,
  });
  } catch (err: any) {
    console.error("Error fetching CMMS dashboard:", err);
    res.status(500).json({ error: "Internal server error / שגיאת שרת פנימית", details: err?.message });
  }
});

// זריעת נתוני דוגמה ל-CMMS
router.post("/cmms/seed", async (_req: Request, res: Response) => {
  try {
  await init();
  const existing = await q(`SELECT COUNT(*)::int as c FROM cmms_equipment`);
  if (Number((existing[0] as Record<string, unknown>)?.c || 0) > 0) {
    return res.json({ message: "Data already exists" });
  }

  const equipmentData = [
    { name: "מכונת CNC מספר 1", category: "CNC", manufacturer: "HAAS", model: "VF-2SS", serial: "SN-CNC-001", location: "אולם A", dept: "חיתוך CNC", line: "קו 1", cost: 450000, hours: 12500, criticality: "critical" },
    { name: "מכונת CNC מספר 2", category: "CNC", manufacturer: "DMG MORI", model: "NLX 2500", serial: "SN-CNC-002", location: "אולם A", dept: "חיתוך CNC", line: "קו 1", cost: 620000, hours: 8900, criticality: "critical" },
    { name: "מכבש הידראולי 200 טון", category: "כיפוף", manufacturer: "TRUMPF", model: "TruBend 5130", serial: "SN-PRE-001", location: "אולם B", dept: "כיפוף", line: "קו 2", cost: 380000, hours: 15200, criticality: "high" },
    { name: "מכונת ריתוך TIG אוטומטית", category: "ריתוך", manufacturer: "Lincoln Electric", model: "Aspect 375", serial: "SN-WLD-001", location: "אולם C", dept: "ריתוך", line: "קו 3", cost: 85000, hours: 6700, criticality: "medium" },
    { name: "מסור סרט אוטומטי", category: "חיתוך", manufacturer: "AMADA", model: "HFA-400W", serial: "SN-SAW-001", location: "אולם A", dept: "חיתוך", line: "קו 1", cost: 120000, hours: 18300, criticality: "medium" },
    { name: "מכונת לייזר פייבר", category: "חיתוך", manufacturer: "TRUMPF", model: "TruLaser 3030", serial: "SN-LSR-001", location: "אולם A", dept: "חיתוך לייזר", line: "קו 1", cost: 1200000, hours: 4200, criticality: "critical" },
    { name: "מגלגלת פח 3 מ'", category: "כיפוף", manufacturer: "Faccin", model: "4HEL", serial: "SN-ROL-001", location: "אולם B", dept: "כיפוף", line: "קו 2", cost: 210000, hours: 9800, criticality: "high" },
    { name: "קומפרסור תעשייתי ראשי", category: "תשתית", manufacturer: "Atlas Copco", model: "GA 55+", serial: "SN-CMP-001", location: "חדר מכונות", dept: "תשתיות", line: "", cost: 95000, hours: 22000, criticality: "critical" },
    { name: "מלטשת שטוחה", category: "גימור", manufacturer: "JUNKER", model: "LEAN.GRIND", serial: "SN-GRD-001", location: "אולם C", dept: "גימור", line: "קו 4", cost: 175000, hours: 7600, criticality: "medium" },
    { name: "עגורן גשר 10 טון", category: "תשתית", manufacturer: "ABUS", model: "ZLK 10t", serial: "SN-CRN-001", location: "אולם A", dept: "תשתיות", line: "", cost: 280000, hours: 11000, criticality: "high" },
    { name: "מכונת צביעה אלקטרוסטטית", category: "ציפוי", manufacturer: "Gema", model: "OptiFlex Pro", serial: "SN-PNT-001", location: "אולם D", dept: "ציפוי", line: "קו 5", cost: 320000, hours: 5400, criticality: "medium" },
    { name: "תנור ייבוש תעשייתי", category: "ציפוי", manufacturer: "Despatch", model: "LFD2-42-3", serial: "SN-OVN-001", location: "אולם D", dept: "ציפוי", line: "קו 5", cost: 190000, hours: 8100, criticality: "high" },
  ];

  for (const eq of equipmentData) {
    const num = await nextNum("EQ-", "cmms_equipment", "equipment_number");
    const pd = new Date(Date.now() - Math.random() * 5 * 365 * 86400000).toISOString().slice(0, 10);
    const lm = new Date(Date.now() - Math.random() * 90 * 86400000).toISOString().slice(0, 10);
    const nm = new Date(Date.now() + Math.random() * 30 * 86400000).toISOString().slice(0, 10);
    await q(`INSERT INTO cmms_equipment (equipment_number, name, category, manufacturer, model, serial_number, location, department, production_line, status, purchase_date, purchase_cost, criticality, hours_used, last_maintenance_date, next_maintenance_date)
      VALUES ('${num}', ${s(eq.name)}, ${s(eq.category)}, ${s(eq.manufacturer)}, ${s(eq.model)}, ${s(eq.serial)}, ${s(eq.location)}, ${s(eq.dept)}, ${s(eq.line)}, 'active', '${pd}', ${eq.cost}, '${eq.criticality}', ${eq.hours}, '${lm}', '${nm}')`);
  }

  const equipment = await q(`SELECT id, name FROM cmms_equipment ORDER BY id`);
  const techs = ["יוסי כהן", "דוד מזרחי", "אלון גולדשטיין", "עומר חדד", "איתן רוזנברג"];
  const failureTypes2 = ["מכני", "חשמלי", "הידראולי", "פנאומטי", "בלאי", "קליברציה", "תוכנה", "חימום"];

  for (const eq of equipment) {
    const eqId = Number(eq.id);
    const pmNum = await nextNum("PM-", "cmms_pm_schedules", "schedule_number");
    const freq = ["daily", "weekly", "monthly", "quarterly"][Math.floor(Math.random() * 4)];
    const days = { daily: 1, weekly: 7, monthly: 30, quarterly: 90 }[freq] || 30;
    const nextDue = new Date(Date.now() + Math.random() * days * 86400000).toISOString().slice(0, 10);
    const checklist = JSON.stringify([
      { task: "בדיקת שמנים וסיכה", done: false },
      { task: "ניקוי ובדיקת פילטרים", done: false },
      { task: "בדיקת רצועות ושרשראות", done: false },
      { task: "בדיקת מערכת חשמלית", done: false },
      { task: "בדיקת קליברציה", done: false },
    ]).replace(/'/g, "''");
    await q(`INSERT INTO cmms_pm_schedules (schedule_number, equipment_id, title, frequency, frequency_days, checklist, assigned_to, estimated_hours, next_due, is_active, priority)
      VALUES ('${pmNum}', ${eqId}, ${s(`תחזוקה מונעת — ${eq.name}`)}, '${freq}', ${days}, '${checklist}', ${s(techs[Math.floor(Math.random() * techs.length)])}, ${(Math.random() * 4 + 1).toFixed(1)}, '${nextDue}', true, '${["medium", "high"][Math.floor(Math.random() * 2)]}')`);
  }

  const woTypes = ["corrective", "corrective", "preventive", "corrective", "emergency"];
  const woStatuses = ["open", "in_progress", "completed", "completed", "completed", "waiting_parts"];
  for (let i = 0; i < 30; i++) {
    const eq = equipment[Math.floor(Math.random() * equipment.length)];
    const eqId = Number(eq.id);
    const woNum = await nextNum("WO-", "cmms_work_orders", "wo_number");
    const wType = woTypes[Math.floor(Math.random() * woTypes.length)];
    const wStatus = woStatuses[Math.floor(Math.random() * woStatuses.length)];
    const fType = failureTypes2[Math.floor(Math.random() * failureTypes2.length)];
    const pCost = Math.floor(Math.random() * 5000);
    const lCost = Math.floor(Math.random() * 3000);
    const aHours = (Math.random() * 8 + 0.5).toFixed(1);
    const dHours = (Math.random() * 12).toFixed(1);
    const created = new Date(Date.now() - Math.random() * 180 * 86400000);
    const completed = wStatus === "completed" ? new Date(created.getTime() + Math.random() * 7 * 86400000) : null;
    await q(`INSERT INTO cmms_work_orders (wo_number, equipment_id, title, work_type, priority, status, reported_by, assigned_to, failure_type, parts_cost, labor_cost, total_cost, estimated_hours, actual_hours, downtime_hours, scheduled_date, started_at, completed_at, created_at)
      VALUES ('${woNum}', ${eqId}, ${s(`${wType === "corrective" ? "תיקון" : wType === "preventive" ? "תחזוקה מונעת" : "חירום"} — ${eq.name}`)}, '${wType}', '${["low", "medium", "high", "critical"][Math.floor(Math.random() * 4)]}', '${wStatus}', ${s(techs[Math.floor(Math.random() * techs.length)])}, ${s(techs[Math.floor(Math.random() * techs.length)])}, ${s(fType)}, ${pCost}, ${lCost}, ${pCost + lCost}, ${aHours}, ${wStatus === "completed" ? aHours : 0}, ${wStatus === "completed" ? dHours : 0}, '${created.toISOString().slice(0, 10)}', ${wStatus !== "open" ? `'${created.toISOString()}'` : "NULL"}, ${completed ? `'${completed.toISOString()}'` : "NULL"}, '${created.toISOString()}')`);
  }

  res.json({ message: "CMMS seed complete" });
  } catch (err: any) {
    console.error("Error seeding CMMS data:", err);
    res.status(500).json({ error: "Internal server error / שגיאת שרת פנימית", details: err?.message });
  }
});

export default router;
