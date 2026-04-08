import { pgTable, serial, text, integer, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
import { platformModulesTable } from "./platform-modules";
import { platformWorkflowsTable } from "./platform-workflows";

export const platformAutomationsTable = pgTable("platform_automations", {
  id: serial("id").primaryKey(),
  moduleId: integer("module_id").notNull().references(() => platformModulesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description"),
  triggerType: text("trigger_type").notNull().default("on_create"),
  triggerEntityId: integer("trigger_entity_id"),
  triggerConfig: jsonb("trigger_config").notNull().default({}),
  conditions: jsonb("conditions").notNull().default([]),
  actions: jsonb("actions").notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  lastRunAt: timestamp("last_run_at"),
  runCount: integer("run_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const automationExecutionLogsTable = pgTable("automation_execution_logs", {
  id: serial("id").primaryKey(),
  automationId: integer("automation_id").references(() => platformAutomationsTable.id, { onDelete: "cascade" }),
  workflowId: integer("workflow_id").references(() => platformWorkflowsTable.id, { onDelete: "cascade" }),
  executionType: text("execution_type").notNull().default("automation"),
  entityId: integer("entity_id"),
  triggerEvent: text("trigger_event").notNull(),
  triggerRecordId: integer("trigger_record_id"),
  status: text("status").notNull().default("running"),
  stepsExecuted: jsonb("steps_executed").notNull().default([]),
  result: jsonb("result").default({}),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});
