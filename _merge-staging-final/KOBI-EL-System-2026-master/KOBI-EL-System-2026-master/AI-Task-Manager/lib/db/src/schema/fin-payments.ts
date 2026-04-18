import { pgTable, serial, text, integer, numeric, date, timestamp } from "drizzle-orm/pg-core";
import { finDocumentsTable } from "./fin-documents";
import { finPaymentMethodsTable } from "./fin-payment-methods";
import { finStatusesTable } from "./fin-statuses";

export const finPaymentsTable = pgTable("fin_payments", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => finDocumentsTable.id),
  paymentMethodId: integer("payment_method_id").notNull().references(() => finPaymentMethodsTable.id),
  paymentDate: date("payment_date").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  referenceNumber: text("reference_number"),
  externalTransactionId: text("external_transaction_id"),
  statusId: integer("status_id").notNull().references(() => finStatusesTable.id),
  notes: text("notes"),
  createdBy: text("created_by").notNull().default("system"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
