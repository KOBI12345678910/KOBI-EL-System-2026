import { pgTable, serial, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";

export const finDocumentTypesTable = pgTable("fin_document_types", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  label: text("label").notNull(),
  labelHe: text("label_he").notNull(),
  direction: text("direction").notNull().default("income"), // income | expense | both
  prefix: text("prefix").notNull().default("DOC"),
  nextNumber: integer("next_number").notNull().default(1),
  paddingLength: integer("padding_length").notNull().default(6),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
