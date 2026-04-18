import { pgTable, serial, text, timestamp, integer, date } from "drizzle-orm/pg-core";

export const contentCalendarItemsTable = pgTable("content_calendar_items", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  type: text("type").notNull().default("blog"),
  campaignId: integer("campaign_id"),
  status: text("status").notNull().default("idea"),
  publishDate: date("publish_date"),
  platform: text("platform"),
  author: text("author"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
