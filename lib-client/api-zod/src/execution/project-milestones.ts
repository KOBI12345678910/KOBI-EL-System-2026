// Zod schemas for execution.project_milestones
import { z } from "zod";
import { AuditColumns, IdSchema, PaginationQuery } from "./_shared";

export const CreateProjectMilestoneSchema = z.object({
  project_id: z.coerce.number().int().positive(),
  phase_id: z.coerce.number().int().positive().optional().nullable(),
  milestone_name: z.string().min(1).max(200),
  due_date: z.string().optional().nullable(),
  achieved_at: z.string().optional().nullable(),
  state: z.enum(["pending", "achieved", "missed", "cancelled"]).optional().default("pending"),
  notes: z.string().max(4000).optional().nullable(),
  ...AuditColumns,
});
export type CreateProjectMilestoneInput = z.infer<typeof CreateProjectMilestoneSchema>;

export const UpdateProjectMilestoneSchema = CreateProjectMilestoneSchema.partial();

export const ReadProjectMilestoneSchema = z.object({
  id: IdSchema,
  project_id: z.number().int(),
  milestone_name: z.string(),
  due_date: z.string().nullable(),
  state: z.string(),
  achieved_at: z.string().nullable(),
});
export type ReadProjectMilestone = z.infer<typeof ReadProjectMilestoneSchema>;

export const ListProjectMilestonesQuerySchema = z.object({
  project_id: z.coerce.number().int().optional(),
  state: z.string().optional(),
  ...PaginationQuery,
});
