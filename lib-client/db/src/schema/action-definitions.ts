import { pgTable, serial, text, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { moduleEntitiesTable } from "./module-entities";

export const actionDefinitionsTable = pgTable("action_definitions", {
  id: serial("id").primaryKey(),
  entityId: integer("entity_id").notNull().references(() => moduleEntitiesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  actionType: text("action_type").notNull(),
  handlerType: text("handler_type").notNull(),
  icon: text("icon"),
  color: text("color"),
  conditions: jsonb("conditions").default({}),
  handlerConfig: jsonb("handler_config").default({}),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
