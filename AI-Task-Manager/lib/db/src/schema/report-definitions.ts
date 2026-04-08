import { pgTable, serial, text, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";

export const reportDefinitionsTable = pgTable("report_definitions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description"),
  entityId: integer("entity_id"),
  queryConfig: jsonb("query_config").notNull().default({}),
  columns: jsonb("columns").notNull().default([]),
  aggregations: jsonb("aggregations").notNull().default([]),
  grouping: jsonb("grouping").notNull().default([]),
  filters: jsonb("filters").notNull().default([]),
  sorting: jsonb("sorting").notNull().default([]),
  calculatedFields: jsonb("calculated_fields").notNull().default([]),
  displayType: text("display_type").notNull().default("table"),
  chartConfig: jsonb("chart_config").notNull().default({}),
  scheduleConfig: jsonb("schedule_config").default(null),
  scheduleEmail: text("schedule_email"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
