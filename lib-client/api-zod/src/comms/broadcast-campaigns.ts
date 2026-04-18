import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema, CAMPAIGN_STATUSES } from "./_shared";

export const CreateCampaignSchema = z.object({
  campaign_code: z.string().min(1).max(100),
  name: z.string().min(1).max(300),
  channel: z.enum(["email", "sms", "whatsapp", "push"]),
  template_id: z.number().int().positive().optional().nullable(),
  audience_filter: z.record(z.unknown()).optional().default({}),
  status: z.enum(CAMPAIGN_STATUSES).optional().default("draft"),
  scheduled_at: z.string().datetime().optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateCampaignInput = z.infer<typeof CreateCampaignSchema>;

export const UpdateCampaignSchema = CreateCampaignSchema.partial();
export type UpdateCampaignInput = z.infer<typeof UpdateCampaignSchema>;

export const ListCampaignsQuerySchema = ListQueryBaseSchema.extend({
  status: z.enum(CAMPAIGN_STATUSES).optional(),
  channel: z.string().optional(),
});
export type ListCampaignsQuery = z.infer<typeof ListCampaignsQuerySchema>;

export const ExecuteCampaignSchema = z.object({
  dry_run: z.boolean().optional().default(false),
});
export type ExecuteCampaignInput = z.infer<typeof ExecuteCampaignSchema>;
