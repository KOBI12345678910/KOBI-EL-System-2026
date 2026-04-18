import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

/* ================================================================
   Advanced Risk Management Center  --  TechnoKoluzi ERP
   Beyond SAP/Oracle -- enterprise-grade risk quantification engine
   ================================================================ */

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS risk_categories (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      code VARCHAR(40) UNIQUE NOT NULL,
      description TEXT,
      color VARCHAR(20) DEFAULT '#EF4444',
      parent_id INT,
      sort_order INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    INSERT INTO risk_categories (name, code, description, color, sort_order)
    VALUES
      ('פיננסי', 'financial', 'סיכונים פיננסיים', '#EF4444', 1),
      ('תפעולי', 'operational', 'סיכונים תפעוליים', '#F97316', 2),
      ('שרשרת אספקה', 'supply_chain', 'סיכוני שרשרת אספקה', '#EAB308', 3),
      ('איכות', 'quality', 'סיכוני איכות', '#8B5CF6', 4),
      ('ציות', 'compliance', 'סיכוני ציות ורגולציה', '#3B82F6', 5),
      ('סייבר', 'cyber', 'סיכוני סייבר ואבטחת מידע', '#EC4899', 6),
      ('מוניטין', 'reputational', 'סיכונים למוניטין', '#6366F1', 7),
      ('אסטרטגי', 'strategic', 'סיכונים אסטרטגיים', '#14B8A6', 8)
    ON CONFLICT (code) DO NOTHING;

    CREATE TABLE IF NOT EXISTS risk_register (
      id SERIAL PRIMARY KEY,
      risk_code VARCHAR(60) UNIQUE,
      title VARCHAR(500) NOT NULL,
      description TEXT,
      category VARCHAR(40) NOT NULL CHECK (category IN ('financial','operational','supply_chain','quality','compliance','cyber','reputational','strategic')),
      probability INT NOT NULL CHECK (probability BETWEEN 1 AND 5),
      impact INT NOT NULL CHECK (impact BETWEEN 1 AND 5),
      risk_score INT GENERATED ALWAYS AS (probability * impact) STORED,
      velocity VARCHAR(20) DEFAULT 'medium' CHECK (velocity IN ('immediate','fast','medium','slow')),
      owner VARCHAR(200),
      department VARCHAR(200),
      status VARCHAR(30) DEFAULT 'identified' CHECK (status IN ('identified','assessed','mitigating','accepted','closed','escalated')),
      mitigation_plan TEXT,
      residual_probability INT CHECK (residual_probability BETWEEN 1 AND 5),
      residual_impact INT CHECK (residual_impact BETWEEN 1 AND 5),
      residual_score INT,
      response_strategy VARCHAR(30) DEFAULT 'mitigate' CHECK (response_strategy IN ('avoid','mitigate','transfer','accept','share')),
      target_date DATE,
      review_date DATE,
      linked_project_id INT,
      linked_project_name VARCHAR(300),
      tags JSONB DEFAULT '[]',
      attachments JSONB DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_risk_register_category ON risk_register(category);
    CREATE INDEX IF NOT EXISTS idx_risk_register_score ON risk_register(risk_score DESC);

    CREATE TABLE IF NOT EXISTS risk_assessments (
      id SERIAL PRIMARY KEY,
      risk_id INT NOT NULL REFERENCES risk_register(id) ON DELETE CASCADE,
      assessed_by VARCHAR(200) NOT NULL,
      probability INT NOT NULL CHECK (probability BETWEEN 1 AND 5),
      impact INT NOT NULL CHECK (impact BETWEEN 1 AND 5),
      score INT GENERATED ALWAYS AS (probability * impact) STORED,
      notes TEXT,
      evidence JSONB DEFAULT '[]',
      assessment_date TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS risk_mitigations (
      id SERIAL PRIMARY KEY,
      risk_id INT NOT NULL REFERENCES risk_register(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      responsible VARCHAR(200),
      due_date DATE,
      completed_date DATE,
      cost NUMERIC DEFAULT 0,
      status VARCHAR(30) DEFAULT 'planned' CHECK (status IN ('planned','in_progress','completed','overdue','cancelled')),
      effectiveness VARCHAR(20) CHECK (effectiveness IN ('effective','partially','ineffective')),
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS risk_incidents (
      id SERIAL PRIMARY KEY,
      risk_id INT REFERENCES risk_register(id) ON DELETE SET NULL,
      incident_code VARCHAR(60),
      incident_date TIMESTAMPTZ DEFAULT NOW(),
      title VARCHAR(500) NOT NULL,
      description TEXT,
      severity VARCHAR(20) NOT NULL CHECK (severity IN ('minor','moderate','major','critical','catastrophic')),
      actual_impact TEXT,
      root_cause TEXT,
      corrective_actions TEXT,
      lessons_learned TEXT,
      financial_impact NUMERIC DEFAULT 0,
      recovery_time_hours NUMERIC,
      reported_by VARCHAR(200),
      status VARCHAR(30) DEFAULT 'open' CHECK (status IN ('open','investigating','resolved','closed')),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}
ensureTables();

let riskCounter = 0;
async function nextRiskCode() {
  riskCounter++;
  return `RSK-${new Date().getFullYear()}-${String(riskCounter).padStart(4, '0')}`;
}

// ======================== RISK REGISTER ========================

router.get("/risk/register", async (req, res) => {
  try {
    const category = req.query.category;
    const status = req.query.status;
    let query = `SELECT * FROM risk_register WHERE 1=1`;
    const params: any[] = [];
    if (category) { params.push(category); query += ` AND category=$${params.length}`; }
    if (status) { params.push(status); query += ` AND status=$${params.length}`; }
    query += ` ORDER BY risk_score DESC, created_at DESC`;
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/risk/register/:id", async (req, res) => {
  try {
    const { rows: risk } = await pool.query(`SELECT * FROM risk_register WHERE id=$1`, [req.params.id]);
    if (!risk.length) return res.status(404).json({ error: "Risk not found" });
    const { rows: assessments } = await pool.query(`SELECT * FROM risk_assessments WHERE risk_id=$1 ORDER BY assessment_date DESC`, [req.params.id]);
    const { rows: mitigations } = await pool.query(`SELECT * FROM risk_mitigations WHERE risk_id=$1 ORDER BY due_date`, [req.params.id]);
    const { rows: incidents } = await pool.query(`SELECT * FROM risk_incidents WHERE risk_id=$1 ORDER BY incident_date DESC`, [req.params.id]);
    res.json({ ...risk[0], assessments, mitigations, incidents });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/risk/register", async (req, res) => {
  try {
    const d = req.body;
    const code = d.risk_code || await nextRiskCode();
    const residualScore = (d.residual_probability && d.residual_impact) ? d.residual_probability * d.residual_impact : null;
    const { rows } = await pool.query(
      `INSERT INTO risk_register (risk_code, title, description, category, probability, impact, velocity, owner, department, status, mitigation_plan, residual_probability, residual_impact, residual_score, response_strategy, target_date, review_date, linked_project_id, linked_project_name, tags)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
      [code, d.title, d.description, d.category, d.probability, d.impact, d.velocity || 'medium', d.owner, d.department, d.status || 'identified', d.mitigation_plan, d.residual_probability, d.residual_impact, residualScore, d.response_strategy || 'mitigate', d.target_date, d.review_date, d.linked_project_id, d.linked_project_name, d.tags || []]
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/risk/register/:id", async (req, res) => {
  try {
    const d = req.body;
    const residualScore = (d.residual_probability && d.residual_impact) ? d.residual_probability * d.residual_impact : null;
    const { rows } = await pool.query(
      `UPDATE risk_register SET title=$1, description=$2, category=$3, probability=$4, impact=$5, velocity=$6, owner=$7, department=$8, status=$9, mitigation_plan=$10, residual_probability=$11, residual_impact=$12, residual_score=$13, response_strategy=$14, target_date=$15, review_date=$16, linked_project_id=$17, linked_project_name=$18, tags=$19, updated_at=NOW()
       WHERE id=$20 RETURNING *`,
      [d.title, d.description, d.category, d.probability, d.impact, d.velocity, d.owner, d.department, d.status, d.mitigation_plan, d.residual_probability, d.residual_impact, residualScore, d.response_strategy, d.target_date, d.review_date, d.linked_project_id, d.linked_project_name, d.tags, req.params.id]
    );
    res.json(rows[0] || {});
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/risk/register/:id", async (req, res) => {
  try {
    await pool.query(`DELETE FROM risk_register WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== ASSESSMENTS ========================

router.post("/risk/:id/assess", async (req, res) => {
  try {
    const d = req.body;
    const { rows } = await pool.query(
      `INSERT INTO risk_assessments (risk_id, assessed_by, probability, impact, notes, evidence) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.id, d.assessed_by, d.probability, d.impact, d.notes, d.evidence || []]
    );
    // Update risk register with latest assessment
    await pool.query(
      `UPDATE risk_register SET probability=$1, impact=$2, updated_at=NOW() WHERE id=$3`,
      [d.probability, d.impact, req.params.id]
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/risk/:id/assessments", async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM risk_assessments WHERE risk_id=$1 ORDER BY assessment_date DESC`, [req.params.id]);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== MITIGATIONS ========================

router.get("/risk/mitigations", async (req, res) => {
  try {
    const status = req.query.status;
    let query = `SELECT m.*, r.title as risk_title, r.risk_code, r.category FROM risk_mitigations m LEFT JOIN risk_register r ON r.id=m.risk_id WHERE 1=1`;
    const params: any[] = [];
    if (status) { params.push(status); query += ` AND m.status=$${params.length}`; }
    query += ` ORDER BY m.due_date ASC`;
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/risk/:id/mitigations", async (req, res) => {
  try {
    const d = req.body;
    const { rows } = await pool.query(
      `INSERT INTO risk_mitigations (risk_id, action, responsible, due_date, cost, status, notes) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.params.id, d.action, d.responsible, d.due_date, d.cost || 0, d.status || 'planned', d.notes]
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/risk/mitigations/:id", async (req, res) => {
  try {
    const d = req.body;
    const { rows } = await pool.query(
      `UPDATE risk_mitigations SET action=$1, responsible=$2, due_date=$3, completed_date=$4, cost=$5, status=$6, effectiveness=$7, notes=$8, updated_at=NOW()
       WHERE id=$9 RETURNING *`,
      [d.action, d.responsible, d.due_date, d.completed_date, d.cost, d.status, d.effectiveness, d.notes, req.params.id]
    );
    res.json(rows[0] || {});
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== INCIDENTS ========================

router.get("/risk/incidents", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT i.*, r.title as risk_title, r.risk_code, r.category
       FROM risk_incidents i LEFT JOIN risk_register r ON r.id=i.risk_id
       ORDER BY i.incident_date DESC LIMIT 100`
    );
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/risk/incidents", async (req, res) => {
  try {
    const d = req.body;
    const code = `INC-${Date.now().toString().slice(-8)}`;
    const { rows } = await pool.query(
      `INSERT INTO risk_incidents (risk_id, incident_code, title, description, severity, actual_impact, root_cause, corrective_actions, lessons_learned, financial_impact, recovery_time_hours, reported_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [d.risk_id, code, d.title, d.description, d.severity, d.actual_impact, d.root_cause, d.corrective_actions, d.lessons_learned, d.financial_impact || 0, d.recovery_time_hours, d.reported_by]
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/risk/incidents/:id", async (req, res) => {
  try {
    const d = req.body;
    const { rows } = await pool.query(
      `UPDATE risk_incidents SET title=$1, description=$2, severity=$3, actual_impact=$4, root_cause=$5, corrective_actions=$6, lessons_learned=$7, financial_impact=$8, recovery_time_hours=$9, status=$10, updated_at=NOW()
       WHERE id=$11 RETURNING *`,
      [d.title, d.description, d.severity, d.actual_impact, d.root_cause, d.corrective_actions, d.lessons_learned, d.financial_impact, d.recovery_time_hours, d.status, req.params.id]
    );
    res.json(rows[0] || {});
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== HEATMAP ========================

router.get("/risk/heatmap", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT probability, impact, COUNT(*) as count, array_agg(json_build_object('id',id,'title',title,'category',category,'risk_code',risk_code,'status',status)) as risks
      FROM risk_register WHERE status NOT IN ('closed')
      GROUP BY probability, impact ORDER BY probability, impact
    `);

    // Build 5x5 matrix
    const matrix: any[][] = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => ({ count: 0, risks: [] })));
    for (const r of rows) {
      matrix[r.probability - 1][r.impact - 1] = { count: Number(r.count), risks: r.risks };
    }
    res.json({ matrix, raw: rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== TOP RISKS ========================

router.get("/risk/top-risks", async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 10;
    const { rows } = await pool.query(
      `SELECT r.*, (SELECT COUNT(*) FROM risk_mitigations m WHERE m.risk_id=r.id AND m.status NOT IN ('completed','cancelled')) as open_mitigations,
              (SELECT COUNT(*) FROM risk_incidents i WHERE i.risk_id=r.id) as incident_count
       FROM risk_register r WHERE r.status NOT IN ('closed','accepted')
       ORDER BY r.risk_score DESC, r.created_at ASC LIMIT $1`, [limit]
    );
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== CATEGORIES ========================

router.get("/risk/categories", async (_req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM risk_categories ORDER BY sort_order`);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== DASHBOARD ========================

router.get("/risk/dashboard", async (_req, res) => {
  try {
    const [stats, byCategory, byStatus, mitigationStats, incidentStats] = await Promise.all([
      pool.query(`SELECT
        COUNT(*) as total_risks,
        COUNT(*) FILTER(WHERE risk_score >= 15) as critical_risks,
        COUNT(*) FILTER(WHERE risk_score >= 10 AND risk_score < 15) as high_risks,
        COUNT(*) FILTER(WHERE risk_score >= 5 AND risk_score < 10) as medium_risks,
        COUNT(*) FILTER(WHERE risk_score < 5) as low_risks,
        COUNT(*) FILTER(WHERE status='identified') as unassessed,
        COUNT(*) FILTER(WHERE status='escalated') as escalated,
        COUNT(*) FILTER(WHERE review_date <= CURRENT_DATE AND status NOT IN ('closed')) as overdue_reviews,
        ROUND(AVG(risk_score),1) as avg_risk_score
        FROM risk_register WHERE status NOT IN ('closed')`),
      pool.query(`SELECT category, COUNT(*) as count, ROUND(AVG(risk_score),1) as avg_score, MAX(risk_score) as max_score FROM risk_register WHERE status NOT IN ('closed') GROUP BY category ORDER BY avg_score DESC`),
      pool.query(`SELECT status, COUNT(*) as count FROM risk_register GROUP BY status`),
      pool.query(`SELECT
        COUNT(*) as total_mitigations,
        COUNT(*) FILTER(WHERE status='completed') as completed,
        COUNT(*) FILTER(WHERE status='in_progress') as in_progress,
        COUNT(*) FILTER(WHERE status='overdue' OR (due_date < CURRENT_DATE AND status NOT IN ('completed','cancelled'))) as overdue,
        COALESCE(SUM(cost),0) as total_cost
        FROM risk_mitigations`),
      pool.query(`SELECT
        COUNT(*) as total_incidents,
        COUNT(*) FILTER(WHERE status='open' OR status='investigating') as active,
        COUNT(*) FILTER(WHERE severity IN ('critical','catastrophic')) as severe,
        COALESCE(SUM(financial_impact),0) as total_financial_impact,
        COUNT(*) FILTER(WHERE incident_date >= NOW()-INTERVAL '30 days') as last_30_days
        FROM risk_incidents`)
    ]);

    res.json({
      stats: stats.rows[0],
      byCategory: byCategory.rows,
      byStatus: byStatus.rows,
      mitigations: mitigationStats.rows[0],
      incidents: incidentStats.rows[0],
      timestamp: new Date().toISOString()
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
