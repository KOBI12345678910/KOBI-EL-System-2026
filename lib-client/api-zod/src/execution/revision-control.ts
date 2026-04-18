// Zod schemas for execution.revision_control
import { z } from "zod";
import { AuditColumns, IdSchema, PaginationQuery } from "./_shared";

export const REVISION_ENTITY_TYPES = ["drawing", "bom_header", "specification", "work_order", "project"] as const;
export const REVISION_STATES = ["draft", "in_review", "approved", "rejected", "superseded"] as const;

export const CreateRevisionSchema = z.object({
  entity_type: z.enum(REVISION_ENTITY_TYPES),
  entity_id: z.coerce.number().int().positive(),
  revision_code: z.string().min(1).max(32),
  revision_number: z.coerce.number().int().min(1),
  revision_reason: z.string().max(2000).optional().nullable(),
  change_summary: z.string().max(8000).optional().nullable(),
  changed_fields: z.array(z.string()).optional().default([]),
  previous_snapshot: z.record(z.unknown()).optional().nullable(),
  new_snapshot: z.record(z.unknown()).optional().nullable(),
  state: z.enum(REVISION_STATES).optional().default("draft"),
  revised_by_user_id: z.coerce.number().int().positive().optional().nullable(),
  reviewed_by_user_id: z.coerce.number().int().positive().optional().nullable(),
  approved_by_user_id: z.coerce.number().int().positive().optional().nullable(),
  approved_at: z.string().optional().nullable(),
  effective_at: z.string().optional().nullable(),
  supersedes_revision_id: z.coerce.number().int().positive().optional().nullable(),
  ...AuditColumns,
});
export type CreateRevisionInput = z.infer<typeof CreateRevisionSchema>;

export const UpdateRevisionSchema = CreateRevisionSchema.partial();

export const ReadRevisionSchema = z.object({
  id: IdSchema,
  entity_type: z.string(),
  entity_id: z.number().int(),
  revision_code: z.string(),
  revision_number: z.number().int(),
  state: z.string(),
});
export type ReadRevision = z.infer<typeof ReadRevisionSchema>;

export const ListRevisionsQuerySchema = z.object({
  entity_type: z.enum(REVISION_ENTITY_TYPES).optional(),
  entity_id: z.coerce.number().int().optional(),
  state: z.enum(REVISION_STATES).optional(),
  ...PaginationQuery,
});
