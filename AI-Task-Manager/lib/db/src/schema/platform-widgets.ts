import { pgTable, serial, text, integer, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
import { platformModulesTable } from "./platform-modules";

export const platformWidgetsTable = pgTable("platform_widgets", {
  id: serial("id").primaryKey(),
  moduleId: integer("module_id").notNull().references(() => platformModulesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  widgetType: text("widget_type").notNull().default("count"),
  entityId: integer("entity_id"),
  config: jsonb("config").notNull().default({}),
  position: integer("position").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
