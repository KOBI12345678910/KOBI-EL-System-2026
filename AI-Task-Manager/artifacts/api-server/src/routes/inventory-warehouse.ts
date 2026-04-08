import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS warehouses (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      code VARCHAR(10) UNIQUE,
      warehouse_type VARCHAR(50) DEFAULT 'main',
      address JSONB DEFAULT '{}',
      manager_id INTEGER,
      capacity DECIMAL(12,2) DEFAULT 0,
      current_utilization DECIMAL(5,2) DEFAULT 0,
      notes TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS warehouse_locations (
      id SERIAL PRIMARY KEY,
      warehouse_id INTEGER REFERENCES warehouses(id),
      location_code VARCHAR(20),
      zone VARCHAR(20),
      aisle VARCHAR(10),
      shelf VARCHAR(10),
      bin VARCHAR(10),
      max_weight DECIMAL(12,2),
      max_volume DECIMAL(12,2),
      is_occupied BOOLEAN DEFAULT false,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS raw_material_stock (
      id SERIAL PRIMARY KEY,
      material_id INTEGER,
      warehouse_id INTEGER REFERENCES warehouses(id),
      location_code VARCHAR(50),
      batch_number VARCHAR(50),
      lot_number VARCHAR(50),
      quantity DECIMAL(12,3) DEFAULT 0,
      reserved_quantity DECIMAL(12,3) DEFAULT 0,
      available_quantity DECIMAL(12,3) DEFAULT 0,
      unit_cost INTEGER DEFAULT 0,
      total_value INTEGER DEFAULT 0,
      received_date DATE,
      expiry_date DATE,
      supplier_id INTEGER,
      purchase_order_id INTEGER,
      quality_status VARCHAR(30) DEFAULT 'pending',
      certificate_of_conformity VARCHAR(500),
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS finished_goods_stock (
      id SERIAL PRIMARY KEY,
      product_id INTEGER,
      warehouse_id INTEGER REFERENCES warehouses(id),
      location_code VARCHAR(50),
      batch_number VARCHAR(50),
      serial_number VARCHAR(50),
      quantity DECIMAL(12,3) DEFAULT 0,
      reserved_quantity DECIMAL(12,3) DEFAULT 0,
      unit_cost INTEGER DEFAULT 0,
      production_date DATE,
      quality_status VARCHAR(30) DEFAULT 'pending',
      work_order_id INTEGER,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id SERIAL PRIMARY KEY,
      movement_type VARCHAR(50) NOT NULL,
      material_type VARCHAR(30) DEFAULT 'raw_material',
      material_id INTEGER,
      from_warehouse_id INTEGER,
      to_warehouse_id INTEGER,
      quantity DECIMAL(12,3) NOT NULL,
      unit_cost INTEGER DEFAULT 0,
      reference_type VARCHAR(50),
      reference_id INTEGER,
      batch_number VARCHAR(50),
      lot_number VARCHAR(50),
      reason TEXT,
      performed_by INTEGER,
      approved_by INTEGER,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS stock_counts (
      id SERIAL PRIMARY KEY,
      count_number VARCHAR(20) UNIQUE,
      count_type VARCHAR(20) DEFAULT 'full',
      warehouse_id INTEGER REFERENCES warehouses(id),
      count_date DATE DEFAULT CURRENT_DATE,
      status VARCHAR(20) DEFAULT 'planned',
      counted_by INTEGER,
      approved_by INTEGER,
      approved_at TIMESTAMP,
      total_items INTEGER DEFAULT 0,
      discrepancies INTEGER DEFAULT 0,
      adjustment_value INTEGER DEFAULT 0,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS stock_count_items (
      id SERIAL PRIMARY KEY,
      stock_count_id INTEGER REFERENCES stock_counts(id),
      material_id INTEGER,
      location_code VARCHAR(50),
      system_quantity DECIMAL(12,3) DEFAULT 0,
      counted_quantity DECIMAL(12,3) DEFAULT 0,
      variance DECIMAL(12,3) DEFAULT 0,
      variance_value INTEGER DEFAULT 0,
      adjustment_approved BOOLEAN DEFAULT false,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
}

export { ensureTables as ensureInventoryWarehouseTables };

/**
 * @openapi
 * /api/warehouses:
 *   get:
 *     tags: [Inventory & Warehouse]
 *     summary: רשימת מחסנים פעילים — List active warehouses
 *     description: מחזיר את כל המחסנים הפעילים במפעל, ממוינים לפי שם.
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: רשימת מחסנים
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: integer }
 *                   name: { type: string, example: "מחסן ראשי" }
 *                   code: { type: string, example: "WH-01" }
 *                   warehouse_type: { type: string, example: "raw_materials" }
 *                   capacity: { type: number }
 *                   is_active: { type: boolean }
 *       401: { description: "נדרשת התחברות" }
 */
router.get("/warehouses", async (_req, res) => {
  try {
    const result = await pool.query("SELECT * FROM warehouses WHERE is_active = true ORDER BY name");
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/warehouses", async (req, res) => {
  try {
    const { name, code, warehouse_type, address, manager_id, capacity, notes } = req.body;
    const result = await pool.query(
      `INSERT INTO warehouses (name, code, warehouse_type, address, manager_id, capacity, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [name, code, warehouse_type, address || {}, manager_id, capacity || 0, notes]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/warehouses/:id", async (req, res) => {
  try {
    const { name, code, warehouse_type, address, manager_id, capacity, notes } = req.body;
    const result = await pool.query(
      `UPDATE warehouses SET name=$1, code=$2, warehouse_type=$3, address=$4, manager_id=$5, capacity=$6, notes=$7, updated_at=NOW() WHERE id=$8 RETURNING *`,
      [name, code, warehouse_type, address, manager_id, capacity, notes, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/warehouses/:id", async (req, res) => {
  try {
    await pool.query("UPDATE warehouses SET is_active=false WHERE id=$1", [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/warehouse-locations", async (req, res) => {
  try {
    const wid = req.query.warehouse_id;
    const q = wid
      ? "SELECT * FROM warehouse_locations WHERE warehouse_id=$1 AND is_active=true ORDER BY location_code"
      : "SELECT * FROM warehouse_locations WHERE is_active=true ORDER BY location_code";
    const result = await pool.query(q, wid ? [wid] : []);
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/raw-material-stock", async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT rms.*, w.name as warehouse_name
      FROM raw_material_stock rms
      LEFT JOIN warehouses w ON w.id = rms.warehouse_id
      ORDER BY rms.created_at DESC
    `);
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/raw-material-stock", async (req, res) => {
  try {
    const { material_id, warehouse_id, location_code, batch_number, lot_number, quantity, unit_cost, received_date, expiry_date, supplier_id, purchase_order_id, quality_status, notes } = req.body;
    const available = quantity || 0;
    const total = (quantity || 0) * (unit_cost || 0);
    const result = await pool.query(
      `INSERT INTO raw_material_stock (material_id, warehouse_id, location_code, batch_number, lot_number, quantity, available_quantity, unit_cost, total_value, received_date, expiry_date, supplier_id, purchase_order_id, quality_status, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [material_id, warehouse_id, location_code, batch_number, lot_number, quantity || 0, available, unit_cost || 0, total, received_date, expiry_date, supplier_id, purchase_order_id, quality_status || 'pending', notes]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/finished-goods-stock", async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT fgs.*, w.name as warehouse_name
      FROM finished_goods_stock fgs
      LEFT JOIN warehouses w ON w.id = fgs.warehouse_id
      ORDER BY fgs.created_at DESC
    `);
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/finished-goods-stock", async (req, res) => {
  try {
    const { product_id, warehouse_id, location_code, batch_number, serial_number, quantity, unit_cost, production_date, quality_status, work_order_id, notes } = req.body;
    const result = await pool.query(
      `INSERT INTO finished_goods_stock (product_id, warehouse_id, location_code, batch_number, serial_number, quantity, unit_cost, production_date, quality_status, work_order_id, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [product_id, warehouse_id, location_code, batch_number, serial_number, quantity || 0, unit_cost || 0, production_date, quality_status || 'pending', work_order_id, notes]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/stock-movements", async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT sm.*,
        fw.name as from_warehouse_name,
        tw.name as to_warehouse_name
      FROM stock_movements sm
      LEFT JOIN warehouses fw ON fw.id = sm.from_warehouse_id
      LEFT JOIN warehouses tw ON tw.id = sm.to_warehouse_id
      ORDER BY sm.created_at DESC LIMIT 500
    `);
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/stock-movements", async (req, res) => {
  try {
    const { movement_type, material_type, material_id, from_warehouse_id, to_warehouse_id, quantity, unit_cost, reference_type, reference_id, batch_number, lot_number, reason, performed_by, notes } = req.body;
    const result = await pool.query(
      `INSERT INTO stock_movements (movement_type, material_type, material_id, from_warehouse_id, to_warehouse_id, quantity, unit_cost, reference_type, reference_id, batch_number, lot_number, reason, performed_by, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [movement_type, material_type, material_id, from_warehouse_id, to_warehouse_id, quantity, unit_cost || 0, reference_type, reference_id, batch_number, lot_number, reason, performed_by, notes]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/stock-counts", async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT sc.*, w.name as warehouse_name
      FROM stock_counts sc
      LEFT JOIN warehouses w ON w.id = sc.warehouse_id
      ORDER BY sc.created_at DESC
    `);
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/stock-counts", async (req, res) => {
  try {
    const { count_number, count_type, warehouse_id, count_date, counted_by, notes } = req.body;
    const num = count_number || `SC-${Date.now()}`;
    const result = await pool.query(
      `INSERT INTO stock_counts (count_number, count_type, warehouse_id, count_date, counted_by, notes)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [num, count_type || 'full', warehouse_id, count_date || new Date(), counted_by, notes]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/stock-count-items", async (req, res) => {
  try {
    const scid = req.query.stock_count_id;
    const result = await pool.query(
      "SELECT * FROM stock_count_items WHERE stock_count_id=$1 ORDER BY id",
      [scid]
    );
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
