// Zod schemas for inventory.inventory (stock levels)
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const CreateInventoryLevelSchema = z.object({
  material_id: z.number().int().positive(),
  warehouse_id: z.number().int().positive(),
  on_hand_qty: z.number().finite().optional().default(0),
  reserved_qty: z.number().finite().optional().default(0),
  available_qty: z.number().finite().optional().default(0),
  average_cost: z.number().finite().optional().default(0),
  notes: z.string().optional().nullable(),
  record_code: z.string().max(64).optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateInventoryLevelInput = z.infer<typeof CreateInventoryLevelSchema>;

export const UpdateInventoryLevelSchema = CreateInventoryLevelSchema.partial();
export type UpdateInventoryLevelInput = z.infer<typeof UpdateInventoryLevelSchema>;

export const ListInventoryQuerySchema = ListQueryBaseSchema.extend({
  material_id: z.coerce.number().int().optional(),
  warehouse_id: z.coerce.number().int().optional(),
  low_stock: z.coerce.boolean().optional(),
});
export type ListInventoryQuery = z.infer<typeof ListInventoryQuerySchema>;
