import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { supplierContractsTable } from "@workspace/db/schema";
import { eq, desc, sql, lte, gte, and } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

function cleanData(body: any) {
  const cleaned = { ...body };
  const dateFields = ["startDate", "endDate"];
  const numericFields = ["contractValue", "slaUptimePct", "penaltyLateDelivery", "penaltyQualityIssue", "penaltySlaBreach"];
  const intFields = ["supplierId", "renewalPeriodMonths", "renewalNoticeDays", "warrantyPeriodMonths", "terminationNoticeDays"];
  for (const key of dateFields) {
    if (cleaned[key] === "") cleaned[key] = null;
  }
  for (const key of numericFields) {
    if (cleaned[key] === "") cleaned[key] = undefined;
  }
  for (const key of intFields) {
    if (cleaned[key] === "" || cleaned[key] === null) cleaned[key] = undefined;
    else if (cleaned[key] !== undefined) cleaned[key] = parseInt(cleaned[key]);
  }
  if (typeof cleaned.autoRenewal === "string") cleaned.autoRenewal = cleaned.autoRenewal === "true";
  return cleaned;
}

async function generateContractNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const [result] = await db.select({ count: sql<number>`count(*)` }).from(supplierContractsTable);
  const num = (result?.count || 0) + 1;
  return `CON-${year}-${String(num).padStart(4, "0")}`;
}

router.get("/supplier-contracts", async (_req, res) => {
  try {
    const contracts = await db.select().from(supplierContractsTable).orderBy(desc(supplierContractsTable.createdAt));
    res.json(contracts);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/supplier-contracts/stats", async (_req, res) => {
  try {
    const contracts = await db.select().from(supplierContractsTable);
    const now = new Date();
    const stats = {
      total: contracts.length,
      active: contracts.filter((c: any) => c.status === "פעיל" || c.status === "active").length,
      expired: contracts.filter((c: any) => {
        if (c.endDate) return new Date(c.endDate) < now;
        return c.status === "פג תוקף" || c.status === "expired";
      }).length,
      expiringSoon: contracts.filter((c: any) => {
        if (!c.endDate) return false;
        const days = Math.ceil((new Date(c.endDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return days >= 0 && days <= 30;
      }).length,
    };
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/supplier-contracts/:id", async (req, res): Promise<void> => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [contract] = await db.select().from(supplierContractsTable).where(eq(supplierContractsTable.id, id));
    if (!contract) { res.status(404).json({ message: "Contract not found" }); return; }
    res.json(contract);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.get("/supplier-contracts/by-supplier/:supplierId", async (req, res) => {
  try {
    const supplierId = z.coerce.number().int().positive().parse(req.params.supplierId);
    const contracts = await db.select().from(supplierContractsTable)
      .where(eq(supplierContractsTable.supplierId, supplierId))
      .orderBy(desc(supplierContractsTable.startDate));
    res.json(contracts);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.get("/supplier-contracts/expiring/:days", async (req, res) => {
  try {
    const days = z.coerce.number().int().positive().parse(req.params.days);
    const today = new Date().toISOString().split("T")[0];
    const futureDate = new Date(Date.now() + days * 86400000).toISOString().split("T")[0];
    const contracts = await db.select().from(supplierContractsTable)
      .where(and(
        gte(supplierContractsTable.endDate, today),
        lte(supplierContractsTable.endDate, futureDate),
        sql`${supplierContractsTable.status} NOT IN ('בוטל', 'הסתיים')`,
      ))
      .orderBy(supplierContractsTable.endDate);
    res.json(contracts);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.post("/supplier-contracts", async (req, res) => {
  try {
    const cleaned = cleanData(req.body);
    if (!cleaned.contractNumber) {
      cleaned.contractNumber = await generateContractNumber();
    }
    const [contract] = await db.insert(supplierContractsTable).values(cleaned).returning();
    res.status(201).json(contract);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.put("/supplier-contracts/:id", async (req, res): Promise<void> => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const cleaned = cleanData(req.body);
    const [contract] = await db.update(supplierContractsTable)
      .set({ ...cleaned, updatedAt: new Date() })
      .where(eq(supplierContractsTable.id, id)).returning();
    if (!contract) { res.status(404).json({ message: "Contract not found" }); return; }
    res.json(contract);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.delete("/supplier-contracts/:id", async (req, res): Promise<void> => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [deleted] = await db.delete(supplierContractsTable).where(eq(supplierContractsTable.id, id)).returning();
    if (!deleted) { res.status(404).json({ message: "Contract not found" }); return; }
    res.json({ message: "Deleted" });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

export default router;
