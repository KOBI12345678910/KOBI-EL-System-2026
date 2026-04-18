import { Router, Request, Response, NextFunction } from "express";
import { pool } from "@workspace/db";

interface AuthRequest extends Request {
  user?: { id: number; username: string; role?: string };
}

const router = Router();

// ── Auto-create tables ──
async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS supply_chain_projects (
      id SERIAL PRIMARY KEY,
      project_number VARCHAR(50) UNIQUE NOT NULL,
      customer_id INT,
      customer_name VARCHAR(255),
      customer_phone VARCHAR(50),
      customer_address TEXT,
      sales_agent_id INT,
      agent_name VARCHAR(255),
      deal_amount NUMERIC(14,2) DEFAULT 0,
      deal_amount_vat NUMERIC(14,2) DEFAULT 0,
      product_type VARCHAR(100),
      current_step INT DEFAULT 1,
      total_steps INT DEFAULT 18,
      status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','paused','completed','cancelled')),
      invoice_id INT,
      payment_status VARCHAR(20) DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','partial','full')),
      paid_amount NUMERIC(14,2) DEFAULT 0,
      measurement_date TIMESTAMPTZ,
      measurement_engineer_id INT,
      measurement_approved BOOLEAN DEFAULT FALSE,
      engineering_approved BOOLEAN DEFAULT FALSE,
      production_type VARCHAR(20) CHECK (production_type IN ('internal','outsource')),
      manufacturer_id INT,
      manufacturer_name VARCHAR(255),
      production_status VARCHAR(20) DEFAULT 'pending' CHECK (production_status IN ('pending','started','middle','end','completed')),
      paint_type VARCHAR(20) CHECK (paint_type IN ('oven','spray')),
      paint_status VARCHAR(20) DEFAULT 'pending',
      installation_date TIMESTAMPTZ,
      installer_id INT,
      installer_name VARCHAR(255),
      installation_status VARCHAR(20) DEFAULT 'pending',
      customer_feedback TEXT,
      customer_rating INT CHECK (customer_rating BETWEEN 1 AND 5),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS supply_chain_steps (
      id SERIAL PRIMARY KEY,
      project_id INT NOT NULL REFERENCES supply_chain_projects(id) ON DELETE CASCADE,
      step_number INT NOT NULL,
      step_name VARCHAR(255) NOT NULL,
      step_status VARCHAR(20) DEFAULT 'pending' CHECK (step_status IN ('pending','in_progress','completed','blocked')),
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      assigned_to INT,
      notes TEXT,
      requires_approval BOOLEAN DEFAULT FALSE,
      approved_by INT,
      approved_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS supply_chain_reminders (
      id SERIAL PRIMARY KEY,
      project_id INT NOT NULL REFERENCES supply_chain_projects(id) ON DELETE CASCADE,
      step_number INT,
      recipient_type VARCHAR(20) CHECK (recipient_type IN ('agent','engineer','installer','manager','customer')),
      recipient_id INT,
      message TEXT NOT NULL,
      frequency_hours INT DEFAULT 24,
      last_sent TIMESTAMPTZ,
      status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','completed','cancelled')),
      send_count INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS supply_chain_approvals (
      id SERIAL PRIMARY KEY,
      project_id INT NOT NULL REFERENCES supply_chain_projects(id) ON DELETE CASCADE,
      step_number INT,
      approval_type VARCHAR(30) CHECK (approval_type IN ('measurement','engineering','production','paint','installation','payment')),
      requested_by INT,
      approved_by INT,
      status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_sc_projects_status ON supply_chain_projects(status);
    CREATE INDEX IF NOT EXISTS idx_sc_steps_project ON supply_chain_steps(project_id);
    CREATE INDEX IF NOT EXISTS idx_sc_reminders_project ON supply_chain_reminders(project_id);
    CREATE INDEX IF NOT EXISTS idx_sc_approvals_project ON supply_chain_approvals(project_id);
  `);
}

ensureTables().catch(console.error);

const STEP_NAMES: Record<number, string> = {
  1: "סגירת עסקה והפקת חשבונית",
  2: "קביעת מדידה עם הלקוח",
  3: "ביצוע מדידה על ידי מהנדס",
  4: "השוואת מדידות (סוכן מול מהנדס)",
  5: "אישור מדידה סופי",
  6: "הכנת שרטוט הנדסי",
  7: "אישור שרטוט הנדסי",
  8: "בחירת יצרן/קבלן משנה",
  9: "התחלת ייצור",
  10: "מעקב ייצור - אמצע",
  11: "מעקב ייצור - סיום",
  12: "בדיקת איכות לפני צביעה",
  13: "צביעה (תנור/ריסוס)",
  14: "בדיקת איכות אחרי צביעה",
  15: "תיאום התקנה עם הלקוח",
  16: "ביצוע התקנה",
  17: "אישור לקוח על התקנה",
  18: "משוב לקוח וסגירת פרויקט",
};

function genProjectNumber(): string {
  const d = new Date();
  const y = d.getFullYear().toString().slice(2);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const r = Math.floor(1000 + Math.random() * 9000);
  return `SC-${y}${m}-${r}`;
}

// ── POST /api/supply-chain/projects ──
router.post("/supply-chain/projects", async (req: Request, res: Response) => {
  try {
    const b = req.body;
    const projectNumber = genProjectNumber();
    const vatRate = 1.18;
    const dealVat = b.deal_amount ? Number(b.deal_amount) * vatRate : 0;

    const r = await pool.query(
      `INSERT INTO supply_chain_projects
       (project_number, customer_id, customer_name, customer_phone, customer_address,
        sales_agent_id, agent_name, deal_amount, deal_amount_vat, product_type,
        invoice_id, production_type, manufacturer_id, manufacturer_name, paint_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [
        projectNumber, b.customer_id, b.customer_name, b.customer_phone, b.customer_address,
        b.sales_agent_id, b.agent_name, b.deal_amount || 0, dealVat, b.product_type,
        b.invoice_id, b.production_type, b.manufacturer_id, b.manufacturer_name, b.paint_type,
      ]
    );

    const project = r.rows[0];

    // Create all 18 steps
    for (let i = 1; i <= 18; i++) {
      const needsApproval = [4, 5, 7, 12, 14, 17].includes(i);
      await pool.query(
        `INSERT INTO supply_chain_steps (project_id, step_number, step_name, requires_approval)
         VALUES ($1, $2, $3, $4)`,
        [project.id, i, STEP_NAMES[i], needsApproval]
      );
    }

    // Mark step 1 as in_progress
    await pool.query(
      `UPDATE supply_chain_steps SET step_status = 'in_progress', started_at = NOW()
       WHERE project_id = $1 AND step_number = 1`,
      [project.id]
    );

    res.json({ success: true, project });
  } catch (e: any) {
    console.error("supply-chain create error:", e);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/supply-chain/projects ──
router.get("/supply-chain/projects", async (req: Request, res: Response) => {
  try {
    const { status, step, search, limit = "50", offset = "0" } = req.query;
    let where = "WHERE 1=1";
    const params: any[] = [];
    let idx = 0;

    if (status) { idx++; where += ` AND p.status = $${idx}`; params.push(status); }
    if (step) { idx++; where += ` AND p.current_step = $${idx}`; params.push(Number(step)); }
    if (search) {
      idx++;
      where += ` AND (p.customer_name ILIKE $${idx} OR p.project_number ILIKE $${idx} OR p.agent_name ILIKE $${idx})`;
      params.push(`%${search}%`);
    }

    idx++; const lim = idx; params.push(Number(limit));
    idx++; const off = idx; params.push(Number(offset));

    const r = await pool.query(
      `SELECT p.*,
        (SELECT COUNT(*) FROM supply_chain_steps s WHERE s.project_id = p.id AND s.step_status = 'completed') AS completed_steps,
        (SELECT COUNT(*) FROM supply_chain_steps s WHERE s.project_id = p.id AND s.step_status = 'blocked') AS blocked_steps
       FROM supply_chain_projects p
       ${where}
       ORDER BY p.created_at DESC
       LIMIT $${lim} OFFSET $${off}`,
      params
    );

    const countR = await pool.query(
      `SELECT COUNT(*) FROM supply_chain_projects p ${where}`,
      params.slice(0, params.length - 2)
    );

    res.json({ projects: r.rows, total: Number(countR.rows[0].count) });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/supply-chain/projects/:id ──
router.get("/supply-chain/projects/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const pr = await pool.query("SELECT * FROM supply_chain_projects WHERE id = $1", [id]);
    if (!pr.rows.length) return res.status(404).json({ error: "פרויקט לא נמצא" });

    const steps = await pool.query(
      "SELECT * FROM supply_chain_steps WHERE project_id = $1 ORDER BY step_number", [id]
    );
    const reminders = await pool.query(
      "SELECT * FROM supply_chain_reminders WHERE project_id = $1 ORDER BY created_at DESC", [id]
    );
    const approvals = await pool.query(
      "SELECT * FROM supply_chain_approvals WHERE project_id = $1 ORDER BY created_at DESC", [id]
    );

    res.json({
      project: pr.rows[0],
      steps: steps.rows,
      reminders: reminders.rows,
      approvals: approvals.rows,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/supply-chain/projects/:id/advance-step ──
router.post("/supply-chain/projects/:id/advance-step", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const pr = await pool.query("SELECT * FROM supply_chain_projects WHERE id = $1", [id]);
    if (!pr.rows.length) return res.status(404).json({ error: "לא נמצא" });

    const project = pr.rows[0];
    if (project.status !== "active") return res.status(400).json({ error: "הפרויקט לא פעיל" });

    const currentStep = project.current_step;
    if (currentStep >= 18) return res.status(400).json({ error: "הפרויקט כבר הושלם" });

    // Check if current step requires approval and has it
    const stepR = await pool.query(
      "SELECT * FROM supply_chain_steps WHERE project_id = $1 AND step_number = $2", [id, currentStep]
    );
    const step = stepR.rows[0];
    if (step?.requires_approval && !step.approved_by) {
      return res.status(400).json({ error: "השלב דורש אישור לפני התקדמות" });
    }

    // Complete current step
    await pool.query(
      `UPDATE supply_chain_steps SET step_status = 'completed', completed_at = NOW()
       WHERE project_id = $1 AND step_number = $2`,
      [id, currentStep]
    );

    const nextStep = currentStep + 1;

    // Start next step
    await pool.query(
      `UPDATE supply_chain_steps SET step_status = 'in_progress', started_at = NOW()
       WHERE project_id = $1 AND step_number = $2`,
      [id, nextStep]
    );

    // Update project
    const newStatus = nextStep > 18 ? "completed" : "active";
    await pool.query(
      `UPDATE supply_chain_projects SET current_step = $1, status = $2 WHERE id = $3`,
      [nextStep > 18 ? 18 : nextStep, newStatus, id]
    );

    // Complete reminders for this step
    await pool.query(
      `UPDATE supply_chain_reminders SET status = 'completed' WHERE project_id = $1 AND step_number = $2 AND status = 'active'`,
      [id, currentStep]
    );

    res.json({ success: true, previousStep: currentStep, currentStep: nextStep, status: newStatus });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/supply-chain/projects/:id/approve/:stepNumber ──
router.post("/supply-chain/projects/:id/approve/:stepNumber", async (req: Request, res: Response) => {
  try {
    const { id, stepNumber } = req.params;
    const { approved_by, approval_type, notes } = req.body;

    await pool.query(
      `UPDATE supply_chain_steps SET approved_by = $1, approved_at = NOW()
       WHERE project_id = $2 AND step_number = $3`,
      [approved_by, id, stepNumber]
    );

    await pool.query(
      `INSERT INTO supply_chain_approvals (project_id, step_number, approval_type, approved_by, status, notes)
       VALUES ($1, $2, $3, $4, 'approved', $5)`,
      [id, stepNumber, approval_type || "measurement", approved_by, notes]
    );

    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/supply-chain/projects/:id/block/:stepNumber ──
router.post("/supply-chain/projects/:id/block/:stepNumber", async (req: Request, res: Response) => {
  try {
    const { id, stepNumber } = req.params;
    const { notes, reported_by } = req.body;

    await pool.query(
      `UPDATE supply_chain_steps SET step_status = 'blocked', notes = $1
       WHERE project_id = $2 AND step_number = $3`,
      [notes, id, stepNumber]
    );

    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/supply-chain/projects/:id/reminder ──
router.post("/supply-chain/projects/:id/reminder", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { step_number, recipient_type, recipient_id, message, frequency_hours } = req.body;

    const r = await pool.query(
      `INSERT INTO supply_chain_reminders (project_id, step_number, recipient_type, recipient_id, message, frequency_hours)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [id, step_number, recipient_type, recipient_id, message, frequency_hours || 24]
    );

    res.json({ success: true, reminder: r.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/supply-chain/projects/:id/measurement-complete ──
router.post("/supply-chain/projects/:id/measurement-complete", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { engineer_id, measurements, notes } = req.body;

    await pool.query(
      `UPDATE supply_chain_projects SET measurement_date = NOW(), measurement_engineer_id = $1
       WHERE id = $2`,
      [engineer_id, id]
    );

    await pool.query(
      `UPDATE supply_chain_steps SET notes = $1 WHERE project_id = $2 AND step_number = 3`,
      [JSON.stringify(measurements) + (notes ? `\n${notes}` : ""), id]
    );

    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/supply-chain/projects/:id/measurement-compare ──
router.post("/supply-chain/projects/:id/measurement-compare", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { agent_measurements, engineer_measurements } = req.body;

    const diffs: Array<{ field: string; agent: number; engineer: number; diff: number; pct: number }> = [];
    for (const key of Object.keys(agent_measurements || {})) {
      const a = Number(agent_measurements[key]) || 0;
      const e = Number(engineer_measurements?.[key]) || 0;
      const diff = Math.abs(a - e);
      const pct = a > 0 ? (diff / a) * 100 : 0;
      diffs.push({ field: key, agent: a, engineer: e, diff, pct });
    }

    const hasLargeDiff = diffs.some((d) => d.pct > 5);

    await pool.query(
      `UPDATE supply_chain_steps SET notes = $1 WHERE project_id = $2 AND step_number = 4`,
      [JSON.stringify({ diffs, hasLargeDiff }), id]
    );

    res.json({ success: true, diffs, hasLargeDiff, recommendation: hasLargeDiff ? "נדרשת מדידה חוזרת" : "מדידות תקינות" });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/supply-chain/projects/:id/production-update ──
router.post("/supply-chain/projects/:id/production-update", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { production_status, notes } = req.body;

    await pool.query(
      `UPDATE supply_chain_projects SET production_status = $1 WHERE id = $2`,
      [production_status, id]
    );

    // Map production status to step
    const stepMap: Record<string, number> = { started: 9, middle: 10, end: 11, completed: 11 };
    const stepNum = stepMap[production_status];
    if (stepNum) {
      await pool.query(
        `UPDATE supply_chain_steps SET notes = COALESCE(notes, '') || $1
         WHERE project_id = $2 AND step_number = $3`,
        [`\n[${new Date().toISOString()}] ${production_status}: ${notes || ""}`, id, stepNum]
      );
    }

    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/supply-chain/projects/:id/paint-complete ──
router.post("/supply-chain/projects/:id/paint-complete", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { paint_type, notes } = req.body;

    await pool.query(
      `UPDATE supply_chain_projects SET paint_status = 'completed', paint_type = COALESCE($1, paint_type) WHERE id = $2`,
      [paint_type, id]
    );

    await pool.query(
      `UPDATE supply_chain_steps SET notes = $1 WHERE project_id = $2 AND step_number = 13`,
      [notes || "צביעה הושלמה", id]
    );

    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/supply-chain/projects/:id/installation-schedule ──
router.post("/supply-chain/projects/:id/installation-schedule", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { installation_date, installer_id, installer_name } = req.body;

    await pool.query(
      `UPDATE supply_chain_projects
       SET installation_date = $1, installer_id = $2, installer_name = $3, installation_status = 'scheduled'
       WHERE id = $4`,
      [installation_date, installer_id, installer_name, id]
    );

    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/supply-chain/projects/:id/installation-complete ──
router.post("/supply-chain/projects/:id/installation-complete", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    await pool.query(
      `UPDATE supply_chain_projects SET installation_status = 'completed' WHERE id = $1`, [id]
    );

    await pool.query(
      `UPDATE supply_chain_steps SET notes = $1 WHERE project_id = $2 AND step_number = 16`,
      [notes || "התקנה הושלמה בהצלחה", id]
    );

    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/supply-chain/projects/:id/customer-feedback ──
router.post("/supply-chain/projects/:id/customer-feedback", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { feedback, rating } = req.body;

    await pool.query(
      `UPDATE supply_chain_projects SET customer_feedback = $1, customer_rating = $2 WHERE id = $3`,
      [feedback, rating, id]
    );

    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/supply-chain/dashboard ──
router.get("/supply-chain/dashboard", async (_req: Request, res: Response) => {
  try {
    const activeByStep = await pool.query(
      `SELECT current_step, COUNT(*) as count
       FROM supply_chain_projects WHERE status = 'active'
       GROUP BY current_step ORDER BY current_step`
    );

    const blocked = await pool.query(
      `SELECT p.id, p.project_number, p.customer_name, s.step_number, s.step_name, s.notes
       FROM supply_chain_projects p
       JOIN supply_chain_steps s ON s.project_id = p.id
       WHERE s.step_status = 'blocked' AND p.status = 'active'
       ORDER BY s.step_number`
    );

    const remindersDue = await pool.query(
      `SELECT r.*, p.project_number, p.customer_name
       FROM supply_chain_reminders r
       JOIN supply_chain_projects p ON p.id = r.project_id
       WHERE r.status = 'active'
       AND (r.last_sent IS NULL OR r.last_sent < NOW() - (r.frequency_hours || ' hours')::interval)
       ORDER BY r.created_at`
    );

    const stats = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'active') AS active_count,
        COUNT(*) FILTER (WHERE status = 'completed') AS completed_count,
        COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled_count,
        ROUND(AVG(EXTRACT(EPOCH FROM (
          CASE WHEN status = 'completed' THEN
            (SELECT MAX(completed_at) FROM supply_chain_steps WHERE project_id = supply_chain_projects.id)
          ELSE NULL END
        ) - created_at) / 86400)::NUMERIC, 1) AS avg_days_to_complete,
        ROUND(COUNT(*) FILTER (WHERE status = 'completed') * 100.0 / NULLIF(COUNT(*), 0), 1) AS completion_rate
      FROM supply_chain_projects
    `);

    res.json({
      activeByStep: activeByStep.rows,
      blockedProjects: blocked.rows,
      remindersDue: remindersDue.rows,
      stats: stats.rows[0],
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/supply-chain/timeline/:projectId ──
router.get("/supply-chain/timeline/:projectId", async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;

    const steps = await pool.query(
      `SELECT step_number, step_name, step_status, started_at, completed_at, assigned_to, notes, approved_by, approved_at
       FROM supply_chain_steps WHERE project_id = $1 ORDER BY step_number`, [projectId]
    );

    const approvals = await pool.query(
      `SELECT * FROM supply_chain_approvals WHERE project_id = $1 ORDER BY created_at`, [projectId]
    );

    // Build unified timeline
    const events: Array<{ time: string; type: string; step: number; detail: string }> = [];
    for (const s of steps.rows) {
      if (s.started_at) events.push({ time: s.started_at, type: "start", step: s.step_number, detail: `התחלת: ${s.step_name}` });
      if (s.completed_at) events.push({ time: s.completed_at, type: "complete", step: s.step_number, detail: `הושלם: ${s.step_name}` });
      if (s.approved_at) events.push({ time: s.approved_at, type: "approval", step: s.step_number, detail: `אושר: ${s.step_name}` });
    }
    for (const a of approvals.rows) {
      events.push({ time: a.created_at, type: `approval_${a.status}`, step: a.step_number, detail: `${a.approval_type}: ${a.status}` });
    }

    events.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    res.json({ timeline: events, steps: steps.rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
