// Zod schemas for intelligence.recommendation_feedback
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const CreateRecommendationFeedbackSchema = z.object({
  recommendation_id: z.number().int().positive(),
  feedback_type: z.string().min(1).max(100),
  feedback_notes: z.string().optional().nullable(),
  provided_by_user_id: z.number().int().optional().nullable(),
  provided_at: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateRecommendationFeedbackInput = z.infer<typeof CreateRecommendationFeedbackSchema>;

export const UpdateRecommendationFeedbackSchema = CreateRecommendationFeedbackSchema.partial();
export type UpdateRecommendationFeedbackInput = z.infer<typeof UpdateRecommendationFeedbackSchema>;

export const ListRecommendationFeedbackQuerySchema = ListQueryBaseSchema.extend({
  recommendation_id: z.coerce.number().int().optional(),
  feedback_type: z.string().optional(),
});
export type ListRecommendationFeedbackQuery = z.infer<typeof ListRecommendationFeedbackQuerySchema>;
