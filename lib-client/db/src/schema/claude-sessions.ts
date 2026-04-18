import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const claudeSessionsTable = pgTable("claude_sessions", {
  id: serial("id").primaryKey(),
  model: text("model").notNull(),
  status: text("status").notNull().default("active"),
  totalInputTokens: integer("total_input_tokens").notNull().default(0),
  totalOutputTokens: integer("total_output_tokens").notNull().default(0),
  messageCount: integer("message_count").notNull().default(0),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  endedAt: timestamp("ended_at"),
});

export const insertClaudeSessionSchema = createInsertSchema(claudeSessionsTable).omit({ id: true, createdAt: true, updatedAt: true, endedAt: true });
export type InsertClaudeSession = z.infer<typeof insertClaudeSessionSchema>;
export type ClaudeSession = typeof claudeSessionsTable.$inferSelect;
