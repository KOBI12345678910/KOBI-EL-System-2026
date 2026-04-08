import { pgTable, serial, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import { platformWorkflowsTable } from "./platform-workflows";
import { automationExecutionLogsTable } from "./platform-automations";

export const approvalRequestsTable = pgTable("approval_requests", {
  id: serial("id").primaryKey(),
  workflowId: integer("workflow_id").references(() => platformWorkflowsTable.id, { onDelete: "cascade" }),
  executionLogId: integer("execution_log_id").references(() => automationExecutionLogsTable.id, { onDelete: "cascade" }),
  entityId: integer("entity_id"),
  recordId: integer("record_id"),
  stepIndex: integer("step_index").notNull(),
  approverRole: text("approver_role"),
  approverEmail: text("approver_email"),
  status: text("status").notNull().default("pending"),
  approvedBy: text("approved_by"),
  comments: text("comments"),
  pendingActions: jsonb("pending_actions").notNull().default([]),
  rejectActions: jsonb("reject_actions").notNull().default([]),
  context: jsonb("context").notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
});

export type ApprovalRequest = typeof approvalRequestsTable.$inferSelect;
