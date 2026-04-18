import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { aiQueriesTable } from "./ai-queries";

export const aiResponsesTable = pgTable("ai_responses", {
  id: serial("id").primaryKey(),
  queryId: integer("query_id").notNull().references(() => aiQueriesTable.id),
  content: text("content").notNull(),
  finishReason: text("finish_reason"),
  tokensUsed: integer("tokens_used"),
  responseTimeMs: integer("response_time_ms"),
  rating: integer("rating"),
  feedback: text("feedback"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAiResponseSchema = createInsertSchema(aiResponsesTable).omit({ id: true, createdAt: true });
export type InsertAiResponse = z.infer<typeof insertAiResponseSchema>;
export type AiResponse = typeof aiResponsesTable.$inferSelect;
