import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

const VALID_EQUIPMENT_STATUSES = new Set(["active", "maintenance", "down", "retired"]);
const VALID_WO_STATUSES = new Set(["open", "assigned", "in_progress", "waiting_parts", "completed", "closed", "cancelled"]);
const VALID_PRIORITIES = new Set(["low", "medium", "high", "critical"]);
const VALID_FREQUENCIES = new Set(["daily", "weekly", "monthly", "quarterly", "yearly"]);
const VALID_WORK_TYPES = new Set(["corrective", "preventive", "emergency"]);
const VALID_CRITICALITIES = new Set(["low", "medium", "high", "critical"]);
const VALID_METER_TYPES = new Set(["hours", "cycles", "km", "units"]);
const VALID_DOWNTIME_REASONS = new Set(["mechanical", "electrical", "hydraulic", "pneumatic", "software", "planned", "operator_error", "material", "setup", "external", "other"]);
const VALID_REQUEST_STATUSES = new Set(["pending", "assigned", "in_progress", "completed", "cancelled"]);
const VALID_URGENCIES = new Set(["low", "medium", "high", "critical"]);

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
    cycles_used NUMERIC(12,0) DEFAULT 0,
    km_used NUMERIC(10,1) DEFAULT 0,
    last_maintenance_date DATE,
    next_maintenance_date DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  const alterCols = [
    `ALTER TABLE cmms_equipment ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(10,2)`,
    `ALTER TABLE cmms_equipment ADD COLUMN IF NOT EXISTS dimensions_length_mm NUMERIC(10,1)`,
    `ALTER TABLE cmms_equipment ADD COLUMN IF NOT EXISTS dimensions_width_mm NUMERIC(10,1)`,
    `ALTER TABLE cmms_equipment ADD COLUMN IF NOT EXISTS dimensions_height_mm NUMERIC(10,1)`,
    `ALTER TABLE cmms_equipment ADD COLUMN IF NOT EXISTS power_rating_kw NUMERIC(8,2)`,
    `ALTER TABLE cmms_equipment ADD COLUMN IF NOT EXISTS voltage_v INTEGER`,
    `ALTER TABLE cmms_equipment ADD COLUMN IF NOT EXISTS operating_pressure_bar NUMERIC(6,2)`,
    `ALTER TABLE cmms_equipment ADD COLUMN IF NOT EXISTS operating_temp_c NUMERIC(6,1)`,
    `ALTER TABLE cmms_equipment ADD COLUMN IF NOT EXISTS capacity VARCHAR(200)`,
    `ALTER TABLE cmms_equipment ADD COLUMN IF NOT EXISTS year_of_manufacture INTEGER`,
    `ALTER TABLE cmms_equipment ADD COLUMN IF NOT EXISTS country_of_origin VARCHAR(100)`,
    `ALTER TABLE cmms_equipment ADD COLUMN IF NOT EXISTS warranty_provider VARCHAR(200)`,
    `ALTER TABLE cmms_equipment ADD COLUMN IF NOT EXISTS warranty_terms TEXT`,
    `ALTER TABLE cmms_equipment ADD COLUMN IF NOT EXISTS warranty_status VARCHAR(30) DEFAULT 'unknown'`,
    `ALTER TABLE cmms_equipment ADD COLUMN IF NOT EXISTS expected_useful_life_years INTEGER`,
    `ALTER TABLE cmms_equipment ADD COLUMN IF NOT EXISTS replacement_cost NUMERIC(14,2) DEFAULT 0`,
    `ALTER TABLE cmms_equipment ADD COLUMN IF NOT EXISTS salvage_value NUMERIC(14,2) DEFAULT 0`,
    `ALTER TABLE cmms_equipment ADD COLUMN IF NOT EXISTS acquisition_method VARCHAR(50) DEFAULT 'purchase'`,
    `ALTER TABLE cmms_equipment ADD COLUMN IF NOT EXISTS downtime_cost_per_hour NUMERIC(10,2) DEFAULT 0`,
    `ALTER TABLE cmms_equipment ADD COLUMN IF NOT EXISTS mileage_km NUMERIC(12,1) DEFAULT 0`,
    `ALTER TABLE cmms_equipment ADD COLUMN IF NOT EXISTS fuel_type VARCHAR(50)`,
    `ALTER TABLE cmms_equipment ADD COLUMN IF NOT EXISTS license_plate VARCHAR(30)`,
    `ALTER TABLE cmms_equipment ADD COLUMN IF NOT EXISTS insurance_expiry DATE`,
    `ALTER TABLE cmms_equipment ADD COLUMN IF NOT EXISTS insurance_policy VARCHAR(100)`,
    `ALTER TABLE cmms_equipment ADD COLUMN IF NOT EXISTS registration_expiry DATE`,
    `ALTER TABLE cmms_equipment ADD COLUMN IF NOT EXISTS parent_equipment_id INTEGER REFERENCES cmms_equipment(id) ON DELETE SET NULL`,
    `ALTER TABLE cmms_equipment ADD COLUMN IF NOT EXISTS asset_tag VARCHAR(100)`,
    `ALTER TABLE cmms_equipment ADD COLUMN IF NOT EXISTS qr_code TEXT`,
    `ALTER TABLE cmms_equipment ADD COLUMN IF NOT EXISTS responsible_person VARCHAR(200)`,
  ];
  for (const a of alterCols) {
    await q(a);
  }

  await q(`CREATE TABLE IF NOT EXISTS cmms_pm_schedules (
    id SERIAL PRIMARY KEY,
    schedule_number VARCHAR(32) UNIQUE,
    equipment_id INT REFERENCES cmms_equipment(id) ON DELETE CASCADE,
    title VARCHAR(300) NOT NULL,
    description TEXT,
    frequency VARCHAR(30) DEFAULT 'monthly',
    frequency_days INT DEFAULT 30,
    frequency_hours INT,
    meter_type VARCHAR(20),
    meter_threshold NUMERIC(12,1),
    current_meter_reading NUMERIC(12,1) DEFAULT 0,
    last_meter_at_pm NUMERIC(12,1) DEFAULT 0,
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

  await q(`CREATE TABLE IF NOT EXISTS cmms_settings (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) UNIQUE NOT NULL,
    value TEXT NOT NULL,
    label VARCHAR(200),
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await q(`INSERT INTO cmms_settings (key, value, label, description) VALUES
    ('replace_threshold_pct', '75', 'סף המלצת החלפה (%)', 'כאשר עלויות תחזוקה עוברות אחוז זה מעלות ההחלפה, מומלץ להחליף')
    ON CONFLICT (key) DO NOTHING`);
  await q(`INSERT INTO cmms_settings (key, value, label, description) VALUES
    ('evaluate_threshold_pct', '50', 'סף בחינת החלפה (%)', 'כאשר עלויות תחזוקה עוברות אחוז זה מעלות ההחלפה, מומלץ לשקול החלפה')
    ON CONFLICT (key) DO NOTHING`);

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
    parts_consumed JSONB DEFAULT '[]',
    labor_logs JSONB DEFAULT '[]',
    parts_cost NUMERIC(12,2) DEFAULT 0,
    labor_cost NUMERIC(12,2) DEFAULT 0,
    total_cost NUMERIC(12,2) DEFAULT 0,
    estimated_hours NUMERIC(6,1) DEFAULT 0,
    actual_hours NUMERIC(6,1) DEFAULT 0,
    downtime_hours NUMERIC(6,1) DEFAULT 0,
    scheduled_date DATE,
    assigned_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    waiting_parts_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS cmms_downtime_events (
    id SERIAL PRIMARY KEY,
    event_number VARCHAR(32) UNIQUE,
    equipment_id INT REFERENCES cmms_equipment(id) ON DELETE SET NULL,
    work_order_id INT REFERENCES cmms_work_orders(id) ON DELETE SET NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ,
    duration_minutes NUMERIC(8,1),
    reason_category VARCHAR(50) NOT NULL DEFAULT 'other',
    reason_detail TEXT,
    production_impact TEXT,
    units_lost NUMERIC(10,0) DEFAULT 0,
    shift VARCHAR(30),
    reported_by VARCHAR(200),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS cmms_maintenance_requests (
    id SERIAL PRIMARY KEY,
    request_number VARCHAR(32) UNIQUE,
    equipment_id INT REFERENCES cmms_equipment(id) ON DELETE SET NULL,
    title VARCHAR(300) NOT NULL,
    description TEXT NOT NULL,
    urgency VARCHAR(20) DEFAULT 'medium',
    status VARCHAR(30) DEFAULT 'pending',
    requested_by VARCHAR(200),
    department VARCHAR(200),
    assigned_to VARCHAR(200),
    work_order_id INT REFERENCES cmms_work_orders(id) ON DELETE SET NULL,
    photo_url TEXT,
    notes TEXT,
    department VARCHAR(200),
    asset_category VARCHAR(100),
    contractor_cost NUMERIC(12,2) DEFAULT 0,
    contractor_id INT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  const woAlters = [
    `ALTER TABLE cmms_work_orders ADD COLUMN IF NOT EXISTS department VARCHAR(200)`,
    `ALTER TABLE cmms_work_orders ADD COLUMN IF NOT EXISTS asset_category VARCHAR(100)`,
    `ALTER TABLE cmms_work_orders ADD COLUMN IF NOT EXISTS contractor_cost NUMERIC(12,2) DEFAULT 0`,
    `ALTER TABLE cmms_work_orders ADD COLUMN IF NOT EXISTS contractor_id INT`,
  ];
  for (const a of woAlters) { await q(a); }

  await q(`CREATE TABLE IF NOT EXISTS cmms_spare_parts (
    id SERIAL PRIMARY KEY,
    part_number VARCHAR(64) UNIQUE,
    name VARCHAR(300) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    location_bin VARCHAR(100),
    current_stock NUMERIC(10,2) DEFAULT 0,
    minimum_stock NUMERIC(10,2) DEFAULT 0,
    reorder_qty NUMERIC(10,2) DEFAULT 1,
    unit_cost NUMERIC(12,2) DEFAULT 0,
    supplier_id INT,
    supplier_name VARCHAR(200),
    last_reorder_date DATE,
    is_active BOOLEAN DEFAULT true,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS cmms_contractors (
    id SERIAL PRIMARY KEY,
    company_name VARCHAR(300) NOT NULL,
    contact_person VARCHAR(200),
    phone VARCHAR(50),
    email VARCHAR(200),
    specializations TEXT,
    hourly_rate NUMERIC(10,2) DEFAULT 0,
    daily_rate NUMERIC(10,2) DEFAULT 0,
    contract_start DATE,
    contract_end DATE,
    sla_response_hours NUMERIC(6,1) DEFAULT 24,
    sla_resolution_hours NUMERIC(6,1) DEFAULT 72,
    rating NUMERIC(3,1) DEFAULT 0,
    status VARCHAR(30) DEFAULT 'active',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS cmms_contractor_work_orders (
    id SERIAL PRIMARY KEY,
    work_order_id INT REFERENCES cmms_work_orders(id) ON DELETE CASCADE,
    contractor_id INT REFERENCES cmms_contractors(id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    responded_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    cost NUMERIC(12,2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS cmms_maintenance_budgets (
    id SERIAL PRIMARY KEY,
    year INT NOT NULL,
    department VARCHAR(200),
    asset_category VARCHAR(100),
    budget_amount NUMERIC(14,2) DEFAULT 0,
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

router.get("/cmms/equipment", async (req: Request, res: Response) => {
  await init();
  const { category, department, location, status, criticality, parentId, search } = req.query as Record<string, string>;
  const conds: string[] = [];
  if (category && category !== "all") conds.push(`e.category=${s(category)}`);
  if (department && department !== "all") conds.push(`e.department=${s(department)}`);
  if (location && location !== "all") conds.push(`e.location=${s(location)}`);
  if (status && status !== "all" && VALID_EQUIPMENT_STATUSES.has(status)) conds.push(`e.status='${status}'`);
  if (criticality && criticality !== "all" && VALID_CRITICALITIES.has(criticality)) conds.push(`e.criticality='${criticality}'`);
  if (parentId === "null") conds.push(`e.parent_equipment_id IS NULL`);
  else if (parentId) conds.push(`e.parent_equipment_id=${safeInt(parentId)}`);
  if (search) conds.push(`(e.name ILIKE ${s('%' + search + '%')} OR e.equipment_number ILIKE ${s('%' + search + '%')} OR e.manufacturer ILIKE ${s('%' + search + '%')} OR e.serial_number ILIKE ${s('%' + search + '%')} OR e.location ILIKE ${s('%' + search + '%')})`);
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const rows = await q(`SELECT e.*, p.name as parent_name, p.equipment_number as parent_number,
    (SELECT COUNT(*) FROM cmms_equipment c WHERE c.parent_equipment_id = e.id) as child_count
    FROM cmms_equipment e
    LEFT JOIN cmms_equipment p ON p.id = e.parent_equipment_id
    ${where}
    ORDER BY e.name ASC`);
  res.json(rows);
});

router.get("/cmms/equipment/stats", async (_req: Request, res: Response) => {
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
});

router.get("/cmms/equipment/:id", async (req: Request, res: Response) => {
  await init();
  const id = String(req.params.id);
  const rows = await q(`SELECT * FROM cmms_equipment WHERE id=${parseInt(id)}`);
  if (!rows[0]) return res.status(404).json({ error: "Equipment not found" });
  res.json(rows[0]);
});

router.get("/cmms/equipment/:id/history", async (req: Request, res: Response) => {
  await init();
  const id = parseInt(String(req.params.id));
  const workOrders = await q(`SELECT id, wo_number, title, work_type, status, priority, 
    total_cost, downtime_hours, actual_hours, failure_type, scheduled_date, completed_at, created_at
    FROM cmms_work_orders WHERE equipment_id=${id} ORDER BY created_at DESC LIMIT 50`);
  const pmHistory = await q(`SELECT ps.id, ps.schedule_number, ps.title, ps.frequency, ps.last_executed, ps.next_due
    FROM cmms_pm_schedules ps WHERE ps.equipment_id=${id} ORDER BY ps.next_due ASC`);
  const downtime = await q(`SELECT id, event_number, start_time, end_time, duration_minutes, reason_category, reason_detail
    FROM cmms_downtime_events WHERE equipment_id=${id} ORDER BY start_time DESC LIMIT 20`);
  res.json({ workOrders, pmSchedules: pmHistory, downtime });
});

router.post("/cmms/equipment", async (req: Request, res: Response) => {
  await init();
  const d = req.body;
  const num = await nextNum("EQ-", "cmms_equipment", "equipment_number");
  const qrCode = `CMMS:${num}`;
  await q(`INSERT INTO cmms_equipment (equipment_number, name, description, category, manufacturer, model, serial_number, location, department, production_line, status, purchase_date, purchase_cost, warranty_expiry, image_url, criticality, hours_used, cycles_used, km_used, last_maintenance_date, next_maintenance_date, notes,
    weight_kg, dimensions_length_mm, dimensions_width_mm, dimensions_height_mm, power_rating_kw, voltage_v, operating_pressure_bar, operating_temp_c, capacity, year_of_manufacture, country_of_origin,
    warranty_provider, warranty_terms, warranty_status, expected_useful_life_years, replacement_cost, salvage_value, acquisition_method, downtime_cost_per_hour,
    mileage_km, fuel_type, license_plate, insurance_expiry, insurance_policy, registration_expiry,
    parent_equipment_id, asset_tag, qr_code, responsible_person)
    VALUES ('${num}', ${s(d.name)}, ${s(d.description)}, ${s(d.category)}, ${s(d.manufacturer)}, ${s(d.model)}, ${s(d.serialNumber)}, ${s(d.location)}, ${s(d.department)}, ${s(d.productionLine)}, '${safeEnum(d.status, VALID_EQUIPMENT_STATUSES, "active")}', ${safeDate(d.purchaseDate)}, ${safeNum(d.purchaseCost)}, ${safeDate(d.warrantyExpiry)}, ${s(d.imageUrl)}, '${safeEnum(d.criticality, VALID_CRITICALITIES, "medium")}', ${safeNum(d.hoursUsed)}, ${safeNum(d.cyclesUsed)}, ${safeNum(d.kmUsed)}, ${safeDate(d.lastMaintenanceDate)}, ${safeDate(d.nextMaintenanceDate)}, ${s(d.notes)},
    ${d.weightKg != null ? safeNum(d.weightKg) : "NULL"}, ${d.dimensionsLength != null ? safeNum(d.dimensionsLength) : "NULL"}, ${d.dimensionsWidth != null ? safeNum(d.dimensionsWidth) : "NULL"}, ${d.dimensionsHeight != null ? safeNum(d.dimensionsHeight) : "NULL"}, ${d.powerRatingKw != null ? safeNum(d.powerRatingKw) : "NULL"}, ${d.voltageV != null ? safeInt(d.voltageV) : "NULL"}, ${d.operatingPressureBar != null ? safeNum(d.operatingPressureBar) : "NULL"}, ${d.operatingTempC != null ? safeNum(d.operatingTempC) : "NULL"}, ${s(d.capacity)}, ${d.yearOfManufacture ? safeInt(d.yearOfManufacture) : "NULL"}, ${s(d.countryOfOrigin)},
    ${s(d.warrantyProvider)}, ${s(d.warrantyTerms)}, '${safeEnum(d.warrantyStatus || "unknown", new Set(["active","expired","none","unknown"]), "unknown")}', ${d.expectedUsefulLifeYears ? safeInt(d.expectedUsefulLifeYears) : "NULL"}, ${safeNum(d.replacementCost)}, ${safeNum(d.salvageValue)}, ${s(d.acquisitionMethod || "purchase")}, ${safeNum(d.downtimeCostPerHour)},
    ${safeNum(d.mileageKm)}, ${s(d.fuelType)}, ${s(d.licensePlate)}, ${safeDate(d.insuranceExpiry)}, ${s(d.insurancePolicy)}, ${safeDate(d.registrationExpiry)},
    ${d.parentEquipmentId ? safeInt(d.parentEquipmentId) : "NULL"}, ${s(d.assetTag)}, ${s(qrCode)}, ${s(d.responsiblePerson)})`);

  const row = await q(`SELECT * FROM cmms_equipment WHERE equipment_number='${num}'`);
  res.json(row[0]);
});

router.put("/cmms/equipment/:id", async (req: Request, res: Response) => {
  await init();
  const id = parseInt(String(req.params.id));
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
  if (d.cyclesUsed !== undefined) sets.push(`cycles_used=${safeNum(d.cyclesUsed)}`);
  if (d.kmUsed !== undefined) sets.push(`km_used=${safeNum(d.kmUsed)}`);
  if (d.lastMaintenanceDate !== undefined) sets.push(`last_maintenance_date=${safeDate(d.lastMaintenanceDate)}`);
  if (d.nextMaintenanceDate !== undefined) sets.push(`next_maintenance_date=${safeDate(d.nextMaintenanceDate)}`);
  if (d.imageUrl !== undefined) sets.push(`image_url=${s(d.imageUrl)}`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  if (d.weightKg !== undefined) sets.push(`weight_kg=${d.weightKg != null ? safeNum(d.weightKg) : "NULL"}`);
  if (d.dimensionsLength !== undefined) sets.push(`dimensions_length_mm=${d.dimensionsLength != null ? safeNum(d.dimensionsLength) : "NULL"}`);
  if (d.dimensionsWidth !== undefined) sets.push(`dimensions_width_mm=${d.dimensionsWidth != null ? safeNum(d.dimensionsWidth) : "NULL"}`);
  if (d.dimensionsHeight !== undefined) sets.push(`dimensions_height_mm=${d.dimensionsHeight != null ? safeNum(d.dimensionsHeight) : "NULL"}`);
  if (d.powerRatingKw !== undefined) sets.push(`power_rating_kw=${d.powerRatingKw != null ? safeNum(d.powerRatingKw) : "NULL"}`);
  if (d.voltageV !== undefined) sets.push(`voltage_v=${d.voltageV != null ? safeInt(d.voltageV) : "NULL"}`);
  if (d.operatingPressureBar !== undefined) sets.push(`operating_pressure_bar=${d.operatingPressureBar != null ? safeNum(d.operatingPressureBar) : "NULL"}`);
  if (d.operatingTempC !== undefined) sets.push(`operating_temp_c=${d.operatingTempC != null ? safeNum(d.operatingTempC) : "NULL"}`);
  if (d.capacity !== undefined) sets.push(`capacity=${s(d.capacity)}`);
  if (d.yearOfManufacture !== undefined) sets.push(`year_of_manufacture=${d.yearOfManufacture ? safeInt(d.yearOfManufacture) : "NULL"}`);
  if (d.countryOfOrigin !== undefined) sets.push(`country_of_origin=${s(d.countryOfOrigin)}`);
  if (d.warrantyProvider !== undefined) sets.push(`warranty_provider=${s(d.warrantyProvider)}`);
  if (d.warrantyTerms !== undefined) sets.push(`warranty_terms=${s(d.warrantyTerms)}`);
  if (d.warrantyStatus !== undefined) sets.push(`warranty_status='${safeEnum(d.warrantyStatus, new Set(["active","expired","none","unknown"]), "unknown")}'`);
  if (d.expectedUsefulLifeYears !== undefined) sets.push(`expected_useful_life_years=${d.expectedUsefulLifeYears ? safeInt(d.expectedUsefulLifeYears) : "NULL"}`);
  if (d.replacementCost !== undefined) sets.push(`replacement_cost=${safeNum(d.replacementCost)}`);
  if (d.salvageValue !== undefined) sets.push(`salvage_value=${safeNum(d.salvageValue)}`);
  if (d.acquisitionMethod !== undefined) sets.push(`acquisition_method=${s(d.acquisitionMethod)}`);
  if (d.downtimeCostPerHour !== undefined) sets.push(`downtime_cost_per_hour=${safeNum(d.downtimeCostPerHour)}`);
  if (d.mileageKm !== undefined) sets.push(`mileage_km=${safeNum(d.mileageKm)}`);
  if (d.fuelType !== undefined) sets.push(`fuel_type=${s(d.fuelType)}`);
  if (d.licensePlate !== undefined) sets.push(`license_plate=${s(d.licensePlate)}`);
  if (d.insuranceExpiry !== undefined) sets.push(`insurance_expiry=${safeDate(d.insuranceExpiry)}`);
  if (d.insurancePolicy !== undefined) sets.push(`insurance_policy=${s(d.insurancePolicy)}`);
  if (d.registrationExpiry !== undefined) sets.push(`registration_expiry=${safeDate(d.registrationExpiry)}`);
  if (d.parentEquipmentId !== undefined) sets.push(`parent_equipment_id=${d.parentEquipmentId ? safeInt(d.parentEquipmentId) : "NULL"}`);
  if (d.assetTag !== undefined) sets.push(`asset_tag=${s(d.assetTag)}`);
  if (d.responsiblePerson !== undefined) sets.push(`responsible_person=${s(d.responsiblePerson)}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE cmms_equipment SET ${sets.join(",")} WHERE id=${id}`);
  const row = await q(`SELECT * FROM cmms_equipment WHERE id=${id}`);
  res.json(row[0]);
});

router.delete("/cmms/equipment/:id", async (req: Request, res: Response) => {
  await init();
  const id = parseInt(String(req.params.id));
  await q(`DELETE FROM cmms_equipment WHERE id=${id}`);
  res.json({ success: true });
});

router.get("/cmms/pm-schedules", async (_req: Request, res: Response) => {
  await init();
  const rows = await q(`SELECT ps.*, e.name as equipment_name, e.equipment_number, e.location as equipment_location,
    e.hours_used as equipment_hours, e.cycles_used as equipment_cycles, e.km_used as equipment_km
    FROM cmms_pm_schedules ps
    LEFT JOIN cmms_equipment e ON e.id = ps.equipment_id
    ORDER BY ps.next_due ASC NULLS LAST`);
  res.json(rows);
});

router.post("/cmms/pm-schedules", async (req: Request, res: Response) => {
  await init();
  const d = req.body;
  const num = await nextNum("PM-", "cmms_pm_schedules", "schedule_number");
  const checklist = d.checklist ? `'${JSON.stringify(d.checklist).replace(/'/g, "''")}'` : "'[]'";
  const meterType = d.meterType && VALID_METER_TYPES.has(d.meterType) ? `'${d.meterType}'` : "NULL";
  await q(`INSERT INTO cmms_pm_schedules (schedule_number, equipment_id, title, description, frequency, frequency_days, frequency_hours, meter_type, meter_threshold, current_meter_reading, checklist, assigned_to, estimated_hours, last_executed, next_due, is_active, priority, notes)
    VALUES ('${num}', ${safeInt(d.equipmentId) || "NULL"}, ${s(d.title)}, ${s(d.description)}, '${safeEnum(d.frequency, VALID_FREQUENCIES, "monthly")}', ${safeInt(d.frequencyDays, 30)}, ${d.frequencyHours ? safeInt(d.frequencyHours) : "NULL"}, ${meterType}, ${d.meterThreshold ? safeNum(d.meterThreshold) : "NULL"}, ${safeNum(d.currentMeterReading)}, ${checklist}, ${s(d.assignedTo)}, ${safeNum(d.estimatedHours, 1)}, ${safeDate(d.lastExecuted)}, ${safeDate(d.nextDue) !== "NULL" ? safeDate(d.nextDue) : "CURRENT_DATE + INTERVAL '30 days'"}, ${d.isActive !== false}, '${safeEnum(d.priority, VALID_PRIORITIES, "medium")}', ${s(d.notes)})`);
  const row = await q(`SELECT ps.*, e.name as equipment_name FROM cmms_pm_schedules ps LEFT JOIN cmms_equipment e ON e.id=ps.equipment_id WHERE ps.schedule_number='${num}'`);
  res.json(row[0]);
});

