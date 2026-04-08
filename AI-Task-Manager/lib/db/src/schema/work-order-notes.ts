import { pgTable, serial, text, integer, timestamp, boolean, varchar } from "drizzle-orm/pg-core";

export const workOrderNotesTable = pgTable("work_order_notes", {
  id: serial("id").primaryKey(),
  workOrderId: integer("work_order_id").notNull(),
  userId: integer("user_id").notNull(),
  content: text("content").notNull(),
  type: varchar("type", { length: 30 }).default("note"),
  isInternal: boolean("is_internal").notNull().default(false),
  attachmentUrl: text("attachment_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
