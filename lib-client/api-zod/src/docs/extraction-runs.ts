// Zod schemas for docs.extraction_runs
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema, RunStatusSchema } from "./_shared";

export const CreateExtractionRunSchema = z.object({
  document_id: z.number().int(),
  status: RunStatusSchema.optional().default("queued"),
  extractor_name: z.string().max(128).optional().nullable(),
  fields_extracted: z.record(z.unknown()).optional().default({}),
  confidence_avg: z.number().optional().nullable(),
  error_message: z.string().optional().nullable(),
  record_code: z.string().max(64).optional().nullable(),
  notes: z.string().optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateExtractionRunInput = z.infer<typeof CreateExtractionRunSchema>;

export const UpdateExtractionRunSchema = CreateExtractionRunSchema.partial();
export type UpdateExtractionRunInput = z.infer<typeof UpdateExtractionRunSchema>;

export const ReadExtractionRunSchema = CreateExtractionRunSchema.extend({
  id: z.number().int(),
  public_id: z.string().uuid(),
  started_at: z.string().nullable().optional(),
  completed_at: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ReadExtractionRun = z.infer<typeof ReadExtractionRunSchema>;

export const ListExtractionRunsQuerySchema = ListQueryBaseSchema.extend({
  document_id: z.coerce.number().int().optional(),
  status: RunStatusSchema.optional(),
  extractor_name: z.string().optional(),
});
export type ListExtractionRunsQuery = z.infer<typeof ListExtractionRunsQuerySchema>;
