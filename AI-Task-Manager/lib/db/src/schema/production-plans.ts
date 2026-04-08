import { pgTable, serial, text, numeric, integer, date, timestamp } from "drizzle-orm/pg-core";

export const productionPlansTable = pgTable("production_plans", {
  id: serial("id").primaryKey(),
  planNumber: text("plan_number").notNull().unique(),
  name: text("name").notNull(),
  periodStart: date("period_start"),
  periodEnd: date("period_end"),
  status: text("status").notNull().default("draft"),
  notes: text("notes"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const productionPlanLinesTable = pgTable("production_plan_lines", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id").notNull(),
  productName: text("product_name").notNull(),
  targetQuantity: numeric("target_quantity").notNull().default("0"),
  bomId: integer("bom_id"),
  scheduledStart: date("scheduled_start"),
  scheduledEnd: date("scheduled_end"),
  workOrderId: integer("work_order_id"),
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
