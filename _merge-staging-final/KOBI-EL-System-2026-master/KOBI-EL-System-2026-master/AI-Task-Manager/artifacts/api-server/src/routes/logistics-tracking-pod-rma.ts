import { Router } from "express";
import { pool } from "@workspace/db";
import { randomBytes } from "crypto";

const router = Router();

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS delivery_tracking (
      id SERIAL PRIMARY KEY,
      delivery_id INTEGER,
      vehicle_id INTEGER,
      driver_id INTEGER,
      driver_name VARCHAR(200),
      driver_phone VARCHAR(50),
      current_lat DECIMAL(10,7),
      current_lng DECIMAL(10,7),
      current_speed DECIMAL(6,2) DEFAULT 0,
      last_updated TIMESTAMP DEFAULT NOW(),
      estimated_arrival TIMESTAMP,
      status VARCHAR(50) DEFAULT 'dispatched',
      tracking_token VARCHAR(64) UNIQUE,
      route_distance_km DECIMAL(10,2),
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tracking_events (
      id SERIAL PRIMARY KEY,
      delivery_id INTEGER,
      event_type VARCHAR(50),
      lat DECIMAL(10,7),
      lng DECIMAL(10,7),
      timestamp TIMESTAMP DEFAULT NOW(),
      description TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS customer_notifications (
      id SERIAL PRIMARY KEY,
      delivery_id INTEGER,
      channel VARCHAR(20) DEFAULT 'email',
      message_type VARCHAR(50),
      recipient VARCHAR(200),
      sent_at TIMESTAMP DEFAULT NOW(),
      status VARCHAR(20) DEFAULT 'sent',
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS proof_of_delivery (
      id SERIAL PRIMARY KEY,
      delivery_id INTEGER,
      delivery_note_id INTEGER,
      signature_data TEXT,
      photo_urls JSONB DEFAULT '[]',
      gps_lat DECIMAL(10,7),
      gps_lng DECIMAL(10,7),
      captured_at TIMESTAMP DEFAULT NOW(),
      captured_by INTEGER,
      captured_by_name VARCHAR(200),
      receiver_name VARCHAR(200),
      notes TEXT,
      is_verified BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS return_merchandise_authorizations (
      id SERIAL PRIMARY KEY,
      rma_number VARCHAR(30) UNIQUE,
      original_order_id INTEGER,
      customer_id INTEGER,
      request_date DATE DEFAULT CURRENT_DATE,
      reason_code VARCHAR(50) DEFAULT 'defective',
      reason_description TEXT,
      status VARCHAR(30) DEFAULT 'requested',
      authorized_by INTEGER,
      authorized_by_name VARCHAR(200),
      authorization_date DATE,
      notes TEXT,
      is_active BOOLEAN DEFAULT true,
      created_by INTEGER,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS rma_items (
      id SERIAL PRIMARY KEY,
      rma_id INTEGER REFERENCES return_merchandise_authorizations(id) ON DELETE CASCADE,
      product_id INTEGER,
      product_name VARCHAR(300),
      quantity DECIMAL(12,3) DEFAULT 1,
      condition VARCHAR(50) DEFAULT 'unknown',
      inspection_result VARCHAR(20),
      resolution_type VARCHAR(20) DEFAULT 'refund',
      resolution_status VARCHAR(30) DEFAULT 'pending',
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS rma_shipments (
      id SERIAL PRIMARY KEY,
      rma_id INTEGER REFERENCES return_merchandise_authorizations(id) ON DELETE CASCADE,
      carrier VARCHAR(100),
      tracking_number VARCHAR(100),
      ship_date DATE,
      received_date DATE,
      inspected_by INTEGER,
      inspected_by_name VARCHAR(200),
      inspection_notes TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
}

export { ensureTables as ensureLogisticsTrackingTables };

function generateTrackingToken(): string {
  return randomBytes(32).toString("hex");
}

function generateRmaNumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const ms = now.getTime();
  return `RMA-${year}-${String(ms).slice(-6)}`;
}

router.get("/delivery-tracking", async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT dt.*, dn.delivery_number, c.company_name as customer_name
      FROM delivery_tracking dt
      LEFT JOIN delivery_notes dn ON dn.id = dt.delivery_id
      LEFT JOIN customers c ON c.id = dn.customer_id
      WHERE dt.is_active = true
      ORDER BY dt.updated_at DESC
    `);
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/delivery-tracking/token/:token", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT dt.*, dn.delivery_number, dn.delivery_address, dn.driver_name,
             c.company_name as customer_name
      FROM delivery_tracking dt
      LEFT JOIN delivery_notes dn ON dn.id = dt.delivery_id
      LEFT JOIN customers c ON c.id = dn.customer_id
      WHERE dt.tracking_token = $1 AND dt.is_active = true
    `, [req.params.token]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Tracking token not found" });

    const tracking = result.rows[0];
    const events = await pool.query(
      "SELECT * FROM tracking_events WHERE delivery_id = $1 ORDER BY timestamp DESC",
      [tracking.delivery_id]
    );
    res.json({ ...tracking, events: events.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/delivery-tracking", async (req, res) => {
  try {
    const { delivery_id, vehicle_id, driver_id, driver_name, driver_phone, current_lat, current_lng, estimated_arrival, route_distance_km } = req.body;
    const token = generateTrackingToken();
    const result = await pool.query(
      `INSERT INTO delivery_tracking (delivery_id, vehicle_id, driver_id, driver_name, driver_phone, current_lat, current_lng, estimated_arrival, tracking_token, route_distance_km)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [delivery_id, vehicle_id, driver_id, driver_name, driver_phone, current_lat, current_lng, estimated_arrival, token, route_distance_km]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/delivery-tracking/:id/position", async (req, res) => {
  try {
    const { current_lat, current_lng, current_speed, estimated_arrival, status } = req.body;
    const result = await pool.query(
      `UPDATE delivery_tracking SET current_lat=$1, current_lng=$2, current_speed=$3, estimated_arrival=$4, status=$5, last_updated=NOW(), updated_at=NOW() WHERE id=$6 RETURNING *`,
      [current_lat, current_lng, current_speed || 0, estimated_arrival, status || 'en_route', req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Not found" });

    await pool.query(
      `INSERT INTO tracking_events (delivery_id, event_type, lat, lng, description) VALUES ($1, 'position_update', $2, $3, $4)`,
      [result.rows[0].delivery_id, current_lat, current_lng, `מיקום עודכן - מהירות ${current_speed || 0} קמ"ש`]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/delivery-tracking/:id", async (req, res) => {
  try {
    const { status, estimated_arrival, notes } = req.body;
    const result = await pool.query(
      `UPDATE delivery_tracking SET status=$1, estimated_arrival=$2, updated_at=NOW() WHERE id=$3 RETURNING *`,
      [status, estimated_arrival, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/tracking-events/:delivery_id", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM tracking_events WHERE delivery_id=$1 ORDER BY timestamp DESC",
      [req.params.delivery_id]
    );
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/tracking-events", async (req, res) => {
  try {
    const { delivery_id, event_type, lat, lng, description } = req.body;
    const result = await pool.query(
      `INSERT INTO tracking_events (delivery_id, event_type, lat, lng, description) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [delivery_id, event_type, lat, lng, description]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/customer-notifications", async (req, res) => {
  try {
    const { delivery_id, channel, message_type, recipient } = req.body;
    const result = await pool.query(
      `INSERT INTO customer_notifications (delivery_id, channel, message_type, recipient) VALUES ($1,$2,$3,$4) RETURNING *`,
      [delivery_id, channel || 'email', message_type, recipient]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/customer-notifications/:delivery_id", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM customer_notifications WHERE delivery_id=$1 ORDER BY sent_at DESC",
      [req.params.delivery_id]
    );
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/proof-of-delivery", async (req, res) => {
  try {
    const { delivery_note_id } = req.query;
    const cond = delivery_note_id ? "WHERE pod.delivery_note_id=$1" : "";
    const params = delivery_note_id ? [delivery_note_id] : [];
    const result = await pool.query(
      `SELECT pod.* FROM proof_of_delivery pod ${cond} ORDER BY pod.captured_at DESC`,
      params
    );
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/proof-of-delivery/:id", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM proof_of_delivery WHERE id=$1", [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/proof-of-delivery", async (req, res) => {
  try {
    const { delivery_id, delivery_note_id, signature_data, photo_urls, gps_lat, gps_lng, captured_by, captured_by_name, receiver_name, notes } = req.body;
    const result = await pool.query(
      `INSERT INTO proof_of_delivery (delivery_id, delivery_note_id, signature_data, photo_urls, gps_lat, gps_lng, captured_by, captured_by_name, receiver_name, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [delivery_id, delivery_note_id, signature_data, JSON.stringify(photo_urls || []), gps_lat, gps_lng, captured_by, captured_by_name, receiver_name, notes]
    );
    if (delivery_note_id) {
      await pool.query(
        "UPDATE delivery_notes SET receiver_name=$1, receiver_signature=$2, status='delivered', updated_at=NOW() WHERE id=$3",
        [receiver_name, signature_data, delivery_note_id]
      );
    }
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/proof-of-delivery/:id/verify", async (req, res) => {
  try {
    const result = await pool.query(
      "UPDATE proof_of_delivery SET is_verified=true WHERE id=$1 RETURNING *",
      [req.params.id]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/rma", async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT rma.*, c.company_name as customer_name
      FROM return_merchandise_authorizations rma
      LEFT JOIN customers c ON c.id = rma.customer_id
      WHERE rma.is_active = true
      ORDER BY rma.created_at DESC
    `);
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/rma/:id", async (req, res) => {
  try {
    const rma = await pool.query("SELECT * FROM return_merchandise_authorizations WHERE id=$1", [req.params.id]);
    if (rma.rows.length === 0) return res.status(404).json({ error: "Not found" });
    const items = await pool.query("SELECT * FROM rma_items WHERE rma_id=$1", [req.params.id]);
    const shipments = await pool.query("SELECT * FROM rma_shipments WHERE rma_id=$1 ORDER BY created_at DESC", [req.params.id]);
    res.json({ ...rma.rows[0], items: items.rows, shipments: shipments.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/rma", async (req, res) => {
  try {
    const { original_order_id, customer_id, reason_code, reason_description, notes, created_by } = req.body;
    const rmaNumber = generateRmaNumber();
    const result = await pool.query(
      `INSERT INTO return_merchandise_authorizations (rma_number, original_order_id, customer_id, reason_code, reason_description, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [rmaNumber, original_order_id, customer_id, reason_code || 'defective', reason_description, notes, created_by]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/rma/:id", async (req, res) => {
  try {
    const { status, authorized_by, authorized_by_name, authorization_date, notes } = req.body;
    const result = await pool.query(
      `UPDATE return_merchandise_authorizations SET status=$1, authorized_by=$2, authorized_by_name=$3, authorization_date=$4, notes=$5, updated_at=NOW() WHERE id=$6 RETURNING *`,
      [status, authorized_by, authorized_by_name, authorization_date, notes, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/rma/:id", async (req, res) => {
  try {
    await pool.query("UPDATE return_merchandise_authorizations SET is_active=false WHERE id=$1", [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/rma/:id/items", async (req, res) => {
  try {
    const { product_id, product_name, quantity, condition, resolution_type, notes } = req.body;
    const result = await pool.query(
      `INSERT INTO rma_items (rma_id, product_id, product_name, quantity, condition, resolution_type, notes) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.params.id, product_id, product_name, quantity || 1, condition || 'unknown', resolution_type || 'refund', notes]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/rma-items/:id", async (req, res) => {
  try {
    const { condition, inspection_result, resolution_type, resolution_status, notes } = req.body;
    const result = await pool.query(
      `UPDATE rma_items SET condition=$1, inspection_result=$2, resolution_type=$3, resolution_status=$4, notes=$5 WHERE id=$6 RETURNING *`,
      [condition, inspection_result, resolution_type, resolution_status, notes, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/rma/:id/shipments", async (req, res) => {
  try {
    const { carrier, tracking_number, ship_date } = req.body;
    const result = await pool.query(
      `INSERT INTO rma_shipments (rma_id, carrier, tracking_number, ship_date) VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.params.id, carrier, tracking_number, ship_date]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/rma-shipments/:id/receive", async (req, res) => {
  try {
    const { inspected_by, inspected_by_name, inspection_notes } = req.body;
    const result = await pool.query(
      `UPDATE rma_shipments SET received_date=NOW(), inspected_by=$1, inspected_by_name=$2, inspection_notes=$3 WHERE id=$4 RETURNING *`,
      [inspected_by, inspected_by_name, inspection_notes, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/logistics-kpis", async (_req, res) => {
  try {
    const [activeDeliveries, pendingRmas, onTimeRate, totalToday] = await Promise.all([
      pool.query("SELECT COUNT(*) as count FROM delivery_tracking WHERE is_active=true AND status NOT IN ('delivered','cancelled')"),
      pool.query("SELECT COUNT(*) as count FROM return_merchandise_authorizations WHERE is_active=true AND status IN ('requested','authorized','in_transit')"),
      pool.query(`
        SELECT 
          CASE WHEN COUNT(*) = 0 THEN 100
               ELSE ROUND(SUM(CASE WHEN status='delivered' THEN 1 ELSE 0 END)::numeric / COUNT(*)::numeric * 100, 1)
          END as rate
        FROM delivery_tracking WHERE is_active=true AND created_at > NOW() - INTERVAL '30 days'
      `),
      pool.query("SELECT COUNT(*) as count FROM delivery_tracking WHERE DATE(created_at)=CURRENT_DATE")
    ]);

    res.json({
      activeDeliveries: parseInt(activeDeliveries.rows[0].count) || 0,
      pendingRmas: parseInt(pendingRmas.rows[0].count) || 0,
      onTimeDeliveryRate: parseFloat(onTimeRate.rows[0].rate) || 100,
      deliveriesToday: parseInt(totalToday.rows[0].count) || 0,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
