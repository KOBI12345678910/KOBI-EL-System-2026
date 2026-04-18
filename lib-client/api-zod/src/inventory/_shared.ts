// ============================================================
// Shared primitives for inventory zod schemas
// ============================================================
import { z } from "zod";

export const IdSchema = z.union([z.number().int().positive(), z.string()]);
export const NullableString = z.string().optional().nullable();
export const NullableNumber = z.number().optional().nullable();
export const NullableDate = z.string().optional().nullable();
export const MetadataSchema = z.record(z.unknown()).optional().default({});
export const MoneySchema = z.number().finite();
export const QuantitySchema = z.number().finite();

export const ListQueryBaseSchema = z.object({
  q: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
  order_by: z.string().max(64).optional().default("id"),
  order_dir: z.enum(["asc", "desc"]).optional().default("desc"),
});
export type ListQueryBase = z.infer<typeof ListQueryBaseSchema>;

export const AuditFieldsSchema = z.object({
  created_at: z.string(),
  updated_at: z.string(),
  created_by: z.number().int().nullable().optional(),
  updated_by: z.number().int().nullable().optional(),
});

// Status lifecycles (mirrored from migration 00049 CHECK constraints)
export const MATERIAL_REQUEST_STATUSES = [
  "draft", "submitted", "approved", "fulfilled", "rejected", "cancelled",
] as const;
export const MaterialRequestStatusSchema = z.enum(MATERIAL_REQUEST_STATUSES);

export const INVENTORY_MOVEMENT_STATUSES = ["pending", "posted", "reversed"] as const;
export const InventoryMovementStatusSchema = z.enum(INVENTORY_MOVEMENT_STATUSES);

export const STOCK_COUNT_STATUSES = [
  "planned", "in_progress", "counted", "reconciled", "closed",
] as const;
export const StockCountStatusSchema = z.enum(STOCK_COUNT_STATUSES);

export const REORDER_RULE_STATUSES = ["active", "paused", "disabled"] as const;
export const ReorderRuleStatusSchema = z.enum(REORDER_RULE_STATUSES);
