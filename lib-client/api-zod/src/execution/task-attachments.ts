// Zod schemas for execution.task_attachments
import { z } from "zod";
import { IdSchema, PaginationQuery } from "./_shared";

export const CreateTaskAttachmentSchema = z.object({
  task_id: z.coerce.number().int().positive(),
  file_name: z.string().min(1).max(300),
  file_url: z.string().url().max(2000),
  file_mime_type: z.string().max(200).optional().nullable(),
  file_size_bytes: z.coerce.number().int().nonnegative().optional().nullable(),
  uploaded_by_user_id: z.coerce.number().int().positive().optional().nullable(),
});
export type CreateTaskAttachmentInput = z.infer<typeof CreateTaskAttachmentSchema>;

export const ReadTaskAttachmentSchema = z.object({
  id: IdSchema,
  task_id: z.number().int(),
  file_name: z.string(),
  file_url: z.string(),
  created_at: z.string(),
});

export const ListTaskAttachmentsQuerySchema = z.object({
  task_id: z.coerce.number().int().optional(),
  ...PaginationQuery,
});
