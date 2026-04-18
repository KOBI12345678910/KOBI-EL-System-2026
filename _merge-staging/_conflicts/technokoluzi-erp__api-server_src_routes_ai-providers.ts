import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { aiProvidersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { CreateAiProviderBody, UpdateAiProviderBody, GetAiProviderParams, DeleteAiProviderParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/ai-providers", async (_req, res) => {
  const providers = await db.select().from(aiProvidersTable);
  res.json(providers);
});

router.post("/ai-providers", async (req, res) => {
  const body = CreateAiProviderBody.parse(req.body);
  const [provider] = await db.insert(aiProvidersTable).values(body).returning();
  res.status(201).json(provider);
});

router.get("/ai-providers/:id", async (req, res) => {
  const { id } = GetAiProviderParams.parse(req.params);
  const [provider] = await db.select().from(aiProvidersTable).where(eq(aiProvidersTable.id, id));
  if (!provider) return res.status(404).json({ message: "Not found" });
  res.json(provider);
});

router.put("/ai-providers/:id", async (req, res) => {
  const { id } = GetAiProviderParams.parse(req.params);
  const body = UpdateAiProviderBody.partial().parse(req.body);
  const [provider] = await db.update(aiProvidersTable).set({ ...body, updatedAt: new Date() }).where(eq(aiProvidersTable.id, id)).returning();
  if (!provider) return res.status(404).json({ message: "Not found" });
  res.json(provider);
});

router.delete("/ai-providers/:id", async (req, res) => {
  const { id } = DeleteAiProviderParams.parse(req.params);
  await db.delete(aiProvidersTable).where(eq(aiProvidersTable.id, id));
  res.status(204).send();
});

export default router;
