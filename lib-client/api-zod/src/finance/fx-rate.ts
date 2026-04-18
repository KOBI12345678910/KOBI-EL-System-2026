// ============================================================
// Zod schemas for finance.fx_rates
// Stores per-day exchange rates keyed by (currency_code, rate_date).
// ============================================================
import { z } from "zod";

const RateDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "rate_date must be YYYY-MM-DD");

/** Create. */
export const CreateFxRateSchema = z.object({
  currency_code: z.string().length(3).toUpperCase(),
  rate_date: RateDate,
  exchange_rate: z.number().finite().positive(),
  source_name: z.string().max(100).default("manual"),
  notes: z.string().max(1000).optional().nullable(),
  is_active: z.boolean().default(true),
  metadata: z.record(z.unknown()).default({}),
});
export type CreateFxRateInput = z.infer<typeof CreateFxRateSchema>;

/** Update. */
export const UpdateFxRateSchema = z.object({
  exchange_rate: z.number().finite().positive().optional(),
  source_name: z.string().max(100).optional(),
  notes: z.string().max(1000).optional().nullable(),
  is_active: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type UpdateFxRateInput = z.infer<typeof UpdateFxRateSchema>;

/** Bulk upsert — import a day's rates from a provider. */
export const BulkUpsertFxRatesSchema = z.object({
  rate_date: RateDate,
  source_name: z.string().max(100).default("bulk"),
  rates: z.array(
    z.object({
      currency_code: z.string().length(3).toUpperCase(),
      exchange_rate: z.number().finite().positive(),
    })
  ).min(1).max(50),
});
export type BulkUpsertFxRatesInput = z.infer<typeof BulkUpsertFxRatesSchema>;

/** Read. */
export const ReadFxRateSchema = z.object({
  id: z.union([z.number().int(), z.string()]),
  currency_code: z.string(),
  rate_date: z.string(),
  exchange_rate: z.union([z.string(), z.number()]),
  source_name: z.string().nullable(),
  is_active: z.boolean().optional(),
  notes: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
  created_at: z.string(),
  updated_at: z.string().optional(),
});
export type ReadFxRate = z.infer<typeof ReadFxRateSchema>;

/** List. */
export const ListFxRatesQuerySchema = z.object({
  currency_code: z.string().length(3).toUpperCase().optional(),
  from_date: RateDate.optional(),
  to_date: RateDate.optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  offset: z.coerce.number().int().min(0).default(0),
  order_by: z.enum(["rate_date", "currency_code", "exchange_rate"]).default("rate_date"),
  order_dir: z.enum(["asc", "desc"]).default("desc"),
});
export type ListFxRatesQuery = z.infer<typeof ListFxRatesQuerySchema>;
