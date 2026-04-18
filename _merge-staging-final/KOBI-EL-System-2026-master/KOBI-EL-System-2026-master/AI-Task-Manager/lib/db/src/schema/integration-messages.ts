import { pgTable, serial, text, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { integrationConnectionsTable } from "./integration-connections";

export const integrationMessagesTable = pgTable("integration_messages", {
  id: serial("id").primaryKey(),
  connectionId: integer("connection_id").notNull().references(() => integrationConnectionsTable.id, { onDelete: "cascade" }),
  channel: text("channel").notNull(),
  direction: text("direction").notNull().default("outbound"),
  externalId: text("external_id"),
  fromAddress: text("from_address"),
  toAddress: text("to_address").notNull(),
  subject: text("subject"),
  body: text("body").notNull(),
  bodyHtml: text("body_html"),
  status: text("status").notNull().default("sent"),
  entityType: text("entity_type"),
  entityId: integer("entity_id"),
  entityName: text("entity_name"),
  metadata: jsonb("metadata").notNull().default({}),
  attachments: jsonb("attachments").notNull().default([]),
  sentAt: timestamp("sent_at"),
  deliveredAt: timestamp("delivered_at"),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const integrationTemplatesTable = pgTable("integration_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  channel: text("channel").notNull(),
  subject: text("subject"),
  body: text("body").notNull(),
  bodyHtml: text("body_html"),
  variables: jsonb("variables").notNull().default([]),
  category: text("category"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
