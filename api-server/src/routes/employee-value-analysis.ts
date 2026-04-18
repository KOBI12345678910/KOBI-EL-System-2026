import { Router, Request, Response } from "express";
import { pool } from "@workspace/db";

const router = Router();

// ── Auto-create tables ──
async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS employee_value_metrics (
      id SERIAL PRIMARY KEY,
      employee_id INT NOT NULL,
      employee_name VARCHAR(255),
      employee_type VARCHAR(30) CHECK (employee_type IN ('salaried','manufacturer','installer','sales_agent')),
      department VARCHAR(100),
      total_revenue_generated NUMERIC(14,2) DEFAULT 0,
      total_cost NUMERIC(14,2) DEFAULT 0,
      net_value NUMERIC(14,2) DEFAULT 0,
      projects_count INT DEFAULT 0,
      avg_project_value NUMERIC(14,2) DEFAULT 0,
      on_time_rate REAL DEFAULT 0,
      quality_score REAL DEFAULT 0,
      customer_satisfaction_avg REAL DEFAULT 0,
      seniority_months INT DEFAULT 0,
      targets_met_rate REAL DEFAULT 0,
      risk_score REAL DEFAULT 0,
      last_calculated TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(employee_id)
    );

    CREATE TABLE IF NOT EXISTS employee_projects_log (
      id SERIAL PRIMARY KEY,
      employee_id INT NOT NULL,
      project_id INT,
      project_name VARCHAR(255),
      customer_name VARCHAR(255),
      role VARCHAR(30) CHECK (role IN ('manufacturer','installer','agent')),
      payment_type VARCHAR(20) CHECK (payment_type IN ('percentage','per_meter','salary')),
      payment_rate NUMERIC(10,4) DEFAULT 0,
      payment_amount NUMERIC(14,2) DEFAULT 0,
      project_value NUMERIC(14,2) DEFAULT 0,
      start_date DATE,
      end_date DATE,
      status VARCHAR(30) DEFAULT 'active',
      quality_issues INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS employee_payment_log (
      id SERIAL PRIMARY KEY,
      employee_id INT NOT NULL,
      period VARCHAR(20),
      base_amount NUMERIC(14,2) DEFAULT 0,
      bonus_amount NUMERIC(14,2) DEFAULT 0,
      deductions NUMERIC(14,2) DEFAULT 0,
      total_amount NUMERIC(14,2) DEFAULT 0,
      payment_date DATE,
      invoice_number VARCHAR(50),
      status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','paid')),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_evm_employee ON employee_value_metrics(employee_id);
    CREATE INDEX IF NOT EXISTS idx_epl_employee ON employee_projects_log(employee_id);
    CREATE INDEX IF NOT EXISTS idx_epay_employee ON employee_payment_log(employee_id);
  `);
}

ensureTables().catch(console.error);

// ── GET /api/employee-value/metrics ──
router.get("/employee-value/metrics", async (_req: Request, res: Response) => {
  try {
    const r = await pool.query(
      `SELECT * FROM employee_value_metrics ORDER BY net_value DESC`
    );
    res.json({ metrics: r.rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/employee-value/metrics/:employeeId ──
router.get("/employee-value/metrics/:employeeId", async (req: Request, res: Response) => {
  try {
    const { employeeId } = req.params;
    const m = await pool.query("SELECT * FROM employee_value_metrics WHERE employee_id = $1", [employeeId]);
    const projects = await pool.query(
      "SELECT * FROM employee_projects_log WHERE employee_id = $1 ORDER BY start_date DESC LIMIT 20", [employeeId]
    );
    const payments = await pool.query(
      "SELECT * FROM employee_payment_log WHERE employee_id = $1 ORDER BY payment_date DESC LIMIT 12", [employeeId]
    );

    res.json({
      metrics: m.rows[0] || null,
      recentProjects: projects.rows,
      recentPayments: payments.rows,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/employee-value/calculate/:employeeId ──
router.post("/employee-value/calculate/:employeeId", async (req: Request, res: Response) => {
  try {
    const { employeeId } = req.params;

    // Aggregate from projects log
    const projStats = await pool.query(`
      SELECT
        COUNT(*) AS projects_count,
        COALESCE(SUM(project_value), 0) AS total_revenue,
        COALESCE(SUM(payment_amount), 0) AS total_cost,
        COALESCE(AVG(project_value), 0) AS avg_project_value,
        COALESCE(SUM(quality_issues), 0) AS total_quality_issues,
        COUNT(*) FILTER (WHERE end_date IS NOT NULL AND end_date <= start_date + INTERVAL '30 days') AS on_time_count
      FROM employee_projects_log WHERE employee_id = $1
    `, [employeeId]);

    const s = projStats.rows[0];
    const totalRevenue = Number(s.total_revenue);
    const totalCost = Number(s.total_cost);
    const netValue = totalRevenue - totalCost;
    const projectsCount = Number(s.projects_count);
    const onTimeRate = projectsCount > 0 ? (Number(s.on_time_count) / projectsCount) * 100 : 0;
    const qualityScore = projectsCount > 0 ? Math.max(0, 100 - (Number(s.total_quality_issues) / projectsCount) * 10) : 100;

    // Risk score: higher means more risk (declining performance)
    const recentProjects = await pool.query(`
      SELECT project_value, payment_amount, quality_issues
      FROM employee_projects_log WHERE employee_id = $1
      ORDER BY start_date DESC LIMIT 5
    `, [employeeId]);

    let riskScore = 0;
    if (recentProjects.rows.length >= 3) {
      const recentAvg = recentProjects.rows.slice(0, 3).reduce((acc: number, r: any) => acc + Number(r.project_value), 0) / 3;
      const overallAvg = Number(s.avg_project_value);
      if (overallAvg > 0 && recentAvg < overallAvg * 0.7) riskScore += 40;
      const recentIssues = recentProjects.rows.slice(0, 3).reduce((acc: number, r: any) => acc + Number(r.quality_issues), 0);
      if (recentIssues > 3) riskScore += 30;
    }
    if (onTimeRate < 60) riskScore += 30;

    await pool.query(`
      INSERT INTO employee_value_metrics
        (employee_id, total_revenue_generated, total_cost, net_value, projects_count,
         avg_project_value, on_time_rate, quality_score, risk_score, last_calculated)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
      ON CONFLICT (employee_id) DO UPDATE SET
        total_revenue_generated = $2, total_cost = $3, net_value = $4, projects_count = $5,
        avg_project_value = $6, on_time_rate = $7, quality_score = $8, risk_score = $9, last_calculated = NOW()
    `, [employeeId, totalRevenue, totalCost, netValue, projectsCount,
        Number(s.avg_project_value), onTimeRate, qualityScore, riskScore]);

    res.json({ success: true, netValue, projectsCount, onTimeRate, qualityScore, riskScore });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/employee-value/calculate-all ──
router.post("/employee-value/calculate-all", async (_req: Request, res: Response) => {
  try {
    const employees = await pool.query(
      `SELECT DISTINCT employee_id FROM employee_projects_log`
    );
    let calculated = 0;
    for (const emp of employees.rows) {
      try {
        // Inline calculation (same as single calculate)
        const projStats = await pool.query(`
          SELECT COUNT(*) AS projects_count,
            COALESCE(SUM(project_value), 0) AS total_revenue,
            COALESCE(SUM(payment_amount), 0) AS total_cost,
            COALESCE(AVG(project_value), 0) AS avg_project_value,
            COALESCE(SUM(quality_issues), 0) AS total_quality_issues,
            COUNT(*) FILTER (WHERE end_date IS NOT NULL AND end_date <= start_date + INTERVAL '30 days') AS on_time_count
          FROM employee_projects_log WHERE employee_id = $1
        `, [emp.employee_id]);

        const s = projStats.rows[0];
        const tr = Number(s.total_revenue);
        const tc = Number(s.total_cost);
        const pc = Number(s.projects_count);
        const otr = pc > 0 ? (Number(s.on_time_count) / pc) * 100 : 0;
        const qs = pc > 0 ? Math.max(0, 100 - (Number(s.total_quality_issues) / pc) * 10) : 100;

        await pool.query(`
          INSERT INTO employee_value_metrics
            (employee_id, total_revenue_generated, total_cost, net_value, projects_count,
             avg_project_value, on_time_rate, quality_score, last_calculated)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
          ON CONFLICT (employee_id) DO UPDATE SET
            total_revenue_generated = $2, total_cost = $3, net_value = $4, projects_count = $5,
            avg_project_value = $6, on_time_rate = $7, quality_score = $8, last_calculated = NOW()
        `, [emp.employee_id, tr, tc, tr - tc, pc, Number(s.avg_project_value), otr, qs]);
        calculated++;
      } catch { /* skip individual errors */ }
    }
    res.json({ success: true, calculated });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/employee-value/projects/:employeeId ──
router.get("/employee-value/projects/:employeeId", async (req: Request, res: Response) => {
  try {
    const r = await pool.query(
      `SELECT * FROM employee_projects_log WHERE employee_id = $1 ORDER BY start_date DESC`,
      [req.params.employeeId]
    );
    res.json({ projects: r.rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/employee-value/payments/:employeeId ──
router.get("/employee-value/payments/:employeeId", async (req: Request, res: Response) => {
  try {
    const r = await pool.query(
      `SELECT * FROM employee_payment_log WHERE employee_id = $1 ORDER BY payment_date DESC`,
      [req.params.employeeId]
    );
    res.json({ payments: r.rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/employee-value/comparison ──
router.get("/employee-value/comparison", async (req: Request, res: Response) => {
  try {
    const ids = (req.query.ids as string || "").split(",").filter(Boolean).map(Number);
    let r;
    if (ids.length > 0) {
      r = await pool.query(
        `SELECT * FROM employee_value_metrics WHERE employee_id = ANY($1) ORDER BY net_value DESC`,
        [ids]
      );
    } else {
      r = await pool.query(
        `SELECT * FROM employee_value_metrics ORDER BY net_value DESC LIMIT 20`
      );
    }
    res.json({ comparison: r.rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/employee-value/rankings ──
router.get("/employee-value/rankings", async (req: Request, res: Response) => {
  try {
    const sortBy = (req.query.sort as string) || "net_value";
    const validSorts = ["net_value", "quality_score", "customer_satisfaction_avg", "total_revenue_generated", "on_time_rate"];
    const col = validSorts.includes(sortBy) ? sortBy : "net_value";

    const r = await pool.query(
      `SELECT *, RANK() OVER (ORDER BY ${col} DESC) AS ranking
       FROM employee_value_metrics ORDER BY ${col} DESC LIMIT 50`
    );
    res.json({ rankings: r.rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/employee-value/risk-report ──
router.get("/employee-value/risk-report", async (_req: Request, res: Response) => {
  try {
    const r = await pool.query(
      `SELECT * FROM employee_value_metrics
       WHERE risk_score >= 30 OR on_time_rate < 60 OR quality_score < 70
       ORDER BY risk_score DESC`
    );
    res.json({ atRisk: r.rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/employee-value/dashboard ──
router.get("/employee-value/dashboard", async (_req: Request, res: Response) => {
  try {
    const summary = await pool.query(`
      SELECT
        COUNT(*) AS total_employees,
        COALESCE(SUM(net_value), 0) AS total_net_value,
        COALESCE(AVG(net_value), 0) AS avg_net_value,
        COALESCE(AVG(quality_score), 0) AS avg_quality,
        COALESCE(AVG(on_time_rate), 0) AS avg_on_time,
        COALESCE(AVG(customer_satisfaction_avg), 0) AS avg_satisfaction,
        COUNT(*) FILTER (WHERE risk_score >= 50) AS high_risk_count,
        COUNT(*) FILTER (WHERE risk_score >= 30 AND risk_score < 50) AS medium_risk_count
      FROM employee_value_metrics
    `);

    const byType = await pool.query(`
      SELECT employee_type,
        COUNT(*) AS count,
        COALESCE(SUM(net_value), 0) AS total_net_value,
        COALESCE(AVG(net_value), 0) AS avg_net_value
      FROM employee_value_metrics
      GROUP BY employee_type
    `);

    const topPerformers = await pool.query(
      `SELECT employee_id, employee_name, employee_type, net_value, quality_score
       FROM employee_value_metrics ORDER BY net_value DESC LIMIT 5`
    );

    res.json({
      summary: summary.rows[0],
      byType: byType.rows,
      topPerformers: topPerformers.rows,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
