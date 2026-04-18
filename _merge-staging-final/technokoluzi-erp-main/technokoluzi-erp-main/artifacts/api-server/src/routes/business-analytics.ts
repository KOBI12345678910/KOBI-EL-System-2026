import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  competitorsTable,
  competitorPricesTable,
  baCurrencyExposuresTable,
  commodityRisksTable,
  projectAnalysesTable,
  projectAnalysisMaterialsTable,
  rawMaterialsTable,
  priceQuotesTable,
  priceQuoteItemsTable,
  costCalculationsTable,
} from "@workspace/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

const CompetitorBody = z.object({
  name: z.string().min(1),
  domain: z.string().optional(),
  marketShare: z.coerce.number().default(0),
  isActive: z.boolean().default(true),
  swotStrengths: z.string().optional(),
  swotWeaknesses: z.string().optional(),
  swotOpportunities: z.string().optional(),
  swotThreats: z.string().optional(),
  notes: z.string().optional(),
});

const CompetitorPriceBody = z.object({
  competitorId: z.coerce.number().int(),
  productCategory: z.string().min(1),
  productName: z.string().optional(),
  ourPrice: z.coerce.number().default(0),
  competitorPrice: z.coerce.number().default(0),
  lastUpdated: z.string().optional(),
  notes: z.string().optional(),
});

const CurrencyExposureBody = z.object({
  currencyPair: z.string().min(1),
  exposureAmount: z.coerce.number().default(0),
  expiryDate: z.string().optional(),
  hedgingType: z.string().default("none"),
  hedgingCostPercent: z.coerce.number().default(0),
  notes: z.string().optional(),
});

const CommodityRiskBody = z.object({
  materialName: z.string().min(1),
  quantity: z.coerce.number().default(0),
  unit: z.string().default("kg"),
  currentPrice: z.coerce.number().default(0),
  floorPrice: z.coerce.number().optional(),
  ceilingPrice: z.coerce.number().optional(),
  hedgingRecommendation: z.string().optional(),
  notes: z.string().optional(),
});

router.get("/competitors", async (_req, res) => {
  try {
    const rows = await db.select().from(competitorsTable).orderBy(desc(competitorsTable.id));
    res.json(rows);
  } catch (err) {
    const e = err as Error;
    res.status(500).json({ error: e.message });
  }
});

router.post("/competitors", async (req, res) => {
  try {
    const body = CompetitorBody.parse(req.body);
    const [row] = await db.insert(competitorsTable).values({
      name: body.name,
      domain: body.domain,
      marketShare: String(body.marketShare),
      isActive: body.isActive,
      swotStrengths: body.swotStrengths,
      swotWeaknesses: body.swotWeaknesses,
      swotOpportunities: body.swotOpportunities,
      swotThreats: body.swotThreats,
      notes: body.notes,
    }).returning();
    res.status(201).json(row);
  } catch (err) {
    const e = err as Error;
    res.status(e.message.includes("parse") ? 400 : 500).json({ error: e.message });
  }
});

router.put("/competitors/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const body = CompetitorBody.partial().parse(req.body);
    const [row] = await db.update(competitorsTable).set({
      ...(body.name !== undefined && { name: body.name }),
      ...(body.domain !== undefined && { domain: body.domain }),
      ...(body.marketShare !== undefined && { marketShare: String(body.marketShare) }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
      ...(body.swotStrengths !== undefined && { swotStrengths: body.swotStrengths }),
      ...(body.swotWeaknesses !== undefined && { swotWeaknesses: body.swotWeaknesses }),
      ...(body.swotOpportunities !== undefined && { swotOpportunities: body.swotOpportunities }),
      ...(body.swotThreats !== undefined && { swotThreats: body.swotThreats }),
      ...(body.notes !== undefined && { notes: body.notes }),
      updatedAt: new Date(),
    }).where(eq(competitorsTable.id, id)).returning();
    if (!row) { res.status(404).json({ error: "לא נמצא" }); return; }
    res.json(row);
  } catch (err) {
    const e = err as Error;
    res.status(500).json({ error: e.message });
  }
});

router.delete("/competitors/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await db.delete(competitorPricesTable).where(eq(competitorPricesTable.competitorId, id));
    await db.delete(competitorsTable).where(eq(competitorsTable.id, id));
    res.json({ message: "נמחק" });
  } catch (err) {
    const e = err as Error;
    res.status(500).json({ error: e.message });
  }
});

