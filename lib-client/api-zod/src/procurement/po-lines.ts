// Zod schemas for procurement.purchase_order_lines (alias: po_lines)
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const CreatePoLineSchema = z.object({
  po_id: z.number().int().positive(),
  line_number: z.number().int().min(1),
  material_id: z.number().int().optional().nullable(),
  supplier_quote_line_id: z.number().int().optional().nullable(),
  description: z.string().min(1).max(2000),
  quantity_ordered: z.number().positive(),
  quantity_received: z.number().min(0).optional().default(0),
  quantity_open: z.number().min(0).optional().default(0),
  unit_of_measure: z.string().max(20).optional().nullable(),
  unit_price: z.number().nonnegative(),
  discount_percent: z.number().min(0).max(100).optional().default(0),
  line_subtotal: z.number().nonnegative(),
  vat_percent: z.number().min(0).max(100).optional().default(18),
  vat_amount: z.number().nonnegative().optional().default(0),
  line_total: z.number().nonnegative(),
  delivery_date: z.string().optional().nullable(),
  metadata: MetadataSchema,
});
export type CreatePoLineInput = z.infer<typeof CreatePoLineSchema>;

export const UpdatePoLineSchema = CreatePoLineSchema.partial();
export type UpdatePoLineInput = z.infer<typeof UpdatePoLineSchema>;

export const ReadPoLineSchema = CreatePoLineSchema.extend({
  id: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ReadPoLine = z.infer<typeof ReadPoLineSchema>;

export const ListPoLinesQuerySchema = ListQueryBaseSchema.extend({
  po_id: z.coerce.number().int().positive().optional(),
  material_id: z.coerce.number().int().optional(),
});
export type ListPoLinesQuery = z.infer<typeof ListPoLinesQuerySchema>;
