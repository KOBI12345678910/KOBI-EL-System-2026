// Zod schemas for intelligence.model_registry
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const CreateModelRegistrySchema = z.object({
  model_code: z.string().min(1).max(100),
  model_name: z.string().min(1).max(200),
  model_type: z.string().min(1).max(100),
  version: z.string().min(1).max(50),
  status: z.string().max(50).optional().default("active"),
  config_payload: z.record(z.unknown()).optional().default({}),
  deployed_at: z.string().optional().nullable(),
  retired_at: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateModelRegistryInput = z.infer<typeof CreateModelRegistrySchema>;

export const UpdateModelRegistrySchema = CreateModelRegistrySchema.partial();
export type UpdateModelRegistryInput = z.infer<typeof UpdateModelRegistrySchema>;

export const ListModelRegistryQuerySchema = ListQueryBaseSchema.extend({
  status: z.string().optional(),
  model_type: z.string().optional(),
});
export type ListModelRegistryQuery = z.infer<typeof ListModelRegistryQuerySchema>;
