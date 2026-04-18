import { pgTable, serial, text, timestamp, date } from "drizzle-orm/pg-core";

export const competitiveAnalysesTable = pgTable("competitive_analyses", {
  id: serial("id").primaryKey(),
  competitorName: text("competitor_name").notNull(),
  productMarket: text("product_market"),
  strengths: text("strengths"),
  weaknesses: text("weaknesses"),
  ourAdvantage: text("our_advantage"),
  threatLevel: text("threat_level").default("medium"),
  date: date("date"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
