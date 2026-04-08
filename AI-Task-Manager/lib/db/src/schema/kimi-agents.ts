import { pgTable, serial, text, boolean, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const kimiAgentsTable = pgTable("kimi_agents", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  systemPrompt: text("system_prompt").notNull(),
  defaultModel: text("default_model").notNull().default("moonshot-v1-8k"),
  icon: text("icon").notNull().default("🤖"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const kimiConversationsTable = pgTable("kimi_conversations", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().default(""),
  agentId: integer("agent_id"),
  title: text("title").notNull(),
  model: text("model").notNull().default("moonshot-v1-8k"),
  status: text("status").notNull().default("active"),
  totalMessages: integer("total_messages").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const kimiMessagesTable = pgTable("kimi_messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  model: text("model"),
  responseTimeMs: integer("response_time_ms"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertKimiAgentSchema = createInsertSchema(kimiAgentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertKimiAgent = z.infer<typeof insertKimiAgentSchema>;
export type KimiAgent = typeof kimiAgentsTable.$inferSelect;

export const insertKimiConversationSchema = createInsertSchema(kimiConversationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertKimiConversation = z.infer<typeof insertKimiConversationSchema>;
export type KimiConversation = typeof kimiConversationsTable.$inferSelect;

export const insertKimiMessageSchema = createInsertSchema(kimiMessagesTable).omit({ id: true, createdAt: true });
export type InsertKimiMessage = z.infer<typeof insertKimiMessageSchema>;
export type KimiMessage = typeof kimiMessagesTable.$inferSelect;
