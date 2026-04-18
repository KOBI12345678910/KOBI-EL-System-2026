// Zod schemas for execution.labor_logs
import { z } from "zod";
import { AuditColumns, IdSchema, PaginationQuery } from "./_shared";

export const LABOR_ACTIVITY_TYPES = ["labor", "setup", "teardown", "rework", "inspection", "travel", "break", "training", "other"] as const;
export const LaborActivityTypeSchema = z.enum(LABOR_ACTIVITY_TYPES);

export const LABOR_LOG_STATES = ["draft", "submitted", "approved", "rejected", "billed"] as const;
export const LaborLogStateSchema = z.enum(LABOR_LOG_STATES);

export const CreateLaborLogSchema = z.object({
  employee_user_id: z.coerce.number().int().positive().optional().nullable(),
  employee_name: z.string().max(300).optional().nullable(),
  project_id: z.coerce.number().int().positive().optional().nullable(),
  work_order_id: z.coerce.number().int().positive().optional().nullable(),
  production_order_id: z.coerce.number().int().positive().optional().nullable(),
  work_center_id: z.coerce.number().int().positive().optional().nullable(),
  task_id: z.coerce.number().int().positive().optional().nullable(),
  activity_type: LaborActivityTypeSchema.optional().default("labor"),
  started_at: z.string(),
  ended_at: z.string().optional().nullable(),
  duration_minutes: z.coerce.number().int().nonnegative().optional().nullable(),
  billable: z.boolean().optional().default(true),
  billable_rate: z.coerce.number().nonnegative().optional().default(0),
  currency: z.string().length(3).optional().default("ILS"),
  state: LaborLogStateSchema.optional().default("draft"),
  ...AuditColumns,
});
export type CreateLaborLogInput = z.infer<typeof CreateLaborLogSchema>;

export const UpdateLaborLogSchema = CreateLaborLogSchema.partial();

export const ReadLaborLogSchema = z.object({
  id: IdSchema,
  employee_user_id: z.number().int().nullable(),
  employee_name: z.string().nullable(),
  project_id: z.number().int().nullable(),
  started_at: z.string(),
  ended_at: z.string().nullable(),
  duration_minutes: z.number().int().nullable(),
  state: z.string(),
});
export type ReadLaborLog = z.infer<typeof ReadLaborLogSchema>;

export const ListLaborLogsQuerySchema = z.object({
  employee_user_id: z.coerce.number().int().optional(),
  project_id: z.coerce.number().int().optional(),
  work_order_id: z.coerce.number().int().optional(),
  state: LaborLogStateSchema.optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
  ...PaginationQuery,
});
