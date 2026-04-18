import { Router, Request, Response, NextFunction } from "express";
import { pool } from "@workspace/db";

const router = Router();

// ─── Auto-create tables ───────────────────────────────────────────────────────
async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS field_tasks (
      id SERIAL PRIMARY KEY,
      task_type VARCHAR(30) DEFAULT 'installation' CHECK (task_type IN ('measurement','installation','service','inspection')),
      project_id INTEGER,
      project_name VARCHAR(300),
      customer_name VARCHAR(200),
      customer_phone VARCHAR(50),
      address TEXT,
      city VARCHAR(100),
      assigned_to INTEGER,
      assigned_name VARCHAR(200),
      scheduled_date DATE,
      scheduled_time TIME,
      estimated_duration_hours NUMERIC(5,2) DEFAULT 2,
      actual_start TIMESTAMPTZ,
      actual_end TIMESTAMPTZ,
      status VARCHAR(30) DEFAULT 'assigned' CHECK (status IN ('assigned','en_route','arrived','in_progress','completed','issue_reported')),
      priority VARCHAR(10) DEFAULT 'normal' CHECK (priority IN ('normal','urgent')),
      notes TEXT,
      checklist JSONB DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS field_reports (
      id SERIAL PRIMARY KEY,
      task_id INTEGER REFERENCES field_tasks(id) ON DELETE CASCADE,
      report_type VARCHAR(40) DEFAULT 'installation_report' CHECK (report_type IN ('measurement_report','installation_report','service_report','inspection_report')),
      data JSONB DEFAULT '{}',
      notes TEXT,
      issues JSONB DEFAULT '[]',
      created_by INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS field_photos (
      id SERIAL PRIMARY KEY,
      task_id INTEGER REFERENCES field_tasks(id) ON DELETE CASCADE,
      photo_type VARCHAR(20) DEFAULT 'during' CHECK (photo_type IN ('before','during','after','issue','measurement','signature')),
      url TEXT NOT NULL,
      caption VARCHAR(300),
      location_lat NUMERIC(10,7),
      location_lng NUMERIC(10,7),
      taken_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS field_signatures (
      id SERIAL PRIMARY KEY,
      task_id INTEGER REFERENCES field_tasks(id) ON DELETE CASCADE,
      signer_type VARCHAR(20) DEFAULT 'customer' CHECK (signer_type IN ('customer','installer','engineer','manager')),
      signer_name VARCHAR(200),
      signature_data TEXT,
      signed_at TIMESTAMPTZ DEFAULT NOW(),
      ip_address VARCHAR(100)
    );

    CREATE TABLE IF NOT EXISTS field_locations (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      latitude NUMERIC(10,7),
      longitude NUMERIC(10,7),
      accuracy_m NUMERIC(8,2),
      timestamp TIMESTAMPTZ DEFAULT NOW(),
      task_id INTEGER REFERENCES field_tasks(id) ON DELETE SET NULL
    );
  `);
}
ensureTables().catch(console.error);

// ─── Auth middleware (uses query param or header for field workers) ────────────
interface FieldAuthRequest extends Request {
  fieldUser?: { id: number; name: string };
}

async function requireFieldAuth(req: FieldAuthRequest, res: Response, next: NextFunction): Promise<void> {
  // For field operations, accept worker_id from query or header for simplicity
  const workerId = req.headers["x-worker-id"] || req.query.worker_id;
  if (!workerId) { res.status(401).json({ error: "נדרש זיהוי עובד שטח" }); return; }
  req.fieldUser = { id: parseInt(workerId as string), name: req.headers["x-worker-name"] as string || `עובד #${workerId}` };
  next();
}

// ─── Endpoints ────────────────────────────────────────────────────────────────

// My Tasks (today)
router.get("/field/my-tasks", requireFieldAuth as any, async (req: FieldAuthRequest, res: Response) => {
  try {
    const userId = req.fieldUser!.id;
    const dateFilter = (req.query.date as string) || new Date().toISOString().slice(0, 10);

    const { rows } = await pool.query(
      `SELECT * FROM field_tasks
       WHERE assigned_to = $1 AND scheduled_date = $2
       ORDER BY scheduled_time ASC NULLS LAST, priority DESC`,
      [userId, dateFilter]
    );
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Start task
router.post("/field/tasks/:id/start", requireFieldAuth as any, async (req: FieldAuthRequest, res: Response) => {
  try {
    const taskId = parseInt(req.params.id);
    const { rows } = await pool.query(
      `UPDATE field_tasks SET status = 'en_route', actual_start = NOW()
       WHERE id = $1 AND assigned_to = $2 RETURNING *`,
      [taskId, req.fieldUser!.id]
    );
    if (!rows[0]) { res.status(404).json({ error: "משימה לא נמצאה" }); return; }
    res.json({ ok: true, task: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Arrive
router.post("/field/tasks/:id/arrive", requireFieldAuth as any, async (req: FieldAuthRequest, res: Response) => {
  try {
    const taskId = parseInt(req.params.id);
    const { rows } = await pool.query(
      `UPDATE field_tasks SET status = 'arrived'
       WHERE id = $1 AND assigned_to = $2 RETURNING *`,
      [taskId, req.fieldUser!.id]
    );
    if (!rows[0]) { res.status(404).json({ error: "משימה לא נמצאה" }); return; }
    res.json({ ok: true, task: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Complete
router.post("/field/tasks/:id/complete", requireFieldAuth as any, async (req: FieldAuthRequest, res: Response) => {
  try {
    const taskId = parseInt(req.params.id);
    const { notes } = req.body;
    const { rows } = await pool.query(
      `UPDATE field_tasks SET status = 'completed', actual_end = NOW(), notes = COALESCE($3, notes)
       WHERE id = $1 AND assigned_to = $2 RETURNING *`,
      [taskId, req.fieldUser!.id, notes]
    );
    if (!rows[0]) { res.status(404).json({ error: "משימה לא נמצאה" }); return; }
    res.json({ ok: true, task: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Report issue
router.post("/field/tasks/:id/report-issue", requireFieldAuth as any, async (req: FieldAuthRequest, res: Response) => {
  try {
    const taskId = parseInt(req.params.id);
    const { issue_type, description, severity } = req.body;
    if (!description) { res.status(400).json({ error: "נדרש תיאור הבעיה" }); return; }

    await pool.query(
      `UPDATE field_tasks SET status = 'issue_reported' WHERE id = $1 AND assigned_to = $2`,
      [taskId, req.fieldUser!.id]
    );

    const { rows } = await pool.query(
      `INSERT INTO field_reports (task_id, report_type, data, notes, issues, created_by)
       VALUES ($1, 'service_report', $2, $3, $4, $5) RETURNING *`,
      [
        taskId,
        JSON.stringify({ issue_type, severity }),
        description,
        JSON.stringify([{ type: issue_type, description, severity, reported_at: new Date().toISOString() }]),
        req.fieldUser!.id,
      ]
    );
    res.json({ ok: true, report: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Upload photo
router.post("/field/photos/upload", requireFieldAuth as any, async (req: FieldAuthRequest, res: Response) => {
  try {
    const { task_id, photo_type, url, caption, location_lat, location_lng } = req.body;
    if (!task_id || !url) { res.status(400).json({ error: "נדרש מזהה משימה וקישור לתמונה" }); return; }

    const { rows } = await pool.query(
      `INSERT INTO field_photos (task_id, photo_type, url, caption, location_lat, location_lng)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [task_id, photo_type || "during", url, caption || null, location_lat || null, location_lng || null]
    );
    res.json({ ok: true, photo: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Capture signature
router.post("/field/signatures/capture", requireFieldAuth as any, async (req: FieldAuthRequest, res: Response) => {
  try {
    const { task_id, signer_type, signer_name, signature_data } = req.body;
    if (!task_id || !signature_data) { res.status(400).json({ error: "נדרש מזהה משימה וחתימה" }); return; }

    const ip = req.ip || req.socket.remoteAddress || "";
    const { rows } = await pool.query(
      `INSERT INTO field_signatures (task_id, signer_type, signer_name, signature_data, ip_address)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [task_id, signer_type || "customer", signer_name || "", signature_data, ip]
    );
    res.json({ ok: true, signature: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Update location
router.post("/field/locations/update", requireFieldAuth as any, async (req: FieldAuthRequest, res: Response) => {
  try {
    const { latitude, longitude, accuracy_m, task_id } = req.body;
    if (!latitude || !longitude) { res.status(400).json({ error: "נדרשות קואורדינטות" }); return; }

    const { rows } = await pool.query(
      `INSERT INTO field_locations (user_id, latitude, longitude, accuracy_m, task_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.fieldUser!.id, latitude, longitude, accuracy_m || null, task_id || null]
    );
    res.json({ ok: true, location: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Get checklist
router.get("/field/tasks/:id/checklist", requireFieldAuth as any, async (req: FieldAuthRequest, res: Response) => {
  try {
    const taskId = parseInt(req.params.id);
    const { rows } = await pool.query("SELECT checklist FROM field_tasks WHERE id = $1", [taskId]);
    if (!rows[0]) { res.status(404).json({ error: "משימה לא נמצאה" }); return; }
    res.json(rows[0].checklist || []);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Toggle checklist item
router.post("/field/tasks/:id/checklist-item/:itemIdx/toggle", requireFieldAuth as any, async (req: FieldAuthRequest, res: Response) => {
  try {
    const taskId = parseInt(req.params.id);
    const itemIdx = parseInt(req.params.itemIdx);

    const { rows } = await pool.query("SELECT checklist FROM field_tasks WHERE id = $1 AND assigned_to = $2", [taskId, req.fieldUser!.id]);
    if (!rows[0]) { res.status(404).json({ error: "משימה לא נמצאה" }); return; }

    const checklist = rows[0].checklist || [];
    if (itemIdx < 0 || itemIdx >= checklist.length) { res.status(400).json({ error: "פריט לא קיים" }); return; }

    checklist[itemIdx].done = !checklist[itemIdx].done;
    checklist[itemIdx].toggled_at = new Date().toISOString();

    await pool.query("UPDATE field_tasks SET checklist = $1 WHERE id = $2", [JSON.stringify(checklist), taskId]);
    res.json({ ok: true, checklist });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Manager dashboard
router.get("/field/dashboard", async (req: Request, res: Response) => {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const [tasksToday, activeWorkers, completedToday, photosToday, issuesOpen] = await Promise.all([
      pool.query("SELECT COUNT(*) as count FROM field_tasks WHERE scheduled_date = $1", [today]),
      pool.query(
        `SELECT DISTINCT assigned_to, assigned_name, status FROM field_tasks
         WHERE scheduled_date = $1 AND status IN ('en_route','arrived','in_progress')`, [today]
      ),
      pool.query("SELECT COUNT(*) as count FROM field_tasks WHERE scheduled_date = $1 AND status = 'completed'", [today]),
      pool.query(
        `SELECT COUNT(*) as count FROM field_photos fp
         JOIN field_tasks ft ON fp.task_id = ft.id
         WHERE ft.scheduled_date = $1`, [today]
      ),
      pool.query("SELECT COUNT(*) as count FROM field_tasks WHERE status = 'issue_reported'"),
    ]);

    // Recent locations of active workers
    const locations = await pool.query(
      `SELECT DISTINCT ON (user_id) user_id, latitude, longitude, accuracy_m, timestamp, task_id
       FROM field_locations ORDER BY user_id, timestamp DESC`
    );

    const allTasks = await pool.query(
      `SELECT id, task_type, project_name, customer_name, assigned_name, status, priority, scheduled_time, city
       FROM field_tasks WHERE scheduled_date = $1 ORDER BY scheduled_time ASC NULLS LAST`,
      [today]
    );

    res.json({
      date: today,
      stats: {
        total_tasks_today: parseInt(tasksToday.rows[0].count),
        completed_today: parseInt(completedToday.rows[0].count),
        photos_today: parseInt(photosToday.rows[0].count),
        open_issues: parseInt(issuesOpen.rows[0].count),
        active_workers: activeWorkers.rows.length,
      },
      active_workers: activeWorkers.rows,
      worker_locations: locations.rows,
      tasks: allTasks.rows,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
