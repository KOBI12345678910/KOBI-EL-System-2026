import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

// ─── Auto-create tables ───────────────────────────────────────────────────────
async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS daily_profit_snapshots (
      id SERIAL PRIMARY KEY,
      date DATE NOT NULL UNIQUE,
      revenue_today NUMERIC(14,2) DEFAULT 0,
      costs_today NUMERIC(14,2) DEFAULT 0,
      gross_profit_today NUMERIC(14,2) DEFAULT 0,
      gross_margin_pct REAL DEFAULT 0,
      cumulative_revenue_month NUMERIC(16,2) DEFAULT 0,
      cumulative_costs_month NUMERIC(16,2) DEFAULT 0,
      cumulative_profit_month NUMERIC(16,2) DEFAULT 0,
      projects_closed_today INTEGER DEFAULT 0,
      projects_value_today NUMERIC(14,2) DEFAULT 0,
      avg_project_margin_pct REAL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS company_health_metrics (
      id SERIAL PRIMARY KEY,
      date DATE NOT NULL UNIQUE,
      total_ar NUMERIC(16,2) DEFAULT 0,
      total_ap NUMERIC(16,2) DEFAULT 0,
      net_cash_position NUMERIC(16,2) DEFAULT 0,
      current_ratio REAL DEFAULT 0,
      quick_ratio REAL DEFAULT 0,
      debt_to_equity REAL DEFAULT 0,
      inventory_value NUMERIC(14,2) DEFAULT 0,
      monthly_burn_rate NUMERIC(14,2) DEFAULT 0,
      runway_months REAL DEFAULT 0,
      employee_count INTEGER DEFAULT 0,
      revenue_per_employee NUMERIC(12,2) DEFAULT 0,
      projects_in_progress INTEGER DEFAULT 0,
      overdue_projects INTEGER DEFAULT 0,
      customer_satisfaction_avg REAL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
}

let tablesReady = false;
async function init() {
  if (!tablesReady) { await ensureTables(); tablesReady = true; }
}

// ─── Create / update daily profit snapshot ────────────────────────────────────

router.post("/daily-profit/snapshot", async (req, res) => {
  try {
    await init();
    const b = req.body;
    const date = b.date || new Date().toISOString().slice(0, 10);
    const revenue = parseFloat(b.revenue_today) || 0;
    const costs = parseFloat(b.costs_today) || 0;
    const grossProfit = revenue - costs;
    const marginPct = revenue > 0 ? Math.round((grossProfit / revenue) * 10000) / 100 : 0;

    // Calculate cumulative for month
    const monthStart = date.slice(0, 7) + "-01";
    const prev = await pool.query(
      `SELECT COALESCE(SUM(revenue_today),0) as rev, COALESCE(SUM(costs_today),0) as cost FROM daily_profit_snapshots WHERE date >= $1 AND date < $2`,
      [monthStart, date]
    );
    const cumRev = parseFloat(prev.rows[0]?.rev) + revenue;
    const cumCost = parseFloat(prev.rows[0]?.cost) + costs;
    const cumProfit = cumRev - cumCost;

    const result = await pool.query(
      `INSERT INTO daily_profit_snapshots (date, revenue_today, costs_today, gross_profit_today, gross_margin_pct, cumulative_revenue_month, cumulative_costs_month, cumulative_profit_month, projects_closed_today, projects_value_today, avg_project_margin_pct)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (date) DO UPDATE SET revenue_today=$2, costs_today=$3, gross_profit_today=$4, gross_margin_pct=$5, cumulative_revenue_month=$6, cumulative_costs_month=$7, cumulative_profit_month=$8, projects_closed_today=$9, projects_value_today=$10, avg_project_margin_pct=$11
       RETURNING *`,
      [date, revenue, costs, grossProfit.toFixed(2), marginPct, cumRev.toFixed(2), cumCost.toFixed(2), cumProfit.toFixed(2), b.projects_closed_today || 0, b.projects_value_today || 0, b.avg_project_margin_pct || 0]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// Get today's snapshot
router.get("/daily-profit/today", async (_req, res) => {
  try {
    await init();
    const today = new Date().toISOString().slice(0, 10);
    const result = await pool.query(`SELECT * FROM daily_profit_snapshots WHERE date = $1`, [today]);
    if (result.rows.length === 0) {
      return res.json({
        date: today, revenue_today: 0, costs_today: 0, gross_profit_today: 0,
        gross_margin_pct: 0, cumulative_revenue_month: 0, cumulative_costs_month: 0,
        cumulative_profit_month: 0, projects_closed_today: 0, projects_value_today: 0,
      });
    }
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// Get date range
router.get("/daily-profit/range", async (req, res) => {
  try {
    await init();
    const from = req.query.from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const to = req.query.to || new Date().toISOString().slice(0, 10);
    const result = await pool.query(
      `SELECT * FROM daily_profit_snapshots WHERE date >= $1 AND date <= $2 ORDER BY date ASC`,
      [from, to]
    );
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// Monthly summary
router.get("/daily-profit/monthly-summary", async (req, res) => {
  try {
    await init();
    const months = parseInt(req.query.months as string) || 6;
    const result = await pool.query(`
      SELECT
        TO_CHAR(date, 'YYYY-MM') as month,
        SUM(revenue_today) as total_revenue,
        SUM(costs_today) as total_costs,
        SUM(gross_profit_today) as total_profit,
        CASE WHEN SUM(revenue_today) > 0 THEN ROUND(SUM(gross_profit_today) / SUM(revenue_today) * 100, 1) ELSE 0 END as margin_pct,
        SUM(projects_closed_today) as projects_closed,
        SUM(projects_value_today) as projects_value,
        COUNT(*) as working_days
      FROM daily_profit_snapshots
      WHERE date >= CURRENT_DATE - INTERVAL '${months} months'
      GROUP BY TO_CHAR(date, 'YYYY-MM')
      ORDER BY month DESC
    `);
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// ─── Company Health Metrics ───────────────────────────────────────────────────

router.post("/daily-profit/company-health", async (req, res) => {
  try {
    await init();
    const b = req.body;
    const date = b.date || new Date().toISOString().slice(0, 10);
    const result = await pool.query(
      `INSERT INTO company_health_metrics (date, total_ar, total_ap, net_cash_position, current_ratio, quick_ratio, debt_to_equity, inventory_value, monthly_burn_rate, runway_months, employee_count, revenue_per_employee, projects_in_progress, overdue_projects, customer_satisfaction_avg)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (date) DO UPDATE SET total_ar=$2, total_ap=$3, net_cash_position=$4, current_ratio=$5, quick_ratio=$6, debt_to_equity=$7, inventory_value=$8, monthly_burn_rate=$9, runway_months=$10, employee_count=$11, revenue_per_employee=$12, projects_in_progress=$13, overdue_projects=$14, customer_satisfaction_avg=$15
       RETURNING *`,
      [date, b.total_ar || 0, b.total_ap || 0, b.net_cash_position || 0, b.current_ratio || 0, b.quick_ratio || 0, b.debt_to_equity || 0, b.inventory_value || 0, b.monthly_burn_rate || 0, b.runway_months || 0, b.employee_count || 0, b.revenue_per_employee || 0, b.projects_in_progress || 0, b.overdue_projects || 0, b.customer_satisfaction_avg || 0]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.get("/daily-profit/company-health", async (_req, res) => {
  try {
    await init();
    const result = await pool.query(`SELECT * FROM company_health_metrics ORDER BY date DESC LIMIT 1`);
    res.json(result.rows[0] || {});
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// 30-day trend
router.get("/daily-profit/trends", async (_req, res) => {
  try {
    await init();
    const profits = await pool.query(
      `SELECT date, revenue_today, costs_today, gross_profit_today, gross_margin_pct FROM daily_profit_snapshots WHERE date >= CURRENT_DATE - 30 ORDER BY date ASC`
    );
    const health = await pool.query(
      `SELECT date, total_ar, total_ap, net_cash_position, current_ratio, runway_months, employee_count FROM company_health_metrics WHERE date >= CURRENT_DATE - 30 ORDER BY date ASC`
    );
    res.json({ profit_trend: profits.rows, health_trend: health.rows });
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// Dashboard
router.get("/daily-profit/dashboard", async (_req, res) => {
  try {
    await init();
    const today = new Date().toISOString().slice(0, 10);
    const todaySnap = await pool.query(`SELECT * FROM daily_profit_snapshots WHERE date = $1`, [today]);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const yesterdaySnap = await pool.query(`SELECT * FROM daily_profit_snapshots WHERE date = $1`, [yesterday]);
    const health = await pool.query(`SELECT * FROM company_health_metrics ORDER BY date DESC LIMIT 1`);
    const trend30 = await pool.query(`SELECT date, gross_profit_today, gross_margin_pct FROM daily_profit_snapshots WHERE date >= CURRENT_DATE - 30 ORDER BY date ASC`);

    const monthStart = today.slice(0, 7) + "-01";
    const monthSummary = await pool.query(
      `SELECT SUM(revenue_today) as revenue, SUM(costs_today) as costs, SUM(gross_profit_today) as profit, COUNT(*) as days FROM daily_profit_snapshots WHERE date >= $1`,
      [monthStart]
    );

    const t = todaySnap.rows[0];
    const y = yesterdaySnap.rows[0];
    const profitChange = t && y ? parseFloat(t.gross_profit_today) - parseFloat(y.gross_profit_today) : 0;

    res.json({
      today: t || { date: today, revenue_today: 0, costs_today: 0, gross_profit_today: 0, gross_margin_pct: 0 },
      yesterday: y || null,
      profit_change: profitChange,
      month_summary: monthSummary.rows[0] || { revenue: 0, costs: 0, profit: 0, days: 0 },
      health: health.rows[0] || {},
      trend_30_days: trend30.rows,
    });
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

export default router;
