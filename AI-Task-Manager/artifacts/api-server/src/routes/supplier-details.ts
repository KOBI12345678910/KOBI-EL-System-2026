import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  supplierContactsTable,
  supplierDocumentsTable,
  supplierNotesTable,
  supplierPerformanceTable,
} from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

const SupplierIdParam = z.object({ supplierId: z.coerce.number().int().positive() });
const IdParam = z.object({ id: z.coerce.number().int().positive() });

const CreateContactBody = z.object({
  contactName: z.string().min(1),
  role: z.string().optional(),
  phone: z.string().optional(),
  mobile: z.string().optional(),
  email: z.string().optional(),
  notes: z.string().optional(),
});

const CreateDocumentBody = z.object({
  documentName: z.string().min(1),
  documentType: z.string().optional(),
  fileUrl: z.string().optional(),
  notes: z.string().optional(),
  expiryDate: z.string().optional(),
});

const CreateNoteBody = z.object({
  noteText: z.string().min(1),
  author: z.string().optional(),
});

const CreatePerformanceBody = z.object({
  qualityRating: z.coerce.number().min(0).max(5).optional(),
  availabilityRating: z.coerce.number().min(0).max(5).optional(),
  priceRating: z.coerce.number().min(0).max(5).optional(),
  serviceRating: z.coerce.number().min(0).max(5).optional(),
  reliabilityRating: z.coerce.number().min(0).max(5).optional(),
  delayPercentage: z.coerce.number().min(0).max(100).optional(),
  performanceNotes: z.string().optional(),
  evaluatedBy: z.string().optional(),
});

router.get("/suppliers/:supplierId/contacts", async (req, res) => {
  try {
    const { supplierId } = SupplierIdParam.parse(req.params);
    const contacts = await db.select().from(supplierContactsTable)
      .where(eq(supplierContactsTable.supplierId, supplierId))
      .orderBy(desc(supplierContactsTable.createdAt));
    res.json(contacts);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.post("/suppliers/:supplierId/contacts", async (req, res) => {
  try {
    const { supplierId } = SupplierIdParam.parse(req.params);
    const body = CreateContactBody.parse(req.body);
    const [contact] = await db.insert(supplierContactsTable)
      .values({ ...body, supplierId })
      .returning();
    res.status(201).json(contact);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.put("/suppliers/:supplierId/contacts/:id", async (req, res): Promise<void> => {
  try {
    const { id } = IdParam.parse({ id: req.params.id });
    const body = CreateContactBody.partial().parse(req.body);
    const [contact] = await db.update(supplierContactsTable)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(supplierContactsTable.id, id))
      .returning();
    if (!contact) { res.status(404).json({ message: "Contact not found" }); return; }
    res.json(contact);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.delete("/suppliers/:supplierId/contacts/:id", async (req, res) => {
  try {
    const { id } = IdParam.parse({ id: req.params.id });
    await db.delete(supplierContactsTable).where(eq(supplierContactsTable.id, id));
    res.status(200).json({ message: "Deleted" });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.get("/suppliers/:supplierId/documents", async (req, res) => {
  try {
    const { supplierId } = SupplierIdParam.parse(req.params);
    const documents = await db.select().from(supplierDocumentsTable)
      .where(eq(supplierDocumentsTable.supplierId, supplierId))
      .orderBy(desc(supplierDocumentsTable.createdAt));
    res.json(documents);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.post("/suppliers/:supplierId/documents", async (req, res) => {
  try {
    const { supplierId } = SupplierIdParam.parse(req.params);
    const body = CreateDocumentBody.parse(req.body);
    const [doc] = await db.insert(supplierDocumentsTable)
      .values({
        ...body,
        supplierId,
        expiryDate: body.expiryDate ? new Date(body.expiryDate) : undefined,
      })
      .returning();
    res.status(201).json(doc);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.delete("/suppliers/:supplierId/documents/:id", async (req, res) => {
  try {
    const { id } = IdParam.parse({ id: req.params.id });
    await db.delete(supplierDocumentsTable).where(eq(supplierDocumentsTable.id, id));
    res.status(200).json({ message: "Deleted" });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.get("/suppliers/:supplierId/notes", async (req, res) => {
  try {
    const { supplierId } = SupplierIdParam.parse(req.params);
    const notes = await db.select().from(supplierNotesTable)
      .where(eq(supplierNotesTable.supplierId, supplierId))
      .orderBy(desc(supplierNotesTable.createdAt));
    res.json(notes);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.post("/suppliers/:supplierId/notes", async (req, res) => {
  try {
    const { supplierId } = SupplierIdParam.parse(req.params);
    const body = CreateNoteBody.parse(req.body);
    const [note] = await db.insert(supplierNotesTable)
      .values({ ...body, supplierId })
      .returning();
    res.status(201).json(note);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.delete("/suppliers/:supplierId/notes/:id", async (req, res) => {
  try {
    const { id } = IdParam.parse({ id: req.params.id });
    await db.delete(supplierNotesTable).where(eq(supplierNotesTable.id, id));
    res.status(200).json({ message: "Deleted" });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.get("/suppliers/:supplierId/performance", async (req, res) => {
  try {
    const { supplierId } = SupplierIdParam.parse(req.params);
    const performance = await db.select().from(supplierPerformanceTable)
      .where(eq(supplierPerformanceTable.supplierId, supplierId))
      .orderBy(desc(supplierPerformanceTable.evaluationDate));
    res.json(performance);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.post("/suppliers/:supplierId/performance", async (req, res) => {
  try {
    const { supplierId } = SupplierIdParam.parse(req.params);
    const body = CreatePerformanceBody.parse(req.body);
    const values: any = { ...body, supplierId };
    if (body.qualityRating !== undefined) values.qualityRating = String(body.qualityRating);
    if (body.availabilityRating !== undefined) values.availabilityRating = String(body.availabilityRating);
    if (body.priceRating !== undefined) values.priceRating = String(body.priceRating);
    if (body.serviceRating !== undefined) values.serviceRating = String(body.serviceRating);
    if (body.reliabilityRating !== undefined) values.reliabilityRating = String(body.reliabilityRating);
    if (body.delayPercentage !== undefined) values.delayPercentage = String(body.delayPercentage);
    const [perf] = await db.insert(supplierPerformanceTable)
      .values(values)
      .returning();
    res.status(201).json(perf);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.delete("/suppliers/:supplierId/performance/:id", async (req, res) => {
  try {
    const { id } = IdParam.parse({ id: req.params.id });
    await db.delete(supplierPerformanceTable).where(eq(supplierPerformanceTable.id, id));
    res.status(200).json({ message: "Deleted" });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

export default router;
