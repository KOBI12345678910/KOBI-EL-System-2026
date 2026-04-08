import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const notificationPreferencesTable = pgTable("notification_preferences", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  category: text("category").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  minPriority: text("min_priority").notNull().default("low"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type NotificationPreference = typeof notificationPreferencesTable.$inferSelect;
