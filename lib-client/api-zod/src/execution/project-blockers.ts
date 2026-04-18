// Zod schemas for execution.project_blockers
import { z } from "zod";
import { AuditColumns, IdSchema, PaginationQuery } from "./_shared";

export const CreateProjectBlockerSchema = z.object({
  project_id: z.coerce.number().int().positive(),
  title: z.string().min(1).max(200),
  description: z.string().max(8000).optional().nullable(),
  severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  blocker_type: z.enum(["technical", "resource", "customer", "supplier", "regulatory", "other"]).default("other"),
  reported_by_user_id: z.coerce.number().int().positive().optional().nullable(),
  assigned_to_user_id: z.coerce.number().int().positive().optional().nullable(),
  due_date: z.string().optional().nullable(),
  resolved_at: z.string().optional().nullable(),
  resolution_notes: z.string().max(8000).optional().nullable(),
  state: z.enum(["open", "in_progress", "resolved", "escalated", "cancelled"]).optional().default("open"),
  ...AuditColumns,
});
export type CreateProjectBlockerInput = z.infer<typeof CreateProjectBlockerSchema>;

export const UpdateProjectBlockerSchema = CreateProjectBlockerSchema.partial();

export const ReadProjectBlockerSchema = z.object({
  id: IdSchema,
  project_id: z.number().int(),
  title: z.string(),
  severity: z.string(),
  state: z.string(),
});
export type ReadProjectBlocker = z.infer<typeof ReadProjectBlockerSchema>;

export const ListProjectBlockersQuerySchema = z.object({
  project_id: z.coerce.number().int().optional(),
  state: z.string().optional(),
  severity: z.string().optional(),
  ...PaginationQuery,
});
