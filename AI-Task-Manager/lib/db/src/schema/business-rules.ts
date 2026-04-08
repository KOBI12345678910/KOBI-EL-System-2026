import { pgTable, serial, text, integer, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
import { platformModulesTable } from "./platform-modules";
import { moduleEntitiesTable } from "./module-entities";

export const businessRulesTable = pgTable("business_rules", {
  id: serial("id").primaryKey(),
  moduleId: integer("module_id").references(() => platformModulesTable.id, { onDelete: "set null" }),
  entityId: integer("entity_id").references(() => moduleEntitiesTable.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  description: text("description"),
  scope: text("scope").notNull().default("all"),
  triggerEvents: jsonb("trigger_events").notNull().default(["on_create", "on_update"]),
  conditions: jsonb("conditions").notNull().default([]),
  enforcementAction: text("enforcement_action").notNull().default("block"),
  enforcementConfig: jsonb("enforcement_config").notNull().default({}),
  priority: integer("priority").notNull().default(100),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const businessRuleAuditLogTable = pgTable("business_rule_audit_log", {
  id: serial("id").primaryKey(),
  ruleId: integer("rule_id").references(() => businessRulesTable.id, { onDelete: "cascade" }),
  entityId: integer("entity_id"),
  recordId: integer("record_id"),
  triggerEvent: text("trigger_event").notNull(),
  result: text("result").notNull(),
  details: jsonb("details").notNull().default({}),
  evaluatedAt: timestamp("evaluated_at").notNull().defaultNow(),
});

export const visualWorkflowLayoutsTable = pgTable("visual_workflow_layouts", {
  id: serial("id").primaryKey(),
  workflowId: integer("workflow_id").notNull(),
  layoutData: jsonb("layout_data").notNull().default({}),
  viewport: jsonb("viewport").notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const automationVisualLayoutsTable = pgTable("automation_visual_layouts", {
  id: serial("id").primaryKey(),
  automationId: integer("automation_id").notNull(),
  layoutData: jsonb("layout_data").notNull().default({}),
  viewport: jsonb("viewport").notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
