// Zod schemas for execution.work_order_qa_checklists
import { z } from "zod";
import { AuditColumns, IdSchema, PaginationQuery } from "./_shared";

export const CreateQaChecklistSchema = z.object({
  work_order_id: z.coerce.number().int().positive(),
  checklist_name: z.string().min(1).max(300),
  template_code: z.string().max(64).optional().nullable(),
  completed_at: z.string().optional().nullable(),
  completed_by_user_id: z.coerce.number().int().positive().optional().nullable(),
  overall_result: z.enum(["pending", "pass", "fail", "conditional"]).optional().default("pending"),
  ...AuditColumns,
});
export type CreateQaChecklistInput = z.infer<typeof CreateQaChecklistSchema>;

export const UpdateQaChecklistSchema = CreateQaChecklistSchema.partial();

export const ReadQaChecklistSchema = z.object({
  id: IdSchema,
  work_order_id: z.number().int(),
  checklist_name: z.string(),
  overall_result: z.string(),
});

export const ListQaChecklistsQuerySchema = z.object({
  work_order_id: z.coerce.number().int().optional(),
  ...PaginationQuery,
});
