import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS installers (
      id SERIAL PRIMARY KEY,
      installer_number VARCHAR(20) UNIQUE,
      installer_type VARCHAR(30) DEFAULT 'employee',
      employee_id INTEGER,
      supplier_id INTEGER,
      name VARCHAR(200) NOT NULL,
      phone VARCHAR(20),
      mobile VARCHAR(20),
      email VARCHAR(200),
      specializations JSONB DEFAULT '[]',
      certification JSONB DEFAULT '[]',
      license_number VARCHAR(50),
      license_expiry DATE,
      insurance_expiry DATE,
      vehicle_number VARCHAR(20),
      rating DECIMAL(3,2) DEFAULT 0,
      availability_status VARCHAR(20) DEFAULT 'available',
      daily_rate INTEGER DEFAULT 0,
      hourly_rate INTEGER DEFAULT 0,
      area_coverage JSONB DEFAULT '[]',
      notes TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS installations (
      id SERIAL PRIMARY KEY,
      installation_number VARCHAR(20) UNIQUE,
      sales_order_id INTEGER,
      work_order_id INTEGER,
      customer_id INTEGER,
      contact_id INTEGER,
      installer_id INTEGER REFERENCES installers(id),
      team_members JSONB DEFAULT '[]',
      installation_type VARCHAR(30) DEFAULT 'new',
      scheduled_date DATE,
      scheduled_time_start TIME,
      scheduled_time_end TIME,
      actual_start TIMESTAMP,
      actual_end TIMESTAMP,
      status VARCHAR(30) DEFAULT 'scheduled',
      site_address JSONB DEFAULT '{}',
      site_contact_name VARCHAR(200),
      site_contact_phone VARCHAR(20),
      scope_of_work TEXT,
      materials_needed JSONB DEFAULT '[]',
      materials_used JSONB DEFAULT '[]',
      tools_needed JSONB DEFAULT '[]',
      access_instructions TEXT,
      safety_requirements TEXT,
      photos_before JSONB DEFAULT '[]',
      photos_after JSONB DEFAULT '[]',
      customer_signature TEXT,
      customer_satisfaction INTEGER,
      completion_notes TEXT,
      issues_found TEXT,
      follow_up_needed BOOLEAN DEFAULT false,
      follow_up_notes TEXT,
      estimated_duration_hours DECIMAL(6,2),
      actual_duration_hours DECIMAL(6,2),
      travel_time_hours DECIMAL(6,2),
      labor_cost INTEGER DEFAULT 0,
      material_cost INTEGER DEFAULT 0,
      total_cost INTEGER DEFAULT 0,
      notes TEXT,
      is_active BOOLEAN DEFAULT true,
      created_by INTEGER,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS installer_work_orders (
      id SERIAL PRIMARY KEY,
      iwo_number VARCHAR(20) UNIQUE,
      installation_id INTEGER REFERENCES installations(id),
      installer_id INTEGER REFERENCES installers(id),
      instructions TEXT,
      checklist JSONB DEFAULT '[]',
      safety_briefing TEXT,
      materials_list JSONB DEFAULT '[]',
      tools_list JSONB DEFAULT '[]',
      estimated_hours DECIMAL(6,2),
      status VARCHAR(20) DEFAULT 'pending',
      completed_checklist JSONB DEFAULT '[]',
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS site_measurements (
      id SERIAL PRIMARY KEY,
      measurement_number VARCHAR(20) UNIQUE,
      sales_order_id INTEGER,
      customer_id INTEGER,
      measurer_id INTEGER,
      measurement_date DATE DEFAULT CURRENT_DATE,
      measurement_time TIME,
      site_address JSONB DEFAULT '{}',
      status VARCHAR(30) DEFAULT 'scheduled',
      measurements_data JSONB DEFAULT '{}',
      total_linear_meters DECIMAL(10,2) DEFAULT 0,
      total_square_meters DECIMAL(10,2) DEFAULT 0,
      floor_plan_url VARCHAR(500),
      photos JSONB DEFAULT '[]',
      special_requirements TEXT,
      notes TEXT,
      is_active BOOLEAN DEFAULT true,
      created_by INTEGER,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);
}

export { ensureTables as ensureInstallationsModuleTables };

router.get("/installers", async (_req, res) => {
  try {
    const result = await pool.query("SELECT * FROM installers WHERE is_active=true ORDER BY name");
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/installers", async (req, res) => {
  try {
    const { installer_number, installer_type, employee_id, supplier_id, name, phone, mobile, email, specializations, daily_rate, hourly_rate, area_coverage, notes } = req.body;
    const num = installer_number || `INS-${Date.now()}`;
    const result = await pool.query(
      `INSERT INTO installers (installer_number, installer_type, employee_id, supplier_id, name, phone, mobile, email, specializations, daily_rate, hourly_rate, area_coverage, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [num, installer_type || 'employee', employee_id, supplier_id, name, phone, mobile, email, specializations || [], daily_rate || 0, hourly_rate || 0, area_coverage || [], notes]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/installers/:id", async (req, res) => {
  try {
    const { name, phone, mobile, email, specializations, availability_status, daily_rate, hourly_rate, rating, notes } = req.body;
    const result = await pool.query(
      `UPDATE installers SET name=$1, phone=$2, mobile=$3, email=$4, specializations=$5, availability_status=$6, daily_rate=$7, hourly_rate=$8, rating=$9, notes=$10, updated_at=NOW() WHERE id=$11 RETURNING *`,
      [name, phone, mobile, email, specializations, availability_status, daily_rate, hourly_rate, rating, notes, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/installers/:id", async (req, res) => {
  try {
    await pool.query("UPDATE installers SET is_active=false WHERE id=$1", [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/installations", async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT i.*, ins.name as installer_name, c.company_name as customer_name
      FROM installations i
      LEFT JOIN installers ins ON ins.id = i.installer_id
      LEFT JOIN customers c ON c.id = i.customer_id
      WHERE i.is_active = true
      ORDER BY i.scheduled_date DESC
    `);
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/installations", async (req, res) => {
  try {
    const { installation_number, sales_order_id, work_order_id, customer_id, installer_id, installation_type, scheduled_date, site_address, site_contact_name, site_contact_phone, scope_of_work, materials_needed, estimated_duration_hours, notes } = req.body;
    const num = installation_number || `INST-${Date.now()}`;
    const result = await pool.query(
      `INSERT INTO installations (installation_number, sales_order_id, work_order_id, customer_id, installer_id, installation_type, scheduled_date, site_address, site_contact_name, site_contact_phone, scope_of_work, materials_needed, estimated_duration_hours, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [num, sales_order_id, work_order_id, customer_id, installer_id, installation_type || 'new', scheduled_date, site_address || {}, site_contact_name, site_contact_phone, scope_of_work, materials_needed || [], estimated_duration_hours, notes]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/installations/:id", async (req, res) => {
  try {
    const { status, actual_start, actual_end, actual_duration_hours, customer_satisfaction, completion_notes, issues_found, follow_up_needed, notes } = req.body;
    const result = await pool.query(
      `UPDATE installations SET status=$1, actual_start=$2, actual_end=$3, actual_duration_hours=$4, customer_satisfaction=$5, completion_notes=$6, issues_found=$7, follow_up_needed=$8, notes=$9, updated_at=NOW() WHERE id=$10 RETURNING *`,
      [status, actual_start, actual_end, actual_duration_hours, customer_satisfaction, completion_notes, issues_found, follow_up_needed, notes, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/installer-work-orders", async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT iwo.*, ins.name as installer_name
      FROM installer_work_orders iwo
      LEFT JOIN installers ins ON ins.id = iwo.installer_id
      ORDER BY iwo.created_at DESC
    `);
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/installer-work-orders", async (req, res) => {
  try {
    const { iwo_number, installation_id, installer_id, instructions, checklist, safety_briefing, materials_list, tools_list, estimated_hours, notes } = req.body;
    const num = iwo_number || `IWO-${Date.now()}`;
    const result = await pool.query(
      `INSERT INTO installer_work_orders (iwo_number, installation_id, installer_id, instructions, checklist, safety_briefing, materials_list, tools_list, estimated_hours, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [num, installation_id, installer_id, instructions, checklist || [], safety_briefing, materials_list || [], tools_list || [], estimated_hours, notes]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/site-measurements", async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT sm.*, c.company_name as customer_name
      FROM site_measurements sm
      LEFT JOIN customers c ON c.id = sm.customer_id
      WHERE sm.is_active = true
      ORDER BY sm.measurement_date DESC
    `);
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/site-measurements", async (req, res) => {
  try {
    const { measurement_number, sales_order_id, customer_id, measurer_id, measurement_date, site_address, measurements_data, total_linear_meters, total_square_meters, special_requirements, notes } = req.body;
    const num = measurement_number || `SM-${Date.now()}`;
    const result = await pool.query(
      `INSERT INTO site_measurements (measurement_number, sales_order_id, customer_id, measurer_id, measurement_date, site_address, measurements_data, total_linear_meters, total_square_meters, special_requirements, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [num, sales_order_id, customer_id, measurer_id, measurement_date || new Date(), site_address || {}, measurements_data || {}, total_linear_meters || 0, total_square_meters || 0, special_requirements, notes]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/installations/dashboard", async (_req, res) => {
  try {
    const [total, scheduled, completed, installers] = await Promise.all([
      pool.query("SELECT COUNT(*) as c FROM installations WHERE is_active=true"),
      pool.query("SELECT COUNT(*) as c FROM installations WHERE status='scheduled' AND is_active=true"),
      pool.query("SELECT COUNT(*) as c FROM installations WHERE status='completed' AND is_active=true"),
      pool.query("SELECT COUNT(*) as c FROM installers WHERE is_active=true"),
    ]);
    res.json({
      totalInstallations: parseInt(total.rows[0].c),
      scheduledInstallations: parseInt(scheduled.rows[0].c),
      completedInstallations: parseInt(completed.rows[0].c),
      totalInstallers: parseInt(installers.rows[0].c),
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
