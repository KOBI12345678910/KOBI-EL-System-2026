import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const projectDocumentsTable = pgTable("project_documents", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  phase: text("phase").default("planning"),
  documentType: text("document_type").default("general"),
  name: text("name").notNull(),
  filePath: text("file_path"),
  version: text("version").default("1.0"),
  tags: text("tags"),
  description: text("description"),
  uploadedBy: text("uploaded_by").default("system"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
