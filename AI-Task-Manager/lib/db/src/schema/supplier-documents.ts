import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const supplierDocumentsTable = pgTable("supplier_documents", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").notNull(),
  documentName: text("document_name").notNull(),
  documentType: text("document_type").notNull().default("כללי"),
  fileUrl: text("file_url"),
  notes: text("notes"),
  expiryDate: timestamp("expiry_date"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
