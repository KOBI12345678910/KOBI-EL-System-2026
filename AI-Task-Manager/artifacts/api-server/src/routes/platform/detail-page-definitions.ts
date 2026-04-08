import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { detailPageDefinitionsTable } from "@workspace/db/schema";
import { eq, asc, and, inArray } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

const IdParam = z.coerce.number().int().positive();

const CreateDetailPageDefBody = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  headerFields: z.array(z.any()).optional(),
  tabs: z.array(z.any()).optional(),
  relatedLists: z.array(z.any()).optional(),
  actionBar: z.array(z.any()).optional(),
  sections: z.array(z.any()).optional(),
  settings: z.record(z.string(), z.any()).optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

router.get("/platform/entities/:entityId/detail-page-definitions", async (req, res) => {
  try {
    const entityId = IdParam.parse(req.params.entityId);
    const defs = await db.select().from(detailPageDefinitionsTable)
      .where(eq(detailPageDefinitionsTable.entityId, entityId))
      .orderBy(asc(detailPageDefinitionsTable.sortOrder));
    res.json(defs);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/entities/:entityId/detail-page-definitions", async (req, res) => {
  try {
    const entityId = IdParam.parse(req.params.entityId);
    const body = CreateDetailPageDefBody.parse(req.body);
    const [def] = await db.insert(detailPageDefinitionsTable).values({ ...body, entityId }).returning();
    res.status(201).json(def);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/detail-page-definitions/:id", async (req, res) => {
  try {
    const id = IdParam.parse(req.params.id);
    const [existing] = await db.select().from(detailPageDefinitionsTable).where(eq(detailPageDefinitionsTable.id, id));
    if (!existing) return res.status(404).json({ message: "Detail page definition not found" });
    const body = CreateDetailPageDefBody.partial().parse(req.body);
    const [def] = await db.update(detailPageDefinitionsTable)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(detailPageDefinitionsTable.id, id))
      .returning();
    res.json(def);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.delete("/platform/detail-page-definitions/:id", async (req, res) => {
  try {
    const id = IdParam.parse(req.params.id);
    const [existing] = await db.select().from(detailPageDefinitionsTable).where(eq(detailPageDefinitionsTable.id, id));
    if (!existing) return res.status(404).json({ message: "Detail page definition not found" });
    await db.delete(detailPageDefinitionsTable).where(eq(detailPageDefinitionsTable.id, id));
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
