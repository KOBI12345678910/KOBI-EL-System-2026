import { pgTable, serial, text, integer, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { aiModelsTable } from "./ai-models";

export const aiRecommendationsTable = pgTable("ai_recommendations", {
  id: serial("id").primaryKey(),
  modelId: integer("model_id").references(() => aiModelsTable.id),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category").notNull(),
  confidence: numeric("confidence", { precision: 5, scale: 2 }),
  status: text("status").notNull().default("pending"),
  isApplied: boolean("is_applied").notNull().default(false),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAiRecommendationSchema = createInsertSchema(aiRecommendationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAiRecommendation = z.infer<typeof insertAiRecommendationSchema>;
export type AiRecommendation = typeof aiRecommendationsTable.$inferSelect;
