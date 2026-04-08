import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { aiPromptTemplatesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { ListAiPromptTemplatesQueryParams, CreateAiPromptTemplateBody, UpdateAiPromptTemplateBody, GetAiPromptTemplateParams, DeleteAiPromptTemplateParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/ai-prompt-templates", async (req, res) => {
  const { category, isActive } = ListAiPromptTemplatesQueryParams.parse(req.query);
  let query = db.select().from(aiPromptTemplatesTable);
  if (category) {
    query = query.where(eq(aiPromptTemplatesTable.category, category)) as any;
  }
  if (isActive !== undefined) {
    query = query.where(eq(aiPromptTemplatesTable.isActive, isActive)) as any;
  }
  const templates = await query;
  res.json(templates);
});

router.post("/ai-prompt-templates", async (req, res) => {
  const body = CreateAiPromptTemplateBody.parse(req.body);
  const [template] = await db.insert(aiPromptTemplatesTable).values(body).returning();
  res.status(201).json(template);
});

router.get("/ai-prompt-templates/:id", async (req, res) => {
  const { id } = GetAiPromptTemplateParams.parse(req.params);
  const [template] = await db.select().from(aiPromptTemplatesTable).where(eq(aiPromptTemplatesTable.id, id));
  if (!template) return res.status(404).json({ message: "Not found" });
  res.json(template);
});

router.put("/ai-prompt-templates/:id", async (req, res) => {
  const { id } = GetAiPromptTemplateParams.parse(req.params);
  const body = UpdateAiPromptTemplateBody.partial().parse(req.body);
  const [template] = await db.update(aiPromptTemplatesTable).set({ ...body, updatedAt: new Date() }).where(eq(aiPromptTemplatesTable.id, id)).returning();
  if (!template) return res.status(404).json({ message: "Not found" });
  res.json(template);
});

router.delete("/ai-prompt-templates/:id", async (req, res) => {
  const { id } = DeleteAiPromptTemplateParams.parse(req.params);
  await db.delete(aiPromptTemplatesTable).where(eq(aiPromptTemplatesTable.id, id));
  res.status(204).send();
});

export default router;
