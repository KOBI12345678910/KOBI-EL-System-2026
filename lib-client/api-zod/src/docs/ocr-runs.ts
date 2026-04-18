// Zod schemas for docs.ocr_runs
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema, RunStatusSchema } from "./_shared";

export const CreateOcrRunSchema = z.object({
  document_id: z.number().int(),
  status: RunStatusSchema.optional().default("queued"),
  provider: z.string().max(128).optional().nullable(),
  pages_processed: z.number().int().optional().nullable(),
  confidence_avg: z.number().optional().nullable(),
  error_message: z.string().optional().nullable(),
  record_code: z.string().max(64).optional().nullable(),
  notes: z.string().optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateOcrRunInput = z.infer<typeof CreateOcrRunSchema>;

export const UpdateOcrRunSchema = CreateOcrRunSchema.partial();
export type UpdateOcrRunInput = z.infer<typeof UpdateOcrRunSchema>;

export const ReadOcrRunSchema = CreateOcrRunSchema.extend({
  id: z.number().int(),
  public_id: z.string().uuid(),
  requested_at: z.string(),
  started_at: z.string().nullable().optional(),
  completed_at: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ReadOcrRun = z.infer<typeof ReadOcrRunSchema>;

export const ListOcrRunsQuerySchema = ListQueryBaseSchema.extend({
  document_id: z.coerce.number().int().optional(),
  status: RunStatusSchema.optional(),
  provider: z.string().optional(),
});
export type ListOcrRunsQuery = z.infer<typeof ListOcrRunsQuerySchema>;
