import { pgTable, serial, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";

export const finActivityLogsTable = pgTable("fin_activity_logs", {
  id: serial("id").primaryKey(),
  entityType: text("entity_type").notNull(), // document | customer | supplier | payment | etc
  entityId: integer("entity_id").notNull(),
  actionType: text("action_type").notNull(), // created | updated | deleted | linked | unlinked | uploaded_file | payment_recorded | status_changed
  oldValueJson: jsonb("old_value_json"),
  newValueJson: jsonb("new_value_json"),
  description: text("description"),
  actor: text("actor").notNull().default("system"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
