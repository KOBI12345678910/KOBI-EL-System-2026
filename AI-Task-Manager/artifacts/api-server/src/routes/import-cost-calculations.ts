import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { importCostCalculationsTable } from "@workspace/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

function cleanData(body: any) {
  const cleaned = { ...body };
  const numericFields = [
    "quantity", "unitWeightKg", "totalWeightKg", "exchangeRate", "productCostPerUnit", "totalProductCost",
    "shippingCost", "insuranceRate", "insuranceCost", "customsDutyRate", "customsDutyAmount",
    "purchaseTaxRate", "purchaseTaxAmount", "vatRate", "vatAmount",
    "portFees", "storageFees", "inspectionFees", "inlandTransport", "handlingFees", "unloadingFees",
    "customsBrokerFee", "forwardingAgentFee", "agentCommissionRate", "agentCommissionAmount",
    "bankCharges", "lcCharges", "documentationFees", "otherCosts",
    "totalFreightCosts", "totalTaxesDuties", "totalPortFees", "totalAgentFees",
    "totalFinancialCosts", "totalOtherCosts", "totalLandedCost", "landedCostPerUnit", "landedCostPerKg",
    "costMarkupPercentage",
  ];
  const intFields = ["linkedImportOrderId", "containerCount"];
  for (const key of numericFields) { if (cleaned[key] === "") cleaned[key] = undefined; }
  for (const key of intFields) {
    if (cleaned[key] === "" || cleaned[key] === null) cleaned[key] = undefined;
    else if (cleaned[key] !== undefined) cleaned[key] = parseInt(cleaned[key]);
  }
  delete cleaned.id;
  delete cleaned.createdAt;
  delete cleaned.updatedAt;
  return cleaned;
}

async function generateCalcNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const [result] = await db.select({ count: sql<number>`count(*)` }).from(importCostCalculationsTable);
  const num = (result?.count || 0) + 1;
  return `ICC-${year}-${String(num).padStart(4, "0")}`;
}

router.get("/import-cost-calculations", async (_req, res) => {
  try {
    const items = await db.select().from(importCostCalculationsTable).orderBy(desc(importCostCalculationsTable.createdAt));
    res.json(items);
  } catch (error: any) { res.status(500).json({ message: error.message }); }
});

router.get("/import-cost-calculations/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [item] = await db.select().from(importCostCalculationsTable).where(eq(importCostCalculationsTable.id, id));
    if (!item) return res.status(404).json({ message: "Not found" });
    res.json(item);
  } catch (error: any) { res.status(400).json({ message: error.message }); }
});

router.post("/import-cost-calculations", async (req, res) => {
  try {
    const cleaned = cleanData(req.body);
    if (!cleaned.calcNumber) cleaned.calcNumber = await generateCalcNumber();
    const [item] = await db.insert(importCostCalculationsTable).values(cleaned).returning();
    res.status(201).json(item);
  } catch (error: any) { res.status(400).json({ message: error.message }); }
});

router.put("/import-cost-calculations/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const cleaned = cleanData(req.body);
    const [item] = await db.update(importCostCalculationsTable).set({ ...cleaned, updatedAt: new Date() }).where(eq(importCostCalculationsTable.id, id)).returning();
    if (!item) return res.status(404).json({ message: "Not found" });
    res.json(item);
  } catch (error: any) { res.status(400).json({ message: error.message }); }
});

router.delete("/import-cost-calculations/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [deleted] = await db.delete(importCostCalculationsTable).where(eq(importCostCalculationsTable.id, id)).returning();
    if (!deleted) return res.status(404).json({ message: "Not found" });
    res.json({ message: "Deleted" });
  } catch (error: any) { res.status(400).json({ message: error.message }); }
});

export default router;
