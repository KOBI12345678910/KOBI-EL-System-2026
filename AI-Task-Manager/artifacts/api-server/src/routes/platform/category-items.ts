import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { categoryItemsTable } from "@workspace/db/schema";
import { eq, asc, and, inArray } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

const IdParam = z.coerce.number().int().positive();

const CreateCategoryItemBody = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  categoryDefId: z.number().int().optional().nullable(),
  parentId: z.number().int().optional().nullable(),
  icon: z.string().optional(),
  color: z.string().optional(),
  sortOrder: z.number().optional(),
  isActive: z.boolean().optional(),
  settings: z.record(z.string(), z.any()).optional(),
});

router.get("/platform/entities/:entityId/category-items", async (req, res) => {
  try {
    const entityId = IdParam.parse(req.params.entityId);
    const items = await db.select().from(categoryItemsTable)
      .where(eq(categoryItemsTable.entityId, entityId))
      .orderBy(asc(categoryItemsTable.sortOrder));
    res.json(items);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/entities/:entityId/category-items", async (req, res) => {
  try {
    const entityId = IdParam.parse(req.params.entityId);
    const body = CreateCategoryItemBody.parse(req.body);
    const [item] = await db.insert(categoryItemsTable).values({ ...body, entityId }).returning();
    res.status(201).json(item);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/category-items/:id", async (req, res) => {
  try {
    const id = IdParam.parse(req.params.id);
    const [existing] = await db.select().from(categoryItemsTable).where(eq(categoryItemsTable.id, id));
    if (!existing) return res.status(404).json({ message: "Category item not found" });
    const body = CreateCategoryItemBody.partial().parse(req.body);
    const [item] = await db.update(categoryItemsTable).set(body).where(eq(categoryItemsTable.id, id)).returning();
    res.json(item);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.delete("/platform/category-items/:id", async (req, res) => {
  try {
    const id = IdParam.parse(req.params.id);
    const [existing] = await db.select().from(categoryItemsTable).where(eq(categoryItemsTable.id, id));
    if (!existing) return res.status(404).json({ message: "Category item not found" });
    await db.delete(categoryItemsTable).where(eq(categoryItemsTable.id, id));
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/category-items/:id/duplicate", async (req, res) => {
  try {
    const id = IdParam.parse(req.params.id);
    const [existing] = await db.select().from(categoryItemsTable).where(eq(categoryItemsTable.id, id));
    if (!existing) return res.status(404).json({ message: "Category item not found" });
    const { id: _id, createdAt: _ca, ...rest } = existing;
    const [duplicate] = await db.insert(categoryItemsTable).values({
      ...rest,
      name: `${existing.name} (עותק)`,
      slug: `${existing.slug}-copy-${Date.now()}`,
    }).returning();
    res.status(201).json(duplicate);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/entities/:entityId/category-items/reorder", async (req, res) => {
  try {
    const entityId = IdParam.parse(req.params.entityId);
    const body = z.object({
      items: z.array(z.object({ id: z.number(), sortOrder: z.number(), parentId: z.number().nullable().optional() })),
    }).parse(req.body);
    for (const item of body.items) {
      const updates: { sortOrder: number; parentId?: number | null } = { sortOrder: item.sortOrder };
      if (item.parentId !== undefined) updates.parentId = item.parentId;
      await db.update(categoryItemsTable).set(updates)
        .where(and(eq(categoryItemsTable.id, item.id), eq(categoryItemsTable.entityId, entityId)));
    }
    const items = await db.select().from(categoryItemsTable)
      .where(eq(categoryItemsTable.entityId, entityId))
      .orderBy(asc(categoryItemsTable.sortOrder));
    res.json(items);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/entities/:entityId/category-items/bulk-delete", async (req, res) => {
  try {
    const entityId = IdParam.parse(req.params.entityId);
    const body = z.object({ ids: z.array(z.number().int().positive()).min(1) }).parse(req.body);
    await db.delete(categoryItemsTable).where(and(inArray(categoryItemsTable.id, body.ids), eq(categoryItemsTable.entityId, entityId)));
    res.json({ deleted: body.ids.length });
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

export default router;
