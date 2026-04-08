import { pgTable, serial, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";

export const finStatusesTable = pgTable("fin_statuses", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  label: text("label").notNull(),
  labelHe: text("label_he").notNull(),
  color: text("color").notNull().default("#6B7280"),
  entityType: text("entity_type").notNull().default("all"),
  sortOrder: integer("sort_order").notNull().default(0),
  isDefault: boolean("is_default").notNull().default(false),
  isFinal: boolean("is_final").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
