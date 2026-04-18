// Zod schemas for intelligence.anomaly_feedback
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const CreateAnomalyFeedbackSchema = z.object({
  anomaly_case_id: z.number().int().positive(),
  feedback_type: z.string().min(1).max(100),
  feedback_label: z.string().max(100).optional().nullable(),
  feedback_notes: z.string().optional().nullable(),
  provided_by_user_id: z.number().int().optional().nullable(),
  provided_at: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateAnomalyFeedbackInput = z.infer<typeof CreateAnomalyFeedbackSchema>;

export const UpdateAnomalyFeedbackSchema = CreateAnomalyFeedbackSchema.partial();
export type UpdateAnomalyFeedbackInput = z.infer<typeof UpdateAnomalyFeedbackSchema>;

export const ListAnomalyFeedbackQuerySchema = ListQueryBaseSchema.extend({
  anomaly_case_id: z.coerce.number().int().optional(),
  feedback_type: z.string().optional(),
});
export type ListAnomalyFeedbackQuery = z.infer<typeof ListAnomalyFeedbackQuerySchema>;
