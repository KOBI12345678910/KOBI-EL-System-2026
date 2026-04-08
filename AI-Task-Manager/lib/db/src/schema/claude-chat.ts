import { pgTable, serial, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const claudeChatConversationsTable = pgTable("claude_chat_conversations", {
  id: serial("id").primaryKey(),
  channel: text("channel").notNull(),
  title: text("title").notNull(),
  model: text("model").notNull().default("claude-sonnet-4-6"),
  status: text("status").notNull().default("active"),
  totalMessages: integer("total_messages").notNull().default(0),
  totalInputTokens: integer("total_input_tokens").notNull().default(0),
  totalOutputTokens: integer("total_output_tokens").notNull().default(0),
  pinned: boolean("pinned").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const claudeChatMessagesTable = pgTable("claude_chat_messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  channel: text("channel").notNull(),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  model: text("model"),
  responseTimeMs: integer("response_time_ms"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertChatConversationSchema = createInsertSchema(claudeChatConversationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertChatConversation = z.infer<typeof insertChatConversationSchema>;
export type ChatConversation = typeof claudeChatConversationsTable.$inferSelect;

export const insertChatMessageSchema = createInsertSchema(claudeChatMessagesTable).omit({ id: true, createdAt: true });
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessage = typeof claudeChatMessagesTable.$inferSelect;
