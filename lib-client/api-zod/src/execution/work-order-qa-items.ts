// Zod schemas for execution.work_order_qa_items
import { z } from "zod";
import { AuditColumns, IdSchema, PaginationQuery } from "./_shared";

export const CreateQaItemSchema = z.object({
  checklist_id: z.coerce.number().int().positive(),
  item_code: z.string().max(64).optional().nullable(),
  item_description: z.string().min(1).max(500),
  sequence_order: z.coerce.number().int().optional().nullable(),
  result: z.enum(["pending", "pass", "fail", "na"]).optional().default("pending"),
  comments: z.string().max(4000).optional().nullable(),
  verified_by_user_id: z.coerce.number().int().positive().optional().nullable(),
  ...AuditColumns,
});
export type CreateQaItemInput = z.infer<typeof CreateQaItemSchema>;

export const UpdateQaItemSchema = CreateQaItemSchema.partial();

export const ReadQaItemSchema = z.object({
  id: IdSchema,
  checklist_id: z.number().int(),
  item_description: z.string(),
  result: z.string(),
});

export const ListQaItemsQuerySchema = z.object({
  checklist_id: z.coerce.number().int().optional(),
  ...PaginationQuery,
});
