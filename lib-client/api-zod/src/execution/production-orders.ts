// Zod schemas for execution.production_orders
import { z } from "zod";
import { AuditColumns, IdSchema, PaginationQuery } from "./_shared";

export const PRODUCTION_ORDER_STATES = ["draft", "scheduled", "released", "in_progress", "paused", "completed", "closed", "cancelled"] as const;
export const ProductionOrderStateSchema = z.enum(PRODUCTION_ORDER_STATES);

export const CreateProductionOrderSchema = z.object({
  order_number: z.string().min(1).max(64),
  work_order_id: z.coerce.number().int().positive().optional().nullable(),
  project_id: z.coerce.number().int().positive().optional().nullable(),
  product_code: z.string().max(128).optional().nullable(),
  product_description: z.string().max(500).optional().nullable(),
  quantity_ordered: z.coerce.number().nonnegative().optional().default(0),
  quantity_produced: z.coerce.number().nonnegative().optional().default(0),
  quantity_scrap: z.coerce.number().nonnegative().optional().default(0),
  uom: z.string().max(20).optional().default("EA"),
  work_center_id: z.coerce.number().int().positive().optional().nullable(),
  planned_start: z.string().optional().nullable(),
  planned_end: z.string().optional().nullable(),
  actual_start: z.string().optional().nullable(),
  actual_end: z.string().optional().nullable(),
  state: ProductionOrderStateSchema.optional().default("draft"),
  priority: z.enum(["low", "normal", "high", "critical"]).optional().default("normal"),
  progress_percent: z.coerce.number().min(0).max(100).optional().default(0),
  ...AuditColumns,
});
export type CreateProductionOrderInput = z.infer<typeof CreateProductionOrderSchema>;

export const UpdateProductionOrderSchema = CreateProductionOrderSchema.partial();

export const ReadProductionOrderSchema = z.object({
  id: IdSchema,
  order_number: z.string(),
  product_code: z.string().nullable(),
  quantity_ordered: z.number(),
  quantity_produced: z.number(),
  state: z.string(),
  priority: z.string(),
  planned_start: z.string().nullable(),
});
export type ReadProductionOrder = z.infer<typeof ReadProductionOrderSchema>;

export const ListProductionOrdersQuerySchema = z.object({
  state: ProductionOrderStateSchema.optional(),
  work_center_id: z.coerce.number().int().optional(),
  project_id: z.coerce.number().int().optional(),
  priority: z.string().optional(),
  ...PaginationQuery,
});