router.get("/competitor-prices", async (req, res) => {
  try {
    const { competitorId } = req.query;
    const rows = competitorId
      ? await db.select().from(competitorPricesTable).where(eq(competitorPricesTable.competitorId, parseInt(String(competitorId), 10))).orderBy(desc(competitorPricesTable.id))
      : await db.select().from(competitorPricesTable).orderBy(desc(competitorPricesTable.id));
    res.json(rows);
  } catch (err) {
    const e = err as Error;
    res.status(500).json({ error: e.message });
  }
});

router.post("/competitor-prices", async (req, res) => {
  try {
    const body = CompetitorPriceBody.parse(req.body);
    const [row] = await db.insert(competitorPricesTable).values({
      competitorId: body.competitorId,
      productCategory: body.productCategory,
      productName: body.productName,
      ourPrice: String(body.ourPrice),
      competitorPrice: String(body.competitorPrice),
      lastUpdated: body.lastUpdated ?? new Date().toISOString().split("T")[0],
      notes: body.notes,
    }).returning();
    res.status(201).json(row);
  } catch (err) {
    const e = err as Error;
    res.status(e.message.includes("parse") ? 400 : 500).json({ error: e.message });
  }
});

router.put("/competitor-prices/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const body = CompetitorPriceBody.partial().parse(req.body);
    const [row] = await db.update(competitorPricesTable).set({
      ...(body.productCategory !== undefined && { productCategory: body.productCategory }),
      ...(body.productName !== undefined && { productName: body.productName }),
      ...(body.ourPrice !== undefined && { ourPrice: String(body.ourPrice) }),
      ...(body.competitorPrice !== undefined && { competitorPrice: String(body.competitorPrice) }),
      ...(body.lastUpdated !== undefined && { lastUpdated: body.lastUpdated }),
      ...(body.notes !== undefined && { notes: body.notes }),
      updatedAt: new Date(),
    }).where(eq(competitorPricesTable.id, id)).returning();
    if (!row) { res.status(404).json({ error: "לא נמצא" }); return; }
    res.json(row);
  } catch (err) {
    const e = err as Error;
    res.status(500).json({ error: e.message });
  }
});

router.delete("/competitor-prices/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await db.delete(competitorPricesTable).where(eq(competitorPricesTable.id, id));
    res.json({ message: "נמחק" });
  } catch (err) {
    const e = err as Error;
    res.status(500).json({ error: e.message });
  }
});

router.get("/competitor-comparison", async (_req, res) => {
  try {
    const priceRows = await db.execute<{
      product_category: string;
      avg_our_price: string;
      avg_competitor_price: string;
      competitor_count: string;
    }>(sql`
      SELECT cp.product_category,
        AVG(cp.our_price::numeric) as avg_our_price,
        AVG(cp.competitor_price::numeric) as avg_competitor_price,
        COUNT(DISTINCT cp.competitor_id) as competitor_count
      FROM competitor_prices cp
      GROUP BY cp.product_category
      ORDER BY cp.product_category
    `);
    const alertRows = await db.execute<{
      id: number;
      competitor_id: number;
      product_category: string;
      product_name: string | null;
      our_price: string;
      competitor_price: string;
      last_updated: string | null;
      competitor_name: string;
    }>(sql`
      SELECT cp.*, c.name as competitor_name
      FROM competitor_prices cp
      JOIN competitors c ON c.id = cp.competitor_id
      WHERE cp.our_price::numeric > 0 AND cp.competitor_price::numeric > 0
        AND (cp.our_price::numeric - cp.competitor_price::numeric) / cp.our_price::numeric > 0.10
      ORDER BY (cp.our_price::numeric - cp.competitor_price::numeric) / cp.our_price::numeric DESC
    `);
    res.json({ categories: priceRows.rows, alerts: alertRows.rows });
  } catch (err) {
    const e = err as Error;
    res.status(500).json({ error: e.message });
  }
});

router.get("/currency-exposures", async (_req, res) => {
  try {
    const rows = await db.select().from(baCurrencyExposuresTable).orderBy(desc(baCurrencyExposuresTable.id));
    res.json(rows);
  } catch (err) {
    const e = err as Error;
    res.status(500).json({ error: e.message });
  }
});

