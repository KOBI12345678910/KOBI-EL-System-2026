import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { viewDefinitionsTable } from "@workspace/db/schema";
import { eq, asc, inArray } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

const IdParam = z.coerce.number().int().positive();

const CreateViewBody = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  viewType: z.string().optional(),
  isDefault: z.boolean().optional(),
  columns: z.array(z.any()).optional(),
  filters: z.array(z.any()).optional(),
  sorting: z.array(z.any()).optional(),
  grouping: z.record(z.string(), z.any()).optional(),
  settings: z.record(z.string(), z.any()).optional(),
});

router.get("/platform/entities/:entityId/views", async (req, res) => {
  try {
    const entityId = Number(req.params.entityId);
    const views = await db.select().from(viewDefinitionsTable)
      .where(eq(viewDefinitionsTable.entityId, entityId))
      .orderBy(asc(viewDefinitionsTable.createdAt));
    res.json(views);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/entities/:entityId/views", async (req, res) => {
  try {
    const entityId = Number(req.params.entityId);
    const body = CreateViewBody.parse(req.body);
    const [view] = await db.insert(viewDefinitionsTable).values({ ...body, entityId }).returning();
    res.status(201).json(view);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/views/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = CreateViewBody.partial().parse(req.body);
    const [view] = await db.update(viewDefinitionsTable).set({ ...body, updatedAt: new Date() }).where(eq(viewDefinitionsTable.id, id)).returning();
    if (!view) return res.status(404).json({ message: "View not found" });
    res.json(view);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.delete("/platform/views/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(viewDefinitionsTable).where(eq(viewDefinitionsTable.id, id));
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/views/:id/duplicate", async (req, res) => {
  try {
    const id = IdParam.parse(req.params.id);
    const [original] = await db.select().from(viewDefinitionsTable).where(eq(viewDefinitionsTable.id, id));
    if (!original) return res.status(404).json({ message: "View not found" });
    const { id: _id, createdAt, updatedAt, ...rest } = original;
    const [duplicate] = await db.insert(viewDefinitionsTable).values({
      ...rest,
      name: `${rest.name} (עותק)`,
      slug: `${rest.slug}-copy-${Date.now()}`,
      isDefault: false,
    }).returning();
    res.status(201).json(duplicate);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/views/bulk-delete", async (req, res) => {
  try {
    const body = z.object({ ids: z.array(z.number().int().positive()).min(1) }).parse(req.body);
    await db.delete(viewDefinitionsTable).where(inArray(viewDefinitionsTable.id, body.ids));
    res.json({ deleted: body.ids.length });
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

export default router;
