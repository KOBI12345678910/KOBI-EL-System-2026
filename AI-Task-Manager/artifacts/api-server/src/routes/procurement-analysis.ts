import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();
const logger = console;

type DbRow = Record<string, unknown>;

function numCol(row: DbRow | undefined, col: string): number {
  return Number(row?.[col] ?? 0);
}

function strCol(row: DbRow | undefined, col: string): string {
  return String(row?.[col] ?? "");
}

function toRows(result: { rows: unknown[] }): DbRow[] {
  return result.rows as DbRow[];
}

// Profitability Dashboard Summary — real data from sales_invoices, purchase_orders, sales_orders
router.get("/procurement/profitability-summary", async (req: Request, res: Response) => {
  try {
    const fallbackInvoice = { rows: [{ total_revenue: 0, total_subtotal: 0, invoice_count: 0 }] };
    const fallbackPo = { rows: [{ total_po_cost: 0 }] };
    const fallbackMonthly: { rows: unknown[] } = { rows: [] };

    const [invoiceSummary, poCosts, monthlySeries] = await Promise.all([
      db.execute(sql`
        SELECT
          COALESCE(SUM(total), 0) AS total_revenue,
          COALESCE(SUM(subtotal), 0) AS total_subtotal,
          COUNT(*) AS invoice_count
        FROM sales_invoices
        WHERE status NOT IN ('cancelled', 'draft')
      `).catch(() => fallbackInvoice),

      db.execute(sql`
        SELECT COALESCE(SUM(total_amount), 0) AS total_po_cost
        FROM purchase_orders
        WHERE status IN ('received', 'completed', 'approved')
      `).catch(() => fallbackPo),

      db.execute(sql`
        SELECT
          TO_CHAR(DATE_TRUNC('month', invoice_date), 'Mon') AS month,
          ROUND(
            CASE WHEN SUM(total) > 0
              THEN (SUM(total) - SUM(subtotal) * 0.65) / SUM(total) * 100
              ELSE 0
            END
          , 1) AS margin
        FROM sales_invoices
        WHERE status NOT IN ('cancelled', 'draft')
          AND invoice_date >= CURRENT_DATE - INTERVAL '6 months'
        GROUP BY DATE_TRUNC('month', invoice_date)
        ORDER BY DATE_TRUNC('month', invoice_date)
      `).catch(() => fallbackMonthly),
    ]);

    const invoiceRow = toRows(invoiceSummary)[0];
    const poRow = toRows(poCosts)[0];

    const totalRevenue = numCol(invoiceRow, "total_revenue");
    const totalSubtotal = numCol(invoiceRow, "total_subtotal");
    const totalPoCost = numCol(poRow, "total_po_cost");

    const grossProfit = totalRevenue - (totalSubtotal * 0.65);
    const avgGrossMargin = totalRevenue > 0 ? Math.round((grossProfit / totalRevenue) * 1000) / 10 : 0;
    const netProfit = totalRevenue - totalPoCost;
    const avgNetMargin = totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 1000) / 10 : 0;
    const avgROI = totalPoCost > 0 ? Math.round((netProfit / totalPoCost) * 1000) / 10 : 0;

    const monthlyData = toRows(monthlySeries).map((r) => ({
      month: strCol(r, "month"),
      margin: numCol(r, "margin"),
    }));

    let profitableProjectsPercent = 0;
    try {
      const projResult = await db.execute(sql`
        SELECT
          COUNT(*) FILTER (WHERE total > 0) AS profitable,
          COUNT(*) AS total
        FROM sales_orders
        WHERE status NOT IN ('cancelled', 'draft')
      `);
      const projRow = toRows(projResult)[0];
      const t = numCol(projRow, "total");
      const p = numCol(projRow, "profitable");
      profitableProjectsPercent = t > 0 ? Math.round((p / t) * 100) : 0;
    } catch (projErr) {
      logger.warn("[Procurement Analysis] profitableProjectsPercent query failed:", projErr);
    }

    res.json({
      avgGrossMargin,
      avgNetMargin,
      avgROI,
      profitableProjectsPercent,
      totalProjectValue: totalRevenue,
      monthlyData,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error("[Procurement Analysis] Profitability summary failed:", msg);
    res.status(400).json({ error: msg });
  }
});

// Competitors CRUD
router.post("/competitors", async (req: Request, res: Response) => {
  try {
    const { name, category, marketShare, swot } = req.body;

    const result = await db.execute(
      sql`INSERT INTO competitors (name, category, market_share, swot, status)
        VALUES (${name}, ${category}, ${marketShare || 0}, ${JSON.stringify(swot || {})}, 'active')
        RETURNING id, name, category, market_share`
    );

    res.json({ success: true, competitor: result.rows[0] });
  } catch (error: any) {
    logger.error("[Competitors] Create failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

router.get("/competitors", async (req: Request, res: Response) => {
  try {
    const result = await db.execute(
      sql`SELECT id, name, category, market_share, status, created_at FROM competitors WHERE status = 'active' ORDER BY name`
    );

    res.json({ competitors: result.rows || [] });
  } catch (error: any) {
    logger.error("[Competitors] List failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

router.put("/competitors/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, category, marketShare, swot } = req.body;

    const result = await db.execute(
      sql`UPDATE competitors SET name = ${name}, category = ${category}, market_share = ${marketShare}, swot = ${JSON.stringify(swot || {})} WHERE id = ${parseInt(id)} RETURNING id, name`
    );

    res.json({ success: true, competitor: result.rows[0] });
  } catch (error: any) {
    logger.error("[Competitors] Update failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

// Competitor Prices
router.post("/competitor-prices", async (req: Request, res: Response) => {
  try {
    const { competitorId, productCategory, competitorPrice, ourPrice } = req.body;

    const variance = ((competitorPrice - ourPrice) / ourPrice) * 100;

    const result = await db.execute(
      sql`INSERT INTO competitor_prices (competitor_id, product_category, competitor_price, our_price, price_variance)
        VALUES (${competitorId}, ${productCategory}, ${competitorPrice}, ${ourPrice}, ${variance})
        RETURNING id, product_category, competitor_price, our_price, price_variance`
    );

    res.json({ success: true, priceComparison: result.rows[0] });
  } catch (error: any) {
    logger.error("[Competitor Prices] Create failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

router.get("/competitor-prices/:competitorId", async (req: Request, res: Response) => {
  try {
    const { competitorId } = req.params;

    const result = await db.execute(
      sql`SELECT id, product_category, competitor_price, our_price, price_variance FROM competitor_prices WHERE competitor_id = ${parseInt(competitorId)}`
    );

    res.json({ prices: result.rows || [] });
  } catch (error: any) {
    logger.error("[Competitor Prices] Get failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

// Currency Exposures
router.post("/currency-exposures", async (req: Request, res: Response) => {
  try {
    const { currencyPair, exposureAmount, hedgingStrategy } = req.body;

    const result = await db.execute(
      sql`INSERT INTO currency_exposures (currency_pair, exposure_amount, hedging_strategy)
        VALUES (${currencyPair}, ${exposureAmount}, ${hedgingStrategy || 'none'})
        RETURNING id, currency_pair, exposure_amount, hedging_strategy`
    );

    res.json({ success: true, exposure: result.rows[0] });
  } catch (error: any) {
    logger.error("[Currency Exposures] Create failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

router.get("/currency-exposures", async (req: Request, res: Response) => {
  try {
    const result = await db.execute(
      sql`SELECT id, currency_pair, exposure_amount, hedging_strategy, hedging_cost FROM currency_exposures ORDER BY created_at DESC`
    );

    res.json({ exposures: result.rows || [] });
  } catch (error: any) {
    logger.error("[Currency Exposures] List failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

// Commodity Risks
router.post("/commodity-risks", async (req: Request, res: Response) => {
  try {
    const { commodityName, quantity, currentPrice, floorPrice, ceilingPrice } = req.body;

    // Calculate risk score (1-10)
    const priceRange = ceilingPrice - floorPrice;
    const deviation = Math.abs(currentPrice - (floorPrice + priceRange / 2)) / (priceRange / 2);
    const riskScore = Math.min(10, Math.round(deviation * 5));

    const result = await db.execute(
      sql`INSERT INTO commodity_risks (commodity_name, quantity, current_price, floor_price, ceiling_price, risk_score)
        VALUES (${commodityName}, ${quantity}, ${currentPrice}, ${floorPrice}, ${ceilingPrice}, ${riskScore})
        RETURNING id, commodity_name, risk_score`
    );

    res.json({ success: true, risk: result.rows[0] });
  } catch (error: any) {
    logger.error("[Commodity Risks] Create failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

router.get("/commodity-risks", async (req: Request, res: Response) => {
  try {
    const result = await db.execute(
      sql`SELECT id, commodity_name, quantity, current_price, floor_price, ceiling_price, risk_score FROM commodity_risks`
    );

    res.json({ risks: result.rows || [] });
  } catch (error: any) {
    logger.error("[Commodity Risks] List failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

// Overall Risk Summary
router.get("/risk-summary", async (req: Request, res: Response) => {
  try {
    const commodityResult = await db.execute(
      sql`SELECT AVG(CAST(risk_score AS FLOAT)) as avg_risk FROM commodity_risks`
    );

    const currencyResult = await db.execute(
      sql`SELECT COUNT(*) as count FROM currency_exposures WHERE hedging_strategy = 'none'`
    );

    const overallRisk = Math.round(((commodityResult.rows[0].avg_risk || 5) * 0.6 + (currencyResult.rows[0].count || 0) * 1) / 2);

    res.json({
      overallRiskScore: overallRisk,
      riskLevel: overallRisk <= 3 ? "low" : overallRisk <= 6 ? "medium" : "high",
      unhedgedCurrencies: currencyResult.rows[0].count || 0,
      commodityRisks: commodityResult.rows[0].avg_risk || 0,
    });
  } catch (error: any) {
    logger.error("[Risk Summary] Failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

export default router;
