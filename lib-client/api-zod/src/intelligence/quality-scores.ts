// Zod schemas for intelligence.quality_scores
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const CreateQualityScoreSchema = z.object({
  parent_entity_type: z.string().min(1).max(100),
  parent_entity_id: z.number().int().nonnegative(),
  score_type: z.string().min(1).max(100),
  score_value: z.number().finite(),
  explanation: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateQualityScoreInput = z.infer<typeof CreateQualityScoreSchema>;

export const UpdateQualityScoreSchema = CreateQualityScoreSchema.partial();
export type UpdateQualityScoreInput = z.infer<typeof UpdateQualityScoreSchema>;

export const ListQualityScoresQuerySchema = ListQueryBaseSchema.extend({
  score_type: z.string().optional(),
  parent_entity_type: z.string().optional(),
});
export type ListQualityScoresQuery = z.infer<typeof ListQualityScoresQuerySchema>;
