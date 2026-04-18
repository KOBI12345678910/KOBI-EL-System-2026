import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema, EMAIL_STATUSES } from "./_shared";

export const SendEmailSchema = z.object({
  to_addresses: z.string().min(3).max(1000),
  cc_addresses: z.string().max(1000).optional().nullable(),
  bcc_addresses: z.string().max(1000).optional().nullable(),
  subject: z.string().min(1).max(500),
  body_text: z.string().max(50000).optional().nullable(),
  body_html: z.string().max(100000).optional().nullable(),
  recipient_id: z.number().int().positive().optional().nullable(),
  thread_id: z.number().int().positive().optional().nullable(),
  linked_entity_type: z.string().max(100).optional().nullable(),
  linked_entity_id: z.number().int().positive().optional().nullable(),
  template_id: z.number().int().positive().optional().nullable(),
  template_variables: z.record(z.unknown()).optional(),
  metadata: MetadataSchema,
});
export type SendEmailInput = z.infer<typeof SendEmailSchema>;

export const UpdateEmailSchema = z.object({
  status: z.enum(EMAIL_STATUSES).optional(),
  delivery_status: z.string().max(100).optional().nullable(),
  metadata: MetadataSchema.optional(),
});
export type UpdateEmailInput = z.infer<typeof UpdateEmailSchema>;

export const ListEmailsQuerySchema = ListQueryBaseSchema.extend({
  status: z.enum(EMAIL_STATUSES).optional(),
  recipient_id: z.coerce.number().int().positive().optional(),
  thread_id: z.coerce.number().int().positive().optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
});
export type ListEmailsQuery = z.infer<typeof ListEmailsQuerySchema>;
