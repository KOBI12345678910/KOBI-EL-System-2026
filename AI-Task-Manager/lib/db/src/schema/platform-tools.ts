import { pgTable, serial, text, integer, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
import { platformModulesTable } from "./platform-modules";

export const platformToolsTable = pgTable("platform_tools", {
  id: serial("id").primaryKey(),
  moduleId: integer("module_id").references(() => platformModulesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  toolType: text("tool_type").notNull().default("custom"),
  entityId: integer("entity_id"),
  inputConfig: jsonb("input_config").notNull().default({}),
  outputConfig: jsonb("output_config").notNull().default({}),
  executionConfig: jsonb("execution_config").notNull().default({}),
  isActive: boolean("is_active").notNull().default(true),
  lastRunAt: timestamp("last_run_at"),
  runCount: integer("run_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const toolExecutionLogsTable = pgTable("tool_execution_logs", {
  id: serial("id").primaryKey(),
  toolId: integer("tool_id").notNull().references(() => platformToolsTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("running"),
  inputData: jsonb("input_data").default({}),
  outputData: jsonb("output_data").default({}),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});
