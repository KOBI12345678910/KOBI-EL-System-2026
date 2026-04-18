// Zod schemas for intelligence.anomaly_cases
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const ANOMALY_CASE_STATUSES = [
  "open",
  "investigating",
  "resolved",
  "false_positive",
] as const;
export const AnomalyCaseStatusSchema = z.enum(ANOMALY_CASE_STATUSES);

export const CreateAnomalyCaseSchema = z.object({
  anomaly_number: z.string().min(1).max(64),
  parent_entity_type: z.string().min(1).max(100),
  parent_entity_id: z.number().int().nonnegative(),
  anomaly_type: z.string().min(1).max(100),
  anomaly_score: z.number().finite().optional().nullable(),
  severity: z.string().max(20).optional().nullable(),
  explanation: z.string().optional().nullable(),
  status: AnomalyCaseStatusSchema.optional().default("open"),
  notes: z.string().optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateAnomalyCaseInput = z.infer<typeof CreateAnomalyCaseSchema>;

export const UpdateAnomalyCaseSchema = CreateAnomalyCaseSchema.partial();
export type UpdateAnomalyCaseInput = z.infer<typeof UpdateAnomalyCaseSchema>;

export const ListAnomalyCasesQuerySchema = ListQueryBaseSchema.extend({
  status: AnomalyCaseStatusSchema.optional(),
  anomaly_type: z.string().optional(),
  severity: z.string().optional(),
  parent_entity_type: z.string().optional(),
});
export type ListAnomalyCasesQuery = z.infer<typeof ListAnomalyCasesQuerySchema>;
