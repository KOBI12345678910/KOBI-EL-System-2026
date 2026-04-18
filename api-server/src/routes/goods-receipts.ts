import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { goodsReceiptsTable, goodsReceiptItemsTable, inventoryTransactionsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { z } from "zod/v4";
import { onGoodsReceiptCompleted, matchesStatus, COMPLETED_STATUSES } from "../lib/data-sync";

const router: IRouter = Router();

function cleanGoodsReceiptData(body: any) {
  const cleaned = { ...body };
  if (cleaned.deliveryNoteNumber === "") cleaned.deliveryNoteNumber = null;
  if (cleaned.vehicleNumber === "") cleaned.vehicleNumber = null;
  if (cleaned.inspector === "") cleaned.inspector = null;
  if (cleaned.receivedBy === "") cleaned.receivedBy = null;
  if (cleaned.warehouseLocation === "") cleaned.warehouseLocation = null;
  return cleaned;
}

router.get("/goods-receipts", async (req, res) => {
  try {
    const receipts = await db.select().from(goodsReceiptsTable).orderBy(desc(goodsReceiptsTable.createdAt));
    res.json(receipts);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/goods-receipts/stats", async (_req, res) => {
  try {
    const { goodsReceiptsTable } = await import("@workspace/db/schema");
    const receipts = await db.select().from(goodsReceiptsTable);
    const stats = {
      total: receipts.length,
      pending: receipts.filter((r: any) => r.status === "חדש" || r.status === "בבדיקה").length,
      approved: receipts.filter((r: any) => r.status === "מאושר").length,
      rejected: receipts.filter((r: any) => r.status === "נדחה").length,
    };
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/goods-receipts/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [receipt] = await db.select().from(goodsReceiptsTable).where(eq(goodsReceiptsTable.id, id));
    if (!receipt) return res.status(404).json({ message: "Not found" });
    const items = await db.select().from(goodsReceiptItemsTable).where(eq(goodsReceiptItemsTable.receiptId, id));
    res.json({ ...receipt, items });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.post("/goods-receipts", async (req, res) => {
  try {
    const body = z.object({
      receiptNumber: z.string().min(1),
      orderId: z.coerce.number().int().positive().optional().nullable(),
      supplierId: z.coerce.number().int().positive(),
      receiptDate: z.string().optional(),
      status: z.string().optional(),
      receivedBy: z.string().optional(),
      warehouseLocation: z.string().optional(),
      deliveryNoteNumber: z.string().optional(),
      vehicleNumber: z.string().optional(),
      inspector: z.string().optional(),
      overallQuality: z.string().optional(),
      notes: z.string().optional(),
    }).parse(req.body);
    const [receipt] = await db.insert(goodsReceiptsTable).values(cleanGoodsReceiptData(body)).returning();
    res.status(201).json(receipt);
  } catch (error: any) {
    const msg = error.message || "";
    if (msg.includes("duplicate") || msg.includes("unique") || msg.includes("receipt_number")) {
      return res.status(409).json({ message: "מספר קבלה כבר קיים" });
    }
    res.status(400).json({ message: msg });
  }
});

router.put("/goods-receipts/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [existingReceipt] = await db.select().from(goodsReceiptsTable).where(eq(goodsReceiptsTable.id, id));
    const oldStatus = existingReceipt?.status;
    const body = z.object({
      orderId: z.coerce.number().int().positive().optional().nullable(),
      supplierId: z.coerce.number().int().positive().optional(),
      receiptDate: z.string().optional(),
      status: z.string().optional(),
      receivedBy: z.string().optional(),
      warehouseLocation: z.string().optional(),
      deliveryNoteNumber: z.string().optional(),
      vehicleNumber: z.string().optional(),
      inspector: z.string().optional(),
      overallQuality: z.string().optional(),
      notes: z.string().optional(),
    }).parse(req.body);
    const [receipt] = await db.update(goodsReceiptsTable).set({ ...cleanGoodsReceiptData(body), updatedAt: new Date() }).where(eq(goodsReceiptsTable.id, id)).returning();
    if (!receipt) return res.status(404).json({ message: "Not found" });

    if (body.status && body.status !== oldStatus && matchesStatus(body.status, COMPLETED_STATUSES)) {
      onGoodsReceiptCompleted(id).catch(err => console.error("[data-sync] goods receipt cascade error:", err));
    }

    res.json(receipt);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.delete("/goods-receipts/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await db.delete(goodsReceiptItemsTable).where(eq(goodsReceiptItemsTable.receiptId, id));
    const [deleted] = await db.delete(goodsReceiptsTable).where(eq(goodsReceiptsTable.id, id)).returning();
    if (!deleted) return res.status(404).json({ message: "Not found" });
    res.json({ message: "Deleted" });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.post("/goods-receipts/:id/items", async (req, res) => {
  try {
    const receiptId = z.coerce.number().int().positive().parse(req.params.id);
    const body = z.object({
      orderItemId: z.coerce.number().int().positive().optional().nullable(),
      materialId: z.coerce.number().int().positive().optional().nullable(),
      itemCode: z.string().optional().nullable(),
      itemDescription: z.string().min(1),
      expectedQuantity: z.string().optional(),
      receivedQuantity: z.string().optional(),
      unit: z.string().optional(),
      qualityStatus: z.string().optional(),
      lotNumber: z.string().optional().nullable(),
      serialNumber: z.string().optional().nullable(),
      conditionNotes: z.string().optional().nullable(),
      photoUrls: z.string().optional().nullable(),
      storageLocation: z.string().optional().nullable(),
      expiryDate: z.string().optional().nullable(),
      notes: z.string().optional().nullable(),
    }).parse(req.body);
    const cleaned: any = { ...body, receiptId };
    if (cleaned.expiryDate === "") cleaned.expiryDate = null;
    if (cleaned.lotNumber === "") cleaned.lotNumber = null;
    if (cleaned.serialNumber === "") cleaned.serialNumber = null;
    if (cleaned.conditionNotes === "") cleaned.conditionNotes = null;
    if (cleaned.photoUrls === "") cleaned.photoUrls = null;
    if (cleaned.storageLocation === "") cleaned.storageLocation = null;
    const [item] = await db.insert(goodsReceiptItemsTable).values(cleaned).returning();
    res.status(201).json(item);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.get("/inventory-transactions", async (req, res) => {
  try {
    const transactions = await db.select().from(inventoryTransactionsTable).orderBy(desc(inventoryTransactionsTable.createdAt));
    res.json(transactions);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/inventory-transactions", async (req, res) => {
  try {
    const body = z.object({
      materialId: z.coerce.number().int().positive(),
      transactionType: z.string().min(1),
      quantity: z.string().min(1),
      referenceType: z.string().optional(),
      referenceId: z.coerce.number().int().positive().optional(),
      warehouseLocation: z.string().optional(),
      notes: z.string().optional(),
      performedBy: z.string().optional(),
    }).parse(req.body);
    const [tx] = await db.insert(inventoryTransactionsTable).values(body).returning();
    res.status(201).json(tx);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

export default router;
