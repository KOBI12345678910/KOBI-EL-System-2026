import { pgTable, serial, text, integer, numeric, timestamp, varchar, date } from "drizzle-orm/pg-core";

export const workOrderAssignmentsTable = pgTable("work_order_assignments", {
  id: serial("id").primaryKey(),
  workOrderId: integer("work_order_id").notNull(),
  employeeId: integer("employee_id").notNull(),
  role: varchar("role", { length: 50 }).default("worker"),
  status: varchar("status", { length: 30 }).default("assigned"),
  assignedAt: timestamp("assigned_at").notNull().defaultNow(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  estimatedHours: numeric("estimated_hours", { precision: 6, scale: 2 }),
  actualHours: numeric("actual_hours", { precision: 6, scale: 2 }),
  assignedBy: integer("assigned_by"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
