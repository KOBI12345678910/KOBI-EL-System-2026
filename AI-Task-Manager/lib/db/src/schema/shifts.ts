import { pgTable, serial, text, integer, boolean, timestamp, time, varchar } from "drizzle-orm/pg-core";

export const shiftsTable = pgTable("shifts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  nameHe: text("name_he"),
  code: varchar("code", { length: 20 }).unique(),
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  breakMinutes: integer("break_minutes").default(30),
  isNightShift: boolean("is_night_shift").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  daysOfWeek: text("days_of_week").default("0,1,2,3,4"),
  departmentId: integer("department_id"),
  maxEmployees: integer("max_employees"),
  color: varchar("color", { length: 7 }).default("#3B82F6"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
});
