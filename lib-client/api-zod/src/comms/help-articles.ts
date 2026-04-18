import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const CreateHelpArticleSchema = z.object({
  article_code: z.string().min(1).max(100),
  title: z.string().min(1).max(500),
  body: z.string().min(1),
  category: z.string().max(100).optional().nullable(),
  slug: z.string().max(200).optional().nullable(),
  status: z.enum(["draft", "published", "archived"]).optional().default("draft"),
  published_at: z.string().datetime().optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateHelpArticleInput = z.infer<typeof CreateHelpArticleSchema>;

export const UpdateHelpArticleSchema = CreateHelpArticleSchema.partial();
export type UpdateHelpArticleInput = z.infer<typeof UpdateHelpArticleSchema>;

export const ListHelpArticlesQuerySchema = ListQueryBaseSchema.extend({
  category: z.string().optional(),
  status: z.string().optional(),
});
export type ListHelpArticlesQuery = z.infer<typeof ListHelpArticlesQuerySchema>;
