import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";

const router: IRouter = Router();

// ─── Table definitions ───────────────────────────────────────────
const TABLE_DEFINITIONS: Record<string, string> = {
  workforce_planning: `
    CREATE TABLE IF NOT EXISTS workforce_planning (
      id SERIAL PRIMARY KEY,
      department TEXT NOT NULL,
      position_title TEXT NOT NULL,
      current_headcount INT DEFAULT 0,
      planned_headcount INT DEFAULT 0,
      budget_allocated NUMERIC(12,2) DEFAULT 0,
      budget_used NUMERIC(12,2) DEFAULT 0,
      fiscal_year INT NOT NULL,
      quarter TEXT,
      status TEXT DEFAULT 'draft',
      priority TEXT DEFAULT 'medium',
      justification TEXT,
      approved_by TEXT,
      approved_at TIMESTAMP,
      notes TEXT,
      created_by TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      deleted_at TIMESTAMP
    )`,
  job_grades: `
    CREATE TABLE IF NOT EXISTS job_grades (
      id SERIAL PRIMARY KEY,
      grade_code TEXT NOT NULL UNIQUE,
      grade_name TEXT NOT NULL,
      min_salary NUMERIC(12,2),
      max_salary NUMERIC(12,2),
      currency TEXT DEFAULT 'ILS',
      level INT,
      description TEXT,
      benefits_package TEXT,
      status TEXT DEFAULT 'active',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      deleted_at TIMESTAMP
    )`,
  skills_catalog: `
    CREATE TABLE IF NOT EXISTS skills_catalog (
      id SERIAL PRIMARY KEY,
      skill_name TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT,
      proficiency_levels TEXT DEFAULT '1,2,3,4,5',
      is_critical BOOLEAN DEFAULT FALSE,
      department TEXT,
      status TEXT DEFAULT 'active',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      deleted_at TIMESTAMP
    )`,
  employee_skills: `
    CREATE TABLE IF NOT EXISTS employee_skills (
      id SERIAL PRIMARY KEY,
      employee_id INT NOT NULL,
      employee_name TEXT,
      skill_id INT REFERENCES skills_catalog(id),
      skill_name TEXT,
      current_level INT DEFAULT 1,
      target_level INT DEFAULT 3,
      assessed_by TEXT,
      assessed_at TIMESTAMP,
      certification TEXT,
      expiry_date DATE,
      notes TEXT,
      status TEXT DEFAULT 'active',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      deleted_at TIMESTAMP
    )`,
  employee_goals: `
    CREATE TABLE IF NOT EXISTS employee_goals (
      id SERIAL PRIMARY KEY,
      employee_id INT NOT NULL,
      employee_name TEXT,
      goal_title TEXT NOT NULL,
      description TEXT,
      category TEXT DEFAULT 'performance',
      priority TEXT DEFAULT 'medium',
      status TEXT DEFAULT 'draft',
      progress INT DEFAULT 0,
      start_date DATE,
      due_date DATE,
      completed_at TIMESTAMP,
      key_results TEXT,
      weight NUMERIC(5,2) DEFAULT 0,
      manager_id INT,
      manager_name TEXT,
      review_period TEXT,
      department TEXT,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      deleted_at TIMESTAMP
    )`,
  succession_plans: `
    CREATE TABLE IF NOT EXISTS succession_plans (
      id SERIAL PRIMARY KEY,
      position_title TEXT NOT NULL,
      department TEXT NOT NULL,
      current_holder TEXT,
      current_holder_id INT,
      successor_name TEXT,
      successor_id INT,
      readiness TEXT DEFAULT 'not_ready',
      development_plan TEXT,
      risk_level TEXT DEFAULT 'medium',
      target_date DATE,
      status TEXT DEFAULT 'active',
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      deleted_at TIMESTAMP
    )`,
  overtime_requests: `
    CREATE TABLE IF NOT EXISTS overtime_requests (
      id SERIAL PRIMARY KEY,
      employee_id INT NOT NULL,
      employee_name TEXT,
      department TEXT,
      request_date DATE NOT NULL,
      start_time TIME,
      end_time TIME,
      hours NUMERIC(5,2),
      reason TEXT,
      overtime_type TEXT DEFAULT 'regular',
      rate_multiplier NUMERIC(3,2) DEFAULT 1.25,
      status TEXT DEFAULT 'pending',
      approved_by TEXT,
      approved_at TIMESTAMP,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      deleted_at TIMESTAMP
    )`,
  disciplinary_actions: `
    CREATE TABLE IF NOT EXISTS disciplinary_actions (
      id SERIAL PRIMARY KEY,
      employee_id INT NOT NULL,
      employee_name TEXT,
      department TEXT,
      action_type TEXT NOT NULL,
      severity TEXT DEFAULT 'warning',
      incident_date DATE,
      description TEXT NOT NULL,
      witnesses TEXT,
      evidence TEXT,
      outcome TEXT,
      follow_up_date DATE,
      issued_by TEXT,
      status TEXT DEFAULT 'open',
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      deleted_at TIMESTAMP
    )`,
  exit_interviews: `
    CREATE TABLE IF NOT EXISTS exit_interviews (
      id SERIAL PRIMARY KEY,
      employee_id INT NOT NULL,
      employee_name TEXT,
      department TEXT,
      position TEXT,
      last_day DATE,
      interview_date DATE,
      interviewer TEXT,
      reason_for_leaving TEXT,
      satisfaction_rating INT,
      would_recommend BOOLEAN,
      feedback TEXT,
      improvements TEXT,
      rehire_eligible BOOLEAN DEFAULT TRUE,
      status TEXT DEFAULT 'scheduled',
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      deleted_at TIMESTAMP
    )`,
  employee_documents: `
    CREATE TABLE IF NOT EXISTS employee_documents (
      id SERIAL PRIMARY KEY,
      employee_id INT NOT NULL,
      employee_name TEXT,
      document_type TEXT NOT NULL,
      document_name TEXT NOT NULL,
      file_path TEXT,
      file_size INT,
      mime_type TEXT,
      issue_date DATE,
      expiry_date DATE,
      issuing_authority TEXT,
      document_number TEXT,
      status TEXT DEFAULT 'valid',
      verified_by TEXT,
      verified_at TIMESTAMP,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      deleted_at TIMESTAMP
    )`,
  safety_incidents: `
    CREATE TABLE IF NOT EXISTS safety_incidents (
      id SERIAL PRIMARY KEY,
      incident_number TEXT UNIQUE,
      incident_type TEXT NOT NULL,
      severity TEXT DEFAULT 'low',
      incident_date TIMESTAMP NOT NULL,
      location TEXT,
      department TEXT,
      reported_by TEXT,
      reported_by_id INT,
      affected_employees TEXT,
      description TEXT NOT NULL,
      root_cause TEXT,
      corrective_actions TEXT,
      preventive_actions TEXT,
      investigation_status TEXT DEFAULT 'open',
      days_lost INT DEFAULT 0,
      medical_treatment BOOLEAN DEFAULT FALSE,
      reportable BOOLEAN DEFAULT FALSE,
      status TEXT DEFAULT 'open',
      closed_at TIMESTAMP,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      deleted_at TIMESTAMP
    )`,
  safety_equipment: `
    CREATE TABLE IF NOT EXISTS safety_equipment (
      id SERIAL PRIMARY KEY,
      equipment_name TEXT NOT NULL,
      equipment_type TEXT NOT NULL,
      serial_number TEXT,
      location TEXT,
      department TEXT,
      assigned_to TEXT,
      assigned_to_id INT,
      purchase_date DATE,
      last_inspection DATE,
      next_inspection DATE,
      inspection_interval_days INT DEFAULT 365,
      condition TEXT DEFAULT 'good',
      certification TEXT,
      status TEXT DEFAULT 'active',
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      deleted_at TIMESTAMP
    )`,
  safety_training_log: `
    CREATE TABLE IF NOT EXISTS safety_training_log (
      id SERIAL PRIMARY KEY,
      training_name TEXT NOT NULL,
      training_type TEXT NOT NULL,
      employee_id INT,
      employee_name TEXT,
      department TEXT,
      trainer TEXT,
      training_date DATE NOT NULL,
      expiry_date DATE,
      duration_hours NUMERIC(5,2),
      score NUMERIC(5,2),
      passed BOOLEAN DEFAULT TRUE,
      certificate_number TEXT,
      status TEXT DEFAULT 'completed',
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      deleted_at TIMESTAMP
    )`,
  time_calculation_rules: `
    CREATE TABLE IF NOT EXISTS time_calculation_rules (
      id SERIAL PRIMARY KEY,
      rule_name TEXT NOT NULL,
      rule_type TEXT NOT NULL,
      department TEXT,
      day_type TEXT DEFAULT 'weekday',
      start_hour TIME,
      end_hour TIME,
      rate_multiplier NUMERIC(5,2) DEFAULT 1.0,
      min_hours NUMERIC(5,2),
      max_hours NUMERIC(5,2),
      rounding_rule TEXT DEFAULT 'nearest_15',
      applies_to TEXT DEFAULT 'all',
      effective_from DATE,
      effective_to DATE,
      status TEXT DEFAULT 'active',
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      deleted_at TIMESTAMP
    )`,
  expense_claims: `
    CREATE TABLE IF NOT EXISTS expense_claims (
      id SERIAL PRIMARY KEY,
      claim_number TEXT UNIQUE,
      employee_id INT NOT NULL,
      employee_name TEXT,
      department TEXT,
      expense_type TEXT NOT NULL,
      amount NUMERIC(12,2) NOT NULL,
      currency TEXT DEFAULT 'ILS',
      expense_date DATE NOT NULL,
      description TEXT,
      receipt_path TEXT,
      receipt_number TEXT,
      project TEXT,
      cost_center TEXT,
      payment_method TEXT DEFAULT 'company_card',
      mileage_km NUMERIC(8,2),
      status TEXT DEFAULT 'draft',
      submitted_at TIMESTAMP,
      approved_by TEXT,
      approved_at TIMESTAMP,
      paid_at TIMESTAMP,
      rejection_reason TEXT,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      deleted_at TIMESTAMP
    )`,
};

