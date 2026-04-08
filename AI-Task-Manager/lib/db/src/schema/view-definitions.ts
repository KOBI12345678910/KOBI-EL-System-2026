import { pgTable, serial, text, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { moduleEntitiesTable } from "./module-entities";

export const viewDefinitionsTable = pgTable("view_definitions", {
  id: serial("id").primaryKey(),
  entityId: integer("entity_id").notNull().references(() => moduleEntitiesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  viewType: text("view_type").notNull().default("table"),
  isDefault: boolean("is_default").notNull().default(false),
  columns: jsonb("columns").default([]),
  filters: jsonb("filters").default([]),
  sorting: jsonb("sorting").default([]),
  grouping: jsonb("grouping").default({}),
  settings: jsonb("settings").default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
