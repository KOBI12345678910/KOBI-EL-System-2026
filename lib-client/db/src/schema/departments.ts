import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const departmentsTable = pgTable("departments", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  nameHe: text("name_he"),
  code: text("code").unique(),
  description: text("description"),
  managerId: integer("manager_id"),
  parentId: integer("parent_id"),
  isActive: boolean("is_active").notNull().default(true),
  location: text("location"),
  phone: text("phone"),
  email: text("email"),
  costCenter: text("cost_center"),
  headcount: integer("headcount").default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
});
