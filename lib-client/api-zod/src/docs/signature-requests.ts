// Zod schemas for docs.document_signature_requests
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema, SignatureRequestStatusSchema } from "./_shared";

export const CreateSignatureRequestSchema = z.object({
  request_number: z.string().min(1).max(128),
  document_id: z.number().int(),
  provider: z.string().max(128).optional().nullable(),
  external_ref: z.string().max(256).optional().nullable(),
  status: SignatureRequestStatusSchema.optional().default("sent"),
  signer_names: z.array(z.string()).optional().nullable(),
  signer_emails: z.array(z.string().email()).optional().nullable(),
  signed_count: z.number().int().nonnegative().optional().default(0),
  total_signers: z.number().int().min(1).optional().default(1),
  expires_at: z.string().optional().nullable(),
  decline_reason: z.string().optional().nullable(),
  record_code: z.string().max(64).optional().nullable(),
  notes: z.string().optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateSignatureRequestInput = z.infer<typeof CreateSignatureRequestSchema>;

export const UpdateSignatureRequestSchema = CreateSignatureRequestSchema.partial();
export type UpdateSignatureRequestInput = z.infer<typeof UpdateSignatureRequestSchema>;

export const ReadSignatureRequestSchema = CreateSignatureRequestSchema.extend({
  id: z.number().int(),
  public_id: z.string().uuid(),
  sent_at: z.string(),
  completed_at: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ReadSignatureRequest = z.infer<typeof ReadSignatureRequestSchema>;

export const ListSignatureRequestsQuerySchema = ListQueryBaseSchema.extend({
  document_id: z.coerce.number().int().optional(),
  status: SignatureRequestStatusSchema.optional(),
});
export type ListSignatureRequestsQuery = z.infer<typeof ListSignatureRequestsQuerySchema>;

export const RecordSignatureSchema = z.object({
  signer_name: z.string().min(1).max(200),
  signer_email: z.string().email().max(200).optional().nullable(),
  signed_at: z.string().optional().nullable(),
});
export type RecordSignatureInput = z.infer<typeof RecordSignatureSchema>;
