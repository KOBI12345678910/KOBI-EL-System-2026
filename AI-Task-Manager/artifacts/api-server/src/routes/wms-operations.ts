import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

async function ensureWmsTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wms_cycle_counts (
      id SERIAL PRIMARY KEY,
      count_number VARCHAR(30) UNIQUE NOT NULL,
      warehouse_id INTEGER,
      abc_class VARCHAR(5) DEFAULT 'C',
      count_type VARCHAR(30) DEFAULT 'cycle',
      scheduled_date DATE,
      completed_date DATE,
      status VARCHAR(30) DEFAULT 'planned',
      total_items INTEGER DEFAULT 0,
      counted_items INTEGER DEFAULT 0,
      variance_items INTEGER DEFAULT 0,
      variance_value NUMERIC(15,2) DEFAULT 0,
      accuracy_pct NUMERIC(5,2) DEFAULT 0,
      assigned_to VARCHAR(200),
      approved_by VARCHAR(200),
      approved_at TIMESTAMP,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS wms_cycle_count_items (
      id SERIAL PRIMARY KEY,
      cycle_count_id INTEGER REFERENCES wms_cycle_counts(id) ON DELETE CASCADE,
      inventory_item_id INTEGER,
      item_code VARCHAR(100),
      item_name VARCHAR(300),
      abc_class VARCHAR(5),
      location_code VARCHAR(50),
      system_qty NUMERIC(15,3) DEFAULT 0,
      counted_qty NUMERIC(15,3),
      variance NUMERIC(15,3) DEFAULT 0,
      variance_pct NUMERIC(8,4) DEFAULT 0,
      unit_cost NUMERIC(15,2) DEFAULT 0,
      variance_value NUMERIC(15,2) DEFAULT 0,
      investigation_required BOOLEAN DEFAULT false,
      investigation_notes TEXT,
      adjustment_approved BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS wms_pick_lists (
      id SERIAL PRIMARY KEY,
      pick_number VARCHAR(30) UNIQUE NOT NULL,
      wave_id INTEGER,
      picking_type VARCHAR(30) DEFAULT 'standard',
      warehouse_id INTEGER,
      zone VARCHAR(50),
      sales_order_ids JSONB DEFAULT '[]',
      status VARCHAR(30) DEFAULT 'draft',
      assigned_to VARCHAR(200),
      started_at TIMESTAMP,
      completed_at TIMESTAMP,
      total_lines INTEGER DEFAULT 0,
      picked_lines INTEGER DEFAULT 0,
      priority INTEGER DEFAULT 5,
      delivery_date DATE,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS wms_pick_list_lines (
      id SERIAL PRIMARY KEY,
      pick_list_id INTEGER REFERENCES wms_pick_lists(id) ON DELETE CASCADE,
      sales_order_id INTEGER,
      sales_order_line INTEGER,
      inventory_item_id INTEGER,
      item_code VARCHAR(100),
      item_name VARCHAR(300),
      location_code VARCHAR(50),
      zone VARCHAR(50),
      aisle VARCHAR(20),
      shelf VARCHAR(20),
      bin VARCHAR(20),
      quantity_required NUMERIC(15,3) NOT NULL,
      quantity_picked NUMERIC(15,3) DEFAULT 0,
      unit VARCHAR(30),
      status VARCHAR(30) DEFAULT 'pending',
      batch_number VARCHAR(50),
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS wms_pack_stations (
      id SERIAL PRIMARY KEY,
      pack_station_number VARCHAR(20) UNIQUE NOT NULL,
      warehouse_id INTEGER,
      pick_list_id INTEGER,
      sales_order_id INTEGER,
      status VARCHAR(30) DEFAULT 'open',
      operator VARCHAR(200),
      box_count INTEGER DEFAULT 0,
      total_weight NUMERIC(10,3),
      carrier VARCHAR(100),
      tracking_number VARCHAR(100),
      shipping_label_url TEXT,
      packed_at TIMESTAMP,
      shipped_at TIMESTAMP,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS wms_putaway_rules (
      id SERIAL PRIMARY KEY,
      rule_name VARCHAR(200) NOT NULL,
      priority INTEGER DEFAULT 10,
      is_active BOOLEAN DEFAULT true,
      condition_item_category VARCHAR(100),
      condition_abc_class VARCHAR(5),
      condition_min_weight NUMERIC(10,3),
      condition_max_weight NUMERIC(10,3),
      condition_temp_required VARCHAR(30),
      condition_hazmat BOOLEAN DEFAULT false,
      action_zone VARCHAR(50),
      action_aisle VARCHAR(20),
      action_shelf VARCHAR(20),
      action_bin VARCHAR(20),
      action_warehouse_id INTEGER,
      description TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS wms_transfer_orders (
      id SERIAL PRIMARY KEY,
      transfer_number VARCHAR(30) UNIQUE NOT NULL,
      from_warehouse_id INTEGER,
      to_warehouse_id INTEGER,
      status VARCHAR(30) DEFAULT 'draft',
      requested_by VARCHAR(200),
      approved_by VARCHAR(200),
      approved_at TIMESTAMP,
      expected_arrival DATE,
      shipped_at TIMESTAMP,
      received_at TIMESTAMP,
      total_lines INTEGER DEFAULT 0,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS wms_transfer_order_lines (
      id SERIAL PRIMARY KEY,
      transfer_order_id INTEGER REFERENCES wms_transfer_orders(id) ON DELETE CASCADE,
      inventory_item_id INTEGER,
      item_code VARCHAR(100),
      item_name VARCHAR(300),
      quantity_requested NUMERIC(15,3) NOT NULL,
      quantity_shipped NUMERIC(15,3) DEFAULT 0,
      quantity_received NUMERIC(15,3) DEFAULT 0,
      unit VARCHAR(30),
      unit_cost NUMERIC(15,2),
      batch_number VARCHAR(50),
      variance_notes TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS wms_kits (
      id SERIAL PRIMARY KEY,
      kit_code VARCHAR(100) UNIQUE NOT NULL,
      kit_name VARCHAR(300) NOT NULL,
      description TEXT,
      unit VARCHAR(30) DEFAULT 'יח''',
      selling_price NUMERIC(15,2) DEFAULT 0,
      is_active BOOLEAN DEFAULT true,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS wms_kit_components (
      id SERIAL PRIMARY KEY,
      kit_id INTEGER REFERENCES wms_kits(id) ON DELETE CASCADE,
      inventory_item_id INTEGER,
      item_code VARCHAR(100),
      item_name VARCHAR(300),
      quantity NUMERIC(15,3) NOT NULL,
      unit VARCHAR(30),
      unit_cost NUMERIC(15,2) DEFAULT 0,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS wms_consignment_stock (
      id SERIAL PRIMARY KEY,
      supplier_id INTEGER,
      supplier_name VARCHAR(300),
      inventory_item_id INTEGER,
      item_code VARCHAR(100),
      item_name VARCHAR(300),
      warehouse_id INTEGER,
      location_code VARCHAR(50),
      quantity_on_hand NUMERIC(15,3) DEFAULT 0,
      quantity_consumed NUMERIC(15,3) DEFAULT 0,
      quantity_returned NUMERIC(15,3) DEFAULT 0,
      unit_cost NUMERIC(15,2) DEFAULT 0,
      currency VARCHAR(10) DEFAULT 'ILS',
      consignment_date DATE,
      expiry_date DATE,
      status VARCHAR(30) DEFAULT 'active',
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS wms_consignment_transactions (
      id SERIAL PRIMARY KEY,
      consignment_stock_id INTEGER REFERENCES wms_consignment_stock(id),
      transaction_type VARCHAR(30) NOT NULL,
      quantity NUMERIC(15,3) NOT NULL,
      unit_cost NUMERIC(15,2),
      sales_order_id INTEGER,
      reference_number VARCHAR(100),
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS wms_cross_dock_rules (
      id SERIAL PRIMARY KEY,
      rule_name VARCHAR(200) NOT NULL,
      priority INTEGER DEFAULT 10,
      is_active BOOLEAN DEFAULT true,
      condition_type VARCHAR(30) DEFAULT 'item',
      condition_item_id INTEGER,
      condition_category VARCHAR(100),
      condition_velocity VARCHAR(20),
      staging_location VARCHAR(100),
      max_dwell_hours INTEGER DEFAULT 24,
      auto_route BOOLEAN DEFAULT true,
      description TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS wms_cross_dock_events (
      id SERIAL PRIMARY KEY,
      rule_id INTEGER REFERENCES wms_cross_dock_rules(id),
      goods_receipt_id INTEGER,
      inventory_item_id INTEGER,
      item_code VARCHAR(100),
      item_name VARCHAR(300),
      quantity NUMERIC(15,3),
      received_at TIMESTAMP DEFAULT NOW(),
      staged_at TIMESTAMP,
      shipped_at TIMESTAMP,
      status VARCHAR(30) DEFAULT 'received',
      destination_dock VARCHAR(50),
      sales_order_id INTEGER,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
}

ensureWmsTables().catch(console.error);

// ============================
// CYCLE COUNTING
// ============================

router.get("/wms/cycle-counts", async (req, res) => {
  try {
    const { status, warehouse_id, abc_class } = req.query;
    let q = `SELECT cc.*, w.name as warehouse_name FROM wms_cycle_counts cc LEFT JOIN warehouses w ON w.id = cc.warehouse_id WHERE 1=1`;
    const params: any[] = [];
    if (status) { params.push(status); q += ` AND cc.status = $${params.length}`; }
    if (warehouse_id) { params.push(warehouse_id); q += ` AND cc.warehouse_id = $${params.length}`; }
    if (abc_class) { params.push(abc_class); q += ` AND cc.abc_class = $${params.length}`; }
    q += " ORDER BY cc.created_at DESC LIMIT 500";
    const result = await pool.query(q, params);
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/wms/cycle-counts", async (req, res) => {
  try {
    const { warehouse_id, abc_class, count_type, scheduled_date, assigned_to, notes } = req.body;
    const num = `CC-${Date.now()}`;
    const result = await pool.query(
      `INSERT INTO wms_cycle_counts (count_number, warehouse_id, abc_class, count_type, scheduled_date, assigned_to, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [num, warehouse_id, abc_class || 'C', count_type || 'cycle', scheduled_date, assigned_to, notes]
    );
    res.status(201).json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/wms/cycle-counts/:id", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM wms_cycle_counts WHERE id=$1", [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: "Not found" });
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/wms/cycle-counts/:id", async (req, res) => {
  try {
    const { status, completed_date, counted_items, variance_items, variance_value, accuracy_pct, approved_by, notes } = req.body;
    const result = await pool.query(
      `UPDATE wms_cycle_counts SET status=COALESCE($1,status), completed_date=COALESCE($2,completed_date),
       counted_items=COALESCE($3,counted_items), variance_items=COALESCE($4,variance_items),
       variance_value=COALESCE($5,variance_value), accuracy_pct=COALESCE($6,accuracy_pct),
       approved_by=COALESCE($7,approved_by), notes=COALESCE($8,notes), updated_at=NOW()
       WHERE id=$9 RETURNING *`,
      [status, completed_date, counted_items, variance_items, variance_value, accuracy_pct, approved_by, notes, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/wms/cycle-counts/:id/items", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM wms_cycle_count_items WHERE cycle_count_id=$1 ORDER BY id", [req.params.id]);
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/wms/cycle-counts/:id/items", async (req, res) => {
  try {
    const { inventory_item_id, item_code, item_name, abc_class, location_code, system_qty, counted_qty, unit_cost } = req.body;
    const variance = (counted_qty ?? 0) - (system_qty ?? 0);
    const variance_value = variance * (unit_cost || 0);
    const variance_pct = system_qty ? (Math.abs(variance) / system_qty) * 100 : 0;
    const investigation_required = Math.abs(variance_pct) > 5;
    const result = await pool.query(
      `INSERT INTO wms_cycle_count_items (cycle_count_id, inventory_item_id, item_code, item_name, abc_class, location_code, system_qty, counted_qty, variance, variance_pct, unit_cost, variance_value, investigation_required)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [req.params.id, inventory_item_id, item_code, item_name, abc_class, location_code, system_qty, counted_qty, variance, variance_pct, unit_cost, variance_value, investigation_required]
    );
    res.status(201).json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/wms/cycle-counts/:id/approve", async (req, res) => {
  try {
    const { approved_by } = req.body;
    const result = await pool.query(
      `UPDATE wms_cycle_counts SET status='approved', approved_by=$1, approved_at=NOW(), updated_at=NOW() WHERE id=$2 RETURNING *`,
      [approved_by, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ABC classification endpoint
router.get("/wms/abc-classification", async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        i.id, i.item_code, i.name, i.category,
        COALESCE(i.quantity_on_hand,0)::numeric as qty_on_hand,
        COALESCE(i.cost_price,0)::numeric as unit_cost,
        (COALESCE(i.quantity_on_hand,0) * COALESCE(i.cost_price,0))::numeric as stock_value,
        CASE 
          WHEN (COALESCE(i.quantity_on_hand,0) * COALESCE(i.cost_price,0)) > 10000 THEN 'A'
          WHEN (COALESCE(i.quantity_on_hand,0) * COALESCE(i.cost_price,0)) > 2000 THEN 'B'
          ELSE 'C'
        END as abc_class
      FROM inventory i
      WHERE COALESCE(i.is_active, true) = true
      ORDER BY stock_value DESC
      LIMIT 500
    `);
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ============================
// PICK / PACK / SHIP
// ============================

router.get("/wms/pick-lists", async (req, res) => {
  try {
    const { status, picking_type, warehouse_id } = req.query;
    let q = `SELECT pl.*, w.name as warehouse_name FROM wms_pick_lists pl LEFT JOIN warehouses w ON w.id = pl.warehouse_id WHERE 1=1`;
    const params: any[] = [];
    if (status) { params.push(status); q += ` AND pl.status = $${params.length}`; }
    if (picking_type) { params.push(picking_type); q += ` AND pl.picking_type = $${params.length}`; }
    if (warehouse_id) { params.push(warehouse_id); q += ` AND pl.warehouse_id = $${params.length}`; }
    q += " ORDER BY pl.priority ASC, pl.created_at DESC LIMIT 500";
    const result = await pool.query(q, params);
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/wms/pick-lists", async (req, res) => {
  try {
    const { picking_type, warehouse_id, zone, sales_order_ids, assigned_to, priority, delivery_date, notes } = req.body;
    const num = `PL-${Date.now()}`;
    const result = await pool.query(
      `INSERT INTO wms_pick_lists (pick_number, picking_type, warehouse_id, zone, sales_order_ids, assigned_to, priority, delivery_date, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [num, picking_type || 'standard', warehouse_id, zone, JSON.stringify(sales_order_ids || []), assigned_to, priority || 5, delivery_date, notes]
    );
    res.status(201).json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/wms/pick-lists/:id", async (req, res) => {
  try {
    const [pl, lines] = await Promise.all([
      pool.query("SELECT * FROM wms_pick_lists WHERE id=$1", [req.params.id]),
      pool.query("SELECT * FROM wms_pick_list_lines WHERE pick_list_id=$1 ORDER BY zone, aisle, shelf", [req.params.id])
    ]);
    if (!pl.rows.length) return res.status(404).json({ error: "Not found" });
    res.json({ ...pl.rows[0], lines: lines.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/wms/pick-lists/:id", async (req, res) => {
  try {
    const { status, assigned_to, started_at, completed_at, picked_lines, notes } = req.body;
    const result = await pool.query(
      `UPDATE wms_pick_lists SET status=COALESCE($1,status), assigned_to=COALESCE($2,assigned_to),
       started_at=COALESCE($3,started_at), completed_at=COALESCE($4,completed_at),
       picked_lines=COALESCE($5,picked_lines), notes=COALESCE($6,notes), updated_at=NOW()
       WHERE id=$7 RETURNING *`,
      [status, assigned_to, started_at, completed_at, picked_lines, notes, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/wms/pick-lists/:id/lines", async (req, res) => {
  try {
    const { sales_order_id, inventory_item_id, item_code, item_name, location_code, zone, aisle, shelf, bin, quantity_required, unit } = req.body;
    const result = await pool.query(
      `INSERT INTO wms_pick_list_lines (pick_list_id, sales_order_id, inventory_item_id, item_code, item_name, location_code, zone, aisle, shelf, bin, quantity_required, unit)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [req.params.id, sales_order_id, inventory_item_id, item_code, item_name, location_code, zone, aisle, shelf, bin, quantity_required, unit]
    );
    await pool.query("UPDATE wms_pick_lists SET total_lines = (SELECT COUNT(*) FROM wms_pick_list_lines WHERE pick_list_id=$1) WHERE id=$1", [req.params.id]);
    res.status(201).json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/wms/pack-stations", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM wms_pack_stations ORDER BY created_at DESC LIMIT 500");
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/wms/pack-stations", async (req, res) => {
  try {
    const { warehouse_id, pick_list_id, sales_order_id, operator, carrier, notes } = req.body;
    const num = `PS-${Date.now()}`;
    const result = await pool.query(
      `INSERT INTO wms_pack_stations (pack_station_number, warehouse_id, pick_list_id, sales_order_id, operator, carrier, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [num, warehouse_id, pick_list_id, sales_order_id, operator, carrier, notes]
    );
    res.status(201).json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/wms/pack-stations/:id", async (req, res) => {
  try {
    const { status, box_count, total_weight, carrier, tracking_number, shipping_label_url, packed_at, shipped_at, notes } = req.body;
    const result = await pool.query(
      `UPDATE wms_pack_stations SET status=COALESCE($1,status), box_count=COALESCE($2,box_count),
       total_weight=COALESCE($3,total_weight), carrier=COALESCE($4,carrier), tracking_number=COALESCE($5,tracking_number),
       shipping_label_url=COALESCE($6,shipping_label_url), packed_at=COALESCE($7,packed_at),
       shipped_at=COALESCE($8,shipped_at), notes=COALESCE($9,notes), updated_at=NOW()
       WHERE id=$10 RETURNING *`,
      [status, box_count, total_weight, carrier, tracking_number, shipping_label_url, packed_at, shipped_at, notes, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ============================
// PUTAWAY RULES
// ============================

router.get("/wms/putaway-rules", async (_req, res) => {
  try {
    const result = await pool.query("SELECT * FROM wms_putaway_rules ORDER BY priority ASC, created_at DESC");
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/wms/putaway-rules", async (req, res) => {
  try {
    const { rule_name, priority, is_active, condition_item_category, condition_abc_class, condition_min_weight, condition_max_weight, condition_temp_required, condition_hazmat, action_zone, action_aisle, action_shelf, action_bin, action_warehouse_id, description } = req.body;
    const result = await pool.query(
      `INSERT INTO wms_putaway_rules (rule_name, priority, is_active, condition_item_category, condition_abc_class, condition_min_weight, condition_max_weight, condition_temp_required, condition_hazmat, action_zone, action_aisle, action_shelf, action_bin, action_warehouse_id, description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [rule_name, priority || 10, is_active !== false, condition_item_category, condition_abc_class, condition_min_weight, condition_max_weight, condition_temp_required, condition_hazmat || false, action_zone, action_aisle, action_shelf, action_bin, action_warehouse_id, description]
    );
    res.status(201).json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/wms/putaway-rules/:id", async (req, res) => {
  try {
    const { rule_name, priority, is_active, condition_item_category, condition_abc_class, condition_min_weight, condition_max_weight, condition_temp_required, condition_hazmat, action_zone, action_aisle, action_shelf, action_bin, action_warehouse_id, description } = req.body;
    const result = await pool.query(
      `UPDATE wms_putaway_rules SET rule_name=COALESCE($1,rule_name), priority=COALESCE($2,priority), is_active=COALESCE($3,is_active),
       condition_item_category=COALESCE($4,condition_item_category), condition_abc_class=COALESCE($5,condition_abc_class),
       condition_min_weight=COALESCE($6,condition_min_weight), condition_max_weight=COALESCE($7,condition_max_weight),
       condition_temp_required=COALESCE($8,condition_temp_required), condition_hazmat=COALESCE($9,condition_hazmat),
       action_zone=COALESCE($10,action_zone), action_aisle=COALESCE($11,action_aisle), action_shelf=COALESCE($12,action_shelf),
       action_bin=COALESCE($13,action_bin), action_warehouse_id=COALESCE($14,action_warehouse_id),
       description=COALESCE($15,description), updated_at=NOW()
       WHERE id=$16 RETURNING *`,
      [rule_name, priority, is_active, condition_item_category, condition_abc_class, condition_min_weight, condition_max_weight, condition_temp_required, condition_hazmat, action_zone, action_aisle, action_shelf, action_bin, action_warehouse_id, description, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/wms/putaway-rules/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM wms_putaway_rules WHERE id=$1", [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/wms/putaway-rules/suggest", async (req, res) => {
  try {
    const { category, abc_class, weight, temp_required, hazmat } = req.body;
    const result = await pool.query(
      `SELECT * FROM wms_putaway_rules WHERE is_active=true
       AND (condition_item_category IS NULL OR condition_item_category = $1)
       AND (condition_abc_class IS NULL OR condition_abc_class = $2)
       AND (condition_min_weight IS NULL OR $3::numeric >= condition_min_weight)
       AND (condition_max_weight IS NULL OR $3::numeric <= condition_max_weight)
       AND (condition_temp_required IS NULL OR condition_temp_required = $4)
       AND (condition_hazmat IS NULL OR condition_hazmat = $5)
       ORDER BY priority ASC LIMIT 1`,
      [category, abc_class, weight || 0, temp_required, hazmat || false]
    );
    if (result.rows.length) {
      const rule = result.rows[0];
      res.json({ suggested: true, rule, location: { zone: rule.action_zone, aisle: rule.action_aisle, shelf: rule.action_shelf, bin: rule.action_bin } });
    } else {
      res.json({ suggested: false, location: null });
    }
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ============================
// STOCK TRANSFERS (inter-warehouse)
// ============================

router.get("/wms/transfer-orders", async (req, res) => {
  try {
    const { status } = req.query;
    let q = `SELECT to2.*, fw.name as from_warehouse_name, tw.name as to_warehouse_name
             FROM wms_transfer_orders to2
             LEFT JOIN warehouses fw ON fw.id = to2.from_warehouse_id
             LEFT JOIN warehouses tw ON tw.id = to2.to_warehouse_id
             WHERE 1=1`;
    const params: any[] = [];
    if (status) { params.push(status); q += ` AND to2.status = $${params.length}`; }
    q += " ORDER BY to2.created_at DESC LIMIT 500";
    const result = await pool.query(q, params);
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/wms/transfer-orders", async (req, res) => {
  try {
    const { from_warehouse_id, to_warehouse_id, expected_arrival, requested_by, notes, lines } = req.body;
    const num = `TR-${Date.now()}`;
    const toResult = await pool.query(
      `INSERT INTO wms_transfer_orders (transfer_number, from_warehouse_id, to_warehouse_id, expected_arrival, requested_by, notes, total_lines)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [num, from_warehouse_id, to_warehouse_id, expected_arrival, requested_by, notes, (lines || []).length]
    );
    const order = toResult.rows[0];
    if (lines && lines.length > 0) {
      for (const line of lines) {
        await pool.query(
          `INSERT INTO wms_transfer_order_lines (transfer_order_id, inventory_item_id, item_code, item_name, quantity_requested, unit, unit_cost, batch_number)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [order.id, line.inventory_item_id, line.item_code, line.item_name, line.quantity_requested, line.unit, line.unit_cost, line.batch_number]
        );
      }
    }
    res.status(201).json(order);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/wms/transfer-orders/:id", async (req, res) => {
  try {
    const [order, lines] = await Promise.all([
      pool.query(`SELECT to2.*, fw.name as from_warehouse_name, tw.name as to_warehouse_name FROM wms_transfer_orders to2 LEFT JOIN warehouses fw ON fw.id=to2.from_warehouse_id LEFT JOIN warehouses tw ON tw.id=to2.to_warehouse_id WHERE to2.id=$1`, [req.params.id]),
      pool.query("SELECT * FROM wms_transfer_order_lines WHERE transfer_order_id=$1 ORDER BY id", [req.params.id])
    ]);
    if (!order.rows.length) return res.status(404).json({ error: "Not found" });
    res.json({ ...order.rows[0], lines: lines.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/wms/transfer-orders/:id", async (req, res) => {
  try {
    const { status, approved_by, expected_arrival, shipped_at, received_at, notes } = req.body;
    const result = await pool.query(
      `UPDATE wms_transfer_orders SET status=COALESCE($1,status), approved_by=COALESCE($2,approved_by),
       expected_arrival=COALESCE($3,expected_arrival), shipped_at=COALESCE($4,shipped_at),
       received_at=COALESCE($5,received_at), notes=COALESCE($6,notes),
       approved_at=CASE WHEN $2 IS NOT NULL THEN NOW() ELSE approved_at END, updated_at=NOW()
       WHERE id=$7 RETURNING *`,
      [status, approved_by, expected_arrival, shipped_at, received_at, notes, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ============================
// KITS / ASSEMBLY
// ============================

router.get("/wms/kits", async (_req, res) => {
  try {
    const result = await pool.query("SELECT * FROM wms_kits ORDER BY kit_name");
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/wms/kits", async (req, res) => {
  try {
    const { kit_code, kit_name, description, unit, selling_price, notes, components } = req.body;
    const kitResult = await pool.query(
      `INSERT INTO wms_kits (kit_code, kit_name, description, unit, selling_price, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [kit_code, kit_name, description, unit, selling_price || 0, notes]
    );
    const kit = kitResult.rows[0];
    if (components && components.length > 0) {
      for (const comp of components) {
        await pool.query(
          `INSERT INTO wms_kit_components (kit_id, inventory_item_id, item_code, item_name, quantity, unit, unit_cost) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [kit.id, comp.inventory_item_id, comp.item_code, comp.item_name, comp.quantity, comp.unit, comp.unit_cost || 0]
        );
      }
    }
    res.status(201).json(kit);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/wms/kits/:id", async (req, res) => {
  try {
    const [kit, components] = await Promise.all([
      pool.query("SELECT * FROM wms_kits WHERE id=$1", [req.params.id]),
      pool.query("SELECT * FROM wms_kit_components WHERE kit_id=$1 ORDER BY id", [req.params.id])
    ]);
    if (!kit.rows.length) return res.status(404).json({ error: "Not found" });
    res.json({ ...kit.rows[0], components: components.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/wms/kits/:id", async (req, res) => {
  try {
    const { kit_name, description, unit, selling_price, is_active, notes } = req.body;
    const result = await pool.query(
      `UPDATE wms_kits SET kit_name=COALESCE($1,kit_name), description=COALESCE($2,description),
       unit=COALESCE($3,unit), selling_price=COALESCE($4,selling_price), is_active=COALESCE($5,is_active),
       notes=COALESCE($6,notes), updated_at=NOW() WHERE id=$7 RETURNING *`,
      [kit_name, description, unit, selling_price, is_active, notes, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/wms/kits/:id/availability", async (req, res) => {
  try {
    const components = await pool.query("SELECT * FROM wms_kit_components WHERE kit_id=$1", [req.params.id]);
    if (!components.rows.length) return res.json({ available_qty: 0, components: [] });
    const availabilityList = [];
    let maxKits = Infinity;
    for (const comp of components.rows) {
      const stock = await pool.query("SELECT COALESCE(quantity_on_hand,0)::numeric as qty FROM inventory WHERE id=$1", [comp.inventory_item_id]);
      const qty = stock.rows.length ? parseFloat(stock.rows[0].qty) : 0;
      const canMake = comp.quantity > 0 ? Math.floor(qty / comp.quantity) : 0;
      if (canMake < maxKits) maxKits = canMake;
      availabilityList.push({ ...comp, stock_qty: qty, can_make: canMake });
    }
    res.json({ available_qty: maxKits === Infinity ? 0 : maxKits, components: availabilityList });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ============================
// CONSIGNMENT
// ============================

router.get("/wms/consignment-stock", async (req, res) => {
  try {
    const { supplier_id, status } = req.query;
    let q = "SELECT cs.*, w.name as warehouse_name FROM wms_consignment_stock cs LEFT JOIN warehouses w ON w.id=cs.warehouse_id WHERE 1=1";
    const params: any[] = [];
    if (supplier_id) { params.push(supplier_id); q += ` AND cs.supplier_id = $${params.length}`; }
    if (status) { params.push(status); q += ` AND cs.status = $${params.length}`; }
    q += " ORDER BY cs.created_at DESC LIMIT 500";
    const result = await pool.query(q, params);
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/wms/consignment-stock", async (req, res) => {
  try {
    const { supplier_id, supplier_name, inventory_item_id, item_code, item_name, warehouse_id, location_code, quantity_on_hand, unit_cost, currency, consignment_date, expiry_date, notes } = req.body;
    const result = await pool.query(
      `INSERT INTO wms_consignment_stock (supplier_id, supplier_name, inventory_item_id, item_code, item_name, warehouse_id, location_code, quantity_on_hand, unit_cost, currency, consignment_date, expiry_date, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [supplier_id, supplier_name, inventory_item_id, item_code, item_name, warehouse_id, location_code, quantity_on_hand || 0, unit_cost || 0, currency || 'ILS', consignment_date, expiry_date, notes]
    );
    res.status(201).json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/wms/consignment-stock/:id", async (req, res) => {
  try {
    const { quantity_on_hand, quantity_consumed, quantity_returned, status, notes } = req.body;
    const result = await pool.query(
      `UPDATE wms_consignment_stock SET quantity_on_hand=COALESCE($1,quantity_on_hand), quantity_consumed=COALESCE($2,quantity_consumed),
       quantity_returned=COALESCE($3,quantity_returned), status=COALESCE($4,status), notes=COALESCE($5,notes), updated_at=NOW()
       WHERE id=$6 RETURNING *`,
      [quantity_on_hand, quantity_consumed, quantity_returned, status, notes, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/wms/consignment-stock/:id/consume", async (req, res) => {
  try {
    const { quantity, sales_order_id, reference_number, notes } = req.body;
    const stock = await pool.query("SELECT * FROM wms_consignment_stock WHERE id=$1", [req.params.id]);
    if (!stock.rows.length) return res.status(404).json({ error: "Not found" });
    const s = stock.rows[0];
    const newOnHand = parseFloat(s.quantity_on_hand) - quantity;
    const newConsumed = parseFloat(s.quantity_consumed) + quantity;
    await pool.query(
      `UPDATE wms_consignment_stock SET quantity_on_hand=$1, quantity_consumed=$2, updated_at=NOW() WHERE id=$3`,
      [newOnHand, newConsumed, req.params.id]
    );
    const txn = await pool.query(
      `INSERT INTO wms_consignment_transactions (consignment_stock_id, transaction_type, quantity, unit_cost, sales_order_id, reference_number, notes)
       VALUES ($1,'consume',$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.id, quantity, s.unit_cost, sales_order_id, reference_number, notes]
    );
    res.json(txn.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/wms/consignment-transactions", async (req, res) => {
  try {
    const { consignment_stock_id } = req.query;
    let q = "SELECT * FROM wms_consignment_transactions WHERE 1=1";
    const params: any[] = [];
    if (consignment_stock_id) { params.push(consignment_stock_id); q += ` AND consignment_stock_id = $${params.length}`; }
    q += " ORDER BY created_at DESC LIMIT 500";
    const result = await pool.query(q, params);
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ============================
// CROSS-DOCKING
// ============================

router.get("/wms/cross-dock-rules", async (_req, res) => {
  try {
    const result = await pool.query("SELECT * FROM wms_cross_dock_rules ORDER BY priority ASC, created_at DESC");
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/wms/cross-dock-rules", async (req, res) => {
  try {
    const { rule_name, priority, is_active, condition_type, condition_item_id, condition_category, condition_velocity, staging_location, max_dwell_hours, auto_route, description } = req.body;
    const result = await pool.query(
      `INSERT INTO wms_cross_dock_rules (rule_name, priority, is_active, condition_type, condition_item_id, condition_category, condition_velocity, staging_location, max_dwell_hours, auto_route, description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [rule_name, priority || 10, is_active !== false, condition_type || 'item', condition_item_id, condition_category, condition_velocity, staging_location, max_dwell_hours || 24, auto_route !== false, description]
    );
    res.status(201).json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/wms/cross-dock-rules/:id", async (req, res) => {
  try {
    const { rule_name, priority, is_active, staging_location, max_dwell_hours, auto_route, description } = req.body;
    const result = await pool.query(
      `UPDATE wms_cross_dock_rules SET rule_name=COALESCE($1,rule_name), priority=COALESCE($2,priority),
       is_active=COALESCE($3,is_active), staging_location=COALESCE($4,staging_location),
       max_dwell_hours=COALESCE($5,max_dwell_hours), auto_route=COALESCE($6,auto_route),
       description=COALESCE($7,description), updated_at=NOW() WHERE id=$8 RETURNING *`,
      [rule_name, priority, is_active, staging_location, max_dwell_hours, auto_route, description, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/wms/cross-dock-rules/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM wms_cross_dock_rules WHERE id=$1", [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/wms/cross-dock-events", async (req, res) => {
  try {
    const { status } = req.query;
    let q = "SELECT * FROM wms_cross_dock_events WHERE 1=1";
    const params: any[] = [];
    if (status) { params.push(status); q += ` AND status = $${params.length}`; }
    q += " ORDER BY created_at DESC LIMIT 500";
    const result = await pool.query(q, params);
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/wms/cross-dock-events", async (req, res) => {
  try {
    const { rule_id, goods_receipt_id, inventory_item_id, item_code, item_name, quantity, destination_dock, sales_order_id, notes } = req.body;
    const result = await pool.query(
      `INSERT INTO wms_cross_dock_events (rule_id, goods_receipt_id, inventory_item_id, item_code, item_name, quantity, destination_dock, sales_order_id, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [rule_id, goods_receipt_id, inventory_item_id, item_code, item_name, quantity, destination_dock, sales_order_id, notes]
    );
    res.status(201).json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/wms/cross-dock-events/:id", async (req, res) => {
  try {
    const { status, staged_at, shipped_at, destination_dock, notes } = req.body;
    const result = await pool.query(
      `UPDATE wms_cross_dock_events SET status=COALESCE($1,status), staged_at=COALESCE($2,staged_at),
       shipped_at=COALESCE($3,shipped_at), destination_dock=COALESCE($4,destination_dock), notes=COALESCE($5,notes)
       WHERE id=$6 RETURNING *`,
      [status, staged_at, shipped_at, destination_dock, notes, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// WMS Dashboard stats
router.get("/wms/dashboard", async (_req, res) => {
  try {
    const [cycleCounts, pickLists, transfers, kits, consignment, crossDock] = await Promise.all([
      pool.query("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='planned') as planned, COUNT(*) FILTER (WHERE status='in_progress') as in_progress FROM wms_cycle_counts"),
      pool.query("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='draft') as draft, COUNT(*) FILTER (WHERE status='in_progress') as in_progress FROM wms_pick_lists"),
      pool.query("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='in_transit') as in_transit FROM wms_transfer_orders"),
      pool.query("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_active=true) as active FROM wms_kits"),
      pool.query("SELECT COUNT(*) as total, COALESCE(SUM(quantity_on_hand * unit_cost),0)::numeric as value FROM wms_consignment_stock WHERE status='active'"),
      pool.query("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='received') as pending FROM wms_cross_dock_events")
    ]);
    res.json({
      cycleCounts: cycleCounts.rows[0],
      pickLists: pickLists.rows[0],
      transfers: transfers.rows[0],
      kits: kits.rows[0],
      consignment: consignment.rows[0],
      crossDock: crossDock.rows[0]
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
