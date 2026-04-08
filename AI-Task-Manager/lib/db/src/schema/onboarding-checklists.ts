import { pgTable, serial, text, integer, boolean, timestamp, varchar, date } from "drizzle-orm/pg-core";

export const onboardingChecklistsTable = pgTable("onboarding_checklists", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull(),
  templateName: varchar("template_name", { length: 100 }).default("default"),
  status: varchar("status", { length: 30 }).default("in_progress"),
  startDate: date("start_date").defaultNow(),
  targetCompletionDate: date("target_completion_date"),
  completedAt: timestamp("completed_at"),
  assignedTo: integer("assigned_to"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

export const onboardingChecklistItemsTable = pgTable("onboarding_checklist_items", {
  id: serial("id").primaryKey(),
  checklistId: integer("checklist_id").notNull(),
  title: text("title").notNull(),
  titleHe: text("title_he"),
  description: text("description"),
  category: varchar("category", { length: 50 }).default("general"),
  isRequired: boolean("is_required").notNull().default(true),
  isCompleted: boolean("is_completed").notNull().default(false),
  completedAt: timestamp("completed_at"),
  completedBy: integer("completed_by"),
  dueDate: date("due_date"),
  sortOrder: integer("sort_order").default(0),
  notes: text("notes"),
  attachmentUrl: text("attachment_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
