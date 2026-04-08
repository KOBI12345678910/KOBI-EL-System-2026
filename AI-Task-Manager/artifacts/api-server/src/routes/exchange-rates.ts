import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { exchangeRatesTable, hedgingContractsTable, currencyExposuresTable } from "@workspace/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

function cleanData(body: any, numericFields: string[], dateFields: string[]) {
  const cleaned = { ...body };
  for (const key of dateFields) { if (cleaned[key] === "") cleaned[key] = null; }
  for (const key of numericFields) {
    if (cleaned[key] === "" || cleaned[key] === null || cleaned[key] === undefined) cleaned[key] = undefined;
    else cleaned[key] = String(cleaned[key]);
  }
  delete cleaned.id;
  delete cleaned.createdAt;
  delete cleaned.updatedAt;
  return cleaned;
}

const rateNumericFields = ["rate", "previousRate", "changePercent", "buyRate", "sellRate", "midRate"];
const rateDateFields = ["rateDate"];
const hedgeNumericFields = ["amount", "hedgedRate", "spotRateAtContract", "premiumCost", "strikePrice", "notionalAmount", "settlementAmount", "realizedPnl", "unrealizedPnl", "marginRequired", "marginDeposited"];
const hedgeDateFields = ["startDate", "maturityDate", "settlementDate", "approvedDate"];
const exposureNumericFields = ["totalExposure", "hedgedAmount", "unhedgedAmount", "hedgeRatio", "currentRate", "budgetRate", "impactAtCurrent", "impactAtBudget", "variance"];
const exposureDateFields: string[] = [];

async function genNumber(prefix: string, table: any): Promise<string> {
  const year = new Date().getFullYear();
  const [result] = await db.select({ count: sql<number>`count(*)` }).from(table);
  const num = (result?.count || 0) + 1;
  return `${prefix}-${year}-${String(num).padStart(4, "0")}`;
}

// Exchange Rates CRUD
router.get("/exchange-rates", async (_req, res) => {
  try {
    const items = await db.select().from(exchangeRatesTable).orderBy(desc(exchangeRatesTable.rateDate));
    res.json(items);
  } catch (error: any) { res.status(500).json({ message: error.message }); }
});

router.get("/exchange-rates/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [item] = await db.select().from(exchangeRatesTable).where(eq(exchangeRatesTable.id, id));
    if (!item) return res.status(404).json({ message: "Not found" });
    res.json(item);
  } catch (error: any) { res.status(400).json({ message: error.message }); }
});

router.post("/exchange-rates", async (req, res) => {
  try {
    const cleaned = cleanData(req.body, rateNumericFields, rateDateFields);
    if (!cleaned.rateNumber) cleaned.rateNumber = await genNumber("EXR", exchangeRatesTable);
    const [item] = await db.insert(exchangeRatesTable).values(cleaned).returning();
    res.status(201).json(item);
  } catch (error: any) { res.status(400).json({ message: error.message }); }
});

router.put("/exchange-rates/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const cleaned = cleanData(req.body, rateNumericFields, rateDateFields);
    const [item] = await db.update(exchangeRatesTable).set({ ...cleaned, updatedAt: new Date() }).where(eq(exchangeRatesTable.id, id)).returning();
    if (!item) return res.status(404).json({ message: "Not found" });
    res.json(item);
  } catch (error: any) { res.status(400).json({ message: error.message }); }
});

router.delete("/exchange-rates/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [d] = await db.delete(exchangeRatesTable).where(eq(exchangeRatesTable.id, id)).returning();
    if (!d) return res.status(404).json({ message: "Not found" });
    res.json({ message: "Deleted" });
  } catch (error: any) { res.status(400).json({ message: error.message }); }
});

// Hedging Contracts CRUD
router.get("/hedging-contracts", async (_req, res) => {
  try {
    const items = await db.select().from(hedgingContractsTable).orderBy(desc(hedgingContractsTable.createdAt));
    res.json(items);
  } catch (error: any) { res.status(500).json({ message: error.message }); }
});

router.get("/hedging-contracts/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [item] = await db.select().from(hedgingContractsTable).where(eq(hedgingContractsTable.id, id));
    if (!item) return res.status(404).json({ message: "Not found" });
    res.json(item);
  } catch (error: any) { res.status(400).json({ message: error.message }); }
});

router.post("/hedging-contracts", async (req, res) => {
  try {
    const cleaned = cleanData(req.body, hedgeNumericFields, hedgeDateFields);
    if (!cleaned.contractNumber) cleaned.contractNumber = await genNumber("HDG", hedgingContractsTable);
    const [item] = await db.insert(hedgingContractsTable).values(cleaned).returning();
    res.status(201).json(item);
  } catch (error: any) { res.status(400).json({ message: error.message }); }
});

router.put("/hedging-contracts/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const cleaned = cleanData(req.body, hedgeNumericFields, hedgeDateFields);
    const [item] = await db.update(hedgingContractsTable).set({ ...cleaned, updatedAt: new Date() }).where(eq(hedgingContractsTable.id, id)).returning();
    if (!item) return res.status(404).json({ message: "Not found" });
    res.json(item);
  } catch (error: any) { res.status(400).json({ message: error.message }); }
});

router.delete("/hedging-contracts/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [d] = await db.delete(hedgingContractsTable).where(eq(hedgingContractsTable.id, id)).returning();
    if (!d) return res.status(404).json({ message: "Not found" });
    res.json({ message: "Deleted" });
  } catch (error: any) { res.status(400).json({ message: error.message }); }
});

// Currency Exposures CRUD
router.get("/currency-exposures", async (_req, res) => {
  try {
    const items = await db.select().from(currencyExposuresTable).orderBy(desc(currencyExposuresTable.createdAt));
    res.json(items);
  } catch (error: any) { res.status(500).json({ message: error.message }); }
});

router.get("/currency-exposures/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [item] = await db.select().from(currencyExposuresTable).where(eq(currencyExposuresTable.id, id));
    if (!item) return res.status(404).json({ message: "Not found" });
    res.json(item);
  } catch (error: any) { res.status(400).json({ message: error.message }); }
});

router.post("/currency-exposures", async (req, res) => {
  try {
    const cleaned = cleanData(req.body, exposureNumericFields, exposureDateFields);
    if (!cleaned.exposureNumber) cleaned.exposureNumber = await genNumber("EXP", currencyExposuresTable);
    const [item] = await db.insert(currencyExposuresTable).values(cleaned).returning();
    res.status(201).json(item);
  } catch (error: any) { res.status(400).json({ message: error.message }); }
});

router.put("/currency-exposures/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const cleaned = cleanData(req.body, exposureNumericFields, exposureDateFields);
    const [item] = await db.update(currencyExposuresTable).set({ ...cleaned, updatedAt: new Date() }).where(eq(currencyExposuresTable.id, id)).returning();
    if (!item) return res.status(404).json({ message: "Not found" });
    res.json(item);
  } catch (error: any) { res.status(400).json({ message: error.message }); }
});

router.delete("/currency-exposures/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [d] = await db.delete(currencyExposuresTable).where(eq(currencyExposuresTable.id, id)).returning();
    if (!d) return res.status(404).json({ message: "Not found" });
    res.json({ message: "Deleted" });
  } catch (error: any) { res.status(400).json({ message: error.message }); }
});

export default router;
