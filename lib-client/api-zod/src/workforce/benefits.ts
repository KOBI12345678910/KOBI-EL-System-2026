import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const CreateBenefitSchema = z.object({
  benefit_code: z.string().min(1).max(100),
  benefit_name: z.string().min(1).max(200),
  benefit_type: z.string().min(1).max(50),
  employee_id: z.number().int().positive().optional().nullable(),
  value_amount: z.coerce.number().optional().nullable(),
  value_type: z.string().max(50).optional().nullable(),
  effective_from: z.string().optional().nullable(),
  effective_to: z.string().optional().nullable(),
  taxable: z.boolean().optional().default(true),
  notes: z.string().max(2000).optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateBenefitInput = z.infer<typeof CreateBenefitSchema>;

export const UpdateBenefitSchema = CreateBenefitSchema.partial();
export type UpdateBenefitInput = z.infer<typeof UpdateBenefitSchema>;

export const ListBenefitsQuerySchema = ListQueryBaseSchema.extend({
  employee_id: z.coerce.number().int().positive().optional(),
  benefit_type: z.string().optional(),
  is_active: z.coerce.boolean().optional(),
});
export type ListBenefitsQuery = z.infer<typeof ListBenefitsQuerySchema>;
