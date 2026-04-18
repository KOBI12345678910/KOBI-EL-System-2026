import { pgTable, serial, text, timestamp, integer, date, jsonb } from "drizzle-orm/pg-core";

export const socialMediaPostsTable = pgTable("social_media_posts", {
  id: serial("id").primaryKey(),
  platform: text("platform").notNull(),
  content: text("content"),
  status: text("status").notNull().default("draft"),
  scheduledDate: date("scheduled_date"),
  campaignId: integer("campaign_id"),
  engagementMetrics: jsonb("engagement_metrics"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
