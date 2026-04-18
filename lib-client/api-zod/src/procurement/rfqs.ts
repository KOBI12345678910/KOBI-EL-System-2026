// Zod schemas for procurement.rfqs
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const RFQ_STATES = ["draft", "sent", "responded", "awarded", "cancelled"] as const;
export const RfqStateSchema = z.enum(RFQ_STATES);

export const CreateRfqSchema = z.object({
  rfq_number: z.string().min(1).max(64),
  project_id: z.number().int().optional().nullable(),
  material_request_id: z.number().int().optional().nullable(),
  requested_date: z.string(),
  response_deadline: z.string().optional().nullable(),
  comparison_status: z.string().max(50).optional().nullable(),
  approval_status: z.string().max(50).optional().default("draft"),
  state: RfqStateSchema.optional().default("draft"),
  winning_supplier_id: z.number().int().optional().nullable(),
  internal_notes: z.string().optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateRfqInput = z.infer<typeof CreateRfqSchema>;

export const UpdateRfqSchema = CreateRfqSchema.partial();
export type UpdateRfqInput = z.infer<typeof UpdateRfqSchema>;

export const ReadRfqSchema = CreateRfqSchema.extend({
  id: z.number().int(),
  public_id: z.string().uuid(),
  is_active: z.boolean().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ReadRfq = z.infer<typeof ReadRfqSchema>;

export const ListRfqsQuerySchema = ListQueryBaseSchema.extend({
  state: RfqStateSchema.optional(),
  project_id: z.coerce.number().int().optional(),
  winning_supplier_id: z.coerce.number().int().optional(),
  requested_date_from: z.string().optional(),
  requested_date_to: z.string().optional(),
});
export type ListRfqsQuery = z.infer<typeof ListRfqsQuerySchema>;

export const SendRfqSchema = z.object({
  invited_supplier_ids: z.array(z.number().int().positive()).min(1),
  message: z.string().max(2000).optional().nullable(),
});
export type SendRfqInput = z.infer<typeof SendRfqSchema>;

export const AwardRfqSchema = z.object({
  bid_id: z.number().int().positive(),
  justification: z.string().max(2000).optional().nullable(),
});
export type AwardRfqInput = z.infer<typeof AwardRfqSchema>;
