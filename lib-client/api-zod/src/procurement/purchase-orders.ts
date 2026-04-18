// Zod schemas for procurement.purchase_orders
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const PO_STATES = [
  "draft",
  "pending_approval",
  "approved",
  "submitted",
  "partially_received",
  "fully_received",
  "invoiced",
  "paid",
  "closed",
  "cancelled",
] as const;
export const PoStateSchema = z.enum(PO_STATES);

export const CreatePurchaseOrderSchema = z.object({
  po_number: z.string().min(1).max(64),
  supplier_id: z.number().int().positive(),
  project_id: z.number().int().optional().nullable(),
  rfq_id: z.number().int().optional().nullable(),
  contract_id: z.number().int().optional().nullable(),
  order_date: z.string().optional(),
  expected_delivery_date: z.string().optional().nullable(),
  currency: z.string().max(10).optional().default("ILS"),
  subtotal: z.number().nonnegative().optional().default(0),
  discount_total: z.number().nonnegative().optional().default(0),
  vat_total: z.number().nonnegative().optional().default(0),
  grand_total: z.number().nonnegative().optional().default(0),
  approval_status: z.string().max(50).optional().default("draft"),
  receiving_status: z.string().max(50).optional().default("not_received"),
  payment_status: z.string().max(50).optional().default("unpaid"),
  state: PoStateSchema.optional().default("draft"),
  delivery_address: z.string().optional().nullable(),
  internal_notes: z.string().optional().nullable(),
  supplier_notes: z.string().optional().nullable(),
  metadata: MetadataSchema,
});
export type CreatePurchaseOrderInput = z.infer<typeof CreatePurchaseOrderSchema>;

export const UpdatePurchaseOrderSchema = CreatePurchaseOrderSchema.partial();
export type UpdatePurchaseOrderInput = z.infer<typeof UpdatePurchaseOrderSchema>;

export const ReadPurchaseOrderSchema = CreatePurchaseOrderSchema.extend({
  id: z.number().int(),
  public_id: z.string().uuid(),
  is_active: z.boolean().optional(),
  is_deleted: z.boolean().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ReadPurchaseOrder = z.infer<typeof ReadPurchaseOrderSchema>;

export const ListPurchaseOrdersQuerySchema = ListQueryBaseSchema.extend({
  state: PoStateSchema.optional(),
  supplier_id: z.coerce.number().int().optional(),
  project_id: z.coerce.number().int().optional(),
  approval_status: z.string().optional(),
  payment_status: z.string().optional(),
  order_date_from: z.string().optional(),
  order_date_to: z.string().optional(),
});
export type ListPurchaseOrdersQuery = z.infer<typeof ListPurchaseOrdersQuerySchema>;

export const ApprovePurchaseOrderSchema = z.object({
  comments: z.string().max(2000).optional().nullable(),
  tier: z.number().int().min(1).max(10).optional(),
});
export type ApprovePurchaseOrderInput = z.infer<typeof ApprovePurchaseOrderSchema>;
