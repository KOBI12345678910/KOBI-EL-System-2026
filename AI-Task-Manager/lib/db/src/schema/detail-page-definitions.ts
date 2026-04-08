import { pgTable, serial, text, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { moduleEntitiesTable } from "./module-entities";

export const detailPageDefinitionsTable = pgTable("detail_page_definitions", {
  id: serial("id").primaryKey(),
  entityId: integer("entity_id").notNull().references(() => moduleEntitiesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  headerFields: jsonb("header_fields").default([]),
  tabs: jsonb("tabs").default([]),
  relatedLists: jsonb("related_lists").default([]),
  actionBar: jsonb("action_bar").default([]),
  sections: jsonb("sections").default([]),
  settings: jsonb("settings").default({}),
  isDefault: boolean("is_default").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
