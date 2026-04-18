import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const CreateShiftSchema = z.object({
  employee_id: z.number().int().positive(),
  project_id: z.number().int().positive().optional().nullable(),
  work_order_id: z.number().int().positive().optional().nullable(),
  shift_start: z.string({ required_error: "זמן תחילת משמרת חובה" }),
  shift_end: z.string().optional().nullable(),
  shift_type: z.string().max(50).optional().nullable(),
  state: z.string().max(50).optional().default("Scheduled"),
  notes: z.string().max(2000).optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateShiftInput = z.infer<typeof CreateShiftSchema>;

export const UpdateShiftSchema = CreateShiftSchema.partial();
export type UpdateShiftInput = z.infer<typeof UpdateShiftSchema>;

export const ListShiftsQuerySchema = ListQueryBaseSchema.extend({
  employee_id: z.coerce.number().int().positive().optional(),
  project_id: z.coerce.number().int().positive().optional(),
  shift_date_from: z.string().optional(),
  shift_date_to: z.string().optional(),
  state: z.string().optional(),
});
export type ListShiftsQuery = z.infer<typeof ListShiftsQuerySchema>;
