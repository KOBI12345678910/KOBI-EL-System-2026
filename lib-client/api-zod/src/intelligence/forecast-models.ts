// Zod schemas for intelligence.forecast_models
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const CreateForecastModelSchema = z.object({
  model_number: z.string().min(1).max(64),
  forecast_domain: z.string().min(1).max(100),
  parent_entity_type: z.string().max(100).optional().nullable(),
  parent_entity_id: z.number().int().optional().nullable(),
  period_start: z.string().optional().nullable(),
  period_end: z.string().optional().nullable(),
  forecast_payload: z.record(z.unknown()),
  model_version: z.string().max(50).optional().nullable(),
  state: z.string().max(50).optional().default("Generated"),
  notes: z.string().optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateForecastModelInput = z.infer<typeof CreateForecastModelSchema>;

export const UpdateForecastModelSchema = CreateForecastModelSchema.partial();
export type UpdateForecastModelInput = z.infer<typeof UpdateForecastModelSchema>;

export const ListForecastModelsQuerySchema = ListQueryBaseSchema.extend({
  forecast_domain: z.string().optional(),
  state: z.string().optional(),
});
export type ListForecastModelsQuery = z.infer<typeof ListForecastModelsQuerySchema>;
