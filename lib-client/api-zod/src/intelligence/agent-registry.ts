// Zod schemas for intelligence.agent_registry
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const CreateAgentSchema = z.object({
  agent_code: z.string().min(1).max(100),
  agent_name: z.string().min(1).max(200),
  status: z.string().max(50).optional().default("healthy"),
  config_payload: z.record(z.unknown()).optional().default({}),
  last_heartbeat_at: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateAgentInput = z.infer<typeof CreateAgentSchema>;

export const UpdateAgentSchema = CreateAgentSchema.partial();
export type UpdateAgentInput = z.infer<typeof UpdateAgentSchema>;

export const ListAgentsQuerySchema = ListQueryBaseSchema.extend({
  status: z.string().optional(),
});
export type ListAgentsQuery = z.infer<typeof ListAgentsQuerySchema>;
