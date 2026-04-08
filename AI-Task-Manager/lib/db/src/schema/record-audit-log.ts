import { pgTable, serial, text, integer, boolean, timestamp, jsonb, varchar } from "drizzle-orm/pg-core";

/**
 * Enterprise Audit Log — SAP-like immutable audit trail
 * Every critical action (create, update, delete, approve, post, reverse) is logged.
 * No hard delete on this table.
 */
export const recordAuditLogTable = pgTable("record_audit_log", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  entityType: varchar("entity_type", { length: 100 }),
  entityId: integer("entity_id").notNull(),
  recordId: integer("record_id").notNull(),
  action: varchar("action", { length: 50 }).notNull(),
  actionCategory: varchar("action_category", { length: 30 }),
  previousStatus: varchar("previous_status", { length: 50 }),
  newStatus: varchar("new_status", { length: 50 }),
  changes: jsonb("changes").default({}),
  payloadBefore: jsonb("payload_before"),
  payloadAfter: jsonb("payload_after"),
  performedBy: text("performed_by"),
  performedByUserId: integer("performed_by_user_id"),
  performedByRole: varchar("performed_by_role", { length: 100 }),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  module: varchar("module", { length: 100 }),
  permissionCode: varchar("permission_code", { length: 150 }),
  approvalRequestId: integer("approval_request_id"),
  isCritical: boolean("is_critical").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
