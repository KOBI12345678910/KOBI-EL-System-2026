import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { aiRecommendationsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { ListAiRecommendationsQueryParams, CreateAiRecommendationBody, UpdateAiRecommendationBody, UpdateAiRecommendationParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/ai-recommendations", async (req, res) => {
  const { category, status, limit, offset } = ListAiRecommendationsQueryParams.parse(req.query);
  let query = db.select().from(aiRecommendationsTable).orderBy(desc(aiRecommendationsTable.createdAt));
  if (category) {
    query = query.where(eq(aiRecommendationsTable.category, category)) as any;
  }
  if (status) {
    query = query.where(eq(aiRecommendationsTable.status, status)) as any;
  }
  const recommendations = await query.limit(limit ?? 50).offset(offset ?? 0);
  res.json(recommendations);
});

router.post("/ai-recommendations", async (req, res) => {
  const body = CreateAiRecommendationBody.parse(req.body);
  const [rec] = await db.insert(aiRecommendationsTable).values(body).returning();
  res.status(201).json(rec);
});

router.put("/ai-recommendations/:id", async (req, res) => {
  const { id } = UpdateAiRecommendationParams.parse(req.params);
  const body = UpdateAiRecommendationBody.partial().parse(req.body);
  const [rec] = await db.update(aiRecommendationsTable).set({ ...body, updatedAt: new Date() }).where(eq(aiRecommendationsTable.id, id)).returning();
  if (!rec) return res.status(404).json({ message: "Not found" });
  res.json(rec);
});

export default router;
