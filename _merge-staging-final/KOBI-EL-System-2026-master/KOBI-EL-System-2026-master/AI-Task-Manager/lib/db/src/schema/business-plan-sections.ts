import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const businessPlanSectionsTable = pgTable("business_plan_sections", {
  id: serial("id").primaryKey(),
  planName: text("plan_name").notNull(),
  version: text("version").default("1.0"),
  sectionType: text("section_type").notNull(),
  title: text("title").notNull(),
  content: text("content"),
  order: integer("order").default(0),
  status: text("status").default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
