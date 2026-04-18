// Zod schemas for inventory.material_categories
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const CreateMaterialCategorySchema = z.object({
  category_code: z.string().min(1).max(64),
  category_name: z.string().min(1).max(200),
  parent_category_id: z.number().int().optional().nullable(),
  active: z.boolean().optional().default(true),
  notes: z.string().optional().nullable(),
  record_code: z.string().max(64).optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateMaterialCategoryInput = z.infer<typeof CreateMaterialCategorySchema>;

export const UpdateMaterialCategorySchema = CreateMaterialCategorySchema.partial();
export type UpdateMaterialCategoryInput = z.infer<typeof UpdateMaterialCategorySchema>;

export const ListMaterialCategoriesQuerySchema = ListQueryBaseSchema.extend({
  active: z.coerce.boolean().optional(),
  parent_category_id: z.coerce.number().int().optional(),
});
export type ListMaterialCategoriesQuery = z.infer<typeof ListMaterialCategoriesQuerySchema>;
