import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const supplierNotesTable = pgTable("supplier_notes", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").notNull(),
  noteText: text("note_text").notNull(),
  author: text("author"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
