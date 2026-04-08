import { pgTable, serial, text, numeric, timestamp, integer, date } from "drizzle-orm/pg-core";

export const projectChangeOrdersTable = pgTable("project_change_orders", {
  id: serial("id").primaryKey(),
  changeNumber: text("change_number"),
  projectId: integer("project_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  reason: text("reason"),
  scopeImpact: text("scope_impact"),
  scheduleImpact: integer("schedule_impact").default(0),
  costImpact: numeric("cost_impact", { precision: 12, scale: 2 }).default("0"),
  status: text("status").notNull().default("draft"),
  requestedBy: text("requested_by"),
  approvedBy: text("approved_by"),
  approvalDate: date("approval_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
