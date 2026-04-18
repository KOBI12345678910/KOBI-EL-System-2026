import { pgTable, serial, text, integer, numeric, date, boolean, timestamp, uuid } from "drizzle-orm/pg-core";
import { finDocumentTypesTable } from "./fin-document-types";
import { finStatusesTable } from "./fin-statuses";
import { finPaymentMethodsTable } from "./fin-payment-methods";
import { finCategoriesTable } from "./fin-categories";
import { customersTable } from "./customers";
import { suppliersTable } from "./suppliers";

export const finDocumentsTable = pgTable("fin_documents", {
  id: serial("id").primaryKey(),
  documentNumber: text("document_number").notNull().unique(),
  documentTypeId: integer("document_type_id").notNull().references(() => finDocumentTypesTable.id),
  direction: text("direction").notNull(), // income | expense
  customerId: integer("customer_id").references(() => customersTable.id),
  supplierId: integer("supplier_id").references(() => suppliersTable.id),
  categoryId: integer("category_id").references(() => finCategoriesTable.id),
  issueDate: date("issue_date").notNull(),
  dueDate: date("due_date"),
  referenceNumber: text("reference_number"),
  title: text("title").notNull(),
  description: text("description"),
  currency: text("currency").notNull().default("ILS"),
  subtotalAmount: numeric("subtotal_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  discountPercent: numeric("discount_percent", { precision: 5, scale: 2 }).default("0"),
  discountAmount: numeric("discount_amount", { precision: 15, scale: 2 }).default("0"),
  taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).default("17"),
  taxAmount: numeric("tax_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  totalAmount: numeric("total_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  paidAmount: numeric("paid_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  balanceDue: numeric("balance_due", { precision: 15, scale: 2 }).notNull().default("0"),
  paymentMethodId: integer("payment_method_id").references(() => finPaymentMethodsTable.id),
  statusId: integer("status_id").notNull().references(() => finStatusesTable.id),
  isRecurringTemplate: boolean("is_recurring_template").notNull().default(false),
  parentRecurringId: integer("parent_recurring_id"),
  notes: text("notes"),
  internalNotes: text("internal_notes"),
  createdBy: text("created_by").notNull().default("system"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const finDocumentItemsTable = pgTable("fin_document_items", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => finDocumentsTable.id, { onDelete: "cascade" }),
  productId: integer("product_id"),
  description: text("description").notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 3 }).notNull().default("1"),
  unitPrice: numeric("unit_price", { precision: 15, scale: 2 }).notNull().default("0"),
  unit: text("unit").default("יח'"),
  discountPercent: numeric("discount_percent", { precision: 5, scale: 2 }).default("0"),
  taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).default("17"),
  lineTotal: numeric("line_total", { precision: 15, scale: 2 }).notNull().default("0"),
  sortOrder: integer("sort_order").notNull().default(0),
});
