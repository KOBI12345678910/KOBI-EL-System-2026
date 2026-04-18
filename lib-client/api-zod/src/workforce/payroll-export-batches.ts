import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const CreatePayrollExportBatchSchema = z.object({
  batch_number: z.string().max(100).optional(),
  payroll_run_id: z.number().int().positive({ message: "מזהה ריצת שכר חובה" }),
  export_type: z.string().min(1, { message: "סוג ייצוא חובה" }).max(50),
  file_reference: z.string().max(500).optional().nullable(),
  row_count: z.coerce.number().int().nonnegative().optional().default(0),
  status: z.string().max(50).optional().default("Generated"),
  notes: z.string().max(2000).optional().nullable(),
  metadata: MetadataSchema,
});
export type CreatePayrollExportBatchInput = z.infer<typeof CreatePayrollExportBatchSchema>;

export const UpdatePayrollExportBatchSchema = CreatePayrollExportBatchSchema.partial();
export type UpdatePayrollExportBatchInput = z.infer<typeof UpdatePayrollExportBatchSchema>;

export const ListPayrollExportBatchesQuerySchema = ListQueryBaseSchema.extend({
  payroll_run_id: z.coerce.number().int().positive().optional(),
  status: z.string().optional(),
  export_type: z.string().optional(),
});
export type ListPayrollExportBatchesQuery = z.infer<typeof ListPayrollExportBatchesQuerySchema>;
