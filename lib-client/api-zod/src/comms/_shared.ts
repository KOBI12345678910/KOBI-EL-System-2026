// ============================================================
// Shared primitives for comms zod schemas
// ============================================================
import { z } from "zod";

export const IdSchema = z.union([z.number().int().positive(), z.string()]);
export const NullableString = z.string().optional().nullable();
export const NullableNumber = z.number().optional().nullable();
export const NullableDate = z.string().optional().nullable();
export const MetadataSchema = z.record(z.unknown()).optional().default({});
export const JsonSchema = z.record(z.unknown()).optional().default({});

export const ListQueryBaseSchema = z.object({
  q: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
  order_by: z.string().max(64).optional().default("id"),
  order_dir: z.enum(["asc", "desc"]).optional().default("desc"),
});
export type ListQueryBase = z.infer<typeof ListQueryBaseSchema>;

export const CHANNELS = ["email", "sms", "whatsapp", "push", "inapp"] as const;
export const ChannelSchema = z.enum(CHANNELS);

export const EMAIL_STATUSES = [
  "queued", "sent", "delivered", "bounced", "failed", "opened", "clicked",
] as const;
export const SMS_STATUSES = ["queued", "sent", "delivered", "failed"] as const;
export const WHATSAPP_STATUSES = ["sent", "delivered", "read", "failed"] as const;
export const NOTIFICATION_STATUSES = ["unread", "read", "archived"] as const;
export const TICKET_STATUSES = [
  "open", "in_progress", "waiting_customer", "resolved", "closed",
] as const;
export const CAMPAIGN_STATUSES = [
  "draft", "scheduled", "sending", "completed", "cancelled",
] as const;
