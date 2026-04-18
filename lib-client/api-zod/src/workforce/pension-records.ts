import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const CreatePensionRecordSchema = z.object({
  payroll_entry_id: z.number().int().positive().optional().nullable(),
  employee_id: z.number().int().positive({ message: "מזהה עובד חובה" }),
  contribution_date: z.string({ required_error: "תאריך הפרשה חובה" }),
  employee_contribution: z.coerce.number().nonnegative().optional().default(0),
  employer_contribution: z.coerce.number().nonnegative().optional().default(0),
  fund_reference: z.string().max(200).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  metadata: MetadataSchema,
});
export type CreatePensionRecordInput = z.infer<typeof CreatePensionRecordSchema>;

export const UpdatePensionRecordSchema = CreatePensionRecordSchema.partial();
export type UpdatePensionRecordInput = z.infer<typeof UpdatePensionRecordSchema>;

export const ListPensionRecordsQuerySchema = ListQueryBaseSchema.extend({
  employee_id: z.coerce.number().int().positive().optional(),
  fund_reference: z.string().optional(),
  contribution_date_from: z.string().optional(),
  contribution_date_to: z.string().optional(),
});
export type ListPensionRecordsQuery = z.infer<typeof ListPensionRecordsQuerySchema>;
