// ============================================================
// Orchestration — workflow_runs + workflow_step_runs schemas
// ============================================================
import { z } from "zod";
import {
  ListQueryBaseSchema,
  WorkflowRunStatusSchema,
  WorkflowStepRunStatusSchema,
} from "./_shared";

// ---------- workflow_runs ----------
export const ListWorkflowRunsQuerySchema = ListQueryBaseSchema.extend({
  workflow_definition_id: z.coerce.number().int().optional(),
  workflow_code: z.string().optional(),
  status: WorkflowRunStatusSchema.optional(),
  parent_entity_type: z.string().optional(),
  parent_entity_id: z.coerce.number().int().optional(),
  triggered_by_user_id: z.coerce.number().int().optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
});

export const PauseWorkflowRunSchema = z.object({
  reason: z.string().max(1000).optional().nullable(),
});

export const ResumeWorkflowRunSchema = z.object({
  note: z.string().max(1000).optional().nullable(),
});

export const CancelWorkflowRunSchema = z.object({
  reason: z.string().min(1).max(1000),
});

// ---------- workflow_step_runs ----------
export const ListWorkflowStepRunsQuerySchema = ListQueryBaseSchema.extend({
  workflow_run_id: z.coerce.number().int().optional(),
  workflow_step_id: z.coerce.number().int().optional(),
  status: WorkflowStepRunStatusSchema.optional(),
});

// ---------- step_comments ----------
export const CreateStepCommentSchema = z.object({
  step_run_id: z.number().int().positive(),
  comment_text: z.string().min(1).max(4000),
  is_internal: z.boolean().optional().default(false),
});

export const ListStepCommentsQuerySchema = ListQueryBaseSchema.extend({
  step_run_id: z.coerce.number().int().optional(),
});
