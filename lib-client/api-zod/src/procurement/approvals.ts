// Zod schemas for procurement.approvals (alias: procurement_approvals)
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const APPROVAL_STATES = ["pending", "approved", "rejected", "cancelled", "escalated"] as const;
export const ApprovalStateSchema = z.enum(APPROVAL_STATES);

export const CreateApprovalSchema = z.object({
  entity_type: z.string().min(1).max(100),
  entity_id: z.number().int().positive(),
  approval_type: z.string().min(1).max(100),
  requested_by_user_id: z.number().int().optional().nullable(),
  assigned_approver_user_id: z.number().int().optional().nullable(),
  state: ApprovalStateSchema.optional().default("pending"),
  approval_policy_code: z.string().max(100).optional().nullable(),
  comments: z.string().optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateApprovalInput = z.infer<typeof CreateApprovalSchema>;

export const UpdateApprovalSchema = CreateApprovalSchema.partial();
export type UpdateApprovalInput = z.infer<typeof UpdateApprovalSchema>;

export const DecideApprovalSchema = z.object({
  decision: z.enum(["approve", "reject", "escalate", "request_changes"]),
  comments: z.string().max(4000).optional().nullable(),
});
export type DecideApprovalInput = z.infer<typeof DecideApprovalSchema>;

export const ReadApprovalSchema = CreateApprovalSchema.extend({
  id: z.number().int(),
  public_id: z.string().uuid(),
  requested_at: z.string(),
  acted_at: z.string().nullable(),
  decision: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ReadApproval = z.infer<typeof ReadApprovalSchema>;

export const ListApprovalsQuerySchema = ListQueryBaseSchema.extend({
  state: ApprovalStateSchema.optional(),
  entity_type: z.string().optional(),
  entity_id: z.coerce.number().int().optional(),
  assigned_approver_user_id: z.coerce.number().int().optional(),
});
export type ListApprovalsQuery = z.infer<typeof ListApprovalsQuerySchema>;
