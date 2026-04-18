import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { purchaseOrdersTable, purchaseOrderItemsTable, supplierContractsTable } from "@workspace/db/schema";
import { eq, desc, and, gte, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { onPurchaseOrderApproved, onPurchaseOrderReceived, matchesStatus, APPROVED_STATUSES, RECEIVED_STATUSES } from "../lib/data-sync";
import { performMatchAndSave } from "./three-way-matching";

async function getActiveContractTermsForSupplier(supplierId: number): Promise<{
  paymentTerms: string | null;
  currency: string | null;
  contractId: number;
} | null> {
  const today = new Date().toISOString().slice(0, 10);
  const contracts = await db
    .select({
      id: supplierContractsTable.id,
      paymentTerms: supplierContractsTable.paymentTerms,
      currency: supplierContractsTable.currency,
    })
    .from(supplierContractsTable)
    .where(
      and(
        eq(supplierContractsTable.supplierId, supplierId),
        eq(supplierContractsTable.status, "פעיל"),
        gte(supplierContractsTable.endDate, today)
      )
    )
    .orderBy(desc(supplierContractsTable.id))
    .limit(1);

  if (contracts.length === 0) return null;
  const c = contracts[0];
  return { paymentTerms: c.paymentTerms, currency: c.currency, contractId: c.id };
}

const router: IRouter = Router();

router.get("/purchase-orders", async (req, res) => {
  try {
    const orders = await db.select().from(purchaseOrdersTable).orderBy(desc(purchaseOrdersTable.createdAt));
    res.json(orders);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/purchase-orders/stats", async (_req, res) => {
  try {
    const { purchaseOrdersTable } = await import("@workspace/db/schema");
    const orders = await db.select().from(purchaseOrdersTable);
    const stats = {
      total: orders.length,
      open: orders.filter((o: any) => !["התקבל במלואו", "בוטל"].includes(o.status)).length,
      completed: orders.filter((o: any) => o.status === "התקבל במלואו").length,
      cancelled: orders.filter((o: any) => o.status === "בוטל").length,
      totalAmount: orders.reduce((sum: number, o: any) => sum + parseFloat(o.totalAmount || "0"), 0),
    };
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/purchase-orders/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [order] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, id));
    if (!order) return res.status(404).json({ message: "Not found" });
    const items = await db.select().from(purchaseOrderItemsTable).where(eq(purchaseOrderItemsTable.orderId, id));
    res.json({ ...order, items });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.post("/purchase-orders", async (req, res) => {
  try {
    const body = z.object({
      orderNumber: z.string().optional(),
      supplierId: z.coerce.number().int().positive(),
      requestId: z.coerce.number().int().positive().optional().nullable(),
      status: z.string().optional(),
      orderDate: z.string().optional(),
      expectedDelivery: z.string().optional(),
      totalAmount: z.string().optional(),
      currency: z.string().optional(),
      paymentTerms: z.string().optional(),
      shippingAddress: z.string().optional(),
      shippingMethod: z.string().optional(),
      totalBeforeTax: z.string().optional(),
      taxAmount: z.string().optional(),
      createdBy: z.string().optional(),
      notes: z.string().optional(),
    }).parse(req.body);

    const enrichedBody: any = { ...body };

    if (!enrichedBody.orderNumber) {
      const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(purchaseOrdersTable);
      const nextNum = (countResult?.count || 0) + 1;
      enrichedBody.orderNumber = `PO-${String(nextNum).padStart(4, "0")}`;
    }

    if (!enrichedBody.paymentTerms || !enrichedBody.currency) {
      const contractTerms = await getActiveContractTermsForSupplier(enrichedBody.supplierId).catch(err => {
        console.error(`[purchase-orders] Contract lookup failed for supplier ${enrichedBody.supplierId}:`, err);
        return null;
      });
      if (contractTerms) {
        if (!enrichedBody.paymentTerms && contractTerms.paymentTerms) {
          enrichedBody.paymentTerms = contractTerms.paymentTerms;
        }
        if (!enrichedBody.currency && contractTerms.currency) {
          enrichedBody.currency = contractTerms.currency;
        }
        console.log(`[purchase-orders] Auto-populated terms from contract #${contractTerms.contractId} for supplier ${enrichedBody.supplierId}`);
      }
    }

    const [order] = await db.insert(purchaseOrdersTable).values(enrichedBody).returning();
    res.status(201).json(order);
  } catch (error: any) {
    if (error.message?.includes("duplicate") || error.message?.includes("unique")) {
      return res.status(409).json({ message: "מספר הזמנה כבר קיים" });
    }
    res.status(400).json({ message: error.message });
  }
});

router.put("/purchase-orders/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const body = z.object({
      supplierId: z.coerce.number().int().positive().optional(),
      requestId: z.coerce.number().int().positive().optional().nullable(),
      status: z.string().optional(),
      expectedDelivery: z.string().optional(),
      totalAmount: z.string().optional(),
      currency: z.string().optional(),
      paymentTerms: z.string().optional(),
      shippingAddress: z.string().optional(),
      shippingMethod: z.string().optional(),
      totalBeforeTax: z.string().optional(),
      taxAmount: z.string().optional(),
      createdBy: z.string().optional(),
      notes: z.string().optional(),
      approvedBy: z.string().optional(),
      invoiceNumber: z.string().optional(),
      invoiceAmount: z.union([z.string(), z.number()]).optional(),
      invoiceDate: z.string().optional(),
    }).parse(req.body);
    const [existingOrder] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, id));
    const oldStatus = existingOrder?.status;
    const updates: any = { ...body, updatedAt: new Date() };
    if (body.approvedBy) updates.approvedAt = new Date();
    const [order] = await db.update(purchaseOrdersTable).set(updates).where(eq(purchaseOrdersTable.id, id)).returning();
    if (!order) return res.status(404).json({ message: "Not found" });

    if (body.status && body.status !== oldStatus) {
      if (matchesStatus(body.status, APPROVED_STATUSES)) {
        onPurchaseOrderApproved(id).catch(err => console.error("[data-sync] PO approved cascade error:", err));
        const supplierId = order.supplierId;
        if (supplierId) {
          import("./supplier-intelligence").then(({ triggerSupplierKpiRecalculation }) => {
            triggerSupplierKpiRecalculation(supplierId).catch(err => {
              console.error(`[purchase-orders] KPI recalculation failed for supplier ${supplierId}:`, err);
            });
          }).catch(err => {
            console.error("[purchase-orders] Failed to import supplier-intelligence for KPI recalculation:", err);
          });
        }
      }
      if (matchesStatus(body.status, RECEIVED_STATUSES)) {
        onPurchaseOrderReceived(id).catch(err => console.error("[data-sync] PO received cascade error:", err));
      }
    }

    if (body.invoiceNumber && body.invoiceAmount) {
      performMatchAndSave(
        id,
        parseFloat(String(body.invoiceAmount)),
        body.invoiceNumber,
        body.invoiceDate,
      ).catch(err => console.error("[data-sync] three-way match auto-trigger error:", err.message));
    }

    res.json(order);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.delete("/purchase-orders/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await db.delete(purchaseOrderItemsTable).where(eq(purchaseOrderItemsTable.orderId, id));
    const [deleted] = await db.delete(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, id)).returning();
    if (!deleted) return res.status(404).json({ message: "Not found" });
    res.json({ message: "Deleted" });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.post("/purchase-orders/:id/items", async (req, res) => {
  try {
    const orderId = z.coerce.number().int().positive().parse(req.params.id);
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
      deliveryDate: z.string().optional().nullable(),
      notes: z.string().optional().nullable(),
    }).parse(req.body);
    const [item] = await db.insert(purchaseOrderItemsTable).values({ ...body, orderId }).returning();
    res.status(201).json(item);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.put("/purchase-order-items/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const body = z.object({
      materialId: z.coerce.number().int().positive().optional().nullable(),
      itemCode: z.string().optional().nullable(),
      itemDescription: z.string().optional(),
      quantity: z.string().optional(),
      unit: z.string().optional(),
      unitPrice: z.string().optional(),
      discountPercent: z.string().optional(),
      taxPercent: z.string().optional(),
      totalPrice: z.string().optional(),
      deliveryDate: z.string().optional().nullable(),
      notes: z.string().optional().nullable(),
    }).parse(req.body);
    const [item] = await db.update(purchaseOrderItemsTable).set(body).where(eq(purchaseOrderItemsTable.id, id)).returning();
    if (!item) return res.status(404).json({ message: "Not found" });
    res.json(item);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.delete("/purchase-order-items/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await db.delete(purchaseOrderItemsTable).where(eq(purchaseOrderItemsTable.id, id));
    res.json({ message: "Deleted" });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

export default router;
