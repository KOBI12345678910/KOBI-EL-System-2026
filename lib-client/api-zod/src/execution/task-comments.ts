// Zod schemas for execution.task_comments
import { z } from "zod";
import { IdSchema, PaginationQuery } from "./_shared";

export const CreateTaskCommentSchema = z.object({
  task_id: z.coerce.number().int().positive(),
  author_user_id: z.coerce.number().int().positive().optional().nullable(),
  comment_body: z.string().min(1).max(16000),
  mentions: z.array(z.coerce.number().int().positive()).optional().default([]),
});
export type CreateTaskCommentInput = z.infer<typeof CreateTaskCommentSchema>;

export const ReadTaskCommentSchema = z.object({
  id: IdSchema,
  task_id: z.number().int(),
  comment_body: z.string(),
  author_user_id: z.number().int().nullable(),
  created_at: z.string(),
});

export const ListTaskCommentsQuerySchema = z.object({
  task_id: z.coerce.number().int().optional(),
  ...PaginationQuery,
});
