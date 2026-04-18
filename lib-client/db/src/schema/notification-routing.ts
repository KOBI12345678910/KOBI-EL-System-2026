import { pgTable, serial, text, boolean, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

export const notificationRoutingRulesTable = pgTable("notification_routing_rules", {
  id: serial("id").primaryKey(),
  notificationType: text("notification_type").notNull(),
  category: text("category").notNull().default("system"),
  roleName: text("role_name"),
  userId: integer("user_id"),
  channelInApp: boolean("channel_in_app").notNull().default(true),
  channelEmail: boolean("channel_email").notNull().default(false),
  channelWhatsapp: boolean("channel_whatsapp").notNull().default(false),
  channelSlack: boolean("channel_slack").notNull().default(false),
  channelSms: boolean("channel_sms").notNull().default(false),
  channelTelegram: boolean("channel_telegram").notNull().default(false),
  channelBrowserPush: boolean("channel_browser_push").notNull().default(false),
  channelMobilePush: boolean("channel_mobile_push").notNull().default(false),
  minPriorityInApp: text("min_priority_in_app").notNull().default("low"),
  minPriorityEmail: text("min_priority_email").notNull().default("high"),
  minPriorityWhatsapp: text("min_priority_whatsapp").notNull().default("critical"),
  minPrioritySlack: text("min_priority_slack").notNull().default("high"),
  minPrioritySms: text("min_priority_sms").notNull().default("critical"),
  minPriorityTelegram: text("min_priority_telegram").notNull().default("high"),
  minPriorityBrowserPush: text("min_priority_browser_push").notNull().default("normal"),
  minPriorityMobilePush: text("min_priority_mobile_push").notNull().default("high"),
  emailTemplateId: integer("email_template_id"),
  quietHoursEnabled: boolean("quiet_hours_enabled").notNull().default(false),
  quietHoursFrom: text("quiet_hours_from").notNull().default("22:00"),
  quietHoursTo: text("quiet_hours_to").notNull().default("08:00"),
  quietHoursBypassPriority: text("quiet_hours_bypass_priority").notNull().default("critical"),
  isActive: boolean("is_active").notNull().default(true),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const notificationDeliveryLogTable = pgTable("notification_delivery_log", {
  id: serial("id").primaryKey(),
  notificationId: integer("notification_id").notNull(),
  channel: text("channel").notNull(),
  status: text("status").notNull().default("pending"),
  recipientUserId: integer("recipient_user_id"),
  recipientEmail: text("recipient_email"),
  recipientPhone: text("recipient_phone"),
  errorMessage: text("error_message"),
  sentAt: timestamp("sent_at"),
  deliveredAt: timestamp("delivered_at"),
  openedAt: timestamp("opened_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  metadata: jsonb("metadata"),
});

export type NotificationRoutingRule = typeof notificationRoutingRulesTable.$inferSelect;
export type NotificationDeliveryLog = typeof notificationDeliveryLogTable.$inferSelect;
