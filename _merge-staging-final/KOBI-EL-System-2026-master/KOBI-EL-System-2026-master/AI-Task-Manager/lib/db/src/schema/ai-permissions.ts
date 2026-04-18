import { pgTable, serial, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { aiModelsTable } from "./ai-models";

export const aiPermissionsTable = pgTable("ai_permissions", {
  id: serial("id").primaryKey(),
  role: text("role").notNull(),
  modelId: integer("model_id").references(() => aiModelsTable.id),
  canQuery: boolean("can_query").notNull().default(false),
  canManageKeys: boolean("can_manage_keys").notNull().default(false),
  canViewLogs: boolean("can_view_logs").notNull().default(false),
  canManageModels: boolean("can_manage_models").notNull().default(false),
  canManageProviders: boolean("can_manage_providers").notNull().default(false),
  maxQueriesPerDay: integer("max_queries_per_day"),
  maxTokensPerDay: integer("max_tokens_per_day"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAiPermissionSchema = createInsertSchema(aiPermissionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAiPermission = z.infer<typeof insertAiPermissionSchema>;
export type AiPermission = typeof aiPermissionsTable.$inferSelect;
