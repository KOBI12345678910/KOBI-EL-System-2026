// ============================================================
// Zod schemas for finance.vat_records
// tax_period is a YYYY-MM (monthly) or YYYY-MMS (bi-monthly) string.
// ============================================================
import { z } from "zod";

export const VAT_TYPES = [
  "sales_output",   // מע"מ עסקאות
  "purchase_input", // מע"מ תשומות
  "import_tax",
  "reverse_charge",
  "zero_rate",
  "exempt",
] as const;

export const VatTypeSchema = z.enum(VAT_TYPES);
export type VatType = z.infer<typeof VatTypeSchema>;

const Money = z.number().finite();

/** tax_period: "2026-04" monthly or "2026-03-04" bi-monthly range. */
const TaxPeriod = z.string().regex(
  /^\d{4}-\d{2}(-\d{2})?$/,
  "tax_period must be YYYY-MM or YYYY-MM-MM"
);

/** Create. */
export const CreateVatRecordSchema = z.object({
  invoice_id: z.number().int().positive().optional().nullable(),
  tax_period: TaxPeriod,
  vat_type: VatTypeSchema,
  taxable_amount: Money.nonnegative(),
  vat_amount: Money.nonnegative(),
  filed: z.boolean().default(false),
  filed_at: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  record_code: z.string().max(128).optional().nullable(),
  is_active: z.boolean().default(true),
  metadata: z.record(z.unknown()).default({}),
});
export type CreateVatRecordInput = z.infer<typeof CreateVatRecordSchema>;

/** Update — partial. */
export const UpdateVatRecordSchema = CreateVatRecordSchema.partial();
export type UpdateVatRecordInput = z.infer<typeof UpdateVatRecordSchema>;

/**
 * PCN836 export payload — the official monthly file format
 * (רשות המסים — דיווח מע"מ מקוון PCN874/PCN836).
 */
export const VatExportSchema = z.object({
  tax_period: TaxPeriod,
  business_id: z.string().regex(/^\d{9}$/, "ח.פ חייב להיות 9 ספרות"),
  include_filed: z.boolean().default(false),
  file_format: z.enum(["pcn836", "pcn874", "csv_summary"]).default("pcn836"),
  export_notes: z.string().max(1000).optional().nullable(),
});
export type VatExportInput = z.infer<typeof VatExportSchema>;

/** Read model. */
export const ReadVatRecordSchema = z.object({
  id: z.union([z.number().int(), z.string()]),
  invoice_id: z.number().int().nullable(),
  tax_period: z.string(),
  vat_type: z.string().nullable(),
  taxable_amount: z.union([z.string(), z.number()]),
  vat_amount: z.union([z.string(), z.number()]),
  filed: z.boolean(),
  filed_at: z.string().nullable(),
  is_active: z.boolean().optional(),
  record_code: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
  created_at: z.string(),
  updated_at: z.string(),
  created_by: z.number().int().nullable().optional(),
  updated_by: z.number().int().nullable().optional(),
});
export type ReadVatRecord = z.infer<typeof ReadVatRecordSchema>;

/** List query. */
export const ListVatRecordsQuerySchema = z.object({
  tax_period: TaxPeriod.optional(),
  vat_type: VatTypeSchema.optional(),
  filed: z.coerce.boolean().optional(),
  invoice_id: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  order_by: z.enum(["tax_period", "vat_amount", "created_at"]).default("tax_period"),
  order_dir: z.enum(["asc", "desc"]).default("desc"),
});
export type ListVatRecordsQuery = z.infer<typeof ListVatRecordsQuerySchema>;
