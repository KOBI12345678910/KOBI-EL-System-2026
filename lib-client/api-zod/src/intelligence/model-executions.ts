// Zod schemas for intelligence.model_executions
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const MODEL_EXECUTION_STATUSES = ["queued", "running", "complete", "failed"] as const;
export const ModelExecutionStatusSchema = z.enum(MODEL_EXECUTION_STATUSES);

export const CreateModelExecutionSchema = z.object({
  model_registry_id: z.number().int().positive(),
  execution_type: z.string().min(1).max(100),
  parent_entity_type: z.string().max(100).optional().nullable(),
  parent_entity_id: z.number().int().optional().nullable(),
  input_payload: z.record(z.unknown()).optional().nullable(),
  output_payload: z.record(z.unknown()).optional().nullable(),
  success: z.boolean().optional().default(false),
  status: ModelExecutionStatusSchema.optional().default("queued"),
  started_at: z.string().optional().nullable(),
  finished_at: z.string().optional().nullable(),
  error_message: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateModelExecutionInput = z.infer<typeof CreateModelExecutionSchema>;

export const UpdateModelExecutionSchema = CreateModelExecutionSchema.partial();
export type UpdateModelExecutionInput = z.infer<typeof UpdateModelExecutionSchema>;

export const ListModelExecutionsQuerySchema = ListQueryBaseSchema.extend({
  status: ModelExecutionStatusSchema.optional(),
  model_registry_id: z.coerce.number().int().optional(),
  execution_type: z.string().optional(),
});
export type ListModelExecutionsQuery = z.infer<typeof ListModelExecutionsQuerySchema>;
