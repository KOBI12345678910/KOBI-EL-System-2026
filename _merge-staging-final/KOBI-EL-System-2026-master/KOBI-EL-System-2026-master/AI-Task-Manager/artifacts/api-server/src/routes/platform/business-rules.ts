import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  businessRulesTable,
  businessRuleAuditLogTable,
  visualWorkflowLayoutsTable,
  automationVisualLayoutsTable,
} from "@workspace/db/schema";
import { eq, and, desc, asc, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { evaluateBusinessRules } from "../../lib/business-rules-engine";

const router: IRouter = Router();
const IdParam = z.coerce.number().int().positive();

const CreateRuleBody = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  moduleId: z.number().int().positive().nullable().optional(),
  entityId: z.number().int().positive().nullable().optional(),
  scope: z.string().optional(),
  triggerEvents: z.array(z.string()).optional(),
  conditions: z.any().optional(),
  enforcementAction: z.enum(["block", "warn", "require_approval"]).optional(),
  enforcementConfig: z.record(z.string(), z.any()).optional(),
  priority: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

router.get("/platform/business-rules", async (req, res) => {
  try {
    const moduleId = req.query.moduleId ? Number(req.query.moduleId) : null;
    const conditions = [];
    if (moduleId) conditions.push(eq(businessRulesTable.moduleId, moduleId));

    const rules = await db.select().from(businessRulesTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(businessRulesTable.priority), asc(businessRulesTable.id));
    res.json(rules);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/business-rules/:id", async (req, res) => {
  try {
    const id = IdParam.parse(req.params.id);
    const [rule] = await db.select().from(businessRulesTable).where(eq(businessRulesTable.id, id));
    if (!rule) return res.status(404).json({ message: "Rule not found" });
    res.json(rule);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/business-rules", async (req, res) => {
  try {
    const body = CreateRuleBody.parse(req.body);
    const [rule] = await db.insert(businessRulesTable).values({
      ...body,
      moduleId: body.moduleId ?? null,
      entityId: body.entityId ?? null,
      triggerEvents: body.triggerEvents ?? ["on_create", "on_update"],
      conditions: body.conditions ?? [],
      enforcementConfig: body.enforcementConfig ?? {},
    }).returning();
    res.status(201).json(rule);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/business-rules/:id", async (req, res) => {
  try {
    const id = IdParam.parse(req.params.id);
    const body = CreateRuleBody.partial().parse(req.body);
    const [rule] = await db.update(businessRulesTable)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(businessRulesTable.id, id))
      .returning();
    if (!rule) return res.status(404).json({ message: "Rule not found" });
    res.json(rule);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.delete("/platform/business-rules/:id", async (req, res) => {
  try {
    const id = IdParam.parse(req.params.id);
    await db.delete(businessRulesTable).where(eq(businessRulesTable.id, id));
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/business-rules/:id/audit-log", async (req, res) => {
  try {
    const id = IdParam.parse(req.params.id);
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;
    const logs = await db.select().from(businessRuleAuditLogTable)
      .where(eq(businessRuleAuditLogTable.ruleId, id))
      .orderBy(desc(businessRuleAuditLogTable.evaluatedAt))
      .limit(limit).offset(offset);
    const countResult = await db.select({ count: sql<number>`count(*)::int` })
      .from(businessRuleAuditLogTable)
      .where(eq(businessRuleAuditLogTable.ruleId, id));
    res.json({ logs, total: countResult[0]?.count || 0 });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/business-rules-audit", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;
    const logs = await db.select().from(businessRuleAuditLogTable)
      .orderBy(desc(businessRuleAuditLogTable.evaluatedAt))
      .limit(limit).offset(offset);
    const countResult = await db.select({ count: sql<number>`count(*)::int` })
      .from(businessRuleAuditLogTable);
    res.json({ logs, total: countResult[0]?.count || 0 });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/business-rules/evaluate", async (req, res) => {
  try {
    const { entityId, event, data, context } = req.body;
    if (!entityId || !event) {
      return res.status(400).json({ message: "entityId and event are required" });
    }
    const result = await evaluateBusinessRules(Number(entityId), event, data || {}, context || {});
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/business-rules/:id/toggle", async (req, res) => {
  try {
    const id = IdParam.parse(req.params.id);
    const [existing] = await db.select().from(businessRulesTable).where(eq(businessRulesTable.id, id));
    if (!existing) return res.status(404).json({ message: "Rule not found" });
    const [rule] = await db.update(businessRulesTable)
      .set({ isActive: !existing.isActive, updatedAt: new Date() })
      .where(eq(businessRulesTable.id, id))
      .returning();
    res.json(rule);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/visual-layout/workflow/:workflowId", async (req, res) => {
  try {
    const workflowId = IdParam.parse(req.params.workflowId);
    const [layout] = await db.select().from(visualWorkflowLayoutsTable)
      .where(eq(visualWorkflowLayoutsTable.workflowId, workflowId));
    res.json(layout || null);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/visual-layout/workflow/:workflowId", async (req, res) => {
  try {
    const workflowId = IdParam.parse(req.params.workflowId);
    const { layoutData, viewport } = req.body;
    const [existing] = await db.select().from(visualWorkflowLayoutsTable)
      .where(eq(visualWorkflowLayoutsTable.workflowId, workflowId));
    if (existing) {
      const [updated] = await db.update(visualWorkflowLayoutsTable)
        .set({ layoutData: layoutData || {}, viewport: viewport || {}, updatedAt: new Date() })
        .where(eq(visualWorkflowLayoutsTable.workflowId, workflowId))
        .returning();
      res.json(updated);
    } else {
      const [created] = await db.insert(visualWorkflowLayoutsTable)
        .values({ workflowId, layoutData: layoutData || {}, viewport: viewport || {} })
        .returning();
      res.json(created);
    }
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/visual-layout/automation/:automationId", async (req, res) => {
  try {
    const automationId = IdParam.parse(req.params.automationId);
    const [layout] = await db.select().from(automationVisualLayoutsTable)
      .where(eq(automationVisualLayoutsTable.automationId, automationId));
    res.json(layout || null);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/visual-layout/automation/:automationId", async (req, res) => {
  try {
    const automationId = IdParam.parse(req.params.automationId);
    const { layoutData, viewport } = req.body;
    const [existing] = await db.select().from(automationVisualLayoutsTable)
      .where(eq(automationVisualLayoutsTable.automationId, automationId));
    if (existing) {
      const [updated] = await db.update(automationVisualLayoutsTable)
        .set({ layoutData: layoutData || {}, viewport: viewport || {}, updatedAt: new Date() })
        .where(eq(automationVisualLayoutsTable.automationId, automationId))
        .returning();
      res.json(updated);
    } else {
      const [created] = await db.insert(automationVisualLayoutsTable)
        .values({ automationId, layoutData: layoutData || {}, viewport: viewport || {} })
        .returning();
      res.json(created);
    }
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
