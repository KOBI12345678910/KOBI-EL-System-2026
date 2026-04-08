import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { supplierPriceHistoryTable } from "@workspace/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

router.get("/price-history/stats", async (_req, res) => {
  try {
    const history = await db.select().from(supplierPriceHistoryTable);
    const stats = {
      total: history.length,
      suppliers: new Set(history.map(h => h.supplierId)).size,
      materials: new Set(history.map(h => h.materialId)).size,
      avgPrice: history.length > 0 ? Math.round(history.reduce((sum, h) => sum + parseFloat(String(h.price || "0")), 0) / history.length * 100) / 100 : 0,
    };
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/price-history", async (req, res) => {
  try {
    const { supplierId, materialId } = req.query;
    let query = db.select().from(supplierPriceHistoryTable).orderBy(desc(supplierPriceHistoryTable.createdAt)).$dynamic();
    if (supplierId && typeof supplierId === "string") {
      query = query.where(eq(supplierPriceHistoryTable.supplierId, parseInt(supplierId)));
    }
    if (materialId && typeof materialId === "string") {
      query = query.where(eq(supplierPriceHistoryTable.materialId, parseInt(materialId)));
    }
    const history = await query;
    res.json(history);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/price-history", async (req, res) => {
  try {
    const body = z.object({
      supplierId: z.coerce.number().int().positive(),
      materialId: z.coerce.number().int().positive(),
      price: z.string().min(1),
      currency: z.string().optional(),
      validFrom: z.string().optional(),
      validUntil: z.string().optional(),
      priceListName: z.string().optional(),
      discountPercentage: z.string().optional(),
      notes: z.string().optional(),
    }).parse(req.body);
    const [entry] = await db.insert(supplierPriceHistoryTable).values(body).returning();
    res.status(201).json(entry);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.delete("/price-history/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await db.delete(supplierPriceHistoryTable).where(eq(supplierPriceHistoryTable.id, id));
    res.json({ message: "Deleted" });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

export default router;
