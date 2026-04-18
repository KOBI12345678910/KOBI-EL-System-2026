// ============================================================
// Shared helpers for execution-domain zod schemas
// Generated: 2026-04-18
// ============================================================
import { z } from "zod";

export const IdSchema = z.union([z.number().int(), z.string()]);
export const NullableString = z.string().nullable().optional();
export const JsonRecord = z.record(z.unknown()).optional().default({});
export const JsonArray = z.array(z.unknown()).optional().default([]);
export const IsoDate = z.string();
export const TimestampTz = z.string();

export const AuditColumns = {
  is_deleted: z.boolean().optional().default(false),
  is_active: z.boolean().optional().default(true),
  record_code: z.string().max(128).optional().nullable(),
  notes: z.string().max(8000).optional().nullable(),
  metadata: JsonRecord,
};

export const PaginationQuery = {
  limit: z.coerce.number().int().min(1).max(500).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
  q: z.string().max(200).optional(),
  order_by: z.string().max(64).optional(),
  order_dir: z.enum(["asc", "desc"]).optional().default("desc"),
};

export const PROJECT_STATES = [
  "draft",
  "planning",
  "in_progress",
  "on_hold",
  "completed",
  "closed",
] as const;
export const ProjectStateSchema = z.enum(PROJECT_STATES);

export const WORK_ORDER_STATES = [
  "draft",
  "approved",
  "in_progress",
  "qa",
  "done",
  "closed",
] as const;
export const WorkOrderStateSchema = z.enum(WORK_ORDER_STATES);

export const TASK_STATES = [
  "backlog",
  "in_progress",
  "review",
  "done",
  "blocked",
  "cancelled",
] as const;
export const TaskStateSchema = z.enum(TASK_STATES);
