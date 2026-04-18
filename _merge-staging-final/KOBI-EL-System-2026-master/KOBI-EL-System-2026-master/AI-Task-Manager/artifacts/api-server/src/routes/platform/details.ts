import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { detailDefinitionsTable } from "@workspace/db/schema";
import { eq, asc, inArray } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

const IdParam = z.coerce.number().int().positive();

const CreateDetailBody = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  sections: z.array(z.any()).optional(),
  headerFields: z.array(z.any()).optional(),
  tabs: z.array(z.any()).optional(),
  relatedLists: z.array(z.any()).optional(),
  actionBar: z.array(z.any()).optional(),
  settings: z.record(z.string(), z.any()).optional(),
  isDefault: z.boolean().optional(),
  showRelatedRecords: z.boolean().optional(),
});

router.get("/platform/entities/:entityId/details", async (req, res) => {
  try {
    const entityId = Number(req.params.entityId);
    const details = await db.select().from(detailDefinitionsTable)
      .where(eq(detailDefinitionsTable.entityId, entityId))
      .orderBy(asc(detailDefinitionsTable.createdAt));
    res.json(details);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/entities/:entityId/details", async (req, res) => {
  try {
    const entityId = Number(req.params.entityId);
    const body = CreateDetailBody.parse(req.body);
    const [detail] = await db.insert(detailDefinitionsTable).values({ ...body, entityId }).returning();
    res.status(201).json(detail);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/details/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = CreateDetailBody.partial().parse(req.body);
    const [detail] = await db.update(detailDefinitionsTable).set({ ...body, updatedAt: new Date() }).where(eq(detailDefinitionsTable.id, id)).returning();
    if (!detail) return res.status(404).json({ message: "Detail definition not found" });
    res.json(detail);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.delete("/platform/details/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(detailDefinitionsTable).where(eq(detailDefinitionsTable.id, id));
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/details/:id/duplicate", async (req, res) => {
  try {
    const id = IdParam.parse(req.params.id);
    const [original] = await db.select().from(detailDefinitionsTable).where(eq(detailDefinitionsTable.id, id));
    if (!original) return res.status(404).json({ message: "Detail definition not found" });
    const { id: _id, createdAt, updatedAt, ...rest } = original;
    const [duplicate] = await db.insert(detailDefinitionsTable).values({
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

router.post("/platform/details/bulk-delete", async (req, res) => {
  try {
    const body = z.object({ ids: z.array(z.number().int().positive()).min(1) }).parse(req.body);
    await db.delete(detailDefinitionsTable).where(inArray(detailDefinitionsTable.id, body.ids));
    res.json({ deleted: body.ids.length });
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

export default router;
