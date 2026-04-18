// ============================================================
// Zod schemas for commercial.pricing_rules
// Generated: 2026-04-18
// ============================================================
import { z } from "zod";

export const PRICING_SCOPES = ["customer", "segment", "product", "category", "all"] as const;
export const PRICING_RULE_TYPES = [
  "percent_discount",
  "fixed_discount",
  "special_price",
  "tiered",
  "markup_over_cost",
] as const;

export const PricingScopeSchema = z.enum(PRICING_SCOPES);
export const PricingRuleTypeSchema = z.enum(PRICING_RULE_TYPES);
export type PricingScope = z.infer<typeof PricingScopeSchema>;
export type PricingRuleType = z.infer<typeof PricingRuleTypeSchema>;

/** Rule value shape — discriminated structure by rule_type, but stored as free JSONB. */
export const PricingRuleValueSchema = z.object({
  percent: z.number().min(-100).max(100).optional(), // for percent_discount
  amount: z.number().optional(),                      // for fixed_discount
  currency: z.string().length(3).optional(),
  price: z.number().min(0).optional(),                // for special_price
  markup: z.number().optional(),                      // for markup_over_cost
  vat_rate: z.number().min(0).max(1).optional(),
  tiers: z
    .array(
      z.object({
        min_qty: z.number().min(0),
        max_qty: z.number().min(0).optional(),
        percent: z.number().optional(),
        price: z.number().optional(),
      }),
    )
    .optional(),
  note: z.string().max(500).optional(),
}).passthrough();
export type PricingRuleValue = z.infer<typeof PricingRuleValueSchema>;

/** Create payload. */
export const CreatePricingRuleSchema = z.object({
  code: z.string().min(2).max(64).regex(/^[a-z0-9_]+$/),
  name_he: z.string().min(1).max(200),
  name_en: z.string().max(200).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  scope: PricingScopeSchema,
  scope_ref_id: z.number().int().positive().optional().nullable(),
  rule_type: PricingRuleTypeSchema,
  rule_value: PricingRuleValueSchema,
  valid_from: z.string().optional().nullable(),
  valid_to: z.string().optional().nullable(),
  priority: z.number().int().min(1).max(10_000).optional().default(100),
  is_active: z.boolean().optional().default(true),
  metadata: z.record(z.unknown()).optional().default({}),
})
  .superRefine((val, ctx) => {
    // scope != 'all' requires scope_ref_id
    if (val.scope !== "all" && (val.scope_ref_id === null || val.scope_ref_id === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scope_ref_id"],
        message: `scope_ref_id is required when scope is '${val.scope}'`,
      });
    }
    // valid_from ≤ valid_to if both provided
    if (val.valid_from && val.valid_to && val.valid_from > val.valid_to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["valid_to"],
        message: "valid_to must be on or after valid_from",
      });
    }
  });
export type CreatePricingRuleInput = z.infer<typeof CreatePricingRuleSchema>;

/** Update — all fields optional; no superRefine on partial (allow partial fixes). */
export const UpdatePricingRuleSchema = z.object({
  code: z.string().min(2).max(64).regex(/^[a-z0-9_]+$/).optional(),
  name_he: z.string().min(1).max(200).optional(),
  name_en: z.string().max(200).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  scope: PricingScopeSchema.optional(),
  scope_ref_id: z.number().int().positive().optional().nullable(),
  rule_type: PricingRuleTypeSchema.optional(),
  rule_value: PricingRuleValueSchema.optional(),
  valid_from: z.string().optional().nullable(),
  valid_to: z.string().optional().nullable(),
  priority: z.number().int().min(1).max(10_000).optional(),
  is_active: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type UpdatePricingRuleInput = z.infer<typeof UpdatePricingRuleSchema>;

/** Read model. */
export const ReadPricingRuleSchema = z.object({
  id: z.union([z.number().int(), z.string()]),
  public_id: z.string().uuid(),
  code: z.string(),
  name_he: z.string(),
  name_en: z.string().nullable(),
  description: z.string().nullable(),
  scope: PricingScopeSchema,
  scope_ref_id: z.number().int().nullable(),
  rule_type: PricingRuleTypeSchema,
  rule_value: z.record(z.unknown()),
  valid_from: z.string().nullable(),
  valid_to: z.string().nullable(),
  priority: z.number().int(),
  is_active: z.boolean(),
  metadata: z.record(z.unknown()),
  created_at: z.string(),
  updated_at: z.string(),
  created_by: z.number().int().nullable(),
  updated_by: z.number().int().nullable(),
});
export type ReadPricingRule = z.infer<typeof ReadPricingRuleSchema>;

/** List query. */
export const ListPricingRulesQuerySchema = z.object({
  q: z.string().max(200).optional(),
  scope: PricingScopeSchema.optional(),
  rule_type: PricingRuleTypeSchema.optional(),
  is_active: z.coerce.boolean().optional(),
  only_current: z.coerce.boolean().optional(), // filter to rules currently in validity window
  limit: z.coerce.number().int().min(1).max(500).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
  order_by: z.enum(["priority", "valid_from", "created_at", "updated_at", "name_he"]).optional().default("priority"),
  order_dir: z.enum(["asc", "desc"]).optional().default("asc"),
});
export type ListPricingRulesQuery = z.infer<typeof ListPricingRulesQuerySchema>;
