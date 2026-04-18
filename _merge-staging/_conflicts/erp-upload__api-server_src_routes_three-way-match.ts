import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS twm_match_records (
      id SERIAL PRIMARY KEY,
      po_id INTEGER,
      receipt_id INTEGER,
      invoice_id INTEGER,
      po_number VARCHAR(50),
      receipt_number VARCHAR(50),
      invoice_number VARCHAR(50),
      supplier_name VARCHAR(200),
      po_amount NUMERIC(14,2) DEFAULT 0,
      receipt_amount NUMERIC(14,2) DEFAULT 0,
      invoice_amount NUMERIC(14,2) DEFAULT 0,
      qty_ordered NUMERIC(12,3) DEFAULT 0,
      qty_received NUMERIC(12,3) DEFAULT 0,
      qty_invoiced NUMERIC(12,3) DEFAULT 0,
      qty_variance NUMERIC(12,3) DEFAULT 0,
      price_variance NUMERIC(14,2) DEFAULT 0,
      match_status VARCHAR(30) DEFAULT 'pending',
      match_score NUMERIC(5,2) DEFAULT 0,
      approved_by VARCHAR(200),
      approved_at TIMESTAMP,
      hold_reason TEXT,
      hold_by VARCHAR(200),
      hold_at TIMESTAMP,
      release_by VARCHAR(200),
      release_at TIMESTAMP,
      notes TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS twm_tolerance_rules (
      id SERIAL PRIMARY KEY,
      rule_name VARCHAR(100),
      category VARCHAR(50) DEFAULT 'general',
      qty_tolerance_pct NUMERIC(5,2) DEFAULT 5,
      price_tolerance_pct NUMERIC(5,2) DEFAULT 2,
      amount_tolerance NUMERIC(14,2) DEFAULT 100,
      auto_approve BOOLEAN DEFAULT false,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS twm_hold_log (
      id SERIAL PRIMARY KEY,
      match_id INTEGER REFERENCES twm_match_records(id),
      action VARCHAR(30),
      reason TEXT,
      performed_by VARCHAR(200),
      performed_at TIMESTAMP DEFAULT NOW(),
      notes TEXT
    );
  `);
}

ensureTables().catch(console.error);

// Auto-generate match number
async function nextMatchNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const r = await pool.query(`SELECT COUNT(*) as cnt FROM twm_match_records WHERE EXTRACT(YEAR FROM created_at) = $1`, [year]);
  const seq = parseInt(r.rows[0]?.cnt || "0") + 1;
  return `TWM-${year}-${String(seq).padStart(5, "0")}`;
}

// ========== MATCH ENDPOINT ==========
router.post("/three-way-match/match", async (req, res) => {
  try {
    const { po_id, receipt_id, invoice_id, po_number, receipt_number, invoice_number,
      supplier_name, po_amount, receipt_amount, invoice_amount,
      qty_ordered, qty_received, qty_invoiced, notes } = req.body;

    const qtyVar = Math.abs((qty_ordered || 0) - (qty_received || 0));
    const priceVar = Math.abs((po_amount || 0) - (invoice_amount || 0));

    // Get tolerance rules
    const rulesRes = await pool.query(`SELECT * FROM twm_tolerance_rules WHERE is_active = true ORDER BY id LIMIT 1`);
    const rule = rulesRes.rows[0] || { qty_tolerance_pct: 5, price_tolerance_pct: 2, amount_tolerance: 100 };

    const qtyPct = (qty_ordered || 0) > 0 ? (qtyVar / (qty_ordered || 1)) * 100 : 0;
    const pricePct = (po_amount || 0) > 0 ? (priceVar / (po_amount || 1)) * 100 : 0;

    let matchStatus = "matched";
    let matchScore = 100;

    if (qtyPct > parseFloat(rule.qty_tolerance_pct) || pricePct > parseFloat(rule.price_tolerance_pct)) {
      matchStatus = "mismatch";
      matchScore = Math.max(0, 100 - qtyPct - pricePct);
    } else if (qtyVar > 0 || priceVar > 0) {
      matchStatus = "partial";
      matchScore = Math.max(50, 100 - (qtyPct + pricePct) / 2);
    }

    if (rule.auto_approve && matchStatus === "matched") {
      // auto-approve
    }

    const result = await pool.query(`
      INSERT INTO twm_match_records (po_id, receipt_id, invoice_id, po_number, receipt_number, invoice_number,
        supplier_name, po_amount, receipt_amount, invoice_amount, qty_ordered, qty_received, qty_invoiced,
        qty_variance, price_variance, match_status, match_score, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      RETURNING *
    `, [po_id, receipt_id, invoice_id, po_number, receipt_number, invoice_number,
      supplier_name, po_amount || 0, receipt_amount || 0, invoice_amount || 0,
      qty_ordered || 0, qty_received || 0, qty_invoiced || 0,
      qtyVar, priceVar, matchStatus, matchScore, notes]);

    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ========== GET RECORDS ==========
router.get("/three-way-match/records", async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM twm_match_records
      WHERE is_active = true
      ORDER BY created_at DESC
    `);
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/three-way-match/records/:id", async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM twm_match_records WHERE id = $1`, [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: "רשומה לא נמצאה" });
    const logs = await pool.query(`SELECT * FROM twm_hold_log WHERE match_id = $1 ORDER BY performed_at DESC`, [req.params.id]);
    res.json({ ...result.rows[0], hold_logs: logs.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ========== APPROVE VARIANCE ==========
router.put("/three-way-match/:id/approve-variance", async (req, res) => {
  try {
    const { approved_by, notes } = req.body;
    const result = await pool.query(`
      UPDATE twm_match_records SET match_status = 'matched', approved_by = $2, approved_at = NOW(), notes = COALESCE($3, notes), updated_at = NOW()
      WHERE id = $1 RETURNING *
    `, [req.params.id, approved_by, notes]);
    if (!result.rows[0]) return res.status(404).json({ error: "רשומה לא נמצאה" });

    await pool.query(`INSERT INTO twm_hold_log (match_id, action, reason, performed_by, notes) VALUES ($1, 'approve_variance', $2, $3, $4)`,
      [req.params.id, "אישור סטייה", approved_by, notes]);

    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ========== HOLD ==========
router.put("/three-way-match/:id/hold", async (req, res) => {
  try {
    const { hold_reason, hold_by } = req.body;
    const result = await pool.query(`
      UPDATE twm_match_records SET match_status = 'on_hold', hold_reason = $2, hold_by = $3, hold_at = NOW(), updated_at = NOW()
      WHERE id = $1 RETURNING *
    `, [req.params.id, hold_reason, hold_by]);
    if (!result.rows[0]) return res.status(404).json({ error: "רשומה לא נמצאה" });

    await pool.query(`INSERT INTO twm_hold_log (match_id, action, reason, performed_by) VALUES ($1, 'hold', $2, $3)`,
      [req.params.id, hold_reason, hold_by]);

    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ========== RELEASE ==========
router.put("/three-way-match/:id/release", async (req, res) => {
  try {
    const { release_by, notes } = req.body;
    const prev = await pool.query(`SELECT match_status FROM twm_match_records WHERE id = $1`, [req.params.id]);
    if (!prev.rows[0]) return res.status(404).json({ error: "רשומה לא נמצאה" });

    const result = await pool.query(`
      UPDATE twm_match_records SET match_status = 'partial', hold_reason = NULL, release_by = $2, release_at = NOW(), updated_at = NOW()
      WHERE id = $1 RETURNING *
    `, [req.params.id, release_by]);

    await pool.query(`INSERT INTO twm_hold_log (match_id, action, reason, performed_by, notes) VALUES ($1, 'release', 'שחרור מהקפאה', $2, $3)`,
      [req.params.id, release_by, notes]);

    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ========== DASHBOARD ==========
router.get("/three-way-match/dashboard", async (_req, res) => {
  try {
    const stats = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE match_status = 'matched') as matched,
        COUNT(*) FILTER (WHERE match_status = 'partial') as partial,
        COUNT(*) FILTER (WHERE match_status = 'mismatch') as mismatch,
        COUNT(*) FILTER (WHERE match_status = 'on_hold') as on_hold,
        COUNT(*) FILTER (WHERE match_status = 'pending') as pending,
        COALESCE(SUM(invoice_amount), 0) as total_invoice_amount,
        COALESCE(SUM(price_variance), 0) as total_price_variance,
        COALESCE(AVG(match_score), 0) as avg_match_score,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as last_7_days,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as last_30_days
      FROM twm_match_records WHERE is_active = true
    `);

    const recentMismatches = await pool.query(`
      SELECT id, po_number, invoice_number, supplier_name, price_variance, qty_variance, match_status, created_at
      FROM twm_match_records WHERE match_status IN ('mismatch', 'on_hold') AND is_active = true
      ORDER BY created_at DESC LIMIT 10
    `);

    const bySupplier = await pool.query(`
      SELECT supplier_name, COUNT(*) as total,
        COUNT(*) FILTER (WHERE match_status = 'matched') as matched,
        COUNT(*) FILTER (WHERE match_status = 'mismatch') as mismatches
      FROM twm_match_records WHERE is_active = true AND supplier_name IS NOT NULL
      GROUP BY supplier_name ORDER BY mismatches DESC LIMIT 10
    `);

    res.json({
      ...stats.rows[0],
      recent_mismatches: recentMismatches.rows,
      by_supplier: bySupplier.rows,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ========== TOLERANCE RULES CRUD ==========
router.get("/three-way-match/tolerance-rules", async (_req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM twm_tolerance_rules WHERE is_active = true ORDER BY id`);
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/three-way-match/tolerance-rules", async (req, res) => {
  try {
    const { rule_name, category, qty_tolerance_pct, price_tolerance_pct, amount_tolerance, auto_approve } = req.body;
    const result = await pool.query(`
      INSERT INTO twm_tolerance_rules (rule_name, category, qty_tolerance_pct, price_tolerance_pct, amount_tolerance, auto_approve)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
    `, [rule_name, category || 'general', qty_tolerance_pct || 5, price_tolerance_pct || 2, amount_tolerance || 100, auto_approve || false]);
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/three-way-match/tolerance-rules/:id", async (req, res) => {
  try {
    const { rule_name, category, qty_tolerance_pct, price_tolerance_pct, amount_tolerance, auto_approve } = req.body;
    const result = await pool.query(`
      UPDATE twm_tolerance_rules SET rule_name=$2, category=$3, qty_tolerance_pct=$4, price_tolerance_pct=$5,
        amount_tolerance=$6, auto_approve=$7, updated_at=NOW()
      WHERE id=$1 RETURNING *
    `, [req.params.id, rule_name, category, qty_tolerance_pct, price_tolerance_pct, amount_tolerance, auto_approve]);
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
