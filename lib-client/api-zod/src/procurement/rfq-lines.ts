// Zod schemas for procurement.rfq_items (alias: rfq_lines)
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const CreateRfqLineSchema = z.object({
  rfq_id: z.number().int().positive(),
  line_number: z.number().int().min(1),
  material_id: z.number().int().optional().nullable(),
  requested_code: z.string().max(100).optional().nullable(),
  description: z.string().min(1).max(2000),
  quantity: z.number().positive(),
  unit_of_measure: z.string().max(20).optional().nullable(),
  target_delivery_date: z.string().optional().nullable(),
  technical_spec: z.string().optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateRfqLineInput = z.infer<typeof CreateRfqLineSchema>;

export const UpdateRfqLineSchema = CreateRfqLineSchema.partial();
export type UpdateRfqLineInput = z.infer<typeof UpdateRfqLineSchema>;

export const ReadRfqLineSchema = CreateRfqLineSchema.extend({
  id: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ReadRfqLine = z.infer<typeof ReadRfqLineSchema>;

export const ListRfqLinesQuerySchema = ListQueryBaseSchema.extend({
  rfq_id: z.coerce.number().int().positive().optional(),
});
export type ListRfqLinesQuery = z.infer<typeof ListRfqLinesQuerySchema>;
