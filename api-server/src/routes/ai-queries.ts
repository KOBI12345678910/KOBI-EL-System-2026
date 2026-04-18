import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { aiQueriesTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { ListAiQueriesQueryParams, CreateAiQueryBody, GetAiQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/ai-queries", async (req, res) => {
  const { modelId, status, limit, offset } = ListAiQueriesQueryParams.parse(req.query);
  let query = db.select().from(aiQueriesTable).orderBy(desc(aiQueriesTable.createdAt));
  if (modelId) {
    query = query.where(eq(aiQueriesTable.modelId, modelId)) as any;
  }
  if (status) {
    query = query.where(eq(aiQueriesTable.status, status)) as any;
  }
  const queries = await query.limit(limit ?? 50).offset(offset ?? 0);
  res.json(queries);
});

router.post("/ai-queries", async (req, res) => {
  const body = CreateAiQueryBody.parse(req.body);
  const [aiQuery] = await db.insert(aiQueriesTable).values(body).returning();
  res.status(201).json(aiQuery);
});

router.get("/ai-queries/:id", async (req, res) => {
  const { id } = GetAiQueryParams.parse(req.params);
  const [aiQuery] = await db.select().from(aiQueriesTable).where(eq(aiQueriesTable.id, id));
  if (!aiQuery) return res.status(404).json({ message: "Not found" });
  res.json(aiQuery);
});

export default router;
