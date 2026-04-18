import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { aiResponsesTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { ListAiResponsesQueryParams, CreateAiResponseBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/ai-responses", async (req, res) => {
  const { queryId, limit, offset } = ListAiResponsesQueryParams.parse(req.query);
  let query = db.select().from(aiResponsesTable).orderBy(desc(aiResponsesTable.createdAt));
  if (queryId) {
    query = query.where(eq(aiResponsesTable.queryId, queryId)) as any;
  }
  const responses = await query.limit(limit ?? 50).offset(offset ?? 0);
  res.json(responses);
});

router.post("/ai-responses", async (req, res) => {
  const body = CreateAiResponseBody.parse(req.body);
  const [response] = await db.insert(aiResponsesTable).values(body).returning();
  res.status(201).json(response);
});

export default router;
