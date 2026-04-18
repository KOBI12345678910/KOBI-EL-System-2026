// Zod schemas for docs.knowledge_cards
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const CreateKnowledgeCardSchema = z.object({
  title: z.string().min(1).max(400),
  summary: z.string().optional().nullable(),
  source_document_id: z.number().int().optional().nullable(),
  category: z.string().max(128).optional().nullable(),
  tags: z.array(z.string()).optional().nullable(),
  content: z.record(z.unknown()).optional().default({}),
  confidence_score: z.number().optional().nullable(),
  record_code: z.string().max(64).optional().nullable(),
  notes: z.string().optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateKnowledgeCardInput = z.infer<typeof CreateKnowledgeCardSchema>;

export const UpdateKnowledgeCardSchema = CreateKnowledgeCardSchema.partial();
export type UpdateKnowledgeCardInput = z.infer<typeof UpdateKnowledgeCardSchema>;

export const ReadKnowledgeCardSchema = CreateKnowledgeCardSchema.extend({
  id: z.number().int(),
  public_id: z.string().uuid(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ReadKnowledgeCard = z.infer<typeof ReadKnowledgeCardSchema>;

export const ListKnowledgeCardsQuerySchema = ListQueryBaseSchema.extend({
  category: z.string().optional(),
  source_document_id: z.coerce.number().int().optional(),
});
export type ListKnowledgeCardsQuery = z.infer<typeof ListKnowledgeCardsQuerySchema>;
