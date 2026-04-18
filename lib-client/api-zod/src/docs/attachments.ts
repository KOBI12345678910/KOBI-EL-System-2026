// Zod schemas for docs.attachments
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const CreateAttachmentSchema = z.object({
  document_id: z.number().int(),
  entity_type: z.string().min(1).max(64),
  entity_id: z.number().int(),
  attached_by_user_id: z.number().int().optional().nullable(),
  record_code: z.string().max(64).optional().nullable(),
  notes: z.string().optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateAttachmentInput = z.infer<typeof CreateAttachmentSchema>;

export const UpdateAttachmentSchema = CreateAttachmentSchema.partial();
export type UpdateAttachmentInput = z.infer<typeof UpdateAttachmentSchema>;

export const ReadAttachmentSchema = CreateAttachmentSchema.extend({
  id: z.number().int(),
  attached_at: z.string(),
  created_at: z.string(),
  updated_at: z.string().optional(),
});
export type ReadAttachment = z.infer<typeof ReadAttachmentSchema>;

export const ListAttachmentsQuerySchema = ListQueryBaseSchema.extend({
  document_id: z.coerce.number().int().optional(),
  entity_type: z.string().optional(),
  entity_id: z.coerce.number().int().optional(),
});
export type ListAttachmentsQuery = z.infer<typeof ListAttachmentsQuerySchema>;
