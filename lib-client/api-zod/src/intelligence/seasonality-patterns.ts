// Zod schemas for intelligence.seasonality_patterns
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const CreateSeasonalityPatternSchema = z.object({
  pattern_type: z.string().min(1).max(100),
  parent_entity_type: z.string().max(100).optional().nullable(),
  parent_entity_id: z.number().int().optional().nullable(),
  pattern_payload: z.record(z.unknown()),
  notes: z.string().optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateSeasonalityPatternInput = z.infer<typeof CreateSeasonalityPatternSchema>;

export const UpdateSeasonalityPatternSchema = CreateSeasonalityPatternSchema.partial();
export type UpdateSeasonalityPatternInput = z.infer<typeof UpdateSeasonalityPatternSchema>;

export const ListSeasonalityPatternsQuerySchema = ListQueryBaseSchema.extend({
  pattern_type: z.string().optional(),
  parent_entity_type: z.string().optional(),
});
export type ListSeasonalityPatternsQuery = z.infer<typeof ListSeasonalityPatternsQuerySchema>;
