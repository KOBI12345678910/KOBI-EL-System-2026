import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS variation_orders (
      id SERIAL PRIMARY KEY,
      vo_number VARCHAR(30) UNIQUE,
      project_id INTEGER,
      project_name VARCHAR(200),
      contract_id INTEGER,
      contract_number VARCHAR(50),
      title VARCHAR(300) NOT NULL,
      description TEXT,
      requested_by VARCHAR(200),
      requested_date DATE DEFAULT CURRENT_DATE,
      reason VARCHAR(50) DEFAULT 'scope_change',
      reason_detail TEXT,
      scope_delta TEXT,
      original_contract_value NUMERIC(14,2) DEFAULT 0,
      price_delta NUMERIC(14,2) DEFAULT 0,
      new_contract_value NUMERIC(14,2) DEFAULT 0,
      schedule_delta_days INTEGER DEFAULT 0,
      risk_level VARCHAR(20) DEFAULT 'low',
      status VARCHAR(30) DEFAULT 'draft',
      customer_signoff BOOLEAN DEFAULT false,
      customer_signoff_date TIMESTAMP,
      customer_signoff_by VARCHAR(200),
      submitted_at TIMESTAMP,
      approved_at TIMESTAMP,
      approved_by VARCHAR(200),
      rejected_at TIMESTAMP,
      rejected_by VARCHAR(200),
      rejection_reason TEXT,
      implemented_at TIMESTAMP,
      implemented_by VARCHAR(200),
      notes TEXT,
      is_active BOOLEAN DEFAULT true,
      created_by VARCHAR(200),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS vo_line_items (
      id SERIAL PRIMARY KEY,
      vo_id INTEGER REFERENCES variation_orders(id),
      item_type VARCHAR(30) DEFAULT 'addition',
      description TEXT,
      quantity NUMERIC(12,3) DEFAULT 1,
      unit VARCHAR(30) DEFAULT 'unit',
      unit_price NUMERIC(14,2) DEFAULT 0,
      total_price NUMERIC(14,2) DEFAULT 0,
      original_quantity NUMERIC(12,3) DEFAULT 0,
      original_price NUMERIC(14,2) DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS vo_approvals (
      id SERIAL PRIMARY KEY,
      vo_id INTEGER REFERENCES variation_orders(id),
      approver_name VARCHAR(200),
      approver_role VARCHAR(100),
      action VARCHAR(30),
      comments TEXT,
      decision_date TIMESTAMP DEFAULT NOW(),
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
}

ensureTables().catch(console.error);

async function nextVONumber(): Promise<string> {
  const year = new Date().getFullYear();
  const r = await pool.query(`SELECT COUNT(*) as cnt FROM variation_orders WHERE EXTRACT(YEAR FROM created_at) = $1`, [year]);
  const seq = parseInt(r.rows[0]?.cnt || "0") + 1;
  return `VO-${year}-${String(seq).padStart(5, "0")}`;
}

// ========== CRUD ==========
router.get("/variation-orders", async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT vo.*,
        (SELECT COUNT(*) FROM vo_line_items li WHERE li.vo_id = vo.id) as line_count,
        (SELECT COALESCE(SUM(total_price), 0) FROM vo_line_items li WHERE li.vo_id = vo.id) as lines_total
      FROM variation_orders vo
      WHERE vo.is_active = true
      ORDER BY vo.created_at DESC
    `);
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/variation-orders/:id", async (req, res) => {
  try {
    const vo = await pool.query(`SELECT * FROM variation_orders WHERE id = $1`, [req.params.id]);
    if (!vo.rows[0]) return res.status(404).json({ error: "צו שינוי לא נמצא" });
    const lines = await pool.query(`SELECT * FROM vo_line_items WHERE vo_id = $1 ORDER BY sort_order, id`, [req.params.id]);
    const approvals = await pool.query(`SELECT * FROM vo_approvals WHERE vo_id = $1 ORDER BY created_at DESC`, [req.params.id]);
    res.json({ ...vo.rows[0], line_items: lines.rows, approvals: approvals.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/variation-orders", async (req, res) => {
  try {
    const num = await nextVONumber();
    const { project_id, project_name, contract_id, contract_number, title, description, requested_by,
      reason, reason_detail, scope_delta, original_contract_value, price_delta, schedule_delta_days,
      risk_level, notes, created_by, line_items } = req.body;

    const newValue = parseFloat(original_contract_value || 0) + parseFloat(price_delta || 0);

    const result = await pool.query(`
      INSERT INTO variation_orders (vo_number, project_id, project_name, contract_id, contract_number, title, description,
        requested_by, reason, reason_detail, scope_delta, original_contract_value, price_delta, new_contract_value,
        schedule_delta_days, risk_level, notes, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *
    `, [num, project_id, project_name, contract_id, contract_number, title, description, requested_by,
      reason || 'scope_change', reason_detail, scope_delta, original_contract_value || 0, price_delta || 0,
      newValue, schedule_delta_days || 0, risk_level || 'low', notes, created_by]);

    const vo = result.rows[0];

    // Insert line items
    if (Array.isArray(line_items)) {
      for (let i = 0; i < line_items.length; i++) {
        const li = line_items[i];
        const totalPrice = (li.quantity || 1) * (li.unit_price || 0);
        await pool.query(`
          INSERT INTO vo_line_items (vo_id, item_type, description, quantity, unit, unit_price, total_price,
            original_quantity, original_price, sort_order, notes)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        `, [vo.id, li.item_type || 'addition', li.description, li.quantity || 1, li.unit || 'unit',
          li.unit_price || 0, totalPrice, li.original_quantity || 0, li.original_price || 0, i + 1, li.notes]);
      }
    }

    res.json(vo);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/variation-orders/:id", async (req, res) => {
  try {
    const { project_id, project_name, contract_id, contract_number, title, description, requested_by,
      reason, reason_detail, scope_delta, original_contract_value, price_delta, schedule_delta_days,
      risk_level, notes } = req.body;

    const newValue = parseFloat(original_contract_value || 0) + parseFloat(price_delta || 0);

    const result = await pool.query(`
      UPDATE variation_orders SET project_id=$2, project_name=$3, contract_id=$4, contract_number=$5,
        title=$6, description=$7, requested_by=$8, reason=$9, reason_detail=$10, scope_delta=$11,
        original_contract_value=$12, price_delta=$13, new_contract_value=$14, schedule_delta_days=$15,
        risk_level=$16, notes=$17, updated_at=NOW()
      WHERE id=$1 AND status = 'draft' RETURNING *
    `, [req.params.id, project_id, project_name, contract_id, contract_number, title, description,
      requested_by, reason, reason_detail, scope_delta, original_contract_value || 0, price_delta || 0,
      newValue, schedule_delta_days || 0, risk_level, notes]);

    if (!result.rows[0]) return res.status(400).json({ error: "לא ניתן לערוך צו שלא בסטטוס טיוטה" });
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/variation-orders/:id", async (req, res) => {
  try {
    await pool.query(`UPDATE variation_orders SET is_active = false, updated_at = NOW() WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ========== LINE ITEMS ==========
router.post("/variation-orders/:id/lines", async (req, res) => {
  try {
    const { item_type, description, quantity, unit, unit_price, original_quantity, original_price, notes } = req.body;
    const totalPrice = (quantity || 1) * (unit_price || 0);
    const result = await pool.query(`
      INSERT INTO vo_line_items (vo_id, item_type, description, quantity, unit, unit_price, total_price,
        original_quantity, original_price, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *
    `, [req.params.id, item_type || 'addition', description, quantity || 1, unit || 'unit',
      unit_price || 0, totalPrice, original_quantity || 0, original_price || 0, notes]);

    // Update VO price_delta
    const totalLines = await pool.query(`SELECT COALESCE(SUM(total_price), 0) as total FROM vo_line_items WHERE vo_id = $1`, [req.params.id]);
    await pool.query(`UPDATE variation_orders SET price_delta = $2, new_contract_value = original_contract_value + $2, updated_at = NOW() WHERE id = $1`,
      [req.params.id, totalLines.rows[0]?.total || 0]);

    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/variation-orders/lines/:lineId", async (req, res) => {
  try {
    const line = await pool.query(`SELECT vo_id FROM vo_line_items WHERE id = $1`, [req.params.lineId]);
    await pool.query(`DELETE FROM vo_line_items WHERE id = $1`, [req.params.lineId]);
    if (line.rows[0]) {
      const totalLines = await pool.query(`SELECT COALESCE(SUM(total_price), 0) as total FROM vo_line_items WHERE vo_id = $1`, [line.rows[0].vo_id]);
      await pool.query(`UPDATE variation_orders SET price_delta = $2, new_contract_value = original_contract_value + $2, updated_at = NOW() WHERE id = $1`,
        [line.rows[0].vo_id, totalLines.rows[0]?.total || 0]);
    }
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ========== WORKFLOW ==========
router.post("/variation-orders/:id/submit", async (req, res) => {
  try {
    const result = await pool.query(`
      UPDATE variation_orders SET status = 'submitted', submitted_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND status = 'draft' RETURNING *
    `, [req.params.id]);
    if (!result.rows[0]) return res.status(400).json({ error: "לא ניתן להגיש - צו לא בסטטוס טיוטה" });

    await pool.query(`INSERT INTO vo_approvals (vo_id, approver_name, action, comments) VALUES ($1, $2, 'submit', 'הגשה לאישור')`,
      [req.params.id, req.body.submitted_by || 'system']);

    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/variation-orders/:id/approve", async (req, res) => {
  try {
    const { approved_by, comments } = req.body;
    const result = await pool.query(`
      UPDATE variation_orders SET status = 'approved', approved_at = NOW(), approved_by = $2, updated_at = NOW()
      WHERE id = $1 AND status = 'submitted' RETURNING *
    `, [req.params.id, approved_by]);
    if (!result.rows[0]) return res.status(400).json({ error: "לא ניתן לאשר - צו לא בסטטוס הגשה" });

    await pool.query(`INSERT INTO vo_approvals (vo_id, approver_name, approver_role, action, comments) VALUES ($1, $2, $3, 'approve', $4)`,
      [req.params.id, approved_by, req.body.approver_role, comments]);

    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/variation-orders/:id/reject", async (req, res) => {
  try {
    const { rejected_by, rejection_reason } = req.body;
    const result = await pool.query(`
      UPDATE variation_orders SET status = 'rejected', rejected_at = NOW(), rejected_by = $2, rejection_reason = $3, updated_at = NOW()
      WHERE id = $1 AND status = 'submitted' RETURNING *
    `, [req.params.id, rejected_by, rejection_reason]);
    if (!result.rows[0]) return res.status(400).json({ error: "לא ניתן לדחות" });

    await pool.query(`INSERT INTO vo_approvals (vo_id, approver_name, action, comments) VALUES ($1, $2, 'reject', $3)`,
      [req.params.id, rejected_by, rejection_reason]);

    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/variation-orders/:id/implement", async (req, res) => {
  try {
    const { implemented_by } = req.body;
    const result = await pool.query(`
      UPDATE variation_orders SET status = 'implemented', implemented_at = NOW(), implemented_by = $2, updated_at = NOW()
      WHERE id = $1 AND status = 'approved' RETURNING *
    `, [req.params.id, implemented_by]);
    if (!result.rows[0]) return res.status(400).json({ error: "לא ניתן ליישם - צו לא אושר" });

    await pool.query(`INSERT INTO vo_approvals (vo_id, approver_name, action, comments) VALUES ($1, $2, 'implement', 'יישום צו שינוי')`,
      [req.params.id, implemented_by]);

    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/variation-orders/:id/customer-signoff", async (req, res) => {
  try {
    const { customer_signoff_by } = req.body;
    const result = await pool.query(`
      UPDATE variation_orders SET customer_signoff = true, customer_signoff_date = NOW(), customer_signoff_by = $2, updated_at = NOW()
      WHERE id = $1 RETURNING *
    `, [req.params.id, customer_signoff_by]);
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ========== DASHBOARD ==========
router.get("/variation-orders/dashboard", async (_req, res) => {
  try {
    const stats = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'draft') as draft,
        COUNT(*) FILTER (WHERE status = 'submitted') as submitted,
        COUNT(*) FILTER (WHERE status = 'approved') as approved,
        COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
        COUNT(*) FILTER (WHERE status = 'implemented') as implemented,
        COALESCE(SUM(price_delta), 0) as total_price_delta,
        COALESCE(SUM(price_delta) FILTER (WHERE status = 'approved'), 0) as approved_value,
        COALESCE(SUM(price_delta) FILTER (WHERE status = 'submitted'), 0) as pending_value,
        COALESCE(AVG(schedule_delta_days), 0) as avg_schedule_impact,
        COUNT(*) FILTER (WHERE customer_signoff = true) as signed_off,
        COUNT(*) FILTER (WHERE risk_level = 'high') as high_risk
      FROM variation_orders WHERE is_active = true
    `);

    const recent = await pool.query(`
      SELECT id, vo_number, title, project_name, price_delta, schedule_delta_days, status, risk_level, created_at
      FROM variation_orders WHERE is_active = true ORDER BY created_at DESC LIMIT 10
    `);

    const byProject = await pool.query(`
      SELECT project_name, COUNT(*) as total, COALESCE(SUM(price_delta), 0) as total_delta
      FROM variation_orders WHERE is_active = true AND project_name IS NOT NULL
      GROUP BY project_name ORDER BY total_delta DESC LIMIT 10
    `);

    res.json({
      ...stats.rows[0],
      recent: recent.rows,
      by_project: byProject.rows,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
