import { pgTable, serial, text, integer, boolean, timestamp, date } from "drizzle-orm/pg-core";

export const contactsTable = pgTable("contacts", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  title: text("title"),
  department: text("department"),
  email: text("email"),
  phone: text("phone"),
  mobile: text("mobile"),
  isPrimary: boolean("is_primary").default(false),
  isBillingContact: boolean("is_billing_contact").default(false),
  isShippingContact: boolean("is_shipping_contact").default(false),
  preferredContactMethod: text("preferred_contact_method").default("phone"),
  birthday: date("birthday"),
  notes: text("notes"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
