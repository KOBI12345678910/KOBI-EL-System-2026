import { pgTable, serial, text, numeric, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

export const serverHealthLogsTable = pgTable("server_health_logs", {
  id: serial("id").primaryKey(),
  checkType: text("check_type").notNull(),
  status: text("status").notNull(),
  value: numeric("value"),
  threshold: numeric("threshold"),
  details: jsonb("details"),
  responseTimeMs: integer("response_time_ms"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ServerHealthLog = typeof serverHealthLogsTable.$inferSelect;
export type InsertServerHealthLog = typeof serverHealthLogsTable.$inferInsert;
