import { pgTable, serial, text, boolean, timestamp, integer, numeric, json, varchar } from "drizzle-orm/pg-core";

// BASH44 AI Agents registry
export const bash44AgentsTable = pgTable("bash44_agents", {
  id: serial("id").primaryKey(),
  agentCode: varchar("agent_code", { length: 50 }).notNull().unique(),
  agentName: varchar("agent_name", { length: 255 }).notNull(),
  domain: varchar("domain", { length: 50 }).notNull(),
  layer: varchar("layer", { length: 30 }).notNull().default("domain"),
  modelName: varchar("model_name", { length: 100 }),
  systemPrompt: text("system_prompt"),
  outputFormat: varchar("output_format", { length: 20 }).default("json"),
  confidenceThreshold: numeric("confidence_threshold").default("70"),
  escalationThreshold: numeric("escalation_threshold").default("40"),
  executionMode: varchar("execution_mode", { length: 30 }).default("suggest_only"),
  isActive: boolean("is_active").notNull().default(true),
  priority: varchar("priority", { length: 20 }).default("high"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// BASH44 Prompts library
export const bash44PromptsTable = pgTable("bash44_prompts", {
  id: serial("id").primaryKey(),
  promptCode: varchar("prompt_code", { length: 50 }).notNull().unique(),
  promptName: varchar("prompt_name", { length: 255 }).notNull(),
  domain: varchar("domain", { length: 50 }).notNull(),
  goal: text("goal"),
  triggerType: varchar("trigger_type", { length: 50 }),
  requiredInputs: json("required_inputs"),
  optionalInputs: json("optional_inputs"),
  contextRules: json("context_rules"),
  businessRules: json("business_rules"),
  safetyRules: json("safety_rules"),
  outputFormat: varchar("output_format", { length: 20 }).default("json"),
  outputSchema: json("output_schema"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// BASH44 Prompt versions
export const bash44PromptVersionsTable = pgTable("bash44_prompt_versions", {
  id: serial("id").primaryKey(),
  promptId: integer("prompt_id").notNull(),
  version: integer("version").notNull(),
  promptText: text("prompt_text").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  createdBy: varchar("created_by", { length: 100 }),
});

// BASH44 Automations registry
export const bash44AutomationsTable = pgTable("bash44_automations", {
  id: serial("id").primaryKey(),
  automationCode: varchar("automation_code", { length: 50 }).notNull().unique(),
  automationName: varchar("automation_name", { length: 255 }).notNull(),
  domain: varchar("domain", { length: 50 }).notNull(),
  entityType: varchar("entity_type", { length: 50 }),
  triggerType: varchar("trigger_type", { length: 50 }).notNull(),
  conditionLogic: json("condition_logic"),
  agentCode: varchar("agent_code", { length: 50 }),
  promptCode: varchar("prompt_code", { length: 50 }),
  outputType: varchar("output_type", { length: 50 }),
  executionMode: varchar("execution_mode", { length: 30 }).default("draft_only"),
  approvalPolicy: varchar("approval_policy", { length: 30 }),
  retryPolicy: varchar("retry_policy", { length: 30 }),
  cooldownMinutes: integer("cooldown_minutes").default(60),
  ownerRole: varchar("owner_role", { length: 50 }),
  auditRequired: boolean("audit_required").notNull().default(true),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// BASH44 Automation runs
export const bash44AutomationRunsTable = pgTable("bash44_automation_runs", {
  id: serial("id").primaryKey(),
  automationId: integer("automation_id").notNull(),
  agentCode: varchar("agent_code", { length: 50 }),
  entityType: varchar("entity_type", { length: 50 }),
  entityId: integer("entity_id"),
  triggerType: varchar("trigger_type", { length: 50 }),
  inputPayload: json("input_payload"),
  outputPayload: json("output_payload"),
  status: varchar("status", { length: 30 }).notNull().default("pending"),
  confidenceScore: numeric("confidence_score"),
  executionMode: varchar("execution_mode", { length: 30 }),
  approvalStatus: varchar("approval_status", { length: 30 }),
  errorMessage: text("error_message"),
  durationMs: integer("duration_ms"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// BASH44 Context policies
export const bash44ContextPoliciesTable = pgTable("bash44_context_policies", {
  id: serial("id").primaryKey(),
  agentCode: varchar("agent_code", { length: 50 }).notNull(),
  entityType: varchar("entity_type", { length: 50 }).notNull(),
  accessLevel: varchar("access_level", { length: 20 }).default("read"),
  fieldRestrictions: json("field_restrictions"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// BASH44 Output reviews
export const bash44OutputReviewsTable = pgTable("bash44_output_reviews", {
  id: serial("id").primaryKey(),
  automationRunId: integer("automation_run_id").notNull(),
  reviewerRole: varchar("reviewer_role", { length: 50 }),
  reviewerUserId: integer("reviewer_user_id"),
  reviewStatus: varchar("review_status", { length: 30 }).notNull().default("pending"),
  reviewNote: text("review_note"),
  qualityScore: integer("quality_score"),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// BASH44 Feedback log
export const bash44FeedbackLogTable = pgTable("bash44_feedback_log", {
  id: serial("id").primaryKey(),
  automationRunId: integer("automation_run_id").notNull(),
  feedbackType: varchar("feedback_type", { length: 30 }).notNull(),
  actualResult: text("actual_result"),
  outcomeQuality: varchar("outcome_quality", { length: 20 }),
  forecastAccuracy: numeric("forecast_accuracy"),
  financialImpact: numeric("financial_impact"),
  operationalImpact: text("operational_impact"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// BASH44 Safety rules
export const bash44SafetyRulesTable = pgTable("bash44_safety_rules", {
  id: serial("id").primaryKey(),
  ruleCode: varchar("rule_code", { length: 50 }).notNull().unique(),
  ruleName: varchar("rule_name", { length: 255 }).notNull(),
  ruleDescription: text("rule_description"),
  entityType: varchar("entity_type", { length: 50 }),
  blockedActions: json("blocked_actions"),
  requiredApproval: varchar("required_approval", { length: 30 }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// BASH44 Model routing rules
export const bash44ModelRoutingTable = pgTable("bash44_model_routing", {
  id: serial("id").primaryKey(),
  taskType: varchar("task_type", { length: 50 }).notNull(),
  complexity: varchar("complexity", { length: 20 }).default("medium"),
  modelTier: varchar("model_tier", { length: 30 }).notNull(),
  modelName: varchar("model_name", { length: 100 }),
  maxTokens: integer("max_tokens"),
  temperature: numeric("temperature").default("0.3"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// BASH44 Memory snapshots
export const bash44MemorySnapshotsTable = pgTable("bash44_memory_snapshots", {
  id: serial("id").primaryKey(),
  memoryType: varchar("memory_type", { length: 30 }).notNull(),
  entityType: varchar("entity_type", { length: 50 }),
  entityId: integer("entity_id"),
  snapshotData: json("snapshot_data"),
  recurrenceScore: numeric("recurrence_score"),
  businessImpactScore: numeric("business_impact_score"),
  lastSeenAt: timestamp("last_seen_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// BASH44 Alert queue
export const bash44AlertQueueTable = pgTable("bash44_alert_queue", {
  id: serial("id").primaryKey(),
  sourceAgentCode: varchar("source_agent_code", { length: 50 }),
  automationRunId: integer("automation_run_id"),
  entityType: varchar("entity_type", { length: 50 }),
  entityId: integer("entity_id"),
  alertType: varchar("alert_type", { length: 50 }).notNull(),
  severity: varchar("severity", { length: 20 }).notNull().default("medium"),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message"),
  assignedRole: varchar("assigned_role", { length: 50 }),
  isOpen: boolean("is_open").notNull().default(true),
  openedAt: timestamp("opened_at").notNull().defaultNow(),
  closedAt: timestamp("closed_at"),
});

// BASH44 Task queue
export const bash44TaskQueueTable = pgTable("bash44_task_queue", {
  id: serial("id").primaryKey(),
  sourceAgentCode: varchar("source_agent_code", { length: 50 }),
  automationRunId: integer("automation_run_id"),
  taskType: varchar("task_type", { length: 50 }).notNull(),
  entityType: varchar("entity_type", { length: 50 }),
  entityId: integer("entity_id"),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  assignedRole: varchar("assigned_role", { length: 50 }),
  assignedUserId: integer("assigned_user_id"),
  priority: varchar("priority", { length: 20 }).default("medium"),
  status: varchar("status", { length: 30 }).notNull().default("open"),
  dueDate: timestamp("due_date"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
