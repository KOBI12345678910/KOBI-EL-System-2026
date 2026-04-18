// Zod schemas for analytics.custom_metrics
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const CreateCustomMetricSchema = z.object({
  metric_code: z.string().min(1).max(100),
  metric_name: z.string().min(1).max(200),
  category: z.string().max(100).optional().nullable(),
  formula: z.string().optional().nullable(),
  unit: z.string().max(30).optional().nullable(),
  aggregation_type: z.string().max(50).optional().nullable(),
  data_source_table: z.string().max(200).optional().nullable(),
  is_active: z.boolean().optional().default(true),
  notes: z.string().optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateCustomMetricInput = z.infer<typeof CreateCustomMetricSchema>;

export const UpdateCustomMetricSchema = CreateCustomMetricSchema.partial();
export type UpdateCustomMetricInput = z.infer<typeof UpdateCustomMetricSchema>;

export const ListCustomMetricsQuerySchema = ListQueryBaseSchema.extend({
  category: z.string().optional(),
  is_active: z.coerce.boolean().optional(),
});
export type ListCustomMetricsQuery = z.infer<typeof ListCustomMetricsQuerySchema>;
