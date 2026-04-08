import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { formDefinitionsTable } from "@workspace/db/schema";
import { eq, asc, inArray } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

const IdParam = z.coerce.number().int().positive();

const CreateFormBody = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  formType: z.enum(["create", "edit", "quick_create", "wizard"]).optional(),
  sections: z.array(z.any()).optional(),
  settings: z.record(z.string(), z.any()).optional(),
  isDefault: z.boolean().optional(),
});

router.get("/platform/entities/:entityId/forms", async (req, res) => {
  try {
    const entityId = Number(req.params.entityId);
    const forms = await db.select().from(formDefinitionsTable)
      .where(eq(formDefinitionsTable.entityId, entityId))
      .orderBy(asc(formDefinitionsTable.createdAt));
    res.json(forms);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/entities/:entityId/forms", async (req, res) => {
  try {
    const entityId = Number(req.params.entityId);
    const body = CreateFormBody.parse(req.body);
    const [form] = await db.insert(formDefinitionsTable).values({ ...body, entityId }).returning();
    res.status(201).json(form);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/forms/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = CreateFormBody.partial().parse(req.body);
    const [form] = await db.update(formDefinitionsTable).set({ ...body, updatedAt: new Date() }).where(eq(formDefinitionsTable.id, id)).returning();
    if (!form) return res.status(404).json({ message: "Form not found" });
    res.json(form);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.delete("/platform/forms/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(formDefinitionsTable).where(eq(formDefinitionsTable.id, id));
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/forms/:id/duplicate", async (req, res) => {
  try {
    const id = IdParam.parse(req.params.id);
    const [original] = await db.select().from(formDefinitionsTable).where(eq(formDefinitionsTable.id, id));
    if (!original) return res.status(404).json({ message: "Form not found" });
    const { id: _id, createdAt, updatedAt, ...rest } = original;
    const [duplicate] = await db.insert(formDefinitionsTable).values({
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

router.post("/platform/forms/bulk-delete", async (req, res) => {
  try {
    const body = z.object({ ids: z.array(z.number().int().positive()).min(1) }).parse(req.body);
    await db.delete(formDefinitionsTable).where(inArray(formDefinitionsTable.id, body.ids));
    res.json({ deleted: body.ids.length });
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

export default router;
