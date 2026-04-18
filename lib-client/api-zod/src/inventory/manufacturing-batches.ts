// Zod schemas for inventory.manufacturing_batches
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const BATCH_STATES = ["Open", "InProgress", "Completed", "Cancelled"] as const;
export const BatchStateSchema = z.enum(BATCH_STATES);

export const CreateManufacturingBatchSchema = z.object({
  batch_number: z.string().min(1).max(64),
  project_id: z.number().int().optional().nullable(),
  work_order_id: z.number().int().optional().nullable(),
  started_at: z.string().optional().nullable(),
  completed_at: z.string().optional().nullable(),
  state: BatchStateSchema.optional().default("Open"),
  notes: z.string().optional().nullable(),
  record_code: z.string().max(64).optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateManufacturingBatchInput = z.infer<typeof CreateManufacturingBatchSchema>;

export const UpdateManufacturingBatchSchema = CreateManufacturingBatchSchema.partial();
export type UpdateManufacturingBatchInput = z.infer<typeof UpdateManufacturingBatchSchema>;

export const ListManufacturingBatchesQuerySchema = ListQueryBaseSchema.extend({
  state: BatchStateSchema.optional(),
  project_id: z.coerce.number().int().optional(),
  work_order_id: z.coerce.number().int().optional(),
});
export type ListManufacturingBatchesQuery = z.infer<typeof ListManufacturingBatchesQuerySchema>;

export const ConsumeMaterialsSchema = z.object({
  lines: z.array(z.object({
    material_id: z.number().int().positive(),
    warehouse_id: z.number().int().positive(),
    quantity: z.number().finite().positive(),
    lot_id: z.number().int().optional().nullable(),
  })).min(1),
});
export type ConsumeMaterialsInput = z.infer<typeof ConsumeMaterialsSchema>;
