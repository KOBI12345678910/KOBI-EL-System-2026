import { pgTable, serial, text, numeric, timestamp, integer, date } from "drizzle-orm/pg-core";

export const emailCampaignsTable = pgTable("email_campaigns", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  subject: text("subject"),
  campaignId: integer("campaign_id"),
  status: text("status").notNull().default("draft"),
  sendDate: date("send_date"),
  recipientCount: integer("recipient_count").default(0),
  openRate: numeric("open_rate", { precision: 5, scale: 2 }),
  clickRate: numeric("click_rate", { precision: 5, scale: 2 }),
  listSegment: text("list_segment"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
