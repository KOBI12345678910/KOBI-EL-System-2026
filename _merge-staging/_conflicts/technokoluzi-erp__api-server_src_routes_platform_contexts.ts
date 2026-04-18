import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { platformContextsTable, contextEvaluationLogsTable } from "@workspace/db/schema";
import { eq, and, asc, desc, sql } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

const IdParam = z.coerce.number().int().positive();

const CreateContextBody = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().optional(),
  contextType: z.enum(["role_based", "status_based", "entity_based", "conditional", "composite"]).optional(),
  conditions: z.array(z.any()).optional(),
  effects: z.record(z.string(), z.any()).optional(),
  entityId: z.number().int().nullable().optional(),
  moduleId: z.number().int().nullable().optional(),
  priority: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

const EvaluateBody = z.object({
  userId: z.number().int().nullable().optional(),
  entityId: z.number().int().nullable().optional(),
  recordId: z.number().int().nullable().optional(),
  recordData: z.record(z.string(), z.any()).optional(),
  userRole: z.string().nullable().optional(),
  recordStatus: z.string().nullable().optional(),
  moduleId: z.number().int().nullable().optional(),
});

const LogQueryParams = z.object({
  contextId: z.coerce.number().int().positive().optional(),
  matched: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

router.get("/platform/contexts", async (req, res) => {
  try {
    const contexts = await db.select().from(platformContextsTable)
      .orderBy(desc(platformContextsTable.priority), asc(platformContextsTable.createdAt));
    res.json(contexts);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/contexts/:id", async (req, res) => {
  try {
    const id = IdParam.parse(req.params.id);
    const [context] = await db.select().from(platformContextsTable)
      .where(eq(platformContextsTable.id, id));
    if (!context) return res.status(404).json({ message: "Context not found" });
    res.json(context);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/contexts", async (req, res) => {
  try {
    const body = CreateContextBody.parse(req.body);
    const [context] = await db.insert(platformContextsTable).values(body).returning();
    res.status(201).json(context);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/contexts/:id", async (req, res) => {
  try {
    const id = IdParam.parse(req.params.id);
    const body = CreateContextBody.partial().parse(req.body);
    const [context] = await db.update(platformContextsTable)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(platformContextsTable.id, id))
      .returning();
    if (!context) return res.status(404).json({ message: "Context not found" });
    res.json(context);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.delete("/platform/contexts/:id", async (req, res) => {
  try {
    const id = IdParam.parse(req.params.id);
    await db.delete(platformContextsTable).where(eq(platformContextsTable.id, id));
    res.status(204).send();
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/contexts/:id/evaluate", async (req, res) => {
  try {
    const contextId = IdParam.parse(req.params.id);
    const input = EvaluateBody.parse(req.body || {});

    const [context] = await db.select().from(platformContextsTable)
      .where(eq(platformContextsTable.id, contextId));
    if (!context) return res.status(404).json({ message: "Context not found" });

    const startTime = Date.now();
    const conditions = context.conditions as any[];
    let matched = true;

    for (const cond of conditions) {
      if (!matched) break;
      switch (cond.type) {
        case "role":
          if (!input.userRole || !cond.value) { matched = false; break; }
          if (input.userRole !== cond.value) matched = false;
          break;
        case "status":
          if (!input.recordStatus || !cond.value) { matched = false; break; }
          if (input.recordStatus !== cond.value) matched = false;
          break;
        case "entity":
          if (!input.entityId || !cond.value) { matched = false; break; }
          if (String(input.entityId) !== String(cond.value)) matched = false;
          break;
        case "module":
          if (!input.moduleId || !cond.value) { matched = false; break; }
          if (String(input.moduleId) !== String(cond.value)) matched = false;
          break;
        case "field":
          if (!input.recordData || !cond.field) { matched = false; break; }
          const fieldVal = input.recordData[cond.field];
          switch (cond.operator) {
            case "equals": if (String(fieldVal) !== String(cond.value)) matched = false; break;
            case "not_equals": if (String(fieldVal) === String(cond.value)) matched = false; break;
            case "contains": if (!String(fieldVal || "").includes(String(cond.value))) matched = false; break;
            case "is_empty": if (fieldVal !== undefined && fieldVal !== null && fieldVal !== "") matched = false; break;
            case "is_not_empty": if (fieldVal === undefined || fieldVal === null || fieldVal === "") matched = false; break;
            default: matched = false; break;
          }
          break;
        default:
          matched = false;
          break;
      }
    }

    const evaluationTimeMs = Date.now() - startTime;
    const effectsApplied = matched ? context.effects : {};

    const [log] = await db.insert(contextEvaluationLogsTable).values({
      contextId,
      userId: input.userId || null,
      entityId: input.entityId || null,
      recordId: input.recordId || null,
      conditionsSnapshot: { conditions, input },
      effectsApplied,
      matched,
      evaluationTimeMs,
    }).returning();

    res.json({ matched, effects: effectsApplied, log });
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/contexts/:id/logs", async (req, res) => {
  try {
    const contextId = IdParam.parse(req.params.id);
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    const logs = await db.select().from(contextEvaluationLogsTable)
      .where(eq(contextEvaluationLogsTable.contextId, contextId))
      .orderBy(desc(contextEvaluationLogsTable.evaluatedAt))
      .limit(limit);
    res.json(logs);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/context-logs", async (req, res) => {
  try {
    const params = LogQueryParams.parse(req.query);
    const limit = params.limit || 50;
    const offset = params.offset || 0;

    const conditions: any[] = [];
    if (params.contextId) conditions.push(eq(contextEvaluationLogsTable.contextId, params.contextId));
    if (params.matched !== undefined) conditions.push(eq(contextEvaluationLogsTable.matched, params.matched === "true"));

    const logs = await db.select().from(contextEvaluationLogsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(contextEvaluationLogsTable.evaluatedAt))
      .limit(limit)
      .offset(offset);

    const countResult = await db.select({ count: sql<number>`count(*)::int` })
      .from(contextEvaluationLogsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    res.json({ logs, total: countResult[0]?.count || 0 });
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

export default router;
