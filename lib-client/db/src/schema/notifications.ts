import { pgTable, serial, text, boolean, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  moduleId: integer("module_id"),
  recordId: integer("record_id"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  userId: integer("user_id"),
  priority: text("priority").notNull().default("normal"),
  category: text("category").notNull().default("system"),
  actionUrl: text("action_url"),
  metadata: jsonb("metadata"),
  archivedAt: timestamp("archived_at"),
  deletedAt: timestamp("deleted_at"),
});

export type Notification = typeof notificationsTable.$inferSelect;
