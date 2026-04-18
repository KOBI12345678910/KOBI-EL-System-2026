import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

// payroll_line_items is an alias for workforce.payroll_entries
export const CreatePayrollLineItemSchema = z.object({
  payroll_run_id: z.number().int().positive({ message: "מזהה ריצת שכר חובה" }),
  employee_id: z.number().int().positive({ message: "מזהה עובד חובה" }),
  gross_pay: z.coerce.number().nonnegative().optional().default(0),
  deductions: z.coerce.number().nonnegative().optional().default(0),
  net_pay: z.coerce.number().nonnegative().optional().default(0),
  pension_total: z.coerce.number().nonnegative().optional().default(0),
  overtime_pay: z.coerce.number().nonnegative().optional().default(0),
  attendance_hours: z.coerce.number().nonnegative().optional().default(0),
  expense_reimbursements: z.coerce.number().nonnegative().optional().default(0),
  state: z.string().max(50).optional().default("Calculated"),
  notes: z.string().max(2000).optional().nullable(),
  metadata: MetadataSchema,
});
export type CreatePayrollLineItemInput = z.infer<typeof CreatePayrollLineItemSchema>;

export const UpdatePayrollLineItemSchema = CreatePayrollLineItemSchema.partial();
export type UpdatePayrollLineItemInput = z.infer<typeof UpdatePayrollLineItemSchema>;

export const ListPayrollLineItemsQuerySchema = ListQueryBaseSchema.extend({
  payroll_run_id: z.coerce.number().int().positive().optional(),
  employee_id: z.coerce.number().int().positive().optional(),
});
export type ListPayrollLineItemsQuery = z.infer<typeof ListPayrollLineItemsQuerySchema>;
