// Zod schemas for procurement.po_receipts (view alias of goods_receipts)
import { z } from "zod";
import { ListQueryBaseSchema } from "./_shared";

export const ReadPoReceiptSchema = z.object({
  id: z.number().int(),
  public_id: z.string().uuid(),
  receipt_number: z.string(),
  po_id: z.number().int(),
  supplier_id: z.number().int(),
  project_id: z.number().int().nullable(),
  warehouse_id: z.number().int().nullable(),
  receipt_date: z.string(),
  received_by_user_id: z.number().int().nullable(),
  delivery_note_ref: z.string().nullable(),
  state: z.string(),
  inspection_status: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ReadPoReceipt = z.infer<typeof ReadPoReceiptSchema>;

export const ListPoReceiptsQuerySchema = ListQueryBaseSchema.extend({
  po_id: z.coerce.number().int().optional(),
  supplier_id: z.coerce.number().int().optional(),
  state: z.string().optional(),
});
export type ListPoReceiptsQuery = z.infer<typeof ListPoReceiptsQuerySchema>;
