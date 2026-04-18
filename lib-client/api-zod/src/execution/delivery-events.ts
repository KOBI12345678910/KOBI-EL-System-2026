// Zod schemas for execution.delivery_events
import { z } from "zod";
import { AuditColumns, IdSchema, PaginationQuery } from "./_shared";

export const DELIVERY_STATES = ["scheduled", "in_transit", "delivered", "confirmed", "cancelled"] as const;
export const DeliveryStateSchema = z.enum(DELIVERY_STATES);

export const CreateDeliveryEventSchema = z.object({
  project_id: z.coerce.number().int().positive().optional().nullable(),
  work_order_id: z.coerce.number().int().positive().optional().nullable(),
  logistics_order_id: z.coerce.number().int().positive().optional().nullable(),
  delivered_at: z.string(),
  delivered_by_user_id: z.coerce.number().int().positive().optional().nullable(),
  received_by_name: z.string().max(300).optional().nullable(),
  state: DeliveryStateSchema.optional().default("delivered"),
  notes: z.string().max(8000).optional().nullable(),
  ...AuditColumns,
});
export type CreateDeliveryEventInput = z.infer<typeof CreateDeliveryEventSchema>;

export const UpdateDeliveryEventSchema = CreateDeliveryEventSchema.partial();

export const ReadDeliveryEventSchema = z.object({
  id: IdSchema,
  project_id: z.number().int().nullable(),
  work_order_id: z.number().int().nullable(),
  delivered_at: z.string(),
  received_by_name: z.string().nullable(),
  state: z.string(),
  created_at: z.string(),
});
export type ReadDeliveryEvent = z.infer<typeof ReadDeliveryEventSchema>;

export const ListDeliveryEventsQuerySchema = z.object({
  project_id: z.coerce.number().int().optional(),
  work_order_id: z.coerce.number().int().optional(),
  state: DeliveryStateSchema.optional(),
  ...PaginationQuery,
});
