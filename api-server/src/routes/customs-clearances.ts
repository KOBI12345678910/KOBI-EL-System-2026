import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { customsClearancesTable } from "@workspace/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

function cleanData(body: any) {
  const cleaned = { ...body };
  const dateFields = ["arrivalDate", "submissionDate", "releaseDate", "clearanceDate"];
  const numericFields = ["goodsValue", "exchangeRate", "goodsValueIls", "customsDutyPct", "customsDutyAmount", "purchaseTaxPct", "purchaseTaxAmount", "vatPct", "vatAmount", "portFees", "storageFees", "inspectionFees", "brokerFees", "otherFees", "totalFees", "totalTaxes", "totalCost"];
  const intFields = ["importOrderId"];
  const boolFields = ["docCommercialInvoice", "docPackingList", "docBillOfLading", "docCertificateOfOrigin", "docInsuranceCertificate", "docCustomsDeclaration", "docInspectionReport", "docLetterOfCredit", "docPhytosanitary", "docStandardsCertificate"];
  for (const key of dateFields) { if (cleaned[key] === "") cleaned[key] = null; }
  for (const key of numericFields) { if (cleaned[key] === "") cleaned[key] = undefined; }
  for (const key of intFields) {
    if (cleaned[key] === "" || cleaned[key] === null) cleaned[key] = undefined;
    else if (cleaned[key] !== undefined) cleaned[key] = parseInt(cleaned[key]);
  }
  for (const key of boolFields) {
    if (typeof cleaned[key] === "string") cleaned[key] = cleaned[key] === "true";
  }
  return cleaned;
}

async function generateClearanceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const [result] = await db.select({ count: sql<number>`count(*)` }).from(customsClearancesTable);
  const num = (result?.count || 0) + 1;
  return `CUS-${year}-${String(num).padStart(4, "0")}`;
}

router.get("/customs-clearances", async (_req, res) => {
  try {
    const clearances = await db.select().from(customsClearancesTable).orderBy(desc(customsClearancesTable.createdAt));
    res.json(clearances);
  } catch (error: any) { res.status(500).json({ message: error.message }); }
});

router.get("/customs-clearances/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [c] = await db.select().from(customsClearancesTable).where(eq(customsClearancesTable.id, id));
    if (!c) return res.status(404).json({ message: "Not found" });
    res.json(c);
  } catch (error: any) { res.status(400).json({ message: error.message }); }
});

router.post("/customs-clearances", async (req, res) => {
  try {
    const cleaned = cleanData(req.body);
    if (!cleaned.clearanceNumber) cleaned.clearanceNumber = await generateClearanceNumber();
    const [c] = await db.insert(customsClearancesTable).values(cleaned).returning();
    res.status(201).json(c);
  } catch (error: any) { res.status(400).json({ message: error.message }); }
});

router.put("/customs-clearances/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const cleaned = cleanData(req.body);
    const [c] = await db.update(customsClearancesTable).set({ ...cleaned, updatedAt: new Date() }).where(eq(customsClearancesTable.id, id)).returning();
    if (!c) return res.status(404).json({ message: "Not found" });
    res.json(c);
  } catch (error: any) { res.status(400).json({ message: error.message }); }
});

router.delete("/customs-clearances/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [deleted] = await db.delete(customsClearancesTable).where(eq(customsClearancesTable.id, id)).returning();
    if (!deleted) return res.status(404).json({ message: "Not found" });
    res.json({ message: "Deleted" });
  } catch (error: any) { res.status(400).json({ message: error.message }); }
});

export default router;
