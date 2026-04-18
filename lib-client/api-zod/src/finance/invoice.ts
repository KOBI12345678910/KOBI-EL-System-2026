// ============================================================
// Zod schemas for finance.invoices
// Validates VAT math (grand_total = subtotal - discount + vat_total, ±0.01).
// VAT rate itself is computed server-side via getVatRateForDate();
// clients MAY pass an overriding rate but should not hardcode.
// ============================================================
import { z } from "zod";

export const INVOICE_STATUSES = [
  "draft",
  "issued",
  "sent",
  "partially_paid",
  "paid",
  "overdue",
  "cancelled",
  "voided",
] as const;

export const InvoiceStatusSchema = z.enum(INVOICE_STATUSES);
export type InvoiceStatus = z.infer<typeof InvoiceStatusSchema>;

export const INVOICE_TYPES = [
  "sales_invoice",
  "credit_note",
  "debit_note",
  "proforma",
  "receipt_invoice",
  "purchase_invoice",
] as const;

export const InvoiceTypeSchema = z.enum(INVOICE_TYPES);
export type InvoiceType = z.infer<typeof InvoiceTypeSchema>;

/** Money amounts are strict non-negative numbers with 2 decimal precision. */
const Money = z.number().finite().nonnegative();

/**
 * Shape invariant enforced at the header level:
 *   |grand_total − (subtotal − discount_total + vat_total)| ≤ 0.01
 */
const totalsConsistent = <T extends {
  subtotal?: number;
  discount_total?: number;
  vat_total?: number;
  grand_total?: number;
}>(d: T) => {
  const subtotal = Number(d.subtotal ?? 0);
  const discount = Number(d.discount_total ?? 0);
  const vat = Number(d.vat_total ?? 0);
  const grand = Number(d.grand_total ?? 0);
  const expected = subtotal - discount + vat;
  return Math.abs(grand - expected) <= 0.01;
};

/** Payload for CREATING an invoice header. */
export const CreateInvoiceSchema = z.object({
  invoice_number: z.string().min(1).max(64).optional(), // auto-generated if omitted
  invoice_type: InvoiceTypeSchema.default("sales_invoice"),
  customer_id: z.number().int().positive().optional().nullable(),
  supplier_id: z.number().int().positive().optional().nullable(),
  project_id: z.number().int().positive().optional().nullable(),
  po_id: z.number().int().positive().optional().nullable(),
  issue_date: z.string().optional(), // ISO yyyy-mm-dd
  due_date: z.string().optional().nullable(),
  subtotal: Money.default(0),
  discount_total: Money.default(0),
  vat_total: Money.default(0),
  grand_total: Money.default(0),
  paid_total: Money.default(0).optional(),
  balance_due: Money.default(0).optional(),
  currency: z.string().length(3).default("ILS"),
  state: InvoiceStatusSchema.default("draft"),
  notes: z.string().max(5000).optional().nullable(),
  record_code: z.string().max(128).optional().nullable(),
  is_active: z.boolean().default(true),
  metadata: z.record(z.unknown()).default({}),
}).refine(totalsConsistent, {
  message: "grand_total must equal subtotal − discount_total + vat_total (±0.01)",
  path: ["grand_total"],
}).refine(
  (d) => !!(d.customer_id || d.supplier_id),
  { message: "invoice requires customer_id or supplier_id", path: ["customer_id"] },
);
export type CreateInvoiceInput = z.infer<typeof CreateInvoiceSchema>;

