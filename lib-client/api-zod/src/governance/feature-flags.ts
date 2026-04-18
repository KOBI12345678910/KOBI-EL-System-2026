import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const CreateFeatureFlagSchema = z.object({
  flag_key: z.string().min(1).max(128).regex(/^[a-z0-9._-]+$/i, "invalid flag_key"),
  flag_name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  is_enabled: z.boolean().optional().default(false),
  rollout_percent: z.number().min(0).max(100).optional().default(0),
  rule_json: z.record(z.unknown()).optional().default({}),
  is_active: z.boolean().optional().default(true),
  metadata: MetadataSchema,
});
export type CreateFeatureFlagInput = z.infer<typeof CreateFeatureFlagSchema>;

export const UpdateFeatureFlagSchema = CreateFeatureFlagSchema.partial();
export type UpdateFeatureFlagInput = z.infer<typeof UpdateFeatureFlagSchema>;

export const ListFeatureFlagsQuerySchema = ListQueryBaseSchema.extend({
  is_enabled: z.coerce.boolean().optional(),
  is_active: z.coerce.boolean().optional(),
});
export type ListFeatureFlagsQuery = z.infer<typeof ListFeatureFlagsQuerySchema>;

export const CreateFlagTargetSchema = z.object({
  flag_id: z.number().int().positive(),
  target_type: z.enum(["user", "role", "tenant", "segment"]),
  target_ref: z.string().min(1).max(200),
  is_enabled: z.boolean().optional().default(true),
});
export type CreateFlagTargetInput = z.infer<typeof CreateFlagTargetSchema>;
