// Zod schemas for execution.project_phases
import { z } from "zod";
import { AuditColumns, IdSchema, PaginationQuery } from "./_shared";

export const CreateProjectPhaseSchema = z.object({
  project_id: z.coerce.number().int().positive(),
  phase_code: z.string().max(64).optional().nullable(),
  phase_name: z.string().min(1).max(200),
  phase_order: z.coerce.number().int().min(0),
  planned_start_date: z.string().optional().nullable(),
  planned_end_date: z.string().optional().nullable(),
  state: z.enum(["planned", "in_progress", "completed", "cancelled"]).optional().default("planned"),
  ...AuditColumns,
});
export type CreateProjectPhaseInput = z.infer<typeof CreateProjectPhaseSchema>;

export const UpdateProjectPhaseSchema = CreateProjectPhaseSchema.partial();
export type UpdateProjectPhaseInput = z.infer<typeof UpdateProjectPhaseSchema>;

export const ReadProjectPhaseSchema = z.object({
  id: IdSchema,
  project_id: z.number().int(),
  phase_name: z.string(),
  phase_order: z.number().int(),
  state: z.string(),
  progress_percent: z.number(),
  created_at: z.string(),
});
export type ReadProjectPhase = z.infer<typeof ReadProjectPhaseSchema>;

export const ListProjectPhasesQuerySchema = z.object({
  project_id: z.coerce.number().int().optional(),
  ...PaginationQuery,
});
