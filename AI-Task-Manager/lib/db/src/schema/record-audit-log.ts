import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

export const recordAuditLogTable = pgTable("record_audit_log", {
  id: serial("id").primaryKey(),
  entityId: integer("entity_id").notNull(),
  recordId: integer("record_id").notNull(),
  action: text("action").notNull(),
  changes: jsonb("changes").default({}),
  performedBy: text("performed_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
