import { Router } from "express";
import { db } from "@workspace/db";
import {
  finPaymentsTable,
  finDocumentsTable,
  finStatusesTable,
  finActivityLogsTable,
} from "@workspace/db/schema";
import { eq, desc, and, sql, gte, lte } from "drizzle-orm";

const router = Router();

// ==========================================
// GET /api/fin/payments - List payments
// ==========================================
router.get("/", async (req, res) => {
  try {
    const { documentId, paymentMethodId, statusId, dateFrom, dateTo, limit = "50", offset = "0" } = req.query;

    const conditions: any[] = [];
    if (documentId) conditions.push(eq(finPaymentsTable.documentId, Number(documentId)));
    if (paymentMethodId) conditions.push(eq(finPaymentsTable.paymentMethodId, Number(paymentMethodId)));
    if (statusId) conditions.push(eq(finPaymentsTable.statusId, Number(statusId)));
    if (dateFrom) conditions.push(gte(finPaymentsTable.paymentDate, String(dateFrom)));
    if (dateTo) conditions.push(lte(finPaymentsTable.paymentDate, String(dateTo)));

    const payments = await db
      .select()
      .from(finPaymentsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(finPaymentsTable.createdAt))
      .limit(Number(limit))
      .offset(Number(offset));

    res.json({ data: payments });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// POST /api/fin/payments - Record payment
// ==========================================
router.post("/", async (req, res) => {
  try {
    const paymentData = req.body;

    // Get the document
    const [document] = await db
      .select()
      .from(finDocumentsTable)
      .where(eq(finDocumentsTable.id, paymentData.documentId));

    if (!document) {
      return res.status(404).json({ error: "Document not found" });
    }

    // Insert payment
    const [payment] = await db
      .insert(finPaymentsTable)
      .values(paymentData)
      .returning();

    // Update document paid amount and balance
    const newPaidAmount = Number(document.paidAmount) + Number(paymentData.amount);
    const newBalance = Number(document.totalAmount) - newPaidAmount;

    // Determine new status
    let newStatusName = "partially_paid";
    if (newBalance <= 0) {
      newStatusName = "paid";
    }

    // Get status ID
    const [newStatus] = await db
      .select()
      .from(finStatusesTable)
      .where(eq(finStatusesTable.name, newStatusName));

    // Update document
    await db
      .update(finDocumentsTable)
      .set({
        paidAmount: String(newPaidAmount),
        balanceDue: String(Math.max(0, newBalance)),
        statusId: newStatus?.id || document.statusId,
        updatedAt: new Date(),
      })
      .where(eq(finDocumentsTable.id, document.id));

    // Log activity
    await db.insert(finActivityLogsTable).values({
      entityType: "document",
      entityId: document.id,
      actionType: "payment_recorded",
      newValueJson: {
        paymentId: payment.id,
        amount: paymentData.amount,
        newPaidAmount,
        newBalance: Math.max(0, newBalance),
        newStatus: newStatusName,
      },
      actor: paymentData.createdBy || "system",
    });

    res.status(201).json({
      payment,
      documentUpdate: {
        paidAmount: newPaidAmount,
        balanceDue: Math.max(0, newBalance),
        status: newStatusName,
      },
    });
  } catch (error: any) {
    console.error("[fin-payments] Create error:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
