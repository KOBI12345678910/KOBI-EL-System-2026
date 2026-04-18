// Zod schemas for docs.document_classifications
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const CreateDocumentClassificationSchema = z.object({
  document_id: z.number().int(),
  classification_label: z.string().min(1).max(128),
  confidence_score: z.number().optional().nullable(),
  classified_by: z.string().max(128).optional().nullable(),
  record_code: z.string().max(64).optional().nullable(),
  notes: z.string().optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateDocumentClassificationInput = z.infer<typeof CreateDocumentClassificationSchema>;

export const UpdateDocumentClassificationSchema = CreateDocumentClassificationSchema.partial();
export type UpdateDocumentClassificationInput = z.infer<typeof UpdateDocumentClassificationSchema>;

export const ReadDocumentClassificationSchema = CreateDocumentClassificationSchema.extend({
  id: z.number().int(),
  classified_at: z.string(),
  created_at: z.string(),
  updated_at: z.string().optional(),
});
export type ReadDocumentClassification = z.infer<typeof ReadDocumentClassificationSchema>;

export const ListDocumentClassificationsQuerySchema = ListQueryBaseSchema.extend({
  document_id: z.coerce.number().int().optional(),
  classification_label: z.string().optional(),
});
export type ListDocumentClassificationsQuery = z.infer<typeof ListDocumentClassificationsQuerySchema>;
