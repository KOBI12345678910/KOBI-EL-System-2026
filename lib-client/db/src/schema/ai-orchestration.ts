import { pgTable, serial, text, integer, numeric, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const aiAuditLogsTable = pgTable("ai_audit_logs", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  userName: text("user_name"),
  sessionId: text("session_id"),
  requestId: text("request_id"),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  taskType: text("task_type"),
  inputSummary: text("input_summary"),
  outputSummary: text("output_summary"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  totalTokens: integer("total_tokens"),
  cost: numeric("cost", { precision: 12, scale: 8 }),
  latencyMs: integer("latency_ms"),
  statusCode: integer("status_code"),
  errorMessage: text("error_message"),
  actionTaken: text("action_taken"),
  fallbackUsed: boolean("fallback_used").default(false),
  originalProvider: text("original_provider"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAiAuditLogSchema = createInsertSchema(aiAuditLogsTable).omit({ id: true, createdAt: true });
export type InsertAiAuditLog = z.infer<typeof insertAiAuditLogSchema>;
export type AiAuditLog = typeof aiAuditLogsTable.$inferSelect;

export const aiProviderSettingsTable = pgTable("ai_provider_settings", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull().unique(),
  isEnabled: boolean("is_enabled").notNull().default(true),
  priority: integer("priority").notNull().default(100),
  monthlyBudget: numeric("monthly_budget", { precision: 12, scale: 2 }),
  monthlySpent: numeric("monthly_spent", { precision: 12, scale: 2 }).default("0"),
  requestsThisMonth: integer("requests_this_month").default(0),
  lastHealthCheck: timestamp("last_health_check"),
  healthStatus: text("health_status").default("unknown"),
  preferredModelForCode: text("preferred_model_for_code"),
  preferredModelForReasoning: text("preferred_model_for_reasoning"),
  preferredModelForFast: text("preferred_model_for_fast"),
  preferredModelForHebrew: text("preferred_model_for_hebrew"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAiProviderSettingsSchema = createInsertSchema(aiProviderSettingsTable).omit({ id: true, updatedAt: true });
export type InsertAiProviderSettings = z.infer<typeof insertAiProviderSettingsSchema>;
export type AiProviderSettings = typeof aiProviderSettingsTable.$inferSelect;

export const mlTrainingJobsTable = pgTable("ml_training_jobs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  jobType: text("job_type").notNull(),
  status: text("status").notNull().default("pending"),
  datasetConfig: jsonb("dataset_config"),
  modelConfig: jsonb("model_config"),
  metrics: jsonb("metrics"),
  artifactPath: text("artifact_path"),
  errorMessage: text("error_message"),
  progressPct: integer("progress_pct").default(0),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertMlTrainingJobSchema = createInsertSchema(mlTrainingJobsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMlTrainingJob = z.infer<typeof insertMlTrainingJobSchema>;
export type MlTrainingJob = typeof mlTrainingJobsTable.$inferSelect;

export const mlDeployedModelsTable = pgTable("ml_deployed_models", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").references(() => mlTrainingJobsTable.id),
  name: text("name").notNull(),
  modelType: text("model_type").notNull(),
  version: text("version").notNull().default("1.0"),
  artifactPath: text("artifact_path"),
  isActive: boolean("is_active").notNull().default(true),
  metrics: jsonb("metrics"),
  predictionCount: integer("prediction_count").default(0),
  deployedAt: timestamp("deployed_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertMlDeployedModelSchema = createInsertSchema(mlDeployedModelsTable).omit({ id: true, deployedAt: true, updatedAt: true });
export type InsertMlDeployedModel = z.infer<typeof insertMlDeployedModelSchema>;
export type MlDeployedModel = typeof mlDeployedModelsTable.$inferSelect;
