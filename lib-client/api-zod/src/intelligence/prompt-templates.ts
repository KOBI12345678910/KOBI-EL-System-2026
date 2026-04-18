// Zod schemas for intelligence.prompt_templates
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const CreatePromptTemplateSchema = z.object({
  template_name: z.string().min(1).max(200),
  template_text: z.string().min(1),
  variables: z.record(z.unknown()).optional().default({}),
  category: z.string().max(100).optional().nullable(),
  language: z.string().max(10).optional().default("he"),
  is_active: z.boolean().optional().default(true),
  usage_count: z.number().int().nonnegative().optional().default(0),
  notes: z.string().optional().nullable(),
  metadata: MetadataSchema,
});
export type CreatePromptTemplateInput = z.infer<typeof CreatePromptTemplateSchema>;

export const UpdatePromptTemplateSchema = CreatePromptTemplateSchema.partial();
export type UpdatePromptTemplateInput = z.infer<typeof UpdatePromptTemplateSchema>;

export const TestRunPromptTemplateSchema = z.object({
  variables: z.record(z.unknown()).optional().default({}),
});
export type TestRunPromptTemplateInput = z.infer<typeof TestRunPromptTemplateSchema>;

export const ListPromptTemplatesQuerySchema = ListQueryBaseSchema.extend({
  category: z.string().optional(),
  language: z.string().optional(),
  is_active: z.coerce.boolean().optional(),
});
export type ListPromptTemplatesQuery = z.infer<typeof ListPromptTemplatesQuerySchema>;
