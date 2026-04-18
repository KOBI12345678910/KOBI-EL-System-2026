import { pgTable, serial, text, numeric, timestamp, date, jsonb } from "drizzle-orm/pg-core";

export const strategicGoalsTable = pgTable("strategic_goals", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category"),
  owner: text("owner"),
  status: text("status").notNull().default("draft"),
  targetDate: date("target_date"),
  progressPct: numeric("progress_pct", { precision: 5, scale: 2 }).default("0"),
  keyResults: jsonb("key_results"),
  linkedDepartment: text("linked_department"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
