import { pgTable, serial, text, varchar, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const chatChannelsTable = pgTable("chat_channels", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  type: varchar("type", { length: 20 }).notNull().default("group"),
  department: varchar("department", { length: 100 }),
  isDefault: boolean("is_default").notNull().default(false),
  icon: varchar("icon", { length: 50 }),
  createdBy: integer("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const chatChannelMembersTable = pgTable("chat_channel_members", {
  id: serial("id").primaryKey(),
  channelId: integer("channel_id").notNull().references(() => chatChannelsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 20 }).notNull().default("member"),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
  lastReadAt: timestamp("last_read_at"),
});

export const chatMessagesTable = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  channelId: integer("channel_id").references(() => chatChannelsTable.id, { onDelete: "cascade" }),
  senderId: integer("sender_id").notNull().references(() => usersTable.id),
  recipientId: integer("recipient_id").references(() => usersTable.id),
  content: text("content").notNull(),
  messageType: varchar("message_type", { length: 30 }).notNull().default("text"),
  attachments: jsonb("attachments"),
  metadata: jsonb("metadata"),
  isPinned: boolean("is_pinned").notNull().default(false),
  isEdited: boolean("is_edited").notNull().default(false),
  isDeleted: boolean("is_deleted").notNull().default(false),
  isInternal: boolean("is_internal").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const chatDirectConversationsTable = pgTable("chat_direct_conversations", {
  id: serial("id").primaryKey(),
  user1Id: integer("user1_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  user2Id: integer("user2_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  lastMessageAt: timestamp("last_message_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const chatReadReceiptsTable = pgTable("chat_read_receipts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  channelId: integer("channel_id").references(() => chatChannelsTable.id, { onDelete: "cascade" }),
  directConversationId: integer("direct_conversation_id").references(() => chatDirectConversationsTable.id, { onDelete: "cascade" }),
  lastReadMessageId: integer("last_read_message_id").references(() => chatMessagesTable.id),
  lastReadAt: timestamp("last_read_at").notNull().defaultNow(),
});

export const supportTicketsTable = pgTable("support_tickets", {
  id: serial("id").primaryKey(),
  ticketNumber: varchar("ticket_number", { length: 30 }).notNull().unique(),
  subject: varchar("subject", { length: 300 }).notNull(),
  description: text("description").notNull(),
  status: varchar("status", { length: 30 }).notNull().default("open"),
  priority: varchar("priority", { length: 20 }).notNull().default("medium"),
  createdBy: integer("created_by").notNull().references(() => usersTable.id),
  assignedTo: integer("assigned_to").references(() => usersTable.id),
  channelId: integer("channel_id").references(() => chatChannelsTable.id),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
