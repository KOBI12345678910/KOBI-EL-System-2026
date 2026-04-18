import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema, SMS_STATUSES } from "./_shared";

export const SendSmsSchema = z.object({
  phone_number: z.string().min(3).max(50),
  message_body: z.string().min(1).max(1600),
  recipient_id: z.number().int().positive().optional().nullable(),
  thread_id: z.number().int().positive().optional().nullable(),
  linked_entity_type: z.string().max(100).optional().nullable(),
  linked_entity_id: z.number().int().positive().optional().nullable(),
  template_id: z.number().int().positive().optional().nullable(),
  template_variables: z.record(z.unknown()).optional(),
  metadata: MetadataSchema,
});
export type SendSmsInput = z.infer<typeof SendSmsSchema>;

export const UpdateSmsSchema = z.object({
  status: z.enum(SMS_STATUSES).optional(),
  delivery_status: z.string().max(100).optional().nullable(),
  metadata: MetadataSchema.optional(),
});
export type UpdateSmsInput = z.infer<typeof UpdateSmsSchema>;

export const ListSmsQuerySchema = ListQueryBaseSchema.extend({
  status: z.enum(SMS_STATUSES).optional(),
  recipient_id: z.coerce.number().int().positive().optional(),
  phone_number: z.string().max(50).optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
});
export type ListSmsQuery = z.infer<typeof ListSmsQuerySchema>;
