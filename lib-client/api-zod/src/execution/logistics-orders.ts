// Zod schemas for execution.logistics_orders
import { z } from "zod";
import { AuditColumns, IdSchema, PaginationQuery } from "./_shared";

export const CreateLogisticsOrderSchema = z.object({
  logistics_number: z.string().min(1).max(64),
  project_id: z.coerce.number().int().positive().optional().nullable(),
  work_order_id: z.coerce.number().int().positive().optional().nullable(),
  warehouse_id: z.coerce.number().int().positive().optional().nullable(),
  destination_name: z.string().max(300).optional().nullable(),
  destination_address: z.string().max(500).optional().nullable(),
  scheduled_at: z.string().optional().nullable(),
  delivered_at: z.string().optional().nullable(),
  state: z.enum(["planned", "dispatched", "delivered", "cancelled"]).optional().default("planned"),
  notes: z.string().max(8000).optional().nullable(),
  ...AuditColumns,
});
export type CreateLogisticsOrderInput = z.infer<typeof CreateLogisticsOrderSchema>;

export const UpdateLogisticsOrderSchema = CreateLogisticsOrderSchema.partial();

export const ReadLogisticsOrderSchema = z.object({
  id: IdSchema,
  logistics_number: z.string(),
  project_id: z.number().int().nullable(),
  state: z.string(),
  scheduled_at: z.string().nullable(),
});

export const ListLogisticsOrdersQuerySchema = z.object({
  project_id: z.coerce.number().int().optional(),
  state: z.string().optional(),
  ...PaginationQuery,
});
