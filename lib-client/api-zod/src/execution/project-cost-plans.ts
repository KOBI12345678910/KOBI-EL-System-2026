// Zod schemas for execution.project_cost_plans
import { z } from "zod";
import { AuditColumns, IdSchema, PaginationQuery } from "./_shared";

export const CreateProjectCostPlanSchema = z.object({
  project_id: z.coerce.number().int().positive(),
  cost_category: z.enum(["labor", "materials", "equipment", "subcontractor", "overhead", "contingency", "other"]),
  description: z.string().max(500).optional().nullable(),
  planned_amount: z.coerce.number().nonnegative(),
  actual_amount: z.coerce.number().nonnegative().optional().default(0),
  committed_amount: z.coerce.number().nonnegative().optional().default(0),
  currency: z.string().length(3).optional().default("ILS"),
  period_start: z.string().optional().nullable(),
  period_end: z.string().optional().nullable(),
  ...AuditColumns,
});
export type CreateProjectCostPlanInput = z.infer<typeof CreateProjectCostPlanSchema>;

export const UpdateProjectCostPlanSchema = CreateProjectCostPlanSchema.partial();

export const ReadProjectCostPlanSchema = z.object({
  id: IdSchema,
  project_id: z.number().int(),
  cost_category: z.string(),
  planned_amount: z.number(),
  actual_amount: z.number(),
  currency: z.string(),
});
export type ReadProjectCostPlan = z.infer<typeof ReadProjectCostPlanSchema>;

export const ListProjectCostPlansQuerySchema = z.object({
  project_id: z.coerce.number().int().optional(),
  cost_category: z.string().optional(),
  ...PaginationQuery,
});
