import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

// ─── Auto-create tables ───────────────────────────────────────────────────────
async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bom_products (
      id SERIAL PRIMARY KEY,
      product_code VARCHAR(50) UNIQUE NOT NULL,
      product_name VARCHAR(300) NOT NULL,
      product_type VARCHAR(50),
      default_material VARCHAR(100),
      price_per_meter NUMERIC(12,2) DEFAULT 0,
      total_material_cost_per_meter NUMERIC(12,2) DEFAULT 0,
      total_labor_cost_per_meter NUMERIC(12,2) DEFAULT 0,
      total_cost_per_meter NUMERIC(12,2) DEFAULT 0,
      markup_pct NUMERIC(6,2) DEFAULT 200,
      selling_price_per_meter NUMERIC(12,2) DEFAULT 0,
      version INT DEFAULT 1,
      status VARCHAR(20) DEFAULT 'draft'
    );

    CREATE TABLE IF NOT EXISTS bom_assemblies (
      id SERIAL PRIMARY KEY,
      product_id INTEGER REFERENCES bom_products(id) ON DELETE CASCADE,
      assembly_name VARCHAR(300) NOT NULL,
      sort_order INT DEFAULT 0,
      total_cost NUMERIC(12,2) DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS bom_lines (
      id SERIAL PRIMARY KEY,
      product_id INTEGER REFERENCES bom_products(id) ON DELETE CASCADE,
      assembly_id INTEGER REFERENCES bom_assemblies(id) ON DELETE SET NULL,
      material_item_id INTEGER,
      material_name VARCHAR(300),
      quantity_per_meter NUMERIC(10,4) DEFAULT 0,
      waste_pct NUMERIC(5,2) DEFAULT 5,
      unit_cost NUMERIC(12,2) DEFAULT 0,
      line_cost NUMERIC(12,2) DEFAULT 0,
      is_optional BOOLEAN DEFAULT false,
      sort_order INT DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS bom_labor_standards (
      id SERIAL PRIMARY KEY,
      product_id INTEGER REFERENCES bom_products(id) ON DELETE CASCADE,
      operation VARCHAR(200) NOT NULL,
      time_per_meter_min NUMERIC(8,2) DEFAULT 0,
      labor_rate_per_hour NUMERIC(8,2) DEFAULT 80,
      labor_cost_per_meter NUMERIC(12,2) DEFAULT 0
    );
  `);
}
ensureTables().catch(console.error);

// ─── Helper: Recalculate product costs ────────────────────────────────────────
async function recalcProduct(productId: number) {
  // Sum material costs
  const matRes = await pool.query(`
    SELECT COALESCE(SUM(line_cost), 0) as total_material
    FROM bom_lines WHERE product_id=$1 AND is_optional=false
  `, [productId]);
  const totalMaterial = Number(matRes.rows[0].total_material);

  // Sum labor costs
  const labRes = await pool.query(`
    SELECT COALESCE(SUM(labor_cost_per_meter), 0) as total_labor
    FROM bom_labor_standards WHERE product_id=$1
  `, [productId]);
  const totalLabor = Number(labRes.rows[0].total_labor);

  const totalCost = totalMaterial + totalLabor;

  // Get markup
  const prodRes = await pool.query(`SELECT markup_pct FROM bom_products WHERE id=$1`, [productId]);
  const markup = Number(prodRes.rows[0]?.markup_pct || 200);
  const sellingPrice = totalCost * (1 + markup / 100);

  await pool.query(`
    UPDATE bom_products SET
      total_material_cost_per_meter = $1,
      total_labor_cost_per_meter = $2,
      total_cost_per_meter = $3,
      selling_price_per_meter = $4
    WHERE id = $5
  `, [totalMaterial, totalLabor, totalCost, sellingPrice, productId]);

  // Update assembly totals
  await pool.query(`
    UPDATE bom_assemblies ba SET total_cost = (
      SELECT COALESCE(SUM(bl.line_cost), 0) FROM bom_lines bl
      WHERE bl.assembly_id = ba.id AND bl.is_optional = false
    ) WHERE ba.product_id = $1
  `, [productId]);
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
router.get("/bom-builder/dashboard", async (_req, res) => {
  try {
    const [summary, topProducts, avgMargins] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) as total_products,
          COUNT(*) FILTER (WHERE status='active') as active,
          COUNT(*) FILTER (WHERE status='draft') as drafts,
          COALESCE(AVG(total_cost_per_meter), 0) as avg_cost,
          COALESCE(AVG(selling_price_per_meter), 0) as avg_selling_price,
          COALESCE(AVG(markup_pct), 0) as avg_markup
        FROM bom_products
      `),
      pool.query(`
        SELECT id, product_code, product_name, total_cost_per_meter,
          selling_price_per_meter, markup_pct, status
        FROM bom_products ORDER BY selling_price_per_meter DESC LIMIT 10
      `),
      pool.query(`
        SELECT product_type, COUNT(*) as cnt,
          ROUND(AVG(total_cost_per_meter)::numeric, 2) as avg_cost,
          ROUND(AVG(markup_pct)::numeric, 1) as avg_markup
        FROM bom_products WHERE product_type IS NOT NULL
        GROUP BY product_type ORDER BY cnt DESC
      `)
    ]);
    res.json({
      summary: summary.rows[0],
      topProducts: topProducts.rows,
      marginsByType: avgMargins.rows
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Products CRUD ────────────────────────────────────────────────────────────
router.get("/bom-builder/products", async (req, res) => {
  try {
    const { status, search } = req.query;
    let q = `SELECT * FROM bom_products WHERE 1=1`;
    const params: any[] = [];
    if (status) { params.push(status); q += ` AND status=$${params.length}`; }
    if (search) { params.push(`%${search}%`); q += ` AND (product_name ILIKE $${params.length} OR product_code ILIKE $${params.length})`; }
    q += ` ORDER BY product_code`;
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/bom-builder/products/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM bom_products WHERE id=$1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: "לא נמצא" });
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/bom-builder/products", async (req, res) => {
  try {
    const b = req.body;
    const { rows } = await pool.query(
      `INSERT INTO bom_products (product_code, product_name, product_type, default_material,
        markup_pct, status)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [b.product_code, b.product_name, b.product_type, b.default_material,
       b.markup_pct || 200, b.status || 'draft']
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/bom-builder/products/:id", async (req, res) => {
  try {
    const b = req.body;
    const { rows } = await pool.query(
      `UPDATE bom_products SET product_code=$1, product_name=$2, product_type=$3,
        default_material=$4, markup_pct=$5, status=$6
       WHERE id=$7 RETURNING *`,
      [b.product_code, b.product_name, b.product_type, b.default_material,
       b.markup_pct, b.status, req.params.id]
    );
    await recalcProduct(Number(req.params.id));
    const updated = await pool.query(`SELECT * FROM bom_products WHERE id=$1`, [req.params.id]);
    res.json(updated.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/bom-builder/products/:id", async (req, res) => {
  try {
    await pool.query(`DELETE FROM bom_products WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Assemblies CRUD ──────────────────────────────────────────────────────────
router.get("/bom-builder/products/:productId/assemblies", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM bom_assemblies WHERE product_id=$1 ORDER BY sort_order`,
      [req.params.productId]
    );
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/bom-builder/assemblies", async (req, res) => {
  try {
    const { product_id, assembly_name, sort_order } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO bom_assemblies (product_id, assembly_name, sort_order)
       VALUES ($1,$2,$3) RETURNING *`,
      [product_id, assembly_name, sort_order || 0]
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/bom-builder/assemblies/:id", async (req, res) => {
  try {
    const { assembly_name, sort_order } = req.body;
    const { rows } = await pool.query(
      `UPDATE bom_assemblies SET assembly_name=$1, sort_order=$2 WHERE id=$3 RETURNING *`,
      [assembly_name, sort_order, req.params.id]
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/bom-builder/assemblies/:id", async (req, res) => {
  try {
    const asm = await pool.query(`SELECT product_id FROM bom_assemblies WHERE id=$1`, [req.params.id]);
    await pool.query(`DELETE FROM bom_assemblies WHERE id=$1`, [req.params.id]);
    if (asm.rows[0]) await recalcProduct(asm.rows[0].product_id);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── BOM Lines CRUD ───────────────────────────────────────────────────────────
router.get("/bom-builder/products/:productId/lines", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT bl.*, ba.assembly_name FROM bom_lines bl
       LEFT JOIN bom_assemblies ba ON ba.id = bl.assembly_id
       WHERE bl.product_id=$1 ORDER BY bl.sort_order`,
      [req.params.productId]
    );
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/bom-builder/lines", async (req, res) => {
  try {
    const b = req.body;
    const lineCost = Number(b.quantity_per_meter || 0) * (1 + Number(b.waste_pct || 5) / 100) * Number(b.unit_cost || 0);
    const { rows } = await pool.query(
      `INSERT INTO bom_lines (product_id, assembly_id, material_item_id, material_name,
        quantity_per_meter, waste_pct, unit_cost, line_cost, is_optional, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [b.product_id, b.assembly_id, b.material_item_id, b.material_name,
       b.quantity_per_meter, b.waste_pct || 5, b.unit_cost || 0, lineCost,
       b.is_optional || false, b.sort_order || 0]
    );
    await recalcProduct(b.product_id);
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/bom-builder/lines/:id", async (req, res) => {
  try {
    const b = req.body;
    const lineCost = Number(b.quantity_per_meter || 0) * (1 + Number(b.waste_pct || 5) / 100) * Number(b.unit_cost || 0);
    const { rows } = await pool.query(
      `UPDATE bom_lines SET assembly_id=$1, material_item_id=$2, material_name=$3,
        quantity_per_meter=$4, waste_pct=$5, unit_cost=$6, line_cost=$7, is_optional=$8, sort_order=$9
       WHERE id=$10 RETURNING *`,
      [b.assembly_id, b.material_item_id, b.material_name,
       b.quantity_per_meter, b.waste_pct, b.unit_cost, lineCost,
       b.is_optional, b.sort_order, req.params.id]
    );
    if (rows[0]) await recalcProduct(rows[0].product_id);
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/bom-builder/lines/:id", async (req, res) => {
  try {
    const line = await pool.query(`SELECT product_id FROM bom_lines WHERE id=$1`, [req.params.id]);
    await pool.query(`DELETE FROM bom_lines WHERE id=$1`, [req.params.id]);
    if (line.rows[0]) await recalcProduct(line.rows[0].product_id);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Labor Standards CRUD ─────────────────────────────────────────────────────
router.get("/bom-builder/products/:productId/labor", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM bom_labor_standards WHERE product_id=$1 ORDER BY operation`,
      [req.params.productId]
    );
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/bom-builder/labor", async (req, res) => {
  try {
    const b = req.body;
    const laborCost = (Number(b.time_per_meter_min || 0) / 60) * Number(b.labor_rate_per_hour || 80);
    const { rows } = await pool.query(
      `INSERT INTO bom_labor_standards (product_id, operation, time_per_meter_min,
        labor_rate_per_hour, labor_cost_per_meter)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [b.product_id, b.operation, b.time_per_meter_min, b.labor_rate_per_hour || 80, laborCost]
    );
    await recalcProduct(b.product_id);
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/bom-builder/labor/:id", async (req, res) => {
  try {
    const b = req.body;
    const laborCost = (Number(b.time_per_meter_min || 0) / 60) * Number(b.labor_rate_per_hour || 80);
    const { rows } = await pool.query(
      `UPDATE bom_labor_standards SET operation=$1, time_per_meter_min=$2,
        labor_rate_per_hour=$3, labor_cost_per_meter=$4
       WHERE id=$5 RETURNING *`,
      [b.operation, b.time_per_meter_min, b.labor_rate_per_hour, laborCost, req.params.id]
    );
    if (rows[0]) await recalcProduct(rows[0].product_id);
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/bom-builder/labor/:id", async (req, res) => {
  try {
    const lab = await pool.query(`SELECT product_id FROM bom_labor_standards WHERE id=$1`, [req.params.id]);
    await pool.query(`DELETE FROM bom_labor_standards WHERE id=$1`, [req.params.id]);
    if (lab.rows[0]) await recalcProduct(lab.rows[0].product_id);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Calculate Cost ───────────────────────────────────────────────────────────
router.post("/bom-builder/products/:id/calculate-cost", async (req, res) => {
  try {
    await recalcProduct(Number(req.params.id));
    const { rows } = await pool.query(`SELECT * FROM bom_products WHERE id=$1`, [req.params.id]);
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Clone Version ────────────────────────────────────────────────────────────
router.post("/bom-builder/products/:id/clone", async (req, res) => {
  try {
    const src = await pool.query(`SELECT * FROM bom_products WHERE id=$1`, [req.params.id]);
    if (!src.rows[0]) return res.status(404).json({ error: "לא נמצא" });
    const s = src.rows[0];
    const newCode = `${s.product_code}-v${s.version + 1}`;
    const prod = await pool.query(
      `INSERT INTO bom_products (product_code, product_name, product_type, default_material,
        markup_pct, version, status)
       VALUES ($1,$2,$3,$4,$5,$6,'draft') RETURNING *`,
      [newCode, s.product_name, s.product_type, s.default_material, s.markup_pct, s.version + 1]
    );
    const newId = prod.rows[0].id;
    // Clone assemblies
    const asms = await pool.query(`SELECT * FROM bom_assemblies WHERE product_id=$1`, [req.params.id]);
    const asmMap: Record<number, number> = {};
    for (const a of asms.rows) {
      const na = await pool.query(
        `INSERT INTO bom_assemblies (product_id, assembly_name, sort_order)
         VALUES ($1,$2,$3) RETURNING id`, [newId, a.assembly_name, a.sort_order]);
      asmMap[a.id] = na.rows[0].id;
    }
    // Clone lines
    const lines = await pool.query(`SELECT * FROM bom_lines WHERE product_id=$1`, [req.params.id]);
    for (const l of lines.rows) {
      await pool.query(
        `INSERT INTO bom_lines (product_id, assembly_id, material_item_id, material_name,
          quantity_per_meter, waste_pct, unit_cost, line_cost, is_optional, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [newId, l.assembly_id ? asmMap[l.assembly_id] : null, l.material_item_id, l.material_name,
         l.quantity_per_meter, l.waste_pct, l.unit_cost, l.line_cost, l.is_optional, l.sort_order]);
    }
    // Clone labor
    const labor = await pool.query(`SELECT * FROM bom_labor_standards WHERE product_id=$1`, [req.params.id]);
    for (const lb of labor.rows) {
      await pool.query(
        `INSERT INTO bom_labor_standards (product_id, operation, time_per_meter_min,
          labor_rate_per_hour, labor_cost_per_meter)
         VALUES ($1,$2,$3,$4,$5)`,
        [newId, lb.operation, lb.time_per_meter_min, lb.labor_rate_per_hour, lb.labor_cost_per_meter]);
    }
    await recalcProduct(newId);
    const final = await pool.query(`SELECT * FROM bom_products WHERE id=$1`, [newId]);
    res.json(final.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Explode Tree ─────────────────────────────────────────────────────────────
router.get("/bom-builder/products/:id/explode-tree", async (req, res) => {
  try {
    const product = await pool.query(`SELECT * FROM bom_products WHERE id=$1`, [req.params.id]);
    const assemblies = await pool.query(
      `SELECT * FROM bom_assemblies WHERE product_id=$1 ORDER BY sort_order`, [req.params.id]);
    const lines = await pool.query(
      `SELECT * FROM bom_lines WHERE product_id=$1 ORDER BY sort_order`, [req.params.id]);
    const labor = await pool.query(
      `SELECT * FROM bom_labor_standards WHERE product_id=$1`, [req.params.id]);

    const tree = assemblies.rows.map((a: any) => ({
      ...a,
      lines: lines.rows.filter((l: any) => l.assembly_id === a.id)
    }));
    const unassigned = lines.rows.filter((l: any) => !l.assembly_id);

    res.json({
      product: product.rows[0],
      assemblies: tree,
      unassignedLines: unassigned,
      labor: labor.rows
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Update Prices from Materials Catalog ─────────────────────────────────────
router.post("/bom-builder/products/:id/update-prices-from-materials", async (req, res) => {
  try {
    await pool.query(`
      UPDATE bom_lines bl SET
        unit_cost = mi.current_price,
        line_cost = bl.quantity_per_meter * (1 + bl.waste_pct / 100) * mi.current_price
      FROM material_items mi
      WHERE bl.material_item_id = mi.id AND bl.product_id = $1
    `, [req.params.id]);
    await recalcProduct(Number(req.params.id));
    const { rows } = await pool.query(`SELECT * FROM bom_products WHERE id=$1`, [req.params.id]);
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Margin Analysis ──────────────────────────────────────────────────────────
router.get("/bom-builder/margin-analysis", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, product_code, product_name, product_type,
        total_material_cost_per_meter, total_labor_cost_per_meter,
        total_cost_per_meter, markup_pct, selling_price_per_meter,
        CASE WHEN selling_price_per_meter > 0
          THEN ROUND(((selling_price_per_meter - total_cost_per_meter) / selling_price_per_meter * 100)::numeric, 1)
          ELSE 0 END as gross_margin_pct,
        (selling_price_per_meter - total_cost_per_meter) as gross_profit_per_meter
      FROM bom_products
      WHERE status = 'active'
      ORDER BY gross_margin_pct DESC
    `);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
