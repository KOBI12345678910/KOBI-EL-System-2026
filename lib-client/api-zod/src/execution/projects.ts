// Zod schemas for execution.projects
import { z } from "zod";
import { AuditColumns, IdSchema, PaginationQuery, ProjectStateSchema } from "./_shared";

export const CreateProjectSchema = z.object({
  project_number: z.string().min(1).max(64),
  project_name: z.string().min(1).max(300),
  customer_id: z.coerce.number().int().positive(),
  quote_id: z.coerce.number().int().positive().optional().nullable(),
  contract_id: z.coerce.number().int().positive().optional().nullable(),
  project_type: z.string().max(100).optional().nullable(),
  location_name: z.string().max(300).optional().nullable(),
  address_line_1: z.string().max(300).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  region: z.string().max(100).optional().nullable(),
  owner_user_id: z.coerce.number().int().positive().optional().nullable(),
  budget_amount: z.coerce.number().nonnegative().optional().default(0),
  priority: z.enum(["low", "normal", "high", "critical"]).optional().nullable(),
  planned_start_date: z.string().optional().nullable(),
  planned_end_date: z.string().optional().nullable(),
  billable: z.boolean().optional().default(true),
  state: ProjectStateSchema.optional().default("draft"),
  internal_notes: z.string().max(8000).optional().nullable(),
  external_notes: z.string().max(8000).optional().nullable(),
  ...AuditColumns,
});
export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;

export const UpdateProjectSchema = CreateProjectSchema.partial();
export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>;

export const ReadProjectSchema = z.object({
  id: IdSchema,
  public_id: z.string().uuid(),
  project_number: z.string(),
  project_name: z.string(),
  customer_id: z.number().int().nullable(),
  state: z.string(),
  budget_amount: z.number(),
  actual_cost: z.number(),
  progress_percent: z.number(),
  planned_start_date: z.string().nullable(),
  planned_end_date: z.string().nullable(),
  is_active: z.boolean(),
  is_deleted: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ReadProject = z.infer<typeof ReadProjectSchema>;

export const ListProjectsQuerySchema = z.object({
  state: ProjectStateSchema.optional(),
  customer_id: z.coerce.number().int().optional(),
  owner_user_id: z.coerce.number().int().optional(),
  is_active: z.coerce.boolean().optional(),
  ...PaginationQuery,
});
export type ListProjectsQuery = z.infer<typeof ListProjectsQuerySchema>;

export const TransitionProjectSchema = z.object({
  to_state: ProjectStateSchema,
  reason: z.string().max(2000).optional(),
});
export type TransitionProjectInput = z.infer<typeof TransitionProjectSchema>;
