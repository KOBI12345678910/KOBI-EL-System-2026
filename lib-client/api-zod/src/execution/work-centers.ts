// Zod schemas for execution.work_centers
import { z } from "zod";
import { AuditColumns, IdSchema, PaginationQuery } from "./_shared";

export const CENTER_TYPES = ["machining", "welding", "assembly", "painting", "packaging", "cutting", "finishing", "inspection", "other"] as const;
export const CenterTypeSchema = z.enum(CENTER_TYPES);

export const CreateWorkCenterSchema = z.object({
  code: z.string().min(1).max(64),
  name_he: z.string().min(1).max(200),
  name_en: z.string().max(200).optional().nullable(),
  center_type: CenterTypeSchema,
  capacity_hours_day: z.coerce.number().min(0).max(24).optional().default(8),
  efficiency_pct: z.coerce.number().min(0).max(200).optional().default(100),
  hourly_cost: z.coerce.number().nonnegative().optional().default(0),
  currency: z.string().length(3).optional().default("ILS"),
  location_name: z.string().max(200).optional().nullable(),
  supervisor_user_id: z.coerce.number().int().positive().optional().nullable(),
  description: z.string().max(4000).optional().nullable(),
  ...AuditColumns,
});
export type CreateWorkCenterInput = z.infer<typeof CreateWorkCenterSchema>;

export const UpdateWorkCenterSchema = CreateWorkCenterSchema.partial();

export const ReadWorkCenterSchema = z.object({
  id: IdSchema,
  code: z.string(),
  name_he: z.string(),
  center_type: z.string(),
  capacity_hours_day: z.number(),
  is_active: z.boolean(),
});
export type ReadWorkCenter = z.infer<typeof ReadWorkCenterSchema>;

export const ListWorkCentersQuerySchema = z.object({
  center_type: CenterTypeSchema.optional(),
  is_active: z.coerce.boolean().optional(),
  ...PaginationQuery,
});
