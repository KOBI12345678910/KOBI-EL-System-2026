import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const roadmapItemsTable = pgTable("roadmap_items", {
  id: serial("id").primaryKey(),
  itemNumber: text("item_number").notNull().unique(),
  title: text("title").notNull(),
  productArea: text("product_area"),
  itemType: text("item_type").notNull().default("feature"),
  status: text("status").notNull().default("backlog"),
  priority: text("priority").notNull().default("medium"),
  targetQuarter: text("target_quarter"),
  owner: text("owner"),
  description: text("description"),
  successMetrics: text("success_metrics"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
