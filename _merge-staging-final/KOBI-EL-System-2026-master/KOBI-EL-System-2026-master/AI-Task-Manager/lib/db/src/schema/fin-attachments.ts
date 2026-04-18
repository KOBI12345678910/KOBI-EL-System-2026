import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { finDocumentsTable } from "./fin-documents";

export const finAttachmentsTable = pgTable("fin_attachments", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => finDocumentsTable.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url").notNull(),
  fileType: text("file_type").notNull(),
  fileSize: integer("file_size"),
  uploadedBy: text("uploaded_by").notNull().default("system"),
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
});
