import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema, NOTIFICATION_STATUSES } from "./_shared";

export const CreateNotificationSchema = z.object({
  user_id: z.number().int().positive().optional().nullable(),
  portal_user_id: z.number().int().positive().optional().nullable(),
  notification_type: z.string().min(1).max(100),
  title: z.string().min(1).max(300),
  body: z.string().max(4000).optional().nullable(),
  severity: z.enum(["info", "low", "medium", "high", "critical"]).optional(),
  linked_entity_type: z.string().max(100).optional().nullable(),
  linked_entity_id: z.number().int().positive().optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateNotificationInput = z.infer<typeof CreateNotificationSchema>;

export const UpdateNotificationSchema = z.object({
  status: z.enum(NOTIFICATION_STATUSES).optional(),
  read_at: z.string().datetime().optional().nullable(),
  archived_at: z.string().datetime().optional().nullable(),
  metadata: MetadataSchema.optional(),
});
export type UpdateNotificationInput = z.infer<typeof UpdateNotificationSchema>;

export const ListNotificationsQuerySchema = ListQueryBaseSchema.extend({
  status: z.enum(NOTIFICATION_STATUSES).optional(),
  user_id: z.coerce.number().int().positive().optional(),
  severity: z.string().optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
});
export type ListNotificationsQuery = z.infer<typeof ListNotificationsQuerySchema>;

export const MarkAllReadSchema = z.object({
  user_id: z.number().int().positive().optional(),
});
export type MarkAllReadInput = z.infer<typeof MarkAllReadSchema>;
