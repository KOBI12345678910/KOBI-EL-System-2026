import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { foreignSuppliersTable } from "@workspace/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

function cleanData(body: any) {
  const cleaned = { ...body };
  const dateFields = ["lastOrderDate", "sanctionsCheckDate"];
  const numericFields = ["creditLimit", "minOrderValue", "annualImportVolume", "totalImportValue", "avgDeliveryScore", "avgQualityScore"];
  const intFields = ["leadTimeDays", "totalOrders"];
  const boolFields = ["freeTradeZone", "preferentialOrigin", "iso9001", "iso14001", "iso45001", "ceMarking", "ulListed", "rohsCompliant", "reachCompliant", "sanctionsCheck", "insuranceRequired", "lcRequired"];
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

async function generateSupplierCode(): Promise<string> {
  const [result] = await db.select({ count: sql<number>`count(*)` }).from(foreignSuppliersTable);
  const num = (result?.count || 0) + 1;
  return `FS-${String(num).padStart(4, "0")}`;
}

router.get("/foreign-suppliers", async (_req, res) => {
  try {
    const suppliers = await db.select().from(foreignSuppliersTable).orderBy(desc(foreignSuppliersTable.createdAt));
    res.json(suppliers);
  } catch (error: any) { res.status(500).json({ message: error.message }); }
});

router.get("/foreign-suppliers/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [s] = await db.select().from(foreignSuppliersTable).where(eq(foreignSuppliersTable.id, id));
    if (!s) return res.status(404).json({ message: "Not found" });
    res.json(s);
  } catch (error: any) { res.status(400).json({ message: error.message }); }
});

router.post("/foreign-suppliers", async (req, res) => {
  try {
    const cleaned = cleanData(req.body);
    if (!cleaned.supplierCode) cleaned.supplierCode = await generateSupplierCode();
    const [s] = await db.insert(foreignSuppliersTable).values(cleaned).returning();
    res.status(201).json(s);
  } catch (error: any) { res.status(400).json({ message: error.message }); }
});

router.put("/foreign-suppliers/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const cleaned = cleanData(req.body);
    const [s] = await db.update(foreignSuppliersTable).set({ ...cleaned, updatedAt: new Date() }).where(eq(foreignSuppliersTable.id, id)).returning();
    if (!s) return res.status(404).json({ message: "Not found" });
    res.json(s);
  } catch (error: any) { res.status(400).json({ message: error.message }); }
});

router.delete("/foreign-suppliers/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [deleted] = await db.delete(foreignSuppliersTable).where(eq(foreignSuppliersTable.id, id)).returning();
    if (!deleted) return res.status(404).json({ message: "Not found" });
    res.json({ message: "Deleted" });
  } catch (error: any) { res.status(400).json({ message: error.message }); }
});

export default router;
