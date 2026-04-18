import { pgTable, serial, text, integer, numeric, timestamp, boolean, varchar, date } from "drizzle-orm/pg-core";

export const paymentRemindersTable = pgTable("payment_reminders", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id"),
  customerId: integer("customer_id").notNull(),
  reminderNumber: integer("reminder_number").default(1),
  type: varchar("type", { length: 30 }).default("email"),
  status: varchar("status", { length: 30 }).default("pending"),
  amountDue: numeric("amount_due", { precision: 15, scale: 2 }),
  dueDate: date("due_date"),
  daysPastDue: integer("days_past_due").default(0),
  subject: text("subject"),
  message: text("message"),
  sentAt: timestamp("sent_at"),
  sentBy: integer("sent_by"),
  responseAt: timestamp("response_at"),
  responseNotes: text("response_notes"),
  isEscalated: boolean("is_escalated").notNull().default(false),
  nextReminderDate: date("next_reminder_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
