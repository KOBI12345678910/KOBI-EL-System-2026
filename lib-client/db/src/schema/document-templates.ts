import { pgTable, serial, text, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";

export const documentTemplatesTable = pgTable("document_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description"),
  documentType: text("document_type").notNull().default("invoice"),
  entityId: integer("entity_id"),
  templateContent: text("template_content").notNull().default(""),
  headerContent: text("header_content"),
  footerContent: text("footer_content"),
  placeholders: jsonb("placeholders").notNull().default([]),
  styles: jsonb("styles").notNull().default({}),
  pageSettings: jsonb("page_settings").notNull().default({}),
  sampleData: jsonb("sample_data").default(null),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const generatedDocumentsTable = pgTable("generated_documents", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").notNull().references(() => documentTemplatesTable.id, { onDelete: "cascade" }),
  recordId: integer("record_id"),
  documentNumber: text("document_number"),
  generatedHtml: text("generated_html"),
  data: jsonb("data").notNull().default({}),
  status: text("status").notNull().default("generated"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
