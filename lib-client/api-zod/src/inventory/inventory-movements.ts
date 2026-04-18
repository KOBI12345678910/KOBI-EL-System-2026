// Zod schemas for inventory.inventory_movements
import { z } from "zod";
import { InventoryMovementStatusSchema, ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const MOVEMENT_TYPES = [
  "receipt", "issue", "transfer_in", "transfer_out", "adjustment", "return", "reserve", "release",
] as const;
export const MovementTypeSchema = z.enum(MOVEMENT_TYPES);

export const CreateInventoryMovementSchema = z.object({
  movement_code: z.string().max(64).optional().nullable(),
  material_id: z.number().int().positive(),
  warehouse_id: z.number().int().positive(),
  lot_id: z.number().int().optional().nullable(),
  movement_type: MovementTypeSchema,
  quantity: z.number().finite(),
  unit_cost: z.number().finite().optional().nullable(),
  movement_date: z.string().optional(),
  reference_type: z.string().max(64).optional().nullable(),
  reference_id: z.number().int().optional().nullable(),
  status: InventoryMovementStatusSchema.optional().default("pending"),
  notes: z.string().optional().nullable(),
  record_code: z.string().max(64).optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateInventoryMovementInput = z.infer<typeof CreateInventoryMovementSchema>;

export const UpdateInventoryMovementSchema = CreateInventoryMovementSchema.partial();
export type UpdateInventoryMovementInput = z.infer<typeof UpdateInventoryMovementSchema>;

export const ListInventoryMovementsQuerySchema = ListQueryBaseSchema.extend({
  material_id: z.coerce.number().int().optional(),
  warehouse_id: z.coerce.number().int().optional(),
  movement_type: MovementTypeSchema.optional(),
  status: InventoryMovementStatusSchema.optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
});
export type ListInventoryMovementsQuery = z.infer<typeof ListInventoryMovementsQuerySchema>;
