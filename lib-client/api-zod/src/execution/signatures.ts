// Zod schemas for execution.signatures
import { z } from "zod";
import { AuditColumns, IdSchema, PaginationQuery } from "./_shared";

export const CreateSignatureSchema = z.object({
  entity_type: z.string().min(1).max(64),
  entity_id: z.coerce.number().int().positive(),
  signer_name: z.string().min(1).max(300),
  signer_role: z.string().max(100).optional().nullable(),
  signed_at: z.string(),
  signature_payload: z.record(z.unknown()).optional().nullable(),
  document_id: z.coerce.number().int().positive().optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
  ...AuditColumns,
});
export type CreateSignatureInput = z.infer<typeof CreateSignatureSchema>;

export const ReadSignatureSchema = z.object({
  id: IdSchema,
  entity_type: z.string(),
  entity_id: z.number().int(),
  signer_name: z.string(),
  signed_at: z.string(),
});

export const ListSignaturesQuerySchema = z.object({
  entity_type: z.string().optional(),
  entity_id: z.coerce.number().int().optional(),
  ...PaginationQuery,
});
