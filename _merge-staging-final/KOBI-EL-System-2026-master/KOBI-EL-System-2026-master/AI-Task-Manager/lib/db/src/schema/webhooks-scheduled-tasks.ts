import { pgTable, serial, text, boolean, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

export const outgoingWebhooksTable = pgTable("outgoing_webhooks", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  events: jsonb("events").notNull().default([]),
  headers: jsonb("headers").notNull().default({}),
  authType: text("auth_type").notNull().default("none"),
  authValue: text("auth_value"),
  isActive: boolean("is_active").notNull().default(true),
  retryPolicy: jsonb("retry_policy").notNull().default({ maxRetries: 3, backoffSeconds: 30 }),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const webhookDeliveryLogsTable = pgTable("webhook_delivery_logs", {
  id: serial("id").primaryKey(),
  webhookId: integer("webhook_id").references(() => outgoingWebhooksTable.id, { onDelete: "cascade" }),
  event: text("event").notNull(),
  payload: jsonb("payload"),
  responseStatus: integer("response_status"),
  responseBody: text("response_body"),
  success: boolean("success").notNull().default(false),
  errorMessage: text("error_message"),
  duration: integer("duration"),
  sentAt: timestamp("sent_at").notNull().defaultNow(),
  retryCount: integer("retry_count").notNull().default(0),
});

export const incomingWebhookEndpointsTable = pgTable("incoming_webhook_endpoints", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  secret: text("secret"),
  description: text("description"),
  mappedAction: text("mapped_action"),
  actionConfig: jsonb("action_config").notNull().default({}),
  isActive: boolean("is_active").notNull().default(true),
  totalCalls: integer("total_calls").notNull().default(0),
  lastCalledAt: timestamp("last_called_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const scheduledTasksTable = pgTable("scheduled_tasks", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  taskType: text("task_type").notNull().default("notification_check"),
  cronExpression: text("cron_expression"),
  scheduleFrequency: text("schedule_frequency").notNull().default("daily"),
  scheduleTime: text("schedule_time").notNull().default("08:00"),
  parameters: jsonb("parameters").notNull().default({}),
  isActive: boolean("is_active").notNull().default(true),
  lastRunAt: timestamp("last_run_at"),
  nextRunAt: timestamp("next_run_at"),
  runCount: integer("run_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const scheduledTaskExecutionLogsTable = pgTable("scheduled_task_execution_logs", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").references(() => scheduledTasksTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("running"),
  output: text("output"),
  errorMessage: text("error_message"),
  duration: integer("duration"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const notificationDigestSettingsTable = pgTable("notification_digest_settings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique(),
  enabled: boolean("enabled").notNull().default(false),
  frequency: text("frequency").notNull().default("daily"),
  scheduleTime: text("schedule_time").notNull().default("08:00"),
  scheduleDayOfWeek: integer("schedule_day_of_week").notNull().default(1),
  includeCategories: jsonb("include_categories").notNull().default(["anomaly","task","approval","system","workflow"]),
  minPriority: text("min_priority").notNull().default("normal"),
  lastSentAt: timestamp("last_sent_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type OutgoingWebhook = typeof outgoingWebhooksTable.$inferSelect;
export type WebhookDeliveryLog = typeof webhookDeliveryLogsTable.$inferSelect;
export type IncomingWebhookEndpoint = typeof incomingWebhookEndpointsTable.$inferSelect;
export type ScheduledTask = typeof scheduledTasksTable.$inferSelect;
export type ScheduledTaskExecutionLog = typeof scheduledTaskExecutionLogsTable.$inferSelect;
export type NotificationDigestSettings = typeof notificationDigestSettingsTable.$inferSelect;
