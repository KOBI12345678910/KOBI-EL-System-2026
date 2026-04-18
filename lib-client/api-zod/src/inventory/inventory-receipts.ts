// Zod schemas for inventory.inventory_receipts
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const RECEIPT_STATUSES = ["pending", "posted", "reversed"] as const;
export const ReceiptStatusSchema = z.enum(RECEIPT_STATUSES);

export const CreateInventoryReceiptSchema = z.object({
  receipt_number: z.string().min(1).max(64),
  po_id: z.number().int().optional().nullable(),
  po_line_id: z.number().int().optional().nullable(),
  material_id: z.number().int().positive(),
  warehouse_id: z.number().int().positive(),
  quantity_received: z.number().finite().positive(),
  unit_cost: z.number().finite().optional().nullable(),
  receipt_date: z.string(),
  batch_reference: z.string().max(128).optional().nullable(),
  received_by_user_id: z.number().int().optional().nullable(),
  status: ReceiptStatusSchema.optional().default("pending"),
  notes: z.string().optional().nullable(),
  record_code: z.string().max(64).optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateInventoryReceiptInput = z.infer<typeof CreateInventoryReceiptSchema>;

export const UpdateInventoryReceiptSchema = CreateInventoryReceiptSchema.partial();
export type UpdateInventoryReceiptInput = z.infer<typeof UpdateInventoryReceiptSchema>;

export const ListInventoryReceiptsQuerySchema = ListQueryBaseSchema.extend({
  material_id: z.coerce.number().int().optional(),
  warehouse_id: z.coerce.number().int().optional(),
  po_id: z.coerce.number().int().optional(),
  status: ReceiptStatusSchema.optional(),
});
export type ListInventoryReceiptsQuery = z.infer<typeof ListInventoryReceiptsQuerySchema>;
