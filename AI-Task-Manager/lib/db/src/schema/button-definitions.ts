import { pgTable, serial, text, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { moduleEntitiesTable } from "./module-entities";

export const buttonDefinitionsTable = pgTable("button_definitions", {
  id: serial("id").primaryKey(),
  entityId: integer("entity_id").notNull().references(() => moduleEntitiesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  placement: text("placement").notNull().default("toolbar"),
  style: text("style").default("primary"),
  icon: text("icon"),
  color: text("color"),
  actionId: integer("action_id"),
  actionType: text("action_type"),
  actionConfig: jsonb("action_config").default({}),
  conditions: jsonb("conditions").default({}),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
