// Zod schemas for procurement.supplier_invoices
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const INVOICE_STATES = [
  "draft",
  "received",
  "pending_match",
  "matched",
  "pending_approval",
  "approved",
  "paid",
  "closed",
  "disputed",
  "cancelled",
] as const;
export const InvoiceStateSchema = z.enum(INVOICE_STATES);

export const CreateSupplierInvoiceSchema = z.object({
  supplier_invoice_number: z.string().min(1).max(64),
  supplier_id: z.number().int().positive(),
  po_id: z.number().int().optional().nullable(),
  invoice_date: z.string().optional().nullable(),
  due_date: z.string().optional().nullable(),
  subtotal: z.number().nonnegative().optional().default(0),
  vat_total: z.number().nonnegative().optional().default(0),
  grand_total: z.number().nonnegative().optional().default(0),
  currency: z.string().max(10).optional().default("ILS"),
  state: InvoiceStateSchema.optional().default("draft"),
  matched_po: z.boolean().optional().default(false),
  approved_for_payment: z.boolean().optional().default(false),
  payment_reference: z.string().max(100).optional().nullable(),
  payment_date: z.string().optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateSupplierInvoiceInput = z.infer<typeof CreateSupplierInvoiceSchema>;

export const UpdateSupplierInvoiceSchema = CreateSupplierInvoiceSchema.partial();
export type UpdateSupplierInvoiceInput = z.infer<typeof UpdateSupplierInvoiceSchema>;

export const ApproveSupplierInvoiceSchema = z.object({
  comments: z.string().max(2000).optional().nullable(),
  override_match: z.boolean().optional().default(false),
});
export type ApproveSupplierInvoiceInput = z.infer<typeof ApproveSupplierInvoiceSchema>;

export const ReadSupplierInvoiceSchema = CreateSupplierInvoiceSchema.extend({
  id: z.number().int(),
  public_id: z.string().uuid(),
  is_active: z.boolean().optional(),
  is_deleted: z.boolean().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ReadSupplierInvoice = z.infer<typeof ReadSupplierInvoiceSchema>;

export const ListSupplierInvoicesQuerySchema = ListQueryBaseSchema.extend({
  state: InvoiceStateSchema.optional(),
  supplier_id: z.coerce.number().int().optional(),
  po_id: z.coerce.number().int().optional(),
  approved_for_payment: z.coerce.boolean().optional(),
  invoice_date_from: z.string().optional(),
  invoice_date_to: z.string().optional(),
});
export type ListSupplierInvoicesQuery = z.infer<typeof ListSupplierInvoicesQuerySchema>;
