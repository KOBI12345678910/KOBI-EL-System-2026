import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { entityCategoriesTable } from "@workspace/db/schema";
import { eq, asc, and, isNull, inArray } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

const IdParam = z.coerce.number().int().positive();

const CreateCategoryBody = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  parentId: z.number().nullable().optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
  sortOrder: z.number().optional(),
  isActive: z.boolean().optional(),
  settings: z.record(z.string(), z.any()).optional(),
});

router.get("/platform/entities/:entityId/categories", async (req, res) => {
  try {
    const entityId = Number(req.params.entityId);
    const categories = await db.select().from(entityCategoriesTable)
      .where(eq(entityCategoriesTable.entityId, entityId))
      .orderBy(asc(entityCategoriesTable.sortOrder));
    res.json(categories);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/entities/:entityId/categories", async (req, res) => {
  try {
    const entityId = Number(req.params.entityId);
    const body = CreateCategoryBody.parse(req.body);
    const [category] = await db.insert(entityCategoriesTable).values({ ...body, entityId }).returning();
    res.status(201).json(category);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/categories/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(entityCategoriesTable).where(eq(entityCategoriesTable.id, id));
    if (!existing) return res.status(404).json({ message: "Category not found" });
    const body = CreateCategoryBody.partial().parse(req.body);
    const [category] = await db.update(entityCategoriesTable).set(body).where(eq(entityCategoriesTable.id, id)).returning();
    res.json(category);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.delete("/platform/categories/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(entityCategoriesTable).where(eq(entityCategoriesTable.id, id));
    if (!existing) return res.status(404).json({ message: "Category not found" });
    await db.delete(entityCategoriesTable).where(eq(entityCategoriesTable.id, id));
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/categories/:id/duplicate", async (req, res) => {
  try {
    const id = IdParam.parse(req.params.id);
    const [original] = await db.select().from(entityCategoriesTable).where(eq(entityCategoriesTable.id, id));
    if (!original) return res.status(404).json({ message: "Category not found" });
    const { id: _id, createdAt, ...rest } = original;
    const [duplicate] = await db.insert(entityCategoriesTable).values({
      ...rest,
      name: `${rest.name} (עותק)`,
      slug: `${rest.slug}-copy-${Date.now()}`,
    }).returning();
    res.status(201).json(duplicate);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/entities/:entityId/categories/reorder", async (req, res) => {
  try {
    const entityId = Number(req.params.entityId);
    const body = z.object({
      items: z.array(z.object({ id: z.number(), sortOrder: z.number(), parentId: z.number().nullable().optional() })),
    }).parse(req.body);
    for (const item of body.items) {
      const updates: any = { sortOrder: item.sortOrder };
      if (item.parentId !== undefined) updates.parentId = item.parentId;
      await db.update(entityCategoriesTable).set(updates).where(and(eq(entityCategoriesTable.id, item.id), eq(entityCategoriesTable.entityId, entityId)));
    }
    const categories = await db.select().from(entityCategoriesTable)
      .where(eq(entityCategoriesTable.entityId, entityId))
      .orderBy(asc(entityCategoriesTable.sortOrder));
    res.json(categories);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/categories/bulk-delete", async (req, res) => {
  try {
    const body = z.object({ ids: z.array(z.number().int().positive()).min(1) }).parse(req.body);
    await db.delete(entityCategoriesTable).where(inArray(entityCategoriesTable.id, body.ids));
    res.json({ deleted: body.ids.length });
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

export default router;
