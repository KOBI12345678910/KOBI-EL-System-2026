import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { aiModelsTable } from "./ai-models";

export const aiQueriesTable = pgTable("ai_queries", {
  id: serial("id").primaryKey(),
  modelId: integer("model_id").notNull().references(() => aiModelsTable.id),
  prompt: text("prompt").notNull(),
  systemPrompt: text("system_prompt"),
  parameters: text("parameters"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAiQuerySchema = createInsertSchema(aiQueriesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAiQuery = z.infer<typeof insertAiQuerySchema>;
export type AiQuery = typeof aiQueriesTable.$inferSelect;
