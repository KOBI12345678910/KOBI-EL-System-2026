import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vmi_agreements (
      id SERIAL PRIMARY KEY,
      supplier_id INTEGER,
      item_id INTEGER,
      item_name VARCHAR(300),
      supplier_name VARCHAR(300),
      min_level NUMERIC(12,2) DEFAULT 0,
      max_level NUMERIC(12,2) DEFAULT 0,
      reorder_point NUMERIC(12,2) DEFAULT 0,
      lead_time_days INTEGER DEFAULT 7,
      review_frequency VARCHAR(20) DEFAULT 'weekly' CHECK (review_frequency IN ('daily','weekly','biweekly','monthly')),
      status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','suspended','expired','draft')),
      start_date DATE,
      end_date DATE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS vmi_stock_levels (
      id SERIAL PRIMARY KEY,
      agreement_id INTEGER REFERENCES vmi_agreements(id) ON DELETE CASCADE,
      warehouse_id INTEGER,
      warehouse_name VARCHAR(300),
      current_qty NUMERIC(12,2) DEFAULT 0,
      last_updated TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(agreement_id, warehouse_id)
    );

    CREATE TABLE IF NOT EXISTS vmi_replenishment_triggers (
      id SERIAL PRIMARY KEY,
      agreement_id INTEGER REFERENCES vmi_agreements(id) ON DELETE CASCADE,
      trigger_date DATE DEFAULT CURRENT_DATE,
      trigger_qty NUMERIC(12,2) DEFAULT 0,
      status VARCHAR(20) DEFAULT 'triggered' CHECK (status IN ('triggered','ordered','received','cancelled')),
      po_id INTEGER,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS consignment_stock (
      id SERIAL PRIMARY KEY,
      supplier_id INTEGER,
      supplier_name VARCHAR(300),
      item_id INTEGER,
      item_name VARCHAR(300),
      warehouse_id INTEGER,
      warehouse_name VARCHAR(300),
      qty_on_hand NUMERIC(12,2) DEFAULT 0,
      qty_consumed NUMERIC(12,2) DEFAULT 0,
      unit_price NUMERIC(15,2) DEFAULT 0,
      last_reconciliation DATE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS consignment_consumption (
      id SERIAL PRIMARY KEY,
      stock_id INTEGER REFERENCES consignment_stock(id) ON DELETE CASCADE,
      consumed_qty NUMERIC(12,2) DEFAULT 0,
      consumed_date DATE DEFAULT CURRENT_DATE,
      work_order_id INTEGER,
      project_id INTEGER,
      invoiced BOOLEAN DEFAULT false,
      invoice_number VARCHAR(100),
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_vmi_stock_agreement ON vmi_stock_levels(agreement_id);
    CREATE INDEX IF NOT EXISTS idx_vmi_triggers_agreement ON vmi_replenishment_triggers(agreement_id);
    CREATE INDEX IF NOT EXISTS idx_consignment_supplier ON consignment_stock(supplier_id);
    CREATE INDEX IF NOT EXISTS idx_consignment_consumption_stock ON consignment_consumption(stock_id);
  `);
}
ensureTables().catch(console.error);

/* ───────── CRUD VMI Agreements ───────── */
router.get("/vmi/agreements", async (_req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM vmi_agreements ORDER BY status, supplier_name`);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/vmi/agreements", async (req, res) => {
  try {
    const { supplier_id, item_id, item_name, supplier_name, min_level, max_level,
            reorder_point, lead_time_days, review_frequency, start_date, end_date } = req.body;
    const { rows } = await pool.query(`
      INSERT INTO vmi_agreements (supplier_id, item_id, item_name, supplier_name, min_level, max_level,
        reorder_point, lead_time_days, review_frequency, start_date, end_date)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *
    `, [supplier_id, item_id, item_name, supplier_name, min_level || 0, max_level || 0,
        reorder_point || 0, lead_time_days || 7, review_frequency || 'weekly', start_date, end_date]);
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/vmi/agreements/:id", async (req, res) => {
  try {
    const { min_level, max_level, reorder_point, lead_time_days, review_frequency, status, end_date } = req.body;
    const { rows } = await pool.query(`
      UPDATE vmi_agreements SET min_level=COALESCE($2,min_level), max_level=COALESCE($3,max_level),
        reorder_point=COALESCE($4,reorder_point), lead_time_days=COALESCE($5,lead_time_days),
        review_frequency=COALESCE($6,review_frequency), status=COALESCE($7,status),
        end_date=COALESCE($8,end_date), updated_at=NOW()
      WHERE id=$1 RETURNING *
    `, [req.params.id, min_level, max_level, reorder_point, lead_time_days, review_frequency, status, end_date]);
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/* ───────── Stock Levels ───────── */
router.get("/vmi/stock-levels", async (req, res) => {
  try {
    const agreementId = req.query.agreementId;
    const where = agreementId ? `WHERE s.agreement_id = ${parseInt(String(agreementId))}` : '';
    const { rows } = await pool.query(`
      SELECT s.*, a.item_name, a.supplier_name, a.min_level, a.max_level, a.reorder_point,
        CASE
          WHEN s.current_qty <= a.reorder_point THEN 'critical'
          WHEN s.current_qty <= a.min_level THEN 'low'
          WHEN s.current_qty >= a.max_level THEN 'overstocked'
          ELSE 'normal'
        END as stock_status
      FROM vmi_stock_levels s
      LEFT JOIN vmi_agreements a ON a.id = s.agreement_id
      ${where} ORDER BY s.current_qty ASC
    `);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/vmi/stock-levels", async (req, res) => {
  try {
    const { agreement_id, warehouse_id, warehouse_name, current_qty } = req.body;
    const { rows } = await pool.query(`
      INSERT INTO vmi_stock_levels (agreement_id, warehouse_id, warehouse_name, current_qty)
      VALUES ($1,$2,$3,$4)
      ON CONFLICT (agreement_id, warehouse_id) DO UPDATE SET current_qty=$4, last_updated=NOW()
      RETURNING *
    `, [agreement_id, warehouse_id, warehouse_name, current_qty || 0]);
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/* ───────── Auto-trigger Replenishment ───────── */
router.post("/vmi/check-replenishment", async (_req, res) => {
  try {
    // Find all active agreements where stock is at or below reorder point
    const { rows: lowStock } = await pool.query(`
      SELECT s.*, a.reorder_point, a.max_level, a.item_name, a.supplier_name, a.id as agreement_id
      FROM vmi_stock_levels s
      JOIN vmi_agreements a ON a.id = s.agreement_id
      WHERE a.status = 'active' AND s.current_qty <= a.reorder_point
    `);

    const triggers: any[] = [];
    for (const item of lowStock) {
      // Check if there's already a pending trigger
      const existing = await pool.query(`
        SELECT id FROM vmi_replenishment_triggers
        WHERE agreement_id=$1 AND status IN ('triggered','ordered')
      `, [item.agreement_id]);

      if (existing.rows.length === 0) {
        const orderQty = Number(item.max_level) - Number(item.current_qty);
        const { rows } = await pool.query(`
          INSERT INTO vmi_replenishment_triggers (agreement_id, trigger_qty, notes)
          VALUES ($1, $2, $3) RETURNING *
        `, [item.agreement_id, orderQty, `${item.item_name}: מלאי ${item.current_qty} מתחת לנקודת הזמנה ${item.reorder_point}`]);
        triggers.push({ ...rows[0], item_name: item.item_name, supplier_name: item.supplier_name });
      }
    }

    res.json({ triggered: triggers.length, triggers, checked: lowStock.length });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/vmi/replenishment-triggers", async (req, res) => {
  try {
    const status = req.query.status;
    const where = status ? `WHERE t.status = '${String(status).replace(/'/g, "''")}'` : '';
    const { rows } = await pool.query(`
      SELECT t.*, a.item_name, a.supplier_name FROM vmi_replenishment_triggers t
      LEFT JOIN vmi_agreements a ON a.id = t.agreement_id
      ${where} ORDER BY t.created_at DESC
    `);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/vmi/replenishment-triggers/:id", async (req, res) => {
  try {
    const { status, po_id, notes } = req.body;
    const { rows } = await pool.query(`
      UPDATE vmi_replenishment_triggers SET status=COALESCE($2,status), po_id=COALESCE($3,po_id),
        notes=COALESCE($4,notes), updated_at=NOW()
      WHERE id=$1 RETURNING *
    `, [req.params.id, status, po_id, notes]);
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/* ───────── CRUD Consignment Stock ───────── */
router.get("/vmi/consignment-stock", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT cs.*,
        (cs.qty_consumed * cs.unit_price) as consumed_value,
        (cs.qty_on_hand * cs.unit_price) as on_hand_value
      FROM consignment_stock cs ORDER BY cs.supplier_name, cs.item_name
    `);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/vmi/consignment-stock", async (req, res) => {
  try {
    const { supplier_id, supplier_name, item_id, item_name, warehouse_id, warehouse_name, qty_on_hand, unit_price } = req.body;
    const { rows } = await pool.query(`
      INSERT INTO consignment_stock (supplier_id, supplier_name, item_id, item_name, warehouse_id, warehouse_name, qty_on_hand, unit_price)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
    `, [supplier_id, supplier_name, item_id, item_name, warehouse_id, warehouse_name, qty_on_hand || 0, unit_price || 0]);
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/* ───────── Consume consignment ───────── */
router.post("/vmi/consume/:stockId", async (req, res) => {
  try {
    const { consumed_qty, work_order_id, project_id, notes } = req.body;
    const stockId = parseInt(req.params.stockId);

    // Record consumption
    const { rows: [consumption] } = await pool.query(`
      INSERT INTO consignment_consumption (stock_id, consumed_qty, work_order_id, project_id, notes)
      VALUES ($1,$2,$3,$4,$5) RETURNING *
    `, [stockId, consumed_qty, work_order_id, project_id, notes]);

    // Update stock
    await pool.query(`
      UPDATE consignment_stock SET
        qty_on_hand = qty_on_hand - $2, qty_consumed = qty_consumed + $2, updated_at = NOW()
      WHERE id = $1
    `, [stockId, consumed_qty]);

    const updated = await pool.query(`SELECT * FROM consignment_stock WHERE id=$1`, [stockId]);
    res.json({ consumption, stock: updated.rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/* ───────── Reconcile supplier ───────── */
router.post("/vmi/reconcile/:supplierId", async (req, res) => {
  try {
    const supplierId = parseInt(req.params.supplierId);

    // Get all uninvoiced consumption for this supplier
    const { rows: uninvoiced } = await pool.query(`
      SELECT cc.*, cs.item_name, cs.unit_price, cs.supplier_name,
        (cc.consumed_qty * cs.unit_price) as line_total
      FROM consignment_consumption cc
      JOIN consignment_stock cs ON cs.id = cc.stock_id
      WHERE cs.supplier_id = $1 AND cc.invoiced = false
      ORDER BY cc.consumed_date
    `, [supplierId]);

    const totalValue = uninvoiced.reduce((s: number, r: any) => s + Number(r.line_total || 0), 0);

    // Mark as reconciled
    const consumptionIds = uninvoiced.map(r => r.id);
    if (consumptionIds.length > 0) {
      await pool.query(`UPDATE consignment_consumption SET invoiced=true WHERE id = ANY($1)`, [consumptionIds]);
      await pool.query(`UPDATE consignment_stock SET last_reconciliation=CURRENT_DATE WHERE supplier_id=$1`, [supplierId]);
    }

    res.json({
      supplier_id: supplierId,
      supplier_name: uninvoiced[0]?.supplier_name || '',
      lines: uninvoiced.length,
      total_value: totalValue,
      consumption_details: uninvoiced
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/* ───────── Dashboard ───────── */
router.get("/vmi/dashboard", async (_req, res) => {
  try {
    const agreements = await pool.query(`
      SELECT status, COUNT(*) as count FROM vmi_agreements GROUP BY status
    `);
    const stockAlerts = await pool.query(`
      SELECT s.*, a.item_name, a.supplier_name, a.reorder_point, a.min_level, a.max_level
      FROM vmi_stock_levels s JOIN vmi_agreements a ON a.id = s.agreement_id
      WHERE a.status='active' AND s.current_qty <= a.min_level ORDER BY s.current_qty ASC LIMIT 15
    `);
    const pendingTriggers = await pool.query(`
      SELECT COUNT(*) as count FROM vmi_replenishment_triggers WHERE status IN ('triggered','ordered')
    `);
    const consignmentSummary = await pool.query(`
      SELECT supplier_name, SUM(qty_on_hand * unit_price) as on_hand_value,
        SUM(qty_consumed * unit_price) as consumed_value, COUNT(*) as item_count
      FROM consignment_stock GROUP BY supplier_name ORDER BY SUM(qty_consumed * unit_price) DESC
    `);
    const uninvoicedTotal = await pool.query(`
      SELECT SUM(cc.consumed_qty * cs.unit_price) as total
      FROM consignment_consumption cc JOIN consignment_stock cs ON cs.id = cc.stock_id
      WHERE cc.invoiced = false
    `);

    res.json({
      agreementStats: agreements.rows,
      stockAlerts: stockAlerts.rows,
      pendingReplenishments: Number(pendingTriggers.rows[0].count),
      consignmentBySupplier: consignmentSummary.rows,
      uninvoicedConsignment: Number(uninvoicedTotal.rows[0]?.total || 0)
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
