import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

/* ================================================================
   Customer Experience Management (CEM)  --  TechnoKoluzi ERP
   Beyond SAP/Oracle -- holistic customer journey intelligence
   ================================================================ */

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS customer_journeys (
      id SERIAL PRIMARY KEY,
      customer_id INT NOT NULL,
      customer_name VARCHAR(300),
      journey_type VARCHAR(40) NOT NULL CHECK (journey_type IN ('onboarding','project','support','renewal','upsell','expansion','recovery')),
      current_stage VARCHAR(60) NOT NULL DEFAULT 'initiated',
      stages_completed JSONB DEFAULT '[]',
      started_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      health_score INT DEFAULT 50 CHECK (health_score BETWEEN 0 AND 100),
      assigned_csm VARCHAR(200),
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS touchpoints (
      id SERIAL PRIMARY KEY,
      journey_id INT REFERENCES customer_journeys(id) ON DELETE CASCADE,
      customer_id INT NOT NULL,
      channel VARCHAR(30) NOT NULL CHECK (channel IN ('email','phone','whatsapp','portal','meeting','site_visit','video_call','chat','social_media')),
      direction VARCHAR(10) DEFAULT 'inbound' CHECK (direction IN ('inbound','outbound')),
      sentiment VARCHAR(20) DEFAULT 'neutral' CHECK (sentiment IN ('positive','neutral','negative','very_positive','very_negative')),
      summary TEXT NOT NULL,
      duration_minutes INT,
      agent_id VARCHAR(200),
      follow_up_required BOOLEAN DEFAULT false,
      follow_up_date DATE,
      tags JSONB DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_touchpoints_customer ON touchpoints(customer_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS nps_surveys (
      id SERIAL PRIMARY KEY,
      customer_id INT NOT NULL,
      customer_name VARCHAR(300),
      score INT CHECK (score BETWEEN 0 AND 10),
      category VARCHAR(20) CHECK (category IN ('promoter','passive','detractor')),
      feedback TEXT,
      project_id INT,
      project_name VARCHAR(300),
      channel VARCHAR(30) DEFAULT 'email',
      sent_at TIMESTAMPTZ DEFAULT NOW(),
      responded_at TIMESTAMPTZ,
      follow_up_action TEXT,
      follow_up_status VARCHAR(20) DEFAULT 'pending' CHECK (follow_up_status IN ('pending','in_progress','completed','not_needed')),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS customer_health_scores (
      id SERIAL PRIMARY KEY,
      customer_id INT NOT NULL,
      customer_name VARCHAR(300),
      overall_score INT DEFAULT 50 CHECK (overall_score BETWEEN 0 AND 100),
      engagement_score INT DEFAULT 50 CHECK (engagement_score BETWEEN 0 AND 100),
      satisfaction_score INT DEFAULT 50 CHECK (satisfaction_score BETWEEN 0 AND 100),
      financial_score INT DEFAULT 50 CHECK (financial_score BETWEEN 0 AND 100),
      adoption_score INT DEFAULT 50 CHECK (adoption_score BETWEEN 0 AND 100),
      risk_level VARCHAR(20) DEFAULT 'medium' CHECK (risk_level IN ('low','medium','high','critical')),
      risk_factors JSONB DEFAULT '[]',
      recommendations JSONB DEFAULT '[]',
      calculated_at TIMESTAMPTZ DEFAULT NOW(),
      next_review DATE
    );
    CREATE INDEX IF NOT EXISTS idx_health_scores_customer ON customer_health_scores(customer_id, calculated_at DESC);

    CREATE TABLE IF NOT EXISTS customer_segments (
      id SERIAL PRIMARY KEY,
      segment_name VARCHAR(200) NOT NULL,
      description TEXT,
      criteria JSONB DEFAULT '{}',
      customer_count INT DEFAULT 0,
      avg_health_score NUMERIC,
      avg_nps NUMERIC,
      total_revenue NUMERIC DEFAULT 0,
      color VARCHAR(20) DEFAULT '#3B82F6',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}
ensureTables();

// ======================== JOURNEYS ========================

router.get("/cem/journeys", async (req, res) => {
  try {
    const customerId = req.query.customer_id;
    const query = customerId
      ? `SELECT * FROM customer_journeys WHERE customer_id=$1 ORDER BY created_at DESC`
      : `SELECT * FROM customer_journeys ORDER BY created_at DESC LIMIT 200`;
    const { rows } = customerId ? await pool.query(query, [customerId]) : await pool.query(query);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/cem/journeys", async (req, res) => {
  try {
    const d = req.body;
    const { rows } = await pool.query(
      `INSERT INTO customer_journeys (customer_id, customer_name, journey_type, current_stage, assigned_csm, notes, health_score)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [d.customer_id, d.customer_name, d.journey_type, d.current_stage || 'initiated', d.assigned_csm, d.notes, d.health_score || 50]
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/cem/journeys/:id", async (req, res) => {
  try {
    const d = req.body;
    const { rows } = await pool.query(
      `UPDATE customer_journeys SET customer_name=$1, journey_type=$2, current_stage=$3, stages_completed=$4, health_score=$5, assigned_csm=$6, notes=$7, completed_at=$8, updated_at=NOW()
       WHERE id=$9 RETURNING *`,
      [d.customer_name, d.journey_type, d.current_stage, d.stages_completed, d.health_score, d.assigned_csm, d.notes, d.completed_at, req.params.id]
    );
    res.json(rows[0] || {});
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/cem/journeys/:id", async (req, res) => {
  try {
    await pool.query(`DELETE FROM customer_journeys WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== TOUCHPOINTS ========================

router.get("/cem/touchpoints", async (req, res) => {
  try {
    const customerId = req.query.customer_id;
    const journeyId = req.query.journey_id;
    let query = `SELECT * FROM touchpoints WHERE 1=1`;
    const params: any[] = [];
    if (customerId) { params.push(customerId); query += ` AND customer_id=$${params.length}`; }
    if (journeyId) { params.push(journeyId); query += ` AND journey_id=$${params.length}`; }
    query += ` ORDER BY created_at DESC LIMIT 300`;
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/cem/touchpoints", async (req, res) => {
  try {
    const d = req.body;
    const { rows } = await pool.query(
      `INSERT INTO touchpoints (journey_id, customer_id, channel, direction, sentiment, summary, duration_minutes, agent_id, follow_up_required, follow_up_date, tags)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [d.journey_id, d.customer_id, d.channel, d.direction || 'inbound', d.sentiment || 'neutral', d.summary, d.duration_minutes, d.agent_id, d.follow_up_required || false, d.follow_up_date, d.tags || []]
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== NPS SURVEYS ========================

router.get("/cem/nps", async (req, res) => {
  try {
    const customerId = req.query.customer_id;
    const query = customerId
      ? `SELECT * FROM nps_surveys WHERE customer_id=$1 ORDER BY created_at DESC`
      : `SELECT * FROM nps_surveys ORDER BY created_at DESC LIMIT 200`;
    const { rows } = customerId ? await pool.query(query, [customerId]) : await pool.query(query);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/cem/nps/send/:customerId", async (req, res) => {
  try {
    const d = req.body;
    const { rows } = await pool.query(
      `INSERT INTO nps_surveys (customer_id, customer_name, project_id, project_name, channel, sent_at)
       VALUES ($1,$2,$3,$4,$5,NOW()) RETURNING *`,
      [req.params.customerId, d.customer_name, d.project_id, d.project_name, d.channel || 'email']
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/cem/nps/respond", async (req, res) => {
  try {
    const d = req.body;
    const category = d.score >= 9 ? 'promoter' : d.score >= 7 ? 'passive' : 'detractor';
    const { rows } = await pool.query(
      `UPDATE nps_surveys SET score=$1, category=$2, feedback=$3, responded_at=NOW() WHERE id=$4 RETURNING *`,
      [d.score, category, d.feedback, d.survey_id]
    );
    res.json(rows[0] || {});
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== HEALTH SCORES ========================

router.get("/cem/health-scores", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (customer_id) * FROM customer_health_scores ORDER BY customer_id, calculated_at DESC`
    );
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/cem/health-score/calculate/:customerId", async (req, res) => {
  try {
    const cid = Number(req.params.customerId);

    // Calculate engagement from touchpoints
    const { rows: tp } = await pool.query(
      `SELECT COUNT(*) as total, COUNT(*) FILTER(WHERE created_at >= NOW()-INTERVAL '30 days') as recent,
              COUNT(*) FILTER(WHERE sentiment='positive' OR sentiment='very_positive') as positive,
              COUNT(*) FILTER(WHERE sentiment='negative' OR sentiment='very_negative') as negative
       FROM touchpoints WHERE customer_id=$1`, [cid]
    );
    const engagement = Math.min(100, Math.round((Number(tp[0]?.recent || 0) / 5) * 100));
    const positiveRatio = Number(tp[0]?.total) > 0 ? Number(tp[0]?.positive) / Number(tp[0]?.total) : 0.5;
    const satisfaction = Math.round(positiveRatio * 100);

    // NPS based score
    const { rows: nps } = await pool.query(
      `SELECT AVG(score) as avg_nps FROM nps_surveys WHERE customer_id=$1 AND score IS NOT NULL`, [cid]
    );
    const npsScore = nps[0]?.avg_nps ? Math.round(Number(nps[0].avg_nps) * 10) : 50;

    // Financial from journeys
    const { rows: jrn } = await pool.query(
      `SELECT COUNT(*) as total, COUNT(*) FILTER(WHERE completed_at IS NOT NULL) as completed FROM customer_journeys WHERE customer_id=$1`, [cid]
    );
    const financial = Number(jrn[0]?.total) > 0 ? Math.round((Number(jrn[0]?.completed) / Number(jrn[0]?.total)) * 100) : 50;

    const overall = Math.round((engagement * 0.25 + satisfaction * 0.3 + npsScore * 0.25 + financial * 0.2));
    const risk_level = overall >= 75 ? 'low' : overall >= 50 ? 'medium' : overall >= 25 ? 'high' : 'critical';

    const riskFactors = [];
    if (engagement < 30) riskFactors.push('Low engagement in last 30 days');
    if (satisfaction < 40) riskFactors.push('High negative sentiment ratio');
    if (npsScore < 40) riskFactors.push('Low NPS score');

    const { rows } = await pool.query(
      `INSERT INTO customer_health_scores (customer_id, customer_name, overall_score, engagement_score, satisfaction_score, financial_score, adoption_score, risk_level, risk_factors, recommendations)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [cid, req.body.customer_name, overall, engagement, satisfaction, financial, npsScore, risk_level, JSON.stringify(riskFactors), JSON.stringify([])]
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== SEGMENTS ========================

router.get("/cem/segments", async (_req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM customer_segments ORDER BY customer_count DESC`);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/cem/segments", async (req, res) => {
  try {
    const d = req.body;
    const { rows } = await pool.query(
      `INSERT INTO customer_segments (segment_name, description, criteria, color) VALUES ($1,$2,$3,$4) RETURNING *`,
      [d.segment_name, d.description, d.criteria || {}, d.color || '#3B82F6']
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== DASHBOARD ========================

router.get("/cem/dashboard", async (_req, res) => {
  try {
    const [npsStats, healthDist, journeyStats, touchpointStats, atRisk] = await Promise.all([
      pool.query(`SELECT
        COUNT(*) as total_surveys, COUNT(*) FILTER(WHERE score IS NOT NULL) as responded,
        ROUND(AVG(score) FILTER(WHERE score IS NOT NULL), 1) as avg_nps,
        COUNT(*) FILTER(WHERE category='promoter') as promoters,
        COUNT(*) FILTER(WHERE category='passive') as passives,
        COUNT(*) FILTER(WHERE category='detractor') as detractors,
        CASE WHEN COUNT(*) FILTER(WHERE score IS NOT NULL) > 0
          THEN ROUND((COUNT(*) FILTER(WHERE category='promoter')::numeric - COUNT(*) FILTER(WHERE category='detractor')::numeric) / COUNT(*) FILTER(WHERE score IS NOT NULL) * 100, 1)
          ELSE 0 END as nps_score
        FROM nps_surveys`),
      pool.query(`SELECT
        COUNT(*) FILTER(WHERE risk_level='low') as healthy,
        COUNT(*) FILTER(WHERE risk_level='medium') as needs_attention,
        COUNT(*) FILTER(WHERE risk_level='high') as at_risk,
        COUNT(*) FILTER(WHERE risk_level='critical') as critical,
        ROUND(AVG(overall_score), 1) as avg_health
        FROM (SELECT DISTINCT ON (customer_id) * FROM customer_health_scores ORDER BY customer_id, calculated_at DESC) latest`),
      pool.query(`SELECT
        COUNT(*) as total_journeys,
        COUNT(*) FILTER(WHERE completed_at IS NULL) as active_journeys,
        COUNT(*) FILTER(WHERE completed_at IS NOT NULL) as completed,
        COUNT(DISTINCT customer_id) as unique_customers,
        json_object_agg(COALESCE(journey_type,'other'), type_count) as by_type
        FROM (SELECT journey_type, COUNT(*) as type_count FROM customer_journeys GROUP BY journey_type) sub
        CROSS JOIN (SELECT COUNT(*) as total_journeys, COUNT(*) FILTER(WHERE completed_at IS NULL) as active_journeys, COUNT(*) FILTER(WHERE completed_at IS NOT NULL) as completed, COUNT(DISTINCT customer_id) as unique_customers FROM customer_journeys) stats`),
      pool.query(`SELECT
        COUNT(*) as total_touchpoints,
        COUNT(*) FILTER(WHERE created_at >= NOW()-INTERVAL '7 days') as this_week,
        COUNT(*) FILTER(WHERE sentiment='positive' OR sentiment='very_positive') as positive,
        COUNT(*) FILTER(WHERE sentiment='negative' OR sentiment='very_negative') as negative,
        COUNT(*) FILTER(WHERE follow_up_required=true AND follow_up_date <= CURRENT_DATE) as overdue_followups
        FROM touchpoints`),
      pool.query(`SELECT customer_id, customer_name, overall_score, risk_level, risk_factors
        FROM (SELECT DISTINCT ON (customer_id) * FROM customer_health_scores ORDER BY customer_id, calculated_at DESC) latest
        WHERE risk_level IN ('high','critical') ORDER BY overall_score ASC LIMIT 15`)
    ]);

    res.json({
      nps: npsStats.rows[0],
      health: healthDist.rows[0],
      journeys: journeyStats.rows[0] || {},
      touchpoints: touchpointStats.rows[0],
      atRiskCustomers: atRisk.rows,
      timestamp: new Date().toISOString()
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
