import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { supplierCommunicationsTable, suppliersTable } from "@workspace/db/schema";
import { eq, desc, and, ilike, or } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

router.get("/supplier-communications", async (req, res) => {
  try {
    const { supplierId, type, status, direction, search } = req.query;
    let results = await db.select().from(supplierCommunicationsTable).orderBy(desc(supplierCommunicationsTable.createdAt));

    if (supplierId) results = results.filter(r => r.supplierId === Number(supplierId));
    if (type && type !== "all") results = results.filter(r => r.type === type);
    if (status && status !== "all") results = results.filter(r => r.status === status);
    if (direction && direction !== "all") results = results.filter(r => r.direction === direction);
    if (search && typeof search === "string" && search.trim()) {
      const q = search.toLowerCase();
      results = results.filter(r =>
        r.subject?.toLowerCase().includes(q) ||
        r.content?.toLowerCase().includes(q) ||
        r.recipientName?.toLowerCase().includes(q)
      );
    }

    res.json(results);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/supplier-communications/stats", async (_req, res) => {
  try {
    const all = await db.select().from(supplierCommunicationsTable);
    const stats = {
      total: all.length,
      sent: all.filter(c => c.status === "sent").length,
      draft: all.filter(c => c.status === "draft").length,
      pending: all.filter(c => c.status === "pending").length,
      incoming: all.filter(c => c.direction === "incoming").length,
      outgoing: all.filter(c => c.direction === "outgoing").length,
    };
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/supplier-communications/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [comm] = await db.select().from(supplierCommunicationsTable).where(eq(supplierCommunicationsTable.id, id));
    if (!comm) return res.status(404).json({ error: "לא נמצא" });
    res.json(comm);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

const CreateBody = z.object({
  supplierId: z.coerce.number().int().positive(),
  type: z.string().default("general"),
  subject: z.string().min(1),
  content: z.string().optional(),
  direction: z.string().default("outgoing"),
  status: z.string().default("draft"),
  priority: z.string().default("normal"),
  sentBy: z.string().optional(),
  recipientEmail: z.string().optional(),
  recipientName: z.string().optional(),
  attachments: z.array(z.any()).optional(),
  relatedDocType: z.string().optional(),
  relatedDocId: z.coerce.number().optional(),
  tags: z.string().optional(),
  notes: z.string().optional(),
});

router.post("/supplier-communications", async (req, res) => {
  try {
    const parsed = CreateBody.parse(req.body);
    const [created] = await db.insert(supplierCommunicationsTable).values({
      ...parsed,
      attachments: parsed.attachments || [],
      sentAt: parsed.status === "sent" ? new Date() : null,
    }).returning();
    res.status(201).json(created);
  } catch (error: any) {
    if (error.issues) return res.status(400).json({ error: "נתונים לא תקינים", details: error.issues });
    res.status(500).json({ error: error.message });
  }
});

router.put("/supplier-communications/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = req.body;

    if (body.status === "sent" && !body.sentAt) {
      body.sentAt = new Date();
    }

    const [updated] = await db.update(supplierCommunicationsTable)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(supplierCommunicationsTable.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: "לא נמצא" });
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/supplier-communications/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [deleted] = await db.delete(supplierCommunicationsTable)
      .where(eq(supplierCommunicationsTable.id, id))
      .returning();
    if (!deleted) return res.status(404).json({ error: "לא נמצא" });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/supplier-communications/:id/send", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [comm] = await db.select().from(supplierCommunicationsTable).where(eq(supplierCommunicationsTable.id, id));
    if (!comm) return res.status(404).json({ error: "לא נמצא" });

    const [updated] = await db.update(supplierCommunicationsTable)
      .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
      .where(eq(supplierCommunicationsTable.id, id))
      .returning();

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/supplier-communications/by-supplier/:supplierId", async (req, res) => {
  try {
    const supplierId = Number(req.params.supplierId);
    const results = await db.select().from(supplierCommunicationsTable)
      .where(eq(supplierCommunicationsTable.supplierId, supplierId))
      .orderBy(desc(supplierCommunicationsTable.createdAt));
    res.json(results);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/supplier-communications/stats/summary", async (req, res) => {
  try {
    const all = await db.select().from(supplierCommunicationsTable);
    const stats = {
      total: all.length,
      sent: all.filter(c => c.status === "sent").length,
      draft: all.filter(c => c.status === "draft").length,
      pending: all.filter(c => c.status === "pending").length,
      incoming: all.filter(c => c.direction === "incoming").length,
      outgoing: all.filter(c => c.direction === "outgoing").length,
      byType: {} as Record<string, number>,
      byPriority: {} as Record<string, number>,
    };
    all.forEach(c => {
      stats.byType[c.type] = (stats.byType[c.type] || 0) + 1;
      if (c.priority) stats.byPriority[c.priority] = (stats.byPriority[c.priority] || 0) + 1;
    });
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
