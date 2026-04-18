import { pgTable, serial, text, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { aiModelsTable } from "./ai-models";
import { aiApiKeysTable } from "./ai-api-keys";

export const aiUsageLogsTable = pgTable("ai_usage_logs", {
  id: serial("id").primaryKey(),
  modelId: integer("model_id").notNull().references(() => aiModelsTable.id),
  apiKeyId: integer("api_key_id").references(() => aiApiKeysTable.id),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  totalTokens: integer("total_tokens"),
  cost: numeric("cost", { precision: 12, scale: 8 }),
  responseTimeMs: integer("response_time_ms"),
  statusCode: integer("status_code"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAiUsageLogSchema = createInsertSchema(aiUsageLogsTable).omit({ id: true, createdAt: true });
export type InsertAiUsageLog = z.infer<typeof insertAiUsageLogSchema>;
export type AiUsageLog = typeof aiUsageLogsTable.$inferSelect;
