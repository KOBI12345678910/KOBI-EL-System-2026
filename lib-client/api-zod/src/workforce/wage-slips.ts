import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema, WageSlipStatusSchema } from "./_shared";

export const CreateWageSlipSchema = z.object({
  slip_number: z.string().max(100).optional(),
  payroll_entry_id: z.number().int().positive(),
  employee_id: z.number().int().positive(),
  slip_date: z.string({ required_error: "תאריך תלוש חובה" }),
  gross_pay: z.coerce.number().nonnegative(),
  net_pay: z.coerce.number().nonnegative(),
  document_id: z.number().int().positive().optional().nullable(),
  status: WageSlipStatusSchema.optional().default("draft"),
  notes: z.string().max(2000).optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateWageSlipInput = z.infer<typeof CreateWageSlipSchema>;

export const UpdateWageSlipSchema = CreateWageSlipSchema.partial();
export type UpdateWageSlipInput = z.infer<typeof UpdateWageSlipSchema>;

export const ListWageSlipsQuerySchema = ListQueryBaseSchema.extend({
  employee_id: z.coerce.number().int().positive().optional(),
  payroll_entry_id: z.coerce.number().int().positive().optional(),
  status: WageSlipStatusSchema.optional(),
  slip_date_from: z.string().optional(),
  slip_date_to: z.string().optional(),
});
export type ListWageSlipsQuery = z.infer<typeof ListWageSlipsQuerySchema>;

export const PublishWageSlipSchema = z.object({
  generate_pdf: z.boolean().optional().default(true),
  notify_employee: z.boolean().optional().default(false),
});
