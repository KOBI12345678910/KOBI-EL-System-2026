import { z } from "zod";
import {
  ListQueryBaseSchema, MetadataSchema,
  HebrewNationalIdSchema, HebrewBankAccountSchema,
  HebrewPhoneSchema, HebrewEmailSchema,
} from "./_shared";

export const CreateEmployeeSchema = z.object({
  employee_number: z.string().min(1, { message: "מספר עובד חובה" }).max(50),
  full_name: z.string().min(1, { message: "שם מלא חובה" }).max(300),
  employer_id: z.number().int().positive({ message: "מזהה מעסיק חובה" }),
  phone: HebrewPhoneSchema.optional().nullable(),
  email: HebrewEmailSchema.optional().nullable(),
  role_title: z.string().max(200).optional().nullable(),
  department: z.string().max(200).optional().nullable(),
  employment_type: z.string().max(50).optional().nullable(),
  hourly_rate: z.coerce.number().nonnegative().optional().nullable(),
  salary_base: z.coerce.number().nonnegative().optional().nullable(),
  status: z.string().max(50).optional().default("Active"),
  start_date: z.string().optional().nullable(),
  end_date: z.string().optional().nullable(),
  national_id: HebrewNationalIdSchema.optional().nullable(),
  bank_account_reference: HebrewBankAccountSchema.optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateEmployeeInput = z.infer<typeof CreateEmployeeSchema>;

export const UpdateEmployeeSchema = CreateEmployeeSchema.partial();
export type UpdateEmployeeInput = z.infer<typeof UpdateEmployeeSchema>;

export const ListEmployeesQuerySchema = ListQueryBaseSchema.extend({
  employer_id: z.coerce.number().int().positive().optional(),
  status: z.string().optional(),
  department: z.string().optional(),
  is_active: z.coerce.boolean().optional(),
});
export type ListEmployeesQuery = z.infer<typeof ListEmployeesQuerySchema>;
