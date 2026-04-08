import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const claudeConnectionTestsTable = pgTable("claude_connection_tests", {
  id: serial("id").primaryKey(),
  status: text("status").notNull(),
  model: text("model").notNull(),
  responseTimeMs: integer("response_time_ms"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  responseSummary: text("response_summary"),
  errorMessage: text("error_message"),
  errorCode: text("error_code"),
  testedAt: timestamp("tested_at").notNull().defaultNow(),
});

export const insertClaudeConnectionTestSchema = createInsertSchema(claudeConnectionTestsTable).omit({ id: true, testedAt: true });
export type InsertClaudeConnectionTest = z.infer<typeof insertClaudeConnectionTestSchema>;
export type ClaudeConnectionTest = typeof claudeConnectionTestsTable.$inferSelect;
