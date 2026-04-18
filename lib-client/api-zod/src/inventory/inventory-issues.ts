// Zod schemas for inventory.inventory_issues
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const ISSUE_STATUSES = ["pending", "posted", "reversed"] as const;
export const IssueStatusSchema = z.enum(ISSUE_STATUSES);

export const CreateInventoryIssueSchema = z.object({
  issue_number: z.string().min(1).max(64),
  project_id: z.number().int().optional().nullable(),
  work_order_id: z.number().int().optional().nullable(),
  material_id: z.number().int().positive(),
  warehouse_id: z.number().int().positive(),
  quantity_issued: z.number().finite().positive(),
  issue_date: z.string(),
  issued_by_user_id: z.number().int().optional().nullable(),
  cost_per_unit: z.number().finite().optional().nullable(),
  status: IssueStatusSchema.optional().default("pending"),
  notes: z.string().optional().nullable(),
  record_code: z.string().max(64).optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateInventoryIssueInput = z.infer<typeof CreateInventoryIssueSchema>;

export const UpdateInventoryIssueSchema = CreateInventoryIssueSchema.partial();
export type UpdateInventoryIssueInput = z.infer<typeof UpdateInventoryIssueSchema>;

export const ListInventoryIssuesQuerySchema = ListQueryBaseSchema.extend({
  material_id: z.coerce.number().int().optional(),
  warehouse_id: z.coerce.number().int().optional(),
  project_id: z.coerce.number().int().optional(),
  work_order_id: z.coerce.number().int().optional(),
  status: IssueStatusSchema.optional(),
});
export type ListInventoryIssuesQuery = z.infer<typeof ListInventoryIssuesQuerySchema>;
