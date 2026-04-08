import { pgTable, serial, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";

export const finPaymentMethodsTable = pgTable("fin_payment_methods", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  label: text("label").notNull(),
  labelHe: text("label_he").notNull(),
  icon: text("icon"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
