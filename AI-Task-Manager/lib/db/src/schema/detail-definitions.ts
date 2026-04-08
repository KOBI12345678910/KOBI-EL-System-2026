import { pgTable, serial, text, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { moduleEntitiesTable } from "./module-entities";

export const detailDefinitionsTable = pgTable("detail_definitions", {
  id: serial("id").primaryKey(),
  entityId: integer("entity_id").notNull().references(() => moduleEntitiesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  sections: jsonb("sections").default([]),
  headerFields: jsonb("header_fields").default([]),
  tabs: jsonb("tabs").default([]),
  relatedLists: jsonb("related_lists").default([]),
  actionBar: jsonb("action_bar").default([]),
  settings: jsonb("settings").default({}),
  isDefault: boolean("is_default").notNull().default(false),
  showRelatedRecords: boolean("show_related_records").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
