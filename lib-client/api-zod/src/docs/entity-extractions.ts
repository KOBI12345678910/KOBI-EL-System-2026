// Zod schemas for docs.entity_extractions
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const CreateEntityExtractionSchema = z.object({
  document_id: z.number().int(),
  entity_type: z.string().max(64).optional().nullable(),
  entity_value: z.string().optional().nullable(),
  confidence: z.number().optional().nullable(),
  source_page: z.number().int().optional().nullable(),
  source_offset: z.number().int().optional().nullable(),
  record_code: z.string().max(64).optional().nullable(),
  notes: z.string().optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateEntityExtractionInput = z.infer<typeof CreateEntityExtractionSchema>;

export const UpdateEntityExtractionSchema = CreateEntityExtractionSchema.partial();
export type UpdateEntityExtractionInput = z.infer<typeof UpdateEntityExtractionSchema>;

export const ReadEntityExtractionSchema = CreateEntityExtractionSchema.extend({
  id: z.number().int(),
  public_id: z.string().uuid(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ReadEntityExtraction = z.infer<typeof ReadEntityExtractionSchema>;

export const ListEntityExtractionsQuerySchema = ListQueryBaseSchema.extend({
  document_id: z.coerce.number().int().optional(),
  entity_type: z.string().optional(),
});
export type ListEntityExtractionsQuery = z.infer<typeof ListEntityExtractionsQuerySchema>;
