import { pgTable, serial, integer, text, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";

export const pushSubscriptionsTable = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  type: text("type").notNull().default("browser"),
  endpoint: text("endpoint").notNull(),
  keysAuth: text("keys_auth"),
  keysP256dh: text("keys_p256dh"),
  expoToken: text("expo_token"),
  deviceInfo: jsonb("device_info"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type PushSubscription = typeof pushSubscriptionsTable.$inferSelect;
export type NewPushSubscription = typeof pushSubscriptionsTable.$inferInsert;
