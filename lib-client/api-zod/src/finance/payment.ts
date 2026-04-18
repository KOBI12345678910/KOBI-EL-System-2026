// ============================================================
// Zod schemas for finance.payments + finance.payment_allocations
// Payment lifecycle: pending → cleared → reconciled
//                                       → failed | refunded
// ============================================================
import { z } from "zod";

export const PAYMENT_STATUSES = [
  "pending",
  "cleared",
  "reconciled",
  "failed",
  "refunded",
  "Posted", // legacy default preserved
] as const;

export const PaymentStatusSchema = z.enum(PAYMENT_STATUSES);
export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;

export const PAYMENT_METHODS = [
  "bank_transfer",
  "check",
  "cash",
  "credit_card",
  "standing_order",
  "masav",
  "wire",
  "digital_wallet",
  "other",
] as const;

export const PaymentMethodSchema = z.enum(PAYMENT_METHODS);
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;

const Money = z.number().finite().positive();

/** Payload for CREATING a payment. */
export const CreatePaymentSchema = z.object({
  payment_number: z.string().min(1).max(64).optional(),
  invoice_id: z.number().int().positive(),
  customer_id: z.number().int().positive().optional().nullable(),
  supplier_id: z.number().int().positive().optional().nullable(),
  payment_date: z.string(), // ISO yyyy-mm-dd (required)
  payment_method: PaymentMethodSchema.default("bank_transfer"),
  amount: Money,
  currency: z.string().length(3).default("ILS"),
  reference_number: z.string().max(200).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  state: PaymentStatusSchema.default("pending"),
  record_code: z.string().max(128).optional().nullable(),
  is_active: z.boolean().default(true),
  metadata: z.record(z.unknown()).default({}),
});
export type CreatePaymentInput = z.infer<typeof CreatePaymentSchema>;

/** Update — partial. */
export const UpdatePaymentSchema = z.object({
  payment_number: z.string().min(1).max(64).optional(),
  invoice_id: z.number().int().positive().optional(),
  customer_id: z.number().int().positive().optional().nullable(),
  supplier_id: z.number().int().positive().optional().nullable(),
  payment_date: z.string().optional(),
  payment_method: PaymentMethodSchema.optional(),
  amount: Money.optional(),
  currency: z.string().length(3).optional(),
  reference_number: z.string().max(200).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  state: PaymentStatusSchema.optional(),
  record_code: z.string().max(128).optional().nullable(),
  is_active: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type UpdatePaymentInput = z.infer<typeof UpdatePaymentSchema>;

/** Transition to reconciled (after bank match). */
export const ReconcilePaymentSchema = z.object({
  bank_file_id: z.number().int().positive().optional().nullable(),
  external_reference: z.string().max(200).optional().nullable(),
  matched_amount: z.number().finite().positive().optional(),
  notes: z.string().max(2000).optional().nullable(),
});
export type ReconcilePaymentInput = z.infer<typeof ReconcilePaymentSchema>;

/** Refund — creates a reversal record. */
export const RefundPaymentSchema = z.object({
  refund_amount: Money,
  refund_date: z.string().optional(),
  reason: z.string().min(3).max(1000),
});
export type RefundPaymentInput = z.infer<typeof RefundPaymentSchema>;

/** Allocate — apply payment funds across one or more invoices. */
export const AllocatePaymentSchema = z.object({
  allocations: z.array(
    z.object({
      invoice_id: z.number().int().positive(),
      amount: z.number().finite().positive(),
      notes: z.string().max(500).optional().nullable(),
    })
  ).min(1).max(100),
});
export type AllocatePaymentInput = z.infer<typeof AllocatePaymentSchema>;

/** Read model. */
export const ReadPaymentSchema = z.object({
  id: z.union([z.number().int(), z.string()]),
  public_id: z.string().uuid(),
  payment_number: z.string(),
  invoice_id: z.number().int(),
  customer_id: z.number().int().nullable(),
  supplier_id: z.number().int().nullable(),
  payment_date: z.string(),
  payment_method: z.string().nullable(),
  amount: z.union([z.string(), z.number()]),
  currency: z.string().nullable(),
  bank_match_status: z.string().nullable(),
  gl_status: z.string().nullable(),
  state: z.string(),
  reference_number: z.string().nullable(),
  notes: z.string().nullable(),
  is_active: z.boolean(),
  record_code: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
  created_at: z.string(),
  updated_at: z.string(),
  created_by: z.number().int().nullable(),
  updated_by: z.number().int().nullable(),
});
export type ReadPayment = z.infer<typeof ReadPaymentSchema>;

/** List query. */
export const ListPaymentsQuerySchema = z.object({
  q: z.string().max(200).optional(),
  state: PaymentStatusSchema.optional(),
  payment_method: PaymentMethodSchema.optional(),
  invoice_id: z.coerce.number().int().positive().optional(),
  customer_id: z.coerce.number().int().positive().optional(),
  supplier_id: z.coerce.number().int().positive().optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  order_by: z.enum(["payment_date", "amount", "created_at", "updated_at", "state"]).default("payment_date"),
  order_dir: z.enum(["asc", "desc"]).default("desc"),
});
export type ListPaymentsQuery = z.infer<typeof ListPaymentsQuerySchema>;

/** Read model for an allocation row. */
export const ReadPaymentAllocationSchema = z.object({
  id: z.union([z.number().int(), z.string()]),
  payment_id: z.number().int(),
  invoice_id: z.number().int(),
  amount: z.union([z.string(), z.number()]),
  currency: z.string().nullable().optional(),
  allocated_at: z.string(),
  state: z.string(),
  notes: z.string().nullable().optional(),
});
export type ReadPaymentAllocation = z.infer<typeof ReadPaymentAllocationSchema>;
