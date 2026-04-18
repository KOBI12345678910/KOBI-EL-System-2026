import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const supplierContactsTable = pgTable("supplier_contacts", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").notNull(),
  contactName: text("contact_name").notNull(),
  role: text("role"),
  phone: text("phone"),
  mobile: text("mobile"),
  email: text("email"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
