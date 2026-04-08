import { pgTable, serial, text, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";

export const menuDefinitionsTable = pgTable("menu_definitions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  nameHe: text("name_he"),
  nameEn: text("name_en"),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  isDefault: boolean("is_default").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  settings: jsonb("settings").default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
