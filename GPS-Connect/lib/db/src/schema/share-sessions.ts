import { pgTable, serial, text, doublePrecision, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const shareSessionsTable = pgTable("share_sessions", {
  id: serial("id").primaryKey(),
  shareCode: text("share_code").notNull().unique(),
  name: text("name").notNull(),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertShareSessionSchema = createInsertSchema(shareSessionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertShareSession = z.infer<typeof insertShareSessionSchema>;
export type ShareSession = typeof shareSessionsTable.$inferSelect;
