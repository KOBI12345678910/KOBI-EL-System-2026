import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { aiApiKeysTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { CreateAiApiKeyBody, UpdateAiApiKeyBody, GetAiApiKeyParams, DeleteAiApiKeyParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/ai-api-keys", async (_req, res) => {
  const keys = await db.select().from(aiApiKeysTable);
  res.json(keys);
});

router.post("/ai-api-keys", async (req, res) => {
  const body = CreateAiApiKeyBody.parse(req.body);
  const [key] = await db.insert(aiApiKeysTable).values(body).returning();
  res.status(201).json(key);
});

router.get("/ai-api-keys/:id", async (req, res) => {
  const { id } = GetAiApiKeyParams.parse(req.params);
  const [key] = await db.select().from(aiApiKeysTable).where(eq(aiApiKeysTable.id, id));
  if (!key) return res.status(404).json({ message: "Not found" });
  res.json(key);
});

router.put("/ai-api-keys/:id", async (req, res) => {
  const { id } = GetAiApiKeyParams.parse(req.params);
  const body = UpdateAiApiKeyBody.partial().parse(req.body);
  const [key] = await db.update(aiApiKeysTable).set({ ...body, updatedAt: new Date() }).where(eq(aiApiKeysTable.id, id)).returning();
  if (!key) return res.status(404).json({ message: "Not found" });
  res.json(key);
});

router.delete("/ai-api-keys/:id", async (req, res) => {
  const { id } = DeleteAiApiKeyParams.parse(req.params);
  await db.delete(aiApiKeysTable).where(eq(aiApiKeysTable.id, id));
  res.status(204).send();
});

export default router;
