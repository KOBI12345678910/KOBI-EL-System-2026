import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { systemButtonsTable } from "@workspace/db/schema";
import { eq, asc, desc } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

const IdParam = z.coerce.number().int().positive();

const CreateButtonBody = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  buttonType: z.string().min(1),
  icon: z.string().optional().nullable(),
  color: z.string().optional().nullable(),
  actionType: z.string().optional().nullable(),
  actionConfig: z.record(z.string(), z.any()).optional(),
  conditions: z.record(z.string(), z.any()).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

router.get("/platform/buttons", async (_req, res) => {
  try {
    const buttons = await db.select().from(systemButtonsTable).orderBy(asc(systemButtonsTable.sortOrder));
    res.json(buttons);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/entities/:entityId/buttons", async (req, res) => {
  try {
    const entityId = IdParam.parse(req.params.entityId);
    const buttons = await db.select().from(systemButtonsTable)
      .where(eq(systemButtonsTable.entityId, entityId))
      .orderBy(asc(systemButtonsTable.sortOrder));
    res.json(buttons);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/entities/:entityId/buttons", async (req, res) => {
  try {
    const entityId = IdParam.parse(req.params.entityId);
    const body = CreateButtonBody.parse(req.body);
    const [button] = await db.insert(systemButtonsTable).values({ ...body, entityId }).returning();
    res.status(201).json(button);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/buttons/:id", async (req, res) => {
  try {
    const id = IdParam.parse(req.params.id);
    const body = CreateButtonBody.partial().parse(req.body);
    const [button] = await db.update(systemButtonsTable).set(body).where(eq(systemButtonsTable.id, id)).returning();
    if (!button) return res.status(404).json({ message: "Button not found" });
    res.json(button);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.delete("/platform/buttons/:id", async (req, res) => {
  try {
    const id = IdParam.parse(req.params.id);
    await db.delete(systemButtonsTable).where(eq(systemButtonsTable.id, id));
    res.status(204).send();
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

export default router;
