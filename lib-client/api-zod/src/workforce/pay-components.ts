import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const CreatePayComponentSchema = z.object({
  component_code: z.string().min(1).max(50),
  component_name: z.string().min(1).max(200),
  component_type: z.string().min(1).max(50),
  taxable: z.boolean().optional().default(true),
  pensionable: z.boolean().optional().default(true),
  active: z.boolean().optional().default(true),
  config_payload: z.record(z.unknown()).optional().default({}),
  notes: z.string().max(2000).optional().nullable(),
  metadata: MetadataSchema,
});
export type CreatePayComponentInput = z.infer<typeof CreatePayComponentSchema>;

export const UpdatePayComponentSchema = CreatePayComponentSchema.partial();
export type UpdatePayComponentInput = z.infer<typeof UpdatePayComponentSchema>;

export const ListPayComponentsQuerySchema = ListQueryBaseSchema.extend({
  active: z.coerce.boolean().optional(),
  component_type: z.string().optional(),
});
export type ListPayComponentsQuery = z.infer<typeof ListPayComponentsQuerySchema>;

// employee_pay_components
export const CreateEmployeePayComponentSchema = z.object({
  employee_id: z.number().int().positive(),
  pay_component_id: z.number().int().positive(),
  value_type: z.string().min(1).max(50),
  value_amount: z.coerce.number(),
  effective_from: z.string(),
  effective_to: z.string().optional().nullable(),
  active: z.boolean().optional().default(true),
  metadata: MetadataSchema,
});
export type CreateEmployeePayComponentInput = z.infer<typeof CreateEmployeePayComponentSchema>;

export const UpdateEmployeePayComponentSchema = CreateEmployeePayComponentSchema.partial();
export type UpdateEmployeePayComponentInput = z.infer<typeof UpdateEmployeePayComponentSchema>;

export const ListEmployeePayComponentsQuerySchema = ListQueryBaseSchema.extend({
  employee_id: z.coerce.number().int().positive().optional(),
  pay_component_id: z.coerce.number().int().positive().optional(),
  active: z.coerce.boolean().optional(),
});
export type ListEmployeePayComponentsQuery = z.infer<typeof ListEmployeePayComponentsQuerySchema>;
