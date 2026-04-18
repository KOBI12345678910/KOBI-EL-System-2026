import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const WEBHOOK_DELIVERY_STATUSES = ["pending", "delivered", "failed", "dead_letter"] as const;
export const WebhookDeliveryStatusSchema = z.enum(WEBHOOK_DELIVERY_STATUSES);

export const CreateWebhookEndpointSchema = z.object({
  endpoint_name: z.string().min(1).max(200),
  target_url: z.string().url().max(1000),
  secret: z.string().max(500).optional().nullable(),
  event_types: z.array(z.string().max(128)).default([]),
  is_active: z.boolean().optional().default(true),
  retry_policy: z.record(z.unknown()).optional().default({
    max_retries: 5,
    backoff: "exponential",
  }),
  headers: z.record(z.string()).optional().default({}),
  metadata: MetadataSchema,
});
export type CreateWebhookEndpointInput = z.infer<typeof CreateWebhookEndpointSchema>;

export const UpdateWebhookEndpointSchema = CreateWebhookEndpointSchema.partial();
export type UpdateWebhookEndpointInput = z.infer<typeof UpdateWebhookEndpointSchema>;

export const ListWebhookEndpointsQuerySchema = ListQueryBaseSchema.extend({
  is_active: z.coerce.boolean().optional(),
  event_type: z.string().optional(),
});
export type ListWebhookEndpointsQuery = z.infer<typeof ListWebhookEndpointsQuerySchema>;

export const ListWebhookDeliveriesQuerySchema = ListQueryBaseSchema.extend({
  endpoint_id: z.coerce.number().int().optional(),
  status: WebhookDeliveryStatusSchema.optional(),
  event_type: z.string().optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
});
export type ListWebhookDeliveriesQuery = z.infer<typeof ListWebhookDeliveriesQuerySchema>;

export const TestWebhookDeliverySchema = z.object({
  event_type: z.string().min(1).max(128).default("test.ping"),
  payload: z.record(z.unknown()).optional().default({ test: true }),
});
export type TestWebhookDeliveryInput = z.infer<typeof TestWebhookDeliverySchema>;
