import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const INTEGRATION_SYNC_STATUSES = ["running", "success", "failed", "partial"] as const;
export const IntegrationSyncStatusSchema = z.enum(INTEGRATION_SYNC_STATUSES);

export const CreateIntegrationConnectionSchema = z.object({
  connection_name: z.string().min(1).max(200),
  provider: z.string().min(1).max(100),
  connection_type: z.string().min(1).max(100),
  config: z.record(z.unknown()).optional().default({}),
  credentials_ref: z.string().max(500).optional().nullable(),
  is_active: z.boolean().optional().default(true),
  metadata: MetadataSchema,
});
export type CreateIntegrationConnectionInput = z.infer<typeof CreateIntegrationConnectionSchema>;

export const UpdateIntegrationConnectionSchema = CreateIntegrationConnectionSchema.partial();
export type UpdateIntegrationConnectionInput = z.infer<typeof UpdateIntegrationConnectionSchema>;

export const ListIntegrationConnectionsQuerySchema = ListQueryBaseSchema.extend({
  provider: z.string().optional(),
  connection_type: z.string().optional(),
  is_active: z.coerce.boolean().optional(),
});
export type ListIntegrationConnectionsQuery = z.infer<typeof ListIntegrationConnectionsQuerySchema>;

export const ListIntegrationSyncLogsQuerySchema = ListQueryBaseSchema.extend({
  connection_id: z.coerce.number().int().optional(),
  status: IntegrationSyncStatusSchema.optional(),
  direction: z.enum(["inbound", "outbound", "bidirectional"]).optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
});
export type ListIntegrationSyncLogsQuery = z.infer<typeof ListIntegrationSyncLogsQuerySchema>;

export const TriggerSyncSchema = z.object({
  direction: z.enum(["inbound", "outbound", "bidirectional"]).optional().default("inbound"),
  entity_type: z.string().max(100).optional().nullable(),
  dry_run: z.boolean().optional().default(false),
});
export type TriggerSyncInput = z.infer<typeof TriggerSyncSchema>;
