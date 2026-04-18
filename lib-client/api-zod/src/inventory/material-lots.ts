// Zod schemas for inventory.material_lots
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const CreateMaterialLotSchema = z.object({
  lot_number: z.string().min(1).max(128),
  material_id: z.number().int().positive(),
  warehouse_id: z.number().int().positive(),
  supplier_id: z.number().int().optional().nullable(),
  expiry_date: z.string().optional().nullable(),
  quantity_on_hand: z.number().finite().optional().default(0),
  unit_cost: z.number().finite().optional().nullable(),
  status: z.enum(["active", "quarantined", "consumed", "expired"]).optional().default("active"),
  notes: z.string().optional().nullable(),
  record_code: z.string().max(64).optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateMaterialLotInput = z.infer<typeof CreateMaterialLotSchema>;

export const UpdateMaterialLotSchema = CreateMaterialLotSchema.partial();
export type UpdateMaterialLotInput = z.infer<typeof UpdateMaterialLotSchema>;

export const ListMaterialLotsQuerySchema = ListQueryBaseSchema.extend({
  material_id: z.coerce.number().int().optional(),
  warehouse_id: z.coerce.number().int().optional(),
  status: z.string().optional(),
  lot_number: z.string().optional(),
});
export type ListMaterialLotsQuery = z.infer<typeof ListMaterialLotsQuerySchema>;
