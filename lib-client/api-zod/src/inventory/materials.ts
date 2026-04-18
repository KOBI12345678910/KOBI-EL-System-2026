// Zod schemas for inventory.materials
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const CreateMaterialSchema = z.object({
  material_code: z.string().min(1).max(64),
  name: z.string().min(1).max(300),
  description: z.string().optional().nullable(),
  category_id: z.number().int().optional().nullable(),
  unit_of_measure: z.string().max(32).optional().nullable(),
  preferred_supplier_id: z.number().int().optional().nullable(),
  standard_cost: z.number().finite().optional().default(0),
  reorder_point: z.number().finite().optional().nullable(),
  safety_stock: z.number().finite().optional().nullable(),
  barcode: z.string().max(128).optional().nullable(),
  active: z.boolean().optional().default(true),
  notes: z.string().optional().nullable(),
  record_code: z.string().max(64).optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateMaterialInput = z.infer<typeof CreateMaterialSchema>;

export const UpdateMaterialSchema = CreateMaterialSchema.partial();
export type UpdateMaterialInput = z.infer<typeof UpdateMaterialSchema>;

export const ListMaterialsQuerySchema = ListQueryBaseSchema.extend({
  category_id: z.coerce.number().int().optional(),
  active: z.coerce.boolean().optional(),
  barcode: z.string().optional(),
});
export type ListMaterialsQuery = z.infer<typeof ListMaterialsQuerySchema>;
