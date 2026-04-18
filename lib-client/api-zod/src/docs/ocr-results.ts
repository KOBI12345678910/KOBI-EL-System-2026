// Zod schemas for docs.ocr_results
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const CreateOcrResultSchema = z.object({
  document_id: z.number().int(),
  extracted_text: z.string().optional().nullable(),
  structured_payload: z.unknown().optional().nullable(),
  confidence_score: z.number().optional().nullable(),
  processed_by_engine: z.string().max(128).optional().nullable(),
  record_code: z.string().max(64).optional().nullable(),
  notes: z.string().optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateOcrResultInput = z.infer<typeof CreateOcrResultSchema>;

export const UpdateOcrResultSchema = CreateOcrResultSchema.partial();
export type UpdateOcrResultInput = z.infer<typeof UpdateOcrResultSchema>;

export const ReadOcrResultSchema = CreateOcrResultSchema.extend({
  id: z.number().int(),
  processed_at: z.string(),
  created_at: z.string(),
  updated_at: z.string().optional(),
});
export type ReadOcrResult = z.infer<typeof ReadOcrResultSchema>;

export const ListOcrResultsQuerySchema = ListQueryBaseSchema.extend({
  document_id: z.coerce.number().int().optional(),
});
export type ListOcrResultsQuery = z.infer<typeof ListOcrResultsQuerySchema>;
