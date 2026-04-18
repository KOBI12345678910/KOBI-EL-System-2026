import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

/* ───── AUTO-CREATE TABLES ───── */
async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS installation_schedule (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL,
      customer_name VARCHAR(300) NOT NULL,
      customer_address TEXT,
      customer_city VARCHAR(200),
      customer_phone VARCHAR(50),
      installer_id INTEGER,
      installer_name VARCHAR(200),
      scheduled_date DATE,
      estimated_hours NUMERIC(6,2) DEFAULT 0,
      actual_hours NUMERIC(6,2),
      project_value NUMERIC(15,2) DEFAULT 0,
      value_category VARCHAR(10) DEFAULT 'small' CHECK (value_category IN ('small','medium','large')),
      status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled','confirmed','in_progress','completed','rejected','rescheduled')),
      photos JSONB DEFAULT '[]',
      customer_signature_url TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS installation_groups (
      id SERIAL PRIMARY KEY,
      group_date DATE NOT NULL,
      installer_id INTEGER,
      total_value NUMERIC(15,2) DEFAULT 0,
      installations JSONB DEFAULT '[]',
      route_order JSONB DEFAULT '[]',
      status VARCHAR(20) DEFAULT 'planning' CHECK (status IN ('planning','confirmed','in_progress','completed')),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS installer_availability (
      id SERIAL PRIMARY KEY,
      installer_id INTEGER NOT NULL,
      date DATE NOT NULL,
      available BOOLEAN DEFAULT TRUE,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(installer_id, date)
    );

    CREATE TABLE IF NOT EXISTS installation_feedback (
      id SERIAL PRIMARY KEY,
      installation_id INTEGER REFERENCES installation_schedule(id) ON DELETE CASCADE,
      customer_id INTEGER,
      process_rating INTEGER CHECK (process_rating BETWEEN 1 AND 5),
      service_rating INTEGER CHECK (service_rating BETWEEN 1 AND 5),
      quality_rating INTEGER CHECK (quality_rating BETWEEN 1 AND 5),
      agent_rating INTEGER CHECK (agent_rating BETWEEN 1 AND 5),
      overall_rating INTEGER CHECK (overall_rating BETWEEN 1 AND 5),
      would_recommend BOOLEAN DEFAULT TRUE,
      feedback_text TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

let tablesReady = false;
async function init() { if (!tablesReady) { await ensureTables(); tablesReady = true; } }

/* ───── SEED DEMO DATA ───── */
async function seedIfEmpty() {
  const { rows } = await pool.query("SELECT COUNT(*) as cnt FROM installation_schedule");
  if (Number(rows[0].cnt) > 0) return;

  const customers = [
    { name: "משפחת כהן", address: "הרצל 15", city: "תל אביב", phone: "054-1234567" },
    { name: "משפחת לוי", address: "בן גוריון 42", city: "חיפה", phone: "052-9876543" },
    { name: "משפחת מזרחי", address: "ז'בוטינסקי 8", city: "רמת גן", phone: "050-5551234" },
    { name: "חברת אלון בע\"מ", address: "א.ת. חולון", city: "חולון", phone: "03-5559876" },
    { name: "משפחת אברהם", address: "ויצמן 33", city: "כפר סבא", phone: "054-7773333" },
    { name: "משפחת גולן", address: "העצמאות 7", city: "נתניה", phone: "052-1112222" },
    { name: "משפחת פרידמן", address: "סוקולוב 19", city: "הרצליה", phone: "050-8887777" },
    { name: "מפעל ביטון מתכת", address: "א.ת. ראשון", city: "ראשון לציון", phone: "03-9994444" },
    { name: "משפחת דהן", address: "רוטשילד 55", city: "פתח תקווה", phone: "054-6665555" },
    { name: "משפחת שלום", address: "אלנבי 12", city: "בת ים", phone: "052-3334444" },
  ];

  const installers = [
    { id: 1, name: "צוות א - מוטי" },
    { id: 2, name: "צוות ב - אבי" },
    { id: 3, name: "צוות ג - יוסי" },
  ];

  const statuses = ["scheduled", "confirmed", "in_progress", "completed", "completed", "completed"] as const;

  for (let i = 0; i < customers.length; i++) {
    const c = customers[i];
    const val = 5000 + Math.floor(Math.random() * 60000);
    const cat = val < 20000 ? "small" : val <= 40000 ? "medium" : "large";
    const inst = installers[i % 3];
    const day = 1 + Math.floor(i * 2.5);
    const date = `2026-04-${String(day).padStart(2, "0")}`;
    const st = statuses[i % statuses.length];

    await pool.query(
      `INSERT INTO installation_schedule
        (project_id, customer_name, customer_address, customer_city, customer_phone,
         installer_id, installer_name, scheduled_date, estimated_hours, actual_hours,
         project_value, value_category, status, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [100 + i, c.name, c.address, c.city, c.phone, inst.id, inst.name, date,
       2 + Math.floor(Math.random() * 6), st === "completed" ? 2 + Math.floor(Math.random() * 7) : null,
       val, cat, st, ""]
    );
  }

  // groups
  await pool.query(
    `INSERT INTO installation_groups (group_date, installer_id, total_value, installations, route_order, status)
     VALUES ('2026-04-01', 1, 45000, '[1,4]', '[1,4]', 'confirmed'),
            ('2026-04-03', 2, 32000, '[2,5]', '[2,5]', 'planning'),
            ('2026-04-06', 3, 58000, '[3,6,7]', '[3,6,7]', 'planning')`
  );

  // availability
  for (const inst of installers) {
    for (let d = 1; d <= 30; d++) {
      const date = `2026-04-${String(d).padStart(2, "0")}`;
      const avail = Math.random() > 0.15; // 85% available
      await pool.query(
        `INSERT INTO installer_availability (installer_id, date, available) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [inst.id, date, avail]
      );
    }
  }

  // feedback for completed
  const { rows: completed } = await pool.query(`SELECT id FROM installation_schedule WHERE status='completed'`);
  for (const inst of completed) {
    const r = () => 3 + Math.floor(Math.random() * 3); // 3-5
    await pool.query(
      `INSERT INTO installation_feedback (installation_id, process_rating, service_rating, quality_rating, agent_rating, overall_rating, would_recommend, feedback_text)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [inst.id, r(), r(), r(), r(), r(), Math.random() > 0.1, "עבודה מקצועית, תודה רבה!"]
    );
  }
}

/* ───── ENDPOINTS ───── */

// GET pending installations
router.get("/installation-scheduler/pending", async (_req, res) => {
  try {
    await init(); await seedIfEmpty();
    const { rows } = await pool.query(
      `SELECT * FROM installation_schedule WHERE status IN ('scheduled','confirmed','rescheduled') ORDER BY scheduled_date`
    );
    res.json({ data: rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST auto-group by value
router.post("/installation-scheduler/auto-group", async (req, res) => {
  try {
    await init();
    const targetDate = req.body.date || new Date().toISOString().slice(0, 10);
    const installerId = req.body.installer_id;

    // group unassigned installs by value category
    const { rows: pending } = await pool.query(
      `SELECT * FROM installation_schedule WHERE status IN ('scheduled','rescheduled') ORDER BY project_value DESC`
    );

    const groups: Record<string, any[]> = { small: [], medium: [], large: [] };
    for (const inst of pending) {
      const val = Number(inst.project_value);
      const cat = val < 20000 ? "small" : val <= 40000 ? "medium" : "large";
      groups[cat].push(inst);
    }

    const created = [];
    for (const [cat, installs] of Object.entries(groups)) {
      if (installs.length === 0) continue;
      const ids = installs.map((i: any) => i.id);
      const totalVal = installs.reduce((s: number, i: any) => s + Number(i.project_value), 0);
      const { rows } = await pool.query(
        `INSERT INTO installation_groups (group_date, installer_id, total_value, installations, route_order, status)
         VALUES ($1,$2,$3,$4,$5,'planning') RETURNING *`,
        [targetDate, installerId || null, totalVal, JSON.stringify(ids), JSON.stringify(ids)]
      );
      created.push({ ...rows[0], category: cat, count: installs.length });
    }

    res.json({ data: created });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST schedule a group
router.post("/installation-scheduler/schedule/:groupId", async (req, res) => {
  try {
    await init();
    const { date, installer_id, installer_name } = req.body;
    await pool.query(
      `UPDATE installation_groups SET group_date=$1, installer_id=$2, status='confirmed' WHERE id=$3`,
      [date, installer_id, req.params.groupId]
    );
    // update each installation
    const { rows: grp } = await pool.query(`SELECT installations FROM installation_groups WHERE id=$1`, [req.params.groupId]);
    const ids: number[] = grp[0]?.installations || [];
    for (const id of ids) {
      await pool.query(
        `UPDATE installation_schedule SET scheduled_date=$1, installer_id=$2, installer_name=$3, status='confirmed' WHERE id=$4`,
        [date, installer_id, installer_name || "", id]
      );
    }
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET installer schedule
router.get("/installation-scheduler/installer/:installerId/schedule", async (req, res) => {
  try {
    await init();
    const { rows: schedule } = await pool.query(
      `SELECT * FROM installation_schedule WHERE installer_id=$1 AND status NOT IN ('completed','rejected') ORDER BY scheduled_date`,
      [req.params.installerId]
    );
    const { rows: availability } = await pool.query(
      `SELECT * FROM installer_availability WHERE installer_id=$1 AND date >= CURRENT_DATE ORDER BY date LIMIT 60`,
      [req.params.installerId]
    );
    res.json({ schedule, availability });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST confirm installation
router.post("/installation-scheduler/confirm/:installationId", async (req, res) => {
  try {
    await init();
    await pool.query(`UPDATE installation_schedule SET status='confirmed', updated_at=NOW() WHERE id=$1`, [req.params.installationId]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST complete installation
router.post("/installation-scheduler/complete/:installationId", async (req, res) => {
  try {
    await init();
    const { actual_hours, photos, customer_signature_url, notes } = req.body;
    await pool.query(
      `UPDATE installation_schedule SET status='completed', actual_hours=$1, photos=$2, customer_signature_url=$3, notes=$4, updated_at=NOW() WHERE id=$5`,
      [actual_hours || 0, JSON.stringify(photos || []), customer_signature_url || "", notes || "", req.params.installationId]
    );
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST feedback
router.post("/installation-scheduler/feedback/:installationId", async (req, res) => {
  try {
    await init();
    const b = req.body;
    const { rows } = await pool.query(
      `INSERT INTO installation_feedback (installation_id, customer_id, process_rating, service_rating, quality_rating, agent_rating, overall_rating, would_recommend, feedback_text)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.params.installationId, b.customer_id || null, b.process_rating, b.service_rating, b.quality_rating,
       b.agent_rating, b.overall_rating, b.would_recommend ?? true, b.feedback_text || ""]
    );
    res.json({ data: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET dashboard
router.get("/installation-scheduler/dashboard", async (_req, res) => {
  try {
    await init(); await seedIfEmpty();

    const { rows: stats } = await pool.query(`
      SELECT COUNT(*) as total,
        SUM(CASE WHEN status='scheduled' THEN 1 ELSE 0 END) as scheduled,
        SUM(CASE WHEN status='confirmed' THEN 1 ELSE 0 END) as confirmed,
        SUM(CASE WHEN status='in_progress' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status='rejected' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN status='rescheduled' THEN 1 ELSE 0 END) as rescheduled,
        SUM(project_value) as total_value,
        AVG(estimated_hours) as avg_estimated_hours
      FROM installation_schedule
    `);

    const { rows: byCategory } = await pool.query(`
      SELECT value_category, COUNT(*) as cnt, SUM(project_value) as val
      FROM installation_schedule GROUP BY value_category
    `);

    const { rows: upcoming } = await pool.query(
      `SELECT * FROM installation_schedule WHERE scheduled_date >= CURRENT_DATE AND status NOT IN ('completed','rejected')
       ORDER BY scheduled_date LIMIT 15`
    );

    const { rows: groups } = await pool.query(`SELECT * FROM installation_groups ORDER BY group_date DESC LIMIT 10`);

    const { rows: feedback } = await pool.query(`
      SELECT AVG(process_rating) as avg_process, AVG(service_rating) as avg_service,
        AVG(quality_rating) as avg_quality, AVG(agent_rating) as avg_agent,
        AVG(overall_rating) as avg_overall,
        SUM(CASE WHEN would_recommend THEN 1 ELSE 0 END)::real / NULLIF(COUNT(*),0) * 100 as recommend_pct,
        COUNT(*) as total_feedback
      FROM installation_feedback
    `);

    res.json({ stats: stats[0], byCategory, upcoming, groups, feedback: feedback[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
