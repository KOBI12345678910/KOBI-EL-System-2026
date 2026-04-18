// Zod schemas for execution.installation_events
import { z } from "zod";
import { AuditColumns, IdSchema, PaginationQuery } from "./_shared";

export const INSTALLATION_STATES = ["scheduled", "en_route", "installed", "signed_off", "cancelled"] as const;
export const InstallationStateSchema = z.enum(INSTALLATION_STATES);

export const CreateInstallationEventSchema = z.object({
  project_id: z.coerce.number().int().positive().optional().nullable(),
  work_order_id: z.coerce.number().int().positive().optional().nullable(),
  installed_at: z.string(),
  installed_by_user_id: z.coerce.number().int().positive().optional().nullable(),
  state: InstallationStateSchema.optional().default("installed"),
  notes: z.string().max(8000).optional().nullable(),
  ...AuditColumns,
});
export type CreateInstallationEventInput = z.infer<typeof CreateInstallationEventSchema>;

export const UpdateInstallationEventSchema = CreateInstallationEventSchema.partial();

export const ReadInstallationEventSchema = z.object({
  id: IdSchema,
  project_id: z.number().int().nullable(),
  work_order_id: z.number().int().nullable(),
  installed_at: z.string(),
  state: z.string(),
});
export type ReadInstallationEvent = z.infer<typeof ReadInstallationEventSchema>;

export const ListInstallationEventsQuerySchema = z.object({
  project_id: z.coerce.number().int().optional(),
  work_order_id: z.coerce.number().int().optional(),
  state: InstallationStateSchema.optional(),
  ...PaginationQuery,
});
