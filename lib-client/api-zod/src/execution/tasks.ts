// Zod schemas for execution.tasks
import { z } from "zod";
import { AuditColumns, IdSchema, PaginationQuery, TaskStateSchema } from "./_shared";

export const CreateTaskSchema = z.object({
  task_number: z.string().min(1).max(64),
  title: z.string().min(1).max(300),
  description: z.string().max(8000).optional().nullable(),
  priority: z.enum(["low", "normal", "high", "critical"]).optional().nullable(),
  due_date: z.string().optional().nullable(),
  assignee_user_id: z.coerce.number().int().positive().optional().nullable(),
  assignee_employee_id: z.coerce.number().int().positive().optional().nullable(),
  project_id: z.coerce.number().int().positive().optional().nullable(),
  work_order_id: z.coerce.number().int().positive().optional().nullable(),
  linked_entity_type: z.string().max(64).optional().nullable(),
  linked_entity_id: z.coerce.number().int().optional().nullable(),
  state: TaskStateSchema.optional().default("backlog"),
  ...AuditColumns,
});
export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;

export const UpdateTaskSchema = CreateTaskSchema.partial();

export const ReadTaskSchema = z.object({
  id: IdSchema,
  public_id: z.string().uuid().optional(),
  task_number: z.string(),
  title: z.string(),
  state: z.string(),
  priority: z.string().nullable(),
  due_date: z.string().nullable(),
  assignee_user_id: z.number().int().nullable(),
  project_id: z.number().int().nullable(),
  work_order_id: z.number().int().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ReadTask = z.infer<typeof ReadTaskSchema>;

export const ListTasksQuerySchema = z.object({
  project_id: z.coerce.number().int().optional(),
  work_order_id: z.coerce.number().int().optional(),
  assignee_user_id: z.coerce.number().int().optional(),
  state: TaskStateSchema.optional(),
  priority: z.string().optional(),
  ...PaginationQuery,
});

export const TransitionTaskSchema = z.object({
  to_state: TaskStateSchema,
  reason: z.string().max(2000).optional(),
});
export type TransitionTaskInput = z.infer<typeof TransitionTaskSchema>;
