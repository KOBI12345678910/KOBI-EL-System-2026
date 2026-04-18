import { pgTable, serial, text, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";

export const reportSchedulesTable = pgTable("report_schedules", {
  id: serial("id").primaryKey(),
  reportName: text("report_name").notNull(),
  reportType: text("report_type").notNull().default("financial"),
  reportConfig: jsonb("report_config").notNull().default({}),
  scheduleType: text("schedule_type").notNull().default("daily"),
  cronExpression: text("cron_expression"),
  outputFormat: text("output_format").notNull().default("pdf"),
  recipients: jsonb("recipients").notNull().default([]),
  subject: text("subject"),
  bodyTemplate: text("body_template"),
  isActive: boolean("is_active").notNull().default(true),
  lastRunAt: timestamp("last_run_at"),
  lastRunStatus: text("last_run_status"),
  lastRunError: text("last_run_error"),
  nextRunAt: timestamp("next_run_at"),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const reportDeliveryLogsTable = pgTable("report_delivery_logs", {
  id: serial("id").primaryKey(),
  scheduleId: integer("schedule_id").notNull().references(() => reportSchedulesTable.id, { onDelete: "cascade" }),
  runAt: timestamp("run_at").notNull().defaultNow(),
  status: text("status").notNull().default("success"),
  recipients: jsonb("recipients").notNull().default([]),
  outputFormat: text("output_format").notNull().default("pdf"),
  errorMessage: text("error_message"),
  reportData: jsonb("report_data").default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const savedAdHocQueriesTable = pgTable("saved_adhoc_queries", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  queryConfig: jsonb("query_config").notNull().default({}),
  selectedTables: jsonb("selected_tables").notNull().default([]),
  joins: jsonb("joins").notNull().default([]),
  selectedColumns: jsonb("selected_columns").notNull().default([]),
  filters: jsonb("filters").notNull().default([]),
  sorts: jsonb("sorts").notNull().default([]),
  isPublic: boolean("is_public").notNull().default(false),
  ownerId: integer("owner_id"),
  lastRunAt: timestamp("last_run_at"),
  lastRowCount: integer("last_row_count"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
