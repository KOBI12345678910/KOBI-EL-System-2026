import { pgTable, serial, text, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";

export const contractTemplatesTable = pgTable("contract_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category"),
  templateContent: text("template_content").notNull(),
  templateVariables: jsonb("template_variables").default([]),
  requiredFields: jsonb("required_fields").default([]),
  currentVersion: integer("current_version").notNull().default(1),
  isActive: boolean("is_active").notNull().default(true),
  signatureFields: jsonb("signature_fields").default([]),
  createdBy: text("created_by").default("system"),
  updatedBy: text("updated_by").default("system"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const templateVersionsTable = pgTable("template_versions", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").notNull().references(() => contractTemplatesTable.id, { onDelete: "cascade" }),
  versionNumber: integer("version_number").notNull().default(1),
  templateContent: text("template_content").notNull(),
  changeNotes: text("change_notes"),
  createdBy: text("created_by").default("system"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const eSignatureWorkflowTable = pgTable("e_signature_workflow", {
  id: serial("id").primaryKey(),
  contractId: integer("contract_id"),
  templateId: integer("template_id").references(() => contractTemplatesTable.id, { onDelete: "set null" }),
  workflowName: text("workflow_name").notNull(),
  provider: text("provider").notNull().default("local"),
  externalEnvelopeId: text("external_envelope_id"),
  signatureOrder: jsonb("signature_order").default([]),
  currentStep: integer("current_step").notNull().default(0),
  status: text("status").notNull().default("pending"),
  sendReminders: boolean("send_reminders").default(true),
  reminderDays: integer("reminder_days").default(3),
  expirationDays: integer("expiration_days").default(30),
  createdBy: text("created_by").default("system"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const contractSignaturesTable = pgTable("contract_signatures", {
  id: serial("id").primaryKey(),
  contractId: integer("contract_id"),
  workflowId: integer("workflow_id").references(() => eSignatureWorkflowTable.id, { onDelete: "cascade" }),
  signeeEmail: text("signee_email").notNull(),
  signeeName: text("signee_name").notNull(),
  signatureField: text("signature_field").notNull(),
  signatureData: text("signature_data"),
  signedDocumentHtml: text("signed_document_html"),
  signatureType: text("signature_type").notNull().default("electronic"),
  status: text("status").notNull().default("pending"),
  provider: text("provider").default("local"),
  externalId: text("external_id"),
  invitationToken: text("invitation_token"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  signedAt: timestamp("signed_at"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const signatureAuditLogTable = pgTable("signature_audit_log", {
  id: serial("id").primaryKey(),
  signatureId: integer("signature_id").notNull().references(() => contractSignaturesTable.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  performedBy: text("performed_by"),
  details: jsonb("details").default({}),
});
