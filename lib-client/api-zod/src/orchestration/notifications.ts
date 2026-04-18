// ============================================================
// Orchestration — notifications schemas
// ============================================================
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema, NotificationStatusSchema } from "./_shared";

export const NOTIFICATION_CHANNELS = [
  "in_app", "email", "sms", "whatsapp", "telegram", "push",
] as const;
export const NotificationChannelSchema = z.enum(NOTIFICATION_CHANNELS);

export const NOTIFICATION_SEVERITY = [
  "info", "low", "medium", "high", "critical",
] as const;
export const NotificationSeveritySchema = z.enum(NOTIFICATION_SEVERITY);

export const CreateNotificationSchema = z.object({
  notification_number: z.string().max(100).optional(),
  recipient_type: z.string().min(1).max(50),
  recipient_id: z.number().int().optional().nullable(),
  title: z.string().min(1).max(400),
  message_text: z.string().max(4000).optional().nullable(),
  severity: NotificationSeveritySchema.optional().default("info"),
  channel: NotificationChannelSchema.optional().default("in_app"),
  related_entity_type: z.string().max(100).optional().nullable(),
  related_entity_id: z.number().int().optional().nullable(),
  scheduled_at: z.string().optional().nullable(),
  metadata: MetadataSchema,
});

export const ListNotificationsQuerySchema = ListQueryBaseSchema.extend({
  recipient_type: z.string().optional(),
  recipient_id: z.coerce.number().int().optional(),
  status: NotificationStatusSchema.optional(),
  severity: NotificationSeveritySchema.optional(),
  channel: NotificationChannelSchema.optional(),
  unread_only: z.coerce.boolean().optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
});

export const MarkReadSchema = z.object({
  read: z.boolean().optional().default(true),
});

export const DismissNotificationSchema = z.object({
  reason: z.string().max(1000).optional().nullable(),
});
