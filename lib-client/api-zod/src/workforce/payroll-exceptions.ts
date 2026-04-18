import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const CreatePayrollExceptionSchema = z.object({
  payroll_run_id: z.number().int().positive(),
  employee_id: z.number().int().positive().optional().nullable(),
  exception_type: z.string().min(1).max(50),
  severity: z.enum(["low","medium","high","critical"]).optional().default("medium"),
  description: z.string().min(1).max(2000),
  state: z.string().max(50).optional().default("Open"),
  notes: z.string().max(2000).optional().nullable(),
  metadata: MetadataSchema,
});
export type CreatePayrollExceptionInput = z.infer<typeof CreatePayrollExceptionSchema>;

export const UpdatePayrollExceptionSchema = CreatePayrollExceptionSchema.partial();
export type UpdatePayrollExceptionInput = z.infer<typeof UpdatePayrollExceptionSchema>;

export const ListPayrollExceptionsQuerySchema = ListQueryBaseSchema.extend({
  payroll_run_id: z.coerce.number().int().positive().optional(),
  employee_id: z.coerce.number().int().positive().optional(),
  state: z.string().optional(),
  severity: z.string().optional(),
});
export type ListPayrollExceptionsQuery = z.infer<typeof ListPayrollExceptionsQuerySchema>;