router.put("/cmms/pm-schedules/:id", async (req: Request, res: Response) => {
  await init();
  const id = parseInt(String(req.params.id));
  const d = req.body;
  const sets: string[] = [];
  if (d.title !== undefined) sets.push(`title=${s(d.title)}`);
  if (d.description !== undefined) sets.push(`description=${s(d.description)}`);
  if (d.equipmentId !== undefined) sets.push(`equipment_id=${safeInt(d.equipmentId) || "NULL"}`);
  if (d.frequency !== undefined) sets.push(`frequency='${safeEnum(d.frequency, VALID_FREQUENCIES, "monthly")}'`);
  if (d.frequencyDays !== undefined) sets.push(`frequency_days=${safeInt(d.frequencyDays, 30)}`);
  if (d.frequencyHours !== undefined) sets.push(`frequency_hours=${d.frequencyHours ? safeInt(d.frequencyHours) : "NULL"}`);
  if (d.meterType !== undefined) sets.push(`meter_type=${d.meterType && VALID_METER_TYPES.has(d.meterType) ? `'${d.meterType}'` : "NULL"}`);
  if (d.meterThreshold !== undefined) sets.push(`meter_threshold=${d.meterThreshold ? safeNum(d.meterThreshold) : "NULL"}`);
  if (d.currentMeterReading !== undefined) sets.push(`current_meter_reading=${safeNum(d.currentMeterReading)}`);
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
  res.json(row[0]);
});

router.delete("/cmms/pm-schedules/:id", async (req: Request, res: Response) => {
  await init();
  await q(`DELETE FROM cmms_pm_schedules WHERE id=${parseInt(String(req.params.id))}`);
  res.json({ success: true });
});

router.post("/cmms/pm-schedules/check-meter", async (_req: Request, res: Response) => {
  await init();
  const dueSchedules = await q(`
    SELECT ps.id, ps.schedule_number, ps.equipment_id, ps.title, ps.assigned_to,
      ps.meter_type, ps.meter_threshold, ps.current_meter_reading, ps.last_meter_at_pm,
      e.name as equipment_name, e.hours_used, e.cycles_used, e.km_used
    FROM cmms_pm_schedules ps
    JOIN cmms_equipment e ON e.id = ps.equipment_id
    WHERE ps.is_active = true AND ps.meter_type IS NOT NULL AND ps.meter_threshold IS NOT NULL
  `);

  const generated: Record<string, unknown>[] = [];
  for (const sched of dueSchedules) {
    const mType = String(sched.meter_type);
    const threshold = Number(sched.meter_threshold);
    const lastPmReading = Number(sched.last_meter_at_pm || 0);
    let currentReading = 0;
    if (mType === "hours") currentReading = Number(sched.hours_used || 0);
    else if (mType === "cycles") currentReading = Number(sched.cycles_used || 0);
    else if (mType === "km") currentReading = Number(sched.km_used || 0);

    const readingSinceLastPm = currentReading - lastPmReading;
    if (readingSinceLastPm >= threshold) {
      const existingOpen = await q(`SELECT id FROM cmms_work_orders WHERE pm_schedule_id=${sched.id} AND status NOT IN ('completed','cancelled','closed') LIMIT 1`);
      if (existingOpen.length === 0) {
        const woNum = await nextNum("WO-", "cmms_work_orders", "wo_number");
        const meterLabel = mType === "hours" ? "שעות" : mType === "cycles" ? "מחזורים" : "ק\"מ";
        await q(`INSERT INTO cmms_work_orders (wo_number, equipment_id, pm_schedule_id, title, description, work_type, priority, status, assigned_to, checklist)
          VALUES ('${woNum}', ${sched.equipment_id}, ${sched.id}, ${s(`תחזוקה מונעת (מד) — ${sched.equipment_name}`)}, ${s(`נוצר אוטומטית: ${readingSinceLastPm.toFixed(0)} ${meterLabel} מאז תחזוקה אחרונה (סף: ${threshold} ${meterLabel})`)}, 'preventive', 'medium', 'open', ${s(sched.assigned_to)}, '[]')`);
        const wo = await q(`SELECT * FROM cmms_work_orders WHERE wo_number='${woNum}'`);
        generated.push(wo[0]);
      }
    }
  }

  res.json({ generated: generated.length, workOrders: generated });
});

router.get("/cmms/work-orders", async (req: Request, res: Response) => {
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
    ORDER BY CASE wo.status WHEN 'open' THEN 1 WHEN 'assigned' THEN 2 WHEN 'in_progress' THEN 3 WHEN 'waiting_parts' THEN 4 ELSE 5 END, wo.created_at DESC`);
  res.json(rows);
});

router.get("/cmms/work-orders/stats", async (_req: Request, res: Response) => {
  await init();
  const rows = await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status='open') as open_count,
    COUNT(*) FILTER (WHERE status='assigned') as assigned_count,
    COUNT(*) FILTER (WHERE status='in_progress') as in_progress,
    COUNT(*) FILTER (WHERE status='completed' OR status='closed') as completed,
    COUNT(*) FILTER (WHERE status='waiting_parts') as waiting_parts,
    COUNT(*) FILTER (WHERE priority='critical') as critical,
    COALESCE(SUM(total_cost) FILTER (WHERE completed_at >= DATE_TRUNC('month', CURRENT_DATE)), 0) as monthly_cost,
    COALESCE(AVG(downtime_hours) FILTER (WHERE status IN ('completed','closed')), 0) as avg_downtime,
    COALESCE(AVG(actual_hours) FILTER (WHERE status IN ('completed','closed')), 0) as avg_repair_time,
    COALESCE(SUM(downtime_hours), 0) as total_downtime,
    COUNT(*) FILTER (WHERE work_type='preventive') as preventive_count,
    COUNT(*) FILTER (WHERE work_type='corrective') as corrective_count
  FROM cmms_work_orders`);
  res.json(rows[0] || {});
});

router.post("/cmms/work-orders", async (req: Request, res: Response) => {
  await init();
  const d = req.body;
  const num = await nextNum("WO-", "cmms_work_orders", "wo_number");
  const checklist = d.checklist ? `'${JSON.stringify(d.checklist).replace(/'/g, "''")}'` : "'[]'";
  const partsConsumed = d.partsConsumed ? `'${JSON.stringify(d.partsConsumed).replace(/'/g, "''")}'` : "'[]'";
  const laborLogs = d.laborLogs ? `'${JSON.stringify(d.laborLogs).replace(/'/g, "''")}'` : "'[]'";
  await q(`INSERT INTO cmms_work_orders (wo_number, equipment_id, pm_schedule_id, title, description, work_type, priority, status, reported_by, assigned_to, failure_type, failure_description, checklist, parts_consumed, labor_logs, parts_cost, labor_cost, total_cost, estimated_hours, scheduled_date, notes)
    VALUES ('${num}', ${safeInt(d.equipmentId) || "NULL"}, ${safeInt(d.pmScheduleId) || "NULL"}, ${s(d.title)}, ${s(d.description)}, '${safeEnum(d.workType, VALID_WORK_TYPES, "corrective")}', '${safeEnum(d.priority, VALID_PRIORITIES, "medium")}', '${safeEnum(d.status, VALID_WO_STATUSES, "open")}', ${s(d.reportedBy)}, ${s(d.assignedTo)}, ${s(d.failureType)}, ${s(d.failureDescription)}, ${checklist}, ${partsConsumed}, ${laborLogs}, ${safeNum(d.partsCost)}, ${safeNum(d.laborCost)}, ${safeNum(d.totalCost)}, ${safeNum(d.estimatedHours)}, ${safeDate(d.scheduledDate)}, ${s(d.notes)})`);
  const row = await q(`SELECT wo.*, e.name as equipment_name FROM cmms_work_orders wo LEFT JOIN cmms_equipment e ON e.id=wo.equipment_id WHERE wo.wo_number='${num}'`);
  res.json(row[0]);
});

