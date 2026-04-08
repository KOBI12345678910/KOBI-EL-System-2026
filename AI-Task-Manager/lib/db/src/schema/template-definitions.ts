import { pgTable, serial, text, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";

export const templateDefinitionsTable = pgTable("template_definitions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description"),
  entityId: integer("entity_id"),
  category: text("category").notNull().default("general"),
  templateContent: text("template_content").notNull().default(""),
  variables: jsonb("variables").notNull().default([]),
  styles: jsonb("styles").notNull().default({}),
  settings: jsonb("settings").notNull().default({}),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
