import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { importOrdersTable, importOrderItemsTable } from "@workspace/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { onImportOrderStatusChange } from "../lib/data-sync";

const router: IRouter = Router();

function cleanData(body: any) {
  const cleaned = { ...body };
  const dateFields = ["estimatedDeparture", "estimatedArrival", "actualArrival", "lcExpiryDate"];
  const numericFields = ["exchangeRate", "totalValue", "totalValueIls", "customsDutyPct", "estimatedCustomsDuty", "insuranceValue", "lcAmount", "freightCost", "handlingCost", "otherCosts", "totalLandedCost"];
  const intFields = ["supplierId", "containerCount"];
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
  return cleaned;
}

async function generateOrderNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const [result] = await db.select({ count: sql<number>`count(*)` }).from(importOrdersTable);
  const num = (result?.count || 0) + 1;
  return `IMP-${year}-${String(num).padStart(4, "0")}`;
}

router.get("/import-orders", async (_req, res) => {
  try {
    const orders = await db.select().from(importOrdersTable).orderBy(desc(importOrdersTable.createdAt));
    res.json(orders);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/import-orders/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [order] = await db.select().from(importOrdersTable).where(eq(importOrdersTable.id, id));
    if (!order) return res.status(404).json({ message: "Not found" });
    res.json(order);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.get("/import-orders/:id/items", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const items = await db.select().from(importOrderItemsTable).where(eq(importOrderItemsTable.importOrderId, id));
    res.json(items);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.post("/import-orders", async (req, res) => {
  try {
    const cleaned = cleanData(req.body);
    if (!cleaned.orderNumber) {
      cleaned.orderNumber = await generateOrderNumber();
    }
    const [order] = await db.insert(importOrdersTable).values(cleaned).returning();
    res.status(201).json(order);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.put("/import-orders/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [existingOrder] = await db.select().from(importOrdersTable).where(eq(importOrdersTable.id, id));
    const oldStatus = existingOrder?.status;
    const cleaned = cleanData(req.body);
    const [order] = await db.update(importOrdersTable)
      .set({ ...cleaned, updatedAt: new Date() })
      .where(eq(importOrdersTable.id, id)).returning();
    if (!order) return res.status(404).json({ message: "Not found" });

    if (cleaned.status && cleaned.status !== oldStatus) {
      onImportOrderStatusChange(id, cleaned.status, oldStatus).catch(err => console.error("[data-sync] import order cascade error:", err));
    }

    res.json(order);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.delete("/import-orders/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [deleted] = await db.delete(importOrdersTable).where(eq(importOrdersTable.id, id)).returning();
    if (!deleted) return res.status(404).json({ message: "Not found" });
    res.json({ message: "Deleted" });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.post("/import-order-items", async (req, res) => {
  try {
    const body = { ...req.body };
    if (body.importOrderId) body.importOrderId = parseInt(body.importOrderId);
    const numFields = ["quantity", "unitPrice", "totalPrice", "customsDutyPct", "customsDutyAmount", "weightKg", "volumeCbm"];
    for (const f of numFields) {
      if (body[f] === "") body[f] = undefined;
    }
    const [item] = await db.insert(importOrderItemsTable).values(body).returning();
    res.status(201).json(item);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.put("/import-order-items/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const body = { ...req.body };
    const numFields = ["quantity", "unitPrice", "totalPrice", "customsDutyPct", "customsDutyAmount", "weightKg", "volumeCbm"];
    for (const f of numFields) {
      if (body[f] === "") body[f] = undefined;
    }
    const [item] = await db.update(importOrderItemsTable).set(body).where(eq(importOrderItemsTable.id, id)).returning();
    if (!item) return res.status(404).json({ message: "Not found" });
    res.json(item);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.delete("/import-order-items/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [deleted] = await db.delete(importOrderItemsTable).where(eq(importOrderItemsTable.id, id)).returning();
    if (!deleted) return res.status(404).json({ message: "Not found" });
    res.json({ message: "Deleted" });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

export default router;
