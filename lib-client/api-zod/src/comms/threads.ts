import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const CreateThreadSchema = z.object({
  thread_type: z.string().max(100).optional().nullable(),
  subject: z.string().max(500).optional().nullable(),
  linked_entity_type: z.string().max(100).optional().nullable(),
  linked_entity_id: z.number().int().positive().optional().nullable(),
  status: z.string().max(50).optional().default("open"),
  metadata: MetadataSchema,
});
export type CreateThreadInput = z.infer<typeof CreateThreadSchema>;

export const UpdateThreadSchema = CreateThreadSchema.partial();
export type UpdateThreadInput = z.infer<typeof UpdateThreadSchema>;

export const ListThreadsQuerySchema = ListQueryBaseSchema.extend({
  thread_type: z.string().optional(),
  status: z.string().optional(),
  linked_entity_type: z.string().optional(),
  linked_entity_id: z.coerce.number().int().positive().optional(),
});
export type ListThreadsQuery = z.infer<typeof ListThreadsQuerySchema>;
