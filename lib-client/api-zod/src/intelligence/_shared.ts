// ============================================================
// Shared primitives for intelligence zod schemas
// ============================================================
import { z } from "zod";

export const IdSchema = z.union([z.number().int().positive(), z.string()]);
export const UuidSchema = z.string().uuid();
export const NullableString = z.string().optional().nullable();
export const NullableNumber = z.number().optional().nullable();
export const NullableDate = z.string().optional().nullable();
export const MetadataSchema = z.record(z.unknown()).optional().default({});
export const JsonPayloadSchema = z.record(z.unknown()).optional();

export const ListQueryBaseSchema = z.object({
  q: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
  order_by: z.string().max(64).optional().default("created_at"),
  order_dir: z.enum(["asc", "desc"]).optional().default("desc"),
});
export type ListQueryBase = z.infer<typeof ListQueryBaseSchema>;

export const AuditFieldsSchema = z.object({
  created_at: z.string(),
  updated_at: z.string().optional(),
  created_by: z.number().int().nullable().optional(),
  updated_by: z.number().int().nullable().optional(),
});

export const SeveritySchema = z.enum(["low", "medium", "high", "critical"]).optional().nullable();
export const PrioritySchema = z.enum(["low", "medium", "high", "urgent"]).optional().nullable();
