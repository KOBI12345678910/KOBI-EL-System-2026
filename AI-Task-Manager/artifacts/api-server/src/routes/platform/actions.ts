import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { actionDefinitionsTable, entityRecordsTable, automationExecutionLogsTable } from "@workspace/db/schema";
import { eq, asc } from "drizzle-orm";
import { z } from "zod/v4";
import { executeAction, type ActionConfig } from "../../lib/action-executors";
import { evaluateConditions } from "../../lib/workflow-engine";
import { eventBus } from "../../lib/event-bus";
import { checkActionAccess } from "../../lib/permission-engine";
import { requireBuilderAccess } from "../../lib/permission-middleware";

const router: IRouter = Router();

const CreateActionBody = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  actionType: z.enum(["page", "row", "bulk", "header", "contextual"]),
  handlerType: z.enum(["create", "update", "delete", "duplicate", "status_change", "workflow", "modal", "navigate", "export", "import", "print", "custom"]),
  icon: z.string().optional(),
  color: z.string().optional(),
  conditions: z.record(z.string(), z.any()).optional(),
  handlerConfig: z.record(z.string(), z.any()).optional(),
  sortOrder: z.number().optional(),
  isActive: z.boolean().optional(),
});

router.get("/platform/entities/:entityId/actions", async (req, res) => {
  try {
    const entityId = Number(req.params.entityId);
    const actions = await db.select().from(actionDefinitionsTable)
      .where(eq(actionDefinitionsTable.entityId, entityId))
      .orderBy(asc(actionDefinitionsTable.sortOrder));

    if (req.permissions && !req.permissions.isSuperAdmin) {
      const filtered = actions.filter(a => checkActionAccess(req.permissions!, a.id));
      return res.json(filtered);
    }

    res.json(actions);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/entities/:entityId/actions", requireBuilderAccess, async (req, res) => {
  try {
    const entityId = Number(req.params.entityId);
    const body = CreateActionBody.parse(req.body);
    const [action] = await db.insert(actionDefinitionsTable).values({ ...body, entityId }).returning();
    res.status(201).json(action);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/actions/:id", requireBuilderAccess, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = CreateActionBody.partial().parse(req.body);
    const [action] = await db.update(actionDefinitionsTable).set(body).where(eq(actionDefinitionsTable.id, id)).returning();
    if (!action) return res.status(404).json({ message: "Action not found" });
    res.json(action);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.delete("/platform/actions/:id", requireBuilderAccess, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(actionDefinitionsTable).where(eq(actionDefinitionsTable.id, id));
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/actions/:id/execute", async (req, res) => {
  try {
    const actionId = Number(req.params.id);
    const { recordId, recordIds } = req.body;

    const [actionDef] = await db.select().from(actionDefinitionsTable)
      .where(eq(actionDefinitionsTable.id, actionId));
    if (!actionDef) return res.status(404).json({ message: "Action definition not found" });
    if (!actionDef.isActive) return res.status(400).json({ message: "Action is not active" });

    const targetRecordIds: number[] = recordIds || (recordId ? [recordId] : []);
    if (targetRecordIds.length === 0) {
      return res.status(400).json({ message: "No record IDs provided" });
    }

    const results: any[] = [];
    const handlerConfig = (actionDef.handlerConfig as Record<string, any>) || {};
    const conditions = actionDef.conditions as any;

    for (const rid of targetRecordIds) {
      const [record] = await db.select().from(entityRecordsTable).where(eq(entityRecordsTable.id, rid));
      if (!record) {
        results.push({ recordId: rid, success: false, error: "Record not found" });
        continue;
      }

      if (record.entityId !== actionDef.entityId) {
        results.push({ recordId: rid, success: false, error: "Record does not belong to this entity" });
        continue;
      }

      const recordData = record.data as Record<string, any>;

      if (conditions) {
        let conditionsList: any[] = [];
        if (Array.isArray(conditions)) conditionsList = conditions;
        else if (conditions.rules && Array.isArray(conditions.rules)) conditionsList = conditions.rules;

        if (conditionsList.length > 0 && !evaluateConditions(conditionsList, recordData, { status: record.status })) {
          results.push({ recordId: rid, success: false, error: "Action conditions not met" });
          continue;
        }
      }

      const context = {
        entityId: actionDef.entityId,
        recordId: rid,
        data: recordData,
        status: record.status,
      };

      switch (actionDef.handlerType) {
        case "status_change": {
          const newStatus = handlerConfig.status || handlerConfig.targetStatus;
          if (newStatus) {
            const result = await executeAction({ type: "set_status", config: { status: newStatus } }, context);
            results.push({ recordId: rid, ...result });
            if (result.success) {
              eventBus.emitRecordEvent({
                type: "record.status_changed",
                entityId: actionDef.entityId,
                recordId: rid,
                data: recordData,
                status: newStatus,
                oldStatus: record.status,
                timestamp: new Date(),
              });
            }
          }
          break;
        }
        case "update": {
          if (handlerConfig.fields) {
            for (const [fieldSlug, value] of Object.entries(handlerConfig.fields)) {
              const result = await executeAction({ type: "update_field", config: { fieldSlug, value } }, context);
              results.push({ recordId: rid, ...result });
            }
          }
          break;
        }
        case "duplicate": {
          const result = await executeAction({
            type: "create_record",
            config: { entityId: actionDef.entityId, staticData: recordData, status: record.status || "draft" },
          }, context);
          results.push({ recordId: rid, ...result });
          break;
        }
        case "delete": {
          eventBus.emitRecordEvent({
            type: "record.deleted",
            entityId: actionDef.entityId,
            recordId: rid,
            data: recordData,
            status: record.status,
            timestamp: new Date(),
          });
          await db.delete(entityRecordsTable).where(eq(entityRecordsTable.id, rid));
          results.push({ recordId: rid, action: "delete", success: true });
          break;
        }
        case "workflow": {
          const workflowActions = handlerConfig.actions as ActionConfig[] | undefined;
          if (workflowActions && workflowActions.length > 0) {
            for (const wfAction of workflowActions) {
              const result = await executeAction(wfAction, context);
              results.push({ recordId: rid, ...result });
              if (!result.success) break;
            }
          }
          break;
        }
        default: {
          results.push({ recordId: rid, action: actionDef.handlerType, success: true, details: { handlerType: actionDef.handlerType, config: handlerConfig } });
          break;
        }
      }
    }

    const allSuccess = results.every(r => r.success !== false);
    res.json({ success: allSuccess, results });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
