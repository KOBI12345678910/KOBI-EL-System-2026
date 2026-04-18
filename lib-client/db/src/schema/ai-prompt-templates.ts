import { pgTable, serial, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { aiModelsTable } from "./ai-models";

export const aiPromptTemplatesTable = pgTable("ai_prompt_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  category: text("category").notNull(),
  promptTemplate: text("prompt_template").notNull(),
  systemPrompt: text("system_prompt"),
  defaultModelId: integer("default_model_id").references(() => aiModelsTable.id),
  variables: text("variables"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAiPromptTemplateSchema = createInsertSchema(aiPromptTemplatesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAiPromptTemplate = z.infer<typeof insertAiPromptTemplateSchema>;
export type AiPromptTemplate = typeof aiPromptTemplatesTable.$inferSelect;
