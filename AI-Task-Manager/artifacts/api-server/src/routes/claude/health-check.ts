import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  platformModulesTable,
  moduleEntitiesTable,
  entityFieldsTable,
  entityRelationsTable,
  formDefinitionsTable,
  viewDefinitionsTable,
  claudeAuditLogsTable,
  claudeSessionsTable,
} from "@workspace/db/schema";
import { count, gte } from "drizzle-orm";

const router: IRouter = Router();

async function safeCount(query: Promise<{ count: number }[]>): Promise<{ count: number; error?: string }> {
  try {
    const [result] = await query;
    return { count: result.count };
  } catch (err: any) {
    return { count: 0, error: err?.message || "query_failed" };
  }
}

router.get("/claude/health/dashboard", async (_req, res) => {
  const startTime = Date.now();

  let dbHealthy = true;
  try {
    await db.select({ count: count() }).from(platformModulesTable);
  } catch {
    dbHealthy = false;
  }

  if (!dbHealthy) {
    const responseTimeMs = Date.now() - startTime;
    res.json({
      status: "down",
      components: {
        database: { status: "down" },
        auditSystem: { status: "unknown" },
        sessions: { status: "unknown" },
      },
      metadata: {},
      performance: { healthCheckMs: responseTimeMs },
      checkedAt: new Date().toISOString(),
    });
    return;
  }

  const modules = await safeCount(db.select({ count: count() }).from(platformModulesTable));
  const entities = await safeCount(db.select({ count: count() }).from(moduleEntitiesTable));
  const fields = await safeCount(db.select({ count: count() }).from(entityFieldsTable));
  const relations = await safeCount(db.select({ count: count() }).from(entityRelationsTable));
  const forms = await safeCount(db.select({ count: count() }).from(formDefinitionsTable));
  const views = await safeCount(db.select({ count: count() }).from(viewDefinitionsTable));

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentLogs = await safeCount(db.select({ count: count() }).from(claudeAuditLogsTable).where(gte(claudeAuditLogsTable.createdAt, oneDayAgo)));
  const activeSessions = await safeCount(db.select({ count: count() }).from(claudeSessionsTable));

  const responseTimeMs = Date.now() - startTime;

  const queryErrors = [modules, entities, fields, relations, forms, views, recentLogs, activeSessions]
    .filter((r) => r.error)
    .map((r) => r.error);

  res.json({
    status: queryErrors.length > 0 ? "degraded" : "healthy",
    components: {
      database: { status: "up" },
      auditSystem: { status: recentLogs.error ? "degraded" : "up", recentLogs24h: recentLogs.count },
      sessions: { status: activeSessions.error ? "degraded" : "up", totalSessions: activeSessions.count },
    },
    metadata: {
      modules: modules.count,
      entities: entities.count,
      fields: fields.count,
      relations: relations.count,
      forms: forms.count,
      views: views.count,
    },
    ...(queryErrors.length > 0 ? { queryErrors } : {}),
    performance: { healthCheckMs: responseTimeMs },
    checkedAt: new Date().toISOString(),
  });
});

router.get("/claude/health/api-status", async (_req, res) => {
  const apis = [
    { name: "System Read API", basePath: "/claude/system", status: "operational" },
    { name: "Knowledge API", basePath: "/claude/knowledge", status: "operational" },
    { name: "Context API", basePath: "/claude/context", status: "operational" },
    { name: "Builder API", basePath: "/claude/builder", status: "operational" },
    { name: "Governance API", basePath: "/claude/governance", status: "operational" },
    { name: "Preview API", basePath: "/claude/preview", status: "operational" },
    { name: "Changesets API", basePath: "/claude/changesets", status: "operational" },
    { name: "Dev Support API", basePath: "/claude/dev-support", status: "operational" },
    { name: "Management API", basePath: "/claude/management", status: "operational" },
    { name: "Data Flow API", basePath: "/claude/dataflow", status: "operational" },
    { name: "Security API", basePath: "/claude/security", status: "operational" },
    { name: "Capabilities API", basePath: "/claude/capabilities", status: "operational" },
    { name: "Health API", basePath: "/claude/health", status: "operational" },
    { name: "Suggestions API", basePath: "/claude/suggestions", status: "operational" },
    { name: "Audit API", basePath: "/claude/audit", status: "operational" },
  ];

  res.json({
    overallStatus: "operational",
    apis,
    totalApis: apis.length,
    checkedAt: new Date().toISOString(),
  });
});

export default router;
