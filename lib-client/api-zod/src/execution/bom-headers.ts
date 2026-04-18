// Zod schemas for execution.bom_headers
import { z } from "zod";
import { AuditColumns, IdSchema, PaginationQuery } from "./_shared";

export const BOM_TYPES = ["engineering", "production", "service", "costing", "phantom"] as const;
export const BOM_STATES = ["draft", "in_review", "approved", "released", "obsolete"] as const;

export const CreateBomHeaderSchema = z.object({
  bom_number: z.string().min(1).max(64),
  name: z.string().min(1).max(300),
  description: z.string().max(8000).optional().nullable(),
  product_code: z.string().max(128).optional().nullable(),
  product_description: z.string().max(500).optional().nullable(),
  drawing_id: z.coerce.number().int().positive().optional().nullable(),
  project_id: z.coerce.number().int().positive().optional().nullable(),
  work_order_id: z.coerce.number().int().positive().optional().nullable(),
  version: z.string().max(32).optional().default("1.0"),
  bom_type: z.enum(BOM_TYPES).optional().default("production"),
  state: z.enum(BOM_STATES).optional().default("draft"),
  effective_from: z.string().optional().nullable(),
  effective_to: z.string().optional().nullable(),
  total_cost_estimate: z.coerce.number().nonnegative().optional().default(0),
  currency: z.string().length(3).optional().default("ILS"),
  ...AuditColumns,
});
export type CreateBomHeaderInput = z.infer<typeof CreateBomHeaderSchema>;

export const UpdateBomHeaderSchema = CreateBomHeaderSchema.partial();

export const ReadBomHeaderSchema = z.object({
  id: IdSchema,
  bom_number: z.string(),
  name: z.string(),
  version: z.string(),
  bom_type: z.string(),
  state: z.string(),
  total_cost_estimate: z.number(),
});
export type ReadBomHeader = z.infer<typeof ReadBomHeaderSchema>;

export const ListBomHeadersQuerySchema = z.object({
  project_id: z.coerce.number().int().optional(),
  bom_type: z.enum(BOM_TYPES).optional(),
  state: z.enum(BOM_STATES).optional(),
  ...PaginationQuery,
});