router.put("/cmms/work-orders/:id", async (req: Request, res: Response) => {
  await init();
  const id = parseInt(String(req.params.id));
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
    if (safeStatus === "assigned") sets.push(`assigned_at=COALESCE(assigned_at, NOW())`);
    if (safeStatus === "in_progress") sets.push(`started_at=COALESCE(started_at, NOW())`);
    if (safeStatus === "waiting_parts") sets.push(`waiting_parts_at=COALESCE(waiting_parts_at, NOW())`);
    if (safeStatus === "completed") sets.push(`completed_at=COALESCE(completed_at, NOW())`);
    if (safeStatus === "closed") sets.push(`closed_at=COALESCE(closed_at, NOW())`);
  }
  if (d.assignedTo !== undefined) sets.push(`assigned_to=${s(d.assignedTo)}`);
  if (d.failureType !== undefined) sets.push(`failure_type=${s(d.failureType)}`);
  if (d.failureDescription !== undefined) sets.push(`failure_description=${s(d.failureDescription)}`);
  if (d.solution !== undefined) sets.push(`solution=${s(d.solution)}`);
  if (d.checklist !== undefined) sets.push(`checklist='${JSON.stringify(d.checklist).replace(/'/g, "''")}'`);
  if (d.partsConsumed !== undefined) sets.push(`parts_consumed='${JSON.stringify(d.partsConsumed).replace(/'/g, "''")}'`);
  if (d.laborLogs !== undefined) sets.push(`labor_logs='${JSON.stringify(d.laborLogs).replace(/'/g, "''")}'`);
  if (d.partsCost !== undefined) sets.push(`parts_cost=${safeNum(d.partsCost)}`);
  if (d.laborCost !== undefined) sets.push(`labor_cost=${safeNum(d.laborCost)}`);
  if (d.totalCost !== undefined) sets.push(`total_cost=${safeNum(d.totalCost)}`);
  if (d.actualHours !== undefined) sets.push(`actual_hours=${safeNum(d.actualHours)}`);
  if (d.downtimeHours !== undefined) sets.push(`downtime_hours=${safeNum(d.downtimeHours)}`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE cmms_work_orders SET ${sets.join(",")} WHERE id=${id}`);
  const row = await q(`SELECT wo.*, e.name as equipment_name FROM cmms_work_orders wo LEFT JOIN cmms_equipment e ON e.id=wo.equipment_id WHERE wo.id=${id}`);
  res.json(row[0]);
});

router.delete("/cmms/work-orders/:id", async (req: Request, res: Response) => {
  await init();
  await q(`DELETE FROM cmms_work_orders WHERE id=${parseInt(String(req.params.id))}`);
  res.json({ success: true });
});

router.get("/cmms/equipment/:id/children", async (req: Request, res: Response) => {
  await init();
  const id = parseInt(String(req.params.id));
  const rows = await q(`SELECT e.*, 
    (SELECT COUNT(*) FROM cmms_equipment c WHERE c.parent_equipment_id = e.id) as child_count
    FROM cmms_equipment e WHERE e.parent_equipment_id=${id} ORDER BY e.name ASC`);
  res.json(rows);
});

router.get("/cmms/equipment/:id/tco", async (req: Request, res: Response) => {
  await init();
  const id = parseInt(String(req.params.id));
  const eq = await q(`SELECT * FROM cmms_equipment WHERE id=${id}`);
  if (!eq[0]) return res.status(404).json({ error: "Equipment not found" });
  const e = eq[0] as Record<string, unknown>;

  const purchaseCost = Number(e.purchase_cost || 0);
  const replacementCost = Number(e.replacement_cost || purchaseCost * 1.2);
  const salvageValue = Number(e.salvage_value || 0);
  const downtimeCostPerHour = Number(e.downtime_cost_per_hour || 500);
  const expectedLifeYears = Number(e.expected_useful_life_years || 10);

  const woCosts = await q(`SELECT 
    COALESCE(SUM(total_cost), 0) as total_maintenance_cost,
    COALESCE(SUM(parts_cost), 0) as total_parts_cost,
    COALESCE(SUM(labor_cost), 0) as total_labor_cost,
    COALESCE(SUM(downtime_hours), 0) as total_downtime_hours,
    COUNT(*) as total_work_orders,
    COUNT(*) FILTER (WHERE work_type='corrective') as corrective_count
    FROM cmms_work_orders WHERE equipment_id=${id}`);

  const wo = woCosts[0] as Record<string, unknown>;
  const totalMaintenanceCost = Number(wo.total_maintenance_cost || 0);
  const totalDowntimeHours = Number(wo.total_downtime_hours || 0);
  const totalDowntimeCost = totalDowntimeHours * downtimeCostPerHour;

  const childCosts = await q(`SELECT COALESCE(SUM(wo.total_cost), 0) as child_maintenance_cost
    FROM cmms_work_orders wo
    JOIN cmms_equipment c ON c.id = wo.equipment_id
    WHERE c.parent_equipment_id=${id}`);
  const childMaintenanceCost = Number((childCosts[0] as Record<string, unknown>)?.child_maintenance_cost || 0);

  const tco = purchaseCost + totalMaintenanceCost + totalDowntimeCost + childMaintenanceCost;

  const purchaseDate = e.purchase_date ? new Date(String(e.purchase_date)) : null;
  const ageYears = purchaseDate ? (Date.now() - purchaseDate.getTime()) / (365.25 * 86400000) : 0;
  const remainingLifeYears = Math.max(0, expectedLifeYears - ageYears);
  const maintenanceCostRatio = replacementCost > 0 ? (totalMaintenanceCost / replacementCost) * 100 : 0;

  const settingsRows = await q(`SELECT key, value FROM cmms_settings WHERE key IN ('replace_threshold_pct','evaluate_threshold_pct')`);
  const settingsMap: Record<string, number> = { replace_threshold_pct: 75, evaluate_threshold_pct: 50 };
  for (const sr of settingsRows) {
    const row = sr as Record<string, unknown>;
    if (row.key && row.value) settingsMap[String(row.key)] = Number(row.value);
  }
  const replaceThreshold = settingsMap["replace_threshold_pct"];
  const evaluateThreshold = settingsMap["evaluate_threshold_pct"];

  let recommendation = "ok";
  let recommendationText = "הנכס במצב תקין — המשך שימוש";
  if (maintenanceCostRatio >= replaceThreshold) {
    recommendation = "replace";
    recommendationText = "מומלץ להחליף — עלויות תחזוקה גבוהות מאוד";
  } else if (maintenanceCostRatio >= evaluateThreshold) {
    recommendation = "evaluate";
    recommendationText = "מומלץ לשקול החלפה — עלויות תחזוקה גבוהות";
  } else if (remainingLifeYears < 1) {
    recommendation = "evaluate";
    recommendationText = "גיל מתקרב לסוף חיים תכנוניים";
  }

  const monthlyCostTrend = await q(`SELECT 
    TO_CHAR(DATE_TRUNC('month', completed_at), 'YYYY-MM') as month,
    COALESCE(SUM(total_cost), 0) as maintenance_cost,
    COALESCE(SUM(downtime_hours) * ${downtimeCostPerHour}, 0) as downtime_cost,
    COUNT(*) as work_orders
    FROM cmms_work_orders 
    WHERE equipment_id=${id} AND completed_at IS NOT NULL AND completed_at >= CURRENT_DATE - INTERVAL '24 months'
    GROUP BY DATE_TRUNC('month', completed_at) ORDER BY month ASC`);

  res.json({
    equipment: e,
    tco,
    purchaseCost,
    totalMaintenanceCost,
    totalPartsCost: Number(wo.total_parts_cost || 0),
    totalLaborCost: Number(wo.total_labor_cost || 0),
    totalDowntimeCost,
    totalDowntimeHours,
    childMaintenanceCost,
    replacementCost,
    salvageValue,
    ageYears: parseFloat(ageYears.toFixed(1)),
    remainingLifeYears: parseFloat(remainingLifeYears.toFixed(1)),
    expectedLifeYears,
    maintenanceCostRatio: parseFloat(maintenanceCostRatio.toFixed(1)),
    recommendation,
    recommendationText,
    totalWorkOrders: Number(wo.total_work_orders || 0),
    correctiveCount: Number(wo.corrective_count || 0),
    monthlyCostTrend,
  });
});

router.get("/cmms/equipment/:id/qr", async (req: Request, res: Response) => {
  await init();
  const id = parseInt(String(req.params.id));
  const eq = await q(`SELECT id, equipment_number, name, qr_code FROM cmms_equipment WHERE id=${id}`);
  if (!eq[0]) return res.status(404).json({ error: "Equipment not found" });
  res.json(eq[0]);
});

router.get("/cmms/settings", async (_req: Request, res: Response) => {
  await init();
  const rows = await q(`SELECT key, value, label, description FROM cmms_settings ORDER BY key`);
  const settings: Record<string, unknown> = {};
  for (const r of rows) {
    const row = r as Record<string, unknown>;
    settings[String(row.key)] = { value: row.value, label: row.label, description: row.description };
  }
  res.json(settings);
});

router.put("/cmms/settings", async (req: Request, res: Response) => {
  await init();
  const updates = req.body as Record<string, unknown>;
  for (const [key, val] of Object.entries(updates)) {
    const safeKey = key.replace(/[^a-z0-9_]/g, "");
    if (!safeKey) continue;
    await q(`UPDATE cmms_settings SET value=${s(String(val))}, updated_at=NOW() WHERE key='${safeKey}'`);
  }
  const rows = await q(`SELECT key, value, label, description FROM cmms_settings ORDER BY key`);
  const settings: Record<string, unknown> = {};
  for (const r of rows) {
    const row = r as Record<string, unknown>;
    settings[String(row.key)] = { value: row.value, label: row.label, description: row.description };
  }
  res.json(settings);
});

router.get("/cmms/downtime-events", async (req: Request, res: Response) => {
  await init();
  const equipmentId = req.query.equipmentId as string | undefined;
  const where = equipmentId ? `WHERE de.equipment_id=${safeInt(equipmentId)}` : "";
  const rows = await q(`SELECT de.*, e.name as equipment_name, e.equipment_number, wo.wo_number
    FROM cmms_downtime_events de
    LEFT JOIN cmms_equipment e ON e.id = de.equipment_id
    LEFT JOIN cmms_work_orders wo ON wo.id = de.work_order_id
    ${where}
    ORDER BY de.start_time DESC`);
  res.json(rows);
});

router.get("/cmms/downtime-events/stats", async (_req: Request, res: Response) => {
  await init();
  const rows = await q(`SELECT
    COUNT(*) as total_events,
    COALESCE(SUM(duration_minutes), 0) as total_minutes,
    COALESCE(AVG(duration_minutes), 0) as avg_duration,
    COUNT(*) FILTER (WHERE reason_category='mechanical') as mechanical,
    COUNT(*) FILTER (WHERE reason_category='electrical') as electrical,
    COUNT(*) FILTER (WHERE reason_category='planned') as planned,
    COUNT(*) FILTER (WHERE reason_category='operator_error') as operator_error,
    COUNT(*) FILTER (WHERE DATE_TRUNC('month', start_time) = DATE_TRUNC('month', NOW())) as this_month
  FROM cmms_downtime_events`);
  res.json(rows[0] || {});
});

router.get("/cmms/downtime-events/oee", async (req: Request, res: Response) => {
  await init();
  const equipmentId = req.query.equipmentId as string | undefined;
  const months = safeInt(req.query.months as string, 3);
  const eqFilter = equipmentId ? `AND de.equipment_id=${safeInt(equipmentId)}` : "";
  const rows = await q(`SELECT
    TO_CHAR(DATE_TRUNC('month', de.start_time), 'YYYY-MM') as month,
    e.name as equipment_name,
    COALESCE(SUM(de.duration_minutes), 0) as total_downtime_minutes,
    COUNT(de.id) as event_count
  FROM cmms_downtime_events de
  LEFT JOIN cmms_equipment e ON e.id = de.equipment_id
  WHERE de.start_time >= DATE_TRUNC('month', NOW()) - INTERVAL '${months} months' ${eqFilter}
  GROUP BY DATE_TRUNC('month', de.start_time), e.name
  ORDER BY month ASC, e.name ASC`);

  const totalHoursPerMonth = 720;
  const oeeData = rows.map(r => ({
    ...r,
    available_hours: totalHoursPerMonth,
    downtime_hours: Number(r.total_downtime_minutes || 0) / 60,
    availability: Math.max(0, ((totalHoursPerMonth - Number(r.total_downtime_minutes || 0) / 60) / totalHoursPerMonth) * 100).toFixed(1),
  }));

  res.json(oeeData);
});

router.post("/cmms/downtime-events", async (req: Request, res: Response) => {
  await init();
  const d = req.body;
  const num = await nextNum("DT-", "cmms_downtime_events", "event_number");

  let durationMinutes = "NULL";
  if (d.startTime && d.endTime) {
    const start = new Date(d.startTime);
    const end = new Date(d.endTime);
    if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end > start) {
      durationMinutes = String(((end.getTime() - start.getTime()) / 60000).toFixed(1));
    }
  } else if (d.durationMinutes) {
    durationMinutes = String(safeNum(d.durationMinutes));
  }

  await q(`INSERT INTO cmms_downtime_events (event_number, equipment_id, work_order_id, start_time, end_time, duration_minutes, reason_category, reason_detail, production_impact, units_lost, shift, reported_by, notes)
    VALUES ('${num}', ${safeInt(d.equipmentId) || "NULL"}, ${safeInt(d.workOrderId) || "NULL"}, ${safeDatetime(d.startTime)}, ${safeDatetime(d.endTime)}, ${durationMinutes}, '${safeEnum(d.reasonCategory, VALID_DOWNTIME_REASONS, "other")}', ${s(d.reasonDetail)}, ${s(d.productionImpact)}, ${safeInt(d.unitsLost)}, ${s(d.shift)}, ${s(d.reportedBy)}, ${s(d.notes)})`);
  const row = await q(`SELECT de.*, e.name as equipment_name FROM cmms_downtime_events de LEFT JOIN cmms_equipment e ON e.id=de.equipment_id WHERE de.event_number='${num}'`);
  res.json(row[0]);
});

router.put("/cmms/downtime-events/:id", async (req: Request, res: Response) => {
  await init();
  const id = parseInt(String(req.params.id));
  const d = req.body;
  const sets: string[] = [];
  if (d.equipmentId !== undefined) sets.push(`equipment_id=${safeInt(d.equipmentId) || "NULL"}`);
  if (d.workOrderId !== undefined) sets.push(`work_order_id=${safeInt(d.workOrderId) || "NULL"}`);
  if (d.startTime !== undefined) sets.push(`start_time=${safeDatetime(d.startTime)}`);
  if (d.endTime !== undefined) sets.push(`end_time=${safeDatetime(d.endTime)}`);
  if (d.durationMinutes !== undefined) sets.push(`duration_minutes=${safeNum(d.durationMinutes)}`);
  if (d.reasonCategory !== undefined) sets.push(`reason_category='${safeEnum(d.reasonCategory, VALID_DOWNTIME_REASONS, "other")}'`);
  if (d.reasonDetail !== undefined) sets.push(`reason_detail=${s(d.reasonDetail)}`);
  if (d.productionImpact !== undefined) sets.push(`production_impact=${s(d.productionImpact)}`);
  if (d.unitsLost !== undefined) sets.push(`units_lost=${safeInt(d.unitsLost)}`);
  if (d.shift !== undefined) sets.push(`shift=${s(d.shift)}`);
  if (d.reportedBy !== undefined) sets.push(`reported_by=${s(d.reportedBy)}`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  if (d.startTime && d.endTime) {
    const start = new Date(d.startTime);
    const end = new Date(d.endTime);
    if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end > start) {
      sets.push(`duration_minutes=${((end.getTime() - start.getTime()) / 60000).toFixed(1)}`);
    }
  }
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE cmms_downtime_events SET ${sets.join(",")} WHERE id=${id}`);
  const row = await q(`SELECT de.*, e.name as equipment_name FROM cmms_downtime_events de LEFT JOIN cmms_equipment e ON e.id=de.equipment_id WHERE de.id=${id}`);
  res.json(row[0]);
});

router.delete("/cmms/downtime-events/:id", async (req: Request, res: Response) => {
  await init();
  await q(`DELETE FROM cmms_downtime_events WHERE id=${parseInt(String(req.params.id))}`);
  res.json({ success: true });
});

router.get("/cmms/maintenance-requests", async (_req: Request, res: Response) => {
  await init();
  const rows = await q(`SELECT mr.*, e.name as equipment_name, e.equipment_number, e.department as equipment_department
    FROM cmms_maintenance_requests mr
    LEFT JOIN cmms_equipment e ON e.id = mr.equipment_id
    ORDER BY CASE mr.urgency WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, mr.created_at DESC`);
  res.json(rows);
});

router.post("/cmms/maintenance-requests", async (req: Request, res: Response) => {
  await init();
  const d = req.body;
  const num = await nextNum("REQ-", "cmms_maintenance_requests", "request_number");

  let assignedTo = d.assignedTo || null;
  if (!assignedTo && d.equipmentId) {
    const pmSchedules = await q(`SELECT assigned_to FROM cmms_pm_schedules WHERE equipment_id=${safeInt(d.equipmentId)} AND is_active=true ORDER BY id DESC LIMIT 1`);
    if (pmSchedules[0]?.assigned_to) assignedTo = pmSchedules[0].assigned_to;
  }

  await q(`INSERT INTO cmms_maintenance_requests (request_number, equipment_id, title, description, urgency, status, requested_by, department, assigned_to, photo_url, notes)
    VALUES ('${num}', ${safeInt(d.equipmentId) || "NULL"}, ${s(d.title)}, ${s(d.description)}, '${safeEnum(d.urgency, VALID_URGENCIES, "medium")}', 'pending', ${s(d.requestedBy)}, ${s(d.department)}, ${s(assignedTo)}, ${s(d.photoUrl)}, ${s(d.notes)})`);
  const row = await q(`SELECT mr.*, e.name as equipment_name FROM cmms_maintenance_requests mr LEFT JOIN cmms_equipment e ON e.id=mr.equipment_id WHERE mr.request_number='${num}'`);
  res.json(row[0]);
});

