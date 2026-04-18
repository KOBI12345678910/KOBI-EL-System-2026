import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS okr_objectives (
      id SERIAL PRIMARY KEY,
      title VARCHAR(500) NOT NULL,
      description TEXT,
      owner_id INTEGER,
      department VARCHAR(200),
      level VARCHAR(20) DEFAULT 'team' CHECK (level IN ('company','department','team','individual')),
      parent_objective_id INTEGER REFERENCES okr_objectives(id) ON DELETE SET NULL,
      progress REAL DEFAULT 0,
      status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','completed','cancelled','on_hold')),
      period VARCHAR(30),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS okr_key_results (
      id SERIAL PRIMARY KEY,
      objective_id INTEGER NOT NULL REFERENCES okr_objectives(id) ON DELETE CASCADE,
      title VARCHAR(500) NOT NULL,
      metric_type VARCHAR(20) DEFAULT 'number' CHECK (metric_type IN ('number','percentage','currency','boolean')),
      target_value NUMERIC(15,2) DEFAULT 0,
      current_value NUMERIC(15,2) DEFAULT 0,
      progress REAL DEFAULT 0,
      owner_id INTEGER,
      due_date DATE,
      status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','completed','at_risk','behind','cancelled')),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS performance_reviews (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL,
      reviewer_id INTEGER,
      period VARCHAR(30) NOT NULL,
      overall_rating INTEGER CHECK (overall_rating BETWEEN 1 AND 5),
      strengths TEXT,
      improvements TEXT,
      goals_summary TEXT,
      status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft','submitted','acknowledged','disputed')),
      submitted_at TIMESTAMPTZ,
      acknowledged_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS performance_goals (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL,
      review_id INTEGER REFERENCES performance_reviews(id) ON DELETE SET NULL,
      title VARCHAR(500) NOT NULL,
      description TEXT,
      target_date DATE,
      progress REAL DEFAULT 0,
      status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','completed','cancelled')),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS competency_assessments (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL,
      competency VARCHAR(200) NOT NULL,
      self_score INTEGER CHECK (self_score BETWEEN 1 AND 5),
      manager_score INTEGER CHECK (manager_score BETWEEN 1 AND 5),
      peer_avg_score REAL,
      assessment_period VARCHAR(30),
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_okr_kr_objective ON okr_key_results(objective_id);
    CREATE INDEX IF NOT EXISTS idx_okr_parent ON okr_objectives(parent_objective_id);
    CREATE INDEX IF NOT EXISTS idx_reviews_employee ON performance_reviews(employee_id);
    CREATE INDEX IF NOT EXISTS idx_competency_employee ON competency_assessments(employee_id);
  `);
}
ensureTables().catch(console.error);

/* ───────── CRUD Objectives ───────── */
router.get("/okr/objectives", async (req, res) => {
  try {
    const period = req.query.period;
    const where = period ? `WHERE period = '${String(period).replace(/'/g, "''")}'` : '';
    const { rows } = await pool.query(`SELECT * FROM okr_objectives ${where} ORDER BY level, created_at DESC`);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/okr/objectives", async (req, res) => {
  try {
    const { title, description, owner_id, department, level, parent_objective_id, period } = req.body;
    const { rows } = await pool.query(`
      INSERT INTO okr_objectives (title, description, owner_id, department, level, parent_objective_id, period)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
    `, [title, description, owner_id, department, level || 'team', parent_objective_id, period]);
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/okr/objectives/:id", async (req, res) => {
  try {
    const { title, description, status, progress, owner_id, department } = req.body;
    const { rows } = await pool.query(`
      UPDATE okr_objectives SET title=COALESCE($2,title), description=COALESCE($3,description),
        status=COALESCE($4,status), progress=COALESCE($5,progress), owner_id=COALESCE($6,owner_id),
        department=COALESCE($7,department), updated_at=NOW()
      WHERE id=$1 RETURNING *
    `, [req.params.id, title, description, status, progress, owner_id, department]);
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/* ───────── CRUD Key Results ───────── */
router.get("/okr/key-results/:objectiveId", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM okr_key_results WHERE objective_id=$1 ORDER BY created_at`, [req.params.objectiveId]
    );
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/okr/key-results", async (req, res) => {
  try {
    const { objective_id, title, metric_type, target_value, owner_id, due_date } = req.body;
    const { rows } = await pool.query(`
      INSERT INTO okr_key_results (objective_id, title, metric_type, target_value, owner_id, due_date)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
    `, [objective_id, title, metric_type || 'number', target_value || 0, owner_id, due_date]);
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/okr/key-results/:id", async (req, res) => {
  try {
    const { current_value, status, title, target_value } = req.body;
    // Auto-calculate progress
    const existing = await pool.query(`SELECT * FROM okr_key_results WHERE id=$1`, [req.params.id]);
    if (!existing.rows.length) return res.status(404).json({ error: "Not found" });

    const kr = existing.rows[0];
    const newCurrent = current_value !== undefined ? current_value : kr.current_value;
    const newTarget = target_value !== undefined ? target_value : kr.target_value;
    const progress = Number(newTarget) > 0 ? Math.min((Number(newCurrent) / Number(newTarget)) * 100, 100) : 0;

    const autoStatus = progress >= 100 ? 'completed' : progress >= 60 ? 'active' : progress >= 30 ? 'behind' : 'at_risk';

    const { rows } = await pool.query(`
      UPDATE okr_key_results SET current_value=COALESCE($2,current_value), title=COALESCE($3,title),
        target_value=COALESCE($4,target_value), progress=$5, status=COALESCE($6,$7), updated_at=NOW()
      WHERE id=$1 RETURNING *
    `, [req.params.id, current_value, title, target_value, progress, status, autoStatus]);

    // Update parent objective progress
    const krs = await pool.query(`SELECT progress FROM okr_key_results WHERE objective_id=$1`, [kr.objective_id]);
    const avgProgress = krs.rows.length > 0
      ? krs.rows.reduce((s: number, r: any) => s + Number(r.progress), 0) / krs.rows.length : 0;
    await pool.query(`UPDATE okr_objectives SET progress=$2, updated_at=NOW() WHERE id=$1`, [kr.objective_id, avgProgress]);

    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/* ───────── Cascade OKR ───────── */
router.post("/okr/cascade/:objectiveId", async (req, res) => {
  try {
    const parentId = parseInt(req.params.objectiveId);
    const parent = await pool.query(`SELECT * FROM okr_objectives WHERE id=$1`, [parentId]);
    if (!parent.rows.length) return res.status(404).json({ error: "Objective not found" });

    const { children } = req.body; // [{title, department, owner_id, key_results: [{title, target_value}]}]
    const created = [];

    for (const child of (children || [])) {
      const { rows: [obj] } = await pool.query(`
        INSERT INTO okr_objectives (title, description, owner_id, department, level, parent_objective_id, period)
        VALUES ($1,$2,$3,$4,'team',$5,$6) RETURNING *
      `, [child.title, child.description || '', child.owner_id, child.department, parentId, parent.rows[0].period]);

      const krs = [];
      for (const kr of (child.key_results || [])) {
        const { rows: [newKr] } = await pool.query(`
          INSERT INTO okr_key_results (objective_id, title, metric_type, target_value, owner_id, due_date)
          VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
        `, [obj.id, kr.title, kr.metric_type || 'number', kr.target_value || 0, kr.owner_id || child.owner_id, kr.due_date]);
        krs.push(newKr);
      }
      created.push({ objective: obj, key_results: krs });
    }

    res.json({ parent: parent.rows[0], cascaded: created });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/* ───────── OKR Tree ───────── */
router.get("/okr/tree", async (req, res) => {
  try {
    const period = req.query.period;
    const where = period ? `WHERE o.period = '${String(period).replace(/'/g, "''")}'` : '';
    const { rows: objectives } = await pool.query(`SELECT * FROM okr_objectives ${where} ORDER BY level, title`);
    const { rows: keyResults } = await pool.query(`SELECT * FROM okr_key_results ORDER BY objective_id, created_at`);

    const krMap: Record<number, any[]> = {};
    keyResults.forEach(kr => {
      if (!krMap[kr.objective_id]) krMap[kr.objective_id] = [];
      krMap[kr.objective_id].push(kr);
    });

    function buildTree(parentId: number | null): any[] {
      return objectives
        .filter(o => (parentId === null ? !o.parent_objective_id : o.parent_objective_id === parentId))
        .map(o => ({
          ...o,
          key_results: krMap[o.id] || [],
          children: buildTree(o.id)
        }));
    }

    res.json(buildTree(null));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/* ───────── CRUD Reviews ───────── */
router.get("/performance/reviews", async (req, res) => {
  try {
    const empId = req.query.employeeId;
    const where = empId ? `WHERE employee_id = ${parseInt(String(empId))}` : '';
    const { rows } = await pool.query(`SELECT * FROM performance_reviews ${where} ORDER BY created_at DESC`);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/performance/reviews", async (req, res) => {
  try {
    const { employee_id, reviewer_id, period, overall_rating, strengths, improvements, goals_summary } = req.body;
    const { rows } = await pool.query(`
      INSERT INTO performance_reviews (employee_id, reviewer_id, period, overall_rating, strengths, improvements, goals_summary)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
    `, [employee_id, reviewer_id, period, overall_rating, strengths, improvements, goals_summary]);
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/performance/reviews/:id", async (req, res) => {
  try {
    const { overall_rating, strengths, improvements, goals_summary, status } = req.body;
    const { rows } = await pool.query(`
      UPDATE performance_reviews SET overall_rating=COALESCE($2,overall_rating), strengths=COALESCE($3,strengths),
        improvements=COALESCE($4,improvements), goals_summary=COALESCE($5,goals_summary), status=COALESCE($6,status),
        submitted_at=CASE WHEN $6='submitted' THEN NOW() ELSE submitted_at END,
        acknowledged_at=CASE WHEN $6='acknowledged' THEN NOW() ELSE acknowledged_at END,
        updated_at=NOW()
      WHERE id=$1 RETURNING *
    `, [req.params.id, overall_rating, strengths, improvements, goals_summary, status]);
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/* ───────── CRUD Competency Assessments ───────── */
router.get("/performance/competencies/:employeeId", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM competency_assessments WHERE employee_id=$1 ORDER BY assessment_period DESC, competency`,
      [req.params.employeeId]
    );
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/performance/competencies", async (req, res) => {
  try {
    const { employee_id, competency, self_score, manager_score, peer_avg_score, assessment_period, notes } = req.body;
    const { rows } = await pool.query(`
      INSERT INTO competency_assessments (employee_id, competency, self_score, manager_score, peer_avg_score, assessment_period, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
    `, [employee_id, competency, self_score, manager_score, peer_avg_score, assessment_period, notes]);
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/* ───────── Progress Report ───────── */
router.get("/okr/progress-report", async (req, res) => {
  try {
    const period = req.query.period;
    const where = period ? `WHERE period = '${String(period).replace(/'/g, "''")}'` : '';
    const objectives = await pool.query(`SELECT * FROM okr_objectives ${where}`);
    const total = objectives.rows.length;
    const completed = objectives.rows.filter((o: any) => o.status === 'completed').length;
    const avgProgress = total > 0 ? objectives.rows.reduce((s: number, o: any) => s + Number(o.progress), 0) / total : 0;

    const byLevel = await pool.query(`
      SELECT level, COUNT(*) as count, AVG(progress) as avg_progress,
        COUNT(*) FILTER (WHERE status='completed') as completed
      FROM okr_objectives ${where} GROUP BY level
    `);

    const byDept = await pool.query(`
      SELECT department, COUNT(*) as count, AVG(progress) as avg_progress
      FROM okr_objectives ${where} GROUP BY department
    `);

    res.json({ total, completed, avgProgress: Math.round(avgProgress), byLevel: byLevel.rows, byDepartment: byDept.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/* ───────── Dashboard ───────── */
router.get("/performance/dashboard", async (_req, res) => {
  try {
    const okrStats = await pool.query(`
      SELECT level, status, COUNT(*) as count, AVG(progress) as avg_progress
      FROM okr_objectives GROUP BY level, status
    `);
    const reviewStats = await pool.query(`
      SELECT status, COUNT(*) as count, AVG(overall_rating) as avg_rating
      FROM performance_reviews GROUP BY status
    `);
    const topPerformers = await pool.query(`
      SELECT employee_id, AVG(overall_rating) as avg_rating, COUNT(*) as review_count
      FROM performance_reviews WHERE overall_rating IS NOT NULL
      GROUP BY employee_id ORDER BY AVG(overall_rating) DESC LIMIT 10
    `);
    const competencyOverview = await pool.query(`
      SELECT competency, AVG(manager_score) as avg_manager, AVG(self_score) as avg_self, AVG(peer_avg_score) as avg_peer
      FROM competency_assessments GROUP BY competency ORDER BY AVG(manager_score) DESC
    `);

    res.json({ okrStats: okrStats.rows, reviewStats: reviewStats.rows, topPerformers: topPerformers.rows, competencyOverview: competencyOverview.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
