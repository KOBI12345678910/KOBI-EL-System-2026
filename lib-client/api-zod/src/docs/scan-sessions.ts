// Zod schemas for docs.scan_sessions
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const CreateScanSessionSchema = z.object({
  session_number: z.string().min(1).max(128),
  scanner_name: z.string().max(200).optional().nullable(),
  initiated_by_user_id: z.number().int().optional().nullable(),
  state: z.string().max(32).optional().default("Open"),
  record_code: z.string().max(64).optional().nullable(),
  notes: z.string().optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateScanSessionInput = z.infer<typeof CreateScanSessionSchema>;

export const UpdateScanSessionSchema = CreateScanSessionSchema.partial();
export type UpdateScanSessionInput = z.infer<typeof UpdateScanSessionSchema>;

export const ReadScanSessionSchema = CreateScanSessionSchema.extend({
  id: z.number().int(),
  public_id: z.string().uuid(),
  started_at: z.string(),
  ended_at: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string().optional(),
});
export type ReadScanSession = z.infer<typeof ReadScanSessionSchema>;

export const ListScanSessionsQuerySchema = ListQueryBaseSchema.extend({
  state: z.string().optional(),
});
export type ListScanSessionsQuery = z.infer<typeof ListScanSessionsQuerySchema>;
