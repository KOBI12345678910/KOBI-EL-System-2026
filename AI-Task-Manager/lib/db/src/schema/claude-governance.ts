import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

export const claudeGovernanceLogsTable = pgTable("claude_governance_logs", {
  id: serial("id").primaryKey(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  moduleId: integer("module_id"),
  status: text("status").notNull().default("pending"),
  validationResult: jsonb("validation_result").default({}),
  changeSetId: text("change_set_id"),
  previousState: jsonb("previous_state"),
  newState: jsonb("new_state"),
  performedBy: text("performed_by").default("claude"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
