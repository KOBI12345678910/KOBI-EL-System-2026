// Zod schemas for intelligence.ai_insights
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema, SeveritySchema } from "./_shared";

export const AI_INSIGHT_STATUSES = [
  "generated",
  "published",
  "acknowledged",
  "actioned",
  "dismissed",
] as const;
export const AIInsightStatusSchema = z.enum(AI_INSIGHT_STATUSES);

export const CreateAIInsightSchema = z.object({
  insight_number: z.string().min(1).max(64),
  parent_entity_type: z.string().min(1).max(100),
  parent_entity_id: z.number().int().nonnegative(),
  category: z.string().max(100).optional().nullable(),
  confidence_score: z.number().finite().optional().nullable(),
  severity: z.string().max(20).optional().nullable(),
  recommendation_text: z.string().optional().nullable(),
  recommended_action: z.string().max(200).optional().nullable(),
  status: AIInsightStatusSchema.optional().default("generated"),
  notes: z.string().optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateAIInsightInput = z.infer<typeof CreateAIInsightSchema>;

export const UpdateAIInsightSchema = CreateAIInsightSchema.partial();
export type UpdateAIInsightInput = z.infer<typeof UpdateAIInsightSchema>;

export const ListAIInsightsQuerySchema = ListQueryBaseSchema.extend({
  status: AIInsightStatusSchema.optional(),
  category: z.string().optional(),
  severity: z.string().optional(),
  parent_entity_type: z.string().optional(),
  parent_entity_id: z.coerce.number().int().optional(),
});
export type ListAIInsightsQuery = z.infer<typeof ListAIInsightsQuerySchema>;
