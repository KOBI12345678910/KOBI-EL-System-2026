// Zod schemas for execution.project_resources
import { z } from "zod";
import { AuditColumns, IdSchema, PaginationQuery } from "./_shared";

export const RESOURCE_TYPES = ["employee", "team", "equipment", "vehicle", "external_contractor", "material", "other"] as const;
export const ResourceTypeSchema = z.enum(RESOURCE_TYPES);

export const CreateProjectResourceSchema = z.object({
  project_id: z.coerce.number().int().positive(),
  resource_type: ResourceTypeSchema,
  resource_ref_id: z.coerce.number().int().optional().nullable(),
  resource_name: z.string().min(1).max(300),
  allocated_hours: z.coerce.number().nonnegative().optional().default(0),
  actual_hours: z.coerce.number().nonnegative().optional().default(0),
  allocation_start: z.string().optional().nullable(),
  allocation_end: z.string().optional().nullable(),
  cost_per_hour: z.coerce.number().nonnegative().optional().default(0),
  currency: z.string().length(3).optional().default("ILS"),
  utilization_pct: z.coerce.number().min(0).max(1000).optional().default(0),
  state: z.enum(["planned", "active", "completed", "cancelled"]).optional().default("planned"),
  ...AuditColumns,
});
export type CreateProjectResourceInput = z.infer<typeof CreateProjectResourceSchema>;

export const UpdateProjectResourceSchema = CreateProjectResourceSchema.partial();

export const ReadProjectResourceSchema = z.object({
  id: IdSchema,
  project_id: z.number().int(),
  resource_type: z.string(),
  resource_name: z.string(),
  allocated_hours: z.number(),
  actual_hours: z.number(),
  state: z.string(),
});
export type ReadProjectResource = z.infer<typeof ReadProjectResourceSchema>;

export const ListProjectResourcesQuerySchema = z.object({
  project_id: z.coerce.number().int().optional(),
  resource_type: ResourceTypeSchema.optional(),
  state: z.string().optional(),
  ...PaginationQuery,
});
