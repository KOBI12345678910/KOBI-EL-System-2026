import { Router, Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { validateSession } from "../lib/auth";

const router = Router();

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

async function q(query: string) {
  try { const r = await db.execute(sql.raw(query)); return r.rows || []; }
  catch (e: any) { console.error("Department-Manager query error:", e.message); return []; }
}

const s = (v: any) => v !== undefined && v !== null ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
const n = (v: any, def = 0) => Number(v) || def;

// ========== AUTO-CREATE TABLES ==========
(async () => {
  await q(`CREATE TABLE IF NOT EXISTS departments_v2 (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    name_en VARCHAR(255),
    code VARCHAR(50) UNIQUE,
    parent_department_id INT,
    department_type VARCHAR(50) DEFAULT 'admin',
    manager_id INT,
    manager_name VARCHAR(255),
    employee_count INT DEFAULT 0,
    budget_annual NUMERIC(14,2) DEFAULT 0,
    location VARCHAR(255),
    status VARCHAR(20) DEFAULT 'active',
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await q(`CREATE TABLE IF NOT EXISTS department_roles (
    id SERIAL PRIMARY KEY,
    department_id INT REFERENCES departments_v2(id) ON DELETE CASCADE,
    role_name VARCHAR(255),
    role_level VARCHAR(30) DEFAULT 'junior',
    headcount INT DEFAULT 1,
    filled INT DEFAULT 0,
    salary_range_min NUMERIC(12,2) DEFAULT 0,
    salary_range_max NUMERIC(12,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await q(`CREATE TABLE IF NOT EXISTS department_budgets (
    id SERIAL PRIMARY KEY,
    department_id INT REFERENCES departments_v2(id) ON DELETE CASCADE,
    period VARCHAR(20),
    category VARCHAR(50) DEFAULT 'salaries',
    budgeted NUMERIC(14,2) DEFAULT 0,
    actual NUMERIC(14,2) DEFAULT 0,
    variance NUMERIC(14,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await q(`CREATE TABLE IF NOT EXISTS org_chart_positions (
    id SERIAL PRIMARY KEY,
    department_id INT REFERENCES departments_v2(id) ON DELETE CASCADE,
    title VARCHAR(255),
    level INT DEFAULT 0,
    reports_to_id INT,
    employee_id INT,
    employee_name VARCHAR(255),
    status VARCHAR(20) DEFAULT 'filled',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  // ========== PRE-SEED 22 DEPARTMENTS ==========
  const existing = await q(`SELECT COUNT(*) as cnt FROM departments_v2`);
  if (Number((existing[0] as any)?.cnt) === 0) {
    const depts = [
      { name: 'ייצור', name_en: 'Production', code: 'PROD', type: 'production', parent: null },
      { name: 'חיתוך CNC', name_en: 'CNC Cutting', code: 'CNC', type: 'production', parent: 'PROD' },
      { name: 'ריתוך', name_en: 'Welding', code: 'WELD', type: 'production', parent: 'PROD' },
      { name: 'גימור', name_en: 'Finishing', code: 'FINISH', type: 'production', parent: 'PROD' },
      { name: 'צביעה', name_en: 'Painting', code: 'PAINT', type: 'production', parent: 'PROD' },
      { name: 'הרכבה', name_en: 'Assembly', code: 'ASSEM', type: 'production', parent: 'PROD' },
      { name: 'בקרת איכות', name_en: 'Quality Control', code: 'QC', type: 'quality', parent: null },
      { name: 'מחסן', name_en: 'Warehouse', code: 'WH', type: 'logistics', parent: null },
      { name: 'רכש', name_en: 'Procurement', code: 'PROC', type: 'procurement', parent: null },
      { name: 'לוגיסטיקה', name_en: 'Logistics', code: 'LOG', type: 'logistics', parent: null },
      { name: 'מכירות', name_en: 'Sales', code: 'SALES', type: 'sales', parent: null },
      { name: 'שיווק', name_en: 'Marketing', code: 'MKT', type: 'marketing', parent: null },
      { name: 'כספים', name_en: 'Finance', code: 'FIN', type: 'finance', parent: null },
      { name: 'הנהלת חשבונות', name_en: 'Accounting', code: 'ACCT', type: 'finance', parent: 'FIN' },
      { name: 'משאבי אנוש', name_en: 'Human Resources', code: 'HR', type: 'hr', parent: null },
      { name: 'IT', name_en: 'IT', code: 'IT', type: 'it', parent: null },
      { name: 'הנדסה', name_en: 'Engineering', code: 'ENG', type: 'engineering', parent: null },
      { name: 'מדידות', name_en: 'Measurements', code: 'MEAS', type: 'field', parent: 'ENG' },
      { name: 'התקנות', name_en: 'Installations', code: 'INST', type: 'field', parent: null },
      { name: 'שירות לקוחות', name_en: 'Customer Service', code: 'CS', type: 'sales', parent: null },
      { name: 'משפטי', name_en: 'Legal', code: 'LEGAL', type: 'legal', parent: null },
      { name: 'הנהלה', name_en: 'Management', code: 'MGMT', type: 'management', parent: null },
    ];
    // First pass: insert all without parent
    for (const d of depts) {
      await q(`INSERT INTO departments_v2 (name, name_en, code, department_type, status)
        VALUES (${s(d.name)}, ${s(d.name_en)}, ${s(d.code)}, ${s(d.type)}, 'active')`);
    }
    // Second pass: set parent relationships
    for (const d of depts) {
      if (d.parent) {
        await q(`UPDATE departments_v2 SET parent_department_id = (SELECT id FROM departments_v2 WHERE code=${s(d.parent)} LIMIT 1) WHERE code=${s(d.code)}`);
      }
    }
    console.log("[Department-Manager] Seeded 22 departments");
  }
  console.log("[Department-Manager] Tables ready");
})();

// ========== DEPARTMENTS ==========
router.get("/departments", async (_req, res) => {
  res.json(await q(`SELECT d.*,
    (SELECT COUNT(*) FROM department_roles dr WHERE dr.department_id = d.id) as roles_count,
    (SELECT COALESCE(SUM(headcount),0) FROM department_roles dr WHERE dr.department_id = d.id) as total_headcount,
    (SELECT COALESCE(SUM(filled),0) FROM department_roles dr WHERE dr.department_id = d.id) as total_filled,
    pd.name as parent_name
    FROM departments_v2 d
    LEFT JOIN departments_v2 pd ON d.parent_department_id = pd.id
    ORDER BY d.name`));
});

router.get("/departments/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status='active') as active,
    COALESCE(SUM(employee_count),0) as total_employees,
    COALESCE(SUM(budget_annual),0) as total_budget,
    COUNT(DISTINCT department_type) as types_count
  FROM departments_v2`);
  res.json(rows[0] || {});
});

router.post("/departments", async (req, res) => {
  const d = req.body;
  await q(`INSERT INTO departments_v2 (name, name_en, code, parent_department_id, department_type, manager_id, manager_name, employee_count, budget_annual, location, status, description)
    VALUES (${s(d.name)}, ${s(d.nameEn)}, ${s(d.code)}, ${d.parentDepartmentId || 'NULL'}, ${s(d.departmentType || 'admin')}, ${d.managerId || 'NULL'}, ${s(d.managerName)}, ${n(d.employeeCount)}, ${n(d.budgetAnnual)}, ${s(d.location)}, ${s(d.status || 'active')}, ${s(d.description)})`);
  res.json({ success: true });
});

router.put("/departments/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  if (d.name) sets.push(`name=${s(d.name)}`);
  if (d.nameEn !== undefined) sets.push(`name_en=${s(d.nameEn)}`);
  if (d.code) sets.push(`code=${s(d.code)}`);
  if (d.parentDepartmentId !== undefined) sets.push(`parent_department_id=${d.parentDepartmentId || 'NULL'}`);
  if (d.departmentType) sets.push(`department_type=${s(d.departmentType)}`);
  if (d.managerId !== undefined) sets.push(`manager_id=${d.managerId || 'NULL'}`);
  if (d.managerName !== undefined) sets.push(`manager_name=${s(d.managerName)}`);
  if (d.employeeCount !== undefined) sets.push(`employee_count=${n(d.employeeCount)}`);
  if (d.budgetAnnual !== undefined) sets.push(`budget_annual=${n(d.budgetAnnual)}`);
  if (d.location !== undefined) sets.push(`location=${s(d.location)}`);
  if (d.status) sets.push(`status=${s(d.status)}`);
  if (d.description !== undefined) sets.push(`description=${s(d.description)}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE departments_v2 SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM departments_v2 WHERE id=${req.params.id}`))[0]);
});

router.delete("/departments/:id", async (req, res) => {
  await q(`DELETE FROM departments_v2 WHERE id=${req.params.id}`);
  res.json({ success: true });
});

// ========== DEPARTMENT ROLES ==========
router.get("/departments/:id/roles", async (req, res) => {
  res.json(await q(`SELECT * FROM department_roles WHERE department_id=${req.params.id} ORDER BY role_level, role_name`));
});

router.post("/departments/roles", async (req, res) => {
  const d = req.body;
  await q(`INSERT INTO department_roles (department_id, role_name, role_level, headcount, filled, salary_range_min, salary_range_max)
    VALUES (${d.departmentId}, ${s(d.roleName)}, ${s(d.roleLevel || 'junior')}, ${n(d.headcount, 1)}, ${n(d.filled)}, ${n(d.salaryRangeMin)}, ${n(d.salaryRangeMax)})`);
  res.json({ success: true });
});

router.put("/departments/roles/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  if (d.roleName) sets.push(`role_name=${s(d.roleName)}`);
  if (d.roleLevel) sets.push(`role_level=${s(d.roleLevel)}`);
  if (d.headcount !== undefined) sets.push(`headcount=${n(d.headcount)}`);
  if (d.filled !== undefined) sets.push(`filled=${n(d.filled)}`);
  if (d.salaryRangeMin !== undefined) sets.push(`salary_range_min=${n(d.salaryRangeMin)}`);
  if (d.salaryRangeMax !== undefined) sets.push(`salary_range_max=${n(d.salaryRangeMax)}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE department_roles SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM department_roles WHERE id=${req.params.id}`))[0]);
});

router.delete("/departments/roles/:id", async (req, res) => {
  await q(`DELETE FROM department_roles WHERE id=${req.params.id}`);
  res.json({ success: true });
});

// ========== DEPARTMENT BUDGETS ==========
router.get("/departments/:id/budgets", async (req, res) => {
  res.json(await q(`SELECT * FROM department_budgets WHERE department_id=${req.params.id} ORDER BY period DESC, category`));
});

router.post("/departments/budgets", async (req, res) => {
  const d = req.body;
  const variance = n(d.budgeted) - n(d.actual);
  await q(`INSERT INTO department_budgets (department_id, period, category, budgeted, actual, variance)
    VALUES (${d.departmentId}, ${s(d.period)}, ${s(d.category || 'salaries')}, ${n(d.budgeted)}, ${n(d.actual)}, ${variance})`);
  res.json({ success: true });
});

router.put("/departments/budgets/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  if (d.period) sets.push(`period=${s(d.period)}`);
  if (d.category) sets.push(`category=${s(d.category)}`);
  if (d.budgeted !== undefined) sets.push(`budgeted=${n(d.budgeted)}`);
  if (d.actual !== undefined) sets.push(`actual=${n(d.actual)}`);
  const budgeted = d.budgeted !== undefined ? n(d.budgeted) : null;
  const actual = d.actual !== undefined ? n(d.actual) : null;
  if (budgeted !== null && actual !== null) sets.push(`variance=${budgeted - actual}`);
  await q(`UPDATE department_budgets SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM department_budgets WHERE id=${req.params.id}`))[0]);
});

// ========== ORG CHART POSITIONS ==========
router.get("/departments/:id/positions", async (req, res) => {
  res.json(await q(`SELECT ocp.*, d.name as department_name
    FROM org_chart_positions ocp
    LEFT JOIN departments_v2 d ON ocp.department_id = d.id
    WHERE ocp.department_id=${req.params.id}
    ORDER BY ocp.level, ocp.title`));
});

router.post("/departments/positions", async (req, res) => {
  const d = req.body;
  await q(`INSERT INTO org_chart_positions (department_id, title, level, reports_to_id, employee_id, employee_name, status)
    VALUES (${d.departmentId}, ${s(d.title)}, ${n(d.level)}, ${d.reportsToId || 'NULL'}, ${d.employeeId || 'NULL'}, ${s(d.employeeName)}, ${s(d.status || 'filled')})`);
  res.json({ success: true });
});

router.put("/departments/positions/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  if (d.title) sets.push(`title=${s(d.title)}`);
  if (d.level !== undefined) sets.push(`level=${n(d.level)}`);
  if (d.reportsToId !== undefined) sets.push(`reports_to_id=${d.reportsToId || 'NULL'}`);
  if (d.employeeId !== undefined) sets.push(`employee_id=${d.employeeId || 'NULL'}`);
  if (d.employeeName !== undefined) sets.push(`employee_name=${s(d.employeeName)}`);
  if (d.status) sets.push(`status=${s(d.status)}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE org_chart_positions SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM org_chart_positions WHERE id=${req.params.id}`))[0]);
});

router.delete("/departments/positions/:id", async (req, res) => {
  await q(`DELETE FROM org_chart_positions WHERE id=${req.params.id}`);
  res.json({ success: true });
});

// ========== ORG CHART (TREE) ==========
router.get("/departments/org-chart", async (_req, res) => {
  const departments = await q(`SELECT d.*,
    (SELECT COALESCE(SUM(filled),0) FROM department_roles dr WHERE dr.department_id = d.id) as total_filled,
    (SELECT COALESCE(SUM(headcount),0) FROM department_roles dr WHERE dr.department_id = d.id) as total_headcount
    FROM departments_v2 d WHERE d.status='active' ORDER BY d.name`);

  // Build tree
  const deptMap = new Map<number, any>();
  for (const d of departments as any[]) {
    deptMap.set(d.id, { ...d, children: [] });
  }
  const roots: any[] = [];
  for (const d of deptMap.values()) {
    if (d.parent_department_id && deptMap.has(d.parent_department_id)) {
      deptMap.get(d.parent_department_id).children.push(d);
    } else {
      roots.push(d);
    }
  }
  res.json(roots);
});

// ========== BUDGET ANALYSIS ==========
router.get("/departments/:id/budget-analysis", async (req, res) => {
  const dept = (await q(`SELECT * FROM departments_v2 WHERE id=${req.params.id}`))[0];
  const budgets = await q(`SELECT category, COALESCE(SUM(budgeted),0) as total_budgeted, COALESCE(SUM(actual),0) as total_actual, COALESCE(SUM(variance),0) as total_variance
    FROM department_budgets WHERE department_id=${req.params.id} GROUP BY category ORDER BY total_budgeted DESC`);
  const roles = await q(`SELECT role_level, COUNT(*) as count, COALESCE(SUM(headcount),0) as headcount, COALESCE(SUM(filled),0) as filled
    FROM department_roles WHERE department_id=${req.params.id} GROUP BY role_level`);
  res.json({ department: dept, budgetByCategory: budgets, rolesSummary: roles });
});

// ========== HEADCOUNT SUMMARY ==========
router.get("/departments/headcount-summary", async (_req, res) => {
  const rows = await q(`SELECT d.id, d.name, d.code, d.department_type, d.employee_count,
    COALESCE((SELECT SUM(headcount) FROM department_roles dr WHERE dr.department_id = d.id), 0) as planned_headcount,
    COALESCE((SELECT SUM(filled) FROM department_roles dr WHERE dr.department_id = d.id), 0) as filled_headcount,
    d.budget_annual
    FROM departments_v2 d WHERE d.status='active' ORDER BY d.name`);
  const totals = await q(`SELECT
    COALESCE(SUM(employee_count),0) as total_employees,
    COALESCE((SELECT SUM(headcount) FROM department_roles), 0) as total_planned,
    COALESCE((SELECT SUM(filled) FROM department_roles), 0) as total_filled,
    COALESCE(SUM(budget_annual),0) as total_budget
  FROM departments_v2 WHERE status='active'`);
  res.json({ departments: rows, totals: totals[0] });
});

// ========== DASHBOARD ==========
router.get("/departments/dashboard", async (_req, res) => {
  const stats = await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status='active') as active,
    COALESCE(SUM(employee_count),0) as total_employees,
    COALESCE(SUM(budget_annual),0) as total_budget,
    COUNT(DISTINCT department_type) as types_count
  FROM departments_v2`);
  const byType = await q(`SELECT department_type, COUNT(*) as count, COALESCE(SUM(employee_count),0) as employees
    FROM departments_v2 WHERE status='active' GROUP BY department_type ORDER BY count DESC`);
  const topBudgets = await q(`SELECT name, code, budget_annual FROM departments_v2 WHERE status='active' AND budget_annual > 0 ORDER BY budget_annual DESC LIMIT 10`);
  const vacancies = await q(`SELECT d.name, dr.role_name, (dr.headcount - dr.filled) as vacant
    FROM department_roles dr JOIN departments_v2 d ON dr.department_id = d.id
    WHERE dr.headcount > dr.filled ORDER BY vacant DESC LIMIT 10`);
  res.json({ stats: stats[0], byType, topBudgets, vacancies });
});

export default router;
