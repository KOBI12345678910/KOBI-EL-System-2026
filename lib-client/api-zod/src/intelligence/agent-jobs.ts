// Zod schemas for intelligence.agent_jobs
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const AGENT_JOB_STATUSES = ["queued", "running", "completed", "failed"] as const;
export const AgentJobStatusSchema = z.enum(AGENT_JOB_STATUSES);

export const CreateAgentJobSchema = z.object({
  agent_id: z.number().int().positive(),
  job_type: z.string().min(1).max(100),
  status: AgentJobStatusSchema.optional().default("queued"),
  payload: z.record(z.unknown()).optional().nullable(),
  notes: z.string().optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateAgentJobInput = z.infer<typeof CreateAgentJobSchema>;

export const UpdateAgentJobSchema = CreateAgentJobSchema.partial();
export type UpdateAgentJobInput = z.infer<typeof UpdateAgentJobSchema>;

export const EnqueueAgentJobSchema = z.object({
  agent_id: z.number().int().positive(),
  job_type: z.string().min(1).max(100),
  payload: z.record(z.unknown()).optional().default({}),
});
export type EnqueueAgentJobInput = z.infer<typeof EnqueueAgentJobSchema>;

export const ListAgentJobsQuerySchema = ListQueryBaseSchema.extend({
  status: AgentJobStatusSchema.optional(),
  agent_id: z.coerce.number().int().optional(),
  job_type: z.string().optional(),
});
export type ListAgentJobsQuery = z.infer<typeof ListAgentJobsQuerySchema>;
