import { pgTable, serial, text, integer, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";

export const supplierCommunicationsTable = pgTable("supplier_communications", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").notNull(),
  type: text("type").notNull().default("general"),
  subject: text("subject").notNull(),
  content: text("content"),
  direction: text("direction").notNull().default("outgoing"),
  status: text("status").notNull().default("draft"),
  priority: text("priority").default("normal"),
  sentBy: text("sent_by"),
  sentAt: timestamp("sent_at"),
  readAt: timestamp("read_at"),
  recipientEmail: text("recipient_email"),
  recipientName: text("recipient_name"),
  attachments: jsonb("attachments").default([]),
  relatedDocType: text("related_doc_type"),
  relatedDocId: integer("related_doc_id"),
  tags: text("tags"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