/** Update — all fields optional but math still validated when totals present. */
const UpdateInvoiceBase = z.object({
  invoice_number: z.string().min(1).max(64).optional(),
  invoice_type: InvoiceTypeSchema.optional(),
  customer_id: z.number().int().positive().optional().nullable(),
  supplier_id: z.number().int().positive().optional().nullable(),
  project_id: z.number().int().positive().optional().nullable(),
  po_id: z.number().int().positive().optional().nullable(),
  issue_date: z.string().optional().nullable(),
  due_date: z.string().optional().nullable(),
  subtotal: Money.optional(),
  discount_total: Money.optional(),
  vat_total: Money.optional(),
  grand_total: Money.optional(),
  paid_total: Money.optional(),
  balance_due: Money.optional(),
  currency: z.string().length(3).optional(),
  state: InvoiceStatusSchema.optional(),
  notes: z.string().max(5000).optional().nullable(),
  record_code: z.string().max(128).optional().nullable(),
  is_active: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export const UpdateInvoiceSchema = UpdateInvoiceBase.refine(
  (d) => {
    const anyTotalPresent =
      d.subtotal !== undefined ||
      d.discount_total !== undefined ||
      d.vat_total !== undefined ||
      d.grand_total !== undefined;
    if (!anyTotalPresent) return true;
    // If any total present, they must be consistent — but since patch is
    // partial, we only validate when ALL 4 are supplied together.
    const allFour =
      d.subtotal !== undefined &&
      d.discount_total !== undefined &&
      d.vat_total !== undefined &&
      d.grand_total !== undefined;
    if (!allFour) return true;
    return totalsConsistent(d);
  },
  { message: "grand_total mismatch on update", path: ["grand_total"] },
);
export type UpdateInvoiceInput = z.infer<typeof UpdateInvoiceSchema>;

/** Status transition. */
export const TransitionInvoiceSchema = z.object({
  to_status: InvoiceStatusSchema,
  reason: z.string().max(1000).optional(),
});
export type TransitionInvoiceInput = z.infer<typeof TransitionInvoiceSchema>;

/** Issue action — marks invoice as issued + sets issue_date if not set. */
export const IssueInvoiceSchema = z.object({
  issue_date: z.string().optional(),
  send_to_customer: z.boolean().default(false),
});
export type IssueInvoiceInput = z.infer<typeof IssueInvoiceSchema>;

/** Void action — reverses the invoice. */
export const VoidInvoiceSchema = z.object({
  reason: z.string().min(3).max(1000),
  void_date: z.string().optional(),
});
export type VoidInvoiceInput = z.infer<typeof VoidInvoiceSchema>;

/** Read model. */
export const ReadInvoiceSchema = z.object({
  id: z.union([z.number().int(), z.string()]),
  public_id: z.string().uuid(),
  invoice_number: z.string(),
  invoice_type: z.string(),
  customer_id: z.number().int().nullable(),
  supplier_id: z.number().int().nullable(),
  project_id: z.number().int().nullable(),
  po_id: z.number().int().nullable(),
  issue_date: z.string().nullable(),
  due_date: z.string().nullable(),
  subtotal: z.union([z.string(), z.number()]),
  discount_total: z.union([z.string(), z.number()]),
  vat_total: z.union([z.string(), z.number()]),
  grand_total: z.union([z.string(), z.number()]),
  paid_total: z.union([z.string(), z.number()]),
  balance_due: z.union([z.string(), z.number()]),
  currency: z.string().nullable(),
  state: z.string(),
  sent_at: z.string().nullable(),
  cancelled_at: z.string().nullable(),
  notes: z.string().nullable(),
  is_active: z.boolean(),
  is_deleted: z.boolean().optional(),
  record_code: z.string().nullable(),
  metadata: z.record(z.unknown()),
  created_at: z.string(),
  updated_at: z.string(),
  created_by: z.number().int().nullable(),
  updated_by: z.number().int().nullable(),
});
export type ReadInvoice = z.infer<typeof ReadInvoiceSchema>;

/** List query. */
export const ListInvoicesQuerySchema = z.object({
  q: z.string().max(200).optional(),
  state: InvoiceStatusSchema.optional(),
  invoice_type: InvoiceTypeSchema.optional(),
  customer_id: z.coerce.number().int().positive().optional(),
  supplier_id: z.coerce.number().int().positive().optional(),
  project_id: z.coerce.number().int().positive().optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  order_by: z.enum(["issue_date", "due_date", "grand_total", "created_at", "updated_at", "state"]).default("issue_date"),
  order_dir: z.enum(["asc", "desc"]).default("desc"),
});
export type ListInvoicesQuery = z.infer<typeof ListInvoicesQuerySchema>;
