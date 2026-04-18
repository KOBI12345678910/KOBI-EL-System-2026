import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const CreateUserSchema = z.object({
  username: z.string().min(1).max(100),
  email: z.string().email().max(200).optional().nullable(),
  full_name: z.string().max(300).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  is_active: z.boolean().optional().default(true),
  preferred_locale: z.string().max(10).optional().default("he-IL"),
  metadata: MetadataSchema,
});
export type CreateUserInput = z.infer<typeof CreateUserSchema>;

export const UpdateUserSchema = CreateUserSchema.partial();
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;

export const ListUsersQuerySchema = ListQueryBaseSchema.extend({
  is_active: z.coerce.boolean().optional(),
  role_code: z.string().optional(),
});
export type ListUsersQuery = z.infer<typeof ListUsersQuerySchema>;

export const AssignRoleSchema = z.object({
  role_id: z.number().int().positive(),
  valid_until: z.string().datetime().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});
export type AssignRoleInput = z.infer<typeof AssignRoleSchema>;

export const RevokeRoleSchema = z.object({
  role_id: z.number().int().positive(),
  reason: z.string().max(500).optional().nullable(),
});
export type RevokeRoleInput = z.infer<typeof RevokeRoleSchema>;
