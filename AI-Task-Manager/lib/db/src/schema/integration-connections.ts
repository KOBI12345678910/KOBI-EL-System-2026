import { pgTable, serial, text, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";

export const integrationConnectionsTable = pgTable("integration_connections", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description"),
  serviceType: text("service_type").notNull().default("rest_api"),
  baseUrl: text("base_url").notNull(),
  authMethod: text("auth_method").notNull().default("none"),
  authConfig: jsonb("auth_config").notNull().default({}),
  defaultHeaders: jsonb("default_headers").notNull().default({}),
  isActive: boolean("is_active").notNull().default(true),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const integrationEndpointsTable = pgTable("integration_endpoints", {
  id: serial("id").primaryKey(),
  connectionId: integer("connection_id").notNull().references(() => integrationConnectionsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  method: text("method").notNull().default("GET"),
  path: text("path").notNull(),
  requestHeaders: jsonb("request_headers").notNull().default({}),
  requestBody: jsonb("request_body").default(null),
  fieldMapping: jsonb("field_mapping").notNull().default([]),
  syncDirection: text("sync_direction").notNull().default("import"),
  entityId: integer("entity_id"),
  scheduleConfig: jsonb("schedule_config").default(null),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const integrationWebhooksTable = pgTable("integration_webhooks", {
  id: serial("id").primaryKey(),
  connectionId: integer("connection_id").notNull().references(() => integrationConnectionsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  webhookSecret: text("webhook_secret"),
  entityId: integer("entity_id"),
  fieldMapping: jsonb("field_mapping").notNull().default([]),
  eventType: text("event_type").notNull().default("create"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const integrationSyncLogsTable = pgTable("integration_sync_logs", {
  id: serial("id").primaryKey(),
  connectionId: integer("connection_id").notNull().references(() => integrationConnectionsTable.id, { onDelete: "cascade" }),
  endpointId: integer("endpoint_id"),
  webhookId: integer("webhook_id"),
  direction: text("direction").notNull(),
  status: text("status").notNull().default("pending"),
  recordsProcessed: integer("records_processed").notNull().default(0),
  recordsFailed: integer("records_failed").notNull().default(0),
  errorMessage: text("error_message"),
  details: jsonb("details").default(null),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});
