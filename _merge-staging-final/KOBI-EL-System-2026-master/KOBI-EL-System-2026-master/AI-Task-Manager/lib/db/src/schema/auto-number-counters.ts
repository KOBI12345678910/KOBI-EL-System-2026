import { pgTable, serial, text, integer, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { moduleEntitiesTable } from "./module-entities";

export const autoNumberCountersTable = pgTable("auto_number_counters", {
  id: serial("id").primaryKey(),
  entityId: integer("entity_id").notNull().references(() => moduleEntitiesTable.id, { onDelete: "cascade" }),
  fieldSlug: text("field_slug").notNull(),
  prefix: text("prefix").notNull().default(""),
  suffix: text("suffix").notNull().default(""),
  padding: integer("padding").notNull().default(4),
  currentValue: integer("current_value").notNull().default(0),
  startValue: integer("start_value").notNull().default(1),
  incrementBy: integer("increment_by").notNull().default(1),
  settings: jsonb("settings").default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("auto_number_counters_entity_field_unique").on(table.entityId, table.fieldSlug),
]);
