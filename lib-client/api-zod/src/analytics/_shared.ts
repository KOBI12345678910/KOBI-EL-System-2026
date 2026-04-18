// ============================================================
// Shared primitives for analytics zod schemas
// ============================================================
import { z } from "zod";

export const IdSchema = z.union([z.number().int().positive(), z.string()]);
export const UuidSchema = z.string().uuid();
export const NullableString = z.string().optional().nullable();
export const NullableNumber = z.number().optional().nullable();
export const NullableDate = z.string().optional().nullable();
export const MetadataSchema = z.record(z.unknown()).optional().default({});
export const JsonObjectSchema = z.record(z.unknown()).optional().default({});

export const ListQueryBaseSchema = z.object({
  q: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
  order_by: z.string().max(64).optional().default("id"),
  order_dir: z.enum(["asc", "desc"]).optional().default("desc"),
});
export type ListQueryBase = z.infer<typeof ListQueryBaseSchema>;

export const REPORT_RUN_STATUSES = ["queued", "running", "complete", "failed"] as const;
export const ReportRunStatusSchema = z.enum(REPORT_RUN_STATUSES);

export const INVALIDATION_STATUSES = ["pending", "processed", "skipped"] as const;
export const InvalidationStatusSchema = z.enum(INVALIDATION_STATUSES);

export const KPI_COMPARISON_TYPES = [
  "higher_is_better",
  "lower_is_better",
  "within_range",
  "exact_match",
] as const;
export const KpiComparisonTypeSchema = z.enum(KPI_COMPARISON_TYPES);

export const REPORT_OUTPUT_FORMATS = ["table", "csv", "pdf", "json", "xlsx"] as const;
export const ReportOutputFormatSchema = z.enum(REPORT_OUTPUT_FORMATS);

export const DASHBOARD_EXPORT_FORMATS = ["csv", "pdf"] as const;
export const DashboardExportFormatSchema = z.enum(DASHBOARD_EXPORT_FORMATS);
