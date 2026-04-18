// Zod schemas for intelligence.decision_recommendations
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const DECISION_RECOMMENDATION_STATUSES = [
  "pending",
  "accepted",
  "rejected",
  "expired",
] as const;
export const DecisionRecommendationStatusSchema = z.enum(DECISION_RECOMMENDATION_STATUSES);

export const CreateDecisionRecommendationSchema = z.object({
  recommendation_number: z.string().min(1).max(64),
  parent_entity_type: z.string().min(1).max(100),
  parent_entity_id: z.number().int().nonnegative(),
  recommendation_type: z.string().min(1).max(100),
  recommendation_text: z.string().min(1),
  priority: z.string().max(20).optional().nullable(),
  confidence_score: z.number().finite().optional().nullable(),
  action_code: z.string().max(100).optional().nullable(),
  status: DecisionRecommendationStatusSchema.optional().default("pending"),
  notes: z.string().optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateDecisionRecommendationInput = z.infer<typeof CreateDecisionRecommendationSchema>;

export const UpdateDecisionRecommendationSchema = CreateDecisionRecommendationSchema.partial();
export type UpdateDecisionRecommendationInput = z.infer<typeof UpdateDecisionRecommendationSchema>;

export const ListDecisionRecommendationsQuerySchema = ListQueryBaseSchema.extend({
  status: DecisionRecommendationStatusSchema.optional(),
  recommendation_type: z.string().optional(),
  priority: z.string().optional(),
  parent_entity_type: z.string().optional(),
});
export type ListDecisionRecommendationsQuery = z.infer<typeof ListDecisionRecommendationsQuerySchema>;
