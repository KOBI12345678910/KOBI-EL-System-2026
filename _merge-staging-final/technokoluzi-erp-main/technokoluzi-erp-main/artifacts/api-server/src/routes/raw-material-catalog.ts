import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

// ─── Auto-create tables ───────────────────────────────────────────────────────
async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS material_categories (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      parent_id INTEGER REFERENCES material_categories(id),
      icon VARCHAR(50) DEFAULT 'Package',
      color VARCHAR(30) DEFAULT '#6366f1',
      sort_order INT DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS material_items (
      id SERIAL PRIMARY KEY,
      category_id INTEGER REFERENCES material_categories(id),
      item_code VARCHAR(50) UNIQUE NOT NULL,
      name VARCHAR(300) NOT NULL,
      material_type VARCHAR(50),
      profile_type VARCHAR(50),
      thickness_mm NUMERIC(8,2),
      width_mm NUMERIC(8,2),
      length_mm NUMERIC(10,2),
      weight_per_meter NUMERIC(10,4),
      unit VARCHAR(20) DEFAULT 'kg',
      current_price NUMERIC(12,2) DEFAULT 0,
      avg_price_30d NUMERIC(12,2) DEFAULT 0,
      price_trend VARCHAR(10) DEFAULT 'stable',
      safety_stock NUMERIC(10,2) DEFAULT 0,
      reorder_point NUMERIC(10,2) DEFAULT 0,
      lead_time_days INT DEFAULT 7,
      preferred_supplier_id INTEGER,
      status VARCHAR(20) DEFAULT 'active',
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS material_suppliers (
      id SERIAL PRIMARY KEY,
      item_id INTEGER REFERENCES material_items(id) ON DELETE CASCADE,
      supplier_id INTEGER,
      supplier_name VARCHAR(300),
      unit_price NUMERIC(12,2) DEFAULT 0,
      min_order_qty NUMERIC(10,2) DEFAULT 0,
      lead_time_days INT DEFAULT 7,
      last_purchase_price NUMERIC(12,2) DEFAULT 0,
      quality_rating NUMERIC(3,1) DEFAULT 0,
      is_preferred BOOLEAN DEFAULT false
    );

    CREATE TABLE IF NOT EXISTS material_price_history (
      id SERIAL PRIMARY KEY,
      item_id INTEGER REFERENCES material_items(id) ON DELETE CASCADE,
      supplier_id INTEGER,
      price NUMERIC(12,2) NOT NULL,
      date DATE DEFAULT CURRENT_DATE,
      source VARCHAR(50) DEFAULT 'manual'
    );
  `);

  // Seed 15 categories for metal factory if empty
  const { rows } = await pool.query(`SELECT COUNT(*) as cnt FROM material_categories`);
  if (Number(rows[0].cnt) === 0) {
    await pool.query(`
      INSERT INTO material_categories (name, icon, color, sort_order) VALUES
        ('פלדה קונסטרוקטיבית', 'Hammer', '#ef4444', 1),
        ('פלדת אל-חלד', 'Shield', '#f59e0b', 2),
        ('אלומיניום', 'Zap', '#3b82f6', 3),
        ('צינורות', 'Cylinder', '#8b5cf6', 4),
        ('פרופילים', 'Columns', '#10b981', 5),
        ('פחים ולוחות', 'LayoutGrid', '#ec4899', 6),
        ('ברגים וחומרי חיבור', 'Link', '#6366f1', 7),
        ('אלקטרודות ריתוך', 'Flame', '#f97316', 8),
        ('גזי ריתוך', 'Wind', '#14b8a6', 9),
        ('חומרי צביעה', 'Paintbrush', '#a855f7', 10),
        ('חומרי איטום', 'Droplets', '#06b6d4', 11),
        ('חומרי ניקוי ושחיקה', 'Eraser', '#84cc16', 12),
        ('גומי וסיליקון', 'Circle', '#e11d48', 13),
        ('חומרי אריזה', 'Package', '#78716c', 14),
        ('חלקי מכונות וכלים', 'Wrench', '#0ea5e9', 15)
    `);
  }
}
ensureTables().catch(console.error);

// ─── Dashboard ────────────────────────────────────────────────────────────────
router.get("/raw-material-catalog/dashboard", async (_req, res) => {
  try {
    const [totals, lowStock, priceAlerts, catBreakdown, recentPrices] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) as total_items,
          COUNT(*) FILTER (WHERE status = 'active') as active_items,
          COUNT(*) FILTER (WHERE status = 'inactive') as inactive_items,
          COALESCE(SUM(current_price * safety_stock), 0) as estimated_inventory_value,
          COUNT(*) FILTER (WHERE current_price <= reorder_point AND reorder_point > 0) as reorder_needed
        FROM material_items
      `),
      pool.query(`
        SELECT id, item_code, name, current_price, safety_stock, reorder_point
        FROM material_items
        WHERE safety_stock > 0 AND current_price > 0
          AND current_price <= reorder_point
        ORDER BY (reorder_point - current_price) DESC
        LIMIT 10
      `),
      pool.query(`
        SELECT mi.id, mi.item_code, mi.name, mi.current_price, mi.avg_price_30d, mi.price_trend,
          CASE WHEN mi.avg_price_30d > 0
            THEN ROUND(((mi.current_price - mi.avg_price_30d) / mi.avg_price_30d * 100)::numeric, 1)
            ELSE 0 END as price_change_pct
        FROM material_items mi
        WHERE mi.avg_price_30d > 0
          AND ABS(mi.current_price - mi.avg_price_30d) / mi.avg_price_30d > 0.1
        ORDER BY ABS(mi.current_price - mi.avg_price_30d) / mi.avg_price_30d DESC
        LIMIT 10
      `),
      pool.query(`
        SELECT mc.name as category, COUNT(mi.id) as item_count,
          COALESCE(SUM(mi.current_price), 0) as total_value
        FROM material_categories mc
        LEFT JOIN material_items mi ON mi.category_id = mc.id
        GROUP BY mc.id, mc.name
        ORDER BY mc.sort_order
      `),
      pool.query(`
        SELECT mph.item_id, mi.name, mph.price, mph.date, mph.source
        FROM material_price_history mph
        JOIN material_items mi ON mi.id = mph.item_id
        ORDER BY mph.date DESC
        LIMIT 20
      `)
    ]);
    res.json({
      summary: totals.rows[0],
      lowStock: lowStock.rows,
      priceAlerts: priceAlerts.rows,
      categoryBreakdown: catBreakdown.rows,
      recentPriceChanges: recentPrices.rows
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Categories CRUD ──────────────────────────────────────────────────────────
router.get("/raw-material-catalog/categories", async (_req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM material_categories ORDER BY sort_order, name`);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/raw-material-catalog/categories", async (req, res) => {
  try {
    const { name, parent_id, icon, color, sort_order } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO material_categories (name, parent_id, icon, color, sort_order)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name, parent_id || null, icon || 'Package', color || '#6366f1', sort_order || 0]
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/raw-material-catalog/categories/:id", async (req, res) => {
  try {
    const { name, parent_id, icon, color, sort_order } = req.body;
    const { rows } = await pool.query(
      `UPDATE material_categories SET name=$1, parent_id=$2, icon=$3, color=$4, sort_order=$5
       WHERE id=$6 RETURNING *`,
      [name, parent_id || null, icon, color, sort_order, req.params.id]
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/raw-material-catalog/categories/:id", async (req, res) => {
  try {
    await pool.query(`DELETE FROM material_categories WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Items CRUD ───────────────────────────────────────────────────────────────
router.get("/raw-material-catalog/items", async (req, res) => {
  try {
    const { category_id, status, search } = req.query;
    let q = `SELECT mi.*, mc.name as category_name FROM material_items mi
             LEFT JOIN material_categories mc ON mc.id = mi.category_id WHERE 1=1`;
    const params: any[] = [];
    if (category_id) { params.push(category_id); q += ` AND mi.category_id=$${params.length}`; }
    if (status) { params.push(status); q += ` AND mi.status=$${params.length}`; }
    if (search) { params.push(`%${search}%`); q += ` AND (mi.name ILIKE $${params.length} OR mi.item_code ILIKE $${params.length})`; }
    q += ` ORDER BY mi.name`;
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/raw-material-catalog/items/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT mi.*, mc.name as category_name FROM material_items mi
       LEFT JOIN material_categories mc ON mc.id = mi.category_id WHERE mi.id=$1`, [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "לא נמצא" });
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/raw-material-catalog/items", async (req, res) => {
  try {
    const b = req.body;
    const { rows } = await pool.query(
      `INSERT INTO material_items (category_id, item_code, name, material_type, profile_type,
        thickness_mm, width_mm, length_mm, weight_per_meter, unit, current_price,
        safety_stock, reorder_point, lead_time_days, preferred_supplier_id, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [b.category_id, b.item_code, b.name, b.material_type, b.profile_type,
       b.thickness_mm, b.width_mm, b.length_mm, b.weight_per_meter, b.unit || 'kg',
       b.current_price || 0, b.safety_stock || 0, b.reorder_point || 0,
       b.lead_time_days || 7, b.preferred_supplier_id, b.status || 'active']
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/raw-material-catalog/items/:id", async (req, res) => {
  try {
    const b = req.body;
    // Record price history if price changed
    if (b.current_price !== undefined) {
      const old = await pool.query(`SELECT current_price FROM material_items WHERE id=$1`, [req.params.id]);
      if (old.rows[0] && Number(old.rows[0].current_price) !== Number(b.current_price)) {
        await pool.query(
          `INSERT INTO material_price_history (item_id, price, source) VALUES ($1,$2,'manual')`,
          [req.params.id, b.current_price]
        );
      }
    }
    const { rows } = await pool.query(
      `UPDATE material_items SET category_id=$1, item_code=$2, name=$3, material_type=$4,
        profile_type=$5, thickness_mm=$6, width_mm=$7, length_mm=$8, weight_per_meter=$9,
        unit=$10, current_price=$11, safety_stock=$12, reorder_point=$13,
        lead_time_days=$14, preferred_supplier_id=$15, status=$16
       WHERE id=$17 RETURNING *`,
      [b.category_id, b.item_code, b.name, b.material_type, b.profile_type,
       b.thickness_mm, b.width_mm, b.length_mm, b.weight_per_meter, b.unit,
       b.current_price, b.safety_stock, b.reorder_point,
       b.lead_time_days, b.preferred_supplier_id, b.status, req.params.id]
    );
    // Update avg_price_30d
    await pool.query(`
      UPDATE material_items SET avg_price_30d = (
        SELECT COALESCE(AVG(price),0) FROM material_price_history
        WHERE item_id=$1 AND date >= CURRENT_DATE - 30
      ), price_trend = CASE
        WHEN current_price > avg_price_30d THEN 'up'
        WHEN current_price < avg_price_30d THEN 'down'
        ELSE 'stable' END
      WHERE id=$1
    `, [req.params.id]);
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/raw-material-catalog/items/:id", async (req, res) => {
  try {
    await pool.query(`DELETE FROM material_items WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Suppliers CRUD ───────────────────────────────────────────────────────────
router.get("/raw-material-catalog/items/:itemId/suppliers", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM material_suppliers WHERE item_id=$1 ORDER BY is_preferred DESC, unit_price ASC`,
      [req.params.itemId]
    );
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/raw-material-catalog/suppliers", async (req, res) => {
  try {
    const b = req.body;
    const { rows } = await pool.query(
      `INSERT INTO material_suppliers (item_id, supplier_id, supplier_name, unit_price,
        min_order_qty, lead_time_days, last_purchase_price, quality_rating, is_preferred)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [b.item_id, b.supplier_id, b.supplier_name, b.unit_price, b.min_order_qty,
       b.lead_time_days, b.last_purchase_price, b.quality_rating, b.is_preferred || false]
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/raw-material-catalog/suppliers/:id", async (req, res) => {
  try {
    const b = req.body;
    const { rows } = await pool.query(
      `UPDATE material_suppliers SET supplier_name=$1, unit_price=$2, min_order_qty=$3,
        lead_time_days=$4, last_purchase_price=$5, quality_rating=$6, is_preferred=$7
       WHERE id=$8 RETURNING *`,
      [b.supplier_name, b.unit_price, b.min_order_qty, b.lead_time_days,
       b.last_purchase_price, b.quality_rating, b.is_preferred, req.params.id]
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/raw-material-catalog/suppliers/:id", async (req, res) => {
  try {
    await pool.query(`DELETE FROM material_suppliers WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Price History ────────────────────────────────────────────────────────────
router.get("/raw-material-catalog/items/:itemId/price-history", async (req, res) => {
  try {
    const days = Number(req.query.days) || 90;
    const { rows } = await pool.query(
      `SELECT mph.*, ms.supplier_name FROM material_price_history mph
       LEFT JOIN material_suppliers ms ON ms.supplier_id = mph.supplier_id AND ms.item_id = mph.item_id
       WHERE mph.item_id=$1 AND mph.date >= CURRENT_DATE - $2
       ORDER BY mph.date DESC`,
      [req.params.itemId, days]
    );
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/raw-material-catalog/price-history", async (req, res) => {
  try {
    const { item_id, supplier_id, price, date, source } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO material_price_history (item_id, supplier_id, price, date, source)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [item_id, supplier_id, price, date || new Date(), source || 'manual']
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Cheapest Supplier ────────────────────────────────────────────────────────
router.get("/raw-material-catalog/items/:itemId/cheapest-supplier", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM material_suppliers WHERE item_id=$1
       ORDER BY unit_price ASC LIMIT 1`,
      [req.params.itemId]
    );
    res.json(rows[0] || null);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Price Alerts ─────────────────────────────────────────────────────────────
router.get("/raw-material-catalog/price-alerts", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT mi.id, mi.item_code, mi.name, mi.current_price, mi.avg_price_30d,
        mi.price_trend, mc.name as category_name,
        CASE WHEN mi.avg_price_30d > 0
          THEN ROUND(((mi.current_price - mi.avg_price_30d) / mi.avg_price_30d * 100)::numeric, 1)
          ELSE 0 END as change_pct
      FROM material_items mi
      LEFT JOIN material_categories mc ON mc.id = mi.category_id
      WHERE mi.avg_price_30d > 0
        AND ABS(mi.current_price - mi.avg_price_30d) / mi.avg_price_30d > 0.05
      ORDER BY ABS(mi.current_price - mi.avg_price_30d) DESC
    `);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Low Stock ────────────────────────────────────────────────────────────────
router.get("/raw-material-catalog/low-stock", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT mi.id, mi.item_code, mi.name, mi.current_price, mi.safety_stock,
        mi.reorder_point, mi.lead_time_days, mc.name as category_name,
        ms.supplier_name as preferred_supplier
      FROM material_items mi
      LEFT JOIN material_categories mc ON mc.id = mi.category_id
      LEFT JOIN material_suppliers ms ON ms.id = mi.preferred_supplier_id
      WHERE mi.safety_stock > 0 AND mi.reorder_point > 0
      ORDER BY (mi.safety_stock / NULLIF(mi.reorder_point, 0)) ASC
    `);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
