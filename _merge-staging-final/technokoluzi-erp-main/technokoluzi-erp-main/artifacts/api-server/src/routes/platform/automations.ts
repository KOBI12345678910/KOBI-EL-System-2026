import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { platformAutomationsTable, automationExecutionLogsTable, platformWorkflowsTable } from "@workspace/db/schema";
import { eq, and, asc, desc, gte, lte, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { executeAction, type ActionConfig } from "../../lib/action-executors";
import { automationTemplates, getTemplatesByCategory, getTemplateById } from "../../lib/automation-templates";
import { getSyncStatus, getSyncHistory } from "../../lib/cross-module-sync";

const router: IRouter = Router();

const IdParam = z.coerce.number().int().positive();

const CreateAutomationBody = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().optional(),
  triggerType: z.string().optional(),
  triggerEntityId: z.number().int().nullable().optional(),
  triggerConfig: z.record(z.string(), z.any()).optional(),
  conditions: z.array(z.any()).optional(),
  actions: z.array(z.any()).optional(),
  isActive: z.boolean().optional(),
});

router.get("/platform/automations", async (_req, res) => {
  try {
    const automations = await db.select().from(platformAutomationsTable)
      .orderBy(asc(platformAutomationsTable.createdAt));
    res.json(automations);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/modules/:moduleId/automations", async (req, res) => {
  try {
    const moduleId = IdParam.parse(req.params.moduleId);
    const automations = await db.select().from(platformAutomationsTable)
      .where(eq(platformAutomationsTable.moduleId, moduleId))
      .orderBy(asc(platformAutomationsTable.createdAt));
    res.json(automations);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/modules/:moduleId/automations", async (req, res) => {
  try {
    const moduleId = IdParam.parse(req.params.moduleId);
    const body = CreateAutomationBody.parse(req.body);
    const [automation] = await db.insert(platformAutomationsTable).values({ ...body, moduleId }).returning();
    res.status(201).json(automation);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/automations/:id", async (req, res) => {
  try {
    const id = IdParam.parse(req.params.id);
    const body = CreateAutomationBody.partial().parse(req.body);
    const [automation] = await db.update(platformAutomationsTable)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(platformAutomationsTable.id, id))
      .returning();
    if (!automation) return res.status(404).json({ message: "Automation not found" });
    res.json(automation);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.delete("/platform/automations/:id", async (req, res) => {
  try {
    const id = IdParam.parse(req.params.id);
    await db.delete(platformAutomationsTable).where(eq(platformAutomationsTable.id, id));
    res.status(204).send();
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/automations/:id/logs", async (req, res) => {
  try {
    const automationId = IdParam.parse(req.params.id);
    const logs = await db.select().from(automationExecutionLogsTable)
      .where(eq(automationExecutionLogsTable.automationId, automationId))
      .orderBy(desc(automationExecutionLogsTable.startedAt))
      .limit(100);
    res.json(logs);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/automations/:id/execute", async (req, res) => {
  try {
    const automationId = IdParam.parse(req.params.id);
    const { recordId } = req.body || {};

    const [automation] = await db.select().from(platformAutomationsTable)
      .where(eq(platformAutomationsTable.id, automationId));
    if (!automation) return res.status(404).json({ message: "Automation not found" });

    const actions = automation.actions as ActionConfig[];
    const startedAt = new Date();
    const stepsExecuted: any[] = [];
    let overallStatus = "completed";
    let errorMessage: string | null = null;

    if (actions && actions.length > 0) {
      let recordData: Record<string, any> = {};
      let recordStatus: string | null = null;

      let derivedEntityId = automation.triggerEntityId || 0;

      if (recordId) {
        const { entityRecordsTable } = await import("@workspace/db/schema");
        const [record] = await db.select().from(entityRecordsTable).where(eq(entityRecordsTable.id, Number(recordId)));
        if (record) {
          recordData = record.data as Record<string, any>;
          recordStatus = record.status;
          if (!derivedEntityId) derivedEntityId = record.entityId;
        }
      }

      const context = {
        entityId: derivedEntityId,
        recordId: recordId ? Number(recordId) : 0,
        data: recordData,
        status: recordStatus,
        oldStatus: null as string | null,
      };

      for (const action of actions) {
        const result = await executeAction(action, context);
        stepsExecuted.push(result);
        if (!result.success) {
          overallStatus = "failed";
          errorMessage = result.error || "Action failed";
          break;
        }
      }
    }

    const [log] = await db.insert(automationExecutionLogsTable).values({
      automationId,
      triggerEvent: "manual",
      triggerRecordId: recordId || null,
      status: overallStatus,
      stepsExecuted,
      result: { triggered: "manual", actionsCount: (actions || []).length, type: "automation" },
      errorMessage,
      startedAt,
      completedAt: new Date(),
    }).returning();

    await db.update(platformAutomationsTable)
      .set({ lastRunAt: new Date(), runCount: automation.runCount + 1, updatedAt: new Date() })
      .where(eq(platformAutomationsTable.id, automationId));

    res.json(log);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/execution-logs", async (req, res) => {
  try {
    const { entityId, workflowId, automationId, status, from, to, type } = req.query;
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    const offset = Number(req.query.offset) || 0;

    const conditions: any[] = [];

    if (automationId) {
      conditions.push(eq(automationExecutionLogsTable.automationId, Number(automationId)));
    }

    if (workflowId) {
      conditions.push(eq(automationExecutionLogsTable.workflowId, Number(workflowId)));
    }

    if (type) {
      conditions.push(eq(automationExecutionLogsTable.executionType, String(type)));
    }

    if (status) {
      conditions.push(eq(automationExecutionLogsTable.status, String(status)));
    }

    if (from) {
      conditions.push(gte(automationExecutionLogsTable.startedAt, new Date(String(from))));
    }

    if (to) {
      conditions.push(lte(automationExecutionLogsTable.startedAt, new Date(String(to))));
    }

    if (entityId) {
      conditions.push(eq(automationExecutionLogsTable.entityId, Number(entityId)));
    }

    let query = db.select().from(automationExecutionLogsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(automationExecutionLogsTable.startedAt))
      .$dynamic();

    const logs = await query.limit(limit).offset(offset);

    const countResult = await db.select({ count: sql<number>`count(*)::int` })
      .from(automationExecutionLogsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    res.json({ logs, total: countResult[0]?.count || 0 });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/execution-logs/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [log] = await db.select().from(automationExecutionLogsTable)
      .where(eq(automationExecutionLogsTable.id, id));
    if (!log) return res.status(404).json({ message: "Execution log not found" });
    res.json(log);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/automation-templates", async (_req, res) => {
  try {
    const categories = getTemplatesByCategory();
    res.json({ templates: automationTemplates, categories });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/automation-templates/:id", async (req, res) => {
  try {
    const template = getTemplateById(req.params.id);
    if (!template) return res.status(404).json({ message: "Template not found" });
    res.json(template);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/automation-templates/:id/apply", async (req, res) => {
  try {
    const template = getTemplateById(req.params.id);
    if (!template) return res.status(404).json({ message: "Template not found" });

    const { moduleId, entityId } = req.body;
    if (!moduleId) return res.status(400).json({ message: "moduleId is required" });

    let resolvedEntityId: number | null = entityId ? Number(entityId) : null;

    if (!resolvedEntityId && template.triggerEntitySlug) {
      const { moduleEntitiesTable } = await import("@workspace/db/schema");
      const [entity] = await db.select({ id: moduleEntitiesTable.id })
        .from(moduleEntitiesTable)
        .where(and(
          eq(moduleEntitiesTable.moduleId, Number(moduleId)),
          eq(moduleEntitiesTable.slug, template.triggerEntitySlug),
        ));

      if (!entity) {
        // no partial matching - exact slug required for safety
      } else {
        resolvedEntityId = entity.id;
      }
    }

    const entityTriggerTypes = ["on_create", "on_update", "on_delete", "on_status_change"];
    if (!resolvedEntityId && entityTriggerTypes.includes(template.triggerType)) {
      const { moduleEntitiesTable: met } = await import("@workspace/db/schema");
      const availableEntities = await db.select({ slug: met.slug })
        .from(met)
        .where(eq(met.moduleId, Number(moduleId)));
      const slugList = availableEntities.map(e => e.slug).join(", ");
      return res.status(400).json({
        message: `Could not resolve trigger entity "${template.triggerEntitySlug}" in this module. Please provide an explicit entityId. Available entities: ${slugList}`,
      });
    }

    const resolvedActions = [];
    for (const action of template.actions) {
      const resolvedAction = { ...action, config: { ...action.config } };
      if (action.type === "create_record" && action.config?.entitySlug && !action.config?.entityId) {
        const { moduleEntitiesTable: metAction } = await import("@workspace/db/schema");
        const [targetEntity] = await db.select({ id: metAction.id })
          .from(metAction)
          .where(eq(metAction.slug, action.config.entitySlug));
        if (targetEntity) {
          resolvedAction.config.entityId = targetEntity.id;
        }
      }
      resolvedActions.push(resolvedAction);
    }

    const [automation] = await db.insert(platformAutomationsTable).values({
      moduleId: Number(moduleId),
      name: template.name,
      slug: template.id + "-" + Date.now(),
      description: template.description,
      triggerType: template.triggerType,
      triggerEntityId: resolvedEntityId,
      triggerConfig: resolvedEntityId ? { entityId: resolvedEntityId } : {},
      conditions: template.conditions,
      actions: resolvedActions,
      isActive: false,
    }).returning();

    res.status(201).json(automation);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/sync-status", async (_req, res) => {
  try {
    const status = getSyncStatus();
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/sync-history", async (_req, res) => {
  try {
    const history = getSyncHistory();
    res.json(history);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/execution-stats", async (_req, res) => {
  try {
    const totalResult = await db.select({ count: sql<number>`count(*)::int` })
      .from(automationExecutionLogsTable);

    const statusCounts = await db.select({
      status: automationExecutionLogsTable.status,
      count: sql<number>`count(*)::int`,
    }).from(automationExecutionLogsTable)
      .groupBy(automationExecutionLogsTable.status);

    const last24h = await db.select({ count: sql<number>`count(*)::int` })
      .from(automationExecutionLogsTable)
      .where(gte(automationExecutionLogsTable.startedAt, new Date(Date.now() - 24 * 60 * 60 * 1000)));

    const last7d = await db.select({ count: sql<number>`count(*)::int` })
      .from(automationExecutionLogsTable)
      .where(gte(automationExecutionLogsTable.startedAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)));

    const typeCounts = await db.select({
      executionType: automationExecutionLogsTable.executionType,
      count: sql<number>`count(*)::int`,
    }).from(automationExecutionLogsTable)
      .groupBy(automationExecutionLogsTable.executionType);

    const byStatus: Record<string, number> = {};
    for (const row of statusCounts) {
      byStatus[row.status] = row.count;
    }

    const byType: Record<string, number> = {};
    for (const row of typeCounts) {
      byType[row.executionType] = row.count;
    }

    res.json({
      total: totalResult[0]?.count || 0,
      last24h: last24h[0]?.count || 0,
      last7d: last7d[0]?.count || 0,
      byStatus,
      byType,
      successRate: (totalResult[0]?.count || 0) > 0
        ? ((byStatus.completed || 0) / (totalResult[0]?.count || 1)) * 100
        : 100,
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
