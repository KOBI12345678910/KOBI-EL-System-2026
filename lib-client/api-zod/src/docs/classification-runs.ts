// Zod schemas for docs.classification_runs
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema, RunStatusSchema } from "./_shared";

export const CreateClassificationRunSchema = z.object({
  document_id: z.number().int(),
  classifier_name: z.string().max(128).optional().nullable(),
  predicted_category: z.string().max(128).optional().nullable(),
  confidence: z.number().optional().nullable(),
  status: RunStatusSchema.optional().default("queued"),
  record_code: z.string().max(64).optional().nullable(),
  notes: z.string().optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateClassificationRunInput = z.infer<typeof CreateClassificationRunSchema>;

export const UpdateClassificationRunSchema = CreateClassificationRunSchema.partial();
export type UpdateClassificationRunInput = z.infer<typeof UpdateClassificationRunSchema>;

export const ReadClassificationRunSchema = CreateClassificationRunSchema.extend({
  id: z.number().int(),
  public_id: z.string().uuid(),
  completed_at: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ReadClassificationRun = z.infer<typeof ReadClassificationRunSchema>;

export const ListClassificationRunsQuerySchema = ListQueryBaseSchema.extend({
  document_id: z.coerce.number().int().optional(),
  status: RunStatusSchema.optional(),
  classifier_name: z.string().optional(),
  predicted_category: z.string().optional(),
});
export type ListClassificationRunsQuery = z.infer<typeof ListClassificationRunsQuerySchema>;
