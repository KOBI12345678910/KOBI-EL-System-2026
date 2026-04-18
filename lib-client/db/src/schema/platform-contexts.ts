import { pgTable, serial, text, integer, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
import { platformModulesTable } from "./platform-modules";
import { moduleEntitiesTable } from "./module-entities";

export const platformContextsTable = pgTable("platform_contexts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description"),
  contextType: text("context_type").notNull().default("conditional"),
  conditions: jsonb("conditions").notNull().default([]),
  effects: jsonb("effects").notNull().default({}),
  entityId: integer("entity_id").references(() => moduleEntitiesTable.id, { onDelete: "set null" }),
  moduleId: integer("module_id").references(() => platformModulesTable.id, { onDelete: "set null" }),
  priority: integer("priority").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const contextEvaluationLogsTable = pgTable("context_evaluation_logs", {
  id: serial("id").primaryKey(),
  contextId: integer("context_id").references(() => platformContextsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id"),
  entityId: integer("entity_id"),
  recordId: integer("record_id"),
  conditionsSnapshot: jsonb("conditions_snapshot").notNull().default({}),
  effectsApplied: jsonb("effects_applied").notNull().default({}),
  matched: boolean("matched").notNull().default(false),
  evaluationTimeMs: integer("evaluation_time_ms"),
  evaluatedAt: timestamp("evaluated_at").notNull().defaultNow(),
});
