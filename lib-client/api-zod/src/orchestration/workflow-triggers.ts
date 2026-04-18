// ============================================================
// Orchestration — workflow_triggers schemas
// ============================================================
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema, TriggerTypeSchema } from "./_shared";

export const CreateWorkflowTriggerSchema = z.object({
  workflow_def_id: z.number().int().positive(),
  trigger_name: z.string().min(1).max(200),
  trigger_type: TriggerTypeSchema,
  trigger_config: z.record(z.unknown()).optional().default({}),
  is_enabled: z.boolean().optional().default(true),
  metadata: MetadataSchema,
});

export const UpdateWorkflowTriggerSchema = CreateWorkflowTriggerSchema.partial();

export const ListWorkflowTriggersQuerySchema = ListQueryBaseSchema.extend({
  workflow_def_id: z.coerce.number().int().optional(),
  trigger_type: TriggerTypeSchema.optional(),
  is_enabled: z.coerce.boolean().optional(),
});

export const EnableWorkflowTriggerSchema = z.object({
  is_enabled: z.boolean(),
});
