import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

// ─── Auto-create tables ───────────────────────────────────────────────────────
async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS job_positions (
      id SERIAL PRIMARY KEY,
      title VARCHAR(200) NOT NULL,
      department VARCHAR(100),
      description TEXT,
      requirements TEXT,
      salary_range_min NUMERIC(14,2),
      salary_range_max NUMERIC(14,2),
      employment_type VARCHAR(30) DEFAULT 'full_time' CHECK (employment_type IN ('full_time','part_time','contractor')),
      location VARCHAR(200),
      status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open','on_hold','filled','cancelled')),
      hiring_manager_id INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS job_applications (
      id SERIAL PRIMARY KEY,
      position_id INTEGER REFERENCES job_positions(id),
      candidate_name VARCHAR(200) NOT NULL,
      phone VARCHAR(50),
      email VARCHAR(200),
      resume_url TEXT,
      source VARCHAR(30) DEFAULT 'website' CHECK (source IN ('website','whatsapp','referral','agency','linkedin')),
      status VARCHAR(30) DEFAULT 'new' CHECK (status IN ('new','screening','phone_interview','in_person_interview','technical_test','offer','hired','rejected')),
      current_stage INTEGER DEFAULT 1,
      rating INTEGER CHECK (rating BETWEEN 1 AND 5),
      notes TEXT,
      salary_expectation NUMERIC(14,2),
      rejection_reason TEXT,
      applied_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS interview_schedule (
      id SERIAL PRIMARY KEY,
      application_id INTEGER REFERENCES job_applications(id),
      interviewer_id INTEGER,
      interview_type VARCHAR(30) DEFAULT 'phone' CHECK (interview_type IN ('phone','video','in_person','technical')),
      scheduled_at TIMESTAMPTZ,
      duration_min INTEGER DEFAULT 60,
      location VARCHAR(200),
      status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','cancelled','no_show')),
      feedback TEXT,
      rating INTEGER CHECK (rating BETWEEN 1 AND 5),
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS onboarding_tasks (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER,
      task_name VARCHAR(300) NOT NULL,
      category VARCHAR(30) DEFAULT 'documents' CHECK (category IN ('documents','training','equipment','access','introduction')),
      due_date DATE,
      assigned_to VARCHAR(200),
      status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed')),
      completed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
}
ensureTables().catch(e => console.error("recruitment ensureTables:", e.message));

// ─── Helpers ──────────────────────────────────────────────────────────────────
const STAGE_ORDER: Record<string, number> = {
  new: 1, screening: 2, phone_interview: 3, in_person_interview: 4,
  technical_test: 5, offer: 6, hired: 7, rejected: 8
};
const STAGE_NAMES = Object.keys(STAGE_ORDER);

// ═══════════════════════════════════════════════════════════════════════════════
// JOB POSITIONS CRUD
// ═══════════════════════════════════════════════════════════════════════════════
router.get("/recruitment/positions", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT p.*,
        (SELECT COUNT(*) FROM job_applications WHERE position_id = p.id) as applications_count,
        (SELECT COUNT(*) FROM job_applications WHERE position_id = p.id AND status = 'hired') as hired_count
      FROM job_positions p ORDER BY p.created_at DESC
    `);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.get("/recruitment/positions/:id", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM job_positions WHERE id = $1", [req.params.id]);
    if (!rows[0]) return res.status(404).json({ message: "Not found" });
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.post("/recruitment/positions", async (req, res) => {
  try {
    const b = req.body;
    const { rows } = await pool.query(`
      INSERT INTO job_positions (title, department, description, requirements, salary_range_min, salary_range_max, employment_type, location, status, hiring_manager_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [b.title, b.department, b.description, b.requirements, b.salary_range_min, b.salary_range_max,
       b.employment_type || 'full_time', b.location, b.status || 'open', b.hiring_manager_id]);
    res.status(201).json(rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

router.put("/recruitment/positions/:id", async (req, res) => {
  try {
    const b = req.body;
    const { rows } = await pool.query(`
      UPDATE job_positions SET title=$1, department=$2, description=$3, requirements=$4,
        salary_range_min=$5, salary_range_max=$6, employment_type=$7, location=$8, status=$9, hiring_manager_id=$10
      WHERE id=$11 RETURNING *`,
      [b.title, b.department, b.description, b.requirements, b.salary_range_min, b.salary_range_max,
       b.employment_type, b.location, b.status, b.hiring_manager_id, req.params.id]);
    if (!rows[0]) return res.status(404).json({ message: "Not found" });
    res.json(rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

router.delete("/recruitment/positions/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM job_positions WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// JOB APPLICATIONS CRUD
// ═══════════════════════════════════════════════════════════════════════════════
router.get("/recruitment/applications", async (req, res) => {
  try {
    const posId = req.query.position_id;
    let q = `
      SELECT a.*, p.title as position_title, p.department
      FROM job_applications a
      LEFT JOIN job_positions p ON a.position_id = p.id
    `;
    const params: any[] = [];
    if (posId) { q += " WHERE a.position_id = $1"; params.push(posId); }
    q += " ORDER BY a.applied_at DESC";
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.get("/recruitment/applications/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT a.*, p.title as position_title, p.department
      FROM job_applications a
      LEFT JOIN job_positions p ON a.position_id = p.id
      WHERE a.id = $1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ message: "Not found" });
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.post("/recruitment/applications", async (req, res) => {
  try {
    const b = req.body;
    const { rows } = await pool.query(`
      INSERT INTO job_applications (position_id, candidate_name, phone, email, resume_url, source, status, current_stage, rating, notes, salary_expectation)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [b.position_id, b.candidate_name, b.phone, b.email, b.resume_url,
       b.source || 'website', b.status || 'new', b.current_stage || 1, b.rating, b.notes, b.salary_expectation]);
    res.status(201).json(rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

router.put("/recruitment/applications/:id", async (req, res) => {
  try {
    const b = req.body;
    const { rows } = await pool.query(`
      UPDATE job_applications SET position_id=$1, candidate_name=$2, phone=$3, email=$4,
        resume_url=$5, source=$6, status=$7, current_stage=$8, rating=$9, notes=$10,
        salary_expectation=$11, rejection_reason=$12, updated_at=NOW()
      WHERE id=$13 RETURNING *`,
      [b.position_id, b.candidate_name, b.phone, b.email, b.resume_url,
       b.source, b.status, b.current_stage, b.rating, b.notes,
       b.salary_expectation, b.rejection_reason, req.params.id]);
    if (!rows[0]) return res.status(404).json({ message: "Not found" });
    res.json(rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

router.delete("/recruitment/applications/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM job_applications WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// Advance stage
router.post("/recruitment/applications/:id/advance-stage", async (req, res) => {
  try {
    const { rows: [app] } = await pool.query("SELECT * FROM job_applications WHERE id = $1", [req.params.id]);
    if (!app) return res.status(404).json({ message: "Not found" });

    const targetStatus = req.body.target_status;
    if (!targetStatus || !STAGE_NAMES.includes(targetStatus)) {
      return res.status(400).json({ message: "Invalid target_status" });
    }
    const newStage = STAGE_ORDER[targetStatus];
    const { rows } = await pool.query(`
      UPDATE job_applications SET status=$1, current_stage=$2, updated_at=NOW()
      WHERE id=$3 RETURNING *`, [targetStatus, newStage, req.params.id]);
    res.json(rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

// Pipeline (kanban data)
router.get("/recruitment/pipeline", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT a.*, p.title as position_title, p.department
      FROM job_applications a
      LEFT JOIN job_positions p ON a.position_id = p.id
      WHERE a.status != 'rejected' AND a.status != 'hired'
      ORDER BY a.current_stage, a.applied_at DESC
    `);
    const pipeline: Record<string, any[]> = {};
    for (const stage of STAGE_NAMES) pipeline[stage] = [];
    for (const row of rows) pipeline[row.status]?.push(row);
    res.json(pipeline);
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// Dashboard
router.get("/recruitment/dashboard", async (_req, res) => {
  try {
    const [posRes, appRes, hiredRes, interviewRes, avgTimeRes] = await Promise.all([
      pool.query("SELECT COUNT(*) as cnt, status FROM job_positions GROUP BY status"),
      pool.query("SELECT COUNT(*) as cnt, status FROM job_applications GROUP BY status"),
      pool.query("SELECT COUNT(*) as cnt FROM job_applications WHERE status = 'hired' AND applied_at > NOW() - INTERVAL '30 days'"),
      pool.query("SELECT COUNT(*) as cnt FROM interview_schedule WHERE scheduled_at > NOW() AND status = 'scheduled'"),
      pool.query("SELECT AVG(EXTRACT(EPOCH FROM (updated_at - applied_at))/86400)::NUMERIC(10,1) as avg_days FROM job_applications WHERE status = 'hired'"),
    ]);

    const openPositions = posRes.rows.find((r: any) => r.status === 'open')?.cnt || 0;
    const totalApps = appRes.rows.reduce((s: number, r: any) => s + parseInt(r.cnt), 0);
    const byStatus: Record<string, number> = {};
    for (const r of appRes.rows) byStatus[r.status] = parseInt(r.cnt);

    const sourceRes = await pool.query("SELECT source, COUNT(*) as cnt FROM job_applications GROUP BY source ORDER BY cnt DESC");

    res.json({
      open_positions: parseInt(openPositions),
      total_applications: totalApps,
      hired_this_month: parseInt(hiredRes.rows[0]?.cnt || "0"),
      upcoming_interviews: parseInt(interviewRes.rows[0]?.cnt || "0"),
      avg_time_to_hire_days: parseFloat(avgTimeRes.rows[0]?.avg_days || "0"),
      applications_by_status: byStatus,
      applications_by_source: sourceRes.rows.reduce((o: any, r: any) => { o[r.source] = parseInt(r.cnt); return o; }, {}),
    });
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// INTERVIEW SCHEDULE CRUD
// ═══════════════════════════════════════════════════════════════════════════════
router.get("/recruitment/interviews", async (req, res) => {
  try {
    const appId = req.query.application_id;
    let q = `
      SELECT i.*, a.candidate_name, a.email as candidate_email, p.title as position_title
      FROM interview_schedule i
      LEFT JOIN job_applications a ON i.application_id = a.id
      LEFT JOIN job_positions p ON a.position_id = p.id
    `;
    const params: any[] = [];
    if (appId) { q += " WHERE i.application_id = $1"; params.push(appId); }
    q += " ORDER BY i.scheduled_at DESC";
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.post("/recruitment/interviews", async (req, res) => {
  try {
    const b = req.body;
    const { rows } = await pool.query(`
      INSERT INTO interview_schedule (application_id, interviewer_id, interview_type, scheduled_at, duration_min, location, status, feedback, rating)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [b.application_id, b.interviewer_id, b.interview_type || 'phone', b.scheduled_at,
       b.duration_min || 60, b.location, b.status || 'scheduled', b.feedback, b.rating]);
    res.status(201).json(rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

router.put("/recruitment/interviews/:id", async (req, res) => {
  try {
    const b = req.body;
    const { rows } = await pool.query(`
      UPDATE interview_schedule SET application_id=$1, interviewer_id=$2, interview_type=$3,
        scheduled_at=$4, duration_min=$5, location=$6, status=$7, feedback=$8, rating=$9
      WHERE id=$10 RETURNING *`,
      [b.application_id, b.interviewer_id, b.interview_type, b.scheduled_at,
       b.duration_min, b.location, b.status, b.feedback, b.rating, req.params.id]);
    if (!rows[0]) return res.status(404).json({ message: "Not found" });
    res.json(rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

router.delete("/recruitment/interviews/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM interview_schedule WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ONBOARDING TASKS CRUD
// ═══════════════════════════════════════════════════════════════════════════════
router.get("/recruitment/onboarding", async (req, res) => {
  try {
    const empId = req.query.employee_id;
    let q = "SELECT * FROM onboarding_tasks";
    const params: any[] = [];
    if (empId) { q += " WHERE employee_id = $1"; params.push(empId); }
    q += " ORDER BY due_date ASC NULLS LAST";
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.post("/recruitment/onboarding", async (req, res) => {
  try {
    const b = req.body;
    const { rows } = await pool.query(`
      INSERT INTO onboarding_tasks (employee_id, task_name, category, due_date, assigned_to, status)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [b.employee_id, b.task_name, b.category || 'documents', b.due_date, b.assigned_to, b.status || 'pending']);
    res.status(201).json(rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

router.put("/recruitment/onboarding/:id", async (req, res) => {
  try {
    const b = req.body;
    const completedAt = b.status === 'completed' ? 'NOW()' : 'NULL';
    const { rows } = await pool.query(`
      UPDATE onboarding_tasks SET employee_id=$1, task_name=$2, category=$3,
        due_date=$4, assigned_to=$5, status=$6, completed_at=${completedAt === 'NOW()' ? 'NOW()' : 'completed_at'}
      WHERE id=$7 RETURNING *`,
      [b.employee_id, b.task_name, b.category, b.due_date, b.assigned_to, b.status, req.params.id]);
    if (!rows[0]) return res.status(404).json({ message: "Not found" });
    res.json(rows[0]);
  } catch (e: any) { res.status(400).json({ message: e.message }); }
});

router.delete("/recruitment/onboarding/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM onboarding_tasks WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

export default router;
