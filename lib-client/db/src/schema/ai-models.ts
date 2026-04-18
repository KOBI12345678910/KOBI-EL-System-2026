import { pgTable, serial, text, boolean, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { aiProvidersTable } from "./ai-providers";

export const aiModelsTable = pgTable("ai_models", {
  id: serial("id").primaryKey(),
  providerId: integer("provider_id").notNull().references(() => aiProvidersTable.id),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  modelType: text("model_type").notNull(),
  maxTokens: integer("max_tokens"),
  costPerInputToken: numeric("cost_per_input_token", { precision: 12, scale: 8 }),
  costPerOutputToken: numeric("cost_per_output_token", { precision: 12, scale: 8 }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAiModelSchema = createInsertSchema(aiModelsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAiModel = z.infer<typeof insertAiModelSchema>;
export type AiModel = typeof aiModelsTable.$inferSelect;
