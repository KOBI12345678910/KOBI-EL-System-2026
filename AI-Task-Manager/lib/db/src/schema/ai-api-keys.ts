import { pgTable, serial, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { aiProvidersTable } from "./ai-providers";

export const aiApiKeysTable = pgTable("ai_api_keys", {
  id: serial("id").primaryKey(),
  providerId: integer("provider_id").notNull().references(() => aiProvidersTable.id),
  keyName: text("key_name").notNull(),
  apiKey: text("api_key").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  lastUsedAt: timestamp("last_used_at"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAiApiKeySchema = createInsertSchema(aiApiKeysTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAiApiKey = z.infer<typeof insertAiApiKeySchema>;
export type AiApiKey = typeof aiApiKeysTable.$inferSelect;
