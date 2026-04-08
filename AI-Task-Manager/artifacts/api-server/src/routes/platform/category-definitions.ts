import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { categoryDefinitionsTable } from "@workspace/db/schema";
import { eq, asc, inArray } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

const IdParam = z.coerce.number().int().positive();

const CreateCategoryDefBody = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().optional().nullable(),
  allowMultiple: z.boolean().optional(),
  isRequired: z.boolean().optional(),
  isActive: z.boolean().optional(),
  settings: z.record(z.string(), z.any()).optional(),
  sortOrder: z.number().optional(),
});

router.get("/platform/entities/:entityId/category-definitions", async (req, res) => {
  try {
    const entityId = Number(req.params.entityId);
    const defs = await db.select().from(categoryDefinitionsTable)
      .where(eq(categoryDefinitionsTable.entityId, entityId))
      .orderBy(asc(categoryDefinitionsTable.sortOrder));
    res.json(defs);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/entities/:entityId/category-definitions", async (req, res) => {
  try {
    const entityId = Number(req.params.entityId);
    const body = CreateCategoryDefBody.parse(req.body);
    const [def] = await db.insert(categoryDefinitionsTable).values({ ...body, entityId }).returning();
    res.status(201).json(def);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/category-definitions/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(categoryDefinitionsTable).where(eq(categoryDefinitionsTable.id, id));
    if (!existing) return res.status(404).json({ message: "Category definition not found" });
    const body = CreateCategoryDefBody.partial().parse(req.body);
    const [def] = await db.update(categoryDefinitionsTable)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(categoryDefinitionsTable.id, id))
      .returning();
    res.json(def);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.delete("/platform/category-definitions/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(categoryDefinitionsTable).where(eq(categoryDefinitionsTable.id, id));
    if (!existing) return res.status(404).json({ message: "Category definition not found" });
    await db.delete(categoryDefinitionsTable).where(eq(categoryDefinitionsTable.id, id));
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/category-definitions/bulk-delete", async (req, res) => {
  try {
    const body = z.object({ ids: z.array(z.number().int().positive()).min(1) }).parse(req.body);
    await db.delete(categoryDefinitionsTable).where(inArray(categoryDefinitionsTable.id, body.ids));
    res.json({ deleted: body.ids.length });
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

export default router;
