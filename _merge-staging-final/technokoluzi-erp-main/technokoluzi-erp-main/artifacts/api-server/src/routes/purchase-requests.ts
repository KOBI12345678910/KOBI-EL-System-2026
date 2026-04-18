import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { purchaseRequestsTable, purchaseRequestItemsTable, purchaseRequestApprovalsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

router.get("/purchase-requests", async (req, res) => {
  try {
    const requests = await db.select().from(purchaseRequestsTable).orderBy(desc(purchaseRequestsTable.createdAt));
    res.json(requests);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/purchase-requests/stats", async (_req, res) => {
  try {
    const { purchaseRequestsTable } = await import("@workspace/db/schema");
    const requests = await db.select().from(purchaseRequestsTable);
    const stats = {
      total: requests.length,
      pending: requests.filter((r: any) => r.status === "ממתין לאישור" || r.status === "טיוטה").length,
      approved: requests.filter((r: any) => r.status === "מאושר").length,
      rejected: requests.filter((r: any) => r.status === "נדחה").length,
      totalEstimated: requests.reduce((sum: number, r: any) => sum + parseFloat(r.totalEstimated || "0"), 0),
    };
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/purchase-requests/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [request] = await db.select().from(purchaseRequestsTable).where(eq(purchaseRequestsTable.id, id));
    if (!request) return res.status(404).json({ message: "Not found" });
    const items = await db.select().from(purchaseRequestItemsTable).where(eq(purchaseRequestItemsTable.requestId, String(id)));
    const approvals = await db.select().from(purchaseRequestApprovalsTable).where(eq(purchaseRequestApprovalsTable.requestId, String(id)));
    res.json({ ...request, items, approvals });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.post("/purchase-requests", async (req, res) => {
  try {
    const body = z.object({
      requestNumber: z.string().min(1),
      title: z.string().min(1),
      requesterName: z.string().optional(),
      department: z.string().optional(),
      priority: z.string().optional(),
      status: z.string().optional(),
      totalEstimated: z.string().optional(),
      currency: z.string().optional(),
      neededBy: z.string().optional(),
      notes: z.string().optional(),
    }).parse(req.body);
    const [request] = await db.insert(purchaseRequestsTable).values(body).returning();
    res.status(201).json(request);
  } catch (error: any) {
    if (error.message?.includes("duplicate") || error.message?.includes("unique")) {
      return res.status(409).json({ message: "מספר דרישה כבר קיים" });
    }
    res.status(400).json({ message: error.message });
  }
});

router.put("/purchase-requests/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const body = z.object({
      title: z.string().optional(),
      requesterName: z.string().optional(),
      department: z.string().optional(),
      priority: z.string().optional(),
      status: z.string().optional(),
      totalEstimated: z.string().optional(),
      currency: z.string().optional(),
      neededBy: z.string().optional(),
      notes: z.string().optional(),
      approvedBy: z.string().optional(),
    }).parse(req.body);
    const [request] = await db.update(purchaseRequestsTable).set({ ...body, updatedAt: new Date() }).where(eq(purchaseRequestsTable.id, id)).returning();
    if (!request) return res.status(404).json({ message: "Not found" });
    res.json(request);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.delete("/purchase-requests/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await db.delete(purchaseRequestItemsTable).where(eq(purchaseRequestItemsTable.requestId, String(id)));
    await db.delete(purchaseRequestApprovalsTable).where(eq(purchaseRequestApprovalsTable.requestId, String(id)));
    const [deleted] = await db.delete(purchaseRequestsTable).where(eq(purchaseRequestsTable.id, id)).returning();
    if (!deleted) return res.status(404).json({ message: "Not found" });
    res.json({ message: "Deleted" });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.post("/purchase-requests/:id/items", async (req, res) => {
  try {
    const requestId = z.coerce.number().int().positive().parse(req.params.id);
    const body = z.object({
      materialId: z.string().optional().nullable(),
      itemDescription: z.string().min(1),
      quantity: z.string().optional(),
      unit: z.string().optional(),
      estimatedPrice: z.string().optional().nullable(),
      currency: z.string().optional(),
      preferredSupplierId: z.string().optional().nullable(),
      notes: z.string().optional().nullable(),
    }).parse(req.body);
    const [item] = await db.insert(purchaseRequestItemsTable).values({ ...body, requestId: String(requestId) }).returning();
    res.status(201).json(item);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.delete("/purchase-request-items/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await db.delete(purchaseRequestItemsTable).where(eq(purchaseRequestItemsTable.id, id));
    res.json({ message: "Deleted" });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.post("/purchase-requests/:id/approvals", async (req, res) => {
  try {
    const requestId = z.coerce.number().int().positive().parse(req.params.id);
    const body = z.object({
      approverName: z.string().min(1),
      approvalStatus: z.string().optional(),
      approvalLevel: z.string().optional(),
      comments: z.string().optional(),
    }).parse(req.body);
    const [approval] = await db.insert(purchaseRequestApprovalsTable).values({ ...body, requestId: String(requestId) }).returning();
    res.status(201).json(approval);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.put("/purchase-approvals/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const body = z.object({
      approvalStatus: z.string(),
      comments: z.string().optional(),
    }).parse(req.body);
    const updates: any = { ...body };
    if (body.approvalStatus === "מאושר" || body.approvalStatus === "נדחה") {
      updates.approvedAt = new Date();
    }
    const [approval] = await db.update(purchaseRequestApprovalsTable).set(updates).where(eq(purchaseRequestApprovalsTable.id, id)).returning();
    if (!approval) return res.status(404).json({ message: "Not found" });
    res.json(approval);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

export default router;
