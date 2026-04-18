import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dt_twins (
      id SERIAL PRIMARY KEY,
      twin_type VARCHAR(50) NOT NULL CHECK (twin_type IN ('factory','project','cashflow','inventory','crew')),
      name VARCHAR(300) NOT NULL,
      status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','paused')),
      config JSONB DEFAULT '{}',
      last_sync TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS dt_snapshots (
      id SERIAL PRIMARY KEY,
      twin_id INTEGER NOT NULL REFERENCES dt_twins(id) ON DELETE CASCADE,
      snapshot_data JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS dt_simulations (
      id SERIAL PRIMARY KEY,
      twin_id INTEGER NOT NULL REFERENCES dt_twins(id) ON DELETE CASCADE,
      scenario_name VARCHAR(300) NOT NULL,
      assumptions JSONB DEFAULT '{}',
      results JSONB DEFAULT '{}',
      status VARCHAR(20) DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    );

    CREATE INDEX IF NOT EXISTS idx_dt_twins_type ON dt_twins(twin_type);
    CREATE INDEX IF NOT EXISTS idx_dt_twins_status ON dt_twins(status);
    CREATE INDEX IF NOT EXISTS idx_dt_snapshots_twin ON dt_snapshots(twin_id);
    CREATE INDEX IF NOT EXISTS idx_dt_simulations_twin ON dt_simulations(twin_id);
    CREATE INDEX IF NOT EXISTS idx_dt_simulations_status ON dt_simulations(status);
  `);
}
ensureTables().catch(() => {});

// ── CRUD: Create twin ──
router.post("/digital-twin", async (req, res) => {
  try {
    const { twin_type, name, config } = req.body;
    if (!twin_type || !name) {
      return res.status(400).json({ error: "twin_type ו-name נדרשים" });
    }
    const result = await pool.query(
      `INSERT INTO dt_twins (twin_type, name, config) VALUES ($1, $2, $3) RETURNING *`,
      [twin_type, name, JSON.stringify(config || {})]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── List twins ──
router.get("/digital-twin", async (req, res) => {
  try {
    const { type, status, limit = "50", offset = "0" } = req.query;
    let query = `SELECT t.*,
      (SELECT COUNT(*) FROM dt_snapshots s WHERE s.twin_id = t.id) as snapshot_count,
      (SELECT COUNT(*) FROM dt_simulations sim WHERE sim.twin_id = t.id) as simulation_count
      FROM dt_twins t WHERE 1=1`;
    const params: any[] = [];
    if (type) { params.push(type); query += ` AND t.twin_type = $${params.length}`; }
    if (status) { params.push(status); query += ` AND t.status = $${params.length}`; }
    query += ` ORDER BY t.updated_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(Number(limit), Number(offset));
    const result = await pool.query(query, params);
    const countQ = await pool.query(`SELECT COUNT(*) FROM dt_twins`);
    res.json({ twins: result.rows, total: Number(countQ.rows[0].count) });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Get single twin ──
router.get("/digital-twin/:id", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.*,
        (SELECT COUNT(*) FROM dt_snapshots s WHERE s.twin_id = t.id) as snapshot_count,
        (SELECT COUNT(*) FROM dt_simulations sim WHERE sim.twin_id = t.id) as simulation_count
       FROM dt_twins t WHERE t.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "תאום דיגיטלי לא נמצא" });
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Update twin ──
router.put("/digital-twin/:id", async (req, res) => {
  try {
    const { name, status, config } = req.body;
    const result = await pool.query(
      `UPDATE dt_twins SET
        name = COALESCE($1, name),
        status = COALESCE($2, status),
        config = COALESCE($3, config),
        updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [name || null, status || null, config ? JSON.stringify(config) : null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "תאום דיגיטלי לא נמצא" });
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Delete twin ──
router.delete("/digital-twin/:id", async (req, res) => {
  try {
    const result = await pool.query(`DELETE FROM dt_twins WHERE id = $1 RETURNING id`, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "תאום דיגיטלי לא נמצא" });
    res.json({ success: true, deleted_id: result.rows[0].id });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Capture snapshot ──
router.post("/digital-twin/:id/snapshot", async (req, res) => {
  try {
    const twinId = Number(req.params.id);
    const twin = await pool.query(`SELECT * FROM dt_twins WHERE id = $1`, [twinId]);
    if (twin.rows.length === 0) return res.status(404).json({ error: "תאום דיגיטלי לא נמצא" });

    const twinData = twin.rows[0];
    // Build snapshot from live data based on twin type
    let liveData: any = { twin_config: twinData.config, captured_at: new Date().toISOString() };

    if (twinData.twin_type === "inventory") {
      const inv = await pool.query(`SELECT COUNT(*) as items, COALESCE(SUM(CAST(current_stock AS numeric)),0) as total_stock FROM raw_materials WHERE status IN ('פעיל','active')`).catch(() => ({ rows: [{ items: 0, total_stock: 0 }] }));
      liveData.inventory = inv.rows[0];
    } else if (twinData.twin_type === "cashflow") {
      const ar = await pool.query(`SELECT COUNT(*) as count, COALESCE(SUM(CAST(balance_due AS numeric)),0) as total FROM accounts_receivable WHERE status NOT IN ('paid','cancelled')`).catch(() => ({ rows: [{ count: 0, total: 0 }] }));
      const ap = await pool.query(`SELECT COUNT(*) as count, COALESCE(SUM(CAST(balance_due AS numeric)),0) as total FROM accounts_payable WHERE status NOT IN ('paid','cancelled')`).catch(() => ({ rows: [{ count: 0, total: 0 }] }));
      liveData.receivables = ar.rows[0];
      liveData.payables = ap.rows[0];
    } else if (twinData.twin_type === "factory") {
      const wo = await pool.query(`SELECT status, COUNT(*) as count FROM work_orders GROUP BY status`).catch(() => ({ rows: [] }));
      liveData.work_orders = wo.rows;
    }

    if (req.body.snapshot_data) {
      liveData = { ...liveData, ...req.body.snapshot_data };
    }

    const result = await pool.query(
      `INSERT INTO dt_snapshots (twin_id, snapshot_data) VALUES ($1, $2) RETURNING *`,
      [twinId, JSON.stringify(liveData)]
    );
    await pool.query(`UPDATE dt_twins SET last_sync = NOW(), updated_at = NOW() WHERE id = $1`, [twinId]);
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Run simulation ──
router.post("/digital-twin/:id/simulate", async (req, res) => {
  try {
    const twinId = Number(req.params.id);
    const { scenario_name, assumptions } = req.body;
    if (!scenario_name) return res.status(400).json({ error: "scenario_name נדרש" });

    const twin = await pool.query(`SELECT * FROM dt_twins WHERE id = $1`, [twinId]);
    if (twin.rows.length === 0) return res.status(404).json({ error: "תאום דיגיטלי לא נמצא" });

    // Create simulation record
    const sim = await pool.query(
      `INSERT INTO dt_simulations (twin_id, scenario_name, assumptions, status) VALUES ($1, $2, $3, 'running') RETURNING *`,
      [twinId, scenario_name, JSON.stringify(assumptions || {})]
    );
    const simId = sim.rows[0].id;

    // Run simulation logic based on twin type and assumptions
    const twinData = twin.rows[0];
    const lastSnapshot = await pool.query(
      `SELECT snapshot_data FROM dt_snapshots WHERE twin_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [twinId]
    );
    const baseData = lastSnapshot.rows[0]?.snapshot_data || {};
    const params = assumptions || {};

    let results: any = { scenario: scenario_name, base_data: baseData, timestamp: new Date().toISOString() };

    if (twinData.twin_type === "cashflow") {
      const revGrowth = Number(params.revenue_growth_pct || 5) / 100;
      const costChange = Number(params.cost_change_pct || 3) / 100;
      const months = Number(params.forecast_months || 6);
      const baseRev = Number(baseData.receivables?.total || 500000);
      const baseCost = Number(baseData.payables?.total || 350000);
      results.projections = Array.from({ length: months }, (_, i) => ({
        month: i + 1,
        projected_revenue: Math.round(baseRev * Math.pow(1 + revGrowth / 12, i + 1)),
        projected_cost: Math.round(baseCost * Math.pow(1 + costChange / 12, i + 1)),
        net_cashflow: Math.round(baseRev * Math.pow(1 + revGrowth / 12, i + 1) - baseCost * Math.pow(1 + costChange / 12, i + 1)),
      }));
    } else if (twinData.twin_type === "factory") {
      const efficiency = Number(params.target_efficiency_pct || 85) / 100;
      const capacityIncrease = Number(params.capacity_increase_pct || 10) / 100;
      results.predicted_output = Math.round((params.current_output || 100) * (1 + capacityIncrease) * efficiency);
      results.bottleneck_risk = efficiency > 0.9 ? "גבוה" : efficiency > 0.75 ? "בינוני" : "נמוך";
      results.recommended_actions = efficiency < 0.8 ? ["שדרוג ציוד", "הכשרת עובדים", "תחזוקה מונעת"] : ["אופטימיזציה", "מעקב שוטף"];
    } else if (twinData.twin_type === "inventory") {
      const demandIncrease = Number(params.demand_increase_pct || 10) / 100;
      const leadTimeDays = Number(params.lead_time_days || 14);
      results.reorder_recommendations = { demand_factor: 1 + demandIncrease, safety_stock_days: leadTimeDays * 1.5, reorder_urgency: demandIncrease > 0.2 ? "גבוהה" : "רגילה" };
    } else {
      results.generic_projection = { growth_factor: Number(params.growth_pct || 5) / 100, risk_level: "בינוני", confidence: 0.75 };
    }

    await pool.query(
      `UPDATE dt_simulations SET results = $1, status = 'completed', completed_at = NOW() WHERE id = $2`,
      [JSON.stringify(results), simId]
    );

    res.json({ ...sim.rows[0], results, status: "completed" });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Twin history (snapshots + simulations) ──
router.get("/digital-twin/:id/history", async (req, res) => {
  try {
    const twinId = Number(req.params.id);
    const [snapshots, simulations] = await Promise.all([
      pool.query(`SELECT * FROM dt_snapshots WHERE twin_id = $1 ORDER BY created_at DESC LIMIT 30`, [twinId]),
      pool.query(`SELECT * FROM dt_simulations WHERE twin_id = $1 ORDER BY created_at DESC LIMIT 30`, [twinId]),
    ]);
    res.json({ snapshots: snapshots.rows, simulations: simulations.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Dashboard ──
router.get("/digital-twin/dashboard", async (req, res) => {
  try {
    const [totalTwins, byType, byStatus, recentSims, recentSnaps, activeSims] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM dt_twins`),
      pool.query(`SELECT twin_type, COUNT(*) as count FROM dt_twins GROUP BY twin_type ORDER BY count DESC`),
      pool.query(`SELECT status, COUNT(*) as count FROM dt_twins GROUP BY status`),
      pool.query(`SELECT s.*, t.name as twin_name, t.twin_type FROM dt_simulations s JOIN dt_twins t ON t.id = s.twin_id ORDER BY s.created_at DESC LIMIT 10`),
      pool.query(`SELECT s.*, t.name as twin_name FROM dt_snapshots s JOIN dt_twins t ON t.id = s.twin_id ORDER BY s.created_at DESC LIMIT 10`),
      pool.query(`SELECT COUNT(*) FROM dt_simulations WHERE status = 'running'`),
    ]);
    res.json({
      total_twins: Number(totalTwins.rows[0].count),
      by_type: byType.rows,
      by_status: byStatus.rows,
      active_simulations: Number(activeSims.rows[0].count),
      recent_simulations: recentSims.rows,
      recent_snapshots: recentSnaps.rows,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
