// Zod schemas for docs.document_chunks
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const CreateDocumentChunkSchema = z.object({
  document_id: z.number().int(),
  chunk_order: z.number().int().nonnegative(),
  content: z.string().optional().nullable(),
  token_count: z.number().int().optional().nullable(),
  embedding_ref: z.string().max(512).optional().nullable(),
  record_code: z.string().max(64).optional().nullable(),
  notes: z.string().optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateDocumentChunkInput = z.infer<typeof CreateDocumentChunkSchema>;

export const UpdateDocumentChunkSchema = CreateDocumentChunkSchema.partial();
export type UpdateDocumentChunkInput = z.infer<typeof UpdateDocumentChunkSchema>;

export const ReadDocumentChunkSchema = CreateDocumentChunkSchema.extend({
  id: z.number().int(),
  public_id: z.string().uuid(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ReadDocumentChunk = z.infer<typeof ReadDocumentChunkSchema>;

export const ListDocumentChunksQuerySchema = ListQueryBaseSchema.extend({
  document_id: z.coerce.number().int().optional(),
});
export type ListDocumentChunksQuery = z.infer<typeof ListDocumentChunksQuerySchema>;
