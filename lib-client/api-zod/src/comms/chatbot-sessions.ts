import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const CreateChatbotSessionSchema = z.object({
  user_id: z.number().int().positive().optional().nullable(),
  portal_user_id: z.number().int().positive().optional().nullable(),
  linked_entity_type: z.string().max(100).optional().nullable(),
  linked_entity_id: z.number().int().positive().optional().nullable(),
  channel: z.string().max(100).optional().nullable(),
  state: z.string().max(50).optional().default("Open"),
  transcript: z.string().max(100000).optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateChatbotSessionInput = z.infer<typeof CreateChatbotSessionSchema>;

export const UpdateChatbotSessionSchema = CreateChatbotSessionSchema.partial().extend({
  ended_at: z.string().datetime().optional().nullable(),
});
export type UpdateChatbotSessionInput = z.infer<typeof UpdateChatbotSessionSchema>;

export const ListChatbotSessionsQuerySchema = ListQueryBaseSchema.extend({
  state: z.string().optional(),
  user_id: z.coerce.number().int().positive().optional(),
  channel: z.string().optional(),
});
export type ListChatbotSessionsQuery = z.infer<typeof ListChatbotSessionsQuerySchema>;

export const ChatbotFeedbackSchema = z.object({
  session_id: z.number().int().positive(),
  rating: z.number().int().min(1).max(5),
  feedback_text: z.string().max(2000).optional().nullable(),
});
export type ChatbotFeedbackInput = z.infer<typeof ChatbotFeedbackSchema>;
