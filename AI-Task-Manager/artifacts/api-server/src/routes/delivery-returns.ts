import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS delivery_notes (
      id SERIAL PRIMARY KEY,
      delivery_number VARCHAR(20) UNIQUE,
      sales_order_id INTEGER,
      customer_id INTEGER,
      delivery_date DATE DEFAULT CURRENT_DATE,
      status VARCHAR(30) DEFAULT 'draft',
      shipping_method VARCHAR(100),
      tracking_number VARCHAR(100),
      carrier VARCHAR(100),
      driver_name VARCHAR(100),
      vehicle_number VARCHAR(50),
      delivery_address JSONB DEFAULT '{}',
      receiver_name VARCHAR(200),
      receiver_signature TEXT,
      notes TEXT,
      is_active BOOLEAN DEFAULT true,
      created_by INTEGER,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS delivery_note_items (
      id SERIAL PRIMARY KEY,
      delivery_note_id INTEGER REFERENCES delivery_notes(id),
      sales_order_item_id INTEGER,
      product_id INTEGER,
      quantity_shipped DECIMAL(12,3) DEFAULT 0,
      quantity_received DECIMAL(12,3) DEFAULT 0,
      condition_notes TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sales_returns (
      id SERIAL PRIMARY KEY,
      return_number VARCHAR(20) UNIQUE,
      sales_order_id INTEGER,
      customer_id INTEGER,
      return_date DATE DEFAULT CURRENT_DATE,
      status VARCHAR(30) DEFAULT 'requested',
      reason VARCHAR(50) DEFAULT 'other',
      description TEXT,
      refund_amount INTEGER DEFAULT 0,
      refund_method VARCHAR(30) DEFAULT 'credit_note',
      credit_note_id INTEGER,
      approved_by INTEGER,
      notes TEXT,
      is_active BOOLEAN DEFAULT true,
      created_by INTEGER,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);
}

export { ensureTables as ensureDeliveryReturnsTables };

router.get("/delivery-notes", async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT dn.*, c.company_name as customer_name
      FROM delivery_notes dn
      LEFT JOIN customers c ON c.id = dn.customer_id
      WHERE dn.is_active = true
      ORDER BY dn.created_at DESC
    `);
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/delivery-notes", async (req, res) => {
  try {
    const { delivery_number, sales_order_id, customer_id, delivery_date, shipping_method, tracking_number, carrier, driver_name, vehicle_number, delivery_address, notes } = req.body;
    const num = delivery_number || `DN-${Date.now()}`;
    const result = await pool.query(
      `INSERT INTO delivery_notes (delivery_number, sales_order_id, customer_id, delivery_date, shipping_method, tracking_number, carrier, driver_name, vehicle_number, delivery_address, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [num, sales_order_id, customer_id, delivery_date || new Date(), shipping_method, tracking_number, carrier, driver_name, vehicle_number, delivery_address || {}, notes]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/delivery-notes/:id", async (req, res) => {
  try {
    const { status, receiver_name, receiver_signature, notes } = req.body;
    const result = await pool.query(
      `UPDATE delivery_notes SET status=$1, receiver_name=$2, receiver_signature=$3, notes=$4, updated_at=NOW() WHERE id=$5 RETURNING *`,
      [status, receiver_name, receiver_signature, notes, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/delivery-notes/:id", async (req, res) => {
  try {
    await pool.query("UPDATE delivery_notes SET is_active=false WHERE id=$1", [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/delivery-note-items", async (req, res) => {
  try {
    const dnid = req.query.delivery_note_id;
    const result = await pool.query("SELECT * FROM delivery_note_items WHERE delivery_note_id=$1 ORDER BY sort_order", [dnid]);
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/sales-returns", async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT sr.*, c.company_name as customer_name
      FROM sales_returns sr
      LEFT JOIN customers c ON c.id = sr.customer_id
      WHERE sr.is_active = true
      ORDER BY sr.created_at DESC
    `);
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/sales-returns", async (req, res) => {
  try {
    const { return_number, sales_order_id, customer_id, return_date, reason, description, refund_amount, refund_method, notes } = req.body;
    const num = return_number || `SR-${Date.now()}`;
    const result = await pool.query(
      `INSERT INTO sales_returns (return_number, sales_order_id, customer_id, return_date, reason, description, refund_amount, refund_method, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [num, sales_order_id, customer_id, return_date || new Date(), reason || 'other', description, refund_amount || 0, refund_method || 'credit_note', notes]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/sales-returns/:id", async (req, res) => {
  try {
    const { status, approved_by, refund_amount, notes } = req.body;
    const result = await pool.query(
      `UPDATE sales_returns SET status=$1, approved_by=$2, refund_amount=$3, notes=$4, updated_at=NOW() WHERE id=$5 RETURNING *`,
      [status, approved_by, refund_amount, notes, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/sales-returns/:id", async (req, res) => {
  try {
    await pool.query("UPDATE sales_returns SET is_active=false WHERE id=$1", [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
