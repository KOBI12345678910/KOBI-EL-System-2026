// Zod schemas for inventory.stock_count_lines
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const CreateStockCountLineSchema = z.object({
  stock_count_id: z.number().int().positive(),
  material_id: z.number().int().positive(),
  system_qty: z.number().finite(),
  counted_qty: z.number().finite(),
  variance_qty: z.number().finite(),
  notes: z.string().optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateStockCountLineInput = z.infer<typeof CreateStockCountLineSchema>;

export const UpdateStockCountLineSchema = CreateStockCountLineSchema.partial();
export type UpdateStockCountLineInput = z.infer<typeof UpdateStockCountLineSchema>;

export const ListStockCountLinesQuerySchema = ListQueryBaseSchema.extend({
  stock_count_id: z.coerce.number().int().optional(),
  material_id: z.coerce.number().int().optional(),
});
export type ListStockCountLinesQuery = z.infer<typeof ListStockCountLinesQuerySchema>;
