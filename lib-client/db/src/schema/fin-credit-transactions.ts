import { pgTable, serial, integer, text, numeric, date, timestamp } from "drizzle-orm/pg-core";
import { customersTable } from "./customers";
import { finDocumentsTable } from "./fin-documents";
import { finStatusesTable } from "./fin-statuses";

export const finCreditTransactionsTable = pgTable("fin_credit_transactions", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").references(() => customersTable.id),
  documentId: integer("document_id").references(() => finDocumentsTable.id),
  transactionDate: date("transaction_date").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  transactionCode: text("transaction_code"),
  providerReference: text("provider_reference"),
  statusId: integer("status_id").notNull().references(() => finStatusesTable.id),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
