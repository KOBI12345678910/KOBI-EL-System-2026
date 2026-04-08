import { pgTable, serial, text, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";

export const emailTemplatesTable = pgTable("email_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull().default("system"),
  subject: text("subject").notNull(),
  bodyHtml: text("body_html").notNull(),
  bodyText: text("body_text"),
  isRtl: boolean("is_rtl").notNull().default(true),
  variables: jsonb("variables").notNull().default([]),
  attachmentConfig: jsonb("attachment_config"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type EmailTemplate = typeof emailTemplatesTable.$inferSelect;
export type NewEmailTemplate = typeof emailTemplatesTable.$inferInsert;
