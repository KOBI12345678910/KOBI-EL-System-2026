import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const claudeAuditLogsTable = pgTable("claude_audit_logs", {
  id: serial("id").primaryKey(),
  actionType: text("action_type").notNull(),
  caller: text("caller"),
  targetApi: text("target_api").notNull(),
  httpMethod: text("http_method").notNull(),
  httpPath: text("http_path").notNull(),
  inputSummary: text("input_summary"),
  outputSummary: text("output_summary"),
  status: text("status").notNull(),
  statusCode: integer("status_code"),
  responseTimeMs: integer("response_time_ms"),
  sessionId: integer("session_id"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertClaudeAuditLogSchema = createInsertSchema(claudeAuditLogsTable).omit({ id: true, createdAt: true });
export type InsertClaudeAuditLog = z.infer<typeof insertClaudeAuditLogSchema>;
export type ClaudeAuditLog = typeof claudeAuditLogsTable.$inferSelect;
