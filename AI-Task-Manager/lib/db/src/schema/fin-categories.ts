import { pgTable, serial, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";

export const finCategoriesTable = pgTable("fin_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  nameHe: text("name_he").notNull(),
  direction: text("direction").notNull(), // income | expense
  parentCategoryId: integer("parent_category_id"),
  icon: text("icon"),
  color: text("color"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
