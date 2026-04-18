// Zod schemas for execution.punch_lists
import { z } from "zod";
import { AuditColumns, IdSchema, PaginationQuery } from "./_shared";

export const PUNCH_LIST_STATES = ["open", "in_progress", "resolved", "verified", "closed", "cancelled"] as const;
export const PUNCH_LIST_SEVERITIES = ["trivial", "minor", "major", "blocker"] as const;

export const CreatePunchListSchema = z.object({
  list_number: z.string().min(1).max(64),
  project_id: z.coerce.number().int().positive().optional().nullable(),
  work_order_id: z.coerce.number().int().positive().optional().nullable(),
  installation_event_id: z.coerce.number().int().positive().optional().nullable(),
  title: z.string().min(1).max(300),
  description: z.string().max(8000).optional().nullable(),
  severity: z.enum(PUNCH_LIST_SEVERITIES).optional().default("minor"),
  category: z.enum(["cosmetic", "mechanical", "electrical", "structural", "documentation", "safety", "other"]).optional().nullable(),
  reported_by_user_id: z.coerce.number().int().positive().optional().nullable(),
  assigned_to_user_id: z.coerce.number().int().positive().optional().nullable(),
  due_date: z.string().optional().nullable(),
  resolution_notes: z.string().max(8000).optional().nullable(),
  resolved_at: z.string().optional().nullable(),
  state: z.enum(PUNCH_LIST_STATES).optional().default("open"),
  photos: z.array(z.string()).optional().default([]),
  ...AuditColumns,
});
export type CreatePunchListInput = z.infer<typeof CreatePunchListSchema>;

export const UpdatePunchListSchema = CreatePunchListSchema.partial();

export const ReadPunchListSchema = z.object({
  id: IdSchema,
  list_number: z.string(),
  title: z.string(),
  severity: z.string(),
  state: z.string(),
});
export type ReadPunchList = z.infer<typeof ReadPunchListSchema>;

export const ListPunchListsQuerySchema = z.object({
  project_id: z.coerce.number().int().optional(),
  work_order_id: z.coerce.number().int().optional(),
  state: z.string().optional(),
  severity: z.string().optional(),
  ...PaginationQuery,
});
