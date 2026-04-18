// Zod schemas for inventory.shortage_snapshots
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const SHORTAGE_SEVERITIES = ["info", "warn", "critical"] as const;
export const ShortageSeveritySchema = z.enum(SHORTAGE_SEVERITIES);

export const CreateShortageSnapshotSchema = z.object({
  material_id: z.number().int().positive(),
  warehouse_id: z.number().int().optional().nullable(),
  on_hand_qty: z.number().finite().optional().default(0),
  reserved_qty: z.number().finite().optional().default(0),
  available_qty: z.number().finite().optional().default(0),
  required_qty: z.number().finite().optional().default(0),
  shortage_qty: z.number().finite().optional().default(0),
  severity: ShortageSeveritySchema.optional().default("info"),
  notes: z.string().optional().nullable(),
  record_code: z.string().max(64).optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateShortageSnapshotInput = z.infer<typeof CreateShortageSnapshotSchema>;

export const UpdateShortageSnapshotSchema = CreateShortageSnapshotSchema.partial();
export type UpdateShortageSnapshotInput = z.infer<typeof UpdateShortageSnapshotSchema>;

export const ListShortageSnapshotsQuerySchema = ListQueryBaseSchema.extend({
  material_id: z.coerce.number().int().optional(),
  warehouse_id: z.coerce.number().int().optional(),
  severity: ShortageSeveritySchema.optional(),
});
export type ListShortageSnapshotsQuery = z.infer<typeof ListShortageSnapshotsQuerySchema>;
