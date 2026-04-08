import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { platformModulesTable } from "./platform-modules";

export const moduleVersionsTable = pgTable("module_versions", {
  id: serial("id").primaryKey(),
  moduleId: integer("module_id").notNull().references(() => platformModulesTable.id, { onDelete: "cascade" }),
  versionNumber: integer("version_number").notNull(),
  label: text("label"),
  notes: text("notes"),
  snapshot: jsonb("snapshot").notNull().default({}),
  publishedBy: text("published_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const versionChangesTable = pgTable("version_changes", {
  id: serial("id").primaryKey(),
  moduleVersionId: integer("module_version_id").notNull().references(() => moduleVersionsTable.id, { onDelete: "cascade" }),
  changeType: text("change_type").notNull(),
  objectType: text("object_type").notNull(),
  objectId: integer("object_id"),
  objectName: text("object_name"),
  field: text("field"),
  oldValue: jsonb("old_value"),
  newValue: jsonb("new_value"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
