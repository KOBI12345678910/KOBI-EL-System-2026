import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

/* ───────── Auto-create tables ───────── */
async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS process_flows (
      id SERIAL PRIMARY KEY,
      process_name VARCHAR(300) NOT NULL,
      start_event VARCHAR(300),
      end_event VARCHAR(300),
      avg_duration_hours NUMERIC(12,2) DEFAULT 0,
      median_duration_hours NUMERIC(12,2) DEFAULT 0,
      variant_count INTEGER DEFAULT 0,
      total_executions INTEGER DEFAULT 0,
      last_analyzed TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS process_events (
      id SERIAL PRIMARY KEY,
      flow_id INTEGER REFERENCES process_flows(id) ON DELETE CASCADE,
      case_id VARCHAR(200),
      activity VARCHAR(500) NOT NULL,
      actor VARCHAR(200),
      timestamp TIMESTAMPTZ DEFAULT NOW(),
      duration_ms INTEGER DEFAULT 0,
      resource VARCHAR(300),
      data JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS process_bottlenecks (
      id SERIAL PRIMARY KEY,
      flow_id INTEGER REFERENCES process_flows(id) ON DELETE CASCADE,
      activity VARCHAR(500) NOT NULL,
      avg_wait_time_hours NUMERIC(12,2) DEFAULT 0,
      frequency INTEGER DEFAULT 0,
      impact_score REAL DEFAULT 0,
      suggested_action TEXT,
      detected_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS process_optimizations (
      id SERIAL PRIMARY KEY,
      flow_id INTEGER REFERENCES process_flows(id) ON DELETE CASCADE,
      optimization_type VARCHAR(30) NOT NULL CHECK (optimization_type IN ('eliminate','automate','parallelize','reassign')),
      description TEXT,
      estimated_savings_hours NUMERIC(10,2) DEFAULT 0,
      status VARCHAR(20) DEFAULT 'suggested' CHECK (status IN ('suggested','approved','implemented','rejected')),
      implemented_by VARCHAR(200),
      implemented_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_process_events_flow ON process_events(flow_id);
    CREATE INDEX IF NOT EXISTS idx_process_events_case ON process_events(case_id);
    CREATE INDEX IF NOT EXISTS idx_process_bottlenecks_flow ON process_bottlenecks(flow_id);
    CREATE INDEX IF NOT EXISTS idx_process_optimizations_flow ON process_optimizations(flow_id);
  `);
}
ensureTables().catch(console.error);

/* ───────── POST /api/process-mining/analyze/:processName ───────── */
router.post("/process-mining/analyze/:processName", async (req, res) => {
  try {
    const { processName } = req.params;
    const { startEvent, endEvent } = req.body;

    // Upsert the flow
    const existing = await pool.query(
      `SELECT id FROM process_flows WHERE process_name = $1`, [processName]
    );

    let flowId: number;
    if (existing.rows.length > 0) {
      flowId = existing.rows[0].id;
      await pool.query(
        `UPDATE process_flows SET start_event = COALESCE($2, start_event), end_event = COALESCE($3, end_event), last_analyzed = NOW(), updated_at = NOW() WHERE id = $1`,
        [flowId, startEvent, endEvent]
      );
    } else {
      const ins = await pool.query(
        `INSERT INTO process_flows (process_name, start_event, end_event, last_analyzed) VALUES ($1,$2,$3,NOW()) RETURNING id`,
        [processName, startEvent || null, endEvent || null]
      );
      flowId = ins.rows[0].id;
    }

    // Compute stats from events
    const evStats = await pool.query(`
      SELECT
        COUNT(DISTINCT case_id) as total_cases,
        COUNT(DISTINCT activity) as variant_count,
        AVG(duration_ms) / 3600000.0 as avg_hours,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms) / 3600000.0 as median_hours
      FROM process_events WHERE flow_id = $1
    `, [flowId]);

    const stats = evStats.rows[0];
    await pool.query(`
      UPDATE process_flows SET
        total_executions = $2, variant_count = $3,
        avg_duration_hours = COALESCE($4, 0), median_duration_hours = COALESCE($5, 0)
      WHERE id = $1
    `, [flowId, stats.total_cases || 0, stats.variant_count || 0, stats.avg_hours || 0, stats.median_hours || 0]);

    // Auto-detect bottlenecks: activities with highest avg wait
    await pool.query(`DELETE FROM process_bottlenecks WHERE flow_id = $1`, [flowId]);
    await pool.query(`
      INSERT INTO process_bottlenecks (flow_id, activity, avg_wait_time_hours, frequency, impact_score, suggested_action)
      SELECT
        $1, activity,
        AVG(duration_ms) / 3600000.0,
        COUNT(*),
        (AVG(duration_ms) / 3600000.0) * COUNT(*),
        CASE
          WHEN AVG(duration_ms) > 86400000 THEN 'שקול אוטומציה - זמן המתנה גבוה מאוד'
          WHEN AVG(duration_ms) > 3600000 THEN 'שקול הקבלת משימות'
          ELSE 'נטר ושפר בהדרגה'
        END
      FROM process_events WHERE flow_id = $1
      GROUP BY activity
      HAVING AVG(duration_ms) > 0
      ORDER BY AVG(duration_ms) * COUNT(*) DESC
      LIMIT 10
    `, [flowId]);

    // Auto-generate optimization suggestions
    const bottlenecks = await pool.query(
      `SELECT * FROM process_bottlenecks WHERE flow_id = $1 ORDER BY impact_score DESC`, [flowId]
    );

    for (const bn of bottlenecks.rows.slice(0, 5)) {
      const optType = bn.avg_wait_time_hours > 24 ? 'automate' :
                      bn.avg_wait_time_hours > 8 ? 'parallelize' :
                      bn.frequency < 5 ? 'eliminate' : 'reassign';
      await pool.query(`
        INSERT INTO process_optimizations (flow_id, optimization_type, description, estimated_savings_hours)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT DO NOTHING
      `, [flowId, optType,
          `${bn.activity}: ${bn.suggested_action}`,
          Math.round(bn.avg_wait_time_hours * bn.frequency * 0.3 * 100) / 100
      ]);
    }

    const updated = await pool.query(`SELECT * FROM process_flows WHERE id = $1`, [flowId]);
    res.json({ flow: updated.rows[0], bottlenecks: bottlenecks.rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/* ───────── GET /api/process-mining/flows ───────── */
router.get("/process-mining/flows", async (_req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM process_flows ORDER BY last_analyzed DESC NULLS LAST`);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/* ───────── GET /api/process-mining/:flowId/bottlenecks ───────── */
router.get("/process-mining/:flowId/bottlenecks", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM process_bottlenecks WHERE flow_id = $1 ORDER BY impact_score DESC`,
      [req.params.flowId]
    );
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/* ───────── GET /api/process-mining/:flowId/variants ───────── */
router.get("/process-mining/:flowId/variants", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT case_id,
        ARRAY_AGG(activity ORDER BY timestamp) as path,
        COUNT(*) as step_count,
        MAX(timestamp) - MIN(timestamp) as total_duration,
        SUM(duration_ms) as total_ms
      FROM process_events WHERE flow_id = $1
      GROUP BY case_id
      ORDER BY SUM(duration_ms) DESC
    `, [req.params.flowId]);

    // Group by unique paths
    const variantMap: Record<string, { path: string[]; count: number; avgMs: number; cases: string[] }> = {};
    for (const r of rows) {
      const key = (r.path || []).join(" → ");
      if (!variantMap[key]) variantMap[key] = { path: r.path, count: 0, avgMs: 0, cases: [] };
      variantMap[key].count++;
      variantMap[key].avgMs += Number(r.total_ms || 0);
      variantMap[key].cases.push(r.case_id);
    }
    const variants = Object.values(variantMap).map(v => ({
      ...v, avgMs: Math.round(v.avgMs / v.count)
    })).sort((a, b) => b.count - a.count);

    res.json(variants);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/* ───────── POST /api/process-mining/events (ingest) ───────── */
router.post("/process-mining/events", async (req, res) => {
  try {
    const events = Array.isArray(req.body) ? req.body : [req.body];
    const inserted = [];
    for (const ev of events) {
      const { rows } = await pool.query(`
        INSERT INTO process_events (flow_id, case_id, activity, actor, timestamp, duration_ms, resource, data)
        VALUES ($1,$2,$3,$4,COALESCE($5,NOW()),$6,$7,$8) RETURNING *
      `, [ev.flow_id, ev.case_id, ev.activity, ev.actor || null,
          ev.timestamp || null, ev.duration_ms || 0, ev.resource || null,
          JSON.stringify(ev.data || {})]);
      inserted.push(rows[0]);
    }
    res.json({ inserted: inserted.length, events: inserted });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/* ───────── CRUD optimizations ───────── */
router.get("/process-mining/optimizations", async (req, res) => {
  try {
    const flowId = req.query.flowId;
    const where = flowId ? `WHERE o.flow_id = ${parseInt(String(flowId))}` : '';
    const { rows } = await pool.query(`
      SELECT o.*, f.process_name FROM process_optimizations o
      LEFT JOIN process_flows f ON f.id = o.flow_id
      ${where} ORDER BY o.created_at DESC
    `);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/process-mining/optimizations", async (req, res) => {
  try {
    const { flow_id, optimization_type, description, estimated_savings_hours } = req.body;
    const { rows } = await pool.query(`
      INSERT INTO process_optimizations (flow_id, optimization_type, description, estimated_savings_hours)
      VALUES ($1,$2,$3,$4) RETURNING *
    `, [flow_id, optimization_type, description, estimated_savings_hours || 0]);
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/process-mining/optimizations/:id", async (req, res) => {
  try {
    const { status, implemented_by } = req.body;
    const { rows } = await pool.query(`
      UPDATE process_optimizations SET
        status = COALESCE($2, status), implemented_by = COALESCE($3, implemented_by),
        implemented_at = CASE WHEN $2 = 'implemented' THEN NOW() ELSE implemented_at END,
        updated_at = NOW()
      WHERE id = $1 RETURNING *
    `, [req.params.id, status, implemented_by]);
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/* ───────── GET /api/process-mining/dashboard ───────── */
router.get("/process-mining/dashboard", async (_req, res) => {
  try {
    const flows = await pool.query(`SELECT * FROM process_flows ORDER BY total_executions DESC`);
    const bottlenecks = await pool.query(`SELECT * FROM process_bottlenecks ORDER BY impact_score DESC LIMIT 15`);
    const optimizations = await pool.query(`
      SELECT status, COUNT(*) as count, SUM(estimated_savings_hours) as total_savings
      FROM process_optimizations GROUP BY status
    `);
    const topActivities = await pool.query(`
      SELECT activity, COUNT(*) as executions, AVG(duration_ms)/3600000.0 as avg_hours
      FROM process_events GROUP BY activity ORDER BY COUNT(*) DESC LIMIT 20
    `);

    res.json({
      totalFlows: flows.rows.length,
      flows: flows.rows,
      topBottlenecks: bottlenecks.rows,
      optimizationStats: optimizations.rows,
      topActivities: topActivities.rows,
      potentialSavings: optimizations.rows.reduce((s: number, r: any) => s + Number(r.total_savings || 0), 0)
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