router.post("/currency-exposures", async (req, res) => {
  try {
    const body = CurrencyExposureBody.parse(req.body);
    const [row] = await db.insert(baCurrencyExposuresTable).values({
      currencyPair: body.currencyPair,
      exposureAmount: String(body.exposureAmount),
      expiryDate: body.expiryDate,
      hedgingType: body.hedgingType,
      hedgingCostPercent: String(body.hedgingCostPercent),
      notes: body.notes,
    }).returning();
    res.status(201).json(row);
  } catch (err) {
    const e = err as Error;
    res.status(e.message.includes("parse") ? 400 : 500).json({ error: e.message });
  }
});

router.put("/currency-exposures/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const body = CurrencyExposureBody.partial().parse(req.body);
    const [row] = await db.update(baCurrencyExposuresTable).set({
      ...(body.currencyPair !== undefined && { currencyPair: body.currencyPair }),
      ...(body.exposureAmount !== undefined && { exposureAmount: String(body.exposureAmount) }),
      ...(body.expiryDate !== undefined && { expiryDate: body.expiryDate }),
      ...(body.hedgingType !== undefined && { hedgingType: body.hedgingType }),
      ...(body.hedgingCostPercent !== undefined && { hedgingCostPercent: String(body.hedgingCostPercent) }),
      ...(body.notes !== undefined && { notes: body.notes }),
      updatedAt: new Date(),
    }).where(eq(baCurrencyExposuresTable.id, id)).returning();
    if (!row) { res.status(404).json({ error: "לא נמצא" }); return; }
    res.json(row);
  } catch (err) {
    const e = err as Error;
    res.status(500).json({ error: e.message });
  }
});

router.delete("/currency-exposures/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await db.delete(baCurrencyExposuresTable).where(eq(baCurrencyExposuresTable.id, id));
    res.json({ message: "נמחק" });
  } catch (err) {
    const e = err as Error;
    res.status(500).json({ error: e.message });
  }
});

router.get("/commodity-risks", async (_req, res) => {
  try {
    const rows = await db.select().from(commodityRisksTable).orderBy(desc(commodityRisksTable.id));
    res.json(rows);
  } catch (err) {
    const e = err as Error;
    res.status(500).json({ error: e.message });
  }
});

router.post("/commodity-risks", async (req, res) => {
  try {
    const body = CommodityRiskBody.parse(req.body);
    const [row] = await db.insert(commodityRisksTable).values({
      materialName: body.materialName,
      quantity: String(body.quantity),
      unit: body.unit,
      currentPrice: String(body.currentPrice),
      floorPrice: body.floorPrice !== undefined ? String(body.floorPrice) : null,
      ceilingPrice: body.ceilingPrice !== undefined ? String(body.ceilingPrice) : null,
      hedgingRecommendation: body.hedgingRecommendation,
      notes: body.notes,
    }).returning();
    res.status(201).json(row);
  } catch (err) {
    const e = err as Error;
    res.status(e.message.includes("parse") ? 400 : 500).json({ error: e.message });
  }
});

router.put("/commodity-risks/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const body = CommodityRiskBody.partial().parse(req.body);
    const [row] = await db.update(commodityRisksTable).set({
      ...(body.materialName !== undefined && { materialName: body.materialName }),
      ...(body.quantity !== undefined && { quantity: String(body.quantity) }),
      ...(body.unit !== undefined && { unit: body.unit }),
      ...(body.currentPrice !== undefined && { currentPrice: String(body.currentPrice) }),
      ...(body.floorPrice !== undefined && { floorPrice: String(body.floorPrice) }),
      ...(body.ceilingPrice !== undefined && { ceilingPrice: String(body.ceilingPrice) }),
      ...(body.hedgingRecommendation !== undefined && { hedgingRecommendation: body.hedgingRecommendation }),
      ...(body.notes !== undefined && { notes: body.notes }),
      updatedAt: new Date(),
    }).where(eq(commodityRisksTable.id, id)).returning();
    if (!row) { res.status(404).json({ error: "לא נמצא" }); return; }
    res.json(row);
  } catch (err) {
    const e = err as Error;
    res.status(500).json({ error: e.message });
  }
});

router.delete("/commodity-risks/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await db.delete(commodityRisksTable).where(eq(commodityRisksTable.id, id));
    res.json({ message: "נמחק" });
  } catch (err) {
    const e = err as Error;
    res.status(500).json({ error: e.message });
  }
});

