import { pgTable, serial, text, integer, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
import { platformWorkflowsTable } from "./platform-workflows";
import { moduleEntitiesTable } from "./module-entities";

export const workflowStepsTable = pgTable("workflow_steps", {
  id: serial("id").primaryKey(),
  workflowId: integer("workflow_id").notNull().references(() => platformWorkflowsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  stepType: text("step_type").notNull().default("action"),
  description: text("description"),
  config: jsonb("config").notNull().default({}),
  sortOrder: integer("sort_order").notNull().default(0),
  isStart: boolean("is_start").notNull().default(false),
  isEnd: boolean("is_end").notNull().default(false),
  requiredRole: text("required_role"),
  assigneeField: text("assignee_field"),
  timeoutMinutes: integer("timeout_minutes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const workflowTransitionsTable = pgTable("workflow_transitions", {
  id: serial("id").primaryKey(),
  workflowId: integer("workflow_id").notNull().references(() => platformWorkflowsTable.id, { onDelete: "cascade" }),
  fromStepId: integer("from_step_id").notNull().references(() => workflowStepsTable.id, { onDelete: "cascade" }),
  toStepId: integer("to_step_id").notNull().references(() => workflowStepsTable.id, { onDelete: "cascade" }),
  name: text("name"),
  conditions: jsonb("conditions").notNull().default([]),
  actionLabel: text("action_label"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const workflowInstancesTable = pgTable("workflow_instances", {
  id: serial("id").primaryKey(),
  workflowId: integer("workflow_id").notNull().references(() => platformWorkflowsTable.id, { onDelete: "cascade" }),
  entityId: integer("entity_id").references(() => moduleEntitiesTable.id),
  recordId: integer("record_id"),
  currentStepId: integer("current_step_id").references(() => workflowStepsTable.id),
  status: text("status").notNull().default("active"),
  startedBy: text("started_by"),
  context: jsonb("context").notNull().default({}),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const workflowStepLogsTable = pgTable("workflow_step_logs", {
  id: serial("id").primaryKey(),
  instanceId: integer("instance_id").notNull().references(() => workflowInstancesTable.id, { onDelete: "cascade" }),
  stepId: integer("step_id").notNull().references(() => workflowStepsTable.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  performedBy: text("performed_by"),
  status: text("status").notNull().default("completed"),
  comments: text("comments"),
  data: jsonb("data").notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
