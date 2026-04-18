import { Router, Request, Response } from "express";
import { pool } from "@workspace/db";

const router = Router();

// ── Auto-create tables ──
async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS project_cost_sheets (
      id SERIAL PRIMARY KEY,
      project_id INT,
      project_name VARCHAR(255),
      customer_name VARCHAR(255),
      total_selling_price NUMERIC(14,2) DEFAULT 0,
      total_selling_price_vat NUMERIC(14,2) DEFAULT 0,
      price_per_meter NUMERIC(10,2) DEFAULT 0,
      total_meters NUMERIC(10,2) DEFAULT 0,
      raw_material_cost NUMERIC(14,2) DEFAULT 0,
      manufacturing_cost NUMERIC(14,2) DEFAULT 0,
      installation_cost NUMERIC(14,2) DEFAULT 0,
      paint_cost NUMERIC(14,2) DEFAULT 0,
      transport_cost NUMERIC(14,2) DEFAULT 0,
      sales_commission NUMERIC(14,2) DEFAULT 0,
      overhead_cost NUMERIC(14,2) DEFAULT 0,
      total_cost NUMERIC(14,2) DEFAULT 0,
      gross_profit NUMERIC(14,2) DEFAULT 0,
      gross_margin_pct REAL DEFAULT 0,
      target_margin_pct REAL DEFAULT 200,
      margin_status VARCHAR(20) DEFAULT 'on_target' CHECK (margin_status IN ('above_target','on_target','below_target','negative')),
      vat_rate REAL DEFAULT 18,
      status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft','calculated','approved','locked')),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS cost_sheet_items (
      id SERIAL PRIMARY KEY,
      sheet_id INT NOT NULL REFERENCES project_cost_sheets(id) ON DELETE CASCADE,
      item_type VARCHAR(30) CHECK (item_type IN ('raw_material','accessory','consumable','glass','hardware')),
      item_name VARCHAR(255),
      item_code VARCHAR(50),
      unit VARCHAR(20),
      quantity NUMERIC(12,4) DEFAULT 0,
      unit_price NUMERIC(12,4) DEFAULT 0,
      total_price NUMERIC(14,2) DEFAULT 0,
      supplier_id INT,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS cost_sheet_labor (
      id SERIAL PRIMARY KEY,
      sheet_id INT NOT NULL REFERENCES project_cost_sheets(id) ON DELETE CASCADE,
      labor_type VARCHAR(30) CHECK (labor_type IN ('manufacturer','installer','sales_agent','engineer')),
      worker_name VARCHAR(255),
      payment_model VARCHAR(20) CHECK (payment_model IN ('percentage','per_meter','fixed')),
      rate NUMERIC(10,4) DEFAULT 0,
      calculated_amount NUMERIC(14,2) DEFAULT 0,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS cost_sheet_overhead (
      id SERIAL PRIMARY KEY,
      sheet_id INT NOT NULL REFERENCES project_cost_sheets(id) ON DELETE CASCADE,
      overhead_type VARCHAR(30) CHECK (overhead_type IN ('paint_oven','transport','electricity','rent','insurance','other')),
      description TEXT,
      amount NUMERIC(14,2) DEFAULT 0,
      calculation_method VARCHAR(20) CHECK (calculation_method IN ('per_meter','fixed','percentage')),
      rate NUMERIC(10,4) DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS cost_scenarios (
      id SERIAL PRIMARY KEY,
      sheet_id INT NOT NULL REFERENCES project_cost_sheets(id) ON DELETE CASCADE,
      scenario_name VARCHAR(255),
      changes JSONB DEFAULT '{}',
      resulting_margin REAL DEFAULT 0,
      resulting_profit NUMERIC(14,2) DEFAULT 0,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_csi_sheet ON cost_sheet_items(sheet_id);
    CREATE INDEX IF NOT EXISTS idx_csl_sheet ON cost_sheet_labor(sheet_id);
    CREATE INDEX IF NOT EXISTS idx_cso_sheet ON cost_sheet_overhead(sheet_id);
    CREATE INDEX IF NOT EXISTS idx_cs_scenarios ON cost_scenarios(sheet_id);
  `);
}

ensureTables().catch(console.error);

// Helper: recalculate cost sheet
async function recalculateSheet(sheetId: number): Promise<any> {
  const sheet = (await pool.query("SELECT * FROM project_cost_sheets WHERE id = $1", [sheetId])).rows[0];
  if (!sheet) return null;

  const sellingPrice = Number(sheet.total_selling_price) || 0;
  const totalMeters = Number(sheet.total_meters) || 0;

  // Sum raw materials
  const itemsR = await pool.query("SELECT COALESCE(SUM(total_price), 0) AS total FROM cost_sheet_items WHERE sheet_id = $1", [sheetId]);
  const rawMaterialCost = Number(itemsR.rows[0].total);

  // Calculate labor costs
  const laborRows = await pool.query("SELECT * FROM cost_sheet_labor WHERE sheet_id = $1", [sheetId]);
  let manufacturingCost = 0;
  let installationCost = 0;
  let salesCommission = 0;
  let engineeringCost = 0;

  for (const l of laborRows.rows) {
    let amount = 0;
    if (l.payment_model === "percentage") {
      amount = sellingPrice * (Number(l.rate) / 100);
    } else if (l.payment_model === "per_meter") {
      amount = totalMeters * Number(l.rate);
    } else {
      amount = Number(l.rate);
    }

    // Update individual labor row
    await pool.query("UPDATE cost_sheet_labor SET calculated_amount = $1 WHERE id = $2", [amount, l.id]);

    if (l.labor_type === "manufacturer") manufacturingCost += amount;
    else if (l.labor_type === "installer") installationCost += amount;
    else if (l.labor_type === "sales_agent") salesCommission += amount;
    else if (l.labor_type === "engineer") engineeringCost += amount;
  }

  // Calculate overhead
  const overheadRows = await pool.query("SELECT * FROM cost_sheet_overhead WHERE sheet_id = $1", [sheetId]);
  let overheadCost = 0;
  let paintCost = 0;
  let transportCost = 0;

  for (const o of overheadRows.rows) {
    let amount = 0;
    if (o.calculation_method === "per_meter") {
      amount = totalMeters * Number(o.rate);
    } else if (o.calculation_method === "percentage") {
      amount = sellingPrice * (Number(o.rate) / 100);
    } else {
      amount = Number(o.amount);
    }

    await pool.query("UPDATE cost_sheet_overhead SET amount = $1 WHERE id = $2", [amount, o.id]);

    if (o.overhead_type === "paint_oven") paintCost += amount;
    else if (o.overhead_type === "transport") transportCost += amount;
    else overheadCost += amount;
  }

  const totalCost = rawMaterialCost + manufacturingCost + installationCost + salesCommission + engineeringCost + paintCost + transportCost + overheadCost;
  const grossProfit = sellingPrice - totalCost;
  const grossMargin = totalCost > 0 ? ((sellingPrice / totalCost) - 1) * 100 : 0;
  const targetMargin = Number(sheet.target_margin_pct) || 200;
  const vatRate = Number(sheet.vat_rate) || 18;
  const sellingVat = sellingPrice * (1 + vatRate / 100);

  let marginStatus = "on_target";
  if (grossProfit < 0) marginStatus = "negative";
  else if (grossMargin > targetMargin + 10) marginStatus = "above_target";
  else if (grossMargin < targetMargin - 20) marginStatus = "below_target";

  await pool.query(`
    UPDATE project_cost_sheets SET
      raw_material_cost = $1, manufacturing_cost = $2, installation_cost = $3,
      paint_cost = $4, transport_cost = $5, sales_commission = $6, overhead_cost = $7,
      total_cost = $8, gross_profit = $9, gross_margin_pct = $10,
      margin_status = $11, total_selling_price_vat = $12, status = 'calculated',
      price_per_meter = $13
    WHERE id = $14
  `, [
    rawMaterialCost, manufacturingCost, installationCost,
    paintCost, transportCost, salesCommission, overheadCost + engineeringCost,
    totalCost, grossProfit, grossMargin,
    marginStatus, sellingVat,
    totalMeters > 0 ? sellingPrice / totalMeters : 0,
    sheetId,
  ]);

  return (await pool.query("SELECT * FROM project_cost_sheets WHERE id = $1", [sheetId])).rows[0];
}

// ── CRUD Cost Sheets ──
router.post("/project-cost/sheets", async (req: Request, res: Response) => {
  try {
    const b = req.body;
    const r = await pool.query(
      `INSERT INTO project_cost_sheets
       (project_id, project_name, customer_name, total_selling_price, total_meters, target_margin_pct, vat_rate)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [b.project_id, b.project_name, b.customer_name, b.total_selling_price || 0,
       b.total_meters || 0, b.target_margin_pct || 200, b.vat_rate || 18]
    );
    res.json({ sheet: r.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/project-cost/sheets", async (req: Request, res: Response) => {
  try {
    const { status, search } = req.query;
    let where = "WHERE 1=1";
    const params: any[] = [];
    if (status) { params.push(status); where += ` AND status = $${params.length}`; }
    if (search) { params.push(`%${search}%`); where += ` AND (project_name ILIKE $${params.length} OR customer_name ILIKE $${params.length})`; }

    const r = await pool.query(`SELECT * FROM project_cost_sheets ${where} ORDER BY created_at DESC`, params);
    res.json({ sheets: r.rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/project-cost/sheets/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const sheet = (await pool.query("SELECT * FROM project_cost_sheets WHERE id = $1", [id])).rows[0];
    if (!sheet) return res.status(404).json({ error: "לא נמצא" });

    const items = (await pool.query("SELECT * FROM cost_sheet_items WHERE sheet_id = $1 ORDER BY id", [id])).rows;
    const labor = (await pool.query("SELECT * FROM cost_sheet_labor WHERE sheet_id = $1 ORDER BY id", [id])).rows;
    const overhead = (await pool.query("SELECT * FROM cost_sheet_overhead WHERE sheet_id = $1 ORDER BY id", [id])).rows;
    const scenarios = (await pool.query("SELECT * FROM cost_scenarios WHERE sheet_id = $1 ORDER BY created_at DESC", [id])).rows;

    res.json({ sheet, items, labor, overhead, scenarios });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/project-cost/sheets/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const b = req.body;
    await pool.query(
      `UPDATE project_cost_sheets SET
        project_name = COALESCE($1, project_name),
        customer_name = COALESCE($2, customer_name),
        total_selling_price = COALESCE($3, total_selling_price),
        total_meters = COALESCE($4, total_meters),
        target_margin_pct = COALESCE($5, target_margin_pct),
        vat_rate = COALESCE($6, vat_rate)
       WHERE id = $7`,
      [b.project_name, b.customer_name, b.total_selling_price, b.total_meters, b.target_margin_pct, b.vat_rate, id]
    );
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/project-cost/sheets/:id", async (req: Request, res: Response) => {
  try {
    await pool.query("DELETE FROM project_cost_sheets WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/project-cost/sheets/:id/calculate ──
router.post("/project-cost/sheets/:id/calculate", async (req: Request, res: Response) => {
  try {
    const sheet = await recalculateSheet(Number(req.params.id));
    if (!sheet) return res.status(404).json({ error: "לא נמצא" });
    res.json({ sheet });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/project-cost/sheets/:id/add-item ──
router.post("/project-cost/sheets/:id/add-item", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const b = req.body;
    const totalPrice = (Number(b.quantity) || 0) * (Number(b.unit_price) || 0);

    const r = await pool.query(
      `INSERT INTO cost_sheet_items (sheet_id, item_type, item_name, item_code, unit, quantity, unit_price, total_price, supplier_id, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [id, b.item_type, b.item_name, b.item_code, b.unit, b.quantity || 0, b.unit_price || 0, totalPrice, b.supplier_id, b.notes]
    );

    res.json({ item: r.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/project-cost/sheets/:id/add-labor ──
router.post("/project-cost/sheets/:id/add-labor", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const b = req.body;

    // For sales_agent default: 7.5% base, or 10% if target met
    let rate = Number(b.rate) || 0;
    if (b.labor_type === "sales_agent" && !b.rate) {
      rate = b.target_met ? 10 : 7.5;
    }

    const r = await pool.query(
      `INSERT INTO cost_sheet_labor (sheet_id, labor_type, worker_name, payment_model, rate, notes)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [id, b.labor_type, b.worker_name, b.payment_model || "percentage", rate, b.notes]
    );

    res.json({ labor: r.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/project-cost/sheets/:id/add-overhead ──
router.post("/project-cost/sheets/:id/add-overhead", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const b = req.body;

    const r = await pool.query(
      `INSERT INTO cost_sheet_overhead (sheet_id, overhead_type, description, amount, calculation_method, rate)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [id, b.overhead_type, b.description, b.amount || 0, b.calculation_method || "fixed", b.rate || 0]
    );

    res.json({ overhead: r.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/project-cost/sheets/:id/scenario ──
router.post("/project-cost/sheets/:id/scenario", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { scenario_name, changes, notes } = req.body;

    // Get current sheet
    const sheet = (await pool.query("SELECT * FROM project_cost_sheets WHERE id = $1", [id])).rows[0];
    if (!sheet) return res.status(404).json({ error: "לא נמצא" });

    // Apply changes to calculate scenario
    let sellingPrice = Number(changes?.selling_price ?? sheet.total_selling_price);
    let totalCost = Number(sheet.total_cost);

    if (changes?.cost_change_pct) totalCost *= (1 + Number(changes.cost_change_pct) / 100);
    if (changes?.cost_change_abs) totalCost += Number(changes.cost_change_abs);
    if (changes?.selling_change_pct) sellingPrice *= (1 + Number(changes.selling_change_pct) / 100);

    const resultingProfit = sellingPrice - totalCost;
    const resultingMargin = totalCost > 0 ? ((sellingPrice / totalCost) - 1) * 100 : 0;

    const r = await pool.query(
      `INSERT INTO cost_scenarios (sheet_id, scenario_name, changes, resulting_margin, resulting_profit, notes)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [id, scenario_name, JSON.stringify(changes), resultingMargin, resultingProfit, notes]
    );

    res.json({ scenario: r.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/project-cost/sheets/:id/optimize ──
router.post("/project-cost/sheets/:id/optimize", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const sheet = (await pool.query("SELECT * FROM project_cost_sheets WHERE id = $1", [id])).rows[0];
    if (!sheet) return res.status(404).json({ error: "לא נמצא" });

    const totalCost = Number(sheet.total_cost) || 1;
    const sellingPrice = Number(sheet.total_selling_price);
    const targetMargin = Number(sheet.target_margin_pct) || 200;

    // Target selling price = cost * (1 + target_margin/100)
    const targetSellingPrice = totalCost * (1 + targetMargin / 100);
    const priceGap = targetSellingPrice - sellingPrice;

    // Cost reduction needed to meet target at current selling price
    const targetCostAtCurrentPrice = sellingPrice / (1 + targetMargin / 100);
    const costReductionNeeded = totalCost - targetCostAtCurrentPrice;

    // Get labor breakdown to suggest optimization
    const labor = (await pool.query("SELECT * FROM cost_sheet_labor WHERE sheet_id = $1", [id])).rows;
    const items = (await pool.query("SELECT * FROM cost_sheet_items WHERE sheet_id = $1 ORDER BY total_price DESC LIMIT 5", [id])).rows;

    const suggestions: string[] = [];
    if (priceGap > 0) {
      suggestions.push(`העלאת מחיר מכירה ב-${priceGap.toFixed(0)} ש"ח (ל-${targetSellingPrice.toFixed(0)} ש"ח)`);
    }
    if (costReductionNeeded > 0) {
      suggestions.push(`הפחתת עלויות ב-${costReductionNeeded.toFixed(0)} ש"ח (ל-${targetCostAtCurrentPrice.toFixed(0)} ש"ח)`);
    }

    // Suggest switching labor models
    for (const l of labor) {
      if (l.labor_type === "manufacturer" || l.labor_type === "installer") {
        const altModel = l.payment_model === "percentage" ? "per_meter" : "percentage";
        suggestions.push(`שקול מעבר ל-${altModel === "per_meter" ? "תשלום למטר" : "אחוזים"} עבור ${l.worker_name || l.labor_type}`);
      }
    }

    if (items.length > 0) {
      suggestions.push(`הפריט היקר ביותר: ${items[0].item_name} (${Number(items[0].total_price).toFixed(0)} ש"ח) - חפש ספק זול יותר`);
    }

    res.json({
      currentMargin: Number(sheet.gross_margin_pct),
      targetMargin,
      gap: priceGap,
      costReductionNeeded: Math.max(0, costReductionNeeded),
      suggestions,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/project-cost/sheets/:id/breakdown ──
router.get("/project-cost/sheets/:id/breakdown", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const sheet = (await pool.query("SELECT * FROM project_cost_sheets WHERE id = $1", [id])).rows[0];
    if (!sheet) return res.status(404).json({ error: "לא נמצא" });

    const totalCost = Number(sheet.total_cost) || 1;
    const breakdown = [
      { category: "חומרי גלם", amount: Number(sheet.raw_material_cost), pct: (Number(sheet.raw_material_cost) / totalCost) * 100 },
      { category: "ייצור", amount: Number(sheet.manufacturing_cost), pct: (Number(sheet.manufacturing_cost) / totalCost) * 100 },
      { category: "התקנה", amount: Number(sheet.installation_cost), pct: (Number(sheet.installation_cost) / totalCost) * 100 },
      { category: "צביעה", amount: Number(sheet.paint_cost), pct: (Number(sheet.paint_cost) / totalCost) * 100 },
      { category: "הובלה", amount: Number(sheet.transport_cost), pct: (Number(sheet.transport_cost) / totalCost) * 100 },
      { category: "עמלת מכירה", amount: Number(sheet.sales_commission), pct: (Number(sheet.sales_commission) / totalCost) * 100 },
      { category: "תקורות", amount: Number(sheet.overhead_cost), pct: (Number(sheet.overhead_cost) / totalCost) * 100 },
    ];

    res.json({
      sellingPrice: Number(sheet.total_selling_price),
      sellingPriceVat: Number(sheet.total_selling_price_vat),
      totalCost,
      grossProfit: Number(sheet.gross_profit),
      grossMarginPct: Number(sheet.gross_margin_pct),
      targetMarginPct: Number(sheet.target_margin_pct),
      marginStatus: sheet.margin_status,
      breakdown,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/project-cost/compare-labor-models/:sheetId ──
router.get("/project-cost/compare-labor-models/:sheetId", async (req: Request, res: Response) => {
  try {
    const { sheetId } = req.params;
    const sheet = (await pool.query("SELECT * FROM project_cost_sheets WHERE id = $1", [sheetId])).rows[0];
    if (!sheet) return res.status(404).json({ error: "לא נמצא" });

    const sellingPrice = Number(sheet.total_selling_price);
    const totalMeters = Number(sheet.total_meters) || 1;
    const labor = (await pool.query("SELECT * FROM cost_sheet_labor WHERE sheet_id = $1", [sheetId])).rows;

    const comparisons = labor.map((l: any) => {
      const rate = Number(l.rate);
      let pctAmount = 0;
      let meterAmount = 0;

      if (l.payment_model === "percentage") {
        pctAmount = sellingPrice * (rate / 100);
        // Estimate per-meter equivalent
        meterAmount = totalMeters * (pctAmount / totalMeters);
      } else if (l.payment_model === "per_meter") {
        meterAmount = totalMeters * rate;
        pctAmount = sellingPrice > 0 ? (meterAmount / sellingPrice) * 100 : 0;
      }

      return {
        worker: l.worker_name || l.labor_type,
        laborType: l.labor_type,
        currentModel: l.payment_model,
        currentRate: rate,
        currentAmount: Number(l.calculated_amount),
        percentageAmount: l.payment_model === "percentage" ? Number(l.calculated_amount) : sellingPrice * (rate / 100),
        perMeterAmount: l.payment_model === "per_meter" ? Number(l.calculated_amount) : totalMeters * rate,
        recommendation: pctAmount < meterAmount ? "percentage" : "per_meter",
      };
    });

    res.json({ comparisons, sellingPrice, totalMeters });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/project-cost/dashboard ──
router.get("/project-cost/dashboard", async (_req: Request, res: Response) => {
  try {
    const summary = await pool.query(`
      SELECT
        COUNT(*) AS total_sheets,
        COALESCE(AVG(gross_margin_pct), 0) AS avg_margin,
        COALESCE(AVG(gross_profit), 0) AS avg_profit,
        COALESCE(SUM(gross_profit), 0) AS total_profit,
        COUNT(*) FILTER (WHERE margin_status = 'above_target') AS above_target,
        COUNT(*) FILTER (WHERE margin_status = 'on_target') AS on_target,
        COUNT(*) FILTER (WHERE margin_status = 'below_target') AS below_target,
        COUNT(*) FILTER (WHERE margin_status = 'negative') AS negative
      FROM project_cost_sheets WHERE status != 'draft'
    `);

    const topProfitable = await pool.query(
      `SELECT id, project_name, customer_name, gross_profit, gross_margin_pct
       FROM project_cost_sheets WHERE status != 'draft'
       ORDER BY gross_profit DESC LIMIT 5`
    );

    const worstMargin = await pool.query(
      `SELECT id, project_name, customer_name, gross_profit, gross_margin_pct
       FROM project_cost_sheets WHERE status != 'draft'
       ORDER BY gross_margin_pct ASC LIMIT 5`
    );

    res.json({
      summary: summary.rows[0],
      topProfitable: topProfitable.rows,
      worstMargin: worstMargin.rows,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
