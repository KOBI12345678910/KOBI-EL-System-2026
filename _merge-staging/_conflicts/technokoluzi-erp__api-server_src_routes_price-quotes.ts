import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { priceQuotesTable, priceQuoteItemsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

router.get("/price-quotes", async (req, res) => {
  try {
    const quotes = await db.select().from(priceQuotesTable).orderBy(desc(priceQuotesTable.createdAt));
    res.json(quotes);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/price-quotes/stats", async (_req, res) => {
  try {
    const { priceQuotesTable } = await import("@workspace/db/schema");
    const quotes = await db.select().from(priceQuotesTable);
    const stats = {
      total: quotes.length,
      active: quotes.filter((q: any) => q.status === "פעיל" || q.status === "active").length,
      expired: quotes.filter((q: any) => q.status === "פג תוקף" || q.status === "expired").length,
      pending: quotes.filter((q: any) => q.status === "ממתין" || q.status === "pending").length,
      draft: quotes.filter((q: any) => q.status === "טיוטה" || q.status === "draft").length,
    };
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/price-quotes/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [quote] = await db.select().from(priceQuotesTable).where(eq(priceQuotesTable.id, id));
    if (!quote) return res.status(404).json({ message: "Not found" });
    const items = await db.select().from(priceQuoteItemsTable).where(eq(priceQuoteItemsTable.quoteId, id));
    res.json({ ...quote, items });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.post("/price-quotes", async (req, res) => {
  try {
    const body = z.object({
      quoteNumber: z.string().min(1),
      supplierId: z.coerce.number().int().positive(),
      requestId: z.coerce.number().int().positive().optional().nullable(),
      status: z.string().optional(),
      quoteDate: z.string().optional(),
      validityDate: z.string().optional().nullable(),
      totalAmount: z.string().optional(),
      totalBeforeTax: z.string().optional(),
      taxAmount: z.string().optional(),
      currency: z.string().optional(),
      paymentTerms: z.string().optional(),
      deliveryDays: z.coerce.number().int().nonnegative().optional().nullable(),
      isRecommended: z.boolean().optional(),
      comparisonGroup: z.string().optional(),
      notes: z.string().optional(),
      createdBy: z.string().optional(),
    }).parse(req.body);
    const cleaned: any = { ...body };
    if (cleaned.validityDate === "") cleaned.validityDate = null;
    const [quote] = await db.insert(priceQuotesTable).values(cleaned).returning();
    res.status(201).json(quote);
  } catch (error: any) {
    const msg = error.message || "";
    if (msg.includes("duplicate") || msg.includes("unique") || msg.includes("quote_number")) {
      return res.status(409).json({ message: "מספר הצעה כבר קיים" });
    }
    res.status(400).json({ message: msg });
  }
});

router.put("/price-quotes/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const body = z.object({
      supplierId: z.coerce.number().int().positive().optional(),
      requestId: z.coerce.number().int().positive().optional().nullable(),
      status: z.string().optional(),
      validityDate: z.string().optional().nullable(),
      totalAmount: z.string().optional(),
      totalBeforeTax: z.string().optional(),
      taxAmount: z.string().optional(),
      currency: z.string().optional(),
      paymentTerms: z.string().optional(),
      deliveryDays: z.coerce.number().int().nonnegative().optional().nullable(),
      isRecommended: z.boolean().optional(),
      comparisonGroup: z.string().optional(),
      notes: z.string().optional(),
    }).parse(req.body);
    const cleaned: any = { ...body, updatedAt: new Date() };
    if (cleaned.validityDate === "") cleaned.validityDate = null;
    const [quote] = await db.update(priceQuotesTable).set(cleaned).where(eq(priceQuotesTable.id, id)).returning();
    if (!quote) return res.status(404).json({ message: "Not found" });
    res.json(quote);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.delete("/price-quotes/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await db.delete(priceQuoteItemsTable).where(eq(priceQuoteItemsTable.quoteId, id));
    const [deleted] = await db.delete(priceQuotesTable).where(eq(priceQuotesTable.id, id)).returning();
    if (!deleted) return res.status(404).json({ message: "Not found" });
    res.json({ message: "Deleted" });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.post("/price-quotes/:id/items", async (req, res) => {
  try {
    const quoteId = z.coerce.number().int().positive().parse(req.params.id);
    const body = z.object({
      materialId: z.coerce.number().int().positive().optional().nullable(),
      itemCode: z.string().optional().nullable(),
      itemDescription: z.string().min(1),
      quantity: z.string().optional(),
      unit: z.string().optional(),
      unitPrice: z.string().optional(),
      discountPercent: z.string().optional(),
      taxPercent: z.string().optional(),
      totalPrice: z.string().optional(),
      notes: z.string().optional().nullable(),
    }).parse(req.body);
    const [item] = await db.insert(priceQuoteItemsTable).values({ ...body, quoteId }).returning();
    res.status(201).json(item);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.delete("/price-quote-items/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await db.delete(priceQuoteItemsTable).where(eq(priceQuoteItemsTable.id, id));
    res.json({ message: "Deleted" });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

export default router;
