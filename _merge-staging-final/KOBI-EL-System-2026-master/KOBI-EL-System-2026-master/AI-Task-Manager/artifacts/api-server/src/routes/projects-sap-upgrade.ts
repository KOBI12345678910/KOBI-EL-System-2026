import { Router, Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { validateSession } from "../lib/auth";

const router = Router();

// ========== אימות משתמש ==========
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

// ========== עזרים כלליים ==========
async function q(query: string) {
  try { const r = await db.execute(sql.raw(query)); return r.rows || []; }
  catch (e: any) { console.error("Projects-SAP query error:", e.message); return []; }
}
async function nextNum(prefix: string, table: string, col: string) {
  const year = new Date().getFullYear();
  const rows = await q(`SELECT ${col} FROM ${table} WHERE ${col} LIKE '${prefix}${year}-%' ORDER BY id DESC LIMIT 1`);
  const last = (rows[0] as any)?.[col];
  const seq = last ? parseInt(last.split("-").pop()!) + 1 : 1;
  return `${prefix}${year}-${String(seq).padStart(4, "0")}`;
}
function esc(v: any): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

// ========== יצירת טבלאות SAP ניהול פרויקטים ==========
async function ensureProjectsSapTables() {
  // טבלת תקציבי פרויקטים
  await q(`CREATE TABLE IF NOT EXISTS project_budgets (
    id SERIAL PRIMARY KEY,
    project_id INTEGER,
    project_name VARCHAR(255),
    budget_type VARCHAR(50) CHECK (budget_type IN ('capital','operational','contingency')),
    category VARCHAR(255),
    planned_amount NUMERIC(15,2) DEFAULT 0,
    approved_amount NUMERIC(15,2) DEFAULT 0,
    committed_amount NUMERIC(15,2) DEFAULT 0,
    actual_amount NUMERIC(15,2) DEFAULT 0,
    remaining_amount NUMERIC(15,2) DEFAULT 0,
    currency VARCHAR(10) DEFAULT 'ILS',
    fiscal_year INTEGER,
    period VARCHAR(50),
    variance NUMERIC(15,2) DEFAULT 0,
    variance_pct NUMERIC(8,2) DEFAULT 0,
    approval_status VARCHAR(50) DEFAULT 'draft' CHECK (approval_status IN ('draft','submitted','approved','rejected')),
    approved_by VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  // טבלת משאבי פרויקט
  await q(`CREATE TABLE IF NOT EXISTS project_resources_sap (
    id SERIAL PRIMARY KEY,
    project_id INTEGER,
    project_name VARCHAR(255),
    resource_type VARCHAR(50) CHECK (resource_type IN ('employee','contractor','equipment','material')),
    resource_id INTEGER,
    resource_name VARCHAR(255),
    role VARCHAR(255),
    allocation_percent NUMERIC(5,2) DEFAULT 100,
    hourly_rate NUMERIC(10,2),
    planned_hours NUMERIC(10,2),
    actual_hours NUMERIC(10,2) DEFAULT 0,
    start_date DATE,
    end_date DATE,
    cost_to_date NUMERIC(15,2) DEFAULT 0,
    status VARCHAR(50) DEFAULT 'planned' CHECK (status IN ('planned','active','released','completed')),
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  // טבלת סיכוני פרויקט
  await q(`CREATE TABLE IF NOT EXISTS project_risks (
    id SERIAL PRIMARY KEY,
    risk_number VARCHAR(50) UNIQUE,
    project_id INTEGER,
    project_name VARCHAR(255),
    risk_category VARCHAR(50) CHECK (risk_category IN ('technical','schedule','budget','resource','scope','external','quality','safety')),
    title VARCHAR(255),
    description TEXT,
    probability VARCHAR(20) CHECK (probability IN ('very_low','low','medium','high','very_high')),
    impact VARCHAR(20) CHECK (impact IN ('very_low','low','medium','high','very_high')),
    risk_score NUMERIC(5,2) DEFAULT 0,
    mitigation_strategy TEXT,
    contingency_plan TEXT,
    risk_owner VARCHAR(255),
    identified_date DATE DEFAULT CURRENT_DATE,
    review_date DATE,
    status VARCHAR(50) DEFAULT 'identified' CHECK (status IN ('identified','analyzing','mitigating','monitoring','closed','materialized')),
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  // טבלת בקשות שינוי
  await q(`CREATE TABLE IF NOT EXISTS project_change_requests (
    id SERIAL PRIMARY KEY,
    cr_number VARCHAR(50) UNIQUE,
    project_id INTEGER,
    project_name VARCHAR(255),
    title VARCHAR(255),
    description TEXT,
    change_type VARCHAR(50) CHECK (change_type IN ('scope','schedule','budget','resource','quality')),
    impact_analysis TEXT,
    cost_impact NUMERIC(15,2) DEFAULT 0,
    schedule_impact_days INTEGER DEFAULT 0,
    requested_by VARCHAR(255),
    request_date DATE DEFAULT CURRENT_DATE,
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
    review_board JSONB DEFAULT '[]',
    approval_status VARCHAR(50) DEFAULT 'submitted' CHECK (approval_status IN ('submitted','reviewing','approved','rejected','deferred')),
    approved_by VARCHAR(255),
    approved_at TIMESTAMPTZ,
    implementation_status VARCHAR(50) DEFAULT 'pending' CHECK (implementation_status IN ('pending','in_progress','completed')),
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  // טבלת דיווחי שעות
  await q(`CREATE TABLE IF NOT EXISTS project_timesheets (
    id SERIAL PRIMARY KEY,
    timesheet_number VARCHAR(50) UNIQUE,
    employee_id INTEGER,
    employee_name VARCHAR(255),
    project_id INTEGER,
    project_name VARCHAR(255),
    task_name VARCHAR(255),
    work_date DATE DEFAULT CURRENT_DATE,
    hours NUMERIC(5,2) DEFAULT 0,
    overtime_hours NUMERIC(5,2) DEFAULT 0,
    billable BOOLEAN DEFAULT true,
    hourly_rate NUMERIC(10,2),
    total_cost NUMERIC(15,2) DEFAULT 0,
    description TEXT,
    approval_status VARCHAR(50) DEFAULT 'draft' CHECK (approval_status IN ('draft','submitted','approved','rejected')),
    approved_by VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  // טבלת תוצרי פרויקט
  await q(`CREATE TABLE IF NOT EXISTS project_deliverables (
    id SERIAL PRIMARY KEY,
    deliverable_number VARCHAR(50) UNIQUE,
    project_id INTEGER,
    project_name VARCHAR(255),
    title VARCHAR(255),
    description TEXT,
    type VARCHAR(50) CHECK (type IN ('document','software','hardware','service','milestone')),
    category VARCHAR(255),
    assigned_to VARCHAR(255),
    planned_date DATE,
    actual_date DATE,
    acceptance_criteria TEXT,
    accepted_by VARCHAR(255),
    accepted_at TIMESTAMPTZ,
    quality_score INTEGER,
    status VARCHAR(50) DEFAULT 'planned' CHECK (status IN ('planned','in_progress','submitted','under_review','accepted','rejected')),
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  // טבלת מדדי ערך מוסף (Earned Value Metrics)
  await q(`CREATE TABLE IF NOT EXISTS earned_value_metrics (
    id SERIAL PRIMARY KEY,
    project_id INTEGER,
    project_name VARCHAR(255),
    period DATE,
    planned_value NUMERIC(15,2) DEFAULT 0,
    earned_value NUMERIC(15,2) DEFAULT 0,
    actual_cost NUMERIC(15,2) DEFAULT 0,
    schedule_variance NUMERIC(15,2) DEFAULT 0,
    cost_variance NUMERIC(15,2) DEFAULT 0,
    spi NUMERIC(8,4) DEFAULT 0,
    cpi NUMERIC(8,4) DEFAULT 0,
    eac NUMERIC(15,2) DEFAULT 0,
    etc NUMERIC(15,2) DEFAULT 0,
    vac NUMERIC(15,2) DEFAULT 0,
    percent_complete NUMERIC(5,2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);
}

// ========== POST /init - אתחול טבלאות ==========
router.post("/projects-sap/init", async (_req, res) => {
  try {
    await ensureProjectsSapTables();
    res.json({ success: true, message: "Projects SAP tables initialized successfully" });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ========================================
// GENERIC CRUD FACTORY
// ========================================
interface TableConfig {
  tableName: string;
  routePath: string;
  numberPrefix: string;
  numberColumn: string | null;
  columns: string[];
  defaults: Record<string, any>;
}

const TABLES: TableConfig[] = [
  {
    tableName: "project_budgets",
    routePath: "project-budgets-sap",
    numberPrefix: "",
    numberColumn: null,
    columns: ["project_id","project_name","budget_type","category","planned_amount","approved_amount","committed_amount","actual_amount","remaining_amount","currency","fiscal_year","period","variance","variance_pct","approval_status","approved_by","notes"],
    defaults: { budget_type: "operational", currency: "ILS", approval_status: "draft" }
  },
  {
    tableName: "project_resources_sap",
    routePath: "project-resources-sap",
    numberPrefix: "",
    numberColumn: null,
    columns: ["project_id","project_name","resource_type","resource_id","resource_name","role","allocation_percent","hourly_rate","planned_hours","actual_hours","start_date","end_date","cost_to_date","status","notes"],
    defaults: { resource_type: "employee", allocation_percent: 100, status: "planned" }
  },
  {
    tableName: "project_risks",
    routePath: "project-risks-sap",
    numberPrefix: "RSK-",
    numberColumn: "risk_number",
    columns: ["risk_number","project_id","project_name","risk_category","title","description","probability","impact","risk_score","mitigation_strategy","contingency_plan","risk_owner","identified_date","review_date","status","notes"],
    defaults: { risk_category: "technical", probability: "medium", impact: "medium", status: "identified" }
  },
  {
    tableName: "project_change_requests",
    routePath: "project-change-requests",
    numberPrefix: "CR-",
    numberColumn: "cr_number",
    columns: ["cr_number","project_id","project_name","title","description","change_type","impact_analysis","cost_impact","schedule_impact_days","requested_by","request_date","priority","review_board","approval_status","approved_by","approved_at","implementation_status","notes"],
    defaults: { change_type: "scope", priority: "medium", approval_status: "submitted", implementation_status: "pending" }
  },
  {
    tableName: "project_timesheets",
    routePath: "project-timesheets",
    numberPrefix: "TS-",
    numberColumn: "timesheet_number",
    columns: ["timesheet_number","employee_id","employee_name","project_id","project_name","task_name","work_date","hours","overtime_hours","billable","hourly_rate","total_cost","description","approval_status","approved_by","notes"],
    defaults: { approval_status: "draft", billable: true, overtime_hours: 0 }
  },
  {
    tableName: "project_deliverables",
    routePath: "project-deliverables-sap",
    numberPrefix: "DLV-",
    numberColumn: "deliverable_number",
    columns: ["deliverable_number","project_id","project_name","title","description","type","category","assigned_to","planned_date","actual_date","acceptance_criteria","accepted_by","accepted_at","quality_score","status","notes"],
    defaults: { type: "document", status: "planned" }
  },
  {
    tableName: "earned_value_metrics",
    routePath: "earned-value-metrics",
    numberPrefix: "",
    numberColumn: null,
    columns: ["project_id","project_name","period","planned_value","earned_value","actual_cost","schedule_variance","cost_variance","spi","cpi","eac","etc","vac","percent_complete","notes"],
    defaults: {}
  }
];

// Generate CRUD routes for all 7 tables
for (const cfg of TABLES) {
  const { tableName, routePath, numberPrefix, numberColumn, columns, defaults } = cfg;

  // GET all (with optional ?projectId filter)
  router.get(`/${routePath}`, async (req, res) => {
    try {
      const projectId = req.query.projectId;
      let query = `SELECT * FROM ${tableName}`;
      if (projectId) query += ` WHERE project_id = ${parseInt(String(projectId))}`;
      query += ` ORDER BY id DESC`;
      res.json(await q(query));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // GET stats
  router.get(`/${routePath}/stats`, async (req, res) => {
    try {
      const projectId = req.query.projectId;
      const where = projectId ? `WHERE project_id = ${parseInt(String(projectId))}` : "";
      const rows = await q(`SELECT COUNT(*) as total FROM ${tableName} ${where}`);
      res.json(rows[0] || { total: 0 });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // GET by id
  router.get(`/${routePath}/:id`, async (req, res) => {
    try {
      const rows = await q(`SELECT * FROM ${tableName} WHERE id = ${parseInt(req.params.id)}`);
      if (!rows.length) return res.status(404).json({ error: "Not found" });
      res.json(rows[0]);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  // POST create
  router.post(`/${routePath}`, async (req, res) => {
    try {
      const d = { ...defaults, ...req.body };
      // Auto-generate number if applicable
      if (numberColumn && numberPrefix && !d[numberColumn]) {
        d[numberColumn] = await nextNum(numberPrefix, tableName, numberColumn);
      }
      // Auto-calculate risk score
      if (tableName === "project_risks" && d.probability && d.impact) {
        const probMap: Record<string, number> = { very_low: 1, low: 2, medium: 3, high: 4, very_high: 5 };
        const impMap: Record<string, number> = { very_low: 1, low: 2, medium: 3, high: 4, very_high: 5 };
        d.risk_score = (probMap[d.probability] || 3) * (impMap[d.impact] || 3);
      }
      // Auto-calculate timesheet cost
      if (tableName === "project_timesheets" && d.hourly_rate) {
        const hrs = parseFloat(d.hours || 0) + parseFloat(d.overtime_hours || 0) * 1.25;
        d.total_cost = hrs * parseFloat(d.hourly_rate);
      }
      // Auto-calculate budget remaining and variance
      if (tableName === "project_budgets") {
        const planned = parseFloat(d.planned_amount || 0);
        const actual = parseFloat(d.actual_amount || 0);
        d.remaining_amount = planned - actual;
        d.variance = planned - actual;
        d.variance_pct = planned > 0 ? ((planned - actual) / planned * 100) : 0;
      }
      // Auto-calculate EVM fields
      if (tableName === "earned_value_metrics") {
        const pv = parseFloat(d.planned_value || 0);
        const ev = parseFloat(d.earned_value || 0);
        const ac = parseFloat(d.actual_cost || 0);
        d.schedule_variance = ev - pv;
        d.cost_variance = ev - ac;
        d.spi = pv > 0 ? (ev / pv) : 0;
        d.cpi = ac > 0 ? (ev / ac) : 0;
        // EAC = BAC / CPI (estimate at completion)
        if (d.cpi > 0 && pv > 0) {
          d.eac = pv / d.cpi;
          d.etc = d.eac - ac;
          d.vac = pv - d.eac;
        }
      }
      const cols = columns.filter(c => d[c] !== undefined);
      const vals = cols.map(c => esc(d[c]));
      await q(`INSERT INTO ${tableName} (${cols.join(",")}) VALUES (${vals.join(",")})`);
      if (numberColumn && d[numberColumn]) {
        const rows = await q(`SELECT * FROM ${tableName} WHERE ${numberColumn} = ${esc(d[numberColumn])}`);
        return res.status(201).json(rows[0]);
      }
      const rows = await q(`SELECT * FROM ${tableName} ORDER BY id DESC LIMIT 1`);
      res.status(201).json(rows[0]);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  // PUT update
  router.put(`/${routePath}/:id`, async (req, res) => {
    try {
      const d = req.body;
      const sets: string[] = [];
      for (const col of columns) {
        if (d[col] !== undefined) {
          sets.push(`${col} = ${esc(d[col])}`);
        }
      }
      // Recalculate risk score on update
      if (tableName === "project_risks" && (d.probability || d.impact)) {
        const existing = await q(`SELECT probability, impact FROM ${tableName} WHERE id = ${req.params.id}`);
        if (existing.length) {
          const prob = d.probability || (existing[0] as any).probability;
          const imp = d.impact || (existing[0] as any).impact;
          const probMap: Record<string, number> = { very_low: 1, low: 2, medium: 3, high: 4, very_high: 5 };
          const impMap: Record<string, number> = { very_low: 1, low: 2, medium: 3, high: 4, very_high: 5 };
          sets.push(`risk_score = ${(probMap[prob] || 3) * (impMap[imp] || 3)}`);
        }
      }
      // Recalculate timesheet cost on update
      if (tableName === "project_timesheets" && (d.hours !== undefined || d.overtime_hours !== undefined || d.hourly_rate !== undefined)) {
        const existing = await q(`SELECT hours, overtime_hours, hourly_rate FROM ${tableName} WHERE id = ${req.params.id}`);
        if (existing.length) {
          const hrs = parseFloat(d.hours ?? (existing[0] as any).hours ?? 0);
          const ot = parseFloat(d.overtime_hours ?? (existing[0] as any).overtime_hours ?? 0);
          const rate = parseFloat(d.hourly_rate ?? (existing[0] as any).hourly_rate ?? 0);
          sets.push(`total_cost = ${(hrs + ot * 1.25) * rate}`);
        }
      }
      // Recalculate budget variance on update
      if (tableName === "project_budgets" && (d.planned_amount !== undefined || d.actual_amount !== undefined)) {
        const existing = await q(`SELECT planned_amount, actual_amount FROM ${tableName} WHERE id = ${req.params.id}`);
        if (existing.length) {
          const planned = parseFloat(d.planned_amount ?? (existing[0] as any).planned_amount ?? 0);
          const actual = parseFloat(d.actual_amount ?? (existing[0] as any).actual_amount ?? 0);
          sets.push(`remaining_amount = ${planned - actual}`);
          sets.push(`variance = ${planned - actual}`);
          sets.push(`variance_pct = ${planned > 0 ? ((planned - actual) / planned * 100) : 0}`);
        }
      }
      // Recalculate EVM on update
      if (tableName === "earned_value_metrics" && (d.planned_value !== undefined || d.earned_value !== undefined || d.actual_cost !== undefined)) {
        const existing = await q(`SELECT planned_value, earned_value, actual_cost FROM ${tableName} WHERE id = ${req.params.id}`);
        if (existing.length) {
          const pv = parseFloat(d.planned_value ?? (existing[0] as any).planned_value ?? 0);
          const ev = parseFloat(d.earned_value ?? (existing[0] as any).earned_value ?? 0);
          const ac = parseFloat(d.actual_cost ?? (existing[0] as any).actual_cost ?? 0);
          sets.push(`schedule_variance = ${ev - pv}`);
          sets.push(`cost_variance = ${ev - ac}`);
          sets.push(`spi = ${pv > 0 ? (ev / pv) : 0}`);
          sets.push(`cpi = ${ac > 0 ? (ev / ac) : 0}`);
          const cpi = ac > 0 ? (ev / ac) : 0;
          if (cpi > 0 && pv > 0) {
            const eac = pv / cpi;
            sets.push(`eac = ${eac}`);
            sets.push(`etc = ${eac - ac}`);
            sets.push(`vac = ${pv - eac}`);
          }
        }
      }
      if (!sets.length) return res.status(400).json({ error: "No fields to update" });
      sets.push("updated_at = NOW()");
      await q(`UPDATE ${tableName} SET ${sets.join(",")} WHERE id = ${parseInt(req.params.id)}`);
      const rows = await q(`SELECT * FROM ${tableName} WHERE id = ${parseInt(req.params.id)}`);
      if (!rows.length) return res.status(404).json({ error: "Not found" });
      res.json(rows[0]);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  // DELETE
  router.delete(`/${routePath}/:id`, async (req, res) => {
    try {
      await q(`DELETE FROM ${tableName} WHERE id = ${parseInt(req.params.id)}`);
      res.json({ success: true });
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });
}

// ========================================
// SPECIAL ENDPOINTS
// ========================================

// ========== GET /earned-value/:projectId - EVM Dashboard ==========
router.get("/projects-sap/earned-value/:projectId", async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);

    // Latest EVM snapshot
    const latest = await q(`SELECT * FROM earned_value_metrics WHERE project_id = ${projectId} ORDER BY period DESC LIMIT 1`);

    // EVM trend over time
    const trend = await q(`SELECT period, planned_value, earned_value, actual_cost, spi, cpi, percent_complete
      FROM earned_value_metrics WHERE project_id = ${projectId} ORDER BY period ASC`);

    // Budget summary
    const budgetRows = await q(`SELECT
      COALESCE(SUM(planned_amount),0) as total_planned,
      COALESCE(SUM(approved_amount),0) as total_approved,
      COALESCE(SUM(committed_amount),0) as total_committed,
      COALESCE(SUM(actual_amount),0) as total_actual,
      COALESCE(SUM(remaining_amount),0) as total_remaining
      FROM project_budgets WHERE project_id = ${projectId}`);

    // Timesheet cost summary
    const timesheetRows = await q(`SELECT
      COALESCE(SUM(hours),0) as total_hours,
      COALESCE(SUM(overtime_hours),0) as total_overtime,
      COALESCE(SUM(total_cost),0) as total_labor_cost,
      COUNT(DISTINCT employee_id) as unique_workers
      FROM project_timesheets WHERE project_id = ${projectId}`);

    const currentEvm = latest[0] as any || {};
    const healthStatus = currentEvm.cpi >= 0.95 && currentEvm.spi >= 0.95 ? "green"
      : currentEvm.cpi >= 0.8 && currentEvm.spi >= 0.8 ? "yellow" : "red";

    res.json({
      project_id: projectId,
      current: currentEvm,
      trend,
      budget_summary: budgetRows[0] || {},
      labor_summary: timesheetRows[0] || {},
      health_status: healthStatus,
      generated_at: new Date().toISOString()
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ========== GET /resource-utilization - Resource Allocation Heatmap ==========
router.get("/projects-sap/resource-utilization", async (req, res) => {
  try {
    // Resource allocation across projects
    const allocations = await q(`SELECT
      resource_name, resource_type, role,
      project_id, project_name,
      allocation_percent, hourly_rate,
      planned_hours, actual_hours, cost_to_date, status,
      start_date, end_date
      FROM project_resources_sap WHERE status IN ('planned','active')
      ORDER BY resource_name, project_name`);

    // Aggregate utilization per resource
    const utilizationByResource = await q(`SELECT
      resource_name,
      resource_type,
      COUNT(DISTINCT project_id) as project_count,
      SUM(allocation_percent) as total_allocation,
      SUM(planned_hours) as total_planned_hours,
      SUM(actual_hours) as total_actual_hours,
      SUM(cost_to_date) as total_cost
      FROM project_resources_sap WHERE status IN ('planned','active')
      GROUP BY resource_name, resource_type
      ORDER BY total_allocation DESC`);

    // Over-allocated resources (>100%)
    const overAllocated = await q(`SELECT resource_name, resource_type, SUM(allocation_percent) as total_allocation,
      COUNT(DISTINCT project_id) as project_count
      FROM project_resources_sap WHERE status IN ('planned','active')
      GROUP BY resource_name, resource_type
      HAVING SUM(allocation_percent) > 100
      ORDER BY total_allocation DESC`);

    // Under-utilized resources (<50%)
    const underUtilized = await q(`SELECT resource_name, resource_type, SUM(allocation_percent) as total_allocation,
      COUNT(DISTINCT project_id) as project_count
      FROM project_resources_sap WHERE status IN ('planned','active')
      GROUP BY resource_name, resource_type
      HAVING SUM(allocation_percent) < 50
      ORDER BY total_allocation ASC`);

    // Resource type breakdown
    const typeBreakdown = await q(`SELECT
      resource_type,
      COUNT(*) as count,
      COUNT(DISTINCT resource_name) as unique_resources,
      AVG(allocation_percent) as avg_allocation,
      SUM(cost_to_date) as total_cost
      FROM project_resources_sap WHERE status IN ('planned','active')
      GROUP BY resource_type ORDER BY count DESC`);

    res.json({
      allocations,
      utilization_by_resource: utilizationByResource,
      over_allocated: overAllocated,
      under_utilized: underUtilized,
      type_breakdown: typeBreakdown,
      summary: {
        total_resources: utilizationByResource.length,
        over_allocated_count: overAllocated.length,
        under_utilized_count: underUtilized.length
      },
      generated_at: new Date().toISOString()
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ========== GET /budget-vs-actual/:projectId ==========
router.get("/projects-sap/budget-vs-actual/:projectId", async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);

    // Budget lines by category
    const byCategory = await q(`SELECT
      category, budget_type,
      COALESCE(SUM(planned_amount),0) as planned,
      COALESCE(SUM(approved_amount),0) as approved,
      COALESCE(SUM(committed_amount),0) as committed,
      COALESCE(SUM(actual_amount),0) as actual,
      COALESCE(SUM(remaining_amount),0) as remaining,
      COALESCE(SUM(variance),0) as variance
      FROM project_budgets WHERE project_id = ${projectId}
      GROUP BY category, budget_type ORDER BY category`);

    // Overall totals
    const totals = await q(`SELECT
      COALESCE(SUM(planned_amount),0) as total_planned,
      COALESCE(SUM(approved_amount),0) as total_approved,
      COALESCE(SUM(committed_amount),0) as total_committed,
      COALESCE(SUM(actual_amount),0) as total_actual,
      COALESCE(SUM(remaining_amount),0) as total_remaining
      FROM project_budgets WHERE project_id = ${projectId}`);

    // Budget by type
    const byType = await q(`SELECT
      budget_type,
      COALESCE(SUM(planned_amount),0) as planned,
      COALESCE(SUM(actual_amount),0) as actual,
      COALESCE(SUM(remaining_amount),0) as remaining
      FROM project_budgets WHERE project_id = ${projectId}
      GROUP BY budget_type`);

    // Fiscal year trend
    const yearTrend = await q(`SELECT
      fiscal_year,
      COALESCE(SUM(planned_amount),0) as planned,
      COALESCE(SUM(actual_amount),0) as actual
      FROM project_budgets WHERE project_id = ${projectId} AND fiscal_year IS NOT NULL
      GROUP BY fiscal_year ORDER BY fiscal_year`);

    // Labor cost from timesheets
    const laborCost = await q(`SELECT
      COALESCE(SUM(total_cost),0) as total_labor_cost,
      COALESCE(SUM(hours),0) as total_hours,
      COALESCE(SUM(overtime_hours),0) as overtime_hours
      FROM project_timesheets WHERE project_id = ${projectId}`);

    const t = totals[0] as any || {};
    const burnRate = t.total_actual > 0 && t.total_planned > 0
      ? ((t.total_actual / t.total_planned) * 100).toFixed(1)
      : "0";

    res.json({
      project_id: projectId,
      by_category: byCategory,
      by_type: byType,
      totals: t,
      year_trend: yearTrend,
      labor_cost: laborCost[0] || {},
      burn_rate_pct: parseFloat(burnRate),
      health: parseFloat(burnRate) <= 90 ? "green" : parseFloat(burnRate) <= 100 ? "yellow" : "red",
      generated_at: new Date().toISOString()
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ========== GET /risk-matrix/:projectId - Probability vs Impact ==========
router.get("/projects-sap/risk-matrix/:projectId", async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);

    // All active risks for the project
    const risks = await q(`SELECT * FROM project_risks WHERE project_id = ${projectId} AND status NOT IN ('closed') ORDER BY risk_score DESC`);

    // Matrix cells: count risks per probability-impact combination
    const matrix = await q(`SELECT
      probability, impact, COUNT(*) as count,
      ARRAY_AGG(title) as risk_titles
      FROM project_risks WHERE project_id = ${projectId} AND status NOT IN ('closed')
      GROUP BY probability, impact`);

    // Category distribution
    const byCategory = await q(`SELECT
      risk_category, COUNT(*) as count,
      AVG(risk_score) as avg_score,
      MAX(risk_score) as max_score
      FROM project_risks WHERE project_id = ${projectId} AND status NOT IN ('closed')
      GROUP BY risk_category ORDER BY avg_score DESC`);

    // Status distribution
    const byStatus = await q(`SELECT status, COUNT(*) as count
      FROM project_risks WHERE project_id = ${projectId}
      GROUP BY status ORDER BY count DESC`);

    // Top risks
    const topRisks = await q(`SELECT id, risk_number, title, risk_category, probability, impact, risk_score, risk_owner, status
      FROM project_risks WHERE project_id = ${projectId} AND status NOT IN ('closed')
      ORDER BY risk_score DESC LIMIT 10`);

    // Risks needing review (review_date passed)
    const overdue = await q(`SELECT id, risk_number, title, risk_score, review_date, risk_owner
      FROM project_risks WHERE project_id = ${projectId} AND status NOT IN ('closed')
      AND review_date IS NOT NULL AND review_date < CURRENT_DATE
      ORDER BY review_date ASC`);

    const totalActive = risks.length;
    const avgScore = risks.length > 0 ? risks.reduce((s: number, r: any) => s + parseFloat(r.risk_score || 0), 0) / risks.length : 0;
    const highRisks = risks.filter((r: any) => parseFloat(r.risk_score) >= 15).length;

    res.json({
      project_id: projectId,
      matrix,
      risks,
      by_category: byCategory,
      by_status: byStatus,
      top_risks: topRisks,
      overdue_reviews: overdue,
      summary: {
        total_active: totalActive,
        avg_score: Math.round(avgScore * 100) / 100,
        high_risk_count: highRisks,
        overdue_review_count: overdue.length
      },
      risk_level: highRisks > 3 ? "critical" : highRisks > 0 ? "elevated" : avgScore > 9 ? "moderate" : "low",
      generated_at: new Date().toISOString()
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ========== GET /project-health - Multi-Project Health Dashboard ==========
router.get("/projects-sap/project-health", async (_req, res) => {
  try {
    // Get distinct projects from budgets and resources
    const projects = await q(`SELECT DISTINCT project_id, project_name FROM (
      SELECT project_id, project_name FROM project_budgets WHERE project_id IS NOT NULL
      UNION
      SELECT project_id, project_name FROM project_resources_sap WHERE project_id IS NOT NULL
      UNION
      SELECT project_id, project_name FROM earned_value_metrics WHERE project_id IS NOT NULL
      UNION
      SELECT project_id, project_name FROM project_risks WHERE project_id IS NOT NULL
    ) AS all_projects ORDER BY project_id`);

    const healthCards: any[] = [];

    for (const proj of projects as any[]) {
      const pid = proj.project_id;

      // Budget health
      const budget = await q(`SELECT
        COALESCE(SUM(planned_amount),0) as planned,
        COALESCE(SUM(actual_amount),0) as actual,
        COALESCE(SUM(remaining_amount),0) as remaining
        FROM project_budgets WHERE project_id = ${pid}`);

      // Latest EVM
      const evm = await q(`SELECT spi, cpi, percent_complete, eac FROM earned_value_metrics
        WHERE project_id = ${pid} ORDER BY period DESC LIMIT 1`);

      // Risk summary
      const riskSummary = await q(`SELECT COUNT(*) as total_risks,
        COUNT(*) FILTER (WHERE risk_score >= 15) as high_risks,
        AVG(risk_score) as avg_risk_score
        FROM project_risks WHERE project_id = ${pid} AND status NOT IN ('closed')`);

      // Open change requests
      const crSummary = await q(`SELECT COUNT(*) as total_crs,
        COUNT(*) FILTER (WHERE approval_status IN ('submitted','reviewing')) as pending_crs
        FROM project_change_requests WHERE project_id = ${pid}`);

      // Deliverables progress
      const deliverableSummary = await q(`SELECT COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'accepted') as completed,
        COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
        COUNT(*) FILTER (WHERE planned_date < CURRENT_DATE AND status NOT IN ('accepted','rejected')) as overdue
        FROM project_deliverables WHERE project_id = ${pid}`);

      // Resource count
      const resourceCount = await q(`SELECT COUNT(*) as active_resources,
        SUM(cost_to_date) as resource_cost
        FROM project_resources_sap WHERE project_id = ${pid} AND status IN ('planned','active')`);

      const b = budget[0] as any || {};
      const e = evm[0] as any || {};
      const r = riskSummary[0] as any || {};
      const cr = crSummary[0] as any || {};
      const dl = deliverableSummary[0] as any || {};
      const rc = resourceCount[0] as any || {};

      // Calculate composite health score (0-100)
      let score = 100;
      const spi = parseFloat(e.spi || 1);
      const cpi = parseFloat(e.cpi || 1);
      if (spi < 1) score -= (1 - spi) * 30;
      if (cpi < 1) score -= (1 - cpi) * 30;
      if (parseInt(r.high_risks || 0) > 0) score -= parseInt(r.high_risks) * 5;
      if (parseInt(dl.overdue || 0) > 0) score -= parseInt(dl.overdue) * 3;
      if (parseInt(cr.pending_crs || 0) > 3) score -= 5;
      const budgetBurn = parseFloat(b.planned) > 0 ? (parseFloat(b.actual) / parseFloat(b.planned)) * 100 : 0;
      if (budgetBurn > 100) score -= (budgetBurn - 100);
      score = Math.max(0, Math.min(100, Math.round(score)));

      const status = score >= 80 ? "green" : score >= 60 ? "yellow" : "red";

      healthCards.push({
        project_id: pid,
        project_name: proj.project_name,
        health_score: score,
        health_status: status,
        budget: {
          planned: parseFloat(b.planned || 0),
          actual: parseFloat(b.actual || 0),
          remaining: parseFloat(b.remaining || 0),
          burn_pct: budgetBurn
        },
        schedule: {
          spi,
          cpi,
          percent_complete: parseFloat(e.percent_complete || 0),
          eac: parseFloat(e.eac || 0)
        },
        risks: {
          total: parseInt(r.total_risks || 0),
          high: parseInt(r.high_risks || 0),
          avg_score: parseFloat(r.avg_risk_score || 0)
        },
        change_requests: {
          total: parseInt(cr.total_crs || 0),
          pending: parseInt(cr.pending_crs || 0)
        },
        deliverables: {
          total: parseInt(dl.total || 0),
          completed: parseInt(dl.completed || 0),
          overdue: parseInt(dl.overdue || 0)
        },
        resources: {
          active: parseInt(rc.active_resources || 0),
          cost: parseFloat(rc.resource_cost || 0)
        }
      });
    }

    // Sort by health score ascending (worst first)
    healthCards.sort((a, b) => a.health_score - b.health_score);

    const greenCount = healthCards.filter(h => h.health_status === "green").length;
    const yellowCount = healthCards.filter(h => h.health_status === "yellow").length;
    const redCount = healthCards.filter(h => h.health_status === "red").length;

    res.json({
      projects: healthCards,
      summary: {
        total_projects: healthCards.length,
        green: greenCount,
        yellow: yellowCount,
        red: redCount,
        avg_health_score: healthCards.length > 0
          ? Math.round(healthCards.reduce((s, h) => s + h.health_score, 0) / healthCards.length)
          : 0
      },
      generated_at: new Date().toISOString()
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
