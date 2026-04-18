// ============================================================
// Governance ops schemas — bundled for efficiency:
//   saved_filters, user_preferences, config_entries,
//   queue_jobs, sla_timers, escalation_rules, health_checks,
//   validations_log, security_events, command_logs, alert_subscriptions
// ============================================================
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema, SeveritySchema } from "./_shared";

// ---------- saved_filters ----------
export const CreateSavedFilterSchema = z.object({
  user_id: z.number().int().positive(),
  entity_type: z.string().min(1).max(100),
  filter_name: z.string().min(1).max(200),
  filter_json: z.record(z.unknown()).default({}),
  is_shared: z.boolean().optional().default(false),
  is_default: z.boolean().optional().default(false),
});
export const UpdateSavedFilterSchema = CreateSavedFilterSchema.partial();
export const ListSavedFiltersQuerySchema = ListQueryBaseSchema.extend({
  user_id: z.coerce.number().int().optional(),
  entity_type: z.string().optional(),
  is_shared: z.coerce.boolean().optional(),
});

// ---------- user_preferences ----------
export const UpsertUserPreferenceSchema = z.object({
  user_id: z.number().int().positive(),
  namespace: z.string().min(1).max(100),
  key: z.string().min(1).max(200),
  value: z.unknown(),
});
export const ListUserPreferencesQuerySchema = ListQueryBaseSchema.extend({
  user_id: z.coerce.number().int().optional(),
  namespace: z.string().optional(),
});

// ---------- config_entries ----------
export const CreateConfigEntrySchema = z.object({
  config_key: z.string().min(1).max(200),
  config_value: z.unknown(),
  description: z.string().max(1000).optional().nullable(),
  is_secret: z.boolean().optional().default(false),
  is_active: z.boolean().optional().default(true),
  metadata: MetadataSchema,
});
export const UpdateConfigEntrySchema = CreateConfigEntrySchema.partial();
export const ListConfigEntriesQuerySchema = ListQueryBaseSchema.extend({
  is_active: z.coerce.boolean().optional(),
  is_secret: z.coerce.boolean().optional(),
});

// ---------- queue_jobs ----------
export const QUEUE_JOB_STATUSES = ["pending", "running", "completed", "failed", "cancelled"] as const;
export const QueueJobStatusSchema = z.enum(QUEUE_JOB_STATUSES);
export const ListQueueJobsQuerySchema = ListQueryBaseSchema.extend({
  queue_name: z.string().optional(),
  job_type: z.string().optional(),
  status: QueueJobStatusSchema.optional(),
});
export const RetryQueueJobSchema = z.object({
  reset_attempts: z.boolean().optional().default(false),
});

// ---------- sla_timers ----------
export const SLA_TIMER_STATUSES = ["active", "breached", "resolved", "cancelled"] as const;
export const SlaTimerStatusSchema = z.enum(SLA_TIMER_STATUSES);
export const CreateSlaTimerSchema = z.object({
  entity_type: z.string().min(1).max(100),
  entity_id: z.number().int().positive(),
  sla_name: z.string().min(1).max(200),
  scheduled_at: z.string(),
  deadline_at: z.string(),
  metadata: MetadataSchema,
});
export const ListSlaTimersQuerySchema = ListQueryBaseSchema.extend({
  status: SlaTimerStatusSchema.optional(),
  entity_type: z.string().optional(),
  entity_id: z.coerce.number().int().optional(),
});
export const ExtendSlaTimerSchema = z.object({
  new_deadline_at: z.string(),
  reason: z.string().min(1).max(1000),
});

// ---------- escalation_rules ----------
export const CreateEscalationRuleSchema = z.object({
  rule_name: z.string().min(1).max(200),
  entity_type: z.string().min(1).max(100),
  trigger_condition: z.record(z.unknown()).default({}),
  escalation_level: z.number().int().min(1).max(10).default(1),
  target_role: z.string().max(100).optional().nullable(),
  target_user_id: z.number().int().optional().nullable(),
  notification_channels: z.array(z.enum(["email", "in_app", "sms", "phone", "whatsapp", "telegram"])).default(["email"]),
  is_active: z.boolean().optional().default(true),
  metadata: MetadataSchema,
});
export const UpdateEscalationRuleSchema = CreateEscalationRuleSchema.partial();
export const ListEscalationRulesQuerySchema = ListQueryBaseSchema.extend({
  entity_type: z.string().optional(),
  is_active: z.coerce.boolean().optional(),
});
export const TriggerEscalationSchema = z.object({
  rule_name: z.string().min(1).max(200),
  entity_id: z.number().int().positive(),
  payload: z.record(z.unknown()).optional().default({}),
});

// ---------- health_checks ----------
export const ListHealthChecksQuerySchema = ListQueryBaseSchema.extend({
  check_type: z.string().optional(),
  is_active: z.coerce.boolean().optional(),
});

// ---------- validations_log ----------
export const ListValidationsLogQuerySchema = ListQueryBaseSchema.extend({
  rule_key: z.string().optional(),
  entity_type: z.string().optional(),
  entity_id: z.coerce.number().int().optional(),
  severity: SeveritySchema.optional(),
  is_resolved: z.coerce.boolean().optional(),
});
export const ResolveValidationSchema = z.object({
  resolution_note: z.string().max(2000).optional().nullable(),
});

// ---------- security_events ----------
export const ListSecurityEventsQuerySchema = ListQueryBaseSchema.extend({
  event_type: z.string().optional(),
  severity: SeveritySchema.optional(),
  user_id: z.coerce.number().int().optional(),
  acknowledged: z.coerce.boolean().optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
});
export const AcknowledgeSecurityEventSchema = z.object({
  resolution: z.string().max(2000).optional().nullable(),
});

// ---------- command_logs ----------
export const ListCommandLogsQuerySchema = ListQueryBaseSchema.extend({
  command_name: z.string().optional(),
  user_id: z.coerce.number().int().optional(),
  status: z.enum(["success", "failure", "timeout", "cancelled"]).optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
});

// ---------- alert_subscriptions ----------
export const CreateAlertSubscriptionSchema = z.object({
  user_id: z.number().int().positive(),
  alert_type: z.string().min(1).max(100),
  entity_type: z.string().max(100).optional().nullable(),
  channels: z.array(z.enum(["in_app", "email", "sms", "whatsapp", "telegram", "push"])).default(["in_app"]),
  is_active: z.boolean().optional().default(true),
  filter_expr: z.record(z.unknown()).optional().default({}),
});
export const UpdateAlertSubscriptionSchema = CreateAlertSubscriptionSchema.partial();
export const ListAlertSubscriptionsQuerySchema = ListQueryBaseSchema.extend({
  user_id: z.coerce.number().int().optional(),
  alert_type: z.string().optional(),
  is_active: z.coerce.boolean().optional(),
});
