import { pgTable, serial, text, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { moduleEntitiesTable } from "./module-entities";

export const formDefinitionsTable = pgTable("form_definitions", {
  id: serial("id").primaryKey(),
  entityId: integer("entity_id").notNull().references(() => moduleEntitiesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  formType: text("form_type").notNull().default("create"),
  sections: jsonb("sections").default([]),
  settings: jsonb("settings").default({}),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
