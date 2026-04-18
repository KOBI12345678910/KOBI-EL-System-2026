// ============================================================
// Orchestration — job_queue schemas
// ============================================================
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema, JobQueueStatusSchema } from "./_shared";

export const CreateJobSchema = z.object({
  queue_name: z.string().min(1).max(100),
  job_type: z.string().min(1).max(100),
  payload: z.record(z.unknown()).optional().default({}),
  parent_entity_type: z.string().max(100).optional().nullable(),
  parent_entity_id: z.number().int().optional().nullable(),
  workflow_run_id: z.number().int().optional().nullable(),
  priority: z.number().int().min(0).max(10).optional().default(5),
  max_attempts: z.number().int().min(1).max(20).optional().default(5),
  scheduled_at: z.string().optional().nullable(),
  metadata: MetadataSchema,
});

export const ListJobsQuerySchema = ListQueryBaseSchema.extend({
  queue_name: z.string().optional(),
  job_type: z.string().optional(),
  status: JobQueueStatusSchema.optional(),
  workflow_run_id: z.coerce.number().int().optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
});

export const RetryJobSchema = z.object({
  reset_attempts: z.boolean().optional().default(false),
});

export const CancelJobSchema = z.object({
  reason: z.string().max(1000).optional().nullable(),
});
