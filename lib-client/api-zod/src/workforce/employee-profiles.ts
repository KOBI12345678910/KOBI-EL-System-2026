import { z } from "zod";
import {
  ListQueryBaseSchema, MetadataSchema,
  HebrewPhoneSchema,
} from "./_shared";

// employee_profiles is an alias for workforce.hr_profiles
export const CreateEmployeeProfileSchema = z.object({
  employee_id: z.number().int().positive(),
  emergency_contact_name: z.string().max(300).optional().nullable(),
  emergency_contact_phone: HebrewPhoneSchema.optional().nullable(),
  address_line_1: z.string().max(300).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  region: z.string().max(100).optional().nullable(),
  postal_code: z.string().max(20).optional().nullable(),
  country: z.string().max(100).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateEmployeeProfileInput = z.infer<typeof CreateEmployeeProfileSchema>;

export const UpdateEmployeeProfileSchema = CreateEmployeeProfileSchema.partial();
export type UpdateEmployeeProfileInput = z.infer<typeof UpdateEmployeeProfileSchema>;

export const ListEmployeeProfilesQuerySchema = ListQueryBaseSchema.extend({
  employee_id: z.coerce.number().int().positive().optional(),
});
export type ListEmployeeProfilesQuery = z.infer<typeof ListEmployeeProfilesQuerySchema>;
