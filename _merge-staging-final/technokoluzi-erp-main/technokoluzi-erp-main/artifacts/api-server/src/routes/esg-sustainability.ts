// ============================================================
// ESG & Sustainability Tracker - מעקב ESG וקיימות
// מדדים סביבתיים, חברתיים וממשל תאגידי, טביעת פחמן
// ============================================================

import { Router, Request, Response } from 'express';
import pool from '@workspace/db';

const router = Router();

// ============================================================
// אתחול טבלאות
// ============================================================
async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS esg_metrics (
      id SERIAL PRIMARY KEY,
      category VARCHAR(50) NOT NULL CHECK (category IN ('environmental','social','governance')),
      metric_name VARCHAR(255) NOT NULL,
      value NUMERIC,
      unit VARCHAR(100),
      period_start DATE,
      period_end DATE,
      data_source VARCHAR(255),
      verified BOOLEAN DEFAULT FALSE,
      verified_by VARCHAR(255),
      verified_at TIMESTAMPTZ,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS esg_goals (
      id SERIAL PRIMARY KEY,
      category VARCHAR(50) NOT NULL CHECK (category IN ('environmental','social','governance')),
      goal_name VARCHAR(255) NOT NULL,
      description TEXT,
      target_value NUMERIC NOT NULL,
      current_value NUMERIC DEFAULT 0,
      unit VARCHAR(100),
      baseline_value NUMERIC,
      baseline_date DATE,
      target_date DATE NOT NULL,
      status VARCHAR(50) DEFAULT 'on_track' CHECK (status IN ('on_track','at_risk','behind','achieved','cancelled')),
      owner VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS esg_reports (
      id SERIAL PRIMARY KEY,
      report_year INTEGER NOT NULL,
      report_type VARCHAR(100) DEFAULT 'annual',
      title VARCHAR(255),
      summary TEXT,
      data JSONB DEFAULT '{}',
      status VARCHAR(50) DEFAULT 'draft',
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS carbon_footprint_entries (
      id SERIAL PRIMARY KEY,
      source VARCHAR(100) NOT NULL CHECK (source IN ('electricity','fuel','transport','materials','waste','water','refrigerants','other')),
      scope VARCHAR(10) NOT NULL CHECK (scope IN ('1','2','3')),
      co2_kg NUMERIC NOT NULL,
      period DATE NOT NULL,
      facility_id VARCHAR(255),
      facility_name VARCHAR(255),
      activity_data NUMERIC,
      activity_unit VARCHAR(100),
      emission_factor NUMERIC,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

ensureTables().catch(err => console.error('[ESG] Table init error:', err));

// ============================================================
// CRUD - מדדי ESG
// ============================================================
router.get('/esg/metrics', async (req: Request, res: Response) => {
  try {
    const category = req.query.category;
    let query = 'SELECT * FROM esg_metrics WHERE 1=1';
    const params: any[] = [];
    if (category) { params.push(category); query += ` AND category = $${params.length}`; }
    query += ' ORDER BY period_end DESC NULLS LAST, created_at DESC';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/esg/metrics', async (req: Request, res: Response) => {
  try {
    const { category, metric_name, value, unit, period_start, period_end, data_source, notes } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO esg_metrics (category, metric_name, value, unit, period_start, period_end, data_source, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [category, metric_name, value, unit, period_start, period_end, data_source, notes]
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put('/esg/metrics/:id', async (req: Request, res: Response) => {
  try {
    const { category, metric_name, value, unit, period_start, period_end, data_source, verified, verified_by, notes } = req.body;
    const verifiedAt = verified ? 'NOW()' : null;
    const { rows } = await pool.query(
      `UPDATE esg_metrics SET category=$1, metric_name=$2, value=$3, unit=$4, period_start=$5,
       period_end=$6, data_source=$7, verified=$8, verified_by=$9,
       verified_at = CASE WHEN $8 = TRUE THEN NOW() ELSE verified_at END,
       notes=$10, updated_at=NOW() WHERE id=$11 RETURNING *`,
      [category, metric_name, value, unit, period_start, period_end, data_source, verified || false, verified_by, notes, req.params.id]
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete('/esg/metrics/:id', async (req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM esg_metrics WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// CRUD - יעדי ESG
// ============================================================
router.get('/esg/goals', async (req: Request, res: Response) => {
  try {
    const category = req.query.category;
    let query = 'SELECT * FROM esg_goals WHERE 1=1';
    const params: any[] = [];
    if (category) { params.push(category); query += ` AND category = $${params.length}`; }
    query += ' ORDER BY target_date ASC';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/esg/goals', async (req: Request, res: Response) => {
  try {
    const { category, goal_name, description, target_value, current_value, unit, baseline_value, baseline_date, target_date, owner } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO esg_goals (category, goal_name, description, target_value, current_value, unit, baseline_value, baseline_date, target_date, owner)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [category, goal_name, description, target_value, current_value || 0, unit, baseline_value, baseline_date, target_date, owner]
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put('/esg/goals/:id', async (req: Request, res: Response) => {
  try {
    const { category, goal_name, description, target_value, current_value, unit, target_date, status, owner } = req.body;
    const { rows } = await pool.query(
      `UPDATE esg_goals SET category=$1, goal_name=$2, description=$3, target_value=$4,
       current_value=$5, unit=$6, target_date=$7, status=$8, owner=$9, updated_at=NOW()
       WHERE id=$10 RETURNING *`,
      [category, goal_name, description, target_value, current_value, unit, target_date, status, owner, req.params.id]
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete('/esg/goals/:id', async (req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM esg_goals WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// CRUD - טביעת פחמן
// ============================================================
router.get('/esg/carbon', async (req: Request, res: Response) => {
  try {
    const scope = req.query.scope;
    const source = req.query.source;
    let query = 'SELECT * FROM carbon_footprint_entries WHERE 1=1';
    const params: any[] = [];
    if (scope) { params.push(scope); query += ` AND scope = $${params.length}`; }
    if (source) { params.push(source); query += ` AND source = $${params.length}`; }
    query += ' ORDER BY period DESC';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/esg/carbon', async (req: Request, res: Response) => {
  try {
    const { source, scope, co2_kg, period, facility_id, facility_name, activity_data, activity_unit, emission_factor, notes } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO carbon_footprint_entries (source, scope, co2_kg, period, facility_id, facility_name, activity_data, activity_unit, emission_factor, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [source, scope, co2_kg, period, facility_id, facility_name, activity_data, activity_unit, emission_factor, notes]
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put('/esg/carbon/:id', async (req: Request, res: Response) => {
  try {
    const { source, scope, co2_kg, period, facility_id, facility_name, activity_data, activity_unit, emission_factor, notes } = req.body;
    const { rows } = await pool.query(
      `UPDATE carbon_footprint_entries SET source=$1, scope=$2, co2_kg=$3, period=$4,
       facility_id=$5, facility_name=$6, activity_data=$7, activity_unit=$8, emission_factor=$9, notes=$10
       WHERE id=$11 RETURNING *`,
      [source, scope, co2_kg, period, facility_id, facility_name, activity_data, activity_unit, emission_factor, notes, req.params.id]
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete('/esg/carbon/:id', async (req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM carbon_footprint_entries WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// דשבורד ESG
// ============================================================
router.get('/esg/dashboard', async (_req: Request, res: Response) => {
  try {
    const carbonQ = pool.query(`
      SELECT COALESCE(SUM(co2_kg),0) as total_co2,
        COALESCE(SUM(co2_kg) FILTER(WHERE scope='1'),0) as scope1,
        COALESCE(SUM(co2_kg) FILTER(WHERE scope='2'),0) as scope2,
        COALESCE(SUM(co2_kg) FILTER(WHERE scope='3'),0) as scope3,
        COUNT(DISTINCT facility_id) as facilities
      FROM carbon_footprint_entries
      WHERE period >= DATE_TRUNC('year', CURRENT_DATE)
    `);
    const goalsQ = pool.query(`
      SELECT COUNT(*) as total,
        COUNT(*) FILTER(WHERE status='on_track') as on_track,
        COUNT(*) FILTER(WHERE status='at_risk') as at_risk,
        COUNT(*) FILTER(WHERE status='behind') as behind,
        COUNT(*) FILTER(WHERE status='achieved') as achieved,
        CASE WHEN COUNT(*) > 0
          THEN ROUND(AVG(CASE WHEN target_value > 0 THEN current_value::numeric / target_value * 100 ELSE 0 END), 1)
          ELSE 0 END as avg_progress
      FROM esg_goals
    `);
    const byCategoryQ = pool.query(`
      SELECT category, COUNT(*) as metric_count,
        COUNT(*) FILTER(WHERE verified = TRUE) as verified_count
      FROM esg_metrics GROUP BY category
    `);
    const carbonBySourceQ = pool.query(`
      SELECT source, COALESCE(SUM(co2_kg),0) as total_co2
      FROM carbon_footprint_entries
      WHERE period >= DATE_TRUNC('year', CURRENT_DATE)
      GROUP BY source ORDER BY total_co2 DESC
    `);
    const carbonTrendQ = pool.query(`
      SELECT TO_CHAR(period, 'YYYY-MM') as month, COALESCE(SUM(co2_kg),0) as total_co2
      FROM carbon_footprint_entries
      WHERE period >= CURRENT_DATE - INTERVAL '12 months'
      GROUP BY TO_CHAR(period, 'YYYY-MM') ORDER BY month
    `);

    const [carbon, goals, byCategory, carbonBySource, carbonTrend] = await Promise.all([
      carbonQ, goalsQ, byCategoryQ, carbonBySourceQ, carbonTrendQ
    ]);

    // חישוב ציון קיימות
    const goalProgress = parseFloat(goals.rows[0]?.avg_progress || '0');
    const verifiedRatio = byCategory.rows.length > 0
      ? byCategory.rows.reduce((s: number, r: any) => s + parseInt(r.verified_count || 0), 0) /
        Math.max(byCategory.rows.reduce((s: number, r: any) => s + parseInt(r.metric_count || 0), 0), 1) * 100
      : 0;
    const sustainabilityScore = Math.round((goalProgress * 0.6 + verifiedRatio * 0.4) * 10) / 10;

    res.json({
      carbon: carbon.rows[0],
      goals: goals.rows[0],
      by_category: byCategory.rows,
      carbon_by_source: carbonBySource.rows,
      carbon_trend: carbonTrend.rows,
      sustainability_score: sustainabilityScore,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// דוח שנתי
// ============================================================
router.get('/esg/report/:year', async (req: Request, res: Response) => {
  try {
    const year = parseInt(req.params.year);
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    const metricsQ = pool.query(
      `SELECT * FROM esg_metrics WHERE period_start >= $1 AND period_end <= $2 ORDER BY category, metric_name`,
      [startDate, endDate]
    );
    const goalsQ = pool.query('SELECT * FROM esg_goals ORDER BY category, target_date');
    const carbonQ = pool.query(
      `SELECT source, scope, COALESCE(SUM(co2_kg),0) as total_co2, COUNT(*) as entries
       FROM carbon_footprint_entries WHERE period >= $1 AND period <= $2
       GROUP BY source, scope ORDER BY scope, source`,
      [startDate, endDate]
    );
    const carbonTotalQ = pool.query(
      `SELECT COALESCE(SUM(co2_kg),0) as total FROM carbon_footprint_entries WHERE period >= $1 AND period <= $2`,
      [startDate, endDate]
    );

    const [metrics, goals, carbon, carbonTotal] = await Promise.all([metricsQ, goalsQ, carbonQ, carbonTotalQ]);
    res.json({
      year,
      metrics: metrics.rows,
      goals: goals.rows,
      carbon_breakdown: carbon.rows,
      total_carbon_kg: parseFloat(carbonTotal.rows[0]?.total || '0'),
      total_carbon_tons: Math.round(parseFloat(carbonTotal.rows[0]?.total || '0') / 1000 * 100) / 100,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// טביעת פחמן מסכמת
// ============================================================
router.get('/esg/carbon-footprint', async (req: Request, res: Response) => {
  try {
    const year = req.query.year || new Date().getFullYear();
    const { rows } = await pool.query(`
      SELECT source, scope,
        TO_CHAR(period, 'YYYY-MM') as month,
        COALESCE(SUM(co2_kg),0) as total_co2,
        COUNT(*) as entries
      FROM carbon_footprint_entries
      WHERE EXTRACT(YEAR FROM period) = $1
      GROUP BY source, scope, TO_CHAR(period, 'YYYY-MM')
      ORDER BY month, scope, source
    `, [year]);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
