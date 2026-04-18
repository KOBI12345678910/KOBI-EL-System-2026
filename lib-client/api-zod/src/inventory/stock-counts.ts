// Zod schemas for inventory.stock_counts
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema, StockCountStatusSchema } from "./_shared";

export const CreateStockCountSchema = z.object({
  count_number: z.string().min(1).max(64),
  warehouse_id: z.number().int().positive(),
  counted_at: z.string(),
  counted_by_user_id: z.number().int().optional().nullable(),
  status: StockCountStatusSchema.optional().default("planned"),
  notes: z.string().optional().nullable(),
  record_code: z.string().max(64).optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateStockCountInput = z.infer<typeof CreateStockCountSchema>;

export const UpdateStockCountSchema = CreateStockCountSchema.partial();
export type UpdateStockCountInput = z.infer<typeof UpdateStockCountSchema>;

export const ListStockCountsQuerySchema = ListQueryBaseSchema.extend({
  warehouse_id: z.coerce.number().int().optional(),
  status: StockCountStatusSchema.optional(),
});
export type ListStockCountsQuery = z.infer<typeof ListStockCountsQuerySchema>;
