import { pgTable, serial, text, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { moduleEntitiesTable } from "./module-entities";

export const categoryItemsTable = pgTable("category_items", {
  id: serial("id").primaryKey(),
  entityId: integer("entity_id").notNull().references(() => moduleEntitiesTable.id, { onDelete: "cascade" }),
  categoryDefId: integer("category_def_id"),
  parentId: integer("parent_id"),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  icon: text("icon"),
  color: text("color"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  settings: jsonb("settings").default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
