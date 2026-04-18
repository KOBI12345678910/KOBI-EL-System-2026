import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS production_lines (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      code VARCHAR(10),
      department VARCHAR(100),
      line_type VARCHAR(50) DEFAULT 'assembly',
      capacity_per_hour DECIMAL(10,2) DEFAULT 0,
      status VARCHAR(30) DEFAULT 'operational',
      machines JSONB DEFAULT '[]',
      operators JSONB DEFAULT '[]',
      shift_schedule JSONB DEFAULT '{}',
      notes TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS non_conformance_reports (
      id SERIAL PRIMARY KEY,
      ncr_number VARCHAR(20) UNIQUE,
      source VARCHAR(50) DEFAULT 'production',
      severity VARCHAR(20) DEFAULT 'minor',
      status VARCHAR(30) DEFAULT 'open',
      description TEXT,
      root_cause TEXT,
      corrective_action TEXT,
      preventive_action TEXT,
      affected_product_id INTEGER,
      affected_order_id INTEGER,
      responsible_id INTEGER,
      due_date DATE,
      closed_date DATE,
      cost_of_quality INTEGER DEFAULT 0,
      photos JSONB DEFAULT '[]',
      notes TEXT,
      is_active BOOLEAN DEFAULT true,
      created_by INTEGER,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS equipment (
      id SERIAL PRIMARY KEY,
      asset_number VARCHAR(20) UNIQUE,
      name VARCHAR(200) NOT NULL,
      description TEXT,
      category VARCHAR(50) DEFAULT 'hand_tool',
      manufacturer VARCHAR(200),
      model VARCHAR(200),
      serial_number VARCHAR(100),
      purchase_date DATE,
      purchase_price INTEGER DEFAULT 0,
      current_value INTEGER DEFAULT 0,
      depreciation_method VARCHAR(50) DEFAULT 'straight_line',
      useful_life_years INTEGER DEFAULT 10,
      location VARCHAR(100),
      department VARCHAR(100),
      status VARCHAR(30) DEFAULT 'operational',
      last_maintenance_date DATE,
      next_maintenance_date DATE,
      maintenance_interval_days INTEGER DEFAULT 90,
      warranty_expiry DATE,
      specifications JSONB DEFAULT '{}',
      notes TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS procurement_approvals (
      id SERIAL PRIMARY KEY,
      document_type VARCHAR(30) NOT NULL,
      document_id INTEGER,
      approval_step INTEGER DEFAULT 1,
      approver_id INTEGER,
      status VARCHAR(20) DEFAULT 'pending',
      comments TEXT,
      approved_at TIMESTAMP,
      amount_threshold INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
}

export { ensureTables as ensureProductionGapsTables };

router.get("/production-lines", async (_req, res) => {
  try {
    const result = await pool.query("SELECT * FROM production_lines WHERE is_active=true ORDER BY name");
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/production-lines", async (req, res) => {
  try {
    const { name, code, department, line_type, capacity_per_hour, machines, operators, shift_schedule, notes } = req.body;
    const result = await pool.query(
      `INSERT INTO production_lines (name, code, department, line_type, capacity_per_hour, machines, operators, shift_schedule, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [name, code, department, line_type || 'assembly', capacity_per_hour || 0, machines || [], operators || [], shift_schedule || {}, notes]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/production-lines/:id", async (req, res) => {
  try {
    const { name, code, department, line_type, capacity_per_hour, status, machines, operators, notes } = req.body;
    const result = await pool.query(
      `UPDATE production_lines SET name=$1, code=$2, department=$3, line_type=$4, capacity_per_hour=$5, status=$6, machines=$7, operators=$8, notes=$9, updated_at=NOW() WHERE id=$10 RETURNING *`,
      [name, code, department, line_type, capacity_per_hour, status, machines, operators, notes, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/production-lines/:id", async (req, res) => {
  try {
    await pool.query("UPDATE production_lines SET is_active=false WHERE id=$1", [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/non-conformance-reports", async (_req, res) => {
  try {
    const result = await pool.query("SELECT * FROM non_conformance_reports WHERE is_active=true ORDER BY created_at DESC");
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/non-conformance-reports", async (req, res) => {
  try {
    const { ncr_number, source, severity, description, root_cause, corrective_action, preventive_action, affected_product_id, affected_order_id, responsible_id, due_date, cost_of_quality, notes } = req.body;
    const num = ncr_number || `NCR-${Date.now()}`;
    const result = await pool.query(
      `INSERT INTO non_conformance_reports (ncr_number, source, severity, description, root_cause, corrective_action, preventive_action, affected_product_id, affected_order_id, responsible_id, due_date, cost_of_quality, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [num, source || 'production', severity || 'minor', description, root_cause, corrective_action, preventive_action, affected_product_id, affected_order_id, responsible_id, due_date, cost_of_quality || 0, notes]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/non-conformance-reports/:id", async (req, res) => {
  try {
    const { status, root_cause, corrective_action, preventive_action, closed_date, cost_of_quality, notes } = req.body;
    const result = await pool.query(
      `UPDATE non_conformance_reports SET status=$1, root_cause=$2, corrective_action=$3, preventive_action=$4, closed_date=$5, cost_of_quality=$6, notes=$7, updated_at=NOW() WHERE id=$8 RETURNING *`,
      [status, root_cause, corrective_action, preventive_action, closed_date, cost_of_quality, notes, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/non-conformance-reports/:id", async (req, res) => {
  try {
    await pool.query("UPDATE non_conformance_reports SET is_active=false WHERE id=$1", [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/equipment", async (_req, res) => {
  try {
    const result = await pool.query("SELECT * FROM equipment WHERE is_active=true ORDER BY name");
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/equipment", async (req, res) => {
  try {
    const { asset_number, name, description, category, manufacturer, model, serial_number, purchase_date, purchase_price, current_value, useful_life_years, location, department, warranty_expiry, specifications, notes } = req.body;
    const num = asset_number || `EQ-${Date.now()}`;
    const result = await pool.query(
      `INSERT INTO equipment (asset_number, name, description, category, manufacturer, model, serial_number, purchase_date, purchase_price, current_value, useful_life_years, location, department, warranty_expiry, specifications, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [num, name, description, category || 'hand_tool', manufacturer, model, serial_number, purchase_date, purchase_price || 0, current_value || 0, useful_life_years || 10, location, department, warranty_expiry, specifications || {}, notes]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/equipment/:id", async (req, res) => {
  try {
    const { name, description, category, status, location, department, last_maintenance_date, next_maintenance_date, current_value, notes } = req.body;
    const result = await pool.query(
      `UPDATE equipment SET name=$1, description=$2, category=$3, status=$4, location=$5, department=$6, last_maintenance_date=$7, next_maintenance_date=$8, current_value=$9, notes=$10, updated_at=NOW() WHERE id=$11 RETURNING *`,
      [name, description, category, status, location, department, last_maintenance_date, next_maintenance_date, current_value, notes, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/equipment/:id", async (req, res) => {
  try {
    await pool.query("UPDATE equipment SET is_active=false WHERE id=$1", [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/procurement-approvals", async (_req, res) => {
  try {
    const result = await pool.query("SELECT * FROM procurement_approvals ORDER BY created_at DESC");
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/procurement-approvals", async (req, res) => {
  try {
    const { document_type, document_id, approval_step, approver_id, amount_threshold, comments } = req.body;
    const result = await pool.query(
      `INSERT INTO procurement_approvals (document_type, document_id, approval_step, approver_id, amount_threshold, comments)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [document_type, document_id, approval_step || 1, approver_id, amount_threshold || 0, comments]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
