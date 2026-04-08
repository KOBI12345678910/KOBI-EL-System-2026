import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { systemMenuItemsTable } from "@workspace/db/schema";
import { eq, asc, isNull, inArray } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

const IdParam = z.coerce.number().int().positive();

const CreateMenuItemBody = z.object({
  moduleId: z.number().optional(),
  entityId: z.number().optional(),
  parentId: z.number().optional(),
  label: z.string().min(1),
  labelHe: z.string().optional(),
  labelEn: z.string().optional(),
  icon: z.string().optional(),
  path: z.string().optional(),
  section: z.string().optional(),
  roles: z.array(z.string()).optional(),
  sortOrder: z.number().optional(),
  isActive: z.boolean().optional(),
  settings: z.record(z.string(), z.any()).optional(),
});

const UpdateMenuItemBody = CreateMenuItemBody.partial();

router.get("/platform/menu-items", async (_req, res) => {
  try {
    const items = await db.select().from(systemMenuItemsTable).orderBy(asc(systemMenuItemsTable.sortOrder));
    res.json(items);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/menu-items", async (req, res) => {
  try {
    const body = CreateMenuItemBody.parse(req.body);
    const [item] = await db.insert(systemMenuItemsTable).values(body).returning();
    res.status(201).json(item);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/menu-items/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = UpdateMenuItemBody.parse(req.body);
    const [item] = await db.update(systemMenuItemsTable).set(body).where(eq(systemMenuItemsTable.id, id)).returning();
    if (!item) return res.status(404).json({ message: "Menu item not found" });
    res.json(item);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/menu-items/reorder", async (req, res) => {
  try {
    const body = z.object({
      items: z.array(z.object({
        id: z.number(),
        sortOrder: z.number(),
        parentId: z.number().optional(),
        section: z.string().optional(),
      })),
    }).parse(req.body);

    for (const item of body.items) {
      await db.update(systemMenuItemsTable).set({
        sortOrder: item.sortOrder,
        parentId: item.parentId ?? null,
        section: item.section,
      }).where(eq(systemMenuItemsTable.id, item.id));
    }

    const updated = await db.select().from(systemMenuItemsTable).orderBy(asc(systemMenuItemsTable.sortOrder));
    res.json(updated);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.delete("/platform/menu-items/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(systemMenuItemsTable).where(eq(systemMenuItemsTable.id, id));
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/menu-items/:id/duplicate", async (req, res) => {
  try {
    const id = IdParam.parse(req.params.id);
    const [original] = await db.select().from(systemMenuItemsTable).where(eq(systemMenuItemsTable.id, id));
    if (!original) return res.status(404).json({ message: "Menu item not found" });
    const { id: _id, createdAt, ...rest } = original;
    const [duplicate] = await db.insert(systemMenuItemsTable).values({
      ...rest,
      label: `${rest.label} (עותק)`,
      labelHe: rest.labelHe ? `${rest.labelHe} (עותק)` : null,
      sortOrder: rest.sortOrder + 1,
    }).returning();
    res.status(201).json(duplicate);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/menu-items/bulk-delete", async (req, res) => {
  try {
    const body = z.object({ ids: z.array(z.number().int().positive()).min(1) }).parse(req.body);
    await db.delete(systemMenuItemsTable).where(inArray(systemMenuItemsTable.id, body.ids));
    res.json({ deleted: body.ids.length });
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

export default router;
