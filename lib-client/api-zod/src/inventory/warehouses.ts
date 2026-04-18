// Zod schemas for inventory.warehouses
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const CreateWarehouseSchema = z.object({
  warehouse_code: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  location_name: z.string().max(200).optional().nullable(),
  address_line_1: z.string().max(300).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  manager_user_id: z.number().int().optional().nullable(),
  warehouse_type: z.string().max(64).optional().nullable(),
  active: z.boolean().optional().default(true),
  notes: z.string().optional().nullable(),
  record_code: z.string().max(64).optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateWarehouseInput = z.infer<typeof CreateWarehouseSchema>;

export const UpdateWarehouseSchema = CreateWarehouseSchema.partial();
export type UpdateWarehouseInput = z.infer<typeof UpdateWarehouseSchema>;

export const ListWarehousesQuerySchema = ListQueryBaseSchema.extend({
  active: z.coerce.boolean().optional(),
  warehouse_type: z.string().optional(),
});
export type ListWarehousesQuery = z.infer<typeof ListWarehousesQuerySchema>;
