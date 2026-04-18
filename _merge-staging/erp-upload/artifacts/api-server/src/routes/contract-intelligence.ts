import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contract_analyses (
      id SERIAL PRIMARY KEY,
      contract_id INTEGER,
      analysis_status VARCHAR(20) DEFAULT 'pending' CHECK (analysis_status IN ('pending','analyzing','completed','failed')),
      risk_score REAL DEFAULT 0,
      key_terms JSONB DEFAULT '{}'::jsonb,
      anomalies JSONB DEFAULT '[]'::jsonb,
      analyzed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS contract_clauses (
      id SERIAL PRIMARY KEY,
      analysis_id INTEGER REFERENCES contract_analyses(id) ON DELETE CASCADE,
      clause_type VARCHAR(40) NOT NULL CHECK (clause_type IN (
        'payment','delivery','penalty','warranty','liability',
        'termination','ip','confidentiality','force_majeure','indemnity','insurance','arbitration'
      )),
      clause_text TEXT,
      risk_level VARCHAR(10) DEFAULT 'low' CHECK (risk_level IN ('low','medium','high','critical')),
      standard_deviation TEXT,
      recommendation TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS clause_library (
      id SERIAL PRIMARY KEY,
      clause_type VARCHAR(40) NOT NULL,
      standard_text TEXT NOT NULL,
      jurisdiction VARCHAR(100) DEFAULT 'ישראל',
      version INTEGER DEFAULT 1,
      approved BOOLEAN DEFAULT false,
      approved_by VARCHAR(200),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS contract_risks (
      id SERIAL PRIMARY KEY,
      contract_id INTEGER,
      analysis_id INTEGER REFERENCES contract_analyses(id) ON DELETE SET NULL,
      risk_category VARCHAR(50) NOT NULL,
      risk_description TEXT,
      severity VARCHAR(10) DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
      probability REAL DEFAULT 0.5,
      financial_impact NUMERIC(15,2) DEFAULT 0,
      mitigation TEXT,
      status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open','mitigated','accepted','closed')),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS contract_obligations (
      id SERIAL PRIMARY KEY,
      contract_id INTEGER NOT NULL,
      obligation_type VARCHAR(30) NOT NULL CHECK (obligation_type IN ('delivery','payment','milestone','reporting','compliance','renewal')),
      description TEXT,
      due_date DATE,
      responsible VARCHAR(200),
      status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','met','breached','waived','upcoming')),
      reminder_days INTEGER DEFAULT 7,
      reminded_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_clauses_analysis ON contract_clauses(analysis_id);
    CREATE INDEX IF NOT EXISTS idx_obligations_contract ON contract_obligations(contract_id);
    CREATE INDEX IF NOT EXISTS idx_obligations_due ON contract_obligations(due_date);
    CREATE INDEX IF NOT EXISTS idx_risks_contract ON contract_risks(contract_id);
  `);
}
ensureTables().catch(console.error);

/* ───────── POST /api/contract-intel/analyze/:contractId ───────── */
router.post("/contract-intel/analyze/:contractId", async (req, res) => {
  try {
    const contractId = parseInt(req.params.contractId);
    const { clauses, contract_text } = req.body;

    // Create analysis record
    const { rows: [analysis] } = await pool.query(`
      INSERT INTO contract_analyses (contract_id, analysis_status) VALUES ($1, 'analyzing') RETURNING *
    `, [contractId]);

    // If clauses provided, analyze them
    if (clauses && Array.isArray(clauses)) {
      let totalRisk = 0;
      const anomalies: any[] = [];

      for (const clause of clauses) {
        // Compare against library
        const lib = await pool.query(
          `SELECT * FROM clause_library WHERE clause_type = $1 AND approved = true ORDER BY version DESC LIMIT 1`,
          [clause.clause_type]
        );

        let riskLevel = 'low';
        let deviation = '';
        let recommendation = '';

        if (lib.rows.length > 0) {
          const standard = lib.rows[0].standard_text.toLowerCase();
          const actual = (clause.clause_text || '').toLowerCase();
          const similarity = actual.length > 0 && standard.length > 0
            ? actual.split(' ').filter((w: string) => standard.includes(w)).length / Math.max(actual.split(' ').length, 1)
            : 0;

          if (similarity < 0.3) { riskLevel = 'critical'; deviation = 'סטייה חמורה מהסטנדרט'; recommendation = 'נדרש סקירה משפטית מיידית'; }
          else if (similarity < 0.5) { riskLevel = 'high'; deviation = 'סטייה משמעותית'; recommendation = 'מומלץ לעדכן לנוסח סטנדרטי'; }
          else if (similarity < 0.7) { riskLevel = 'medium'; deviation = 'סטייה קלה'; recommendation = 'שקול התאמה לסטנדרט'; }
          else { deviation = 'תואם סטנדרט'; recommendation = 'תקין'; }
        } else {
          riskLevel = clause.risk_level || 'medium';
          deviation = 'אין נוסח סטנדרטי להשוואה';
          recommendation = 'מומלץ להוסיף לספריית סעיפים';
        }

        const riskScores: Record<string, number> = { low: 1, medium: 3, high: 7, critical: 10 };
        totalRisk += riskScores[riskLevel] || 3;

        await pool.query(`
          INSERT INTO contract_clauses (analysis_id, clause_type, clause_text, risk_level, standard_deviation, recommendation)
          VALUES ($1,$2,$3,$4,$5,$6)
        `, [analysis.id, clause.clause_type, clause.clause_text, riskLevel, deviation, recommendation]);

        if (riskLevel === 'high' || riskLevel === 'critical') {
          anomalies.push({ clause_type: clause.clause_type, risk_level: riskLevel, deviation });
          // Auto-create risk
          await pool.query(`
            INSERT INTO contract_risks (contract_id, analysis_id, risk_category, risk_description, severity, mitigation)
            VALUES ($1,$2,$3,$4,$5,$6)
          `, [contractId, analysis.id, clause.clause_type, deviation, riskLevel, recommendation]);
        }
      }

      const normalizedRisk = Math.min(Math.round((totalRisk / (clauses.length * 10)) * 100), 100);
      await pool.query(`
        UPDATE contract_analyses SET analysis_status='completed', risk_score=$2, anomalies=$3, analyzed_at=NOW()
        WHERE id=$1
      `, [analysis.id, normalizedRisk, JSON.stringify(anomalies)]);
    } else {
      await pool.query(`UPDATE contract_analyses SET analysis_status='completed', analyzed_at=NOW() WHERE id=$1`, [analysis.id]);
    }

    const result = await pool.query(`SELECT * FROM contract_analyses WHERE id=$1`, [analysis.id]);
    const resultClauses = await pool.query(`SELECT * FROM contract_clauses WHERE analysis_id=$1`, [analysis.id]);
    res.json({ analysis: result.rows[0], clauses: resultClauses.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/* ───────── GET clauses ───────── */
router.get("/contract-intel/clauses/:analysisId", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM contract_clauses WHERE analysis_id=$1 ORDER BY risk_level DESC`, [req.params.analysisId]
    );
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/* ───────── CRUD clause_library ───────── */
router.get("/contract-intel/library", async (_req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM clause_library ORDER BY clause_type, version DESC`);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/contract-intel/library", async (req, res) => {
  try {
    const { clause_type, standard_text, jurisdiction, approved, approved_by } = req.body;
    // Auto-increment version
    const ver = await pool.query(`SELECT COALESCE(MAX(version),0)+1 as v FROM clause_library WHERE clause_type=$1`, [clause_type]);
    const { rows } = await pool.query(`
      INSERT INTO clause_library (clause_type, standard_text, jurisdiction, version, approved, approved_by)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
    `, [clause_type, standard_text, jurisdiction || 'ישראל', ver.rows[0].v, approved || false, approved_by]);
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/contract-intel/library/:id", async (req, res) => {
  try {
    const { standard_text, jurisdiction, approved, approved_by } = req.body;
    const { rows } = await pool.query(`
      UPDATE clause_library SET standard_text=COALESCE($2,standard_text), jurisdiction=COALESCE($3,jurisdiction),
        approved=COALESCE($4,approved), approved_by=COALESCE($5,approved_by), updated_at=NOW()
      WHERE id=$1 RETURNING *
    `, [req.params.id, standard_text, jurisdiction, approved, approved_by]);
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/* ───────── CRUD obligations ───────── */
router.get("/contract-intel/obligations", async (req, res) => {
  try {
    const contractId = req.query.contractId;
    const where = contractId ? `WHERE contract_id = ${parseInt(String(contractId))}` : '';
    const { rows } = await pool.query(`SELECT * FROM contract_obligations ${where} ORDER BY due_date ASC`);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/contract-intel/obligations", async (req, res) => {
  try {
    const { contract_id, obligation_type, description, due_date, responsible, reminder_days } = req.body;
    const { rows } = await pool.query(`
      INSERT INTO contract_obligations (contract_id, obligation_type, description, due_date, responsible, reminder_days)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
    `, [contract_id, obligation_type, description, due_date, responsible, reminder_days || 7]);
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/contract-intel/obligations/:id", async (req, res) => {
  try {
    const { status, responsible, due_date } = req.body;
    const { rows } = await pool.query(`
      UPDATE contract_obligations SET status=COALESCE($2,status), responsible=COALESCE($3,responsible),
        due_date=COALESCE($4,due_date), updated_at=NOW()
      WHERE id=$1 RETURNING *
    `, [req.params.id, status, responsible, due_date]);
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/* ───────── Upcoming obligations ───────── */
router.get("/contract-intel/upcoming-obligations", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT * FROM contract_obligations
      WHERE status IN ('pending','upcoming') AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
      ORDER BY due_date ASC
    `);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/* ───────── Risks ───────── */
router.get("/contract-intel/risks", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT r.*, a.risk_score as analysis_risk_score
      FROM contract_risks r LEFT JOIN contract_analyses a ON a.id = r.analysis_id
      WHERE r.status IN ('open','mitigated')
      ORDER BY CASE r.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END
    `);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/* ───────── Dashboard ───────── */
router.get("/contract-intel/dashboard", async (_req, res) => {
  try {
    const analyses = await pool.query(`SELECT analysis_status, COUNT(*) as count, AVG(risk_score) as avg_risk FROM contract_analyses GROUP BY analysis_status`);
    const riskByType = await pool.query(`SELECT clause_type, risk_level, COUNT(*) as count FROM contract_clauses GROUP BY clause_type, risk_level`);
    const obligations = await pool.query(`
      SELECT status, COUNT(*) as count FROM contract_obligations GROUP BY status
    `);
    const upcoming = await pool.query(`
      SELECT * FROM contract_obligations WHERE status='pending' AND due_date <= CURRENT_DATE + INTERVAL '14 days' ORDER BY due_date LIMIT 10
    `);
    const highRisks = await pool.query(`
      SELECT * FROM contract_risks WHERE severity IN ('high','critical') AND status='open' ORDER BY financial_impact DESC LIMIT 10
    `);
    const libraryStats = await pool.query(`
      SELECT clause_type, COUNT(*) as versions, MAX(version) as latest FROM clause_library GROUP BY clause_type
    `);

    res.json({
      analysisStats: analyses.rows,
      riskByClauseType: riskByType.rows,
      obligationStats: obligations.rows,
      upcomingObligations: upcoming.rows,
      topRisks: highRisks.rows,
      libraryStats: libraryStats.rows
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
