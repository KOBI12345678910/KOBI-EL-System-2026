import { pgTable, serial, integer, text, numeric, date, timestamp } from "drizzle-orm/pg-core";
import { customersTable } from "./customers";
import { finDocumentsTable } from "./fin-documents";
import { finStatusesTable } from "./fin-statuses";

export const finStandingOrdersTable = pgTable("fin_standing_orders", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => customersTable.id),
  relatedDocumentId: integer("related_document_id").references(() => finDocumentsTable.id),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  frequency: text("frequency").notNull(), // monthly | bi_monthly | yearly
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  statusId: integer("status_id").notNull().references(() => finStatusesTable.id),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
