import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { aiModelsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { CreateAiModelBody, UpdateAiModelBody, GetAiModelParams, DeleteAiModelParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/ai-models", async (_req, res) => {
  const models = await db.select().from(aiModelsTable);
  res.json(models);
});

router.post("/ai-models", async (req, res) => {
  const body = CreateAiModelBody.parse(req.body);
  const [model] = await db.insert(aiModelsTable).values(body).returning();
  res.status(201).json(model);
});

router.get("/ai-models/:id", async (req, res) => {
  const { id } = GetAiModelParams.parse(req.params);
  const [model] = await db.select().from(aiModelsTable).where(eq(aiModelsTable.id, id));
  if (!model) return res.status(404).json({ message: "Not found" });
  res.json(model);
});

router.put("/ai-models/:id", async (req, res) => {
  const { id } = GetAiModelParams.parse(req.params);
  const body = UpdateAiModelBody.partial().parse(req.body);
  const [model] = await db.update(aiModelsTable).set({ ...body, updatedAt: new Date() }).where(eq(aiModelsTable.id, id)).returning();
  if (!model) return res.status(404).json({ message: "Not found" });
  res.json(model);
});

router.delete("/ai-models/:id", async (req, res) => {
  const { id } = DeleteAiModelParams.parse(req.params);
  await db.delete(aiModelsTable).where(eq(aiModelsTable.id, id));
  res.status(204).send();
});

export default router;
