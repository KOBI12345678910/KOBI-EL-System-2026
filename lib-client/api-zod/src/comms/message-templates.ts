import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema, ChannelSchema } from "./_shared";

export const CreateMessageTemplateSchema = z.object({
  template_code: z.string().min(1).max(100),
  name: z.string().min(1).max(300),
  channel: ChannelSchema,
  subject: z.string().max(500).optional().nullable(),
  body: z.string().min(1).max(100000),
  locale: z.string().max(10).optional().default("he-IL"),
  variables: z.array(z.string()).optional().default([]),
  is_active: z.boolean().optional().default(true),
  metadata: MetadataSchema,
});
export type CreateMessageTemplateInput = z.infer<typeof CreateMessageTemplateSchema>;

export const UpdateMessageTemplateSchema = CreateMessageTemplateSchema.partial();
export type UpdateMessageTemplateInput = z.infer<typeof UpdateMessageTemplateSchema>;

export const ListMessageTemplatesQuerySchema = ListQueryBaseSchema.extend({
  channel: ChannelSchema.optional(),
  is_active: z.coerce.boolean().optional(),
  locale: z.string().optional(),
});
export type ListMessageTemplatesQuery = z.infer<typeof ListMessageTemplatesQuerySchema>;

export const RenderTemplateSchema = z.object({
  variables: z.record(z.unknown()),
});
export type RenderTemplateInput = z.infer<typeof RenderTemplateSchema>;