router.put("/cmms/maintenance-requests/:id", async (req: Request, res: Response) => {
  await init();
  const id = parseInt(String(req.params.id));
  const d = req.body;
  const sets: string[] = [];
  if (d.status !== undefined) sets.push(`status='${safeEnum(d.status, VALID_REQUEST_STATUSES, "pending")}'`);
  if (d.assignedTo !== undefined) sets.push(`assigned_to=${s(d.assignedTo)}`);
  if (d.workOrderId !== undefined) sets.push(`work_order_id=${safeInt(d.workOrderId) || "NULL"}`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  if (d.urgency !== undefined) sets.push(`urgency='${safeEnum(d.urgency, VALID_URGENCIES, "medium")}'`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE cmms_maintenance_requests SET ${sets.join(",")} WHERE id=${id}`);
  const row = await q(`SELECT mr.*, e.name as equipment_name FROM cmms_maintenance_requests mr LEFT JOIN cmms_equipment e ON e.id=mr.equipment_id WHERE mr.id=${id}`);
  res.json(row[0]);
});

router.delete("/cmms/maintenance-requests/:id", async (req: Request, res: Response) => {
  await init();
  await q(`DELETE FROM cmms_maintenance_requests WHERE id=${parseInt(String(req.params.id))}`);
  res.json({ success: true });
});

router.get("/cmms/kpi", async (_req: Request, res: Response) => {
  await init();

  const mtbfPerEq = await q(`WITH failures AS (
    SELECT equipment_id, COUNT(*) as failure_count,
      MIN(created_at) as first_failure, MAX(created_at) as last_failure,
      COALESCE(AVG(actual_hours), 0) as avg_repair_time,
      COALESCE(SUM(total_cost), 0) as total_cost
    FROM cmms_work_orders
    WHERE work_type='corrective' AND equipment_id IS NOT NULL
    GROUP BY equipment_id HAVING COUNT(*) > 0
  )
  SELECT e.name, e.equipment_number, e.criticality, f.failure_count, f.total_cost,
    CASE WHEN f.failure_count > 1 THEN
      EXTRACT(EPOCH FROM (f.last_failure - f.first_failure)) / 3600.0 / GREATEST(f.failure_count - 1, 1)
    ELSE NULL END as mtbf_hours,
    f.avg_repair_time as mttr_hours
  FROM failures f JOIN cmms_equipment e ON e.id = f.equipment_id
  ORDER BY f.failure_count DESC LIMIT 15`);

  const plannedVsUnplanned = await q(`SELECT
    COUNT(*) FILTER (WHERE work_type='preventive') as planned,
    COUNT(*) FILTER (WHERE work_type='corrective') as unplanned,
    COUNT(*) FILTER (WHERE work_type='emergency') as emergency,
    COUNT(*) as total
  FROM cmms_work_orders`);

  const costPerAsset = await q(`SELECT e.name, e.equipment_number, e.criticality,
    COALESCE(SUM(wo.total_cost), 0) as total_maintenance_cost,
    COUNT(wo.id) as work_order_count,
    COALESCE(SUM(wo.downtime_hours), 0) as total_downtime
  FROM cmms_equipment e
  LEFT JOIN cmms_work_orders wo ON wo.equipment_id = e.id
  GROUP BY e.id, e.name, e.equipment_number, e.criticality
  ORDER BY total_maintenance_cost DESC LIMIT 15`);

  const oeeByMonth = await q(`SELECT
    TO_CHAR(DATE_TRUNC('month', start_time), 'YYYY-MM') as month,
    COALESCE(SUM(duration_minutes), 0) as total_downtime_minutes,
    COUNT(id) as event_count
  FROM cmms_downtime_events
  WHERE start_time >= NOW() - INTERVAL '12 months'
  GROUP BY DATE_TRUNC('month', start_time)
  ORDER BY month ASC`);

  const totalMonthHours = 720;
  const oeeData = oeeByMonth.map(r => ({
    month: r.month,
    total_downtime_hours: Number(r.total_downtime_minutes || 0) / 60,
    event_count: r.event_count,
    availability: Math.max(0, (1 - Number(r.total_downtime_minutes || 0) / 60 / totalMonthHours) * 100).toFixed(1),
  }));

  const topFailures = await q(`SELECT
    COALESCE(reason_category, 'other') as category,
    COUNT(*) as count,
    COALESCE(SUM(duration_minutes), 0) as total_minutes
  FROM cmms_downtime_events
  GROUP BY reason_category
  ORDER BY count DESC LIMIT 10`);

  const mttrByMonth = await q(`SELECT
    TO_CHAR(DATE_TRUNC('month', completed_at), 'YYYY-MM') as month,
    AVG(actual_hours) as avg_mttr,
    COUNT(*) as count
  FROM cmms_work_orders
  WHERE status IN ('completed','closed') AND actual_hours > 0 AND completed_at >= NOW() - INTERVAL '12 months'
  GROUP BY DATE_TRUNC('month', completed_at)
  ORDER BY month ASC`);

  res.json({
    mtbfPerEquipment: mtbfPerEq,
    plannedVsUnplanned: plannedVsUnplanned[0] || {},
    costPerAsset,
    oeeAvailabilityTrend: oeeData,
    topFailureCauses: topFailures,
    mttrByMonth,
  });
});

router.get("/cmms/dashboard", async (_req: Request, res: Response) => {
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
      COUNT(*) FILTER (WHERE status IN ('open','assigned','in_progress','waiting_parts')) as open_work_orders,
      COUNT(*) FILTER (WHERE priority='critical' AND status NOT IN ('completed','cancelled','closed')) as critical_open,
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
    FROM cmms_work_orders WHERE status IN ('completed','closed') AND actual_hours > 0`);

  const recentWo = await q(`SELECT wo.id, wo.wo_number, wo.title, wo.work_type, wo.priority, wo.status, wo.assigned_to, wo.created_at, e.name as equipment_name
    FROM cmms_work_orders wo LEFT JOIN cmms_equipment e ON e.id=wo.equipment_id
    WHERE wo.status NOT IN ('completed','cancelled','closed')
    ORDER BY CASE wo.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, wo.created_at DESC
    LIMIT 10`);

  const upcomingPm = await q(`SELECT ps.id, ps.schedule_number, ps.title, ps.frequency, ps.next_due, ps.assigned_to, ps.meter_type, ps.meter_threshold, e.name as equipment_name
    FROM cmms_pm_schedules ps LEFT JOIN cmms_equipment e ON e.id=ps.equipment_id
    WHERE ps.is_active=true AND ps.next_due IS NOT NULL AND ps.next_due <= CURRENT_DATE + INTERVAL '14 days'
    ORDER BY ps.next_due ASC LIMIT 10`);

  const downEquipment = await q(`SELECT id, equipment_number, name, location, department, status FROM cmms_equipment WHERE status IN ('down','maintenance') ORDER BY updated_at DESC LIMIT 10`);

  const todayWo = await q(`SELECT COUNT(*) as cnt FROM cmms_work_orders WHERE DATE(scheduled_date)=CURRENT_DATE OR (DATE(created_at)=CURRENT_DATE AND status NOT IN ('completed','cancelled','closed'))`);
  const thisWeekWo = await q(`SELECT COUNT(*) as cnt FROM cmms_work_orders WHERE (scheduled_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days') OR (created_at >= DATE_TRUNC('week', CURRENT_DATE) AND status NOT IN ('completed','cancelled','closed'))`);

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

  const recentDowntime = await q(`SELECT de.id, de.event_number, de.start_time, de.end_time, de.duration_minutes, de.reason_category, de.reason_detail, e.name as equipment_name
    FROM cmms_downtime_events de LEFT JOIN cmms_equipment e ON e.id=de.equipment_id
    ORDER BY de.start_time DESC LIMIT 5`);

  const pendingRequests = await q(`SELECT mr.id, mr.request_number, mr.title, mr.urgency, mr.status, mr.requested_by, mr.created_at, e.name as equipment_name
    FROM cmms_maintenance_requests mr LEFT JOIN cmms_equipment e ON e.id=mr.equipment_id
    WHERE mr.status IN ('pending','assigned')
    ORDER BY CASE mr.urgency WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, mr.created_at DESC
    LIMIT 5`);

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
    recentDowntime,
    pendingRequests,
  });
});

