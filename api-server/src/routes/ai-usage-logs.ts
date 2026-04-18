import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { aiUsageLogsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { ListAiUsageLogsQueryParams, CreateAiUsageLogBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/ai-usage-logs", async (req, res) => {
  const { modelId, limit, offset } = ListAiUsageLogsQueryParams.parse(req.query);
  let query = db.select().from(aiUsageLogsTable).orderBy(desc(aiUsageLogsTable.createdAt));
  if (modelId) {
    query = query.where(eq(aiUsageLogsTable.modelId, modelId)) as any;
  }
  const logs = await query.limit(limit ?? 50).offset(offset ?? 0);
  res.json(logs);
});

router.post("/ai-usage-logs", async (req, res) => {
  const body = CreateAiUsageLogBody.parse(req.body);
  const [log] = await db.insert(aiUsageLogsTable).values(body).returning();
  res.status(201).json(log);
});

export default router;
