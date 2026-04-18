import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

// ─── Auto-create tables ───────────────────────────────────────────────────────
async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS equipment_registry (
      id SERIAL PRIMARY KEY,
      asset_code VARCHAR(50) UNIQUE NOT NULL,
      name VARCHAR(200) NOT NULL,
      category VARCHAR(40) CHECK (category IN ('machine','power_tool','hand_tool','welding_equipment','cutting_tool','measuring_instrument','safety_equipment','vehicle','crane','forklift','compressor','generator')),
      brand VARCHAR(100),
      model VARCHAR(100),
      serial_number VARCHAR(100),
      purchase_date DATE,
      purchase_cost NUMERIC(14,2) DEFAULT 0,
      current_value NUMERIC(14,2) DEFAULT 0,
      depreciation_method VARCHAR(20) DEFAULT 'straight_line' CHECK (depreciation_method IN ('straight_line','declining')),
      useful_life_years INT DEFAULT 10,
      location VARCHAR(40) DEFAULT 'workshop' CHECK (location IN ('workshop','yard','warehouse','field','maintenance')),
      assigned_to_department VARCHAR(100),
      condition VARCHAR(20) DEFAULT 'good' CHECK (condition IN ('excellent','good','fair','poor','broken')),
      status VARCHAR(20) DEFAULT 'available' CHECK (status IN ('available','in_use','maintenance','calibration','retired','lost')),
      last_maintenance DATE,
      next_maintenance DATE,
      maintenance_interval_days INT DEFAULT 90,
      calibration_required BOOLEAN DEFAULT false,
      calibration_due DATE,
      image_url TEXT,
      manual_url TEXT,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS equipment_checkouts (
      id SERIAL PRIMARY KEY,
      equipment_id INTEGER REFERENCES equipment_registry(id),
      checked_out_by INTEGER,
      checked_out_by_name VARCHAR(200),
      project_id INTEGER,
      project_name VARCHAR(200),
      checkout_date TIMESTAMPTZ DEFAULT NOW(),
      expected_return TIMESTAMPTZ,
      actual_return TIMESTAMPTZ,
      condition_at_checkout VARCHAR(20),
      condition_at_return VARCHAR(20),
      notes TEXT,
      status VARCHAR(20) DEFAULT 'checked_out' CHECK (status IN ('checked_out','returned','overdue','damaged','lost'))
    );

    CREATE TABLE IF NOT EXISTS equipment_maintenance_log (
      id SERIAL PRIMARY KEY,
      equipment_id INTEGER REFERENCES equipment_registry(id),
      maintenance_type VARCHAR(20) CHECK (maintenance_type IN ('preventive','corrective','emergency','calibration')),
      description TEXT,
      performed_by VARCHAR(200),
      cost NUMERIC(14,2) DEFAULT 0,
      parts_used JSONB DEFAULT '[]',
      downtime_hours NUMERIC(8,2) DEFAULT 0,
      started_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      next_due DATE,
      status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled','in_progress','completed'))
    );

    CREATE TABLE IF NOT EXISTS equipment_calibration (
      id SERIAL PRIMARY KEY,
      equipment_id INTEGER REFERENCES equipment_registry(id),
      calibration_date DATE DEFAULT CURRENT_DATE,
      performed_by VARCHAR(200),
      certificate_number VARCHAR(100),
      certificate_url TEXT,
      result VARCHAR(20) CHECK (result IN ('pass','fail','adjusted')),
      next_calibration DATE,
      notes TEXT
    );
  `);
}

// ─── Pre-seed equipment data ──────────────────────────────────────────────────
async function seedData() {
  const { rows } = await pool.query(`SELECT COUNT(*) as c FROM equipment_registry`);
  if (Number(rows[0].c) > 0) return;

  const items = [
    { code: 'EQ-CNC-001', name: 'מכונת CNC', category: 'machine', brand: 'Haas', model: 'VF-2', cost: 450000, location: 'workshop', dept: 'ייצור', calibration: true },
    { code: 'EQ-PLS-001', name: 'מכונת חיתוך פלזמה', category: 'cutting_tool', brand: 'Hypertherm', model: 'XPR300', cost: 180000, location: 'workshop', dept: 'ייצור', calibration: false },
    { code: 'EQ-MIG-001', name: 'רתכת MIG #1', category: 'welding_equipment', brand: 'Lincoln', model: 'Power MIG 360MP', cost: 15000, location: 'workshop', dept: 'ריתוך', calibration: false },
    { code: 'EQ-MIG-002', name: 'רתכת MIG #2', category: 'welding_equipment', brand: 'Lincoln', model: 'Power MIG 360MP', cost: 15000, location: 'workshop', dept: 'ריתוך', calibration: false },
    { code: 'EQ-MIG-003', name: 'רתכת MIG #3', category: 'welding_equipment', brand: 'Miller', model: 'Millermatic 255', cost: 12000, location: 'workshop', dept: 'ריתוך', calibration: false },
    { code: 'EQ-TIG-001', name: 'רתכת TIG #1', category: 'welding_equipment', brand: 'Miller', model: 'Dynasty 280', cost: 22000, location: 'workshop', dept: 'ריתוך', calibration: false },
    { code: 'EQ-TIG-002', name: 'רתכת TIG #2', category: 'welding_equipment', brand: 'Lincoln', model: 'Precision TIG 375', cost: 20000, location: 'workshop', dept: 'ריתוך', calibration: false },
    { code: 'EQ-GRD-001', name: 'משחזת זווית #1', category: 'power_tool', brand: 'DeWalt', model: 'DWE4557', cost: 800, location: 'workshop', dept: 'ייצור', calibration: false },
    { code: 'EQ-GRD-002', name: 'משחזת זווית #2', category: 'power_tool', brand: 'DeWalt', model: 'DWE4557', cost: 800, location: 'workshop', dept: 'ייצור', calibration: false },
    { code: 'EQ-GRD-003', name: 'משחזת זווית #3', category: 'power_tool', brand: 'Makita', model: 'GA7021', cost: 650, location: 'workshop', dept: 'ייצור', calibration: false },
    { code: 'EQ-GRD-004', name: 'משחזת זווית #4', category: 'power_tool', brand: 'Makita', model: 'GA7021', cost: 650, location: 'yard', dept: 'התקנות', calibration: false },
    { code: 'EQ-GRD-005', name: 'משחזת זווית #5', category: 'power_tool', brand: 'Bosch', model: 'GWS 15-125', cost: 500, location: 'field', dept: 'התקנות', calibration: false },
    { code: 'EQ-DRL-001', name: 'מקדחת עמוד', category: 'machine', brand: 'JET', model: 'JDP-17MF', cost: 8500, location: 'workshop', dept: 'ייצור', calibration: true },
    { code: 'EQ-SAW-001', name: 'מסור סרט', category: 'machine', brand: 'DoAll', model: 'DS-500SA', cost: 25000, location: 'workshop', dept: 'ייצור', calibration: false },
    { code: 'EQ-BND-001', name: 'מכונת כיפוף', category: 'machine', brand: 'Amada', model: 'HFE3i 5020', cost: 320000, location: 'workshop', dept: 'ייצור', calibration: true },
    { code: 'EQ-PWD-001', name: 'תנור צביעה אלקטרוסטטית', category: 'machine', brand: 'Nordson', model: 'Batch Oven 6x6', cost: 120000, location: 'workshop', dept: 'צביעה', calibration: true },
    { code: 'EQ-CMP-001', name: 'מדחס', category: 'compressor', brand: 'Atlas Copco', model: 'GA 37', cost: 45000, location: 'workshop', dept: 'תשתיות', calibration: false },
    { code: 'EQ-FLK-001', name: 'מלגזה', category: 'forklift', brand: 'Toyota', model: '8FGU25', cost: 85000, location: 'yard', dept: 'לוגיסטיקה', calibration: false },
    { code: 'EQ-TRK-001', name: 'משאית משלוחים #1', category: 'vehicle', brand: 'Iveco', model: 'Daily 35S14', cost: 180000, location: 'yard', dept: 'לוגיסטיקה', calibration: false },
    { code: 'EQ-TRK-002', name: 'משאית משלוחים #2', category: 'vehicle', brand: 'Mercedes', model: 'Atego 816', cost: 220000, location: 'yard', dept: 'לוגיסטיקה', calibration: false },
    { code: 'EQ-MSR-001', name: 'סרט מדידה', category: 'measuring_instrument', brand: 'Stanley', model: 'FatMax 8m', cost: 80, location: 'workshop', dept: 'ייצור', calibration: false },
    { code: 'EQ-LSR-001', name: 'פלס לייזר', category: 'measuring_instrument', brand: 'Bosch', model: 'GLL 3-80', cost: 2500, location: 'workshop', dept: 'ייצור', calibration: true },
  ];

  // Welding helmets x10
  for (let i = 1; i <= 10; i++) {
    items.push({ code: `EQ-HLM-${String(i).padStart(3,'0')}`, name: `קסדת ריתוך #${i}`, category: 'safety_equipment' as any, brand: '3M', model: 'Speedglas 9100', cost: 1800, location: 'workshop', dept: 'בטיחות', calibration: false });
  }
  // Safety glasses x20
  for (let i = 1; i <= 20; i++) {
    items.push({ code: `EQ-GLS-${String(i).padStart(3,'0')}`, name: `משקפי מגן #${i}`, category: 'safety_equipment' as any, brand: '3M', model: 'SecureFit 400', cost: 45, location: 'workshop', dept: 'בטיחות', calibration: false });
  }

  for (const it of items) {
    await pool.query(`
      INSERT INTO equipment_registry (asset_code, name, category, brand, model, purchase_cost, current_value, location, assigned_to_department, calibration_required, purchase_date, condition, status)
      VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$8,$9, CURRENT_DATE - (random()*365)::int, 'good', 'available')
      ON CONFLICT (asset_code) DO NOTHING
    `, [it.code, it.name, it.category, it.brand, it.model, it.cost, it.location, it.dept, it.calibration]);
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
ensureTables().then(() => seedData()).catch(e => console.error("tool-equipment init:", e));

// ═══════════════════════════════════════════════════════════════════════════════
//  EQUIPMENT REGISTRY CRUD
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/api/equipment", async (_req, res) => {
  try {
    const { search, category, status, location, department } = _req.query;
    let q = `SELECT * FROM equipment_registry WHERE 1=1`;
    const params: any[] = [];
    let i = 1;
    if (search) { q += ` AND (name ILIKE $${i} OR asset_code ILIKE $${i} OR brand ILIKE $${i})`; params.push(`%${search}%`); i++; }
    if (category) { q += ` AND category = $${i}`; params.push(category); i++; }
    if (status) { q += ` AND status = $${i}`; params.push(status); i++; }
    if (location) { q += ` AND location = $${i}`; params.push(location); i++; }
    if (department) { q += ` AND assigned_to_department = $${i}`; params.push(department); i++; }
    q += ` ORDER BY name`;
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/api/equipment/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM equipment_registry WHERE id = $1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: "לא נמצא" });
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/api/equipment", async (req, res) => {
  try {
    const b = req.body;
    const { rows } = await pool.query(`
      INSERT INTO equipment_registry (asset_code, name, category, brand, model, serial_number, purchase_date, purchase_cost, current_value, depreciation_method, useful_life_years, location, assigned_to_department, condition, status, maintenance_interval_days, calibration_required, calibration_due, image_url, manual_url, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
      RETURNING *
    `, [b.asset_code, b.name, b.category, b.brand, b.model, b.serial_number, b.purchase_date, b.purchase_cost, b.current_value || b.purchase_cost, b.depreciation_method, b.useful_life_years, b.location, b.assigned_to_department, b.condition || 'good', b.status || 'available', b.maintenance_interval_days || 90, b.calibration_required || false, b.calibration_due, b.image_url, b.manual_url, b.notes]);
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/api/equipment/:id", async (req, res) => {
  try {
    const b = req.body;
    const { rows } = await pool.query(`
      UPDATE equipment_registry SET name=$1, category=$2, brand=$3, model=$4, serial_number=$5, purchase_date=$6, purchase_cost=$7, current_value=$8, depreciation_method=$9, useful_life_years=$10, location=$11, assigned_to_department=$12, condition=$13, status=$14, maintenance_interval_days=$15, calibration_required=$16, calibration_due=$17, image_url=$18, manual_url=$19, notes=$20
      WHERE id=$21 RETURNING *
    `, [b.name, b.category, b.brand, b.model, b.serial_number, b.purchase_date, b.purchase_cost, b.current_value, b.depreciation_method, b.useful_life_years, b.location, b.assigned_to_department, b.condition, b.status, b.maintenance_interval_days, b.calibration_required, b.calibration_due, b.image_url, b.manual_url, b.notes, req.params.id]);
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/api/equipment/:id", async (req, res) => {
  try {
    await pool.query(`DELETE FROM equipment_registry WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  CHECKOUT / RETURN
// ═══════════════════════════════════════════════════════════════════════════════

router.post("/api/equipment/checkout", async (req, res) => {
  try {
    const b = req.body;
    const { rows } = await pool.query(`
      INSERT INTO equipment_checkouts (equipment_id, checked_out_by, checked_out_by_name, project_id, project_name, expected_return, condition_at_checkout, notes, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'checked_out') RETURNING *
    `, [b.equipment_id, b.checked_out_by, b.checked_out_by_name, b.project_id, b.project_name, b.expected_return, b.condition_at_checkout, b.notes]);
    await pool.query(`UPDATE equipment_registry SET status='in_use' WHERE id=$1`, [b.equipment_id]);
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/api/equipment/return/:checkoutId", async (req, res) => {
  try {
    const b = req.body;
    const { rows } = await pool.query(`
      UPDATE equipment_checkouts SET actual_return=NOW(), condition_at_return=$1, notes=COALESCE(notes,'') || ' | ' || COALESCE($2,''), status='returned'
      WHERE id=$3 RETURNING *
    `, [b.condition_at_return, b.notes, req.params.checkoutId]);
    if (rows[0]) {
      const newStatus = b.condition_at_return === 'broken' ? 'maintenance' : 'available';
      const newCondition = b.condition_at_return || 'good';
      await pool.query(`UPDATE equipment_registry SET status=$1, condition=$2 WHERE id=$3`, [newStatus, newCondition, rows[0].equipment_id]);
    }
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/api/equipment/checkouts/active", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT c.*, e.name as equipment_name, e.asset_code FROM equipment_checkouts c
      JOIN equipment_registry e ON e.id = c.equipment_id
      WHERE c.status = 'checked_out' ORDER BY c.checkout_date DESC
    `);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/api/equipment/overdue-returns", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT c.*, e.name as equipment_name, e.asset_code FROM equipment_checkouts c
      JOIN equipment_registry e ON e.id = c.equipment_id
      WHERE c.status = 'checked_out' AND c.expected_return < NOW()
      ORDER BY c.expected_return
    `);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  MAINTENANCE CRUD
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/api/equipment/maintenance", async (_req, res) => {
  try {
    const { equipment_id, status } = _req.query;
    let q = `SELECT m.*, e.name as equipment_name, e.asset_code FROM equipment_maintenance_log m JOIN equipment_registry e ON e.id = m.equipment_id WHERE 1=1`;
    const params: any[] = [];
    let i = 1;
    if (equipment_id) { q += ` AND m.equipment_id = $${i}`; params.push(equipment_id); i++; }
    if (status) { q += ` AND m.status = $${i}`; params.push(status); i++; }
    q += ` ORDER BY m.started_at DESC`;
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/api/equipment/maintenance", async (req, res) => {
  try {
    const b = req.body;
    const { rows } = await pool.query(`
      INSERT INTO equipment_maintenance_log (equipment_id, maintenance_type, description, performed_by, cost, parts_used, downtime_hours, started_at, completed_at, next_due, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *
    `, [b.equipment_id, b.maintenance_type, b.description, b.performed_by, b.cost, JSON.stringify(b.parts_used || []), b.downtime_hours, b.started_at, b.completed_at, b.next_due, b.status || 'scheduled']);
    if (b.status === 'in_progress') {
      await pool.query(`UPDATE equipment_registry SET status='maintenance' WHERE id=$1`, [b.equipment_id]);
    }
    if (b.status === 'completed' && b.next_due) {
      await pool.query(`UPDATE equipment_registry SET last_maintenance=CURRENT_DATE, next_maintenance=$1, status='available' WHERE id=$2`, [b.next_due, b.equipment_id]);
    }
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/api/equipment/maintenance/:id", async (req, res) => {
  try {
    const b = req.body;
    const { rows } = await pool.query(`
      UPDATE equipment_maintenance_log SET maintenance_type=$1, description=$2, performed_by=$3, cost=$4, parts_used=$5, downtime_hours=$6, completed_at=$7, next_due=$8, status=$9
      WHERE id=$10 RETURNING *
    `, [b.maintenance_type, b.description, b.performed_by, b.cost, JSON.stringify(b.parts_used || []), b.downtime_hours, b.completed_at, b.next_due, b.status, req.params.id]);
    if (b.status === 'completed' && rows[0]) {
      await pool.query(`UPDATE equipment_registry SET last_maintenance=CURRENT_DATE, next_maintenance=$1, status='available' WHERE id=$2`, [b.next_due, rows[0].equipment_id]);
    }
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/api/equipment/maintenance/:id", async (req, res) => {
  try {
    await pool.query(`DELETE FROM equipment_maintenance_log WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/api/equipment/maintenance-due", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT * FROM equipment_registry
      WHERE next_maintenance IS NOT NULL AND next_maintenance <= CURRENT_DATE + INTERVAL '7 days' AND status != 'retired'
      ORDER BY next_maintenance
    `);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  CALIBRATION CRUD
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/api/equipment/calibration", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT c.*, e.name as equipment_name, e.asset_code FROM equipment_calibration c
      JOIN equipment_registry e ON e.id = c.equipment_id ORDER BY c.calibration_date DESC
    `);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/api/equipment/calibration", async (req, res) => {
  try {
    const b = req.body;
    const { rows } = await pool.query(`
      INSERT INTO equipment_calibration (equipment_id, calibration_date, performed_by, certificate_number, certificate_url, result, next_calibration, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
    `, [b.equipment_id, b.calibration_date, b.performed_by, b.certificate_number, b.certificate_url, b.result, b.next_calibration, b.notes]);
    if (b.next_calibration) {
      await pool.query(`UPDATE equipment_registry SET calibration_due=$1, status='available' WHERE id=$2`, [b.next_calibration, b.equipment_id]);
    }
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/api/equipment/calibration/:id", async (req, res) => {
  try {
    const b = req.body;
    const { rows } = await pool.query(`
      UPDATE equipment_calibration SET calibration_date=$1, performed_by=$2, certificate_number=$3, certificate_url=$4, result=$5, next_calibration=$6, notes=$7
      WHERE id=$8 RETURNING *
    `, [b.calibration_date, b.performed_by, b.certificate_number, b.certificate_url, b.result, b.next_calibration, b.notes, req.params.id]);
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/api/equipment/calibration/:id", async (req, res) => {
  try {
    await pool.query(`DELETE FROM equipment_calibration WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/api/equipment/calibration-due", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT * FROM equipment_registry
      WHERE calibration_required = true AND calibration_due IS NOT NULL AND calibration_due <= CURRENT_DATE + INTERVAL '14 days' AND status != 'retired'
      ORDER BY calibration_due
    `);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  REPORTS & DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/api/equipment/by-department/:dept", async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM equipment_registry WHERE assigned_to_department = $1 ORDER BY name`, [req.params.dept]);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/api/equipment/utilization-report", async (_req, res) => {
  try {
    const totalR = await pool.query(`SELECT COUNT(*) as total FROM equipment_registry WHERE status != 'retired'`);
    const inUseR = await pool.query(`SELECT COUNT(*) as c FROM equipment_registry WHERE status = 'in_use'`);
    const maintenanceR = await pool.query(`SELECT COUNT(*) as c FROM equipment_registry WHERE status = 'maintenance'`);
    const byCat = await pool.query(`SELECT category, COUNT(*) as count, SUM(CASE WHEN status='in_use' THEN 1 ELSE 0 END) as in_use FROM equipment_registry WHERE status != 'retired' GROUP BY category ORDER BY count DESC`);
    const byDept = await pool.query(`SELECT assigned_to_department as department, COUNT(*) as count FROM equipment_registry WHERE status != 'retired' GROUP BY assigned_to_department ORDER BY count DESC`);
    const totalCost = await pool.query(`SELECT SUM(purchase_cost) as total, SUM(current_value) as current FROM equipment_registry WHERE status != 'retired'`);
    const avgCheckoutDays = await pool.query(`SELECT AVG(EXTRACT(EPOCH FROM (COALESCE(actual_return, NOW()) - checkout_date))/86400)::numeric(8,1) as avg_days FROM equipment_checkouts WHERE status IN ('checked_out','returned')`);

    const total = Number(totalR.rows[0].total);
    const inUse = Number(inUseR.rows[0].c);
    res.json({
      total_equipment: total,
      in_use: inUse,
      in_maintenance: Number(maintenanceR.rows[0].c),
      utilization_rate: total > 0 ? ((inUse / total) * 100).toFixed(1) : 0,
      by_category: byCat.rows,
      by_department: byDept.rows,
      total_purchase_cost: Number(totalCost.rows[0]?.total || 0),
      total_current_value: Number(totalCost.rows[0]?.current || 0),
      avg_checkout_days: Number(avgCheckoutDays.rows[0]?.avg_days || 0),
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/api/equipment/dashboard", async (_req, res) => {
  try {
    const totals = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status != 'retired') as total,
        COUNT(*) FILTER (WHERE status = 'available') as available,
        COUNT(*) FILTER (WHERE status = 'in_use') as in_use,
        COUNT(*) FILTER (WHERE status = 'maintenance') as in_maintenance,
        COUNT(*) FILTER (WHERE status = 'calibration') as in_calibration,
        COUNT(*) FILTER (WHERE status = 'retired') as retired,
        COUNT(*) FILTER (WHERE status = 'lost') as lost,
        COUNT(*) FILTER (WHERE condition = 'broken') as broken
      FROM equipment_registry
    `);
    const overdue = await pool.query(`SELECT COUNT(*) as c FROM equipment_checkouts WHERE status='checked_out' AND expected_return < NOW()`);
    const maintDue = await pool.query(`SELECT COUNT(*) as c FROM equipment_registry WHERE next_maintenance IS NOT NULL AND next_maintenance <= CURRENT_DATE + INTERVAL '7 days' AND status != 'retired'`);
    const calDue = await pool.query(`SELECT COUNT(*) as c FROM equipment_registry WHERE calibration_required = true AND calibration_due IS NOT NULL AND calibration_due <= CURRENT_DATE + INTERVAL '14 days' AND status != 'retired'`);
    const recentMaint = await pool.query(`SELECT m.*, e.name as equipment_name FROM equipment_maintenance_log m JOIN equipment_registry e ON e.id=m.equipment_id ORDER BY m.started_at DESC LIMIT 5`);
    const recentCheckouts = await pool.query(`SELECT c.*, e.name as equipment_name FROM equipment_checkouts c JOIN equipment_registry e ON e.id=c.equipment_id ORDER BY c.checkout_date DESC LIMIT 5`);
    const totalValue = await pool.query(`SELECT SUM(current_value) as v FROM equipment_registry WHERE status != 'retired'`);

    res.json({
      summary: totals.rows[0],
      overdue_returns: Number(overdue.rows[0].c),
      maintenance_due: Number(maintDue.rows[0].c),
      calibration_due: Number(calDue.rows[0].c),
      recent_maintenance: recentMaint.rows,
      recent_checkouts: recentCheckouts.rows,
      total_asset_value: Number(totalValue.rows[0]?.v || 0),
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
