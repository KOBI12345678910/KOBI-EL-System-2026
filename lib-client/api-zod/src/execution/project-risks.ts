// Zod schemas for execution.project_risks
import { z } from "zod";
import { AuditColumns, IdSchema, PaginationQuery } from "./_shared";

export const CreateProjectRiskSchema = z.object({
  project_id: z.coerce.number().int().positive(),
  risk_title: z.string().min(1).max(200),
  description: z.string().max(8000).optional().nullable(),
  likelihood: z.enum(["very_low", "low", "medium", "high", "very_high"]).default("medium"),
  impact: z.enum(["very_low", "low", "medium", "high", "very_high"]).default("medium"),
  mitigation_plan: z.string().max(8000).optional().nullable(),
  owner_user_id: z.coerce.number().int().positive().optional().nullable(),
  state: z.enum(["identified", "mitigating", "accepted", "closed"]).optional().default("identified"),
  ...AuditColumns,
});
export type CreateProjectRiskInput = z.infer<typeof CreateProjectRiskSchema>;

export const UpdateProjectRiskSchema = CreateProjectRiskSchema.partial();

export const ReadProjectRiskSchema = z.object({
  id: IdSchema,
  project_id: z.number().int(),
  risk_title: z.string(),
  likelihood: z.string(),
  impact: z.string(),
  state: z.string(),
});
export type ReadProjectRisk = z.infer<typeof ReadProjectRiskSchema>;

export const ListProjectRisksQuerySchema = z.object({
  project_id: z.coerce.number().int().optional(),
  state: z.string().optional(),
  ...PaginationQuery,
});
