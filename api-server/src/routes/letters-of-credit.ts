import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { lettersOfCreditTable, lcAmendmentsTable } from "@workspace/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

function cleanData(body: any) {
  const cleaned = { ...body };
  const dateFields = ["issueDate", "expiryDate", "latestShipmentDate", "lastAmendmentDate", "negotiationDate", "paymentDate", "approvedDate", "amendmentDate", "approvedDate"];
  const numericFields = ["amount", "amountTolerancePlus", "amountToleranceMinus", "commissionRate", "commissionAmount", "insuranceCoverage", "paidAmount", "outstandingAmount", "feeAmount"];
  const intFields = ["presentationPeriod", "deferredPaymentDays", "amendmentCount", "linkedImportOrderId", "linkedSupplierId", "lcId", "amendmentNumber"];
  const boolFields = ["insuranceRequired"];
  for (const key of dateFields) { if (cleaned[key] === "") cleaned[key] = null; }
  for (const key of numericFields) { if (cleaned[key] === "") cleaned[key] = undefined; }
  for (const key of intFields) {
    if (cleaned[key] === "" || cleaned[key] === null) cleaned[key] = undefined;
    else if (cleaned[key] !== undefined) cleaned[key] = parseInt(cleaned[key]);
  }
  for (const key of boolFields) {
    if (typeof cleaned[key] === "string") cleaned[key] = cleaned[key] === "true";
  }
  delete cleaned.id;
  delete cleaned.createdAt;
  delete cleaned.updatedAt;
  return cleaned;
}

async function generateLcNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const [result] = await db.select({ count: sql<number>`count(*)` }).from(lettersOfCreditTable);
  const num = (result?.count || 0) + 1;
  return `LC-${year}-${String(num).padStart(4, "0")}`;
}

router.get("/letters-of-credit", async (_req, res) => {
  try {
    const items = await db.select().from(lettersOfCreditTable).orderBy(desc(lettersOfCreditTable.createdAt));
    res.json(items);
  } catch (error: any) { res.status(500).json({ message: error.message }); }
});

router.get("/letters-of-credit/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [item] = await db.select().from(lettersOfCreditTable).where(eq(lettersOfCreditTable.id, id));
    if (!item) return res.status(404).json({ message: "Not found" });
    res.json(item);
  } catch (error: any) { res.status(400).json({ message: error.message }); }
});

router.post("/letters-of-credit", async (req, res) => {
  try {
    const cleaned = cleanData(req.body);
    if (!cleaned.lcNumber) cleaned.lcNumber = await generateLcNumber();
    const [item] = await db.insert(lettersOfCreditTable).values(cleaned).returning();
    res.status(201).json(item);
  } catch (error: any) { res.status(400).json({ message: error.message }); }
});

router.put("/letters-of-credit/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const cleaned = cleanData(req.body);
    const [item] = await db.update(lettersOfCreditTable).set({ ...cleaned, updatedAt: new Date() }).where(eq(lettersOfCreditTable.id, id)).returning();
    if (!item) return res.status(404).json({ message: "Not found" });
    res.json(item);
  } catch (error: any) { res.status(400).json({ message: error.message }); }
});

router.delete("/letters-of-credit/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [deleted] = await db.delete(lettersOfCreditTable).where(eq(lettersOfCreditTable.id, id)).returning();
    if (!deleted) return res.status(404).json({ message: "Not found" });
    res.json({ message: "Deleted" });
  } catch (error: any) { res.status(400).json({ message: error.message }); }
});

router.get("/letters-of-credit/:id/amendments", async (req, res) => {
  try {
    const lcId = z.coerce.number().int().positive().parse(req.params.id);
    const items = await db.select().from(lcAmendmentsTable).where(eq(lcAmendmentsTable.lcId, lcId)).orderBy(desc(lcAmendmentsTable.createdAt));
    res.json(items);
  } catch (error: any) { res.status(500).json({ message: error.message }); }
});

router.post("/lc-amendments", async (req, res) => {
  try {
    const cleaned = cleanData(req.body);
    if (!cleaned.amendmentDate) cleaned.amendmentDate = new Date().toISOString().split("T")[0];
    const [item] = await db.insert(lcAmendmentsTable).values(cleaned).returning();
    if (cleaned.lcId) {
      const amendments = await db.select().from(lcAmendmentsTable).where(eq(lcAmendmentsTable.lcId, cleaned.lcId));
      await db.update(lettersOfCreditTable).set({ amendmentCount: amendments.length, lastAmendmentDate: cleaned.amendmentDate, updatedAt: new Date() }).where(eq(lettersOfCreditTable.id, cleaned.lcId));
    }
    res.status(201).json(item);
  } catch (error: any) { res.status(400).json({ message: error.message }); }
});

router.delete("/lc-amendments/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [deleted] = await db.delete(lcAmendmentsTable).where(eq(lcAmendmentsTable.id, id)).returning();
    if (!deleted) return res.status(404).json({ message: "Not found" });
    res.json({ message: "Deleted" });
  } catch (error: any) { res.status(400).json({ message: error.message }); }
});

export default router;
