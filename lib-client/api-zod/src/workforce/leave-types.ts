import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const CreateLeaveTypeSchema = z.object({
  leave_code: z.string().min(1).max(50),
  leave_name: z.string().min(1).max(200),
  paid: z.boolean().optional().default(true),
  active: z.boolean().optional().default(true),
  metadata: MetadataSchema,
});
export type CreateLeaveTypeInput = z.infer<typeof CreateLeaveTypeSchema>;

export const UpdateLeaveTypeSchema = CreateLeaveTypeSchema.partial();
export type UpdateLeaveTypeInput = z.infer<typeof UpdateLeaveTypeSchema>;

export const ListLeaveTypesQuerySchema = ListQueryBaseSchema.extend({
  active: z.coerce.boolean().optional(),
  paid: z.coerce.boolean().optional(),
});
export type ListLeaveTypesQuery = z.infer<typeof ListLeaveTypesQuerySchema>;
