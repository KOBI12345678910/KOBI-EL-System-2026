import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const CreatePortalUserSchema = z.object({
  portal_type: z.string().min(1).max(50),
  display_name: z.string().min(1).max(200),
  email: z.string().email().max(200).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  customer_id: z.number().int().positive().optional().nullable(),
  supplier_id: z.number().int().positive().optional().nullable(),
  tenant_reference: z.string().max(200).optional().nullable(),
  status: z.string().max(50).optional().default("active"),
  metadata: MetadataSchema,
});
export type CreatePortalUserInput = z.infer<typeof CreatePortalUserSchema>;

export const UpdatePortalUserSchema = CreatePortalUserSchema.partial();
export type UpdatePortalUserInput = z.infer<typeof UpdatePortalUserSchema>;

export const ListPortalUsersQuerySchema = ListQueryBaseSchema.extend({
  portal_type: z.string().optional(),
  status: z.string().optional(),
  customer_id: z.coerce.number().int().positive().optional(),
  supplier_id: z.coerce.number().int().positive().optional(),
});
export type ListPortalUsersQuery = z.infer<typeof ListPortalUsersQuerySchema>;
