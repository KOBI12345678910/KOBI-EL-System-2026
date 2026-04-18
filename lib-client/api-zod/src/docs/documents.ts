// Zod schemas for docs.documents
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema, DocumentStatusSchema } from "./_shared";

export const CreateDocumentSchema = z.object({
  document_number: z.string().min(1).max(128),
  filename: z.string().min(1).max(512),
  original_filename: z.string().max(512).optional().nullable(),
  file_type: z.string().max(64).optional().nullable(),
  mime_type: z.string().max(128).optional().nullable(),
  file_size_bytes: z.number().int().nonnegative().optional().nullable(),
  storage_path: z.string().max(1024).optional().nullable(),
  document_type: z.string().max(64).optional().nullable(),
  parent_entity_type: z.string().max(64).optional().nullable(),
  parent_entity_id: z.number().int().optional().nullable(),
  classification_status: z.string().max(64).optional().nullable(),
  ocr_status: z.string().max(64).optional().nullable(),
  signature_status: z.string().max(64).optional().nullable(),
  checksum: z.string().max(128).optional().nullable(),
  status: DocumentStatusSchema.optional().default("draft"),
  record_code: z.string().max(64).optional().nullable(),
  notes: z.string().optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateDocumentInput = z.infer<typeof CreateDocumentSchema>;

export const UpdateDocumentSchema = CreateDocumentSchema.partial();
export type UpdateDocumentInput = z.infer<typeof UpdateDocumentSchema>;

export const ReadDocumentSchema = CreateDocumentSchema.extend({
  id: z.number().int(),
  public_id: z.string().uuid(),
  is_active: z.boolean().optional(),
  is_deleted: z.boolean().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ReadDocument = z.infer<typeof ReadDocumentSchema>;

export const ListDocumentsQuerySchema = ListQueryBaseSchema.extend({
  status: DocumentStatusSchema.optional(),
  document_type: z.string().optional(),
  parent_entity_type: z.string().optional(),
  parent_entity_id: z.coerce.number().int().optional(),
  classification_status: z.string().optional(),
  ocr_status: z.string().optional(),
});
export type ListDocumentsQuery = z.infer<typeof ListDocumentsQuerySchema>;