// ─── Ensure all tables exist ─────────────────────────────────────
async function ensureHRSapTables() {
  const client = await pool.connect();
  try {
    for (const [tableName, ddl] of Object.entries(TABLE_DEFINITIONS)) {
      await client.query(ddl);
      console.log(`[HR-SAP] Table ensured: ${tableName}`);
      // Ensure deleted_at column exists on pre-existing tables
      await client.query(`ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP`);
    }
  } finally {
    client.release();
  }
}

// ─── Generic CRUD factory ────────────────────────────────────────
function createCrudRoutes(tableName: string, displayName: string) {
  // GET list with search, status, department filters, pagination, sort
  router.get(`/hr-sap/${tableName}`, async (req, res) => {
    try {
      const {
        search = "",
        status,
        department,
        page = "1",
        limit = "25",
        sort = "created_at",
        order = "DESC",
      } = req.query as Record<string, string>;

      const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
      const conditions: string[] = [`${tableName}.deleted_at IS NULL`];
      const params: any[] = [];
      let paramIdx = 1;

      if (search) {
        conditions.push(`(${tableName}::text ILIKE $${paramIdx})`);
        params.push(`%${search}%`);
        paramIdx++;
      }
      if (status) {
        conditions.push(`${tableName}.status = $${paramIdx}`);
        params.push(status);
        paramIdx++;
      }
      if (department) {
        conditions.push(`${tableName}.department = $${paramIdx}`);
        params.push(department);
        paramIdx++;
      }

      const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const allowedOrders = ["ASC", "DESC"];
      const safeOrder = allowedOrders.includes(order.toUpperCase()) ? order.toUpperCase() : "DESC";

      const countResult = await pool.query(
        `SELECT COUNT(*) FROM ${tableName} ${whereClause}`,
        params
      );
      const total = parseInt(countResult.rows[0].count);

      const dataResult = await pool.query(
        `SELECT * FROM ${tableName} ${whereClause} ORDER BY ${sort} ${safeOrder} LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
        [...params, parseInt(limit), offset]
      );

      res.json({
        data: dataResult.rows,
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      });
    } catch (err: any) {
      console.error(`[HR-SAP] GET ${tableName} error:`, err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET stats
  router.get(`/hr-sap/${tableName}/stats`, async (_req, res) => {
    try {
      const total = await pool.query(`SELECT COUNT(*) FROM ${tableName} WHERE deleted_at IS NULL`);
      const byStatus = await pool.query(
        `SELECT status, COUNT(*) as count FROM ${tableName} WHERE deleted_at IS NULL GROUP BY status ORDER BY count DESC`
      );

      let byDepartment = { rows: [] as any[] };
      try {
        byDepartment = await pool.query(
          `SELECT department, COUNT(*) as count FROM ${tableName} WHERE deleted_at IS NULL AND department IS NOT NULL GROUP BY department ORDER BY count DESC`
        );
      } catch (_) { /* column may not exist */ }

      const recentCount = await pool.query(
        `SELECT COUNT(*) FROM ${tableName} WHERE deleted_at IS NULL AND created_at >= NOW() - INTERVAL '30 days'`
      );

      res.json({
        total: parseInt(total.rows[0].count),
        byStatus: byStatus.rows,
        byDepartment: byDepartment.rows,
        recentCount: parseInt(recentCount.rows[0].count),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET by id
  router.get(`/hr-sap/${tableName}/:id`, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT * FROM ${tableName} WHERE id = $1 AND deleted_at IS NULL`,
        [req.params.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: `${displayName} not found` });
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST create
  router.post(`/hr-sap/${tableName}`, async (req, res) => {
    try {
      const fields = Object.keys(req.body);
      const values = Object.values(req.body);
      const placeholders = values.map((_, i) => `$${i + 1}`);

      const result = await pool.query(
        `INSERT INTO ${tableName} (${fields.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`,
        values
      );
      res.status(201).json(result.rows[0]);
    } catch (err: any) {
      console.error(`[HR-SAP] POST ${tableName} error:`, err);
      res.status(500).json({ error: err.message });
    }
  });

  // PUT update
  router.put(`/hr-sap/${tableName}/:id`, async (req, res) => {
    try {
      const fields = Object.keys(req.body);
      const values = Object.values(req.body);
      const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(", ");

      const result = await pool.query(
        `UPDATE ${tableName} SET ${setClause}, updated_at = NOW() WHERE id = $${fields.length + 1} AND deleted_at IS NULL RETURNING *`,
        [...values, req.params.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: `${displayName} not found` });
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE soft-delete
  router.delete(`/hr-sap/${tableName}/:id`, async (req, res) => {
    try {
      const result = await pool.query(
        `UPDATE ${tableName} SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
        [req.params.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: `${displayName} not found` });
      res.json({ success: true, id: result.rows[0].id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET export
  router.get(`/hr-sap/${tableName}/export`, async (req, res) => {
    try {
      const { format = "json" } = req.query as Record<string, string>;
      const result = await pool.query(
        `SELECT * FROM ${tableName} WHERE deleted_at IS NULL ORDER BY created_at DESC`
      );

      if (format === "csv") {
        if (result.rows.length === 0) return res.status(200).send("");
        const headers = Object.keys(result.rows[0]).join(",");
        const rows = result.rows.map((r: any) => Object.values(r).map(v => `"${v ?? ""}"`).join(","));
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename=${tableName}_export.csv`);
        return res.send([headers, ...rows].join("\n"));
      }

      res.json({ data: result.rows, total: result.rows.length, exportedAt: new Date().toISOString() });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}

// ─── Register CRUD for all 15 tables ─────────────────────────────
const tableRegistry: Array<[string, string]> = [
  ["workforce_planning", "Workforce Planning"],
  ["job_grades", "Job Grades"],
  ["skills_catalog", "Skills Catalog"],
  ["employee_skills", "Employee Skills"],
  ["employee_goals", "Employee Goals"],
  ["succession_plans", "Succession Plans"],
  ["overtime_requests", "Overtime Requests"],
  ["disciplinary_actions", "Disciplinary Actions"],
  ["exit_interviews", "Exit Interviews"],
  ["employee_documents", "Employee Documents"],
  ["safety_incidents", "Safety Incidents"],
  ["safety_equipment", "Safety Equipment"],
  ["safety_training_log", "Safety Training Log"],
  ["time_calculation_rules", "Time Calculation Rules"],
  ["expense_claims", "Expense Claims"],
];

for (const [tableName, displayName] of tableRegistry) {
  createCrudRoutes(tableName, displayName);
}

// Auto-initialize tables on module load
ensureHRSapTables().catch((err) => console.error("[HR-SAP] Auto-init error:", err));

// ─── Special endpoints ───────────────────────────────────────────

// POST /init - initialize all tables
router.post("/hr-sap/init", async (_req, res) => {
  try {
    await ensureHRSapTables();
    res.json({ success: true, message: "All 15 HR SAP tables initialized", tables: tableRegistry.map(([t]) => t) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /analytics - HR analytics dashboard
router.get("/hr-sap/analytics", async (_req, res) => {
  try {
    const queries = await Promise.allSettled([
      pool.query(`SELECT COUNT(*) as total_employees FROM workforce_planning WHERE deleted_at IS NULL`),
      pool.query(`SELECT SUM(budget_allocated) as total_budget, SUM(budget_used) as used_budget FROM workforce_planning WHERE deleted_at IS NULL`),
      pool.query(`SELECT status, COUNT(*) as count FROM employee_goals WHERE deleted_at IS NULL GROUP BY status`),
      pool.query(`SELECT AVG(progress) as avg_progress FROM employee_goals WHERE deleted_at IS NULL AND status != 'cancelled'`),
      pool.query(`SELECT severity, COUNT(*) as count FROM safety_incidents WHERE deleted_at IS NULL GROUP BY severity`),
      pool.query(`SELECT SUM(days_lost) as total_days_lost FROM safety_incidents WHERE deleted_at IS NULL`),
      pool.query(`SELECT SUM(amount) as total_expenses FROM expense_claims WHERE deleted_at IS NULL AND status = 'approved'`),
      pool.query(`SELECT COUNT(*) as pending_claims FROM expense_claims WHERE deleted_at IS NULL AND status = 'pending'`),
      pool.query(`SELECT department, COUNT(*) as count FROM workforce_planning WHERE deleted_at IS NULL GROUP BY department ORDER BY count DESC LIMIT 10`),
      pool.query(`SELECT reason_for_leaving, COUNT(*) as count FROM exit_interviews WHERE deleted_at IS NULL GROUP BY reason_for_leaving ORDER BY count DESC LIMIT 5`),
      pool.query(`SELECT COUNT(*) as overdue_goals FROM employee_goals WHERE deleted_at IS NULL AND due_date < NOW() AND status NOT IN ('completed', 'cancelled')`),
      pool.query(`SELECT overtime_type, SUM(hours) as total_hours FROM overtime_requests WHERE deleted_at IS NULL AND status = 'approved' GROUP BY overtime_type`),
    ]);

    const extract = (idx: number) => {
      const r = queries[idx];
      return r.status === "fulfilled" ? r.value.rows : [];
    };

    res.json({
      workforce: { headcount: extract(0)[0]?.total_employees || 0 },
      budget: extract(1)[0] || { total_budget: 0, used_budget: 0 },
      goals: { byStatus: extract(2), avgProgress: extract(3)[0]?.avg_progress || 0, overdue: extract(10)[0]?.overdue_goals || 0 },
      safety: { bySeverity: extract(4), totalDaysLost: extract(5)[0]?.total_days_lost || 0 },
      expenses: { totalApproved: extract(6)[0]?.total_expenses || 0, pendingClaims: extract(7)[0]?.pending_claims || 0 },
      departments: extract(8),
      exitReasons: extract(9),
      overtime: extract(11),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /skills-gap - Skills gap analysis
router.get("/hr-sap/skills-gap", async (_req, res) => {
  try {
    const gaps = await pool.query(`
      SELECT
        es.employee_name,
        es.skill_name,
        es.current_level,
        es.target_level,
        (es.target_level - es.current_level) as gap,
        sc.category,
        sc.is_critical
      FROM employee_skills es
      LEFT JOIN skills_catalog sc ON es.skill_id = sc.id
      WHERE es.deleted_at IS NULL AND es.current_level < es.target_level
      ORDER BY gap DESC, sc.is_critical DESC
    `);

    const summary = await pool.query(`
      SELECT
        sc.category,
        COUNT(*) as total_gaps,
        AVG(es.target_level - es.current_level) as avg_gap,
        SUM(CASE WHEN sc.is_critical THEN 1 ELSE 0 END) as critical_gaps
      FROM employee_skills es
      LEFT JOIN skills_catalog sc ON es.skill_id = sc.id
      WHERE es.deleted_at IS NULL AND es.current_level < es.target_level
      GROUP BY sc.category
      ORDER BY critical_gaps DESC, avg_gap DESC
    `);

    res.json({ gaps: gaps.rows, summary: summary.rows, total: gaps.rows.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /document-alerts - Document expiry alerts
router.get("/hr-sap/document-alerts", async (_req, res) => {
  try {
    const expired = await pool.query(`
      SELECT * FROM employee_documents
      WHERE deleted_at IS NULL AND expiry_date IS NOT NULL AND expiry_date < NOW()
      ORDER BY expiry_date ASC
    `);

    const expiringSoon = await pool.query(`
      SELECT * FROM employee_documents
      WHERE deleted_at IS NULL AND expiry_date IS NOT NULL
        AND expiry_date >= NOW() AND expiry_date <= NOW() + INTERVAL '30 days'
      ORDER BY expiry_date ASC
    `);

    const safetyExpiring = await pool.query(`
      SELECT * FROM safety_equipment
      WHERE deleted_at IS NULL AND next_inspection IS NOT NULL
        AND next_inspection <= NOW() + INTERVAL '14 days'
      ORDER BY next_inspection ASC
    `);

    const trainingExpiring = await pool.query(`
      SELECT * FROM safety_training_log
      WHERE deleted_at IS NULL AND expiry_date IS NOT NULL
        AND expiry_date <= NOW() + INTERVAL '30 days'
      ORDER BY expiry_date ASC
    `);

    res.json({
      expired: expired.rows,
      expiringSoon: expiringSoon.rows,
      safetyInspections: safetyExpiring.rows,
      trainingRenewals: trainingExpiring.rows,
      totalAlerts: expired.rows.length + expiringSoon.rows.length + safetyExpiring.rows.length + trainingExpiring.rows.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
