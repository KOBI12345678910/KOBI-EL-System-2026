// Zod schemas for execution.installation_teams
import { z } from "zod";
import { AuditColumns, IdSchema, PaginationQuery } from "./_shared";

export const CreateInstallationTeamSchema = z.object({
  code: z.string().min(1).max(64),
  team_name: z.string().min(1).max(200),
  team_lead_user_id: z.coerce.number().int().positive().optional().nullable(),
  team_size: z.coerce.number().int().min(1).max(100).optional().default(1),
  specialization: z.string().max(200).optional().nullable(),
  home_base: z.string().max(200).optional().nullable(),
  vehicle_ids: z.array(z.coerce.number().int()).optional().default([]),
  skills: z.array(z.string()).optional().default([]),
  certifications: z.array(z.string()).optional().default([]),
  hourly_cost: z.coerce.number().nonnegative().optional().default(0),
  currency: z.string().length(3).optional().default("ILS"),
  availability_state: z.enum(["available", "assigned", "on_leave", "unavailable"]).optional().default("available"),
  ...AuditColumns,
});
export type CreateInstallationTeamInput = z.infer<typeof CreateInstallationTeamSchema>;

export const UpdateInstallationTeamSchema = CreateInstallationTeamSchema.partial();

export const ReadInstallationTeamSchema = z.object({
  id: IdSchema,
  code: z.string(),
  team_name: z.string(),
  team_size: z.number().int(),
  availability_state: z.string(),
  is_active: z.boolean(),
});
export type ReadInstallationTeam = z.infer<typeof ReadInstallationTeamSchema>;

export const ListInstallationTeamsQuerySchema = z.object({
  availability_state: z.string().optional(),
  is_active: z.coerce.boolean().optional(),
  ...PaginationQuery,
});
