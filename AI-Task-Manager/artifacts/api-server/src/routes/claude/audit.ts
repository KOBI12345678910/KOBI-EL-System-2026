import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { claudeAuditLogsTable, claudeSessionsTable } from "@workspace/db/schema";
import { eq, desc, and, gte, lte, count, sql, avg } from "drizzle-orm";

const router: IRouter = Router();

function parseIntParam(value: string | undefined, defaultVal: number, min: number, max: number): number {
  if (!value) return defaultVal;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) return defaultVal;
  return Math.max(min, Math.min(max, parsed));
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

router.get("/claude/audit/logs", async (req, res) => {
  const { actionType, status, startDate, endDate, caller, httpMethod, targetApi, sessionId } = req.query as Record<string, string>;
  const limit = parseIntParam(req.query.limit as string, 50, 1, 200);
  const offset = parseIntParam(req.query.offset as string, 0, 0, 100000);

  const conditions = [];
  if (actionType) conditions.push(eq(claudeAuditLogsTable.actionType, actionType));
  if (status) conditions.push(eq(claudeAuditLogsTable.status, status));
  if (caller) conditions.push(eq(claudeAuditLogsTable.caller, caller));
  if (httpMethod) conditions.push(eq(claudeAuditLogsTable.httpMethod, httpMethod));
  if (targetApi) conditions.push(eq(claudeAuditLogsTable.targetApi, targetApi));
  if (sessionId) conditions.push(eq(claudeAuditLogsTable.sessionId, parseInt(sessionId, 10)));

  const startD = parseDate(startDate);
  if (startD) conditions.push(gte(claudeAuditLogsTable.createdAt, startD));
  const endD = parseDate(endDate);
  if (endD) conditions.push(lte(claudeAuditLogsTable.createdAt, endD));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const logs = await db
    .select()
    .from(claudeAuditLogsTable)
    .where(where)
    .orderBy(desc(claudeAuditLogsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const [totalCount] = await db.select({ count: count() }).from(claudeAuditLogsTable).where(where);

  res.json({ logs, total: totalCount.count, limit, offset });
});

router.get("/claude/audit/logs/aggregate", async (req, res) => {
  const { startDate, endDate } = req.query as Record<string, string>;

  const conditions = [];
  const startD = parseDate(startDate);
  if (startD) conditions.push(gte(claudeAuditLogsTable.createdAt, startD));
  const endD = parseDate(endDate);
  if (endD) conditions.push(lte(claudeAuditLogsTable.createdAt, endD));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const byActionType = await db
    .select({
      actionType: claudeAuditLogsTable.actionType,
      count: count(),
    })
    .from(claudeAuditLogsTable)
    .where(where)
    .groupBy(claudeAuditLogsTable.actionType)
    .orderBy(desc(count()));

  const byStatus = await db
    .select({
      status: claudeAuditLogsTable.status,
      count: count(),
    })
    .from(claudeAuditLogsTable)
    .where(where)
    .groupBy(claudeAuditLogsTable.status);

  const byMethod = await db
    .select({
      httpMethod: claudeAuditLogsTable.httpMethod,
      count: count(),
    })
    .from(claudeAuditLogsTable)
    .where(where)
    .groupBy(claudeAuditLogsTable.httpMethod);

  const [avgResponseTime] = await db
    .select({ avg: avg(claudeAuditLogsTable.responseTimeMs) })
    .from(claudeAuditLogsTable)
    .where(where);

  const [totalCount] = await db.select({ count: count() }).from(claudeAuditLogsTable).where(where);

  res.json({
    total: totalCount.count,
    byActionType,
    byStatus,
    byMethod,
    averageResponseTimeMs: avgResponseTime.avg ? parseFloat(String(avgResponseTime.avg)) : null,
  });
});

router.get("/claude/audit/sessions", async (req, res) => {
  const { status } = req.query as Record<string, string>;
  const limit = parseIntParam(req.query.limit as string, 50, 1, 200);
  const offset = parseIntParam(req.query.offset as string, 0, 0, 100000);

  const where = status ? eq(claudeSessionsTable.status, status) : undefined;

  const sessions = await db
    .select()
    .from(claudeSessionsTable)
    .where(where)
    .orderBy(desc(claudeSessionsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const [totalCount] = await db.select({ count: count() }).from(claudeSessionsTable).where(where);

  res.json({ sessions, total: totalCount.count, limit, offset });
});

router.post("/claude/audit/sessions", async (req, res) => {
  const { model = "claude-sonnet-4-6", metadata } = req.body;

  const [session] = await db
    .insert(claudeSessionsTable)
    .values({
      model,
      status: "active",
      metadata: metadata ? JSON.stringify(metadata) : null,
    })
    .returning();

  res.status(201).json(session);
});

router.get("/claude/audit/sessions/:sessionId/timeline", async (req, res) => {
  const sessionId = parseInt(req.params.sessionId, 10);
  if (isNaN(sessionId)) {
    res.status(400).json({ error: "Invalid sessionId" });
    return;
  }

  const [session] = await db.select().from(claudeSessionsTable).where(eq(claudeSessionsTable.id, sessionId));
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const logs = await db
    .select()
    .from(claudeAuditLogsTable)
    .where(eq(claudeAuditLogsTable.sessionId, sessionId))
    .orderBy(claudeAuditLogsTable.createdAt);

  res.json({
    session,
    timeline: logs,
    totalActions: logs.length,
    errorCount: logs.filter((l) => l.status === "error").length,
  });
});

router.get("/claude/audit/export", async (req, res) => {
  const { startDate, endDate, format } = req.query as Record<string, string>;
  const limit = parseIntParam(req.query.limit as string, 1000, 1, 10000);

  const conditions = [];
  const startD = parseDate(startDate);
  if (startD) conditions.push(gte(claudeAuditLogsTable.createdAt, startD));
  const endD = parseDate(endDate);
  if (endD) conditions.push(lte(claudeAuditLogsTable.createdAt, endD));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const logs = await db
    .select()
    .from(claudeAuditLogsTable)
    .where(where)
    .orderBy(desc(claudeAuditLogsTable.createdAt))
    .limit(limit);

  if (format === "csv") {
    const headers = "id,actionType,caller,targetApi,httpMethod,httpPath,status,statusCode,responseTimeMs,sessionId,createdAt\n";
    const rows = logs.map((l) =>
      `${l.id},"${l.actionType}","${l.caller || ""}","${l.targetApi}","${l.httpMethod}","${l.httpPath}","${l.status}",${l.statusCode || ""},${l.responseTimeMs || ""},${l.sessionId || ""},"${l.createdAt}"`
    ).join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=claude-audit-logs.csv");
    res.send(headers + rows);
    return;
  }

  res.json({ logs, total: logs.length, exportedAt: new Date().toISOString() });
});

export default router;
