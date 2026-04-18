// Zod schemas for procurement.three_way_matches
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const TWM_STATES = ["pending", "matched", "discrepancy", "resolved", "cancelled"] as const;
export const TwmStateSchema = z.enum(TWM_STATES);

export const CreateThreeWayMatchSchema = z.object({
  match_number: z.string().min(1).max(64),
  po_id: z.number().int().positive(),
  goods_receipt_id: z.number().int().optional().nullable(),
  supplier_invoice_id: z.number().int().optional().nullable(),
  match_date: z.string().optional(),
  state: TwmStateSchema.optional().default("pending"),
  quantity_variance: z.number().optional().default(0),
  price_variance: z.number().optional().default(0),
  tax_variance: z.number().optional().default(0),
  total_variance: z.number().optional().default(0),
  variance_percent: z.number().optional().default(0),
  tolerance_exceeded: z.boolean().optional().default(false),
  discrepancy_reason: z.string().optional().nullable(),
  resolution_action: z.string().optional().nullable(),
  requires_approval: z.boolean().optional().default(false),
  internal_notes: z.string().optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateThreeWayMatchInput = z.infer<typeof CreateThreeWayMatchSchema>;

export const UpdateThreeWayMatchSchema = CreateThreeWayMatchSchema.partial();
export type UpdateThreeWayMatchInput = z.infer<typeof UpdateThreeWayMatchSchema>;

export const ReadThreeWayMatchSchema = CreateThreeWayMatchSchema.extend({
  id: z.number().int(),
  public_id: z.string().uuid(),
  resolved_at: z.string().nullable(),
  resolved_by_user_id: z.number().int().nullable(),
  approved_at: z.string().nullable(),
  approved_by_user_id: z.number().int().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ReadThreeWayMatch = z.infer<typeof ReadThreeWayMatchSchema>;

export const ListThreeWayMatchesQuerySchema = ListQueryBaseSchema.extend({
  state: TwmStateSchema.optional(),
  po_id: z.coerce.number().int().optional(),
  tolerance_exceeded: z.coerce.boolean().optional(),
  requires_approval: z.coerce.boolean().optional(),
});
export type ListThreeWayMatchesQuery = z.infer<typeof ListThreeWayMatchesQuerySchema>;

export const ResolveThreeWayMatchSchema = z.object({
  resolution_action: z.string().min(1).max(500),
  notes: z.string().optional().nullable(),
});
export type ResolveThreeWayMatchInput = z.infer<typeof ResolveThreeWayMatchSchema>;
