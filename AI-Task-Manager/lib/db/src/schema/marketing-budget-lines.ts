import { pgTable, serial, text, numeric, timestamp, integer } from "drizzle-orm/pg-core";

export const marketingBudgetLinesTable = pgTable("marketing_budget_lines", {
  id: serial("id").primaryKey(),
  period: text("period").notNull(),
  category: text("category").notNull(),
  channel: text("channel"),
  plannedAmount: numeric("planned_amount", { precision: 15, scale: 2 }).default("0"),
  actualAmount: numeric("actual_amount", { precision: 15, scale: 2 }).default("0"),
  campaignId: integer("campaign_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
