import { pgTable, serial, text, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { moduleEntitiesTable } from "./module-entities";

export const entityRelationsTable = pgTable("entity_relations", {
  id: serial("id").primaryKey(),
  sourceEntityId: integer("source_entity_id").notNull().references(() => moduleEntitiesTable.id, { onDelete: "cascade" }),
  targetEntityId: integer("target_entity_id").notNull().references(() => moduleEntitiesTable.id, { onDelete: "cascade" }),
  relationType: text("relation_type").notNull(),
  sourceFieldSlug: text("source_field_slug"),
  targetFieldSlug: text("target_field_slug"),
  label: text("label").notNull(),
  reverseLabel: text("reverse_label"),
  cascadeDelete: boolean("cascade_delete").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  settings: jsonb("settings").default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
