import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const CreateRoleSchema = z.object({
  role_code: z.string().min(1).max(64),
  role_name: z.string().min(1).max(200),
  description: z.string().max(1000).optional().nullable(),
  is_system: z.boolean().optional().default(false),
  is_active: z.boolean().optional().default(true),
  metadata: MetadataSchema,
});
export type CreateRoleInput = z.infer<typeof CreateRoleSchema>;

export const UpdateRoleSchema = CreateRoleSchema.partial();
export type UpdateRoleInput = z.infer<typeof UpdateRoleSchema>;

export const ListRolesQuerySchema = ListQueryBaseSchema.extend({
  is_system: z.coerce.boolean().optional(),
  is_active: z.coerce.boolean().optional(),
});
export type ListRolesQuery = z.infer<typeof ListRolesQuerySchema>;

export const CreatePermissionSchema = z.object({
  permission_code: z.string().min(1).max(128),
  permission_name: z.string().min(1).max(200),
  module_name: z.string().max(100).optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
  is_active: z.boolean().optional().default(true),
  metadata: MetadataSchema,
});
export type CreatePermissionInput = z.infer<typeof CreatePermissionSchema>;

export const UpdatePermissionSchema = CreatePermissionSchema.partial();
export type UpdatePermissionInput = z.infer<typeof UpdatePermissionSchema>;

export const ListPermissionsQuerySchema = ListQueryBaseSchema.extend({
  module_name: z.string().optional(),
});
export type ListPermissionsQuery = z.infer<typeof ListPermissionsQuerySchema>;

export const GrantPermissionSchema = z.object({
  role_id: z.number().int().positive(),
  permission_id: z.number().int().positive(),
});
export type GrantPermissionInput = z.infer<typeof GrantPermissionSchema>;
