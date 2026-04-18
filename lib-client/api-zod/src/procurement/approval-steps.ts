// Zod schemas for procurement.approval_steps
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const APPROVAL_ENTITY_TYPES = [
  "purchase_order",
  "rfq",
  "contract",
  "supplier_invoice",
  "supplier",
  "subcontractor",
  "three_way_match",
] as const;
export const ApprovalEntityTypeSchema = z.enum(APPROVAL_ENTITY_TYPES);

export const CreateApprovalStepSchema = z.object({
  policy_code: z.string().min(1).max(100),
  tier: z.number().int().min(1).max(10),
  tier_name: z.string().min(1).max(100),
  entity_type: ApprovalEntityTypeSchema,
  min_amount: z.number().optional().nullable(),
  max_amount: z.number().optional().nullable(),
  currency: z.string().max(10).optional().default("ILS"),
  required_role_code: z.string().max(100).optional().nullable(),
  required_department: z.string().max(100).optional().nullable(),
  required_approver_count: z.number().int().min(1).max(10).optional().default(1),
  is_parallel: z.boolean().optional().default(false),
  sla_hours: z.number().int().min(1).optional().default(48),
  escalation_tier: z.number().int().optional().nullable(),
  is_active: z.boolean().optional().default(true),
  notes: z.string().optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateApprovalStepInput = z.infer<typeof CreateApprovalStepSchema>;

export const UpdateApprovalStepSchema = CreateApprovalStepSchema.partial();
export type UpdateApprovalStepInput = z.infer<typeof UpdateApprovalStepSchema>;

export const ReadApprovalStepSchema = CreateApprovalStepSchema.extend({
  id: z.number().int(),
  public_id: z.string().uuid(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ReadApprovalStep = z.infer<typeof ReadApprovalStepSchema>;

export const ListApprovalStepsQuerySchema = ListQueryBaseSchema.extend({
  policy_code: z.string().optional(),
  entity_type: ApprovalEntityTypeSchema.optional(),
  is_active: z.coerce.boolean().optional(),
});
export type ListApprovalStepsQuery = z.infer<typeof ListApprovalStepsQuerySchema>;
