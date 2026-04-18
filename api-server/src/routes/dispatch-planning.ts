import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dispatch_orders (
      id SERIAL PRIMARY KEY,
      dispatch_number VARCHAR(30) UNIQUE,
      vehicle_id INTEGER,
      vehicle_plate VARCHAR(20),
      driver VARCHAR(200),
      driver_phone VARCHAR(30),
      route TEXT,
      origin_location VARCHAR(200),
      destination_location VARCHAR(200),
      status VARCHAR(30) DEFAULT 'planning',
      priority VARCHAR(20) DEFAULT 'normal',
      departure_date TIMESTAMP,
      estimated_arrival TIMESTAMP,
      actual_departure TIMESTAMP,
      delivery_date TIMESTAMP,
      total_weight_kg NUMERIC(12,2) DEFAULT 0,
      total_items INTEGER DEFAULT 0,
      exception_notes TEXT,
      notes TEXT,
      created_by VARCHAR(200),
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS dispatch_items (
      id SERIAL PRIMARY KEY,
      dispatch_id INTEGER REFERENCES dispatch_orders(id),
      entity_type VARCHAR(30) DEFAULT 'sales_order',
      entity_id INTEGER,
      entity_number VARCHAR(50),
      description TEXT,
      qty NUMERIC(12,3) DEFAULT 1,
      weight_kg NUMERIC(12,2) DEFAULT 0,
      volume_m3 NUMERIC(12,4) DEFAULT 0,
      is_fragile BOOLEAN DEFAULT false,
      is_hazardous BOOLEAN DEFAULT false,
      loaded BOOLEAN DEFAULT false,
      loaded_at TIMESTAMP,
      loaded_by VARCHAR(200),
      sort_order INTEGER DEFAULT 0,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS loading_plans (
      id SERIAL PRIMARY KEY,
      dispatch_id INTEGER REFERENCES dispatch_orders(id),
      sequence INTEGER DEFAULT 1,
      package_desc VARCHAR(300),
      bay_position VARCHAR(50),
      weight_kg NUMERIC(12,2) DEFAULT 0,
      dimensions VARCHAR(100),
      special_instructions TEXT,
      is_loaded BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS delivery_evidence (
      id SERIAL PRIMARY KEY,
      dispatch_id INTEGER REFERENCES dispatch_orders(id),
      evidence_type VARCHAR(30) DEFAULT 'photo',
      photo_url TEXT,
      signature_url TEXT,
      receiver_name VARCHAR(200),
      receiver_id_number VARCHAR(30),
      condition_notes TEXT,
      gps_lat NUMERIC(10,7),
      gps_lng NUMERIC(10,7),
      notes TEXT,
      captured_at TIMESTAMP DEFAULT NOW(),
      captured_by VARCHAR(200)
    );
  `);
}

ensureTables().catch(console.error);

async function nextDispatchNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const r = await pool.query(`SELECT COUNT(*) as cnt FROM dispatch_orders WHERE EXTRACT(YEAR FROM created_at) = $1`, [year]);
  const seq = parseInt(r.rows[0]?.cnt || "0") + 1;
  return `DSP-${year}-${String(seq).padStart(5, "0")}`;
}

// ========== DISPATCH ORDERS CRUD ==========
router.get("/dispatch", async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT d.*,
        (SELECT COUNT(*) FROM dispatch_items di WHERE di.dispatch_id = d.id) as item_count,
        (SELECT COUNT(*) FROM dispatch_items di WHERE di.dispatch_id = d.id AND di.loaded = true) as loaded_count,
        (SELECT COUNT(*) FROM delivery_evidence de WHERE de.dispatch_id = d.id) as evidence_count
      FROM dispatch_orders d
      WHERE d.is_active = true
      ORDER BY d.created_at DESC
    `);
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/dispatch/:id", async (req, res) => {
  try {
    const order = await pool.query(`SELECT * FROM dispatch_orders WHERE id = $1`, [req.params.id]);
    if (!order.rows[0]) return res.status(404).json({ error: "הזמנת משלוח לא נמצאה" });
    const items = await pool.query(`SELECT * FROM dispatch_items WHERE dispatch_id = $1 ORDER BY sort_order, id`, [req.params.id]);
    const loadingPlan = await pool.query(`SELECT * FROM loading_plans WHERE dispatch_id = $1 ORDER BY sequence`, [req.params.id]);
    const evidence = await pool.query(`SELECT * FROM delivery_evidence WHERE dispatch_id = $1 ORDER BY captured_at DESC`, [req.params.id]);
    res.json({ ...order.rows[0], items: items.rows, loading_plan: loadingPlan.rows, evidence: evidence.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/dispatch", async (req, res) => {
  try {
    const num = await nextDispatchNumber();
    const { vehicle_id, vehicle_plate, driver, driver_phone, route, origin_location, destination_location,
      priority, departure_date, estimated_arrival, notes, created_by, items } = req.body;

    const result = await pool.query(`
      INSERT INTO dispatch_orders (dispatch_number, vehicle_id, vehicle_plate, driver, driver_phone, route,
        origin_location, destination_location, priority, departure_date, estimated_arrival, notes, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *
    `, [num, vehicle_id, vehicle_plate, driver, driver_phone, route, origin_location, destination_location,
      priority || 'normal', departure_date, estimated_arrival, notes, created_by]);

    const dispatch = result.rows[0];

    // Insert items if provided
    if (Array.isArray(items)) {
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        await pool.query(`
          INSERT INTO dispatch_items (dispatch_id, entity_type, entity_id, entity_number, description, qty, weight_kg, volume_m3, is_fragile, is_hazardous, sort_order, notes)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        `, [dispatch.id, it.entity_type || 'sales_order', it.entity_id, it.entity_number, it.description,
          it.qty || 1, it.weight_kg || 0, it.volume_m3 || 0, it.is_fragile || false, it.is_hazardous || false, i + 1, it.notes]);
      }
      // Update totals
      await pool.query(`
        UPDATE dispatch_orders SET total_items = $2,
          total_weight_kg = (SELECT COALESCE(SUM(weight_kg * qty), 0) FROM dispatch_items WHERE dispatch_id = $1)
        WHERE id = $1
      `, [dispatch.id, items.length]);
    }

    res.json(dispatch);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/dispatch/:id", async (req, res) => {
  try {
    const { vehicle_id, vehicle_plate, driver, driver_phone, route, origin_location, destination_location,
      priority, departure_date, estimated_arrival, notes } = req.body;
    const result = await pool.query(`
      UPDATE dispatch_orders SET vehicle_id=$2, vehicle_plate=$3, driver=$4, driver_phone=$5, route=$6,
        origin_location=$7, destination_location=$8, priority=$9, departure_date=$10, estimated_arrival=$11,
        notes=$12, updated_at=NOW()
      WHERE id=$1 RETURNING *
    `, [req.params.id, vehicle_id, vehicle_plate, driver, driver_phone, route, origin_location,
      destination_location, priority, departure_date, estimated_arrival, notes]);
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ========== LOAD ==========
router.post("/dispatch/:id/load", async (req, res) => {
  try {
    const { loaded_by } = req.body;
    // Mark all items as loaded
    await pool.query(`UPDATE dispatch_items SET loaded = true, loaded_at = NOW(), loaded_by = $2 WHERE dispatch_id = $1 AND loaded = false`,
      [req.params.id, loaded_by]);
    const result = await pool.query(`UPDATE dispatch_orders SET status = 'loaded', updated_at = NOW() WHERE id = $1 RETURNING *`, [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: "לא נמצא" });
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ========== DEPART ==========
router.post("/dispatch/:id/depart", async (req, res) => {
  try {
    const result = await pool.query(`
      UPDATE dispatch_orders SET status = 'in_transit', actual_departure = NOW(), updated_at = NOW()
      WHERE id = $1 RETURNING *
    `, [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: "לא נמצא" });
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ========== DELIVER ==========
router.post("/dispatch/:id/deliver", async (req, res) => {
  try {
    const result = await pool.query(`
      UPDATE dispatch_orders SET status = 'delivered', delivery_date = NOW(), updated_at = NOW()
      WHERE id = $1 RETURNING *
    `, [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: "לא נמצא" });
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ========== EXCEPTION ==========
router.post("/dispatch/:id/exception", async (req, res) => {
  try {
    const { exception_notes } = req.body;
    const result = await pool.query(`
      UPDATE dispatch_orders SET status = 'exception', exception_notes = $2, updated_at = NOW()
      WHERE id = $1 RETURNING *
    `, [req.params.id, exception_notes]);
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ========== EVIDENCE ==========
router.post("/dispatch/:id/evidence", async (req, res) => {
  try {
    const { evidence_type, photo_url, signature_url, receiver_name, receiver_id_number, condition_notes, gps_lat, gps_lng, notes, captured_by } = req.body;
    const result = await pool.query(`
      INSERT INTO delivery_evidence (dispatch_id, evidence_type, photo_url, signature_url, receiver_name, receiver_id_number,
        condition_notes, gps_lat, gps_lng, notes, captured_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *
    `, [req.params.id, evidence_type || 'photo', photo_url, signature_url, receiver_name, receiver_id_number,
      condition_notes, gps_lat, gps_lng, notes, captured_by]);
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/dispatch/:id/evidence", async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM delivery_evidence WHERE dispatch_id = $1 ORDER BY captured_at DESC`, [req.params.id]);
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ========== LOADING PLANS ==========
router.get("/dispatch/:id/loading-plan", async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM loading_plans WHERE dispatch_id = $1 ORDER BY sequence`, [req.params.id]);
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/dispatch/:id/loading-plan", async (req, res) => {
  try {
    const { sequence, package_desc, bay_position, weight_kg, dimensions, special_instructions } = req.body;
    const result = await pool.query(`
      INSERT INTO loading_plans (dispatch_id, sequence, package_desc, bay_position, weight_kg, dimensions, special_instructions)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
    `, [req.params.id, sequence || 1, package_desc, bay_position, weight_kg || 0, dimensions, special_instructions]);
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ========== DASHBOARD ==========
router.get("/dispatch/dashboard", async (_req, res) => {
  try {
    const stats = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'planning') as planning,
        COUNT(*) FILTER (WHERE status = 'loaded') as loaded,
        COUNT(*) FILTER (WHERE status = 'in_transit') as in_transit,
        COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
        COUNT(*) FILTER (WHERE status = 'exception') as exceptions,
        COALESCE(SUM(total_weight_kg), 0) as total_weight,
        COALESCE(SUM(total_items), 0) as total_items_all,
        COUNT(*) FILTER (WHERE departure_date::date = CURRENT_DATE) as today_departures,
        COUNT(*) FILTER (WHERE delivery_date::date = CURRENT_DATE) as today_deliveries
      FROM dispatch_orders WHERE is_active = true
    `);

    const recent = await pool.query(`
      SELECT id, dispatch_number, driver, route, status, departure_date, delivery_date, total_items, total_weight_kg
      FROM dispatch_orders WHERE is_active = true ORDER BY created_at DESC LIMIT 10
    `);

    const byStatus = await pool.query(`
      SELECT status, COUNT(*) as count FROM dispatch_orders WHERE is_active = true GROUP BY status ORDER BY count DESC
    `);

    res.json({
      ...stats.rows[0],
      recent: recent.rows,
      by_status: byStatus.rows,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ========== DISPATCH ITEMS ==========
router.post("/dispatch/:id/items", async (req, res) => {
  try {
    const { entity_type, entity_id, entity_number, description, qty, weight_kg, volume_m3, is_fragile, is_hazardous, notes } = req.body;
    const result = await pool.query(`
      INSERT INTO dispatch_items (dispatch_id, entity_type, entity_id, entity_number, description, qty, weight_kg, volume_m3, is_fragile, is_hazardous, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *
    `, [req.params.id, entity_type || 'sales_order', entity_id, entity_number, description, qty || 1, weight_kg || 0, volume_m3 || 0, is_fragile || false, is_hazardous || false, notes]);

    // Update totals
    await pool.query(`
      UPDATE dispatch_orders SET total_items = (SELECT COUNT(*) FROM dispatch_items WHERE dispatch_id = $1),
        total_weight_kg = (SELECT COALESCE(SUM(weight_kg * qty), 0) FROM dispatch_items WHERE dispatch_id = $1),
        updated_at = NOW()
      WHERE id = $1
    `, [req.params.id]);

    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/dispatch/items/:itemId/toggle-loaded", async (req, res) => {
  try {
    const { loaded_by } = req.body;
    const result = await pool.query(`
      UPDATE dispatch_items SET loaded = NOT loaded, loaded_at = CASE WHEN NOT loaded THEN NOW() ELSE NULL END,
        loaded_by = CASE WHEN NOT loaded THEN $2 ELSE NULL END
      WHERE id = $1 RETURNING *
    `, [req.params.itemId, loaded_by]);
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
