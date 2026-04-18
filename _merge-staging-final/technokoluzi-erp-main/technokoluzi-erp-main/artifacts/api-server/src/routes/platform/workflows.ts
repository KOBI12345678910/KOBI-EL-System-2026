import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { platformWorkflowsTable, workflowStepsTable, workflowTransitionsTable, workflowInstancesTable, workflowStepLogsTable } from "@workspace/db/schema";
import { eq, asc, desc, and, inArray, sql } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

const IdParam = z.coerce.number().int().positive();

const CreateWorkflowBody = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().optional(),
  triggerType: z.string().optional(),
  triggerConfig: z.record(z.string(), z.any()).optional(),
  actions: z.array(z.any()).optional(),
  conditions: z.array(z.any()).optional(),
  isActive: z.boolean().optional(),
});

router.get("/platform/modules/:moduleId/workflows", async (req, res) => {
  try {
    const moduleId = IdParam.parse(req.params.moduleId);
    const workflows = await db.select().from(platformWorkflowsTable)
      .where(eq(platformWorkflowsTable.moduleId, moduleId))
      .orderBy(asc(platformWorkflowsTable.createdAt));
    res.json(workflows);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/modules/:moduleId/workflows", async (req, res) => {
  try {
    const moduleId = IdParam.parse(req.params.moduleId);
    const body = CreateWorkflowBody.parse(req.body);
    const [workflow] = await db.insert(platformWorkflowsTable).values({ ...body, moduleId }).returning();
    res.status(201).json(workflow);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/workflows/:id", async (req, res) => {
  try {
    const id = IdParam.parse(req.params.id);
    const body = CreateWorkflowBody.partial().parse(req.body);
    const [workflow] = await db.update(platformWorkflowsTable).set({ ...body, updatedAt: new Date() }).where(eq(platformWorkflowsTable.id, id)).returning();
    if (!workflow) return res.status(404).json({ message: "Workflow not found" });
    res.json(workflow);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.delete("/platform/workflows/:id", async (req, res) => {
  try {
    const id = IdParam.parse(req.params.id);
    await db.delete(platformWorkflowsTable).where(eq(platformWorkflowsTable.id, id));
    res.status(204).send();
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/workflows/:id/duplicate", async (req, res) => {
  try {
    const id = IdParam.parse(req.params.id);
    const [original] = await db.select().from(platformWorkflowsTable).where(eq(platformWorkflowsTable.id, id));
    if (!original) return res.status(404).json({ message: "Workflow not found" });
    const { id: _id, createdAt, updatedAt, ...rest } = original;
    const [duplicate] = await db.insert(platformWorkflowsTable).values({
      ...rest,
      name: `${rest.name} (עותק)`,
      slug: `${rest.slug}-copy-${Date.now()}`,
      isActive: false,
    }).returning();
    res.status(201).json(duplicate);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/workflows/bulk-delete", async (req, res) => {
  try {
    const body = z.object({ ids: z.array(z.number().int().positive()).min(1) }).parse(req.body);
    await db.delete(platformWorkflowsTable).where(inArray(platformWorkflowsTable.id, body.ids));
    res.json({ deleted: body.ids.length });
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

const CreateStepBody = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  stepType: z.string().optional(),
  description: z.string().optional(),
  config: z.record(z.string(), z.any()).optional(),
  sortOrder: z.number().int().optional(),
  isStart: z.boolean().optional(),
  isEnd: z.boolean().optional(),
  requiredRole: z.string().nullable().optional(),
  assigneeField: z.string().nullable().optional(),
  timeoutMinutes: z.number().int().nullable().optional(),
});

router.get("/platform/workflows/:workflowId/steps", async (req, res) => {
  try {
    const workflowId = IdParam.parse(req.params.workflowId);
    const steps = await db.select().from(workflowStepsTable)
      .where(eq(workflowStepsTable.workflowId, workflowId))
      .orderBy(asc(workflowStepsTable.sortOrder));
    res.json(steps);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/workflows/:workflowId/steps", async (req, res) => {
  try {
    const workflowId = IdParam.parse(req.params.workflowId);
    const body = CreateStepBody.parse(req.body);
    const [step] = await db.insert(workflowStepsTable).values({ ...body, workflowId }).returning();
    res.status(201).json(step);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/workflow-steps/:id", async (req, res) => {
  try {
    const id = IdParam.parse(req.params.id);
    const body = CreateStepBody.partial().parse(req.body);
    const [step] = await db.update(workflowStepsTable).set({ ...body, updatedAt: new Date() })
      .where(eq(workflowStepsTable.id, id)).returning();
    if (!step) return res.status(404).json({ message: "Step not found" });
    res.json(step);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.delete("/platform/workflow-steps/:id", async (req, res) => {
  try {
    const id = IdParam.parse(req.params.id);
    await db.delete(workflowStepsTable).where(eq(workflowStepsTable.id, id));
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

const CreateTransitionBody = z.object({
  fromStepId: z.number().int().positive(),
  toStepId: z.number().int().positive(),
  name: z.string().optional(),
  conditions: z.array(z.any()).optional(),
  actionLabel: z.string().optional(),
  sortOrder: z.number().int().optional(),
});

router.get("/platform/workflows/:workflowId/transitions", async (req, res) => {
  try {
    const workflowId = IdParam.parse(req.params.workflowId);
    const transitions = await db.select().from(workflowTransitionsTable)
      .where(eq(workflowTransitionsTable.workflowId, workflowId))
      .orderBy(asc(workflowTransitionsTable.sortOrder));
    res.json(transitions);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/workflows/:workflowId/transitions", async (req, res) => {
  try {
    const workflowId = IdParam.parse(req.params.workflowId);
    const body = CreateTransitionBody.parse(req.body);

    const [fromStep] = await db.select().from(workflowStepsTable).where(eq(workflowStepsTable.id, body.fromStepId));
    const [toStep] = await db.select().from(workflowStepsTable).where(eq(workflowStepsTable.id, body.toStepId));
    if (!fromStep || !toStep) return res.status(400).json({ message: "One or both steps not found" });
    if (fromStep.workflowId !== workflowId || toStep.workflowId !== workflowId) {
      return res.status(400).json({ message: "Both steps must belong to the same workflow" });
    }

    const [transition] = await db.insert(workflowTransitionsTable).values({ ...body, workflowId }).returning();
    res.status(201).json(transition);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/workflow-transitions/:id", async (req, res) => {
  try {
    const id = IdParam.parse(req.params.id);
    const body = CreateTransitionBody.partial().parse(req.body);
    const [transition] = await db.update(workflowTransitionsTable).set(body)
      .where(eq(workflowTransitionsTable.id, id)).returning();
    if (!transition) return res.status(404).json({ message: "Transition not found" });
    res.json(transition);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.delete("/platform/workflow-transitions/:id", async (req, res) => {
  try {
    const id = IdParam.parse(req.params.id);
    await db.delete(workflowTransitionsTable).where(eq(workflowTransitionsTable.id, id));
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/workflows/:workflowId/instances", async (req, res) => {
  try {
    const workflowId = IdParam.parse(req.params.workflowId);
    const statusFilter = req.query.status as string;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;

    const conditions: any[] = [eq(workflowInstancesTable.workflowId, workflowId)];
    if (statusFilter) {
      conditions.push(eq(workflowInstancesTable.status, statusFilter));
    }

    const instances = await db.select().from(workflowInstancesTable)
      .where(and(...conditions))
      .orderBy(desc(workflowInstancesTable.startedAt))
      .limit(limit).offset(offset);

    const countResult = await db.select({ count: sql<number>`count(*)::int` })
      .from(workflowInstancesTable)
      .where(and(...conditions));

    res.json({ instances, total: countResult[0]?.count || 0 });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/workflow-instances", async (req, res) => {
  try {
    const statusFilter = req.query.status as string;
    const workflowId = req.query.workflowId ? Number(req.query.workflowId) : null;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;

    const conditions: any[] = [];
    if (statusFilter) {
      conditions.push(eq(workflowInstancesTable.status, statusFilter));
    }
    if (workflowId) {
      conditions.push(eq(workflowInstancesTable.workflowId, workflowId));
    }

    const instances = await db.select({
      instance: workflowInstancesTable,
      workflowName: platformWorkflowsTable.name,
    }).from(workflowInstancesTable)
      .leftJoin(platformWorkflowsTable, eq(workflowInstancesTable.workflowId, platformWorkflowsTable.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(workflowInstancesTable.startedAt))
      .limit(limit).offset(offset);

    const countResult = await db.select({ count: sql<number>`count(*)::int` })
      .from(workflowInstancesTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    res.json({
      instances: instances.map(r => ({ ...r.instance, workflowName: r.workflowName })),
      total: countResult[0]?.count || 0,
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/workflows/:workflowId/instances", async (req, res) => {
  try {
    const workflowId = IdParam.parse(req.params.workflowId);
    const { entityId, recordId, startedBy, context } = req.body;

    const startStep = await db.select().from(workflowStepsTable)
      .where(and(eq(workflowStepsTable.workflowId, workflowId), eq(workflowStepsTable.isStart, true)))
      .limit(1);

    const firstStep = startStep[0] || (await db.select().from(workflowStepsTable)
      .where(eq(workflowStepsTable.workflowId, workflowId))
      .orderBy(asc(workflowStepsTable.sortOrder))
      .limit(1))[0];

    const [instance] = await db.insert(workflowInstancesTable).values({
      workflowId,
      entityId: entityId || null,
      recordId: recordId || null,
      currentStepId: firstStep?.id || null,
      status: "active",
      startedBy: startedBy || null,
      context: context || {},
    }).returning();

    if (firstStep) {
      await db.insert(workflowStepLogsTable).values({
        instanceId: instance.id,
        stepId: firstStep.id,
        action: "entered",
        performedBy: startedBy || null,
        status: "active",
        data: { auto: true },
      });
    }

    res.status(201).json(instance);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/workflow-instances/:id", async (req, res) => {
  try {
    const id = IdParam.parse(req.params.id);
    const [instance] = await db.select().from(workflowInstancesTable)
      .where(eq(workflowInstancesTable.id, id));
    if (!instance) return res.status(404).json({ message: "Instance not found" });

    const steps = await db.select().from(workflowStepsTable)
      .where(eq(workflowStepsTable.workflowId, instance.workflowId))
      .orderBy(asc(workflowStepsTable.sortOrder));

    const transitions = await db.select().from(workflowTransitionsTable)
      .where(eq(workflowTransitionsTable.workflowId, instance.workflowId));

    const logs = await db.select().from(workflowStepLogsTable)
      .where(eq(workflowStepLogsTable.instanceId, id))
      .orderBy(asc(workflowStepLogsTable.createdAt));

    const [workflow] = await db.select().from(platformWorkflowsTable)
      .where(eq(platformWorkflowsTable.id, instance.workflowId));

    res.json({ instance, steps, transitions, logs, workflow });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/workflow-instances/:id/advance", async (req, res) => {
  try {
    const id = IdParam.parse(req.params.id);
    const { transitionId, performedBy, comments } = req.body;

    const [instance] = await db.select().from(workflowInstancesTable)
      .where(eq(workflowInstancesTable.id, id));
    if (!instance) return res.status(404).json({ message: "Instance not found" });
    if (instance.status !== "active") return res.status(400).json({ message: "Instance is not active" });

    if (instance.currentStepId) {
      const [currentStep] = await db.select().from(workflowStepsTable)
        .where(eq(workflowStepsTable.id, instance.currentStepId));
      if (currentStep?.requiredRole && performedBy) {
        const userRole = (req as any).user?.role;
        if (userRole && currentStep.requiredRole !== userRole) {
          return res.status(403).json({ message: `Step requires role: ${currentStep.requiredRole}` });
        }
      }
    }

    let toStepId: number;

    if (transitionId) {
      const [transition] = await db.select().from(workflowTransitionsTable)
        .where(eq(workflowTransitionsTable.id, transitionId));
      if (!transition) return res.status(404).json({ message: "Transition not found" });
      if (instance.currentStepId && transition.fromStepId !== instance.currentStepId) {
        return res.status(400).json({ message: "Transition does not match current step" });
      }
      toStepId = transition.toStepId;
    } else {
      if (!instance.currentStepId) return res.status(400).json({ message: "No current step and no transition specified" });
      const possibleTransitions = await db.select().from(workflowTransitionsTable)
        .where(eq(workflowTransitionsTable.fromStepId, instance.currentStepId))
        .orderBy(asc(workflowTransitionsTable.sortOrder));
      if (possibleTransitions.length === 0) return res.status(400).json({ message: "No transitions available from current step" });
      toStepId = possibleTransitions[0].toStepId;
    }

    if (instance.currentStepId) {
      await db.insert(workflowStepLogsTable).values({
        instanceId: id,
        stepId: instance.currentStepId,
        action: "completed",
        performedBy: performedBy || null,
        status: "completed",
        comments: comments || null,
        data: {},
      });
    }

    const [toStep] = await db.select().from(workflowStepsTable)
      .where(eq(workflowStepsTable.id, toStepId));

    const newStatus = toStep?.isEnd ? "completed" : "active";

    const [updated] = await db.update(workflowInstancesTable)
      .set({
        currentStepId: toStepId,
        status: newStatus,
        completedAt: newStatus === "completed" ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(workflowInstancesTable.id, id))
      .returning();

    await db.insert(workflowStepLogsTable).values({
      instanceId: id,
      stepId: toStepId,
      action: newStatus === "completed" ? "completed" : "entered",
      performedBy: performedBy || null,
      status: newStatus === "completed" ? "completed" : "active",
      comments: null,
      data: {},
    });

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/workflow-instances/:id/approve", async (req, res) => {
  try {
    const id = IdParam.parse(req.params.id);
    const { performedBy, comments } = req.body;

    const [instance] = await db.select().from(workflowInstancesTable)
      .where(eq(workflowInstancesTable.id, id));
    if (!instance) return res.status(404).json({ message: "Instance not found" });
    if (instance.status !== "active") return res.status(400).json({ message: "Instance is not active" });
    if (!instance.currentStepId) return res.status(400).json({ message: "No current step" });

    const [currentStep] = await db.select().from(workflowStepsTable)
      .where(eq(workflowStepsTable.id, instance.currentStepId));
    if (!currentStep) return res.status(400).json({ message: "Current step not found" });
    if (currentStep.stepType !== "approval" && currentStep.stepType !== "review") {
      return res.status(400).json({ message: "Current step is not an approval step" });
    }

    if (currentStep.requiredRole) {
      const userRole = (req as any).user?.role;
      if (userRole && currentStep.requiredRole !== userRole) {
        return res.status(403).json({ message: `Approval requires role: ${currentStep.requiredRole}` });
      }
    }

    await db.insert(workflowStepLogsTable).values({
      instanceId: id,
      stepId: instance.currentStepId,
      action: "approved",
      performedBy: performedBy || null,
      status: "approved",
      comments: comments || null,
      data: {},
    });

    const transitions = await db.select().from(workflowTransitionsTable)
      .where(eq(workflowTransitionsTable.fromStepId, instance.currentStepId))
      .orderBy(asc(workflowTransitionsTable.sortOrder));

    if (transitions.length > 0) {
      const nextStepId = transitions[0].toStepId;
      const [nextStep] = await db.select().from(workflowStepsTable)
        .where(eq(workflowStepsTable.id, nextStepId));

      const newStatus = nextStep?.isEnd ? "completed" : "active";

      await db.update(workflowInstancesTable)
        .set({
          currentStepId: nextStepId,
          status: newStatus,
          completedAt: newStatus === "completed" ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(workflowInstancesTable.id, id));

      await db.insert(workflowStepLogsTable).values({
        instanceId: id,
        stepId: nextStepId,
        action: newStatus === "completed" ? "completed" : "entered",
        performedBy: performedBy || null,
        status: newStatus === "completed" ? "completed" : "active",
        data: {},
      });
    }

    const [updated] = await db.select().from(workflowInstancesTable)
      .where(eq(workflowInstancesTable.id, id));
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/workflow-instances/:id/reject", async (req, res) => {
  try {
    const id = IdParam.parse(req.params.id);
    const { performedBy, comments } = req.body;

    const [instance] = await db.select().from(workflowInstancesTable)
      .where(eq(workflowInstancesTable.id, id));
    if (!instance) return res.status(404).json({ message: "Instance not found" });
    if (instance.status !== "active") return res.status(400).json({ message: "Instance is not active" });

    if (instance.currentStepId) {
      await db.insert(workflowStepLogsTable).values({
        instanceId: id,
        stepId: instance.currentStepId,
        action: "rejected",
        performedBy: performedBy || null,
        status: "rejected",
        comments: comments || null,
        data: {},
      });
    }

    const [updated] = await db.update(workflowInstancesTable)
      .set({ status: "rejected", completedAt: new Date(), updatedAt: new Date() })
      .where(eq(workflowInstancesTable.id, id))
      .returning();

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/workflow-instances/:id/cancel", async (req, res) => {
  try {
    const id = IdParam.parse(req.params.id);

    const [updated] = await db.update(workflowInstancesTable)
      .set({ status: "cancelled", completedAt: new Date(), updatedAt: new Date() })
      .where(eq(workflowInstancesTable.id, id))
      .returning();

    if (!updated) return res.status(404).json({ message: "Instance not found" });
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/workflow-instances/:id/logs", async (req, res) => {
  try {
    const instanceId = IdParam.parse(req.params.id);
    const logs = await db.select({
      log: workflowStepLogsTable,
      stepName: workflowStepsTable.name,
      stepType: workflowStepsTable.stepType,
    }).from(workflowStepLogsTable)
      .leftJoin(workflowStepsTable, eq(workflowStepLogsTable.stepId, workflowStepsTable.id))
      .where(eq(workflowStepLogsTable.instanceId, instanceId))
      .orderBy(asc(workflowStepLogsTable.createdAt));

    res.json(logs.map(r => ({ ...r.log, stepName: r.stepName, stepType: r.stepType })));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
