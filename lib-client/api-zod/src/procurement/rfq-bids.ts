// Zod schemas for procurement.supplier_quote_lines (alias: rfq_bids) + supplier_quotes
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const CreateRfqBidSchema = z.object({
  rfq_id: z.number().int().positive(),
  supplier_id: z.number().int().positive(),
  quote_reference: z.string().max(100).optional().nullable(),
  quote_date: z.string().optional().nullable(),
  valid_until: z.string().optional().nullable(),
  currency: z.string().max(10).optional().default("ILS"),
  delivery_days_estimate: z.number().int().min(0).optional().nullable(),
  payment_terms: z.string().max(100).optional().nullable(),
  notes: z.string().optional().nullable(),
  lines: z.array(z.object({
    rfq_item_id: z.number().int().optional().nullable(),
    line_number: z.number().int().min(1),
    material_id: z.number().int().optional().nullable(),
    description: z.string().min(1),
    quantity: z.number().positive(),
    unit_price: z.number().positive(),
    vat_percent: z.number().min(0).max(100).optional().default(18),
    delivery_days: z.number().int().min(0).optional().nullable(),
    notes: z.string().optional().nullable(),
  })).min(1),
});
export type CreateRfqBidInput = z.infer<typeof CreateRfqBidSchema>;

export const UpdateRfqBidSchema = CreateRfqBidSchema.partial();
export type UpdateRfqBidInput = z.infer<typeof UpdateRfqBidSchema>;

export const ReadRfqBidSchema = z.object({
  id: z.number().int(),
  public_id: z.string().uuid(),
  rfq_id: z.number().int(),
  supplier_id: z.number().int(),
  quote_reference: z.string().nullable(),
  quote_date: z.string().nullable(),
  valid_until: z.string().nullable(),
  subtotal: z.number(),
  vat_total: z.number(),
  grand_total: z.number(),
  currency: z.string(),
  delivery_days_estimate: z.number().nullable(),
  payment_terms: z.string().nullable(),
  quality_score: z.number().nullable(),
  selected: z.boolean(),
  state: z.string(),
  notes: z.string().nullable(),
  metadata: z.record(z.unknown()).optional(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ReadRfqBid = z.infer<typeof ReadRfqBidSchema>;

export const ListRfqBidsQuerySchema = ListQueryBaseSchema.extend({
  rfq_id: z.coerce.number().int().positive().optional(),
  supplier_id: z.coerce.number().int().positive().optional(),
  selected: z.coerce.boolean().optional(),
});
export type ListRfqBidsQuery = z.infer<typeof ListRfqBidsQuerySchema>;
