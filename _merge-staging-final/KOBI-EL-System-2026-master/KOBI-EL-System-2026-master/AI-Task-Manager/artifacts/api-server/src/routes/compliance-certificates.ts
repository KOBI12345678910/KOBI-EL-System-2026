import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { complianceCertificatesTable } from "@workspace/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

function cleanData(body: any) {
  const cleaned = { ...body };
  const dateFields = ["issueDate", "expiryDate", "renewalDate", "lastAuditDate", "nextAuditDate", "verifiedDate", "approvedDate"];
  const intFields = ["linkedImportOrderId", "linkedLcId", "linkedCustomsId", "copiesCount"];
  const boolFields = ["isMandatory", "isOriginal", "notarized", "apostille", "translated"];
  for (const key of dateFields) { if (cleaned[key] === "") cleaned[key] = null; }
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

async function generateCertNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const [result] = await db.select({ count: sql<number>`count(*)` }).from(complianceCertificatesTable);
  const num = (result?.count || 0) + 1;
  return `CRT-${year}-${String(num).padStart(4, "0")}`;
}

router.get("/compliance-certificates", async (_req, res) => {
  try {
    const items = await db.select().from(complianceCertificatesTable).orderBy(desc(complianceCertificatesTable.createdAt));
    res.json(items);
  } catch (error: any) { res.status(500).json({ message: error.message }); }
});

router.get("/compliance-certificates/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [item] = await db.select().from(complianceCertificatesTable).where(eq(complianceCertificatesTable.id, id));
    if (!item) return res.status(404).json({ message: "Not found" });
    res.json(item);
  } catch (error: any) { res.status(400).json({ message: error.message }); }
});

router.post("/compliance-certificates", async (req, res) => {
  try {
    const cleaned = cleanData(req.body);
    if (!cleaned.certNumber) cleaned.certNumber = await generateCertNumber();
    const [item] = await db.insert(complianceCertificatesTable).values(cleaned).returning();
    res.status(201).json(item);
  } catch (error: any) { res.status(400).json({ message: error.message }); }
});

router.put("/compliance-certificates/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const cleaned = cleanData(req.body);
    const [item] = await db.update(complianceCertificatesTable).set({ ...cleaned, updatedAt: new Date() }).where(eq(complianceCertificatesTable.id, id)).returning();
    if (!item) return res.status(404).json({ message: "Not found" });
    res.json(item);
  } catch (error: any) { res.status(400).json({ message: error.message }); }
});

router.delete("/compliance-certificates/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [deleted] = await db.delete(complianceCertificatesTable).where(eq(complianceCertificatesTable.id, id)).returning();
    if (!deleted) return res.status(404).json({ message: "Not found" });
    res.json({ message: "Deleted" });
  } catch (error: any) { res.status(400).json({ message: error.message }); }
});

export default router;
