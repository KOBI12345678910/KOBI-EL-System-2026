import { pgTable, serial, integer, text, date, boolean, timestamp } from "drizzle-orm/pg-core";
import { finDocumentsTable } from "./fin-documents";
import { finStatusesTable } from "./fin-statuses";

export const finRecurringDocumentsTable = pgTable("fin_recurring_documents", {
  id: serial("id").primaryKey(),
  templateDocumentId: integer("template_document_id").notNull().references(() => finDocumentsTable.id),
  frequency: text("frequency").notNull(), // daily | weekly | monthly | yearly
  intervalValue: integer("interval_value").notNull().default(1),
  nextRunDate: date("next_run_date").notNull(),
  endDate: date("end_date"),
  autoSend: boolean("auto_send").notNull().default(false),
  statusId: integer("status_id").notNull().references(() => finStatusesTable.id),
  lastRunAt: timestamp("last_run_at"),
  totalGenerated: integer("total_generated").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
