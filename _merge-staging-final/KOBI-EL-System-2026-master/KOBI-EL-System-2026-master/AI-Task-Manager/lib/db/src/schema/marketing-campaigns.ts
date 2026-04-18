import { pgTable, serial, text, numeric, timestamp, date } from "drizzle-orm/pg-core";

export const marketingCampaignsTable = pgTable("marketing_campaigns", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull().default("digital"),
  status: text("status").notNull().default("draft"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  budget: numeric("budget", { precision: 15, scale: 2 }).default("0"),
  spent: numeric("spent", { precision: 15, scale: 2 }).default("0"),
  targetAudience: text("target_audience"),
  channels: text("channels"),
  goal: text("goal"),
  impressions: numeric("impressions", { precision: 15, scale: 0 }).default("0"),
  clicks: numeric("clicks", { precision: 15, scale: 0 }).default("0"),
  conversions: numeric("conversions", { precision: 15, scale: 0 }).default("0"),
  roi: numeric("roi", { precision: 8, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
