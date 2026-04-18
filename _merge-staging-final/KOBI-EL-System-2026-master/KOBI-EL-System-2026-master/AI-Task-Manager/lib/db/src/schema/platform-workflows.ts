import { pgTable, serial, text, integer, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
import { platformModulesTable } from "./platform-modules";

export const platformWorkflowsTable = pgTable("platform_workflows", {
  id: serial("id").primaryKey(),
  moduleId: integer("module_id").notNull().references(() => platformModulesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description"),
  triggerType: text("trigger_type").notNull().default("on_create"),
  triggerConfig: jsonb("trigger_config").notNull().default({}),
  actions: jsonb("actions").notNull().default([]),
  conditions: jsonb("conditions").notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
