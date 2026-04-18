// ============================================================
// Zod schemas for commercial.sales_orders
// Generated: 2026-04-18
// ============================================================
import { z } from "zod";

export const SALES_ORDER_STATUSES = [
  "draft",
  "confirmed",
  "in_fulfillment",
  "shipped",
  "invoiced",
  "closed",
  "cancelled",
] as const;

export const SalesOrderStatusSchema = z.enum(SALES_ORDER_STATUSES);
export type SalesOrderStatus = z.infer<typeof SalesOrderStatusSchema>;

/** Address shape embedded on orders. */
export const OrderAddressSchema = z.object({
  recipient: z.string().max(200).optional(),
  phone: z.string().max(40).optional(),
  email: z.string().email().max(200).optional(),
  line1: z.string().max(300).optional(),
  line2: z.string().max(300).optional(),
  city: z.string().max(100).optional(),
  region: z.string().max(100).optional(),
  postal_code: z.string().max(20).optional(),
  country: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
}).passthrough();
export type OrderAddress = z.infer<typeof OrderAddressSchema>;

/** Payload for CREATING a sales order. */
export const CreateSalesOrderSchema = z.object({
  order_number: z.string().min(1).max(64).optional(), // auto-generated if omitted
  customer_id: z.number().int().positive(),
  quote_id: z.number().int().positive().optional().nullable(),
  opportunity_id: z.number().int().positive().optional().nullable(),
  status: SalesOrderStatusSchema.optional().default("draft"),
  order_date: z.string().optional(), // ISO date string
  expected_delivery: z.string().optional().nullable(),
  actual_delivery: z.string().optional().nullable(),
  subtotal: z.number().min(0).optional().default(0),
  discount_total: z.number().min(0).optional().default(0),
  vat_rate: z.number().min(0).max(1).optional().default(0.18),
  vat_total: z.number().min(0).optional().default(0),
  total_amount: z.number().min(0).optional().default(0),
  total_with_vat: z.number().min(0).optional().default(0),
  currency: z.string().length(3).optional().default("ILS"),
  payment_terms: z.string().max(500).optional().nullable(),
  shipping_address: OrderAddressSchema.optional().nullable(),
  billing_address: OrderAddressSchema.optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  customer_notes: z.string().max(5000).optional().nullable(),
  is_active: z.boolean().optional().default(true),
  metadata: z.record(z.unknown()).optional().default({}),
});
export type CreateSalesOrderInput = z.infer<typeof CreateSalesOrderSchema>;

/** Update — all fields optional. */
export const UpdateSalesOrderSchema = CreateSalesOrderSchema.partial();
export type UpdateSalesOrderInput = z.infer<typeof UpdateSalesOrderSchema>;

/** Status transition payload for `/transition` endpoint. */
export const TransitionSalesOrderSchema = z.object({
  to_status: SalesOrderStatusSchema,
  reason: z.string().max(1000).optional(),
});
export type TransitionSalesOrderInput = z.infer<typeof TransitionSalesOrderSchema>;

/** Read model. */
export const ReadSalesOrderSchema = z.object({
  id: z.union([z.number().int(), z.string()]),
  public_id: z.string().uuid(),
  order_number: z.string(),
  customer_id: z.number().int(),
  quote_id: z.number().int().nullable(),
  opportunity_id: z.number().int().nullable(),
  status: SalesOrderStatusSchema,
  order_date: z.string(),
  expected_delivery: z.string().nullable(),
  actual_delivery: z.string().nullable(),
  subtotal: z.union([z.string(), z.number()]),
  discount_total: z.union([z.string(), z.number()]),
  vat_rate: z.union([z.string(), z.number()]),
  vat_total: z.union([z.string(), z.number()]),
  total_amount: z.union([z.string(), z.number()]),
  total_with_vat: z.union([z.string(), z.number()]),
  currency: z.string(),
  payment_terms: z.string().nullable(),
  shipping_address: z.unknown().nullable(),
  billing_address: z.unknown().nullable(),
  notes: z.string().nullable(),
  customer_notes: z.string().nullable(),
  is_active: z.boolean(),
  metadata: z.record(z.unknown()),
  created_at: z.string(),
  updated_at: z.string(),
  created_by: z.number().int().nullable(),
  updated_by: z.number().int().nullable(),
  deleted_at: z.string().nullable(),
});
export type ReadSalesOrder = z.infer<typeof ReadSalesOrderSchema>;

/** List query. */
export const ListSalesOrdersQuerySchema = z.object({
  q: z.string().max(200).optional(),
  status: SalesOrderStatusSchema.optional(),
  customer_id: z.coerce.number().int().positive().optional(),
  quote_id: z.coerce.number().int().positive().optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
  order_by: z.enum(["order_date", "total_with_vat", "created_at", "updated_at", "status"]).optional().default("order_date"),
  order_dir: z.enum(["asc", "desc"]).optional().default("desc"),
});
export type ListSalesOrdersQuery = z.infer<typeof ListSalesOrdersQuerySchema>;
