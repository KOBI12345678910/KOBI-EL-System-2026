// Zod schemas for execution.work_orders
import { z } from "zod";
import { AuditColumns, IdSchema, PaginationQuery, WorkOrderStateSchema } from "./_shared";

export const CreateWorkOrderSchema = z.object({
  work_order_number: z.string().min(1).max(64),
  project_id: z.coerce.number().int().positive(),
  title: z.string().min(1).max(300),
  description: z.string().max(8000).optional().nullable(),
  location_name: z.string().max(300).optional().nullable(),
  required_start_date: z.string().optional().nullable(),
  required_end_date: z.string().optional().nullable(),
  owner_user_id: z.coerce.number().int().positive().optional().nullable(),
  assigned_team_name: z.string().max(300).optional().nullable(),
  state: WorkOrderStateSchema.optional().default("draft"),
  quality_status: z.enum(["pending", "pass", "fail", "conditional"]).optional().nullable(),
  signature_status: z.enum(["pending", "signed", "rejected"]).optional().nullable(),
  internal_notes: z.string().max(8000).optional().nullable(),
  ...AuditColumns,
});
export type CreateWorkOrderInput = z.infer<typeof CreateWorkOrderSchema>;

export const UpdateWorkOrderSchema = CreateWorkOrderSchema.partial();

export const ReadWorkOrderSchema = z.object({
  id: IdSchema,
  public_id: z.string().uuid(),
  work_order_number: z.string(),
  project_id: z.number().int(),
  title: z.string(),
  state: z.string(),
  progress_percent: z.number(),
  required_start_date: z.string().nullable(),
  required_end_date: z.string().nullable(),
  quality_status: z.string().nullable(),
  created_at: z.string(),
});
export type ReadWorkOrder = z.infer<typeof ReadWorkOrderSchema>;

export const ListWorkOrdersQuerySchema = z.object({
  project_id: z.coerce.number().int().optional(),
  state: WorkOrderStateSchema.optional(),
  owner_user_id: z.coerce.number().int().optional(),
  ...PaginationQuery,
});

export const TransitionWorkOrderSchema = z.object({
  to_state: WorkOrderStateSchema,
  reason: z.string().max(2000).optional(),
});

export const CompleteQaSchema = z.object({
  quality_status: z.enum(["pass", "fail", "conditional"]),
  qa_notes: z.string().max(8000).optional().nullable(),
});
export type CompleteQaInput = z.infer<typeof CompleteQaSchema>;
