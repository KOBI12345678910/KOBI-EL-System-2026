import { pgTable, serial, text, numeric, timestamp, integer, date, boolean } from "drizzle-orm/pg-core";

export const timesheetEntriesTable = pgTable("timesheet_entries", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  taskId: integer("task_id"),
  employeeId: integer("employee_id"),
  employee: text("employee").notNull(),
  date: date("date").notNull(),
  weekEndingDate: date("week_ending_date"),
  hours: numeric("hours", { precision: 6, scale: 2 }).notNull(),
  billable: boolean("billable").default(true),
  hourlyRate: numeric("hourly_rate", { precision: 10, scale: 2 }),
  billableAmount: numeric("billable_amount", { precision: 12, scale: 2 }),
  description: text("description"),
  approvalStatus: text("approval_status").notNull().default("draft"),
  approvedById: integer("approved_by_id"),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  rejectionComment: text("rejection_comment"),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
