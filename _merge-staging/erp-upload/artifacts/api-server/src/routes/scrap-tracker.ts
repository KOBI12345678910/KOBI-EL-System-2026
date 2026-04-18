import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

// ─── Auto-create tables ───────────────────────────────────────────────────────
async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS scrap_entries (
      id SERIAL PRIMARY KEY,
      date DATE DEFAULT CURRENT_DATE,
      project_id INTEGER,
      material_item_id INTEGER,
      material_name VARCHAR(300),
      planned_qty NUMERIC(12,2) DEFAULT 0,
      actual_qty NUMERIC(12,2) DEFAULT 0,
      scrap_qty NUMERIC(12,2) DEFAULT 0,
      scrap_pct NUMERIC(6,2) DEFAULT 0,
      scrap_reason VARCHAR(50),
      scrap_value NUMERIC(12,2) DEFAULT 0,
      recoverable BOOLEAN DEFAULT false,
      worker_id INTEGER,
      worker_name VARCHAR(200),
      station VARCHAR(100),
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS scrap_analysis (
      id SERIAL PRIMARY KEY,
      period VARCHAR(20),
      total_material_used NUMERIC(14,2) DEFAULT 0,
      total_scrap NUMERIC(14,2) DEFAULT 0,
      scrap_rate NUMERIC(6,2) DEFAULT 0,
      scrap_value NUMERIC(14,2) DEFAULT 0,
      recovered_value NUMERIC(14,2) DEFAULT 0,
      top_reasons JSONB DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS scrap_recovery (
      id SERIAL PRIMARY KEY,
      scrap_entry_id INTEGER REFERENCES scrap_entries(id) ON DELETE CASCADE,
      recovery_type VARCHAR(50),
      recovered_amount NUMERIC(12,2) DEFAULT 0,
      revenue NUMERIC(12,2) DEFAULT 0,
      date DATE DEFAULT CURRENT_DATE
    );
  `);
}
ensureTables().catch(console.error);

// ─── Dashboard ────────────────────────────────────────────────────────────────
router.get("/scrap-tracker/dashboard", async (_req, res) => {
  try {
    const [summary, byReason, byMaterial, monthly, recentRecovery] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) as total_entries,
          COALESCE(SUM(scrap_qty), 0) as total_scrap_qty,
          COALESCE(SUM(scrap_value), 0) as total_scrap_value,
          COALESCE(AVG(scrap_pct), 0) as avg_scrap_rate,
          COALESCE(SUM(planned_qty), 0) as total_planned,
          COALESCE(SUM(actual_qty), 0) as total_actual,
          COUNT(*) FILTER (WHERE recoverable = true) as recoverable_count
        FROM scrap_entries
        WHERE date >= CURRENT_DATE - 30
      `),
      pool.query(`
        SELECT scrap_reason, COUNT(*) as cnt,
          ROUND(SUM(scrap_qty)::numeric, 2) as total_qty,
          ROUND(SUM(scrap_value)::numeric, 2) as total_value
        FROM scrap_entries
        WHERE date >= CURRENT_DATE - 30 AND scrap_reason IS NOT NULL
        GROUP BY scrap_reason ORDER BY total_value DESC
      `),
      pool.query(`
        SELECT material_name, COUNT(*) as cnt,
          ROUND(SUM(scrap_qty)::numeric, 2) as total_qty,
          ROUND(AVG(scrap_pct)::numeric, 1) as avg_scrap_pct,
          ROUND(SUM(scrap_value)::numeric, 2) as total_value
        FROM scrap_entries
        WHERE date >= CURRENT_DATE - 30 AND material_name IS NOT NULL
        GROUP BY material_name ORDER BY total_value DESC LIMIT 10
      `),
      pool.query(`
        SELECT TO_CHAR(date, 'YYYY-MM') as month,
          COUNT(*) as entries,
          ROUND(SUM(scrap_qty)::numeric, 2) as scrap_qty,
          ROUND(SUM(scrap_value)::numeric, 2) as scrap_value,
          ROUND(AVG(scrap_pct)::numeric, 1) as avg_rate
        FROM scrap_entries
        WHERE date >= CURRENT_DATE - 365
        GROUP BY TO_CHAR(date, 'YYYY-MM')
        ORDER BY month
      `),
      pool.query(`
        SELECT sr.*, se.material_name FROM scrap_recovery sr
        JOIN scrap_entries se ON se.id = sr.scrap_entry_id
        ORDER BY sr.date DESC LIMIT 10
      `)
    ]);
    res.json({
      summary: summary.rows[0],
      byReason: byReason.rows,
      byMaterial: byMaterial.rows,
      monthlyTrend: monthly.rows,
      recentRecovery: recentRecovery.rows
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Scrap Entries CRUD ───────────────────────────────────────────────────────
router.get("/scrap-tracker/entries", async (req, res) => {
  try {
    const { project_id, worker_id, material_item_id, reason, from, to, search } = req.query;
    let q = `SELECT * FROM scrap_entries WHERE 1=1`;
    const params: any[] = [];
    if (project_id) { params.push(project_id); q += ` AND project_id=$${params.length}`; }
    if (worker_id) { params.push(worker_id); q += ` AND worker_id=$${params.length}`; }
    if (material_item_id) { params.push(material_item_id); q += ` AND material_item_id=$${params.length}`; }
    if (reason) { params.push(reason); q += ` AND scrap_reason=$${params.length}`; }
    if (from) { params.push(from); q += ` AND date >= $${params.length}`; }
    if (to) { params.push(to); q += ` AND date <= $${params.length}`; }
    if (search) { params.push(`%${search}%`); q += ` AND (material_name ILIKE $${params.length} OR worker_name ILIKE $${params.length} OR station ILIKE $${params.length})`; }
    q += ` ORDER BY date DESC, created_at DESC`;
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/scrap-tracker/entries/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM scrap_entries WHERE id=$1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: "לא נמצא" });
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/scrap-tracker/entries", async (req, res) => {
  try {
    const b = req.body;
    const scrapQty = Number(b.actual_qty || 0) - Number(b.planned_qty || 0);
    const scrapPct = Number(b.planned_qty || 0) > 0
      ? (Math.abs(scrapQty) / Number(b.planned_qty)) * 100 : 0;
    const { rows } = await pool.query(
      `INSERT INTO scrap_entries (date, project_id, material_item_id, material_name,
        planned_qty, actual_qty, scrap_qty, scrap_pct, scrap_reason, scrap_value,
        recoverable, worker_id, worker_name, station)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [b.date || new Date(), b.project_id, b.material_item_id, b.material_name,
       b.planned_qty, b.actual_qty, b.scrap_qty || Math.abs(scrapQty), b.scrap_pct || scrapPct,
       b.scrap_reason, b.scrap_value || 0, b.recoverable || false,
       b.worker_id, b.worker_name, b.station]
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/scrap-tracker/entries/:id", async (req, res) => {
  try {
    const b = req.body;
    const { rows } = await pool.query(
      `UPDATE scrap_entries SET date=$1, project_id=$2, material_item_id=$3, material_name=$4,
        planned_qty=$5, actual_qty=$6, scrap_qty=$7, scrap_pct=$8, scrap_reason=$9,
        scrap_value=$10, recoverable=$11, worker_id=$12, worker_name=$13, station=$14
       WHERE id=$15 RETURNING *`,
      [b.date, b.project_id, b.material_item_id, b.material_name,
       b.planned_qty, b.actual_qty, b.scrap_qty, b.scrap_pct, b.scrap_reason,
       b.scrap_value, b.recoverable, b.worker_id, b.worker_name, b.station,
       req.params.id]
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/scrap-tracker/entries/:id", async (req, res) => {
  try {
    await pool.query(`DELETE FROM scrap_entries WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── By Project ───────────────────────────────────────────────────────────────
router.get("/scrap-tracker/by-project", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT project_id, COUNT(*) as entries,
        ROUND(SUM(scrap_qty)::numeric, 2) as total_scrap,
        ROUND(SUM(scrap_value)::numeric, 2) as total_value,
        ROUND(AVG(scrap_pct)::numeric, 1) as avg_scrap_rate
      FROM scrap_entries WHERE project_id IS NOT NULL
      GROUP BY project_id ORDER BY total_value DESC
    `);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── By Worker ────────────────────────────────────────────────────────────────
router.get("/scrap-tracker/by-worker", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT worker_id, worker_name, COUNT(*) as entries,
        ROUND(SUM(scrap_qty)::numeric, 2) as total_scrap,
        ROUND(SUM(scrap_value)::numeric, 2) as total_value,
        ROUND(AVG(scrap_pct)::numeric, 1) as avg_scrap_rate
      FROM scrap_entries WHERE worker_name IS NOT NULL
      GROUP BY worker_id, worker_name ORDER BY avg_scrap_rate DESC
    `);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── By Material ──────────────────────────────────────────────────────────────
router.get("/scrap-tracker/by-material", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT material_item_id, material_name, COUNT(*) as entries,
        ROUND(SUM(scrap_qty)::numeric, 2) as total_scrap,
        ROUND(SUM(scrap_value)::numeric, 2) as total_value,
        ROUND(AVG(scrap_pct)::numeric, 1) as avg_scrap_rate
      FROM scrap_entries WHERE material_name IS NOT NULL
      GROUP BY material_item_id, material_name ORDER BY total_value DESC
    `);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── By Reason ────────────────────────────────────────────────────────────────
router.get("/scrap-tracker/by-reason", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT scrap_reason, COUNT(*) as entries,
        ROUND(SUM(scrap_qty)::numeric, 2) as total_scrap,
        ROUND(SUM(scrap_value)::numeric, 2) as total_value,
        ROUND(AVG(scrap_pct)::numeric, 1) as avg_scrap_rate
      FROM scrap_entries WHERE scrap_reason IS NOT NULL
      GROUP BY scrap_reason ORDER BY entries DESC
    `);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Analyze Period ───────────────────────────────────────────────────────────
router.post("/scrap-tracker/analyze-period", async (req, res) => {
  try {
    const { from, to } = req.body;
    const period = `${from || 'all'}_${to || 'all'}`;
    let dateFilter = '';
    const params: any[] = [];
    if (from) { params.push(from); dateFilter += ` AND date >= $${params.length}`; }
    if (to) { params.push(to); dateFilter += ` AND date <= $${params.length}`; }

    const totals = await pool.query(`
      SELECT
        COALESCE(SUM(planned_qty), 0) as total_material_used,
        COALESCE(SUM(scrap_qty), 0) as total_scrap,
        CASE WHEN SUM(planned_qty) > 0
          THEN ROUND((SUM(scrap_qty) / SUM(planned_qty) * 100)::numeric, 2) ELSE 0 END as scrap_rate,
        COALESCE(SUM(scrap_value), 0) as scrap_value
      FROM scrap_entries WHERE 1=1 ${dateFilter}
    `, params);

    const recovered = await pool.query(`
      SELECT COALESCE(SUM(sr.revenue), 0) as recovered_value
      FROM scrap_recovery sr
      JOIN scrap_entries se ON se.id = sr.scrap_entry_id
      WHERE 1=1 ${dateFilter.replace(/date/g, 'se.date')}
    `, params);

    const reasons = await pool.query(`
      SELECT scrap_reason, COUNT(*) as cnt,
        ROUND(SUM(scrap_value)::numeric, 2) as value
      FROM scrap_entries WHERE scrap_reason IS NOT NULL ${dateFilter}
      GROUP BY scrap_reason ORDER BY cnt DESC LIMIT 5
    `, params);

    const analysis = {
      period,
      ...totals.rows[0],
      recovered_value: recovered.rows[0]?.recovered_value || 0,
      top_reasons: reasons.rows
    };

    // Upsert analysis record
    await pool.query(`
      INSERT INTO scrap_analysis (period, total_material_used, total_scrap, scrap_rate,
        scrap_value, recovered_value, top_reasons)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT DO NOTHING
    `, [period, analysis.total_material_used, analysis.total_scrap, analysis.scrap_rate,
        analysis.scrap_value, analysis.recovered_value, JSON.stringify(analysis.top_reasons)]);

    res.json(analysis);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Trends ───────────────────────────────────────────────────────────────────
router.get("/scrap-tracker/trends", async (req, res) => {
  try {
    const months = Number(req.query.months) || 12;
    const { rows } = await pool.query(`
      SELECT TO_CHAR(date, 'YYYY-MM') as month,
        COUNT(*) as entries,
        ROUND(SUM(planned_qty)::numeric, 2) as planned,
        ROUND(SUM(scrap_qty)::numeric, 2) as scrap,
        ROUND(AVG(scrap_pct)::numeric, 1) as avg_rate,
        ROUND(SUM(scrap_value)::numeric, 2) as value
      FROM scrap_entries
      WHERE date >= CURRENT_DATE - ($1 || ' months')::interval
      GROUP BY TO_CHAR(date, 'YYYY-MM')
      ORDER BY month
    `, [months]);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Recovery CRUD ────────────────────────────────────────────────────────────
router.get("/scrap-tracker/recovery", async (req, res) => {
  try {
    const { scrap_entry_id } = req.query;
    let q = `SELECT sr.*, se.material_name FROM scrap_recovery sr
             JOIN scrap_entries se ON se.id = sr.scrap_entry_id WHERE 1=1`;
    const params: any[] = [];
    if (scrap_entry_id) { params.push(scrap_entry_id); q += ` AND sr.scrap_entry_id=$${params.length}`; }
    q += ` ORDER BY sr.date DESC`;
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/scrap-tracker/recovery", async (req, res) => {
  try {
    const b = req.body;
    const { rows } = await pool.query(
      `INSERT INTO scrap_recovery (scrap_entry_id, recovery_type, recovered_amount, revenue, date)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [b.scrap_entry_id, b.recovery_type, b.recovered_amount, b.revenue, b.date || new Date()]
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/scrap-tracker/recovery/:id", async (req, res) => {
  try {
    const b = req.body;
    const { rows } = await pool.query(
      `UPDATE scrap_recovery SET recovery_type=$1, recovered_amount=$2, revenue=$3, date=$4
       WHERE id=$5 RETURNING *`,
      [b.recovery_type, b.recovered_amount, b.revenue, b.date, req.params.id]
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/scrap-tracker/recovery/:id", async (req, res) => {
  try {
    await pool.query(`DELETE FROM scrap_recovery WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
