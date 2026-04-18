// Zod schemas for inventory.reorder_rules
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema, ReorderRuleStatusSchema } from "./_shared";

export const CreateReorderRuleSchema = z.object({
  material_id: z.number().int().positive(),
  warehouse_id: z.number().int().optional().nullable(),
  min_qty: z.number().finite().optional().default(0),
  max_qty: z.number().finite().optional().nullable(),
  reorder_qty: z.number().finite().optional().default(0),
  lead_time_days: z.number().int().optional().default(7),
  preferred_supplier_id: z.number().int().optional().nullable(),
  status: ReorderRuleStatusSchema.optional().default("active"),
  notes: z.string().optional().nullable(),
  record_code: z.string().max(64).optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateReorderRuleInput = z.infer<typeof CreateReorderRuleSchema>;

export const UpdateReorderRuleSchema = CreateReorderRuleSchema.partial();
export type UpdateReorderRuleInput = z.infer<typeof UpdateReorderRuleSchema>;

export const ListReorderRulesQuerySchema = ListQueryBaseSchema.extend({
  status: ReorderRuleStatusSchema.optional(),
  material_id: z.coerce.number().int().optional(),
  warehouse_id: z.coerce.number().int().optional(),
});
export type ListReorderRulesQuery = z.infer<typeof ListReorderRulesQuerySchema>;

export const TriggerReorderRulesSchema = z.object({
  warehouse_id: z.number().int().optional().nullable(),
  material_ids: z.array(z.number().int().positive()).optional(),
  dry_run: z.boolean().optional().default(true),
});
export type TriggerReorderRulesInput = z.infer<typeof TriggerReorderRulesSchema>;
