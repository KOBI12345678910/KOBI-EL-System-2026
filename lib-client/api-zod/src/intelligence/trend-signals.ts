// Zod schemas for intelligence.trend_signals
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const CreateTrendSignalSchema = z.object({
  signal_type: z.string().min(1).max(100),
  parent_entity_type: z.string().max(100).optional().nullable(),
  parent_entity_id: z.number().int().optional().nullable(),
  signal_value: z.number().finite().optional().nullable(),
  payload: z.record(z.unknown()).optional().nullable(),
  notes: z.string().optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateTrendSignalInput = z.infer<typeof CreateTrendSignalSchema>;

export const UpdateTrendSignalSchema = CreateTrendSignalSchema.partial();
export type UpdateTrendSignalInput = z.infer<typeof UpdateTrendSignalSchema>;

export const ListTrendSignalsQuerySchema = ListQueryBaseSchema.extend({
  signal_type: z.string().optional(),
  parent_entity_type: z.string().optional(),
});
export type ListTrendSignalsQuery = z.infer<typeof ListTrendSignalsQuerySchema>;
