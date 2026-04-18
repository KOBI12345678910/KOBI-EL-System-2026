// ============================================================
// Shared primitives for docs zod schemas
// ============================================================
import { z } from "zod";

export const IdSchema = z.union([z.number().int().positive(), z.string()]);
export const NullableString = z.string().optional().nullable();
export const NullableNumber = z.number().optional().nullable();
export const NullableDate = z.string().optional().nullable();
export const MetadataSchema = z.record(z.unknown()).optional().default({});

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

// Canonical status lifecycles for docs domain (matches 00055 migration)
export const DOCUMENT_STATUSES = [
  "draft",
  "pending_review",
  "approved",
  "archived",
  "deleted",
] as const;
export const DocumentStatusSchema = z.enum(DOCUMENT_STATUSES);

export const SIGNATURE_REQUEST_STATUSES = [
  "sent",
  "partially_signed",
  "signed",
  "declined",
  "expired",
] as const;
export const SignatureRequestStatusSchema = z.enum(SIGNATURE_REQUEST_STATUSES);

export const RUN_STATUSES = ["queued", "running", "complete", "failed"] as const;
export const RunStatusSchema = z.enum(RUN_STATUSES);

export const RELATION_TYPES = [
  "supersedes",
  "amends",
  "references",
  "attaches_to",
] as const;
export const RelationTypeSchema = z.enum(RELATION_TYPES);
