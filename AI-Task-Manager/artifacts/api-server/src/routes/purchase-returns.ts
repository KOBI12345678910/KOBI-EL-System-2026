import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { purchaseReturnsTable, purchaseReturnItemsTable } from "@workspace/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

function cleanData(body: any) {
  const cleaned = { ...body };
  const dateFields = ["returnDate", "creditNoteDate"];
  const numericFields = ["creditNoteAmount", "totalValue"];
  const intFields = ["purchaseOrderId", "goodsReceiptId", "supplierId", "replacementOrderId", "totalItems"];
  for (const key of dateFields) {
    if (cleaned[key] === "") cleaned[key] = null;
  }
  for (const key of numericFields) {
    if (cleaned[key] === "") cleaned[key] = undefined;
  }
  for (const key of intFields) {
    if (cleaned[key] === "" || cleaned[key] === null) cleaned[key] = undefined;
  }
  return cleaned;
}

async function generateReturnNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const [result] = await db.select({ count: sql<number>`count(*)` }).from(purchaseReturnsTable);
  const num = (result?.count || 0) + 1;
  return `RET-${year}-${String(num).padStart(4, "0")}`;
}

router.get("/purchase-returns", async (_req, res) => {
  try {
    const returns = await db.select().from(purchaseReturnsTable).orderBy(desc(purchaseReturnsTable.returnDate));
    res.json(returns);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/purchase-returns/stats", async (_req, res) => {
  try {
    const returns = await db.select().from(purchaseReturnsTable);
    const stats = {
      total: returns.length,
      pending: returns.filter((r: any) => r.status === "ממתין" || r.status === "pending" || r.status === "חדש").length,
      approved: returns.filter((r: any) => r.status === "מאושר" || r.status === "approved").length,
      completed: returns.filter((r: any) => r.status === "הושלם" || r.status === "completed").length,
      totalAmount: returns.reduce((sum: number, r: any) => sum + parseFloat(r.totalRefundAmount || r.totalAmount || "0"), 0),
    };
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/purchase-returns/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [ret] = await db.select().from(purchaseReturnsTable).where(eq(purchaseReturnsTable.id, id));
    if (!ret) return res.status(404).json({ message: "Return not found" });
    res.json(ret);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.get("/purchase-returns/:id/items", async (req, res) => {
  try {
    const returnId = z.coerce.number().int().positive().parse(req.params.id);
    const items = await db.select().from(purchaseReturnItemsTable).where(eq(purchaseReturnItemsTable.returnId, returnId));
    res.json(items);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.post("/purchase-returns", async (req, res) => {
  try {
    const { items, ...body } = req.body;
    const cleaned = cleanData(body);
    if (!cleaned.returnNumber) {
      cleaned.returnNumber = await generateReturnNumber();
    }

    let totalItems = 0;
    let totalValue = 0;
    if (Array.isArray(items)) {
      for (const item of items) {
        const qty = parseFloat(item.returnedQuantity || "0");
        const price = parseFloat(item.unitPrice || "0");
        totalItems += qty;
        totalValue += qty * price;
      }
    }
    cleaned.totalItems = Math.round(totalItems);
    cleaned.totalValue = totalValue.toFixed(2);

    const [ret] = await db.insert(purchaseReturnsTable).values(cleaned).returning();

    if (Array.isArray(items) && items.length > 0) {
      const itemRows = items.map((item: any) => ({
        returnId: ret.id,
        materialId: item.materialId || null,
        itemCode: item.itemCode || null,
        itemName: item.itemName || "",
        unit: item.unit || "יח",
        orderedQuantity: item.orderedQuantity || "0",
        receivedQuantity: item.receivedQuantity || "0",
        returnedQuantity: item.returnedQuantity || "0",
        unitPrice: item.unitPrice || "0",
        totalPrice: (parseFloat(item.returnedQuantity || "0") * parseFloat(item.unitPrice || "0")).toFixed(2),
        reason: item.reason || null,
        conditionOnReturn: item.conditionOnReturn || "פגום",
        lotNumber: item.lotNumber || null,
        serialNumber: item.serialNumber || null,
        inspectionNotes: item.inspectionNotes || null,
        photoUrls: item.photoUrls || null,
        status: item.status || "ממתין",
      }));
      await db.insert(purchaseReturnItemsTable).values(itemRows);
    }

    res.status(201).json(ret);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.put("/purchase-returns/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const { items, ...body } = req.body;
    const cleaned = cleanData(body);

    if (Array.isArray(items)) {
      let totalItems = 0;
      let totalValue = 0;
      for (const item of items) {
        const qty = parseFloat(item.returnedQuantity || "0");
        const price = parseFloat(item.unitPrice || "0");
        totalItems += qty;
        totalValue += qty * price;
      }
      cleaned.totalItems = Math.round(totalItems);
      cleaned.totalValue = totalValue.toFixed(2);

      await db.delete(purchaseReturnItemsTable).where(eq(purchaseReturnItemsTable.returnId, id));
      if (items.length > 0) {
        const itemRows = items.map((item: any) => ({
          returnId: id,
          materialId: item.materialId || null,
          itemCode: item.itemCode || null,
          itemName: item.itemName || "",
          unit: item.unit || "יח",
          orderedQuantity: item.orderedQuantity || "0",
          receivedQuantity: item.receivedQuantity || "0",
          returnedQuantity: item.returnedQuantity || "0",
          unitPrice: item.unitPrice || "0",
          totalPrice: (parseFloat(item.returnedQuantity || "0") * parseFloat(item.unitPrice || "0")).toFixed(2),
          reason: item.reason || null,
          conditionOnReturn: item.conditionOnReturn || "פגום",
          lotNumber: item.lotNumber || null,
          serialNumber: item.serialNumber || null,
          inspectionNotes: item.inspectionNotes || null,
          photoUrls: item.photoUrls || null,
          status: item.status || "ממתין",
        }));
        await db.insert(purchaseReturnItemsTable).values(itemRows);
      }
    }

    const [ret] = await db.update(purchaseReturnsTable)
      .set({ ...cleaned, updatedAt: new Date() })
      .where(eq(purchaseReturnsTable.id, id)).returning();
    if (!ret) return res.status(404).json({ message: "Return not found" });
    res.json(ret);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.delete("/purchase-returns/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await db.delete(purchaseReturnItemsTable).where(eq(purchaseReturnItemsTable.returnId, id));
    const [deleted] = await db.delete(purchaseReturnsTable).where(eq(purchaseReturnsTable.id, id)).returning();
    if (!deleted) return res.status(404).json({ message: "Return not found" });
    res.json({ message: "Deleted" });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.put("/purchase-return-items/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const body = req.body;
    if (body.returnedQuantity && body.unitPrice) {
      body.totalPrice = (parseFloat(body.returnedQuantity) * parseFloat(body.unitPrice)).toFixed(2);
    }
    const [item] = await db.update(purchaseReturnItemsTable)
      .set(body)
      .where(eq(purchaseReturnItemsTable.id, id)).returning();
    if (!item) return res.status(404).json({ message: "Item not found" });
    res.json(item);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

export default router;
