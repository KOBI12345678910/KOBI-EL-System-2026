// Zod schemas for execution.work_order_tasks
import { z } from "zod";
import { AuditColumns, IdSchema, PaginationQuery } from "./_shared";

export const CreateWorkOrderTaskSchema = z.object({
  work_order_id: z.coerce.number().int().positive(),
  task_name: z.string().min(1).max(300),
  description: z.string().max(8000).optional().nullable(),
  sequence_order: z.coerce.number().int().optional().nullable(),
  assignee_user_id: z.coerce.number().int().positive().optional().nullable(),
  due_date: z.string().optional().nullable(),
  state: z.enum(["Open", "InProgress", "Done", "Blocked", "Cancelled"]).optional().default("Open"),
  ...AuditColumns,
});
export type CreateWorkOrderTaskInput = z.infer<typeof CreateWorkOrderTaskSchema>;

export const UpdateWorkOrderTaskSchema = CreateWorkOrderTaskSchema.partial();

export const ReadWorkOrderTaskSchema = z.object({
  id: IdSchema,
  work_order_id: z.number().int(),
  task_name: z.string(),
  sequence_order: z.number().int().nullable(),
  state: z.string(),
  completed_at: z.string().nullable(),
});

export const ListWorkOrderTasksQuerySchema = z.object({
  work_order_id: z.coerce.number().int().optional(),
  ...PaginationQuery,
});
