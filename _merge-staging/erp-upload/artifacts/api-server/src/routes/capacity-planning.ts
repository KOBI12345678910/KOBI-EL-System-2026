import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS resource_pools (
      id SERIAL PRIMARY KEY,
      pool_name VARCHAR(300) NOT NULL,
      resource_type VARCHAR(30) NOT NULL CHECK (resource_type IN ('machine','labor','crew','vehicle','tool')),
      total_capacity NUMERIC(12,2) DEFAULT 0,
      unit VARCHAR(30) DEFAULT 'hours',
      location VARCHAR(300),
      status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','maintenance','retired')),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS resource_capacity (
      id SERIAL PRIMARY KEY,
      pool_id INTEGER REFERENCES resource_pools(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      available_capacity NUMERIC(12,2) DEFAULT 0,
      allocated_capacity NUMERIC(12,2) DEFAULT 0,
      remaining_capacity NUMERIC(12,2) DEFAULT 0,
      utilization_pct REAL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(pool_id, date)
    );

    CREATE TABLE IF NOT EXISTS capacity_demands (
      id SERIAL PRIMARY KEY,
      pool_id INTEGER REFERENCES resource_pools(id) ON DELETE CASCADE,
      source_type VARCHAR(30) NOT NULL CHECK (source_type IN ('work_order','project','installation','maintenance')),
      source_id INTEGER,
      required_capacity NUMERIC(12,2) DEFAULT 0,
      priority INTEGER DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      status VARCHAR(20) DEFAULT 'planned' CHECK (status IN ('planned','confirmed','in_progress','completed','cancelled')),
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS capacity_conflicts (
      id SERIAL PRIMARY KEY,
      pool_id INTEGER REFERENCES resource_pools(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      overload_amount NUMERIC(12,2) DEFAULT 0,
      conflicting_demands JSONB DEFAULT '[]'::jsonb,
      resolution_status VARCHAR(20) DEFAULT 'open' CHECK (resolution_status IN ('open','resolved','deferred')),
      resolution TEXT,
      detected_at TIMESTAMPTZ DEFAULT NOW(),
      resolved_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS capacity_scenarios (
      id SERIAL PRIMARY KEY,
      scenario_name VARCHAR(300) NOT NULL,
      assumptions JSONB DEFAULT '{}'::jsonb,
      results JSONB DEFAULT '{}'::jsonb,
      best_utilization REAL DEFAULT 0,
      worst_bottleneck VARCHAR(300),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_capacity_pool_date ON resource_capacity(pool_id, date);
    CREATE INDEX IF NOT EXISTS idx_demands_pool ON capacity_demands(pool_id);
    CREATE INDEX IF NOT EXISTS idx_demands_dates ON capacity_demands(start_date, end_date);
    CREATE INDEX IF NOT EXISTS idx_conflicts_pool ON capacity_conflicts(pool_id);
  `);
}
ensureTables().catch(console.error);

/* ───────── CRUD resource_pools ───────── */
router.get("/capacity/pools", async (_req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM resource_pools ORDER BY pool_name`);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/capacity/pools", async (req, res) => {
  try {
    const { pool_name, resource_type, total_capacity, unit, location } = req.body;
    const { rows } = await pool.query(`
      INSERT INTO resource_pools (pool_name, resource_type, total_capacity, unit, location)
      VALUES ($1,$2,$3,$4,$5) RETURNING *
    `, [pool_name, resource_type, total_capacity || 0, unit || 'hours', location]);
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/capacity/pools/:id", async (req, res) => {
  try {
    const { pool_name, resource_type, total_capacity, unit, location, status } = req.body;
    const { rows } = await pool.query(`
      UPDATE resource_pools SET
        pool_name = COALESCE($2, pool_name), resource_type = COALESCE($3, resource_type),
        total_capacity = COALESCE($4, total_capacity), unit = COALESCE($5, unit),
        location = COALESCE($6, location), status = COALESCE($7, status), updated_at = NOW()
      WHERE id = $1 RETURNING *
    `, [req.params.id, pool_name, resource_type, total_capacity, unit, location, status]);
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/* ───────── GET calendar ───────── */
router.get("/capacity/calendar/:poolId", async (req, res) => {
  try {
    const from = req.query.from || new Date().toISOString().slice(0, 10);
    const to = req.query.to || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const { rows } = await pool.query(`
      SELECT * FROM resource_capacity
      WHERE pool_id = $1 AND date BETWEEN $2 AND $3
      ORDER BY date
    `, [req.params.poolId, from, to]);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/* ───────── CRUD demands ───────── */
router.get("/capacity/demands", async (req, res) => {
  try {
    const poolId = req.query.poolId;
    const where = poolId ? `WHERE d.pool_id = ${parseInt(String(poolId))}` : '';
    const { rows } = await pool.query(`
      SELECT d.*, p.pool_name, p.resource_type FROM capacity_demands d
      LEFT JOIN resource_pools p ON p.id = d.pool_id
      ${where} ORDER BY d.priority ASC, d.start_date
    `);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/capacity/demands", async (req, res) => {
  try {
    const { pool_id, source_type, source_id, required_capacity, priority, start_date, end_date, notes } = req.body;
    const { rows } = await pool.query(`
      INSERT INTO capacity_demands (pool_id, source_type, source_id, required_capacity, priority, start_date, end_date, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
    `, [pool_id, source_type, source_id, required_capacity || 0, priority || 5, start_date, end_date, notes]);
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/* ───────── POST allocate ───────── */
router.post("/capacity/allocate", async (req, res) => {
  try {
    const { pool_id, from_date, to_date } = req.body;
    const thePool = await pool.query(`SELECT * FROM resource_pools WHERE id = $1`, [pool_id]);
    if (!thePool.rows.length) return res.status(404).json({ error: "Pool not found" });

    const dailyCap = Number(thePool.rows[0].total_capacity);
    const demands = await pool.query(`
      SELECT * FROM capacity_demands
      WHERE pool_id = $1 AND status IN ('planned','confirmed','in_progress')
      AND start_date <= $3 AND end_date >= $2
      ORDER BY priority ASC
    `, [pool_id, from_date, to_date]);

    // Build day-by-day allocation
    const start = new Date(from_date);
    const end = new Date(to_date);
    const conflicts: any[] = [];
    const capacityEntries: any[] = [];

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().slice(0, 10);
      const dayDemands = demands.rows.filter((dm: any) =>
        dateStr >= dm.start_date.toISOString().slice(0, 10) && dateStr <= dm.end_date.toISOString().slice(0, 10)
      );
      const totalDemand = dayDemands.reduce((s: number, dm: any) => s + Number(dm.required_capacity), 0);
      const allocated = Math.min(totalDemand, dailyCap);
      const remaining = Math.max(dailyCap - totalDemand, 0);
      const util = dailyCap > 0 ? (allocated / dailyCap) * 100 : 0;

      await pool.query(`
        INSERT INTO resource_capacity (pool_id, date, available_capacity, allocated_capacity, remaining_capacity, utilization_pct)
        VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (pool_id, date) DO UPDATE SET
          available_capacity = $3, allocated_capacity = $4, remaining_capacity = $5, utilization_pct = $6
      `, [pool_id, dateStr, dailyCap, allocated, remaining, util]);

      capacityEntries.push({ date: dateStr, available: dailyCap, allocated, remaining, utilization: Math.round(util) });

      if (totalDemand > dailyCap) {
        const overload = totalDemand - dailyCap;
        await pool.query(`
          INSERT INTO capacity_conflicts (pool_id, date, overload_amount, conflicting_demands, resolution_status)
          VALUES ($1,$2,$3,$4,'open')
        `, [pool_id, dateStr, overload, JSON.stringify(dayDemands.map((dm: any) => dm.id))]);
        conflicts.push({ date: dateStr, overload, demand_ids: dayDemands.map((dm: any) => dm.id) });
      }
    }

    res.json({ allocated: capacityEntries.length, conflicts, capacityEntries });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/* ───────── GET conflicts ───────── */
router.get("/capacity/conflicts", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT c.*, p.pool_name FROM capacity_conflicts c
      LEFT JOIN resource_pools p ON p.id = c.pool_id
      WHERE c.resolution_status = 'open'
      ORDER BY c.overload_amount DESC
    `);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/capacity/conflicts/:id", async (req, res) => {
  try {
    const { resolution_status, resolution } = req.body;
    const { rows } = await pool.query(`
      UPDATE capacity_conflicts SET resolution_status=$2, resolution=$3,
        resolved_at = CASE WHEN $2='resolved' THEN NOW() ELSE resolved_at END
      WHERE id=$1 RETURNING *
    `, [req.params.id, resolution_status, resolution]);
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/* ───────── POST simulate ───────── */
router.post("/capacity/simulate", async (req, res) => {
  try {
    const { scenario_name, assumptions } = req.body;
    // assumptions: { pool_adjustments: [{pool_id, new_capacity}], demand_changes: [{demand_id, new_capacity}] }

    const pools = await pool.query(`SELECT * FROM resource_pools WHERE status='active'`);
    const demands = await pool.query(`SELECT * FROM capacity_demands WHERE status IN ('planned','confirmed')`);

    const poolMap: Record<number, number> = {};
    pools.rows.forEach((p: any) => { poolMap[p.id] = Number(p.total_capacity); });

    if (assumptions?.pool_adjustments) {
      for (const adj of assumptions.pool_adjustments) {
        poolMap[adj.pool_id] = adj.new_capacity;
      }
    }

    const demandMap: Record<number, number> = {};
    demands.rows.forEach((d: any) => { demandMap[d.pool_id] = (demandMap[d.pool_id] || 0) + Number(d.required_capacity); });

    if (assumptions?.demand_changes) {
      for (const ch of assumptions.demand_changes) {
        demandMap[ch.pool_id] = (demandMap[ch.pool_id] || 0) + ch.new_capacity;
      }
    }

    let bestUtil = 0;
    let worstBottleneck = '';
    let worstOverload = 0;
    const results: any[] = [];

    for (const p of pools.rows) {
      const cap = poolMap[p.id] || 0;
      const demand = demandMap[p.id] || 0;
      const util = cap > 0 ? (demand / cap) * 100 : 0;
      const overload = Math.max(demand - cap, 0);
      results.push({ pool_id: p.id, pool_name: p.pool_name, capacity: cap, demand, utilization: Math.round(util), overload });

      if (util > bestUtil) bestUtil = util;
      if (overload > worstOverload) { worstOverload = overload; worstBottleneck = p.pool_name; }
    }

    const { rows } = await pool.query(`
      INSERT INTO capacity_scenarios (scenario_name, assumptions, results, best_utilization, worst_bottleneck)
      VALUES ($1,$2,$3,$4,$5) RETURNING *
    `, [scenario_name, JSON.stringify(assumptions || {}), JSON.stringify(results), bestUtil, worstBottleneck]);

    res.json({ scenario: rows[0], results });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/* ───────── GET utilization-report ───────── */
router.get("/capacity/utilization-report", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT p.id, p.pool_name, p.resource_type, p.total_capacity, p.unit,
        COALESCE(AVG(c.utilization_pct), 0) as avg_utilization,
        COALESCE(MAX(c.utilization_pct), 0) as peak_utilization,
        COALESCE(MIN(c.utilization_pct), 0) as min_utilization,
        COUNT(DISTINCT cf.id) as conflict_count
      FROM resource_pools p
      LEFT JOIN resource_capacity c ON c.pool_id = p.id AND c.date >= CURRENT_DATE - INTERVAL '30 days'
      LEFT JOIN capacity_conflicts cf ON cf.pool_id = p.id AND cf.resolution_status = 'open'
      WHERE p.status = 'active'
      GROUP BY p.id ORDER BY avg_utilization DESC
    `);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/* ───────── GET dashboard ───────── */
router.get("/capacity/dashboard", async (_req, res) => {
  try {
    const pools = await pool.query(`SELECT * FROM resource_pools WHERE status='active' ORDER BY pool_name`);
    const conflicts = await pool.query(`SELECT COUNT(*) as count FROM capacity_conflicts WHERE resolution_status='open'`);
    const utilization = await pool.query(`
      SELECT p.id, p.pool_name, COALESCE(AVG(c.utilization_pct),0) as avg_util
      FROM resource_pools p LEFT JOIN resource_capacity c ON c.pool_id=p.id AND c.date >= CURRENT_DATE AND c.date <= CURRENT_DATE + 7
      WHERE p.status='active' GROUP BY p.id, p.pool_name ORDER BY avg_util DESC
    `);
    const scenarios = await pool.query(`SELECT * FROM capacity_scenarios ORDER BY created_at DESC LIMIT 5`);
    const demandBreakdown = await pool.query(`
      SELECT source_type, COUNT(*) as count, SUM(required_capacity) as total_capacity
      FROM capacity_demands WHERE status IN ('planned','confirmed','in_progress')
      GROUP BY source_type
    `);

    res.json({
      totalPools: pools.rows.length,
      pools: pools.rows,
      openConflicts: Number(conflicts.rows[0].count),
      weeklyUtilization: utilization.rows,
      recentScenarios: scenarios.rows,
      demandBreakdown: demandBreakdown.rows
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
