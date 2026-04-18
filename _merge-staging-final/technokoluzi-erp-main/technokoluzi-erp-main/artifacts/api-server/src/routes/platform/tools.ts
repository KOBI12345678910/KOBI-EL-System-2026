import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { platformToolsTable, toolExecutionLogsTable } from "@workspace/db/schema";
import { eq, and, asc, desc, sql } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

const IdParam = z.coerce.number().int().positive();

const CreateToolBody = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().optional(),
  toolType: z.enum(["import", "export", "transform", "calculate", "custom"]).optional(),
  moduleId: z.number().int().nullable().optional(),
  entityId: z.number().int().nullable().optional(),
  inputConfig: z.record(z.string(), z.any()).optional(),
  outputConfig: z.record(z.string(), z.any()).optional(),
  executionConfig: z.record(z.string(), z.any()).optional(),
  isActive: z.boolean().optional(),
});

router.get("/platform/tools", async (req, res) => {
  try {
    const { moduleId } = req.query;
    const conditions: any[] = [];
    if (moduleId) {
      const parsed = IdParam.safeParse(moduleId);
      if (!parsed.success) return res.status(400).json({ message: "Invalid moduleId" });
      conditions.push(eq(platformToolsTable.moduleId, parsed.data));
    }
    const tools = await db.select().from(platformToolsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(platformToolsTable.createdAt));
    res.json(tools);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/tools/:id", async (req, res) => {
  try {
    const id = IdParam.parse(req.params.id);
    const [tool] = await db.select().from(platformToolsTable)
      .where(eq(platformToolsTable.id, id));
    if (!tool) return res.status(404).json({ message: "Tool not found" });
    res.json(tool);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/tools", async (req, res) => {
  try {
    const body = CreateToolBody.parse(req.body);
    const [tool] = await db.insert(platformToolsTable).values(body).returning();
    res.status(201).json(tool);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/tools/:id", async (req, res) => {
  try {
    const id = IdParam.parse(req.params.id);
    const body = CreateToolBody.partial().parse(req.body);
    const [tool] = await db.update(platformToolsTable)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(platformToolsTable.id, id))
      .returning();
    if (!tool) return res.status(404).json({ message: "Tool not found" });
    res.json(tool);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.delete("/platform/tools/:id", async (req, res) => {
  try {
    const id = IdParam.parse(req.params.id);
    const [deleted] = await db.delete(platformToolsTable).where(eq(platformToolsTable.id, id)).returning();
    if (!deleted) return res.status(404).json({ message: "Tool not found" });
    res.status(204).send();
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/tools/:id/execute", async (req, res) => {
  try {
    const toolId = IdParam.parse(req.params.id);
    const { inputData } = req.body || {};

    const [tool] = await db.select().from(platformToolsTable)
      .where(eq(platformToolsTable.id, toolId));
    if (!tool) return res.status(404).json({ message: "Tool not found" });

    const startedAt = new Date();
    let status = "completed";
    let outputData: any = { message: `Tool "${tool.name}" executed successfully (framework mode)` };
    let errorMessage: string | null = null;

    try {
      outputData = {
        toolId: tool.id,
        toolType: tool.toolType,
        inputReceived: inputData || {},
        message: `Tool "${tool.name}" (${tool.toolType}) executed successfully in framework mode`,
        timestamp: new Date().toISOString(),
      };
    } catch (execErr: any) {
      status = "failed";
      errorMessage = execErr.message;
      outputData = {};
    }

    const [log] = await db.insert(toolExecutionLogsTable).values({
      toolId,
      status,
      inputData: inputData || {},
      outputData,
      errorMessage,
      startedAt,
      completedAt: new Date(),
    }).returning();

    await db.update(platformToolsTable)
      .set({ lastRunAt: new Date(), runCount: tool.runCount + 1, updatedAt: new Date() })
      .where(eq(platformToolsTable.id, toolId));

    res.json(log);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/tools/:id/logs", async (req, res) => {
  try {
    const toolId = IdParam.parse(req.params.id);
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    const offset = Number(req.query.offset) || 0;

    const logs = await db.select().from(toolExecutionLogsTable)
      .where(eq(toolExecutionLogsTable.toolId, toolId))
      .orderBy(desc(toolExecutionLogsTable.startedAt))
      .limit(limit)
      .offset(offset);

    const countResult = await db.select({ count: sql<number>`count(*)::int` })
      .from(toolExecutionLogsTable)
      .where(eq(toolExecutionLogsTable.toolId, toolId));

    res.json({ logs, total: countResult[0]?.count || 0 });
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

export default router;
