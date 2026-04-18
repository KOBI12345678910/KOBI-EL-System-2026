// Zod schemas for inventory.inventory_transfers
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const TRANSFER_STATUSES = ["pending", "in_transit", "executed", "cancelled"] as const;
export const TransferStatusSchema = z.enum(TRANSFER_STATUSES);

export const CreateInventoryTransferSchema = z.object({
  transfer_number: z.string().min(1).max(64),
  material_id: z.number().int().positive(),
  from_warehouse_id: z.number().int().positive(),
  to_warehouse_id: z.number().int().positive(),
  quantity_transferred: z.number().finite().positive(),
  transfer_date: z.string(),
  transferred_by_user_id: z.number().int().optional().nullable(),
  status: TransferStatusSchema.optional().default("pending"),
  notes: z.string().optional().nullable(),
  record_code: z.string().max(64).optional().nullable(),
  metadata: MetadataSchema,
}).refine(d => d.from_warehouse_id !== d.to_warehouse_id, {
  message: "from_warehouse_id must differ from to_warehouse_id",
  path: ["to_warehouse_id"],
});
export type CreateInventoryTransferInput = z.infer<typeof CreateInventoryTransferSchema>;

export const UpdateInventoryTransferSchema = z.object({
  transfer_number: z.string().min(1).max(64).optional(),
  material_id: z.number().int().positive().optional(),
  from_warehouse_id: z.number().int().positive().optional(),
  to_warehouse_id: z.number().int().positive().optional(),
  quantity_transferred: z.number().finite().positive().optional(),
  transfer_date: z.string().optional(),
  transferred_by_user_id: z.number().int().optional().nullable(),
  status: TransferStatusSchema.optional(),
  notes: z.string().optional().nullable(),
  record_code: z.string().max(64).optional().nullable(),
  metadata: MetadataSchema,
});
export type UpdateInventoryTransferInput = z.infer<typeof UpdateInventoryTransferSchema>;

export const ListInventoryTransfersQuerySchema = ListQueryBaseSchema.extend({
  material_id: z.coerce.number().int().optional(),
  from_warehouse_id: z.coerce.number().int().optional(),
  to_warehouse_id: z.coerce.number().int().optional(),
  status: TransferStatusSchema.optional(),
});
export type ListInventoryTransfersQuery = z.infer<typeof ListInventoryTransfersQuerySchema>;
