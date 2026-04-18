// Zod schemas for analytics.read_model_invalidations
import { z } from "zod";
import {
  ListQueryBaseSchema,
  MetadataSchema,
  InvalidationStatusSchema,
} from "./_shared";

export const CreateInvalidationSchema = z.object({
  read_model_name: z.string().min(1).max(120),
  trigger_reason: z.string().max(200).optional().nullable(),
  payload: z.record(z.unknown()).optional().default({}),
  status: InvalidationStatusSchema.optional().default("pending"),
  notes: z.string().optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateInvalidationInput = z.infer<typeof CreateInvalidationSchema>;

export const UpdateInvalidationSchema = CreateInvalidationSchema.partial();
export type UpdateInvalidationInput = z.infer<typeof UpdateInvalidationSchema>;

export const ListInvalidationsQuerySchema = ListQueryBaseSchema.extend({
  status: InvalidationStatusSchema.optional(),
  read_model_name: z.string().optional(),
});
export type ListInvalidationsQuery = z.infer<typeof ListInvalidationsQuerySchema>;

export const ReprocessInvalidationSchema = z.object({
  reason: z.string().optional().nullable(),
});
export type ReprocessInvalidationInput = z.infer<typeof ReprocessInvalidationSchema>;
