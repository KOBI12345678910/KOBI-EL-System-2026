import { pgTable, serial, text, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";

export const aiBuilderConfigsTable = pgTable("ai_builder_configs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description"),
  entityId: integer("entity_id"),
  featureType: text("feature_type").notNull().default("field_autofill"),
  providerId: integer("provider_id"),
  modelId: integer("model_id"),
  promptTemplateId: integer("prompt_template_id"),
  inputConfig: jsonb("input_config").notNull().default({}),
  outputConfig: jsonb("output_config").notNull().default({}),
  systemPrompt: text("system_prompt"),
  userPromptTemplate: text("user_prompt_template"),
  triggerType: text("trigger_type").notNull().default("manual"),
  triggerConfig: jsonb("trigger_config").notNull().default({}),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const aiBuilderExecutionLogsTable = pgTable("ai_builder_execution_logs", {
  id: serial("id").primaryKey(),
  configId: integer("config_id").notNull().references(() => aiBuilderConfigsTable.id, { onDelete: "cascade" }),
  entityId: integer("entity_id"),
  recordId: integer("record_id"),
  inputData: jsonb("input_data").notNull().default({}),
  outputData: jsonb("output_data").default(null),
  promptUsed: text("prompt_used"),
  status: text("status").notNull().default("pending"),
  errorMessage: text("error_message"),
  tokensUsed: integer("tokens_used"),
  executionTimeMs: integer("execution_time_ms"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
