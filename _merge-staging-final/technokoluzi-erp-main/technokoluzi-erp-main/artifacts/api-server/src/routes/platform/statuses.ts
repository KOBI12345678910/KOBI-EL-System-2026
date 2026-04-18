import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { entityStatusesTable, statusTransitionsTable } from "@workspace/db/schema";
import { eq, asc } from "drizzle-orm";
import { z } from "zod/v4";
import { invalidateEntityStatuses } from "../../lib/metadata-cache";

const router: IRouter = Router();

const CreateStatusBody = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  color: z.string().optional(),
  icon: z.string().optional(),
  sortOrder: z.number().optional(),
  isDefault: z.boolean().optional(),
  isFinal: z.boolean().optional(),
  settings: z.record(z.string(), z.any()).optional(),
});

const CreateTransitionBody = z.object({
  fromStatusId: z.number().nullable().optional(),
  toStatusId: z.number(),
  label: z.string().min(1),
  icon: z.string().optional(),
  conditions: z.record(z.string(), z.any()).optional(),
  settings: z.record(z.string(), z.any()).optional(),
});

router.get("/platform/entities/:entityId/statuses", async (req, res) => {
  try {
    const entityId = Number(req.params.entityId);
    const statuses = await db.select().from(entityStatusesTable)
      .where(eq(entityStatusesTable.entityId, entityId))
      .orderBy(asc(entityStatusesTable.sortOrder));
    res.json(statuses);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/entities/:entityId/statuses", async (req, res) => {
  try {
    const entityId = Number(req.params.entityId);
    const body = CreateStatusBody.parse(req.body);
    const [status] = await db.insert(entityStatusesTable).values({ ...body, entityId }).returning();
    invalidateEntityStatuses(entityId);
    res.status(201).json(status);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/statuses/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = CreateStatusBody.partial().parse(req.body);
    const [status] = await db.update(entityStatusesTable).set(body).where(eq(entityStatusesTable.id, id)).returning();
    if (!status) return res.status(404).json({ message: "Status not found" });
    invalidateEntityStatuses(status.entityId);
    res.json(status);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.delete("/platform/statuses/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select({ entityId: entityStatusesTable.entityId }).from(entityStatusesTable).where(eq(entityStatusesTable.id, id));
    await db.delete(entityStatusesTable).where(eq(entityStatusesTable.id, id));
    if (existing) invalidateEntityStatuses(existing.entityId);
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/entities/:entityId/transitions", async (req, res) => {
  try {
    const entityId = Number(req.params.entityId);
    const transitions = await db.select().from(statusTransitionsTable)
      .where(eq(statusTransitionsTable.entityId, entityId));
    res.json(transitions);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/entities/:entityId/transitions", async (req, res) => {
  try {
    const entityId = Number(req.params.entityId);
    const body = CreateTransitionBody.parse(req.body);
    const [transition] = await db.insert(statusTransitionsTable).values({ ...body, entityId }).returning();
    res.status(201).json(transition);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.delete("/platform/transitions/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(statusTransitionsTable).where(eq(statusTransitionsTable.id, id));
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
