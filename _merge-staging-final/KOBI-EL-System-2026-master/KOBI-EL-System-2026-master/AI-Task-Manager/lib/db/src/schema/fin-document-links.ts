import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { finDocumentsTable } from "./fin-documents";

export const finDocumentLinksTable = pgTable("fin_document_links", {
  id: serial("id").primaryKey(),
  sourceDocumentId: integer("source_document_id").notNull().references(() => finDocumentsTable.id),
  targetDocumentId: integer("target_document_id").notNull().references(() => finDocumentsTable.id),
  linkType: text("link_type").notNull(), // based_on | converted_to | paid_by | receipt_for | related_to | attachment_reference
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
