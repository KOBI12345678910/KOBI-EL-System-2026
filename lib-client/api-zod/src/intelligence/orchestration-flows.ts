// Zod schemas for intelligence.orchestration_flows
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const ORCHESTRATION_FLOW_STATUSES = ["draft", "active", "paused", "completed"] as const;
export const OrchestrationFlowStatusSchema = z.enum(ORCHESTRATION_FLOW_STATUSES);

export const ORCHESTRATION_FLOW_TRIGGER_TYPES = ["manual", "scheduled", "event", "webhook"] as const;
export const OrchestrationFlowTriggerTypeSchema = z.enum(ORCHESTRATION_FLOW_TRIGGER_TYPES);

export const CreateOrchestrationFlowSchema = z.object({
  flow_name: z.string().min(1).max(200),
  description: z.string().optional().nullable(),
  trigger_type: OrchestrationFlowTriggerTypeSchema.optional().default("manual"),
  trigger_config: z.record(z.unknown()).optional().default({}),
  steps: z.array(z.record(z.unknown())).optional().default([]),
  status: OrchestrationFlowStatusSchema.optional().default("draft"),
  last_run_at: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateOrchestrationFlowInput = z.infer<typeof CreateOrchestrationFlowSchema>;

export const UpdateOrchestrationFlowSchema = CreateOrchestrationFlowSchema.partial();
export type UpdateOrchestrationFlowInput = z.infer<typeof UpdateOrchestrationFlowSchema>;

export const TriggerOrchestrationFlowSchema = z.object({
  input: z.record(z.unknown()).optional().default({}),
});
export type TriggerOrchestrationFlowInput = z.infer<typeof TriggerOrchestrationFlowSchema>;

export const ListOrchestrationFlowsQuerySchema = ListQueryBaseSchema.extend({
  status: OrchestrationFlowStatusSchema.optional(),
  trigger_type: OrchestrationFlowTriggerTypeSchema.optional(),
});
export type ListOrchestrationFlowsQuery = z.infer<typeof ListOrchestrationFlowsQuerySchema>;
