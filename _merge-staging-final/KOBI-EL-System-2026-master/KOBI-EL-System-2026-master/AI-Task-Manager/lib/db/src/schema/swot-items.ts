import { pgTable, serial, text, timestamp, date } from "drizzle-orm/pg-core";

export const swotItemsTable = pgTable("swot_items", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  impact: text("impact"),
  owner: text("owner"),
  date: date("date"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
