// ============================================================
// Zod schemas for commercial.customer_segments
// Generated: 2026-04-18
// ============================================================
import { z } from "zod";

export const SEGMENT_TYPES = [
  "enterprise",
  "smb",
  "government",
  "retail",
  "wholesale",
  "strategic",
  "custom",
] as const;

export const SegmentTypeSchema = z.enum(SEGMENT_TYPES);
export type SegmentType = z.infer<typeof SegmentTypeSchema>;

/** Criteria JSONB structure — free-form but constrained at the top level. */
export const SegmentCriteriaSchema = z.object({
  rules: z
    .array(
      z.object({
        field: z.string().min(1),
        op: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains", "between"]),
        value: z.unknown(),
      }),
    )
    .optional()
    .default([]),
  logic: z.enum(["all", "any"]).optional().default("all"),
  extra: z.record(z.unknown()).optional(),
}).passthrough();
export type SegmentCriteria = z.infer<typeof SegmentCriteriaSchema>;

/** Payload for CREATING a customer segment. */
export const CreateCustomerSegmentSchema = z.object({
  code: z.string().min(2).max(64).regex(/^[a-z0-9_]+$/),
  name_he: z.string().min(1).max(200),
  name_en: z.string().max(200).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  segment_type: SegmentTypeSchema,
  criteria: SegmentCriteriaSchema.optional().default({ rules: [], logic: "all" }),
  is_active: z.boolean().optional().default(true),
  metadata: z.record(z.unknown()).optional().default({}),
});
export type CreateCustomerSegmentInput = z.infer<typeof CreateCustomerSegmentSchema>;

/** Payload for UPDATING — all fields optional. */
export const UpdateCustomerSegmentSchema = CreateCustomerSegmentSchema.partial();
export type UpdateCustomerSegmentInput = z.infer<typeof UpdateCustomerSegmentSchema>;

/** Full read model. */
export const ReadCustomerSegmentSchema = z.object({
  id: z.union([z.number().int(), z.string()]),
  public_id: z.string().uuid(),
  code: z.string(),
  name_he: z.string(),
  name_en: z.string().nullable(),
  description: z.string().nullable(),
  segment_type: SegmentTypeSchema,
  criteria: z.record(z.unknown()),
  member_count: z.number().int(),
  is_active: z.boolean(),
  metadata: z.record(z.unknown()),
  created_at: z.string(),
  updated_at: z.string(),
  created_by: z.number().int().nullable(),
  updated_by: z.number().int().nullable(),
});
export type ReadCustomerSegment = z.infer<typeof ReadCustomerSegmentSchema>;

/** List endpoint query. */
export const ListCustomerSegmentsQuerySchema = z.object({
  q: z.string().max(200).optional(),
  segment_type: SegmentTypeSchema.optional(),
  is_active: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
  order_by: z.enum(["name_he", "member_count", "created_at", "updated_at"]).optional().default("name_he"),
  order_dir: z.enum(["asc", "desc"]).optional().default("asc"),
});
export type ListCustomerSegmentsQuery = z.infer<typeof ListCustomerSegmentsQuerySchema>;
