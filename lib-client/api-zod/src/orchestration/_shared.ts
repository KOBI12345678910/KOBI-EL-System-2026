// ============================================================
// Shared primitives for orchestration zod schemas
// ============================================================
import { z } from "zod";

export const IdSchema = z.union([z.number().int().positive(), z.string()]);
export const NullableString = z.string().optional().nullable();
export const NullableNumber = z.number().optional().nullable();
export const NullableDate = z.string().optional().nullable();
export const MetadataSchema = z.record(z.unknown()).optional().default({});
export const JsonSchema = z.record(z.unknown()).optional().default({});

export const ListQueryBaseSchema = z.object({
  q: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
  order_by: z.string().max(64).optional().default("id"),
  order_dir: z.enum(["asc", "desc"]).optional().default("desc"),
});
export type ListQueryBase = z.infer<typeof ListQueryBaseSchema>;

// ---------- shared status enums ----------
export const WORKFLOW_RUN_STATUSES = [
  "pending", "running", "completed", "failed", "paused", "canceled",
] as const;
export const WorkflowRunStatusSchema = z.enum(WORKFLOW_RUN_STATUSES);

export const WORKFLOW_STEP_RUN_STATUSES = [
  "pending", "running", "complete", "failed", "skipped",
] as const;
export const WorkflowStepRunStatusSchema = z.enum(WORKFLOW_STEP_RUN_STATUSES);

export const JOB_QUEUE_STATUSES = [
  "pending", "running", "completed", "failed", "cancelled",
] as const;
export const JobQueueStatusSchema = z.enum(JOB_QUEUE_STATUSES);

export const INBOX_STATUSES = [
  "open", "claimed", "resolved", "dismissed",
] as const;
export const InboxStatusSchema = z.enum(INBOX_STATUSES);

export const NOTIFICATION_STATUSES = [
  "pending", "sent", "read", "dismissed", "failed",
] as const;
export const NotificationStatusSchema = z.enum(NOTIFICATION_STATUSES);

export const TRIGGER_TYPES = ["schedule", "event", "webhook", "manual"] as const;
export const TriggerTypeSchema = z.enum(TRIGGER_TYPES);

export const STEP_TYPES = [
  "action", "validation", "notification", "approval", "wait", "branch", "parallel",
] as const;
export const StepTypeSchema = z.enum(STEP_TYPES);

export const PRIORITY_LEVELS = ["low", "normal", "high", "urgent"] as const;
export const PrioritySchema = z.enum(PRIORITY_LEVELS);
