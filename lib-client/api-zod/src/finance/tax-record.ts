// ============================================================
// Zod schemas for finance.tax_records
// General tax ledger: income tax advances, withholding (856),
// national insurance, health tax.
// ============================================================
import { z } from "zod";

export const TAX_TYPES = [
  "income_tax_advance",       // מקדמות מס הכנסה
  "withholding_tax",          // ניכוי במקור
  "withholding_856",          // דוח 856
  "national_insurance",       // ביטוח לאומי
  "health_tax",               // מס בריאות
  "capital_gains",            // רווחי הון
  "municipal_tax",            // ארנונה עסקית
  "property_tax",             // מס רכוש
  "customs_duty",             // מכס
  "excise",                   // בלו
  "other",
] as const;

export const TaxTypeSchema = z.enum(TAX_TYPES);
export type TaxType = z.infer<typeof TaxTypeSchema>;

const Money = z.number().finite();

const TaxPeriod = z.string().regex(
  /^\d{4}(-\d{2})?(-\d{2})?$/,
  "tax_period must be YYYY, YYYY-MM, or YYYY-MM-MM"
);

/** Create. */
export const CreateTaxRecordSchema = z.object({
  invoice_id: z.number().int().positive().optional().nullable(),
  tax_type: TaxTypeSchema,
  tax_period: TaxPeriod,
  taxable_amount: Money.nonnegative(),
  tax_amount: Money.nonnegative(),
  notes: z.string().max(2000).optional().nullable(),
  record_code: z.string().max(128).optional().nullable(),
  is_active: z.boolean().default(true),
  metadata: z.record(z.unknown()).default({}),
});
export type CreateTaxRecordInput = z.infer<typeof CreateTaxRecordSchema>;

/** Update. */
export const UpdateTaxRecordSchema = CreateTaxRecordSchema.partial();
export type UpdateTaxRecordInput = z.infer<typeof UpdateTaxRecordSchema>;

/** Read. */
export const ReadTaxRecordSchema = z.object({
  id: z.union([z.number().int(), z.string()]),
  invoice_id: z.number().int().nullable(),
  tax_type: z.string(),
  tax_period: z.string(),
  taxable_amount: z.union([z.string(), z.number()]),
  tax_amount: z.union([z.string(), z.number()]),
  is_active: z.boolean().optional(),
  record_code: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
  created_at: z.string(),
  updated_at: z.string(),
  created_by: z.number().int().nullable().optional(),
  updated_by: z.number().int().nullable().optional(),
});
export type ReadTaxRecord = z.infer<typeof ReadTaxRecordSchema>;

/** List. */
export const ListTaxRecordsQuerySchema = z.object({
  tax_type: TaxTypeSchema.optional(),
  tax_period: TaxPeriod.optional(),
  invoice_id: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  order_by: z.enum(["tax_period", "tax_amount", "created_at"]).default("tax_period"),
  order_dir: z.enum(["asc", "desc"]).default("desc"),
});
export type ListTaxRecordsQuery = z.infer<typeof ListTaxRecordsQuerySchema>;
