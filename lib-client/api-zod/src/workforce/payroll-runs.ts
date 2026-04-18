import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema, PayrollRunStatusSchema } from "./_shared";

export const CreatePayrollRunSchema = z.object({
  payroll_run_number: z.string().max(100).optional(),
  payroll_period_start: z.string({ required_error: "תאריך תחילת תקופה חובה" }),
  payroll_period_end: z.string({ required_error: "תאריך סיום תקופה חובה" }),
  employer_id: z.number().int().positive().optional().nullable(),
  status: PayrollRunStatusSchema.optional().default("draft"),
  notes: z.string().max(2000).optional().nullable(),
  metadata: MetadataSchema,
});
export type CreatePayrollRunInput = z.infer<typeof CreatePayrollRunSchema>;

export const UpdatePayrollRunSchema = CreatePayrollRunSchema.partial();
export type UpdatePayrollRunInput = z.infer<typeof UpdatePayrollRunSchema>;

export const ListPayrollRunsQuerySchema = ListQueryBaseSchema.extend({
  employer_id: z.coerce.number().int().positive().optional(),
  status: PayrollRunStatusSchema.optional(),
  period_from: z.string().optional(),
  period_to: z.string().optional(),
});
export type ListPayrollRunsQuery = z.infer<typeof ListPayrollRunsQuerySchema>;

export const CalculatePayrollRunSchema = z.object({
  recompute: z.boolean().optional().default(false),
});

export const ApprovePayrollRunSchema = z.object({
  approval_notes: z.string().max(2000).optional().nullable(),
});

export const PayPayrollRunSchema = z.object({
  paid_at: z.string().optional(),
  payment_reference: z.string().max(200).optional().nullable(),
});

export const ClosePayrollRunSchema = z.object({
  closure_notes: z.string().max(2000).optional().nullable(),
});
