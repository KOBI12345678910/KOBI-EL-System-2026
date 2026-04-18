// Zod schemas for analytics.kpi_definitions
import { z } from "zod";
import {
  ListQueryBaseSchema,
  MetadataSchema,
  KpiComparisonTypeSchema,
} from "./_shared";

export const CreateKpiDefinitionSchema = z.object({
  kpi_name: z.string().min(1).max(100),
  kpi_label_he: z.string().max(200).optional().nullable(),
  formula_jsonb: z.record(z.unknown()).optional().default({}),
  unit: z.string().max(30).optional().nullable(),
  target_value: z.number().optional().nullable(),
  comparison_type: KpiComparisonTypeSchema.optional().default("higher_is_better"),
  data_source_table: z.string().max(200).optional().nullable(),
  data_source_query: z.string().optional().nullable(),
  refresh_cron: z.string().max(120).optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  is_active: z.boolean().optional().default(true),
  notes: z.string().optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateKpiDefinitionInput = z.infer<typeof CreateKpiDefinitionSchema>;

export const UpdateKpiDefinitionSchema = CreateKpiDefinitionSchema.partial();
export type UpdateKpiDefinitionInput = z.infer<typeof UpdateKpiDefinitionSchema>;

export const ListKpiDefinitionsQuerySchema = ListQueryBaseSchema.extend({
  category: z.string().optional(),
  is_active: z.coerce.boolean().optional(),
  comparison_type: KpiComparisonTypeSchema.optional(),
});
export type ListKpiDefinitionsQuery = z.infer<typeof ListKpiDefinitionsQuerySchema>;

export const ComputeKpiSnapshotSchema = z.object({
  as_of_date: z.string().optional().nullable(),
  parameters: z.record(z.unknown()).optional().default({}),
});
export type ComputeKpiSnapshotInput = z.infer<typeof ComputeKpiSnapshotSchema>;