router.get("/risk-summary", async (_req, res) => {
  try {
    const exposures = await db.select().from(baCurrencyExposuresTable);
    const commodities = await db.select().from(commodityRisksTable);
    const analyses = await db
      .select({
        supplierRisk: projectAnalysesTable.supplierRisk,
        currencyRisk: projectAnalysesTable.currencyRisk,
        marketRisk: projectAnalysesTable.marketRisk,
        operationalRisk: projectAnalysesTable.operationalRisk,
      })
      .from(projectAnalysesTable)
      .limit(20);

    const avgRisk = (vals: (string | null | undefined)[]) => {
      const nums = vals.map(v => parseFloat(v ?? "5")).filter(v => !isNaN(v));
      return nums.length > 0 ? nums.reduce((s, v) => s + v, 0) / nums.length : 5;
    };

    const currencyRisk = avgRisk(analyses.map(a => a.currencyRisk));
    const supplierRisk = avgRisk(analyses.map(a => a.supplierRisk));
    const marketRisk = avgRisk(analyses.map(a => a.marketRisk));
    const operationalRisk = avgRisk(analyses.map(a => a.operationalRisk));

    const unhedgedExposure = exposures
      .filter(e => e.hedgingType === "none" || !e.hedgingType)
      .reduce((s, e) => s + parseFloat(e.exposureAmount ?? "0"), 0);
    const totalExposure = exposures.reduce((s, e) => s + parseFloat(e.exposureAmount ?? "0"), 0);
    const hedgingCoverage = totalExposure > 0 ? ((totalExposure - unhedgedExposure) / totalExposure) * 100 : 0;
    const overallScore = (currencyRisk + supplierRisk + marketRisk + operationalRisk) / 4;

    res.json({
      overallScore: parseFloat(overallScore.toFixed(1)),
      breakdown: {
        currency: parseFloat(currencyRisk.toFixed(1)),
        supplier: parseFloat(supplierRisk.toFixed(1)),
        market: parseFloat(marketRisk.toFixed(1)),
        operational: parseFloat(operationalRisk.toFixed(1)),
      },
      exposureSummary: {
        totalExposure,
        unhedgedExposure,
        hedgingCoverage: parseFloat(hedgingCoverage.toFixed(1)),
        exposureCount: exposures.length,
      },
      commoditySummary: {
        count: commodities.length,
        totalValue: commodities.reduce((s, c) => s + parseFloat(c.quantity ?? "0") * parseFloat(c.currentPrice ?? "0"), 0),
      },
    });
  } catch (err) {
    const e = err as Error;
    res.status(500).json({ error: e.message });
  }
});

router.post("/project-analyses/import-from-quote", async (req, res) => {
  try {
    const { quoteId } = z.object({ quoteId: z.coerce.number().int() }).parse(req.body);

    const [quote] = await db.select().from(priceQuotesTable).where(eq(priceQuotesTable.id, quoteId)).limit(1);
    if (!quote) { res.status(404).json({ error: "הצעת מחיר לא נמצאה" }); return; }

    const lineItems = await db.select().from(priceQuoteItemsTable).where(eq(priceQuoteItemsTable.quoteId, quoteId));

    const codeRows = await db.execute<{ next_id: number }>(sql`SELECT COALESCE(MAX(id),0)+1 as next_id FROM project_analyses`);
    const nextId = codeRows.rows[0]?.next_id ?? 1;
    const projectCode = `IMP-Q-${String(nextId).padStart(4, "0")}`;

    const totalBeforeTax = parseFloat(quote.totalBeforeTax ?? "0");
    const totalAmount = parseFloat(quote.totalAmount ?? "0");

    const laborEstimate = totalBeforeTax > 0 ? String(totalBeforeTax * 0.15) : "0";
    const overheadEstimate = totalBeforeTax > 0 ? String(totalBeforeTax * 0.1) : "0";
    const marginEstimate = totalAmount > 0 ? String(((totalAmount - totalBeforeTax * 0.85) / totalAmount) * 100) : "0";

    const [row] = await db.insert(projectAnalysesTable).values({
      projectCode,
      projectName: `ייבוא מהצעת מחיר ${quote.quoteNumber}`,
      proposedSalePrice: String(totalAmount),
      laborCost: laborEstimate,
      overheadCost: overheadEstimate,
      targetMarginPercent: marginEstimate,
      paymentTerms: quote.paymentTerms ?? undefined,
      status: "draft",
      sourceType: "quote",
      sourceId: String(quoteId),
      notes: `מקור: הצעת מחיר ${quote.quoteNumber} | פריטים: ${lineItems.length} | סכום לפני מע"מ: ₪${totalBeforeTax.toLocaleString()} | תנאי תשלום: ${quote.paymentTerms ?? "לא צוין"}`,
    }).returning();

    if (lineItems.length > 0) {
      await Promise.all(
        lineItems.map(item =>
          db.insert(projectAnalysisMaterialsTable).values({
            projectAnalysisId: row.id,
            rawMaterialId: item.materialId ?? undefined,
            materialName: item.itemDescription,
            materialNumber: item.itemCode ?? undefined,
            unit: item.unit ?? "יחידה",
            quantity: item.quantity ?? "1",
            unitPrice: item.unitPrice ?? "0",
            totalPrice: item.totalPrice ?? "0",
          }).returning()
        )
      );
    }

    res.status(201).json({ ...row, importedItems: lineItems.length });
  } catch (err) {
    const e = err as Error;
    res.status(e.message.includes("parse") ? 400 : 500).json({ error: e.message });
  }
});

