import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { buttonDefinitionsTable } from "@workspace/db/schema";
import { eq, asc, and, inArray } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

const IdParam = z.coerce.number().int().positive();

const CreateButtonDefBody = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  placement: z.string().min(1),
  style: z.string().optional().nullable(),
  icon: z.string().optional().nullable(),
  color: z.string().optional().nullable(),
  actionId: z.number().int().optional().nullable(),
  actionType: z.string().optional().nullable(),
  actionConfig: z.record(z.string(), z.any()).optional(),
  conditions: z.record(z.string(), z.any()).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

router.get("/platform/entities/:entityId/button-definitions", async (req, res) => {
  try {
    const entityId = IdParam.parse(req.params.entityId);
    const buttons = await db.select().from(buttonDefinitionsTable)
      .where(eq(buttonDefinitionsTable.entityId, entityId))
      .orderBy(asc(buttonDefinitionsTable.sortOrder));
    res.json(buttons);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/entities/:entityId/button-definitions", async (req, res) => {
  try {
    const entityId = IdParam.parse(req.params.entityId);
    const body = CreateButtonDefBody.parse(req.body);
    const [button] = await db.insert(buttonDefinitionsTable).values({ ...body, entityId }).returning();
    res.status(201).json(button);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/button-definitions/:id", async (req, res) => {
  try {
    const id = IdParam.parse(req.params.id);
    const [existing] = await db.select().from(buttonDefinitionsTable).where(eq(buttonDefinitionsTable.id, id));
    if (!existing) return res.status(404).json({ message: "Button definition not found" });
    const body = CreateButtonDefBody.partial().parse(req.body);
    const [button] = await db.update(buttonDefinitionsTable).set(body).where(eq(buttonDefinitionsTable.id, id)).returning();
    res.json(button);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.delete("/platform/button-definitions/:id", async (req, res) => {
  try {
    const id = IdParam.parse(req.params.id);
    const [existing] = await db.select().from(buttonDefinitionsTable).where(eq(buttonDefinitionsTable.id, id));
    if (!existing) return res.status(404).json({ message: "Button definition not found" });
    await db.delete(buttonDefinitionsTable).where(eq(buttonDefinitionsTable.id, id));
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/entities/:entityId/button-definitions/bulk-delete", async (req, res) => {
  try {
    const entityId = IdParam.parse(req.params.entityId);
    const body = z.object({ ids: z.array(z.number().int().positive()).min(1) }).parse(req.body);
    await db.delete(buttonDefinitionsTable).where(and(inArray(buttonDefinitionsTable.id, body.ids), eq(buttonDefinitionsTable.entityId, entityId)));
    res.json({ deleted: body.ids.length });
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

export default router;
