// ============================================================
// Orchestration — workflow_definitions + workflow_steps schemas
// ============================================================
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema, StepTypeSchema } from "./_shared";

// ---------- workflow_definitions ----------
export const CreateWorkflowDefinitionSchema = z.object({
  workflow_code: z.string().min(1).max(100).regex(/^[a-z][a-z0-9_]*$/, {
    message: "workflow_code must start with a letter and use lowercase + underscores",
  }),
  workflow_name: z.string().min(1).max(200),
  category: z.string().max(100).optional().nullable(),
  version: z.number().int().min(1).optional().default(1),
  active: z.boolean().optional().default(true),
  description: z.string().max(2000).optional().nullable(),
  definition_payload: z.record(z.unknown()).optional().default({}),
  metadata: MetadataSchema,
});

export const UpdateWorkflowDefinitionSchema = CreateWorkflowDefinitionSchema.partial();

export const ListWorkflowDefinitionsQuerySchema = ListQueryBaseSchema.extend({
  category: z.string().optional(),
  active: z.coerce.boolean().optional(),
  workflow_code: z.string().optional(),
});

// ---------- workflow_steps ----------
export const CreateWorkflowStepSchema = z.object({
  workflow_definition_id: z.number().int().positive(),
  step_code: z.string().min(1).max(100),
  step_name: z.string().min(1).max(200),
  step_type: StepTypeSchema,
  sequence_order: z.number().int().min(0),
  config_payload: z.record(z.unknown()).optional().default({}),
  active: z.boolean().optional().default(true),
  description: z.string().max(1000).optional().nullable(),
  timeout_seconds: z.number().int().min(1).optional().nullable(),
  retry_policy: z.record(z.unknown()).optional().default({
    max_retries: 3, backoff: "exponential",
  }),
  metadata: MetadataSchema,
});

export const UpdateWorkflowStepSchema = CreateWorkflowStepSchema.partial();

export const ListWorkflowStepsQuerySchema = ListQueryBaseSchema.extend({
  workflow_definition_id: z.coerce.number().int().optional(),
  step_type: StepTypeSchema.optional(),
  active: z.coerce.boolean().optional(),
});

// ---------- business action: trigger a workflow ----------
export const TriggerWorkflowSchema = z.object({
  parent_entity_type: z.string().max(100).optional().nullable(),
  parent_entity_id: z.number().int().optional().nullable(),
  correlation_id: z.string().max(200).optional().nullable(),
  context: z.record(z.unknown()).optional().default({}),
  priority: z.number().int().min(0).max(10).optional().default(5),
  scheduled_at: z.string().optional().nullable(),
});
