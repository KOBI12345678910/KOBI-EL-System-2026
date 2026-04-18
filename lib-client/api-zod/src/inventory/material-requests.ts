// Zod schemas for inventory.material_requests
import { z } from "zod";
import { ListQueryBaseSchema, MaterialRequestStatusSchema, MetadataSchema } from "./_shared";

export const CreateMaterialRequestSchema = z.object({
  request_number: z.string().min(1).max(64),
  project_id: z.number().int().optional().nullable(),
  work_order_id: z.number().int().optional().nullable(),
  requested_by_user_id: z.number().int().optional().nullable(),
  requested_date: z.string(),
  needed_by_date: z.string().optional().nullable(),
  status: MaterialRequestStatusSchema.optional().default("draft"),
  notes: z.string().optional().nullable(),
  record_code: z.string().max(64).optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateMaterialRequestInput = z.infer<typeof CreateMaterialRequestSchema>;

export const UpdateMaterialRequestSchema = CreateMaterialRequestSchema.partial();
export type UpdateMaterialRequestInput = z.infer<typeof UpdateMaterialRequestSchema>;

export const ListMaterialRequestsQuerySchema = ListQueryBaseSchema.extend({
  status: MaterialRequestStatusSchema.optional(),
  project_id: z.coerce.number().int().optional(),
  work_order_id: z.coerce.number().int().optional(),
});
export type ListMaterialRequestsQuery = z.infer<typeof ListMaterialRequestsQuerySchema>;