router.post("/cmms/seed", async (_req: Request, res: Response) => {
  await init();
  const existing = await q(`SELECT COUNT(*)::int as c FROM cmms_equipment`);
  if (Number((existing[0] as Record<string, unknown>)?.c || 0) > 0) {
    return res.json({ message: "Data already exists" });
  }

  type EqSeed = {
    name: string; category: string; manufacturer: string; model: string; serial: string;
    location: string; dept: string; line: string; cost: number; hours: number; criticality: string;
    weightKg?: number; powerKw?: number; voltage?: number; capacity?: string;
    life?: number; replacement?: number; downtime?: number;
    fuelType?: string; licensePlate?: string; mileageKm?: number; regExpiry?: string;
    warrantyProvider?: string; parentIdx?: number; assetTag?: string;
    status?: string;
  };

  const equipmentData: EqSeed[] = [
    { name: "מכונת CNC מספר 1 — HAAS VF-2SS", category: "CNC", manufacturer: "HAAS Automation", model: "VF-2SS", serial: "SN-CNC-001", location: "אולם A", dept: "חיתוך CNC", line: "קו 1", cost: 450000, hours: 12500, criticality: "critical", weightKg: 4500, powerKw: 22, voltage: 400, capacity: "נסיעה 762×406×508 מ\"מ", life: 15, replacement: 540000, downtime: 1500, warrantyProvider: "HAAS Israel", assetTag: "AT-CNC-001" },
    { name: "מכונת CNC מספר 2 — DMG NLX 2500", category: "CNC", manufacturer: "DMG MORI", model: "NLX 2500/700", serial: "SN-CNC-002", location: "אולם A", dept: "חיתוך CNC", line: "קו 1", cost: 620000, hours: 8900, criticality: "critical", weightKg: 7200, powerKw: 37, voltage: 400, capacity: "קוטר מחרטה 800 מ\"מ", life: 15, replacement: 750000, downtime: 1800, warrantyProvider: "DMG MORI Israel", assetTag: "AT-CNC-002" },
    { name: "מכבש הידראולי 200 טון", category: "כיפוף", manufacturer: "TRUMPF", model: "TruBend 5130", serial: "SN-PRE-001", location: "אולם B", dept: "כיפוף", line: "קו 2", cost: 380000, hours: 15200, criticality: "high", weightKg: 8500, powerKw: 18.5, voltage: 400, capacity: "אורך עבודה 3100 מ\"מ / 200 טון", life: 20, replacement: 460000, downtime: 1200 },
    { name: "מכונת ריתוך TIG אוטומטית", category: "ריתוך", manufacturer: "Lincoln Electric", model: "Aspect 375", serial: "SN-WLD-001", location: "אולם C", dept: "ריתוך", line: "קו 3", cost: 85000, hours: 6700, criticality: "medium", weightKg: 180, powerKw: 7.5, voltage: 380, capacity: "עד 375A", life: 10, replacement: 102000, downtime: 400 },
    { name: "מסור סרט אוטומטי", category: "חיתוך", manufacturer: "AMADA", model: "HFA-400W", serial: "SN-SAW-001", location: "אולם A", dept: "חיתוך", line: "קו 1", cost: 120000, hours: 18300, criticality: "medium", weightKg: 2800, powerKw: 5.5, capacity: "חיתוך עד ∅400 מ\"מ", life: 12, replacement: 145000, downtime: 600 },
    { name: "מכונת לייזר פייבר 6kW", category: "חיתוך לייזר", manufacturer: "TRUMPF", model: "TruLaser 3030 fiber", serial: "SN-LSR-001", location: "אולם A", dept: "חיתוך לייזר", line: "קו 1", cost: 1200000, hours: 4200, criticality: "critical", weightKg: 12000, powerKw: 60, voltage: 400, capacity: "שטח עבודה 3000×1500 מ\"מ / 6kW", life: 12, replacement: 1450000, downtime: 3000, warrantyProvider: "TRUMPF Israel", assetTag: "AT-LSR-001" },
    { name: "מגלגלת פח 3 מ'", category: "כיפוף", manufacturer: "Faccin", model: "4HEL 30/310", serial: "SN-ROL-001", location: "אולם B", dept: "כיפוף", line: "קו 2", cost: 210000, hours: 9800, criticality: "high", weightKg: 5500, powerKw: 15, capacity: "עובי עד 30 מ\"מ / רוחב 3100 מ\"מ", life: 20, replacement: 255000, downtime: 900 },
    { name: "קומפרסור תעשייתי Atlas Copco ראשי", category: "תשתית", manufacturer: "Atlas Copco", model: "GA 55+ VSD", serial: "SN-CMP-001", location: "חדר מכונות", dept: "תשתיות", line: "", cost: 95000, hours: 22000, criticality: "critical", weightKg: 680, powerKw: 55, voltage: 400, capacity: "250 מ\"ק/שעה / 10 בר", life: 15, replacement: 115000, downtime: 800 },
    { name: "מלטשת שטוחה CNC", category: "גימור", manufacturer: "JUNKER", model: "LEAN.GRIND 400", serial: "SN-GRD-001", location: "אולם C", dept: "גימור", line: "קו 4", cost: 175000, hours: 7600, criticality: "medium", weightKg: 3200, powerKw: 11, capacity: "300×150 מ\"מ", life: 15, replacement: 210000, downtime: 700 },
    { name: "עגורן גשר 10 טון — אולם A", category: "תשתית", manufacturer: "ABUS", model: "ZLK 10t/18m", serial: "SN-CRN-001", location: "אולם A", dept: "תשתיות", line: "", cost: 280000, hours: 11000, criticality: "high", weightKg: 8000, capacity: "10 טון / טווח 18 מ'", life: 25, replacement: 340000, downtime: 2000 },
    { name: "מכונת צביעה אלקטרוסטטית Gema", category: "ציפוי", manufacturer: "Gema", model: "OptiFlex 2 Pro", serial: "SN-PNT-001", location: "אולם D", dept: "ציפוי", line: "קו 5", cost: 320000, hours: 5400, criticality: "medium", weightKg: 1200, powerKw: 12, capacity: "כניסה עד 2500×1800 מ\"מ", life: 10, replacement: 385000, downtime: 1100 },
    { name: "תנור ייבוש תעשייתי Despatch", category: "ציפוי", manufacturer: "Despatch Industries", model: "LFD2-42-3E", serial: "SN-OVN-001", location: "אולם D", dept: "ציפוי", line: "קו 5", cost: 190000, hours: 8100, criticality: "high", weightKg: 2200, powerKw: 36, voltage: 400, capacity: "נפח 1200 ליטר / 250°C", life: 15, replacement: 230000, downtime: 900 },
    { name: "מכונת ריתוך רובוטי KUKA", category: "ריתוך", manufacturer: "KUKA Robotics", model: "KR 16-2 Arc HW", serial: "SN-ROB-001", location: "אולם C", dept: "ריתוך", line: "קו 3", cost: 550000, hours: 3800, criticality: "critical", weightKg: 360, powerKw: 25, capacity: "זרוע 1650 מ\"מ / עומס 16 ק\"ג", life: 12, replacement: 660000, downtime: 1400, warrantyProvider: "KUKA Israel", assetTag: "AT-ROB-001" },
    { name: "כרסומת CNC ב-5 צירים DMU 65", category: "CNC", manufacturer: "DMG MORI", model: "DMU 65 monoBLOCK", serial: "SN-DMU-001", location: "אולם A", dept: "עיבוד מדויק", line: "קו 1", cost: 980000, hours: 5600, criticality: "critical", weightKg: 15000, powerKw: 28, voltage: 400, capacity: "נסיעה 650×520×475 מ\"מ / 5 צירים", life: 15, replacement: 1180000, downtime: 2500, assetTag: "AT-5AX-001" },
    { name: "מחץ פנאומטי ניסן 15T", category: "חיתוך", manufacturer: "Nisshinbo", model: "NTP-150", serial: "SN-PUN-001", location: "אולם B", dept: "ניקוב", line: "קו 2", cost: 145000, hours: 19500, criticality: "medium", weightKg: 2100, powerKw: 7.5, capacity: "15 טון / 4 מ\"מ פלדה", life: 18, replacement: 175000, downtime: 500 },
    { name: "מסגרת הרכבה — תא ריתוך מבנים", category: "ריתוך", manufacturer: "פנים", model: "מותאם אישית", serial: "SN-JIG-001", location: "אולם C", dept: "ריתוך", line: "קו 3", cost: 42000, hours: 7800, criticality: "low", capacity: "שולחן 3000×1500 מ\"מ", life: 20, replacement: 50000, downtime: 100 },
    { name: "מחרטה קונבנציונלית Colchester", category: "מחרטה", manufacturer: "Colchester", model: "Master 2500", serial: "SN-LTH-001", location: "אולם A", dept: "עיבוד מדויק", line: "קו 1", cost: 68000, hours: 14200, criticality: "low", weightKg: 1850, powerKw: 5.5, capacity: "∅500 × L1500 מ\"מ", life: 25, replacement: 82000, downtime: 200 },
    { name: "רכב מלגזה 5 טון — Toyota", category: "רכב", manufacturer: "Toyota", model: "7FBH50", serial: "SN-FLT-001", location: "מחסן ראשי", dept: "לוגיסטיקה", line: "", cost: 180000, hours: 8500, criticality: "high", weightKg: 4800, capacity: "5 טון / גובה הרמה 6 מ'", life: 12, replacement: 215000, downtime: 1000, fuelType: "חשמלי", mileageKm: 42000, licensePlate: "12-345-67", regExpiry: "2026-08-31" },
    { name: "מנוף מוביל Manitou MT 625H", category: "רכב", manufacturer: "Manitou", model: "MT 625H", serial: "SN-TLP-001", location: "חצר מפעל", dept: "לוגיסטיקה", line: "", cost: 320000, hours: 4200, criticality: "high", weightKg: 7600, capacity: "2.5 טון / טווח 6 מ'", life: 15, replacement: 385000, downtime: 800, fuelType: "דיזל", mileageKm: 18500, licensePlate: "34-567-89", regExpiry: "2026-11-30" },
    { name: "משאית הובלה Iveco Eurocargo", category: "רכב", manufacturer: "Iveco", model: "Eurocargo 140E28", serial: "SN-TRK-001", location: "חצר מפעל", dept: "לוגיסטיקה", line: "", cost: 420000, hours: 6800, criticality: "medium", weightKg: 14000, capacity: "10 טון / גרמא עד 300 ק\"מ", life: 10, replacement: 505000, downtime: 1200, fuelType: "דיזל", mileageKm: 125000, licensePlate: "56-789-01", regExpiry: "2027-01-31" },
    { name: "רכב שטח קיה סורנטו — ניהול", category: "רכב", manufacturer: "Kia", model: "Sorento 2.2 CRDi", serial: "SN-SUV-001", location: "חניון משרדים", dept: "הנהלה", line: "", cost: 185000, hours: 3200, criticality: "low", weightKg: 2100, capacity: "7 מקומות ישיבה", life: 7, replacement: 222000, downtime: 100, fuelType: "דיזל", mileageKm: 62000, licensePlate: "78-901-23", regExpiry: "2026-05-31" },
    { name: "מחסן ביניים — מבנה פלדה", category: "תשתית", manufacturer: "פנים", model: "מבנה ייצור מקומי", serial: "SN-BLD-001", location: "חצר מפעל", dept: "תשתיות", line: "", cost: 850000, hours: 0, criticality: "medium", weightKg: 45000, capacity: "שטח 600 מ\"ר", life: 40, replacement: 1020000, downtime: 0 },
    { name: "מערכת חשמל ראשית — לוח 630A", category: "תשתית", manufacturer: "Schneider Electric", model: "Prisma G 630A", serial: "SN-ELC-001", location: "חדר חשמל", dept: "תשתיות", line: "", cost: 145000, hours: 0, criticality: "critical", powerKw: 400, voltage: 400, capacity: "630A / 400V / 3 פאזה", life: 20, replacement: 175000, downtime: 5000 },
    { name: "מערכת ספרינקלרים — אולמות ייצור", category: "תשתית", manufacturer: "Viking Group", model: "ELO sidewall", serial: "SN-SPK-001", location: "כל האולמות", dept: "בטיחות", line: "", cost: 220000, hours: 0, criticality: "high", life: 25, replacement: 265000, downtime: 3000 },
  ];

  const insertedIds: number[] = [];
  for (let i = 0; i < equipmentData.length; i++) {
    const eq = equipmentData[i];
    const num = await nextNum("EQ-", "cmms_equipment", "equipment_number");
    const qrCode = `CMMS:${num}`;
    const yearsAgo = 1 + Math.random() * 6;
    const pd = new Date(Date.now() - yearsAgo * 365 * 86400000).toISOString().slice(0, 10);
    const we = new Date(Date.now() + (Math.random() < 0.4 ? -1 : 1) * Math.random() * 365 * 2 * 86400000).toISOString().slice(0, 10);
    const lm = new Date(Date.now() - Math.random() * 90 * 86400000).toISOString().slice(0, 10);
    const nm = new Date(Date.now() + Math.random() * 45 * 86400000).toISOString().slice(0, 10);
    const cycles = Math.floor(Math.random() * 50000);
    const wstatus = Math.random() < 0.12 ? (Math.random() < 0.5 ? "maintenance" : "down") : "active";
    const warrantyActive = new Date(we) > new Date() ? "active" : "expired";

    const row = await q(`INSERT INTO cmms_equipment (equipment_number, name, category, manufacturer, model, serial_number, location, department, production_line, status, purchase_date, purchase_cost, warranty_expiry, criticality, hours_used, cycles_used, last_maintenance_date, next_maintenance_date, qr_code, asset_tag, weight_kg, power_rating_kw, voltage_v, capacity, expected_useful_life_years, replacement_cost, downtime_cost_per_hour, warranty_provider, warranty_status, fuel_type, license_plate, mileage_km, registration_expiry)
      VALUES ('${num}', ${s(eq.name)}, ${s(eq.category)}, ${s(eq.manufacturer)}, ${s(eq.model)}, ${s(eq.serial)}, ${s(eq.location)}, ${s(eq.dept)}, ${s(eq.line)}, '${eq.status || wstatus}', '${pd}', ${eq.cost}, '${we}', '${eq.criticality}', ${eq.hours}, ${cycles}, '${lm}', '${nm}', ${s(qrCode)}, ${s(eq.assetTag || "")}, ${eq.weightKg != null ? eq.weightKg : "NULL"}, ${eq.powerKw != null ? eq.powerKw : "NULL"}, ${eq.voltage != null ? eq.voltage : "NULL"}, ${s(eq.capacity || "")}, ${eq.life || 10}, ${eq.replacement || Math.round(eq.cost * 1.2)}, ${eq.downtime || 500}, ${s(eq.warrantyProvider || "")}, '${warrantyActive}', ${s(eq.fuelType || "")}, ${s(eq.licensePlate || "")}, ${eq.mileageKm || 0}, ${eq.regExpiry ? `'${eq.regExpiry}'` : "NULL"})
      RETURNING id`);
    insertedIds.push(Number((row[0] as Record<string, unknown>)?.id || 0));
  }

  const cncIdx = 0;
  const laserIdx = 5;
  if (insertedIds[cncIdx] && insertedIds[cncIdx + 2]) {
    await q(`INSERT INTO cmms_equipment (equipment_number, name, category, manufacturer, model, serial_number, location, department, criticality, status, purchase_cost, expected_useful_life_years, replacement_cost, downtime_cost_per_hour, qr_code, parent_equipment_id)
      VALUES ('${await nextNum("EQ-", "cmms_equipment", "equipment_number")}', 'מחסנית כלים אוטומטית — CNC 1', 'רכיב', 'HAAS', 'ATC-24', 'SN-ATC-001', 'אולם A', 'חיתוך CNC', 'medium', 'active', 28000, 8, 33600, 1500, ${s("CMMS:" + "EQ-CHILD-001")}, ${insertedIds[cncIdx]}) RETURNING id`);
    await q(`INSERT INTO cmms_equipment (equipment_number, name, category, manufacturer, model, serial_number, location, department, criticality, status, purchase_cost, expected_useful_life_years, replacement_cost, downtime_cost_per_hour, qr_code, parent_equipment_id)
      VALUES ('${await nextNum("EQ-", "cmms_equipment", "equipment_number")}', 'ציר סיבוב רביעי — CNC 1', 'רכיב', 'HAAS', 'HRT210', 'SN-4TH-001', 'אולם A', 'חיתוך CNC', 'high', 'active', 45000, 10, 54000, 1500, ${s("CMMS:EQ-CHILD-002")}, ${insertedIds[cncIdx]}) RETURNING id`);
    await q(`INSERT INTO cmms_equipment (equipment_number, name, category, manufacturer, model, serial_number, location, department, criticality, status, purchase_cost, expected_useful_life_years, replacement_cost, downtime_cost_per_hour, qr_code, parent_equipment_id)
      VALUES ('${await nextNum("EQ-", "cmms_equipment", "equipment_number")}', 'יחידת קירור לייזר — TruLaser', 'רכיב', 'TRUMPF', 'TCoolUnit', 'SN-CLR-001', 'אולם A', 'חיתוך לייזר', 'critical', 'active', 85000, 10, 102000, 3000, ${s("CMMS:EQ-CHILD-003")}, ${insertedIds[laserIdx]}) RETURNING id`);
  }

  const allEquipment = await q(`SELECT id, name FROM cmms_equipment ORDER BY id`);
  const techs = ["יוסי כהן", "דוד מזרחי", "אלון גולדשטיין", "עומר חדד", "איתן רוזנברג"];
  const failureTypes2 = ["מכני", "חשמלי", "הידראולי", "פנאומטי", "בלאי", "קליברציה", "תוכנה", "חימום", "בלאי מכני", "נזל הידראולי"];

  for (const eq of allEquipment) {
    const eqId = Number(eq.id);
    const pmNum = await nextNum("PM-", "cmms_pm_schedules", "schedule_number");
    const freq = ["weekly", "monthly", "monthly", "quarterly"][Math.floor(Math.random() * 4)];
    const days = { daily: 1, weekly: 7, monthly: 30, quarterly: 90 }[freq] || 30;
    const nextDue = new Date(Date.now() + (Math.random() * 2 - 0.3) * days * 86400000).toISOString().slice(0, 10);
    const checklistItems = [
      { task: "בדיקת שמנים וסיכה", done: false },
      { task: "ניקוי ובדיקת פילטרים", done: false },
      { task: "בדיקת רצועות ושרשראות", done: false },
      { task: "בדיקת מערכת חשמלית", done: false },
      { task: "בדיקת קליברציה ודיוק", done: false },
      { task: "בדיקת חיבורים הידראוליים", done: false },
    ];
    const checklist = JSON.stringify(checklistItems).replace(/'/g, "''");
    const meterThreshold = [250, 500, 1000][Math.floor(Math.random() * 3)];
    const meterType = Math.random() > 0.5 ? "hours" : "cycles";
    await q(`INSERT INTO cmms_pm_schedules (schedule_number, equipment_id, title, frequency, frequency_days, meter_type, meter_threshold, current_meter_reading, checklist, assigned_to, estimated_hours, next_due, is_active, priority)
      VALUES ('${pmNum}', ${eqId}, ${s(`תחזוקה מונעת — ${eq.name}`)}, '${freq}', ${days}, '${meterType}', ${meterThreshold}, ${Math.floor(Number(eq.hours_used || 0) * 0.8)}, '${checklist}', ${s(techs[Math.floor(Math.random() * techs.length)])}, ${(Math.random() * 4 + 1).toFixed(1)}, '${nextDue}', true, '${["medium", "high"][Math.floor(Math.random() * 2)]}')`);
  }

  const woTypes = ["corrective", "corrective", "preventive", "corrective", "emergency"];
  const woStatuses = ["open", "assigned", "in_progress", "completed", "completed", "completed", "waiting_parts"];
  const mainEquipment = allEquipment.slice(0, 24);
  for (let i = 0; i < 60; i++) {
    const eq = mainEquipment[Math.floor(Math.random() * mainEquipment.length)];
    const eqId = Number(eq.id);
    const woNum = await nextNum("WO-", "cmms_work_orders", "wo_number");
    const wType = woTypes[Math.floor(Math.random() * woTypes.length)];
    const wStatus = woStatuses[Math.floor(Math.random() * woStatuses.length)];
    const fType = failureTypes2[Math.floor(Math.random() * failureTypes2.length)];
    const pCost = Math.floor(Math.random() * 8000 + 200);
    const lCost = Math.floor(Math.random() * 5000 + 500);
    const aHours = (Math.random() * 12 + 0.5).toFixed(1);
    const dHours = (Math.random() * 18).toFixed(1);
    const created = new Date(Date.now() - Math.random() * 365 * 86400000);
    const completed = wStatus === "completed" ? new Date(created.getTime() + Math.random() * 14 * 86400000) : null;
    const title = wType === "corrective" ? `תיקון ${fType} — ${eq.name}` : wType === "preventive" ? `תחזוקה מונעת — ${eq.name}` : `קריאת חירום — ${eq.name}`;
    const parts = JSON.stringify([
      { name: "מסנן שמן", partNumber: "OIL-F-001", quantity: 1, unitCost: Math.floor(Math.random() * 200 + 50) },
      { name: "רצועת גומי", partNumber: "BLT-001", quantity: Math.floor(Math.random() * 3 + 1), unitCost: Math.floor(Math.random() * 150 + 30) },
    ]).replace(/'/g, "''");
    const labor = JSON.stringify([
      { technician: techs[Math.floor(Math.random() * techs.length)], hours: parseFloat(aHours), date: created.toISOString().slice(0, 10), notes: "תיקון ראשוני" },
    ]).replace(/'/g, "''");
    await q(`INSERT INTO cmms_work_orders (wo_number, equipment_id, title, work_type, priority, status, reported_by, assigned_to, failure_type, parts_consumed, labor_logs, parts_cost, labor_cost, total_cost, estimated_hours, actual_hours, downtime_hours, scheduled_date, started_at, completed_at, created_at)
      VALUES ('${woNum}', ${eqId}, ${s(title)}, '${wType}', '${["low", "medium", "high", "critical"][Math.floor(Math.random() * 4)]}', '${wStatus}', ${s(techs[Math.floor(Math.random() * techs.length)])}, ${s(techs[Math.floor(Math.random() * techs.length)])}, ${s(fType)}, '${parts}', '${labor}', ${pCost}, ${lCost}, ${pCost + lCost}, ${aHours}, ${wStatus === "completed" ? aHours : 0}, ${wStatus === "completed" ? dHours : 0}, '${created.toISOString().slice(0, 10)}', ${wStatus !== "open" ? `'${created.toISOString()}'` : "NULL"}, ${completed ? `'${completed.toISOString()}'` : "NULL"}, '${created.toISOString()}')`);
  }

  for (let i = 0; i < 20; i++) {
    const eq = allEquipment[Math.floor(Math.random() * allEquipment.length)];
    const eqId = Number(eq.id);
    const dtNum = await nextNum("DT-", "cmms_downtime_events", "event_number");
    const reasons = ["mechanical", "electrical", "hydraulic", "planned", "operator_error", "software", "other"];
    const reason = reasons[Math.floor(Math.random() * reasons.length)];
    const startTime = new Date(Date.now() - Math.random() * 90 * 86400000);
    const durationMins = Math.floor(Math.random() * 480 + 15);
    const endTime = new Date(startTime.getTime() + durationMins * 60000);
    const shifts = ["א", "ב", "ג"];
    await q(`INSERT INTO cmms_downtime_events (event_number, equipment_id, start_time, end_time, duration_minutes, reason_category, reason_detail, shift, reported_by, units_lost)
      VALUES ('${dtNum}', ${eqId}, '${startTime.toISOString()}', '${endTime.toISOString()}', ${durationMins}, '${reason}', ${s(`תקלה: ${reason}`)}, ${s(shifts[Math.floor(Math.random() * shifts.length)])}, ${s(techs[Math.floor(Math.random() * techs.length)])}, ${Math.floor(Math.random() * 50)})`);
  }

  for (let i = 0; i < 8; i++) {
    const eq = allEquipment[Math.floor(Math.random() * allEquipment.length)];
    const eqId = Number(eq.id);
    const reqNum = await nextNum("REQ-", "cmms_maintenance_requests", "request_number");
    const urgencies = ["low", "medium", "high", "critical"];
    const statuses = ["pending", "assigned", "in_progress", "completed"];
    const requestors = ["אבי לוי", "שרה כהן", "מוחמד עלי", "ריקי שמש", "גדי מזרחי"];
    await q(`INSERT INTO cmms_maintenance_requests (request_number, equipment_id, title, description, urgency, status, requested_by, department, assigned_to)
      VALUES ('${reqNum}', ${eqId}, ${s(`בקשת תחזוקה — ${eq.name}`)}, ${s(`המכונה מפיקה רעשים חריגים ודורשת בדיקה`)}, '${urgencies[Math.floor(Math.random() * urgencies.length)]}', '${statuses[Math.floor(Math.random() * statuses.length)]}', ${s(requestors[Math.floor(Math.random() * requestors.length)])}, ${s(["ייצור", "כיפוף", "ריתוך", "גימור"][Math.floor(Math.random() * 4)])}, ${s(techs[Math.floor(Math.random() * techs.length)])})`);
  
  }

  res.json({ message: "CMMS seed complete — נתוני דמו עם רכבים, תשתיות ומחזור חיים" });
});

const VALID_SENSOR_TYPES = new Set(["vibration", "temperature", "pressure", "current", "humidity", "rpm", "voltage"]);
const VALID_PERMIT_STATUSES = new Set(["requested", "approved", "in_progress", "closed", "rejected"]);
const VALID_PERMIT_TYPES = new Set(["hot_work", "confined_space", "electrical", "mechanical", "working_at_height", "chemical"]);

async function ensureIoTTables() {
  await q(`CREATE TABLE IF NOT EXISTS cmms_sensor_readings (
    id SERIAL PRIMARY KEY,
    equipment_id INT REFERENCES cmms_equipment(id) ON DELETE CASCADE,
    sensor_type VARCHAR(50) NOT NULL,
    value NUMERIC(14,4) NOT NULL,
    unit VARCHAR(30),
    recorded_at TIMESTAMPTZ DEFAULT NOW(),
    is_alert BOOLEAN DEFAULT false
  )`);

  await q(`CREATE TABLE IF NOT EXISTS cmms_sensor_thresholds (
    id SERIAL PRIMARY KEY,
    equipment_id INT REFERENCES cmms_equipment(id) ON DELETE CASCADE,
    sensor_type VARCHAR(50) NOT NULL,
    warning_threshold NUMERIC(14,4),
    critical_threshold NUMERIC(14,4),
    unit VARCHAR(30),
    auto_work_order BOOLEAN DEFAULT false,
    UNIQUE(equipment_id, sensor_type)
  )`);

  await q(`CREATE TABLE IF NOT EXISTS cmms_loto_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    equipment_category VARCHAR(100),
    steps JSONB DEFAULT '[]',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await q(`CREATE TABLE IF NOT EXISTS cmms_loto_completions (
    id SERIAL PRIMARY KEY,
    template_id INT REFERENCES cmms_loto_templates(id) ON DELETE SET NULL,
    work_order_id INT REFERENCES cmms_work_orders(id) ON DELETE SET NULL,
    equipment_id INT REFERENCES cmms_equipment(id) ON DELETE SET NULL,
    completed_by VARCHAR(200),
    completed_at TIMESTAMPTZ DEFAULT NOW(),
    steps_completed JSONB DEFAULT '[]',
    notes TEXT
  )`);

  await q(`CREATE TABLE IF NOT EXISTS cmms_work_permits (
    id SERIAL PRIMARY KEY,
    permit_number VARCHAR(32) UNIQUE,
    permit_type VARCHAR(50) NOT NULL,
    equipment_id INT REFERENCES cmms_equipment(id) ON DELETE SET NULL,
    work_order_id INT REFERENCES cmms_work_orders(id) ON DELETE SET NULL,
    requested_by VARCHAR(200),
    approved_by VARCHAR(200),
    status VARCHAR(30) DEFAULT 'requested',
    hazards TEXT,
    precautions TEXT,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
}

let iotTablesReady = false;
async function initIoT() {
  if (!iotTablesReady) { await ensureIoTTables(); iotTablesReady = true; }
}

router.post("/cmms/sensors/readings", async (req: Request, res: Response) => {
  await init(); await initIoT();
  const d = req.body;
  const equipmentId = safeInt(d.equipmentId);
  const sensorType = safeEnum(d.sensorType, VALID_SENSOR_TYPES, "");
  if (!equipmentId || !sensorType) return res.status(400).json({ error: "equipmentId and sensorType required" });
  const value = safeNum(d.value);
  const unit = s(d.unit || "");
  const recordedAt = d.recordedAt ? safeDatetime(d.recordedAt) : "NOW()";

  const thresh = await q(`SELECT warning_threshold, critical_threshold, auto_work_order FROM cmms_sensor_thresholds WHERE equipment_id=${equipmentId} AND sensor_type='${sensorType}'`);
  const t = thresh[0] as Record<string, unknown> | undefined;
  const warningThresh = t ? Number(t.warning_threshold) : null;
  const criticalThresh = t ? Number(t.critical_threshold) : null;
  const isAlert = criticalThresh !== null && value >= criticalThresh;
  const isWarning = warningThresh !== null && value >= warningThresh && !isAlert;

  await q(`INSERT INTO cmms_sensor_readings (equipment_id, sensor_type, value, unit, recorded_at, is_alert)
    VALUES (${equipmentId}, '${sensorType}', ${value}, ${unit}, ${recordedAt}, ${isAlert || isWarning})`);

  if (isAlert && t && t.auto_work_order) {
    const eq = await q(`SELECT name, equipment_number FROM cmms_equipment WHERE id=${equipmentId}`);
    if (eq[0]) {
      const eRow = eq[0] as Record<string, unknown>;
      const woNum = await nextNum("WO-", "cmms_work_orders", "wo_number");
      await q(`INSERT INTO cmms_work_orders (wo_number, equipment_id, title, work_type, priority, status, reported_by, failure_description)
        VALUES ('${woNum}', ${equipmentId}, ${s(`התראת חיישן: ${sensorType}=${value} בציוד ${eRow.name}`)}, 'corrective', 'high', 'open', 'מערכת IoT', ${s(`חיישן ${sensorType} חצה סף קריטי: ${value}`)})`);
    }
  }

  res.json({ success: true, isAlert, isWarning });
});

router.post("/cmms/sensors/readings/batch", async (req: Request, res: Response) => {
  await init(); await initIoT();
  const readings = Array.isArray(req.body) ? req.body : [req.body];
  let inserted = 0;
  for (const d of readings) {
    const equipmentId = safeInt(d.equipmentId);
    const sensorType = safeEnum(d.sensorType, VALID_SENSOR_TYPES, "");
    if (!equipmentId || !sensorType) continue;
    const value = safeNum(d.value);
    const unit = s(d.unit || "");
    const recordedAt = d.recordedAt ? safeDatetime(d.recordedAt) : "NOW()";
    await q(`INSERT INTO cmms_sensor_readings (equipment_id, sensor_type, value, unit, recorded_at)
      VALUES (${equipmentId}, '${sensorType}', ${value}, ${unit}, ${recordedAt})`);
    inserted++;
  }
  res.json({ success: true, inserted });
});

router.get("/cmms/sensors/:equipmentId/readings", async (req: Request, res: Response) => {
  await init(); await initIoT();
  const equipmentId = safeInt(req.params.equipmentId);
  const { sensorType, hours = "24", limit = "200" } = req.query as Record<string, string>;
  const conds = [`equipment_id=${equipmentId}`, `recorded_at >= NOW() - INTERVAL '${safeInt(hours, 24)} hours'`];
  if (sensorType && VALID_SENSOR_TYPES.has(sensorType)) conds.push(`sensor_type='${sensorType}'`);
  const rows = await q(`SELECT id, sensor_type, value, unit, recorded_at, is_alert 
    FROM cmms_sensor_readings WHERE ${conds.join(" AND ")}
    ORDER BY recorded_at DESC LIMIT ${safeInt(limit, 200)}`);
  res.json(rows);
});

router.get("/cmms/sensors/:equipmentId/latest", async (req: Request, res: Response) => {
  await init(); await initIoT();
  const equipmentId = safeInt(req.params.equipmentId);
  const rows = await q(`SELECT DISTINCT ON (sensor_type) sensor_type, value, unit, recorded_at, is_alert
    FROM cmms_sensor_readings WHERE equipment_id=${equipmentId}
    ORDER BY sensor_type, recorded_at DESC`);
  const thresholds = await q(`SELECT sensor_type, warning_threshold, critical_threshold, unit, auto_work_order FROM cmms_sensor_thresholds WHERE equipment_id=${equipmentId}`);
  res.json({ latest: rows, thresholds });
});

router.get("/cmms/sensors/:equipmentId/thresholds", async (_req: Request, res: Response) => {
  await initIoT();
  const equipmentId = safeInt(_req.params.equipmentId);
  const rows = await q(`SELECT * FROM cmms_sensor_thresholds WHERE equipment_id=${equipmentId}`);
  res.json(rows);
});

router.post("/cmms/sensors/:equipmentId/thresholds", async (req: Request, res: Response) => {
  await init(); await initIoT();
  const equipmentId = safeInt(req.params.equipmentId);
  const d = req.body;
  const sensorType = safeEnum(d.sensorType, VALID_SENSOR_TYPES, "");
  if (!sensorType) return res.status(400).json({ error: "valid sensorType required" });
  await q(`INSERT INTO cmms_sensor_thresholds (equipment_id, sensor_type, warning_threshold, critical_threshold, unit, auto_work_order)
    VALUES (${equipmentId}, '${sensorType}', ${d.warningThreshold != null ? safeNum(d.warningThreshold) : "NULL"}, ${d.criticalThreshold != null ? safeNum(d.criticalThreshold) : "NULL"}, ${s(d.unit || "")}, ${!!d.autoWorkOrder})
    ON CONFLICT (equipment_id, sensor_type) DO UPDATE SET warning_threshold=EXCLUDED.warning_threshold, critical_threshold=EXCLUDED.critical_threshold, unit=EXCLUDED.unit, auto_work_order=EXCLUDED.auto_work_order`);
  const rows = await q(`SELECT * FROM cmms_sensor_thresholds WHERE equipment_id=${equipmentId} AND sensor_type='${sensorType}'`);
  res.json(rows[0]);
});

router.delete("/cmms/sensors/:equipmentId/thresholds/:sensorType", async (req: Request, res: Response) => {
  await initIoT();
  const equipmentId = safeInt(req.params.equipmentId);
  const sensorType = safeEnum(req.params.sensorType, VALID_SENSOR_TYPES, "");
  if (!sensorType) return res.status(400).json({ error: "invalid sensorType" });
  await q(`DELETE FROM cmms_sensor_thresholds WHERE equipment_id=${equipmentId} AND sensor_type='${sensorType}'`);
  res.json({ success: true });
});

router.get("/cmms/health-scores", async (_req: Request, res: Response) => {
  await init(); await initIoT();
  const equipment = await q(`SELECT id, name, equipment_number, category, criticality, status, hours_used, expected_useful_life_years, purchase_date, last_maintenance_date FROM cmms_equipment WHERE status != 'retired' ORDER BY name`);

  const healthScores = await Promise.all(equipment.map(async (eqRaw) => {
    const eq = eqRaw as Record<string, unknown>;
    const id = Number(eq.id);

    const woStats = await q(`SELECT
      COUNT(*) FILTER (WHERE work_type='corrective' AND created_at >= NOW() - INTERVAL '90 days') as recent_failures,
      COUNT(*) FILTER (WHERE work_type='corrective' AND created_at >= NOW() - INTERVAL '365 days') as annual_failures,
      COALESCE(AVG(actual_hours) FILTER (WHERE status='completed'), 0) as avg_repair_hours
      FROM cmms_work_orders WHERE equipment_id=${id}`);
    const wo = (woStats[0] || {}) as Record<string, unknown>;
    const recentFailures = Number(wo.recent_failures || 0);
    const annualFailures = Number(wo.annual_failures || 0);
    const avgRepairHours = Number(wo.avg_repair_hours || 0);

    const alertCount = await q(`SELECT COUNT(*) as cnt FROM cmms_sensor_readings WHERE equipment_id=${id} AND is_alert=true AND recorded_at >= NOW() - INTERVAL '7 days'`);
    const recentAlerts = Number((alertCount[0] as Record<string, unknown>)?.cnt || 0);

    const hoursUsed = Number(eq.hours_used || 0);
    const expectedLifeHours = Number(eq.expected_useful_life_years || 10) * 8760;
    const ageRatio = expectedLifeHours > 0 ? Math.min(1, hoursUsed / expectedLifeHours) : 0;

    const purchaseDate = eq.purchase_date ? new Date(String(eq.purchase_date)) : null;
    const ageYears = purchaseDate ? (Date.now() - purchaseDate.getTime()) / (365.25 * 86400000) : 0;
    const expectedLifeYears = Number(eq.expected_useful_life_years || 10);
    const ageRatioYears = Math.min(1, ageYears / expectedLifeYears);

    const lastMaint = eq.last_maintenance_date ? new Date(String(eq.last_maintenance_date)) : null;
    const daysSinceMaint = lastMaint ? (Date.now() - lastMaint.getTime()) / 86400000 : 999;
    const maintScore = Math.max(0, 1 - daysSinceMaint / 180);

    const sensorAlertPenalty = Math.min(30, recentAlerts * 5);
    const failurePenalty = Math.min(30, recentFailures * 10 + annualFailures * 3);
    const agePenalty = ageRatio * 20 + ageRatioYears * 10;
    const repairPenalty = Math.min(10, avgRepairHours * 0.5);

    let baseScore = 100 - sensorAlertPenalty - failurePenalty - agePenalty - repairPenalty + maintScore * 10;
    if (eq.status === "down") baseScore = Math.min(baseScore, 20);
    else if (eq.status === "maintenance") baseScore = Math.min(baseScore, 50);
    baseScore = Math.max(0, Math.min(100, Math.round(baseScore)));

    const daysToFailure = baseScore > 70 ? Math.round(baseScore * 3.5) :
      baseScore > 40 ? Math.round(baseScore * 1.5) :
      Math.round(baseScore * 0.5);

    const healthLevel = baseScore >= 70 ? "good" : baseScore >= 40 ? "warning" : "critical";

    return {
      id,
      name: eq.name,
      equipment_number: eq.equipment_number,
      category: eq.category,
      criticality: eq.criticality,
      status: eq.status,
      health_score: baseScore,
      health_level: healthLevel,
      predicted_days_to_failure: daysToFailure,
      recent_failures: recentFailures,
      annual_failures: annualFailures,
      recent_alerts: recentAlerts,
      age_ratio_pct: Math.round(ageRatioYears * 100),
      days_since_maintenance: Math.round(daysSinceMaint),
    };
  }));

  res.json(healthScores.sort((a, b) => a.health_score - b.health_score));
});

router.get("/cmms/health-scores/:id", async (req: Request, res: Response) => {
  await init(); await initIoT();
  const id = safeInt(req.params.id);
  const eqRaw = await q(`SELECT id, name, equipment_number, category, criticality, status, hours_used, expected_useful_life_years, purchase_date, last_maintenance_date FROM cmms_equipment WHERE id=${id}`);
  if (!eqRaw[0]) return res.status(404).json({ error: "Equipment not found" });

  const eq = eqRaw[0] as Record<string, unknown>;
  const woStats = await q(`SELECT
    COUNT(*) FILTER (WHERE work_type='corrective' AND created_at >= NOW() - INTERVAL '90 days') as recent_failures,
    COUNT(*) FILTER (WHERE work_type='corrective' AND created_at >= NOW() - INTERVAL '365 days') as annual_failures,
    COALESCE(AVG(actual_hours) FILTER (WHERE status='completed'), 0) as avg_repair_hours
    FROM cmms_work_orders WHERE equipment_id=${id}`);
  const wo = (woStats[0] || {}) as Record<string, unknown>;
  const recentFailures = Number(wo.recent_failures || 0);
  const annualFailures = Number(wo.annual_failures || 0);

  const alertRows = await q(`SELECT COUNT(*) as cnt FROM cmms_sensor_readings WHERE equipment_id=${id} AND is_alert=true AND recorded_at >= NOW() - INTERVAL '7 days'`);
  const recentAlerts = Number((alertRows[0] as Record<string, unknown>)?.cnt || 0);

  const hoursUsed = Number(eq.hours_used || 0);
  const expectedLifeHours = Number(eq.expected_useful_life_years || 10) * 8760;
  const ageRatio = expectedLifeHours > 0 ? Math.min(1, hoursUsed / expectedLifeHours) : 0;
  const purchaseDate = eq.purchase_date ? new Date(String(eq.purchase_date)) : null;
  const ageYears = purchaseDate ? (Date.now() - purchaseDate.getTime()) / (365.25 * 86400000) : 0;
  const expectedLifeYears = Number(eq.expected_useful_life_years || 10);
  const ageRatioYears = Math.min(1, ageYears / expectedLifeYears);
  const lastMaint = eq.last_maintenance_date ? new Date(String(eq.last_maintenance_date)) : null;
  const daysSinceMaint = lastMaint ? (Date.now() - lastMaint.getTime()) / 86400000 : 999;
  const maintScore = Math.max(0, 1 - daysSinceMaint / 180);

  const sensorAlertPenalty = Math.min(30, recentAlerts * 5);
  const failurePenalty = Math.min(30, recentFailures * 10 + annualFailures * 3);
  const agePenalty = ageRatio * 20 + ageRatioYears * 10;
  const repairPenalty = Math.min(10, Number(wo.avg_repair_hours || 0) * 0.5);

  let baseScore = 100 - sensorAlertPenalty - failurePenalty - agePenalty - repairPenalty + maintScore * 10;
  if (eq.status === "down") baseScore = Math.min(baseScore, 20);
  else if (eq.status === "maintenance") baseScore = Math.min(baseScore, 50);
  baseScore = Math.max(0, Math.min(100, Math.round(baseScore)));

  const daysToFailure = baseScore > 70 ? Math.round(baseScore * 3.5) :
    baseScore > 40 ? Math.round(baseScore * 1.5) : Math.round(baseScore * 0.5);
  const healthLevel = baseScore >= 70 ? "good" : baseScore >= 40 ? "warning" : "critical";

  const sensorTrend = await q(`SELECT sensor_type,
    DATE_TRUNC('hour', recorded_at) as hour,
    AVG(value) as avg_value, MAX(value) as max_value, COUNT(*) as readings
    FROM cmms_sensor_readings WHERE equipment_id=${id} AND recorded_at >= NOW() - INTERVAL '7 days'
    GROUP BY sensor_type, DATE_TRUNC('hour', recorded_at) ORDER BY hour ASC`);

  res.json({
    id, name: eq.name, equipment_number: eq.equipment_number, criticality: eq.criticality, status: eq.status,
    health_score: baseScore, health_level: healthLevel, predicted_days_to_failure: daysToFailure,
    recent_failures: recentFailures, annual_failures: annualFailures, recent_alerts: recentAlerts,
    age_ratio_pct: Math.round(ageRatioYears * 100), days_since_maintenance: Math.round(daysSinceMaint),
    sensorTrend,
  });
});

router.post("/cmms/sensors/seed/:equipmentId", async (req: Request, res: Response) => {
  await init(); await initIoT();
  const equipmentId = safeInt(req.params.equipmentId);
  const eqCheck = await q(`SELECT id, name FROM cmms_equipment WHERE id=${equipmentId}`);
  if (!eqCheck[0]) return res.status(404).json({ error: "Equipment not found" });

  const existing = await q(`SELECT COUNT(*) as c FROM cmms_sensor_readings WHERE equipment_id=${equipmentId}`);
  if (Number((existing[0] as Record<string, unknown>)?.c || 0) > 50) {
    return res.json({ message: "Sensor data already exists" });
  }

  const sensors = [
    { type: "temperature", unit: "°C", base: 65, noise: 8, criticalVal: 90, warnVal: 80 },
    { type: "vibration", unit: "mm/s", base: 2.5, noise: 1.5, criticalVal: 7, warnVal: 5 },
    { type: "pressure", unit: "bar", base: 6, noise: 0.5, criticalVal: 9, warnVal: 8 },
    { type: "current", unit: "A", base: 28, noise: 4, criticalVal: 45, warnVal: 38 },
  ];

  for (const sensor of sensors) {
    await q(`INSERT INTO cmms_sensor_thresholds (equipment_id, sensor_type, warning_threshold, critical_threshold, unit, auto_work_order)
      VALUES (${equipmentId}, '${sensor.type}', ${sensor.warnVal}, ${sensor.criticalVal}, '${sensor.unit}', true)
      ON CONFLICT (equipment_id, sensor_type) DO NOTHING`);

    for (let i = 0; i < 168; i++) {
      const hoursAgo = 168 - i;
      const value = sensor.base + (Math.random() - 0.5) * sensor.noise * 2 + Math.sin(i / 24 * Math.PI) * sensor.noise * 0.5;
      const finalValue = Math.max(0, parseFloat(value.toFixed(2)));
      const isAlert = finalValue >= sensor.criticalVal || finalValue >= sensor.warnVal;
      const ts = new Date(Date.now() - hoursAgo * 3600000).toISOString();
      await q(`INSERT INTO cmms_sensor_readings (equipment_id, sensor_type, value, unit, recorded_at, is_alert)
        VALUES (${equipmentId}, '${sensor.type}', ${finalValue}, '${sensor.unit}', '${ts}', ${isAlert})`);
    }
  }

  res.json({ success: true, message: `Seeded sensor data for equipment ${equipmentId}` });
});

router.get("/cmms/loto-templates", async (_req: Request, res: Response) => {
  await initIoT();
  const rows = await q(`SELECT * FROM cmms_loto_templates ORDER BY name`);
  res.json(rows);
});

router.post("/cmms/loto-templates", async (req: Request, res: Response) => {
  await initIoT();
  const d = req.body;
  const steps = d.steps ? `'${JSON.stringify(d.steps).replace(/'/g, "''")}'` : "'[]'";
  await q(`INSERT INTO cmms_loto_templates (name, equipment_category, steps, notes)
    VALUES (${s(d.name)}, ${s(d.equipmentCategory || "")}, ${steps}, ${s(d.notes || "")})`);
  const rows = await q(`SELECT * FROM cmms_loto_templates ORDER BY id DESC LIMIT 1`);
  res.json(rows[0]);
});

// ========== SPARE PARTS ==========

router.get("/cmms/spare-parts", async (req: Request, res: Response) => {
  await init();
  const { search, category, lowStock } = req.query as Record<string, string>;
  const conds: string[] = [];
  if (search) conds.push(`(name ILIKE ${s("%" + search + "%")} OR part_number ILIKE ${s("%" + search + "%")} OR category ILIKE ${s("%" + search + "%")})`);
  if (category && category !== "all") conds.push(`category=${s(category)}`);
  if (lowStock === "true") conds.push(`current_stock <= minimum_stock AND is_active=true`);
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const rows = await q(`SELECT * FROM cmms_spare_parts ${where} ORDER BY name ASC`);
  res.json(rows);
});

router.get("/cmms/spare-parts/low-stock", async (_req: Request, res: Response) => {
  await init();
  const rows = await q(`SELECT * FROM cmms_spare_parts WHERE current_stock <= minimum_stock AND is_active=true ORDER BY (minimum_stock - current_stock) DESC`);
  res.json(rows);
});

router.get("/cmms/spare-parts/:id", async (req: Request, res: Response) => {
  await init();
  const rows = await q(`SELECT * FROM cmms_spare_parts WHERE id=${safeInt(req.params.id)}`);
  if (!rows[0]) return res.status(404).json({ error: "Part not found" });
  res.json(rows[0]);
});

router.post("/cmms/spare-parts", async (req: Request, res: Response) => {
  await init();
  const d = req.body;
  const num = await nextNum("SP-", "cmms_spare_parts", "part_number");
  await q(`INSERT INTO cmms_spare_parts (part_number, name, description, category, location_bin, current_stock, minimum_stock, reorder_qty, unit_cost, supplier_name, last_reorder_date, is_active, notes)
    VALUES ('${num}', ${s(d.name)}, ${s(d.description)}, ${s(d.category)}, ${s(d.locationBin)}, ${safeNum(d.currentStock)}, ${safeNum(d.minimumStock)}, ${safeNum(d.reorderQty, 1)}, ${safeNum(d.unitCost)}, ${s(d.supplierName)}, ${safeDate(d.lastReorderDate)}, ${d.isActive !== false}, ${s(d.notes)})`);
  const row = await q(`SELECT * FROM cmms_spare_parts WHERE part_number='${num}'`);
  res.json(row[0]);
});

router.put("/cmms/spare-parts/:id", async (req: Request, res: Response) => {
  await init();
  const id = safeInt(req.params.id);
  const d = req.body;
  const sets: string[] = [];
  if (d.name !== undefined) sets.push(`name=${s(d.name)}`);
  if (d.description !== undefined) sets.push(`description=${s(d.description)}`);
  if (d.category !== undefined) sets.push(`category=${s(d.category)}`);
  if (d.locationBin !== undefined) sets.push(`location_bin=${s(d.locationBin)}`);
  if (d.currentStock !== undefined) sets.push(`current_stock=${safeNum(d.currentStock)}`);
  if (d.minimumStock !== undefined) sets.push(`minimum_stock=${safeNum(d.minimumStock)}`);
  if (d.reorderQty !== undefined) sets.push(`reorder_qty=${safeNum(d.reorderQty)}`);
  if (d.unitCost !== undefined) sets.push(`unit_cost=${safeNum(d.unitCost)}`);
  if (d.supplierName !== undefined) sets.push(`supplier_name=${s(d.supplierName)}`);
  if (d.lastReorderDate !== undefined) sets.push(`last_reorder_date=${safeDate(d.lastReorderDate)}`);
  if (d.isActive !== undefined) sets.push(`is_active=${!!d.isActive}`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE cmms_spare_parts SET ${sets.join(",")} WHERE id=${id}`);
  const row = await q(`SELECT * FROM cmms_spare_parts WHERE id=${id}`);
  res.json(row[0]);
});

router.put("/cmms/loto-templates/:id", async (req: Request, res: Response) => {
  await initIoT();
  const id = safeInt(req.params.id);
  const d = req.body;
  const sets: string[] = [];
  if (d.name !== undefined) sets.push(`name=${s(d.name)}`);
  if (d.equipmentCategory !== undefined) sets.push(`equipment_category=${s(d.equipmentCategory)}`);
  if (d.steps !== undefined) sets.push(`steps='${JSON.stringify(d.steps).replace(/'/g, "''")}'`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE cmms_loto_templates SET ${sets.join(",")} WHERE id=${id}`);
  const rows = await q(`SELECT * FROM cmms_loto_templates WHERE id=${id}`);
  res.json(rows[0]);
});

router.delete("/cmms/loto-templates/:id", async (req: Request, res: Response) => {
  await initIoT();
  await q(`DELETE FROM cmms_loto_templates WHERE id=${safeInt(req.params.id)}`);
  res.json({ success: true });
});

router.get("/cmms/loto-completions", async (req: Request, res: Response) => {
  await initIoT();
  const { equipmentId, workOrderId, limit = "50" } = req.query as Record<string, string>;
  const conds: string[] = [];
  if (equipmentId) conds.push(`lc.equipment_id=${safeInt(equipmentId)}`);
  if (workOrderId) conds.push(`lc.work_order_id=${safeInt(workOrderId)}`);
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const rows = await q(`SELECT lc.*, lt.name as template_name, e.name as equipment_name, wo.wo_number
    FROM cmms_loto_completions lc
    LEFT JOIN cmms_loto_templates lt ON lt.id = lc.template_id
    LEFT JOIN cmms_equipment e ON e.id = lc.equipment_id
    LEFT JOIN cmms_work_orders wo ON wo.id = lc.work_order_id
    ${where} ORDER BY lc.completed_at DESC LIMIT ${safeInt(limit, 50)}`);
  res.json(rows);
});

router.post("/cmms/loto-completions", async (req: Request, res: Response) => {
  await init(); await initIoT();
  const d = req.body;
  const stepsCompleted = d.stepsCompleted ? `'${JSON.stringify(d.stepsCompleted).replace(/'/g, "''")}'` : "'[]'";
  await q(`INSERT INTO cmms_loto_completions (template_id, work_order_id, equipment_id, completed_by, completed_at, steps_completed, notes)
    VALUES (${d.templateId ? safeInt(d.templateId) : "NULL"}, ${d.workOrderId ? safeInt(d.workOrderId) : "NULL"}, ${d.equipmentId ? safeInt(d.equipmentId) : "NULL"}, ${s(d.completedBy || "")}, NOW(), ${stepsCompleted}, ${s(d.notes || "")})`);
  const rows = await q(`SELECT * FROM cmms_loto_completions ORDER BY id DESC LIMIT 1`);
  res.json(rows[0]);
});

router.get("/cmms/work-permits", async (req: Request, res: Response) => {
  await init(); await initIoT();
  const { status, equipmentId, permitType } = req.query as Record<string, string>;
  const conds: string[] = [];
  if (status && status !== "all" && VALID_PERMIT_STATUSES.has(status)) conds.push(`wp.status='${status}'`);
  if (equipmentId) conds.push(`wp.equipment_id=${safeInt(equipmentId)}`);
  if (permitType && VALID_PERMIT_TYPES.has(permitType)) conds.push(`wp.permit_type='${permitType}'`);
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const rows = await q(`SELECT wp.*, e.name as equipment_name, e.equipment_number, wo.wo_number
    FROM cmms_work_permits wp
    LEFT JOIN cmms_equipment e ON e.id = wp.equipment_id
    LEFT JOIN cmms_work_orders wo ON wo.id = wp.work_order_id
    ${where} ORDER BY wp.created_at DESC LIMIT 100`);
  res.json(rows);
});

router.post("/cmms/work-permits", async (req: Request, res: Response) => {
  await init(); await initIoT();
  const d = req.body;
  const num = await nextNum("WP-", "cmms_work_permits", "permit_number");
  const permitType = safeEnum(d.permitType, VALID_PERMIT_TYPES, "mechanical");
  await q(`INSERT INTO cmms_work_permits (permit_number, permit_type, equipment_id, work_order_id, requested_by, status, hazards, precautions, start_time, end_time, notes)
    VALUES ('${num}', '${permitType}', ${d.equipmentId ? safeInt(d.equipmentId) : "NULL"}, ${d.workOrderId ? safeInt(d.workOrderId) : "NULL"}, ${s(d.requestedBy || "")}, 'requested', ${s(d.hazards || "")}, ${s(d.precautions || "")}, ${d.startTime ? safeDatetime(d.startTime) : "NULL"}, ${d.endTime ? safeDatetime(d.endTime) : "NULL"}, ${s(d.notes || "")})`);
  const rows = await q(`SELECT wp.*, e.name as equipment_name FROM cmms_work_permits wp LEFT JOIN cmms_equipment e ON e.id=wp.equipment_id WHERE wp.permit_number='${num}'`);
  res.json(rows[0]);
});

router.put("/cmms/work-permits/:id", async (req: Request, res: Response) => {
  await initIoT();
  const id = safeInt(req.params.id);
  const d = req.body;
  const sets: string[] = [];
  if (d.status !== undefined && VALID_PERMIT_STATUSES.has(d.status)) sets.push(`status='${d.status}'`);
  if (d.approvedBy !== undefined) sets.push(`approved_by=${s(d.approvedBy)}`);
  if (d.hazards !== undefined) sets.push(`hazards=${s(d.hazards)}`);
  if (d.precautions !== undefined) sets.push(`precautions=${s(d.precautions)}`);
  if (d.startTime !== undefined) sets.push(`start_time=${d.startTime ? safeDatetime(d.startTime) : "NULL"}`);
  if (d.endTime !== undefined) sets.push(`end_time=${d.endTime ? safeDatetime(d.endTime) : "NULL"}`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  if (d.permitType !== undefined && VALID_PERMIT_TYPES.has(d.permitType)) sets.push(`permit_type='${d.permitType}'`);
  sets.push(`updated_at=NOW()`);
  if (sets.length === 1) return res.status(400).json({ error: "No valid fields to update" });
  await q(`UPDATE cmms_work_permits SET ${sets.join(",")} WHERE id=${id}`);
  const rows = await q(`SELECT wp.*, e.name as equipment_name FROM cmms_work_permits wp LEFT JOIN cmms_equipment e ON e.id=wp.equipment_id WHERE wp.id=${id}`);
  res.json(rows[0]);
});

router.delete("/cmms/work-permits/:id", async (req: Request, res: Response) => {
  await initIoT();
  await q(`DELETE FROM cmms_work_permits WHERE id=${safeInt(req.params.id)}`);
  res.json({ success: true });
});

router.post("/cmms/work-permits/:id/approve", async (req: Request, res: Response) => {
  await initIoT();
  const id = safeInt(req.params.id);
  const { approvedBy } = req.body;
  await q(`UPDATE cmms_work_permits SET status='approved', approved_by=${s(approvedBy || "")}, updated_at=NOW() WHERE id=${id} AND status='requested'`);
  const rows = await q(`SELECT * FROM cmms_work_permits WHERE id=${id}`);
  res.json(rows[0]);
});

router.post("/cmms/work-permits/:id/start", async (req: Request, res: Response) => {
  await initIoT();
  const id = safeInt(req.params.id);
  await q(`UPDATE cmms_work_permits SET status='in_progress', start_time=NOW(), updated_at=NOW() WHERE id=${id} AND status='approved'`);
  const rows = await q(`SELECT * FROM cmms_work_permits WHERE id=${id}`);
  res.json(rows[0]);
});

router.post("/cmms/work-permits/:id/close", async (req: Request, res: Response) => {
  await initIoT();
  const id = safeInt(req.params.id);
  const { notes } = req.body;
  await q(`UPDATE cmms_work_permits SET status='closed', end_time=NOW(), updated_at=NOW()${notes ? `, notes=${s(notes)}` : ""} WHERE id=${id} AND status='in_progress'`);
  const rows = await q(`SELECT * FROM cmms_work_permits WHERE id=${id}`);
  res.json(rows[0]);
});

router.get("/cmms/safety-compliance", async (_req: Request, res: Response) => {
  await init(); await initIoT();

  const permitStats = await q(`SELECT
    COUNT(*) as total_permits,
    COUNT(*) FILTER (WHERE status='requested') as pending_permits,
    COUNT(*) FILTER (WHERE status='approved') as approved_permits,
    COUNT(*) FILTER (WHERE status='in_progress') as active_permits,
    COUNT(*) FILTER (WHERE status='closed') as closed_permits,
    COUNT(*) FILTER (WHERE status='rejected') as rejected_permits,
    COUNT(*) FILTER (WHERE end_time IS NOT NULL AND end_time < NOW() AND status NOT IN ('closed','rejected')) as expired_permits
    FROM cmms_work_permits`);

  const lotoStats = await q(`SELECT
    COUNT(*) as total_completions,
    COUNT(*) FILTER (WHERE completed_at >= NOW() - INTERVAL '30 days') as recent_completions,
    COUNT(DISTINCT equipment_id) as unique_equipment
    FROM cmms_loto_completions`);

  const monthlyPermits = await q(`SELECT
    TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') as month,
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status='closed') as closed
    FROM cmms_work_permits WHERE created_at >= NOW() - INTERVAL '6 months'
    GROUP BY DATE_TRUNC('month', created_at) ORDER BY month ASC`);

  const recentPermits = await q(`SELECT wp.id, wp.permit_number, wp.permit_type, wp.status, wp.requested_by, wp.created_at, e.name as equipment_name
    FROM cmms_work_permits wp LEFT JOIN cmms_equipment e ON e.id=wp.equipment_id
    ORDER BY wp.created_at DESC LIMIT 10`);

  const woWithLoto = await q(`SELECT COUNT(DISTINCT work_order_id) as with_loto FROM cmms_loto_completions WHERE work_order_id IS NOT NULL`);
  const woTotal = await q(`SELECT COUNT(*) as total FROM cmms_work_orders WHERE work_type='corrective'`);
  const withLoto = Number((woWithLoto[0] as Record<string, unknown>)?.with_loto || 0);
  const totalCorrective = Number((woTotal[0] as Record<string, unknown>)?.total || 0);
  const lotoComplianceRate = totalCorrective > 0 ? Math.round((withLoto / totalCorrective) * 100) : 0;

  const ps = (permitStats[0] || {}) as Record<string, unknown>;
  const ls = (lotoStats[0] || {}) as Record<string, unknown>;

  res.json({
    permits: {
      total: Number(ps.total_permits || 0),
      pending: Number(ps.pending_permits || 0),
      approved: Number(ps.approved_permits || 0),
      active: Number(ps.active_permits || 0),
      closed: Number(ps.closed_permits || 0),
      rejected: Number(ps.rejected_permits || 0),
      expired: Number(ps.expired_permits || 0),
    },
    loto: {
      totalCompletions: Number(ls.total_completions || 0),
      recentCompletions: Number(ls.recent_completions || 0),
      uniqueEquipment: Number(ls.unique_equipment || 0),
      complianceRate: lotoComplianceRate,
    },
    monthlyPermits,
    recentPermits,
  });
});

router.post("/cmms/loto-templates/seed", async (_req: Request, res: Response) => {
  await initIoT();
  const existing = await q(`SELECT COUNT(*) as c FROM cmms_loto_templates`);
  if (Number((existing[0] as Record<string, unknown>)?.c || 0) > 0) {
    return res.json({ message: "LOTO templates already exist" });
  }

  const templates = [
    {
      name: "נעילה/תיוג — מכונת CNC",
      category: "CNC",
      steps: [
        { step: "כבה את המכונה ממתג ראשי", done: false },
        { step: "הוצא מפתח ועגן בנעילה אדומה אישית", done: false },
        { step: "הדבק תוית אזהרה על הלוח הראשי", done: false },
        { step: "שחרר אנרגיה שיורית — לחץ על כל לחצני הפעלה", done: false },
        { step: "ודא אין תנועה בציר ובשפינדל", done: false },
        { step: "בדוק לחץ הידראולי אפסי", done: false },
        { step: "רשום ביומן נעילה — שם, שעה, מספר אישי", done: false },
      ],
    },
    {
      name: "נעילה/תיוג — מכשור חשמלי",
      category: "חשמל",
      steps: [
        { step: "זהה את כל מקורות האנרגיה החשמלית", done: false },
        { step: "כבה את ה-MCC / לוח חשמל הרלוונטי", done: false },
        { step: "נעל את לוח החשמל בנעילה אישית", done: false },
        { step: "בדוק עם מד מתח — ודא אין מתח פעיל", done: false },
        { step: "הדבק תוית LOTO אדומה על כל נקודת בקרה", done: false },
        { step: "ודא גראונד / הארקה לפני גישה", done: false },
        { step: "תעד בטופס אישור עבודה חשמלית", done: false },
      ],
    },
    {
      name: "נעילה/תיוג — מערכת הידראולית",
      category: "הידראוליקה",
      steps: [
        { step: "כבה משאבת הידראולית", done: false },
        { step: "שחרר לחץ ממצבר הידראולי", done: false },
        { step: "נעל שסתום הזנה ראשי", done: false },
        { step: "בדוק מד לחץ — ודא לחץ אפסי", done: false },
        { step: "שחרר לחץ שיורי מכל הצינורות", done: false },
        { step: "הדבק תוית על כל שסתום נעול", done: false },
        { step: "רשום פרטים בטופס בטיחות", done: false },
      ],
    },
    {
      name: "נעילה/תיוג — מכשור פנאומטי",
      category: "פנאומטיקה",
      steps: [
        { step: "כבה מקור אוויר דחוס", done: false },
        { step: "פתח שסתום פריקת לחץ", done: false },
        { step: "ודא לחץ אפסי בכל מד לחץ", done: false },
        { step: "נעל כפתור ON/OFF של הקומפרסור", done: false },
        { step: "הדבק תוית אזהרה", done: false },
        { step: "תעד בטופס LOTO", done: false },
      ],
    },
  ];

  for (const t of templates) {
    await q(`INSERT INTO cmms_loto_templates (name, equipment_category, steps)
      VALUES (${s(t.name)}, ${s(t.category)}, '${JSON.stringify(t.steps).replace(/'/g, "''")}')`);
  }

  res.json({ success: true, created: templates.length });
});

router.delete("/cmms/spare-parts/:id", async (req: Request, res: Response) => {
  await init();
  await q(`DELETE FROM cmms_spare_parts WHERE id=${safeInt(req.params.id)}`);
  res.json({ success: true });
});

// Create purchase request from low-stock part
router.post("/cmms/spare-parts/:id/purchase-request", async (req: Request, res: Response) => {
  await init();
  const part = (await q(`SELECT * FROM cmms_spare_parts WHERE id=${safeInt(req.params.id)}`))[0] as Record<string, unknown> | undefined;
  if (!part) return res.status(404).json({ error: "Part not found" });
  const qty = safeNum(part.reorder_qty, 1);
  const unitCost = safeNum(part.unit_cost);
  const totalCost = qty * unitCost;
  const prNum = await nextNum("PR-", "purchase_requests", "request_number").catch(() => `PR-CMMS-${Date.now()}`);
  const inserted = await q(`INSERT INTO purchase_requests (request_number, item_description, quantity, unit, estimated_price, total_amount, status, notes, created_at, updated_at)
    VALUES (${s(prNum)}, ${s(`חלק חילוף: ${part.name} (${part.part_number})`)}, ${qty}, 'יחידה', ${unitCost}, ${totalCost}, 'pending', ${s(`דרישת רכש אוטומטית — מלאי נמוך (${part.current_stock}/${part.minimum_stock}). ספק: ${part.supplier_name || "לא הוגדר"}`)}, NOW(), NOW())
    RETURNING id`).catch(() => []);
  await q(`UPDATE cmms_spare_parts SET last_reorder_date=CURRENT_DATE WHERE id=${safeInt(req.params.id)}`);
  res.json({ success: true, purchaseRequestNumber: prNum, purchaseRequestId: (inserted[0] as Record<string, unknown>)?.id });
});

// ========== CONTRACTORS ==========

// SLA compliance summary — must be before /:id
router.get("/cmms/contractors/sla-compliance", async (_req: Request, res: Response) => {
  await init();
  const rows = await q(`SELECT c.id, c.company_name, c.sla_response_hours, c.sla_resolution_hours,
    COUNT(cwo.id) as total,
    COUNT(cwo.responded_at) as responded,
    COUNT(*) FILTER (WHERE cwo.responded_at IS NOT NULL AND EXTRACT(EPOCH FROM (cwo.responded_at - cwo.created_at))/3600 <= c.sla_response_hours) as response_met,
    COUNT(*) FILTER (WHERE cwo.resolved_at IS NOT NULL AND EXTRACT(EPOCH FROM (cwo.resolved_at - cwo.created_at))/3600 <= c.sla_resolution_hours) as resolution_met,
    COALESCE(SUM(cwo.cost),0) as total_cost
    FROM cmms_contractors c
    LEFT JOIN cmms_contractor_work_orders cwo ON cwo.contractor_id=c.id
    GROUP BY c.id, c.company_name, c.sla_response_hours, c.sla_resolution_hours
    ORDER BY c.company_name ASC`);
  res.json(rows);
});

router.get("/cmms/contractors", async (req: Request, res: Response) => {
  await init();
  const { status, search } = req.query as Record<string, string>;
  const conds: string[] = [];
  if (status && status !== "all") conds.push(`status=${s(status)}`);
  if (search) conds.push(`(company_name ILIKE ${s("%" + search + "%")} OR contact_person ILIKE ${s("%" + search + "%")} OR specializations ILIKE ${s("%" + search + "%")})`);
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const rows = await q(`SELECT c.*,
    (SELECT COUNT(*) FROM cmms_contractor_work_orders cwo WHERE cwo.contractor_id=c.id) as total_assignments,
    (SELECT COALESCE(SUM(cwo.cost),0) FROM cmms_contractor_work_orders cwo WHERE cwo.contractor_id=c.id) as total_cost,
    (SELECT COUNT(*) FROM cmms_contractor_work_orders cwo WHERE cwo.contractor_id=c.id AND cwo.responded_at IS NOT NULL AND EXTRACT(EPOCH FROM (cwo.responded_at - cwo.created_at))/3600 <= c.sla_response_hours) as sla_response_met,
    (SELECT COUNT(*) FROM cmms_contractor_work_orders cwo WHERE cwo.contractor_id=c.id AND cwo.responded_at IS NOT NULL) as sla_response_total
    FROM cmms_contractors c ${where} ORDER BY company_name ASC`);
  res.json(rows);
});

router.get("/cmms/contractors/:id", async (req: Request, res: Response) => {
  await init();
  const id = safeInt(req.params.id);
  const rows = await q(`SELECT * FROM cmms_contractors WHERE id=${id}`);
  if (!rows[0]) return res.status(404).json({ error: "Contractor not found" });
  const workOrders = await q(`SELECT cwo.*, wo.wo_number, wo.title, wo.status as wo_status, wo.scheduled_date, wo.completed_at
    FROM cmms_contractor_work_orders cwo
    LEFT JOIN cmms_work_orders wo ON wo.id=cwo.work_order_id
    WHERE cwo.contractor_id=${id} ORDER BY cwo.created_at DESC LIMIT 20`);
  res.json({ ...rows[0], workOrders });
});

router.post("/cmms/contractors", async (req: Request, res: Response) => {
  await init();
  const d = req.body;
  await q(`INSERT INTO cmms_contractors (company_name, contact_person, phone, email, specializations, hourly_rate, daily_rate, contract_start, contract_end, sla_response_hours, sla_resolution_hours, rating, status, notes)
    VALUES (${s(d.companyName)}, ${s(d.contactPerson)}, ${s(d.phone)}, ${s(d.email)}, ${s(d.specializations)}, ${safeNum(d.hourlyRate)}, ${safeNum(d.dailyRate)}, ${safeDate(d.contractStart)}, ${safeDate(d.contractEnd)}, ${safeNum(d.slaResponseHours, 24)}, ${safeNum(d.slaResolutionHours, 72)}, ${safeNum(d.rating)}, ${s(d.status || "active")}, ${s(d.notes)})`);
  const row = await q(`SELECT * FROM cmms_contractors ORDER BY id DESC LIMIT 1`);
  res.json(row[0]);
});

router.put("/cmms/contractors/:id", async (req: Request, res: Response) => {
  await init();
  const id = safeInt(req.params.id);
  const d = req.body;
  const sets: string[] = [];
  if (d.companyName !== undefined) sets.push(`company_name=${s(d.companyName)}`);
  if (d.contactPerson !== undefined) sets.push(`contact_person=${s(d.contactPerson)}`);
  if (d.phone !== undefined) sets.push(`phone=${s(d.phone)}`);
  if (d.email !== undefined) sets.push(`email=${s(d.email)}`);
  if (d.specializations !== undefined) sets.push(`specializations=${s(d.specializations)}`);
  if (d.hourlyRate !== undefined) sets.push(`hourly_rate=${safeNum(d.hourlyRate)}`);
  if (d.dailyRate !== undefined) sets.push(`daily_rate=${safeNum(d.dailyRate)}`);
  if (d.contractStart !== undefined) sets.push(`contract_start=${safeDate(d.contractStart)}`);
  if (d.contractEnd !== undefined) sets.push(`contract_end=${safeDate(d.contractEnd)}`);
  if (d.slaResponseHours !== undefined) sets.push(`sla_response_hours=${safeNum(d.slaResponseHours)}`);
  if (d.slaResolutionHours !== undefined) sets.push(`sla_resolution_hours=${safeNum(d.slaResolutionHours)}`);
  if (d.rating !== undefined) sets.push(`rating=${safeNum(d.rating)}`);
  if (d.status !== undefined) sets.push(`status=${s(d.status)}`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE cmms_contractors SET ${sets.join(",")} WHERE id=${id}`);
  const row = await q(`SELECT * FROM cmms_contractors WHERE id=${id}`);
  res.json(row[0]);
});

router.delete("/cmms/contractors/:id", async (req: Request, res: Response) => {
  await init();
  await q(`DELETE FROM cmms_contractors WHERE id=${safeInt(req.params.id)}`);
  res.json({ success: true });
});

router.post("/cmms/contractor-assignments", async (req: Request, res: Response) => {
  await init();
  const d = req.body;
  await q(`INSERT INTO cmms_contractor_work_orders (work_order_id, contractor_id, cost, notes)
    VALUES (${safeInt(d.workOrderId)}, ${safeInt(d.contractorId)}, ${safeNum(d.cost)}, ${s(d.notes)})`);
  const row = await q(`SELECT cwo.*, c.company_name, wo.wo_number FROM cmms_contractor_work_orders cwo LEFT JOIN cmms_contractors c ON c.id=cwo.contractor_id LEFT JOIN cmms_work_orders wo ON wo.id=cwo.work_order_id ORDER BY cwo.id DESC LIMIT 1`);
  res.json(row[0]);
});

router.put("/cmms/contractor-assignments/:id", async (req: Request, res: Response) => {
  await init();
  const id = safeInt(req.params.id);
  const d = req.body;
  const sets: string[] = [];
  if (d.respondedAt !== undefined) sets.push(`responded_at=${d.respondedAt ? `'${new Date(d.respondedAt).toISOString()}'` : "NULL"}`);
  if (d.resolvedAt !== undefined) sets.push(`resolved_at=${d.resolvedAt ? `'${new Date(d.resolvedAt).toISOString()}'` : "NULL"}`);
  if (d.cost !== undefined) sets.push(`cost=${safeNum(d.cost)}`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  if (sets.length) await q(`UPDATE cmms_contractor_work_orders SET ${sets.join(",")} WHERE id=${id}`);
  const row = await q(`SELECT * FROM cmms_contractor_work_orders WHERE id=${id}`);
  res.json(row[0]);
});

// ========== MAINTENANCE BUDGETS ==========

// Budget vs actuals tracking — must be before /:id
router.get("/cmms/maintenance-budgets/actuals", async (req: Request, res: Response) => {
  await init();
  const year = safeInt(req.query.year as string, new Date().getFullYear());

  const budgets = await q(`SELECT * FROM cmms_maintenance_budgets WHERE year=${year}`);

  const monthlyActuals = await q(`SELECT
    EXTRACT(MONTH FROM COALESCE(completed_at, created_at))::int as month,
    COALESCE(SUM(total_cost),0) as total_cost
    FROM cmms_work_orders
    WHERE EXTRACT(YEAR FROM COALESCE(completed_at, created_at))=${year} AND status='completed'
    GROUP BY EXTRACT(MONTH FROM COALESCE(completed_at, created_at))
    ORDER BY month ASC`);

  const deptActuals = await q(`SELECT
    COALESCE(department,'לא מוגדר') as department,
    COALESCE(SUM(total_cost),0) as actual_cost
    FROM cmms_work_orders
    WHERE EXTRACT(YEAR FROM COALESCE(completed_at, created_at))=${year} AND status='completed'
    GROUP BY department ORDER BY actual_cost DESC`);

  const totalBudget = (budgets as Record<string, unknown>[]).reduce((sum, b) => sum + safeNum(b.budget_amount), 0);
  const totalActual = (deptActuals as Record<string, unknown>[]).reduce((sum, d) => sum + safeNum(d.actual_cost), 0);
  const currentMonth = new Date().getMonth() + 1;
  const runRate = currentMonth > 0 ? (totalActual / currentMonth) * 12 : 0;

  const heMonths = ["", "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
  const monthlyChart = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const row = (monthlyActuals as Record<string, unknown>[]).find(r => Number(r.month) === m);
    return { month: heMonths[m], actual: safeNum(row?.total_cost) };
  });

  res.json({
    year,
    budgets,
    deptActuals,
    monthlyChart,
    totalBudget,
    totalActual,
    runRate,
    forecastYearEnd: runRate,
    variancePct: totalBudget > 0 ? ((totalActual / totalBudget) * 100) : 0,
  });
});

router.get("/cmms/maintenance-budgets", async (req: Request, res: Response) => {
  await init();
  const year = safeInt(req.query.year as string, new Date().getFullYear());
  const r = await db.execute(sql`SELECT * FROM cmms_maintenance_budgets WHERE year=${year} ORDER BY department ASC, asset_category ASC`);
  const rows = (r as unknown as { rows?: Record<string, unknown>[] }).rows || [];
  res.json(rows);
});

router.post("/cmms/maintenance-budgets", async (req: Request, res: Response) => {
  await init();
  const d = req.body;
  const year = safeInt(d.year, new Date().getFullYear());
  await db.execute(sql`INSERT INTO cmms_maintenance_budgets (year, department, asset_category, budget_amount, notes)
    VALUES (${year}, ${d.department ?? null}, ${d.assetCategory ?? null}, ${safeNum(d.budgetAmount)}, ${d.notes ?? null})`);
  const row = await q(`SELECT * FROM cmms_maintenance_budgets ORDER BY id DESC LIMIT 1`);
  res.json(row[0]);
});

router.put("/cmms/maintenance-budgets/:id", async (req: Request, res: Response) => {
  await init();
  const id = safeInt(req.params.id);
  const d = req.body;
  const sets: string[] = [];
  if (d.year !== undefined) sets.push(`year=${safeInt(d.year)}`);
  if (d.department !== undefined) sets.push(`department=${s(d.department)}`);
  if (d.assetCategory !== undefined) sets.push(`asset_category=${s(d.assetCategory)}`);
  if (d.budgetAmount !== undefined) sets.push(`budget_amount=${safeNum(d.budgetAmount)}`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE cmms_maintenance_budgets SET ${sets.join(",")} WHERE id=${id}`);
  const row = await q(`SELECT * FROM cmms_maintenance_budgets WHERE id=${id}`);
  res.json(row[0]);
});

router.delete("/cmms/maintenance-budgets/:id", async (req: Request, res: Response) => {
  await init();
  await q(`DELETE FROM cmms_maintenance_budgets WHERE id=${safeInt(req.params.id)}`);
  res.json({ success: true });
});

export default router;
