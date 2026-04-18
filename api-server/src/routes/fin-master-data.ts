import { Router } from "express";
import { db } from "@workspace/db";
import {
  finStatusesTable,
  finDocumentTypesTable,
  finPaymentMethodsTable,
  finCategoriesTable,
  finDocumentLinksTable,
  finAttachmentsTable,
  finStandingOrdersTable,
  finCreditTransactionsTable,
  finRecurringDocumentsTable,
  finActivityLogsTable,
  finDocumentsTable,
} from "@workspace/db/schema";
import { eq, desc, and, sql } from "drizzle-orm";

const router = Router();

// ==========================================
// STATUSES CRUD
// ==========================================
router.get("/statuses", async (_req, res) => {
  const data = await db.select().from(finStatusesTable).orderBy(finStatusesTable.sortOrder);
  res.json(data);
});

// ==========================================
// DOCUMENT TYPES CRUD
// ==========================================
router.get("/document-types", async (_req, res) => {
  const data = await db.select().from(finDocumentTypesTable).orderBy(finDocumentTypesTable.sortOrder);
  res.json(data);
});

// ==========================================
// PAYMENT METHODS CRUD
// ==========================================
router.get("/payment-methods", async (_req, res) => {
  const data = await db.select().from(finPaymentMethodsTable).orderBy(finPaymentMethodsTable.sortOrder);
  res.json(data);
});

// ==========================================
// CATEGORIES CRUD
// ==========================================
router.get("/categories", async (req, res) => {
  const { direction } = req.query;
  const conditions: any[] = [];
  if (direction) conditions.push(eq(finCategoriesTable.direction, String(direction)));

  const data = await db
    .select()
    .from(finCategoriesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(finCategoriesTable.sortOrder);
  res.json(data);
});

router.post("/categories", async (req, res) => {
  const [category] = await db.insert(finCategoriesTable).values(req.body).returning();
  res.status(201).json(category);
});

// ==========================================
// DOCUMENT LINKS
// ==========================================
router.get("/document-links/:documentId", async (req, res) => {
  const { documentId } = req.params;
  const links = await db
    .select()
    .from(finDocumentLinksTable)
    .where(
      sql`${finDocumentLinksTable.sourceDocumentId} = ${Number(documentId)} OR ${finDocumentLinksTable.targetDocumentId} = ${Number(documentId)}`
    );
  res.json(links);
});

router.post("/document-links", async (req, res) => {
  const [link] = await db.insert(finDocumentLinksTable).values(req.body).returning();

  // Log activity for both documents
  await db.insert(finActivityLogsTable).values([
    {
      entityType: "document",
      entityId: req.body.sourceDocumentId,
      actionType: "linked",
      newValueJson: { linkedTo: req.body.targetDocumentId, linkType: req.body.linkType },
      actor: "system",
    },
    {
      entityType: "document",
      entityId: req.body.targetDocumentId,
      actionType: "linked",
      newValueJson: { linkedFrom: req.body.sourceDocumentId, linkType: req.body.linkType },
      actor: "system",
    },
  ]);

  res.status(201).json(link);
});

// ==========================================
// ATTACHMENTS
// ==========================================
router.get("/attachments/:documentId", async (req, res) => {
  const { documentId } = req.params;
  const attachments = await db
    .select()
    .from(finAttachmentsTable)
    .where(eq(finAttachmentsTable.documentId, Number(documentId)));
  res.json(attachments);
});

router.post("/attachments", async (req, res) => {
  const [attachment] = await db.insert(finAttachmentsTable).values(req.body).returning();

  await db.insert(finActivityLogsTable).values({
    entityType: "document",
    entityId: req.body.documentId,
    actionType: "uploaded_file",
    newValueJson: { fileName: req.body.fileName, fileType: req.body.fileType },
    actor: req.body.uploadedBy || "system",
  });

  res.status(201).json(attachment);
});

// ==========================================
// STANDING ORDERS
// ==========================================
router.get("/standing-orders", async (req, res) => {
  const data = await db.select().from(finStandingOrdersTable).orderBy(desc(finStandingOrdersTable.createdAt));
  res.json(data);
});

router.post("/standing-orders", async (req, res) => {
  const [order] = await db.insert(finStandingOrdersTable).values(req.body).returning();
  res.status(201).json(order);
});

router.put("/standing-orders/:id", async (req, res) => {
  const [updated] = await db
    .update(finStandingOrdersTable)
    .set({ ...req.body, updatedAt: new Date() })
    .where(eq(finStandingOrdersTable.id, Number(req.params.id)))
    .returning();
  res.json(updated);
});

// ==========================================
// CREDIT TRANSACTIONS
// ==========================================
router.get("/credit-transactions", async (req, res) => {
  const data = await db.select().from(finCreditTransactionsTable).orderBy(desc(finCreditTransactionsTable.createdAt));
  res.json(data);
});

router.post("/credit-transactions", async (req, res) => {
  const [tx] = await db.insert(finCreditTransactionsTable).values(req.body).returning();
  res.status(201).json(tx);
});

// ==========================================
// RECURRING DOCUMENTS
// ==========================================
router.get("/recurring", async (req, res) => {
  const data = await db.select().from(finRecurringDocumentsTable).orderBy(desc(finRecurringDocumentsTable.createdAt));
  res.json(data);
});

router.post("/recurring", async (req, res) => {
  const [recurring] = await db.insert(finRecurringDocumentsTable).values(req.body).returning();
  res.status(201).json(recurring);
});

router.put("/recurring/:id", async (req, res) => {
  const [updated] = await db
    .update(finRecurringDocumentsTable)
    .set({ ...req.body, updatedAt: new Date() })
    .where(eq(finRecurringDocumentsTable.id, Number(req.params.id)))
    .returning();
  res.json(updated);
});

// ==========================================
// ACTIVITY LOGS
// ==========================================
router.get("/activity-logs", async (req, res) => {
  const { entityType, entityId, limit = "50" } = req.query;
  const conditions: any[] = [];
  if (entityType) conditions.push(eq(finActivityLogsTable.entityType, String(entityType)));
  if (entityId) conditions.push(eq(finActivityLogsTable.entityId, Number(entityId)));

  const logs = await db
    .select()
    .from(finActivityLogsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(finActivityLogsTable.createdAt))
    .limit(Number(limit));

  res.json(logs);
});

export default router;
