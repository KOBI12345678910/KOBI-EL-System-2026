// Zod schemas for docs.document_versions
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const CreateDocumentVersionSchema = z.object({
  document_id: z.number().int(),
  version_number: z.number().int().min(1),
  filename: z.string().min(1).max(512),
  storage_path: z.string().max(1024).optional().nullable(),
  file_size_bytes: z.number().int().nonnegative().optional().nullable(),
  mime_type: z.string().max(128).optional().nullable(),
  checksum: z.string().max(128).optional().nullable(),
  change_summary: z.string().optional().nullable(),
  is_current: z.boolean().optional().default(false),
  record_code: z.string().max(64).optional().nullable(),
  notes: z.string().optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateDocumentVersionInput = z.infer<typeof CreateDocumentVersionSchema>;

export const UpdateDocumentVersionSchema = CreateDocumentVersionSchema.partial();
export type UpdateDocumentVersionInput = z.infer<typeof UpdateDocumentVersionSchema>;

export const ReadDocumentVersionSchema = CreateDocumentVersionSchema.extend({
  id: z.number().int(),
  public_id: z.string().uuid(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ReadDocumentVersion = z.infer<typeof ReadDocumentVersionSchema>;

export const ListDocumentVersionsQuerySchema = ListQueryBaseSchema.extend({
  document_id: z.coerce.number().int().optional(),
  is_current: z.coerce.boolean().optional(),
});
export type ListDocumentVersionsQuery = z.infer<typeof ListDocumentVersionsQuerySchema>;
