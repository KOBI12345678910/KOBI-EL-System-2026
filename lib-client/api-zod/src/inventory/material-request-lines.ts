// Zod schemas for inventory.material_request_lines
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const CreateMaterialRequestLineSchema = z.object({
  material_request_id: z.number().int().positive(),
  material_id: z.number().int().positive(),
  requested_qty: z.number().finite().positive(),
  reserved_qty: z.number().finite().optional().default(0),
  procured_qty: z.number().finite().optional().default(0),
  needed_by_date: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateMaterialRequestLineInput = z.infer<typeof CreateMaterialRequestLineSchema>;

export const UpdateMaterialRequestLineSchema = CreateMaterialRequestLineSchema.partial();
export type UpdateMaterialRequestLineInput = z.infer<typeof UpdateMaterialRequestLineSchema>;

export const ListMaterialRequestLinesQuerySchema = ListQueryBaseSchema.extend({
  material_request_id: z.coerce.number().int().optional(),
  material_id: z.coerce.number().int().optional(),
});
export type ListMaterialRequestLinesQuery = z.infer<typeof ListMaterialRequestLinesQuerySchema>;
