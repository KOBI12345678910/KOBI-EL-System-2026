import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

// ─── Auto-create tables ───────────────────────────────────────────────────────
async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ar_aging_snapshot (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER,
      customer_name VARCHAR(200),
      current_amount NUMERIC(14,2) DEFAULT 0,
      days_30 NUMERIC(14,2) DEFAULT 0,
      days_60 NUMERIC(14,2) DEFAULT 0,
      days_90 NUMERIC(14,2) DEFAULT 0,
      days_120_plus NUMERIC(14,2) DEFAULT 0,
      total_outstanding NUMERIC(14,2) DEFAULT 0,
      last_payment_date DATE,
      credit_limit NUMERIC(14,2) DEFAULT 0,
      risk_level VARCHAR(20) DEFAULT 'low' CHECK (risk_level IN ('low','medium','high','critical')),
      snapshot_date DATE DEFAULT CURRENT_DATE,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ap_aging_snapshot (
      id SERIAL PRIMARY KEY,
      supplier_id INTEGER,
      supplier_name VARCHAR(200),
      current_amount NUMERIC(14,2) DEFAULT 0,
      days_30 NUMERIC(14,2) DEFAULT 0,
      days_60 NUMERIC(14,2) DEFAULT 0,
      days_90 NUMERIC(14,2) DEFAULT 0,
      total_outstanding NUMERIC(14,2) DEFAULT 0,
      next_payment_date DATE,
      snapshot_date DATE DEFAULT CURRENT_DATE,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS payment_promises (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER,
      customer_name VARCHAR(200),
      promised_date DATE,
      promised_amount NUMERIC(14,2) DEFAULT 0,
      actual_amount NUMERIC(14,2),
      status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','kept','broken')),
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS collection_tasks (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER,
      customer_name VARCHAR(200),
      assigned_to VARCHAR(200),
      task_type VARCHAR(20) DEFAULT 'call' CHECK (task_type IN ('call','email','whatsapp','legal')),
      due_date DATE,
      notes TEXT,
      status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','completed','escalated')),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);
}

let tablesReady = false;
async function init() {
  if (!tablesReady) { await ensureTables(); tablesReady = true; }
}

function classifyRisk(total: number, days90: number, days120: number, creditLimit: number): string {
  if (days120 > 0 || total > creditLimit * 1.2) return "critical";
  if (days90 > 0 || total > creditLimit * 0.9) return "high";
  if (total > creditLimit * 0.5) return "medium";
  return "low";
}

// ─── AR Aging ─────────────────────────────────────────────────────────────────

// Generate AR aging snapshot (aggregates from invoices/payments)
router.post("/ap-ar/snapshot-ar", async (req, res) => {
  try {
    await init();
    const items = req.body.items || [];
    const inserted: any[] = [];
    for (const item of items) {
      const total = (parseFloat(item.current_amount) || 0) + (parseFloat(item.days_30) || 0) + (parseFloat(item.days_60) || 0) + (parseFloat(item.days_90) || 0) + (parseFloat(item.days_120_plus) || 0);
      const risk = classifyRisk(total, parseFloat(item.days_90) || 0, parseFloat(item.days_120_plus) || 0, parseFloat(item.credit_limit) || 100000);
      const result = await pool.query(
        `INSERT INTO ar_aging_snapshot (customer_id, customer_name, current_amount, days_30, days_60, days_90, days_120_plus, total_outstanding, last_payment_date, credit_limit, risk_level)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [item.customer_id, item.customer_name, item.current_amount || 0, item.days_30 || 0, item.days_60 || 0, item.days_90 || 0, item.days_120_plus || 0, total.toFixed(2), item.last_payment_date || null, item.credit_limit || 0, risk]
      );
      inserted.push(result.rows[0]);
    }
    res.json({ count: inserted.length, items: inserted });
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.get("/ap-ar/ar-aging", async (req, res) => {
  try {
    await init();
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const result = await pool.query(
      `SELECT * FROM ar_aging_snapshot WHERE snapshot_date = $1 ORDER BY total_outstanding DESC`,
      [date]
    );
    // If no snapshot for today, get latest
    if (result.rows.length === 0) {
      const latest = await pool.query(`SELECT * FROM ar_aging_snapshot ORDER BY snapshot_date DESC, total_outstanding DESC LIMIT 100`);
      return res.json(latest.rows);
    }
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// ─── AP Aging ─────────────────────────────────────────────────────────────────

router.post("/ap-ar/snapshot-ap", async (req, res) => {
  try {
    await init();
    const items = req.body.items || [];
    const inserted: any[] = [];
    for (const item of items) {
      const total = (parseFloat(item.current_amount) || 0) + (parseFloat(item.days_30) || 0) + (parseFloat(item.days_60) || 0) + (parseFloat(item.days_90) || 0);
      const result = await pool.query(
        `INSERT INTO ap_aging_snapshot (supplier_id, supplier_name, current_amount, days_30, days_60, days_90, total_outstanding, next_payment_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [item.supplier_id, item.supplier_name, item.current_amount || 0, item.days_30 || 0, item.days_60 || 0, item.days_90 || 0, total.toFixed(2), item.next_payment_date || null]
      );
      inserted.push(result.rows[0]);
    }
    res.json({ count: inserted.length, items: inserted });
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.get("/ap-ar/ap-aging", async (req, res) => {
  try {
    await init();
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const result = await pool.query(
      `SELECT * FROM ap_aging_snapshot WHERE snapshot_date = $1 ORDER BY total_outstanding DESC`,
      [date]
    );
    if (result.rows.length === 0) {
      const latest = await pool.query(`SELECT * FROM ap_aging_snapshot ORDER BY snapshot_date DESC, total_outstanding DESC LIMIT 100`);
      return res.json(latest.rows);
    }
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// ─── Payment Promises ─────────────────────────────────────────────────────────

router.get("/ap-ar/promises", async (_req, res) => {
  try {
    await init();
    const result = await pool.query(`SELECT * FROM payment_promises ORDER BY promised_date DESC`);
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.post("/ap-ar/promises", async (req, res) => {
  try {
    await init();
    const b = req.body;
    const result = await pool.query(
      `INSERT INTO payment_promises (customer_id, customer_name, promised_date, promised_amount, notes)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [b.customer_id, b.customer_name, b.promised_date, b.promised_amount || 0, b.notes]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.put("/ap-ar/promises/:id", async (req, res) => {
  try {
    await init();
    const b = req.body;
    const result = await pool.query(
      `UPDATE payment_promises SET promised_date=COALESCE($1,promised_date), promised_amount=COALESCE($2,promised_amount), actual_amount=$3, status=COALESCE($4,status), notes=COALESCE($5,notes) WHERE id=$6 RETURNING *`,
      [b.promised_date, b.promised_amount, b.actual_amount, b.status, b.notes, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.delete("/ap-ar/promises/:id", async (req, res) => {
  try {
    await init();
    await pool.query(`DELETE FROM payment_promises WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// ─── Collection Tasks ─────────────────────────────────────────────────────────

router.get("/ap-ar/collection-tasks", async (_req, res) => {
  try {
    await init();
    const result = await pool.query(`SELECT * FROM collection_tasks ORDER BY due_date ASC`);
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.post("/ap-ar/collection-tasks", async (req, res) => {
  try {
    await init();
    const b = req.body;
    const result = await pool.query(
      `INSERT INTO collection_tasks (customer_id, customer_name, assigned_to, task_type, due_date, notes)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [b.customer_id, b.customer_name, b.assigned_to, b.task_type || "call", b.due_date, b.notes]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.put("/ap-ar/collection-tasks/:id", async (req, res) => {
  try {
    await init();
    const b = req.body;
    const result = await pool.query(
      `UPDATE collection_tasks SET assigned_to=COALESCE($1,assigned_to), task_type=COALESCE($2,task_type), due_date=COALESCE($3,due_date), notes=COALESCE($4,notes), status=COALESCE($5,status), updated_at=NOW() WHERE id=$6 RETURNING *`,
      [b.assigned_to, b.task_type, b.due_date, b.notes, b.status, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.delete("/ap-ar/collection-tasks/:id", async (req, res) => {
  try {
    await init();
    await pool.query(`DELETE FROM collection_tasks WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// ─── Cash Position ────────────────────────────────────────────────────────────

router.get("/ap-ar/cash-position", async (_req, res) => {
  try {
    await init();
    const ar = await pool.query(`SELECT COALESCE(SUM(total_outstanding),0) as total FROM ar_aging_snapshot WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM ar_aging_snapshot)`);
    const ap = await pool.query(`SELECT COALESCE(SUM(total_outstanding),0) as total FROM ap_aging_snapshot WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM ap_aging_snapshot)`);

    const arCritical = await pool.query(`SELECT COALESCE(SUM(total_outstanding),0) as total FROM ar_aging_snapshot WHERE risk_level IN ('high','critical') AND snapshot_date = (SELECT MAX(snapshot_date) FROM ar_aging_snapshot)`);
    const arOverdue = await pool.query(`SELECT COALESCE(SUM(days_90 + days_120_plus),0) as total FROM ar_aging_snapshot WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM ar_aging_snapshot)`);

    const totalAR = parseFloat(ar.rows[0]?.total) || 0;
    const totalAP = parseFloat(ap.rows[0]?.total) || 0;
    const netPosition = totalAR - totalAP;
    const liquidity = totalAP > 0 ? Math.round((totalAR / totalAP) * 100) / 100 : 999;

    res.json({
      total_receivable: totalAR,
      total_payable: totalAP,
      net_position: netPosition,
      liquidity_ratio: liquidity,
      ar_at_risk: parseFloat(arCritical.rows[0]?.total) || 0,
      ar_overdue: parseFloat(arOverdue.rows[0]?.total) || 0,
    });
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// ─── Dashboard ────────────────────────────────────────────────────────────────

router.get("/ap-ar/dashboard", async (_req, res) => {
  try {
    await init();
    const ar = await pool.query(`SELECT * FROM ar_aging_snapshot WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM ar_aging_snapshot) ORDER BY total_outstanding DESC LIMIT 20`);
    const ap = await pool.query(`SELECT * FROM ap_aging_snapshot WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM ap_aging_snapshot) ORDER BY total_outstanding DESC LIMIT 20`);
    const promises = await pool.query(`SELECT * FROM payment_promises WHERE status = 'pending' ORDER BY promised_date ASC LIMIT 20`);
    const tasks = await pool.query(`SELECT * FROM collection_tasks WHERE status != 'completed' ORDER BY due_date ASC LIMIT 20`);

    const totalAR = ar.rows.reduce((s: number, r: any) => s + parseFloat(r.total_outstanding || "0"), 0);
    const totalAP = ap.rows.reduce((s: number, r: any) => s + parseFloat(r.total_outstanding || "0"), 0);
    const criticalCustomers = ar.rows.filter((r: any) => r.risk_level === "critical" || r.risk_level === "high").length;

    res.json({
      ar_aging: ar.rows,
      ap_aging: ap.rows,
      pending_promises: promises.rows,
      open_tasks: tasks.rows,
      summary: {
        total_ar: totalAR,
        total_ap: totalAP,
        net_position: totalAR - totalAP,
        critical_customers: criticalCustomers,
        pending_promises_count: promises.rows.length,
        open_tasks_count: tasks.rows.length,
      },
    });
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

export default router;
