// Zod schemas for docs.document_relations
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema, RelationTypeSchema } from "./_shared";

export const CreateDocumentRelationSchema = z.object({
  from_document_id: z.number().int(),
  to_document_id: z.number().int(),
  relation_type: RelationTypeSchema,
  record_code: z.string().max(64).optional().nullable(),
  notes: z.string().optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateDocumentRelationInput = z.infer<typeof CreateDocumentRelationSchema>;

export const UpdateDocumentRelationSchema = CreateDocumentRelationSchema.partial();
export type UpdateDocumentRelationInput = z.infer<typeof UpdateDocumentRelationSchema>;

export const ReadDocumentRelationSchema = CreateDocumentRelationSchema.extend({
  id: z.number().int(),
  public_id: z.string().uuid(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ReadDocumentRelation = z.infer<typeof ReadDocumentRelationSchema>;

export const ListDocumentRelationsQuerySchema = ListQueryBaseSchema.extend({
  from_document_id: z.coerce.number().int().optional(),
  to_document_id: z.coerce.number().int().optional(),
  relation_type: RelationTypeSchema.optional(),
});
export type ListDocumentRelationsQuery = z.infer<typeof ListDocumentRelationsQuerySchema>;
