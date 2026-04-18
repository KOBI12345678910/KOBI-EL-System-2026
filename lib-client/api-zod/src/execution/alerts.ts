// Zod schemas for execution.alerts
import { z } from "zod";
import { AuditColumns, IdSchema, PaginationQuery } from "./_shared";

export const ALERT_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export const AlertSeveritySchema = z.enum(ALERT_SEVERITIES);

export const ALERT_STATES = ["Open", "Acknowledged", "Resolved", "Dismissed"] as const;
export const AlertStateSchema = z.enum(ALERT_STATES);

export const CreateAlertSchema = z.object({
  alert_number: z.string().min(1).max(64),
  category: z.string().min(1).max(100),
  severity: AlertSeveritySchema,
  parent_entity_type: z.string().max(64).optional().nullable(),
  parent_entity_id: z.coerce.number().int().optional().nullable(),
  title: z.string().min(1).max(300),
  description: z.string().max(8000).optional().nullable(),
  assigned_to_user_id: z.coerce.number().int().positive().optional().nullable(),
  source_ai_insight_id: z.coerce.number().int().positive().optional().nullable(),
  source_anomaly_case_id: z.coerce.number().int().positive().optional().nullable(),
  state: AlertStateSchema.optional().default("Open"),
  ...AuditColumns,
});
export type CreateAlertInput = z.infer<typeof CreateAlertSchema>;

export const UpdateAlertSchema = CreateAlertSchema.partial();

export const ReadAlertSchema = z.object({
  id: IdSchema,
  alert_number: z.string(),
  category: z.string(),
  severity: z.string(),
  title: z.string(),
  state: z.string(),
  created_at: z.string(),
});

export const ListAlertsQuerySchema = z.object({
  category: z.string().optional(),
  severity: AlertSeveritySchema.optional(),
  state: AlertStateSchema.optional(),
  ...PaginationQuery,
});
