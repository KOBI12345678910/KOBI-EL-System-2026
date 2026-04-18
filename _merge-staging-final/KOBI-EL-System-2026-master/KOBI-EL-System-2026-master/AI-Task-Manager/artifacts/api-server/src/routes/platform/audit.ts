import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { recordAuditLogTable } from "@workspace/db/schema";
import { eq, desc, sql, and, gte, lte } from "drizzle-orm";

const router: IRouter = Router();

router.get("/platform/audit", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    const offset = Number(req.query.offset) || 0;
    const action = req.query.action as string;
    const entityId = req.query.entityId ? Number(req.query.entityId) : undefined;
    const recordId = req.query.recordId ? Number(req.query.recordId) : undefined;
    const performedBy = req.query.performedBy as string;
    const from = req.query.from as string;
    const to = req.query.to as string;
    const search = req.query.search as string;

    const conditions = [];
    if (action) conditions.push(eq(recordAuditLogTable.action, action));
    if (entityId) conditions.push(eq(recordAuditLogTable.entityId, entityId));
    if (recordId) conditions.push(eq(recordAuditLogTable.recordId, recordId));
    if (performedBy) conditions.push(eq(recordAuditLogTable.performedBy, performedBy));
    if (from) conditions.push(gte(recordAuditLogTable.createdAt, new Date(from)));
    if (to) conditions.push(lte(recordAuditLogTable.createdAt, new Date(to)));
    if (search) conditions.push(sql`${recordAuditLogTable.changes}::text ILIKE ${'%' + search + '%'}`);

    let query = db.select().from(recordAuditLogTable).$dynamic();
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    query = query.orderBy(desc(recordAuditLogTable.createdAt));

    const logs = await query.limit(limit).offset(offset);

    let countQuery = db.select({ count: sql<number>`count(*)::int` }).from(recordAuditLogTable).$dynamic();
    if (conditions.length > 0) {
      countQuery = countQuery.where(and(...conditions));
    }
    const countResult = await countQuery;

    res.json({ logs, total: countResult[0]?.count || 0 });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/records/:recordId/audit", async (req, res) => {
  try {
    const recordId = Number(req.params.recordId);
    const logs = await db.select().from(recordAuditLogTable)
      .where(eq(recordAuditLogTable.recordId, recordId))
      .orderBy(desc(recordAuditLogTable.createdAt))
      .limit(100);
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/entities/:entityId/audit", async (req, res) => {
  try {
    const entityId = Number(req.params.entityId);
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;
    const logs = await db.select().from(recordAuditLogTable)
      .where(eq(recordAuditLogTable.entityId, entityId))
      .orderBy(desc(recordAuditLogTable.createdAt))
      .limit(limit)
      .offset(offset);

    const countResult = await db.select({ count: sql<number>`count(*)::int` })
      .from(recordAuditLogTable)
      .where(eq(recordAuditLogTable.entityId, entityId));

    res.json({ logs, total: countResult[0]?.count || 0 });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
