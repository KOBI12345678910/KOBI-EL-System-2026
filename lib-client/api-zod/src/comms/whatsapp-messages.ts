import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema, WHATSAPP_STATUSES } from "./_shared";

export const SendWhatsAppSchema = z.object({
  phone_number: z.string().min(3).max(50),
  message_body: z.string().min(1).max(4096),
  recipient_id: z.number().int().positive().optional().nullable(),
  thread_id: z.number().int().positive().optional().nullable(),
  linked_entity_type: z.string().max(100).optional().nullable(),
  linked_entity_id: z.number().int().positive().optional().nullable(),
  template_id: z.number().int().positive().optional().nullable(),
  template_variables: z.record(z.unknown()).optional(),
  metadata: MetadataSchema,
});
export type SendWhatsAppInput = z.infer<typeof SendWhatsAppSchema>;

export const UpdateWhatsAppSchema = z.object({
  status: z.enum(WHATSAPP_STATUSES).optional(),
  delivery_status: z.string().max(100).optional().nullable(),
  metadata: MetadataSchema.optional(),
});
export type UpdateWhatsAppInput = z.infer<typeof UpdateWhatsAppSchema>;

export const ListWhatsAppQuerySchema = ListQueryBaseSchema.extend({
  status: z.enum(WHATSAPP_STATUSES).optional(),
  recipient_id: z.coerce.number().int().positive().optional(),
  phone_number: z.string().max(50).optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
});
export type ListWhatsAppQuery = z.infer<typeof ListWhatsAppQuerySchema>;
