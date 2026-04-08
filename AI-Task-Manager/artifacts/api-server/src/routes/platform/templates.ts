import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { systemTemplatesTable } from "@workspace/db/schema";
import { eq, asc, inArray } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

const IdParam = z.coerce.number().int().positive();

const CreateTemplateBody = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  templateType: z.string().min(1),
  entityId: z.number().int().optional(),
  moduleId: z.number().int().optional(),
  content: z.record(z.string(), z.any()).optional(),
  isActive: z.boolean().optional(),
  settings: z.record(z.string(), z.any()).optional(),
});

router.get("/platform/templates", async (_req, res) => {
  try {
    const templates = await db.select().from(systemTemplatesTable)
      .orderBy(asc(systemTemplatesTable.createdAt));
    res.json(templates);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/templates", async (req, res) => {
  try {
    const body = CreateTemplateBody.parse(req.body);
    const [template] = await db.insert(systemTemplatesTable).values(body).returning();
    res.status(201).json(template);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/templates/:id", async (req, res) => {
  try {
    const id = IdParam.parse(req.params.id);
    const body = CreateTemplateBody.partial().parse(req.body);
    const [template] = await db.update(systemTemplatesTable)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(systemTemplatesTable.id, id))
      .returning();
    if (!template) return res.status(404).json({ message: "Template not found" });
    res.json(template);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.delete("/platform/templates/:id", async (req, res) => {
  try {
    const id = IdParam.parse(req.params.id);
    await db.delete(systemTemplatesTable).where(eq(systemTemplatesTable.id, id));
    res.status(204).send();
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/templates/:id/duplicate", async (req, res) => {
  try {
    const id = IdParam.parse(req.params.id);
    const [original] = await db.select().from(systemTemplatesTable).where(eq(systemTemplatesTable.id, id));
    if (!original) return res.status(404).json({ message: "Template not found" });
    const { id: _id, createdAt, updatedAt, ...rest } = original;
    const [duplicate] = await db.insert(systemTemplatesTable).values({
      ...rest,
      name: `${rest.name} (עותק)`,
      slug: `${rest.slug}-copy-${Date.now()}`,
    }).returning();
    res.status(201).json(duplicate);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/templates/bulk-delete", async (req, res) => {
  try {
    const body = z.object({ ids: z.array(z.number().int().positive()).min(1) }).parse(req.body);
    await db.delete(systemTemplatesTable).where(inArray(systemTemplatesTable.id, body.ids));
    res.json({ deleted: body.ids.length });
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

export default router;
