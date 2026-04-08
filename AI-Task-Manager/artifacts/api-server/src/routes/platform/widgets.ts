import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { platformWidgetsTable } from "@workspace/db/schema";
import { eq, asc, and, inArray } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

const IdParam = z.coerce.number().int().positive();

const CreateWidgetBody = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  widgetType: z.string().optional(),
  entityId: z.number().int().optional(),
  config: z.record(z.string(), z.any()).optional(),
  position: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

router.get("/platform/modules/:moduleId/widgets", async (req, res) => {
  try {
    const moduleId = IdParam.parse(req.params.moduleId);
    const widgets = await db.select().from(platformWidgetsTable)
      .where(eq(platformWidgetsTable.moduleId, moduleId))
      .orderBy(asc(platformWidgetsTable.position));
    res.json(widgets);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/modules/:moduleId/widgets", async (req, res) => {
  try {
    const moduleId = IdParam.parse(req.params.moduleId);
    const body = CreateWidgetBody.parse(req.body);
    const [widget] = await db.insert(platformWidgetsTable).values({ ...body, moduleId }).returning();
    res.status(201).json(widget);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/widgets/:id", async (req, res) => {
  try {
    const id = IdParam.parse(req.params.id);
    const body = CreateWidgetBody.partial().parse(req.body);
    const [widget] = await db.update(platformWidgetsTable).set({ ...body, updatedAt: new Date() }).where(eq(platformWidgetsTable.id, id)).returning();
    if (!widget) return res.status(404).json({ message: "Widget not found" });
    res.json(widget);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.delete("/platform/widgets/:id", async (req, res) => {
  try {
    const id = IdParam.parse(req.params.id);
    await db.delete(platformWidgetsTable).where(eq(platformWidgetsTable.id, id));
    res.status(204).send();
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/widgets/:id/duplicate", async (req, res) => {
  try {
    const id = IdParam.parse(req.params.id);
    const [original] = await db.select().from(platformWidgetsTable).where(eq(platformWidgetsTable.id, id));
    if (!original) return res.status(404).json({ message: "Widget not found" });
    const { id: _id, createdAt, updatedAt, ...rest } = original;
    const [duplicate] = await db.insert(platformWidgetsTable).values({
      ...rest,
      name: `${rest.name} (עותק)`,
      slug: `${rest.slug}-copy-${Date.now()}`,
    }).returning();
    res.status(201).json(duplicate);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/modules/:moduleId/widgets/reorder", async (req, res) => {
  try {
    const moduleId = IdParam.parse(req.params.moduleId);
    const body = z.object({
      items: z.array(z.object({ id: z.number(), position: z.number() })),
    }).parse(req.body);
    for (const item of body.items) {
      await db.update(platformWidgetsTable)
        .set({ position: item.position, updatedAt: new Date() })
        .where(and(eq(platformWidgetsTable.id, item.id), eq(platformWidgetsTable.moduleId, moduleId)));
    }
    const widgets = await db.select().from(platformWidgetsTable)
      .where(eq(platformWidgetsTable.moduleId, moduleId))
      .orderBy(asc(platformWidgetsTable.position));
    res.json(widgets);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/widgets/bulk-delete", async (req, res) => {
  try {
    const body = z.object({ ids: z.array(z.number().int().positive()).min(1) }).parse(req.body);
    await db.delete(platformWidgetsTable).where(inArray(platformWidgetsTable.id, body.ids));
    res.json({ deleted: body.ids.length });
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

export default router;
