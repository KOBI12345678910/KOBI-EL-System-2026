import { pgTable, serial, text, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { moduleEntitiesTable } from "./module-entities";

export const entityStatusesTable = pgTable("entity_statuses", {
  id: serial("id").primaryKey(),
  entityId: integer("entity_id").notNull().references(() => moduleEntitiesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  color: text("color").notNull().default("gray"),
  icon: text("icon"),
  sortOrder: integer("sort_order").notNull().default(0),
  isDefault: boolean("is_default").notNull().default(false),
  isFinal: boolean("is_final").notNull().default(false),
  settings: jsonb("settings").default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const statusTransitionsTable = pgTable("status_transitions", {
  id: serial("id").primaryKey(),
  entityId: integer("entity_id").notNull().references(() => moduleEntitiesTable.id, { onDelete: "cascade" }),
  fromStatusId: integer("from_status_id").references(() => entityStatusesTable.id, { onDelete: "cascade" }),
  toStatusId: integer("to_status_id").notNull().references(() => entityStatusesTable.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  icon: text("icon"),
  conditions: jsonb("conditions").default({}),
  settings: jsonb("settings").default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