router.post("/project-analyses/import-from-deal", async (req, res) => {
  try {
    const { dealId } = z.object({ dealId: z.coerce.number().int() }).parse(req.body);

    const [deal] = await db.select().from(costCalculationsTable).where(eq(costCalculationsTable.id, dealId)).limit(1);
    if (!deal) { res.status(404).json({ error: "חישוב עסקה לא נמצא" }); return; }

    const codeRows = await db.execute<{ next_id: number }>(sql`SELECT COALESCE(MAX(id),0)+1 as next_id FROM project_analyses`);
    const nextId = codeRows.rows[0]?.next_id ?? 1;
    const projectCode = `IMP-D-${String(nextId).padStart(4, "0")}`;

    const totalCost = parseFloat(deal.totalCost ?? "0");
    const sellingPrice = parseFloat(deal.sellingPrice ?? "0");
    const profit = parseFloat(deal.profit ?? "0");
    const marginPercent = parseFloat(deal.marginPercent ?? "0");
    const materialsCost = parseFloat(deal.materialsCost ?? "0");
    const laborCost = parseFloat(deal.laborCost ?? "0");

    const [row] = await db.insert(projectAnalysesTable).values({
      projectCode,
      projectName: `ייבוא מחישוב עסקה: ${deal.productName}`,
      proposedSalePrice: String(sellingPrice),
      actualSalePrice: String(sellingPrice),
      laborCost: String(laborCost),
      overheadCost: deal.overheadCost ?? "0",
      targetMarginPercent: String(marginPercent),
      status: "draft",
      sourceType: "deal",
      sourceId: String(dealId),
      notes: `מקור: חישוב עסקה ${deal.calculationNumber} | קטגוריה: ${deal.category ?? "לא צוין"} | עלות כוללת: ₪${totalCost.toLocaleString()} | רווח: ₪${profit.toLocaleString()} | אחריות: ${deal.calculatedBy ?? "—"}`,
    }).returning();
    res.status(201).json(row);
  } catch (err) {
    const e = err as Error;
    res.status(e.message.includes("parse") ? 400 : 500).json({ error: e.message });
  }
});

router.post("/project-analyses/import-from-products", async (req, res) => {
  try {
    const { productIds, analysisId } = z.object({
      productIds: z.array(z.coerce.number().int()).min(1),
      analysisId: z.coerce.number().int(),
    }).parse(req.body);

    const [analysis] = await db.select().from(projectAnalysesTable).where(eq(projectAnalysesTable.id, analysisId)).limit(1);
    if (!analysis) { res.status(404).json({ error: "ניתוח לא נמצא" }); return; }

    const materials = await db.select().from(rawMaterialsTable).where(
      sql`${rawMaterialsTable.id} = ANY(ARRAY[${sql.join(productIds.map(id => sql`${id}`), sql`, `)}]::int[])`
    );

    const inserted = await Promise.all(
      materials.map(mat =>
        db.insert(projectAnalysisMaterialsTable).values({
          projectAnalysisId: analysisId,
          rawMaterialId: mat.id,
          materialName: mat.materialName ?? String(mat.id),
          materialNumber: mat.materialNumber ?? undefined,
          unit: mat.unit ?? "יחידה",
          unitPrice: mat.standardPrice ?? "0",
          totalPrice: mat.standardPrice ?? "0",
        }).returning()
      )
    );

    await db.update(projectAnalysesTable).set({
      sourceType: "products",
      updatedAt: new Date(),
    }).where(eq(projectAnalysesTable.id, analysisId));

    res.status(201).json({ inserted: inserted.flat(), count: inserted.length });
  } catch (err) {
    const e = err as Error;
    res.status(e.message.includes("parse") ? 400 : 500).json({ error: e.message });
  }
});

export default router;
