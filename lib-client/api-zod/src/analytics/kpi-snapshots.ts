// Zod schemas for analytics.kpi_snapshots
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const CreateKpiSnapshotSchema = z.object({
  kpi_name: z.string().min(1).max(100),
  snapshot_date: z.string().min(4),
  value: z.number(),
  target_value: z.number().optional().nullable(),
  comparison_result: z.string().max(40).optional().nullable(),
  dimensions: z.record(z.unknown()).optional().default({}),
  notes: z.string().optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateKpiSnapshotInput = z.infer<typeof CreateKpiSnapshotSchema>;

export const UpdateKpiSnapshotSchema = CreateKpiSnapshotSchema.partial();
export type UpdateKpiSnapshotInput = z.infer<typeof UpdateKpiSnapshotSchema>;

export const ListKpiSnapshotsQuerySchema = ListQueryBaseSchema.extend({
  kpi_name: z.string().optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
});
export type ListKpiSnapshotsQuery = z.infer<typeof ListKpiSnapshotsQuerySchema>;
