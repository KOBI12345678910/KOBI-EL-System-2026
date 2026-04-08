import { pgTable, serial, text, integer, numeric, timestamp, varchar } from "drizzle-orm/pg-core";

export const workOrderTemplatesTable = pgTable("work_order_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  templateType: varchar("template_type", { length: 50 }).notNull(), // window, door, frame, panel, etc
  productType: text("product_type"),
  estimatedHours: numeric("estimated_hours", { precision: 6, scale: 2 }),
  estimatedMaterials: text("estimated_materials"), // JSON array
  defaultStatus: varchar("default_status", { length: 30 }).default("pending"),
  workInstructions: text("work_instructions"),
  safetyRequirements: text("safety_requirements"),
  toolingRequired: text("tooling_required"),
  department: text("department"),
  priority: varchar("priority", { length: 20 }).default("medium"),
  isActive: integer("is_active").default(1),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
});
