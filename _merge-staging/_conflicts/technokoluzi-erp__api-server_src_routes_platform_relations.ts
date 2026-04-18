import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { entityRelationsTable } from "@workspace/db/schema";
import { eq, or, asc } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

const CreateRelationBody = z.object({
  sourceEntityId: z.number(),
  targetEntityId: z.number(),
  relationType: z.enum(["one_to_one", "one_to_many", "many_to_many", "inline_child"]),
  sourceFieldSlug: z.string().optional(),
  targetFieldSlug: z.string().optional(),
  label: z.string().min(1),
  reverseLabel: z.string().optional(),
  cascadeDelete: z.boolean().optional(),
  sortOrder: z.number().optional(),
  settings: z.record(z.string(), z.any()).optional(),
});

const UpdateRelationBody = CreateRelationBody.partial();

router.get("/platform/entities/:entityId/relations", async (req, res) => {
  try {
    const entityId = Number(req.params.entityId);
    const relations = await db.select().from(entityRelationsTable)
      .where(or(eq(entityRelationsTable.sourceEntityId, entityId), eq(entityRelationsTable.targetEntityId, entityId)))
      .orderBy(asc(entityRelationsTable.sortOrder));
    res.json(relations);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/entities/:entityId/relations", async (req, res) => {
  try {
    const entityId = Number(req.params.entityId);
    const body = CreateRelationBody.parse(req.body);
    const values = {
      ...body,
      sourceEntityId: body.sourceEntityId ?? entityId,
    };
    const [rel] = await db.insert(entityRelationsTable).values(values).returning();
    res.status(201).json(rel);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/relations/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = UpdateRelationBody.parse(req.body);
    const [rel] = await db.update(entityRelationsTable).set(body).where(eq(entityRelationsTable.id, id)).returning();
    if (!rel) return res.status(404).json({ message: "Relation not found" });
    res.json(rel);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.delete("/platform/relations/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(entityRelationsTable).where(eq(entityRelationsTable.id, id));
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
