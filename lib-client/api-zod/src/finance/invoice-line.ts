// ============================================================
// Zod schemas for finance.invoice_lines
// A line's math invariant:
//   line_subtotal = round2(quantity * unit_price * (1 - discount_percent/100))
//   vat_amount    = round2(line_subtotal * vat_percent/100)
//   line_total    = round2(line_subtotal + vat_amount)
// Tolerance ±0.01 for rounding.
// ============================================================
import { z } from "zod";

const Money = z.number().finite();
const Qty = z.number().finite();

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function lineMathOk(l: {
  quantity: number;
  unit_price: number;
  discount_percent?: number;
  vat_percent?: number;
  line_subtotal?: number;
  vat_amount?: number;
  line_total?: number;
}): boolean {
  const qty = Number(l.quantity);
  const price = Number(l.unit_price);
  const discPct = Number(l.discount_percent ?? 0);
  const vatPct = Number(l.vat_percent ?? 0);
  const expectedSubtotal = round2(qty * price * (1 - discPct / 100));
  const expectedVat = round2(expectedSubtotal * (vatPct / 100));
  const expectedTotal = round2(expectedSubtotal + expectedVat);
  if (l.line_subtotal !== undefined && Math.abs(Number(l.line_subtotal) - expectedSubtotal) > 0.01) return false;
  if (l.vat_amount    !== undefined && Math.abs(Number(l.vat_amount)    - expectedVat)      > 0.01) return false;
  if (l.line_total    !== undefined && Math.abs(Number(l.line_total)    - expectedTotal)    > 0.01) return false;
  return true;
}

/** Payload for CREATING an invoice line. */
export const CreateInvoiceLineSchema = z.object({
  invoice_id: z.number().int().positive(),
  line_number: z.number().int().positive(),
  description: z.string().min(1).max(1000),
  quantity: Qty.positive(),
  unit_price: Money.nonnegative(),
  discount_percent: z.number().min(0).max(100).default(0),
  line_subtotal: Money.nonnegative().optional(),
  vat_percent: z.number().min(0).max(100).default(18),
  vat_amount: Money.nonnegative().optional(),
  line_total: Money.nonnegative().optional(),
  linked_entity_type: z.string().max(50).optional().nullable(),
  linked_entity_id: z.number().int().positive().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  metadata: z.record(z.unknown()).default({}),
}).refine(lineMathOk, {
  message: "line totals inconsistent with quantity × unit_price × (1 - discount) and vat_percent",
  path: ["line_total"],
});
export type CreateInvoiceLineInput = z.infer<typeof CreateInvoiceLineSchema>;

/** Bulk write — replace all lines of an invoice atomically. */
export const ReplaceInvoiceLinesSchema = z.object({
  invoice_id: z.number().int().positive(),
  lines: z.array(CreateInvoiceLineSchema).min(1).max(500),
});
export type ReplaceInvoiceLinesInput = z.infer<typeof ReplaceInvoiceLinesSchema>;

/** Update — partial. */
export const UpdateInvoiceLineSchema = z.object({
  line_number: z.number().int().positive().optional(),
  description: z.string().min(1).max(1000).optional(),
  quantity: Qty.positive().optional(),
  unit_price: Money.nonnegative().optional(),
  discount_percent: z.number().min(0).max(100).optional(),
  line_subtotal: Money.nonnegative().optional(),
  vat_percent: z.number().min(0).max(100).optional(),
  vat_amount: Money.nonnegative().optional(),
  line_total: Money.nonnegative().optional(),
  linked_entity_type: z.string().max(50).optional().nullable(),
  linked_entity_id: z.number().int().positive().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
});
export type UpdateInvoiceLineInput = z.infer<typeof UpdateInvoiceLineSchema>;

/** Read model. */
export const ReadInvoiceLineSchema = z.object({
  id: z.union([z.number().int(), z.string()]),
  invoice_id: z.number().int(),
  line_number: z.number().int(),
  description: z.string(),
  quantity: z.union([z.string(), z.number()]),
  unit_price: z.union([z.string(), z.number()]),
  discount_percent: z.union([z.string(), z.number()]),
  line_subtotal: z.union([z.string(), z.number()]),
  vat_percent: z.union([z.string(), z.number()]),
  vat_amount: z.union([z.string(), z.number()]),
  line_total: z.union([z.string(), z.number()]),
  linked_entity_type: z.string().nullable(),
  linked_entity_id: z.number().int().nullable(),
  notes: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ReadInvoiceLine = z.infer<typeof ReadInvoiceLineSchema>;

/**
 * Compute line totals on the client (mirrors server-side math).
 * Useful in Invoice360 line editor to show live totals.
 */
export function computeInvoiceLineTotals(l: {
  quantity: number;
  unit_price: number;
  discount_percent?: number;
  vat_percent?: number;
}): { line_subtotal: number; vat_amount: number; line_total: number } {
  const qty = Number(l.quantity) || 0;
  const price = Number(l.unit_price) || 0;
  const discPct = Number(l.discount_percent ?? 0);
  const vatPct = Number(l.vat_percent ?? 0);
  const line_subtotal = round2(qty * price * (1 - discPct / 100));
  const vat_amount = round2(line_subtotal * (vatPct / 100));
  const line_total = round2(line_subtotal + vat_amount);
  return { line_subtotal, vat_amount, line_total };
}
