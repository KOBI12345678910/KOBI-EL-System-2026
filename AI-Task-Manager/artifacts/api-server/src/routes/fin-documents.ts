import { Router } from "express";
import { db } from "@workspace/db";
import {
  finDocumentsTable,
  finDocumentItemsTable,
  finDocumentTypesTable,
  finStatusesTable,
  finPaymentMethodsTable,
  finCategoriesTable,
  finActivityLogsTable,
  customersTable,
  suppliersTable,
} from "@workspace/db/schema";
import { eq, desc, and, sql, like, gte, lte, inArray } from "drizzle-orm";

const router = Router();

// ==========================================
// GET /api/fin/documents - List documents with filters
// ==========================================
router.get("/", async (req, res) => {
  try {
    const {
      direction,
      documentTypeId,
      customerId,
      supplierId,
      statusId,
      categoryId,
      dateFrom,
      dateTo,
      search,
      limit = "50",
      offset = "0",
    } = req.query;

    let query = db
      .select({
        id: finDocumentsTable.id,
        documentNumber: finDocumentsTable.documentNumber,
        documentTypeId: finDocumentsTable.documentTypeId,
        direction: finDocumentsTable.direction,
        customerId: finDocumentsTable.customerId,
        supplierId: finDocumentsTable.supplierId,
        issueDate: finDocumentsTable.issueDate,
        dueDate: finDocumentsTable.dueDate,
        title: finDocumentsTable.title,
        currency: finDocumentsTable.currency,
        totalAmount: finDocumentsTable.totalAmount,
        paidAmount: finDocumentsTable.paidAmount,
        balanceDue: finDocumentsTable.balanceDue,
        statusId: finDocumentsTable.statusId,
        createdAt: finDocumentsTable.createdAt,
      })
      .from(finDocumentsTable)
      .orderBy(desc(finDocumentsTable.createdAt))
      .limit(Number(limit))
      .offset(Number(offset));

    const conditions: any[] = [];
    if (direction) conditions.push(eq(finDocumentsTable.direction, String(direction)));
    if (documentTypeId) conditions.push(eq(finDocumentsTable.documentTypeId, Number(documentTypeId)));
    if (customerId) conditions.push(eq(finDocumentsTable.customerId, Number(customerId)));
    if (supplierId) conditions.push(eq(finDocumentsTable.supplierId, Number(supplierId)));
    if (statusId) conditions.push(eq(finDocumentsTable.statusId, Number(statusId)));
    if (categoryId) conditions.push(eq(finDocumentsTable.categoryId, Number(categoryId)));
    if (dateFrom) conditions.push(gte(finDocumentsTable.issueDate, String(dateFrom)));
    if (dateTo) conditions.push(lte(finDocumentsTable.issueDate, String(dateTo)));
    if (search) conditions.push(like(finDocumentsTable.title, `%${search}%`));

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const documents = await query;

    // Get total count
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(finDocumentsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    res.json({
      data: documents,
      total: Number(countResult[0]?.count || 0),
      limit: Number(limit),
      offset: Number(offset),
    });
  } catch (error: any) {
    console.error("[fin-documents] List error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// GET /api/fin/documents/:id - Get document details
// ==========================================
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const [document] = await db
      .select()
      .from(finDocumentsTable)
      .where(eq(finDocumentsTable.id, Number(id)));

    if (!document) {
      return res.status(404).json({ error: "Document not found" });
    }

    // Get line items
    const items = await db
      .select()
      .from(finDocumentItemsTable)
      .where(eq(finDocumentItemsTable.documentId, Number(id)))
      .orderBy(finDocumentItemsTable.sortOrder);

    // Get document type info
    const [docType] = await db
      .select()
      .from(finDocumentTypesTable)
      .where(eq(finDocumentTypesTable.id, document.documentTypeId));

    // Get status info
    const [status] = await db
      .select()
      .from(finStatusesTable)
      .where(eq(finStatusesTable.id, document.statusId));

    // Get customer/supplier info
    let customer = null;
    let supplier = null;
    if (document.customerId) {
      const [c] = await db.select().from(customersTable).where(eq(customersTable.id, document.customerId));
      customer = c;
    }
    if (document.supplierId) {
      const [s] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, document.supplierId));
      supplier = s;
    }

    res.json({
      ...document,
      items,
      documentType: docType,
      status,
      customer,
      supplier,
    });
  } catch (error: any) {
    console.error("[fin-documents] Get error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// POST /api/fin/documents - Create document
// ==========================================
router.post("/", async (req, res) => {
  try {
    const { items, ...documentData } = req.body;

    // Generate document number
    const [docType] = await db
      .select()
      .from(finDocumentTypesTable)
      .where(eq(finDocumentTypesTable.id, documentData.documentTypeId));

    if (!docType) {
      return res.status(400).json({ error: "Invalid document type" });
    }

    const docNumber = `${docType.prefix}-${String(docType.nextNumber).padStart(docType.paddingLength, "0")}`;

    // Validate direction rules
    if (documentData.direction === "income" && !documentData.customerId) {
      return res.status(400).json({ error: "Income documents require a customer" });
    }
    if (documentData.direction === "expense" && !documentData.supplierId) {
      return res.status(400).json({ error: "Expense documents require a supplier" });
    }

    // Calculate totals from items
    let subtotal = 0;
    let taxTotal = 0;
    if (items && items.length > 0) {
      for (const item of items) {
        const lineTotal = item.quantity * item.unitPrice * (1 - (item.discountPercent || 0) / 100);
        subtotal += lineTotal;
        taxTotal += lineTotal * ((item.taxRate || 17) / 100);
      }
    } else {
      subtotal = Number(documentData.subtotalAmount || 0);
      taxTotal = Number(documentData.taxAmount || 0);
    }

    const totalAmount = subtotal + taxTotal;

    // Insert document
    const [document] = await db
      .insert(finDocumentsTable)
      .values({
        ...documentData,
        documentNumber: docNumber,
        subtotalAmount: String(subtotal),
        taxAmount: String(taxTotal),
        totalAmount: String(totalAmount),
        balanceDue: String(totalAmount),
        paidAmount: "0",
      })
      .returning();

    // Increment document type counter
    await db
      .update(finDocumentTypesTable)
      .set({ nextNumber: docType.nextNumber + 1 })
      .where(eq(finDocumentTypesTable.id, docType.id));

    // Insert line items
    if (items && items.length > 0) {
      const itemRows = items.map((item: any, index: number) => ({
        documentId: document.id,
        productId: item.productId || null,
        description: item.description,
        quantity: String(item.quantity),
        unitPrice: String(item.unitPrice),
        unit: item.unit || "יח'",
        discountPercent: String(item.discountPercent || 0),
        taxRate: String(item.taxRate || 17),
        lineTotal: String(item.quantity * item.unitPrice * (1 - (item.discountPercent || 0) / 100)),
        sortOrder: index,
      }));
      await db.insert(finDocumentItemsTable).values(itemRows);
    }

    // Log activity
    await db.insert(finActivityLogsTable).values({
      entityType: "document",
      entityId: document.id,
      actionType: "created",
      newValueJson: { documentNumber: docNumber, totalAmount },
      actor: documentData.createdBy || "system",
    });

    res.status(201).json(document);
  } catch (error: any) {
    console.error("[fin-documents] Create error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// PUT /api/fin/documents/:id - Update document
// ==========================================
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { items, ...updateData } = req.body;

    const [existing] = await db
      .select()
      .from(finDocumentsTable)
      .where(eq(finDocumentsTable.id, Number(id)));

    if (!existing) {
      return res.status(404).json({ error: "Document not found" });
    }

    const [updated] = await db
      .update(finDocumentsTable)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(finDocumentsTable.id, Number(id)))
      .returning();

    // Update items if provided
    if (items) {
      await db.delete(finDocumentItemsTable).where(eq(finDocumentItemsTable.documentId, Number(id)));
      if (items.length > 0) {
        const itemRows = items.map((item: any, index: number) => ({
          documentId: Number(id),
          productId: item.productId || null,
          description: item.description,
          quantity: String(item.quantity),
          unitPrice: String(item.unitPrice),
          unit: item.unit || "יח'",
          discountPercent: String(item.discountPercent || 0),
          taxRate: String(item.taxRate || 17),
          lineTotal: String(item.quantity * item.unitPrice * (1 - (item.discountPercent || 0) / 100)),
          sortOrder: index,
        }));
        await db.insert(finDocumentItemsTable).values(itemRows);
      }
    }

    // Log activity
    await db.insert(finActivityLogsTable).values({
      entityType: "document",
      entityId: Number(id),
      actionType: "updated",
      oldValueJson: existing,
      newValueJson: updated,
      actor: updateData.createdBy || "system",
    });

    res.json(updated);
  } catch (error: any) {
    console.error("[fin-documents] Update error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// GET /api/fin/documents/:id/stats - Document summary
// ==========================================
router.get("/stats/summary", async (req, res) => {
  try {
    const [incomeStats] = await db
      .select({
        totalDocuments: sql<number>`count(*)`,
        totalAmount: sql<number>`coalesce(sum(${finDocumentsTable.totalAmount}::numeric), 0)`,
        totalPaid: sql<number>`coalesce(sum(${finDocumentsTable.paidAmount}::numeric), 0)`,
        totalBalance: sql<number>`coalesce(sum(${finDocumentsTable.balanceDue}::numeric), 0)`,
      })
      .from(finDocumentsTable)
      .where(eq(finDocumentsTable.direction, "income"));

    const [expenseStats] = await db
      .select({
        totalDocuments: sql<number>`count(*)`,
        totalAmount: sql<number>`coalesce(sum(${finDocumentsTable.totalAmount}::numeric), 0)`,
        totalPaid: sql<number>`coalesce(sum(${finDocumentsTable.paidAmount}::numeric), 0)`,
        totalBalance: sql<number>`coalesce(sum(${finDocumentsTable.balanceDue}::numeric), 0)`,
      })
      .from(finDocumentsTable)
      .where(eq(finDocumentsTable.direction, "expense"));

    res.json({
      income: incomeStats,
      expenses: expenseStats,
      netProfit: Number(incomeStats?.totalAmount || 0) - Number(expenseStats?.totalAmount || 0),
    });
  } catch (error: any) {
    console.error("[fin-documents] Stats error:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
