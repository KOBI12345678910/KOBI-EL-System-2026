// Zod schemas for analytics.report_definitions + report_runs
import { z } from "zod";
import {
  ListQueryBaseSchema,
  MetadataSchema,
  ReportOutputFormatSchema,
  ReportRunStatusSchema,
} from "./_shared";

// ---------- report_definitions ----------

export const CreateReportSchema = z.object({
  report_code: z.string().min(1).max(100),
  report_name: z.string().min(1).max(200),
  report_label_he: z.string().max(200).optional().nullable(),
  description: z.string().optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  query_template: z.string().optional().nullable(),
  parameters_schema: z.record(z.unknown()).optional().default({}),
  output_format: ReportOutputFormatSchema.optional().default("table"),
  source_table: z.string().max(200).optional().nullable(),
  is_active: z.boolean().optional().default(true),
  notes: z.string().optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateReportInput = z.infer<typeof CreateReportSchema>;

export const UpdateReportSchema = CreateReportSchema.partial();
export type UpdateReportInput = z.infer<typeof UpdateReportSchema>;

export const ListReportsQuerySchema = ListQueryBaseSchema.extend({
  category: z.string().optional(),
  is_active: z.coerce.boolean().optional(),
  output_format: ReportOutputFormatSchema.optional(),
});
export type ListReportsQuery = z.infer<typeof ListReportsQuerySchema>;

// ---------- report_runs ----------

export const EnqueueReportRunSchema = z.object({
  parameters: z.record(z.unknown()).optional().default({}),
});
export type EnqueueReportRunInput = z.infer<typeof EnqueueReportRunSchema>;

export const UpdateReportRunSchema = z.object({
  status: ReportRunStatusSchema.optional(),
  output_uri: z.string().max(500).optional().nullable(),
  row_count: z.number().int().optional().nullable(),
  error_message: z.string().optional().nullable(),
  started_at: z.string().optional().nullable(),
  finished_at: z.string().optional().nullable(),
  duration_ms: z.number().int().optional().nullable(),
  metadata: MetadataSchema,
});
export type UpdateReportRunInput = z.infer<typeof UpdateReportRunSchema>;

export const ListReportRunsQuerySchema = ListQueryBaseSchema.extend({
  report_id: z.string().uuid().optional(),
  status: ReportRunStatusSchema.optional(),
});
export type ListReportRunsQuery = z.infer<typeof ListReportRunsQuerySchema>;
