// Zod schemas for inventory.inventory_reservations
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const RESERVATION_STATES = ["Reserved", "Released", "Consumed"] as const;
export const ReservationStateSchema = z.enum(RESERVATION_STATES);

export const CreateInventoryReservationSchema = z.object({
  material_id: z.number().int().positive(),
  warehouse_id: z.number().int().positive(),
  project_id: z.number().int().optional().nullable(),
  work_order_id: z.number().int().optional().nullable(),
  reserved_qty: z.number().finite().positive(),
  reserved_by_user_id: z.number().int().optional().nullable(),
  state: ReservationStateSchema.optional().default("Reserved"),
  notes: z.string().optional().nullable(),
  record_code: z.string().max(64).optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateInventoryReservationInput = z.infer<typeof CreateInventoryReservationSchema>;

export const UpdateInventoryReservationSchema = CreateInventoryReservationSchema.partial();
export type UpdateInventoryReservationInput = z.infer<typeof UpdateInventoryReservationSchema>;

export const ListInventoryReservationsQuerySchema = ListQueryBaseSchema.extend({
  material_id: z.coerce.number().int().optional(),
  warehouse_id: z.coerce.number().int().optional(),
  project_id: z.coerce.number().int().optional(),
  state: ReservationStateSchema.optional(),
});
export type ListInventoryReservationsQuery = z.infer<typeof ListInventoryReservationsQuerySchema>;
