// Zod schemas for docs.print_jobs
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const CreatePrintJobSchema = z.object({
  document_id: z.number().int().optional().nullable(),
  entity_type: z.string().max(64).optional().nullable(),
  entity_id: z.number().int().optional().nullable(),
  printer_name: z.string().max(200).optional().nullable(),
  status: z.string().max(32).optional().default("queued"),
  requested_by_user_id: z.number().int().optional().nullable(),
  record_code: z.string().max(64).optional().nullable(),
  notes: z.string().optional().nullable(),
  metadata: MetadataSchema,
});
export type CreatePrintJobInput = z.infer<typeof CreatePrintJobSchema>;

export const UpdatePrintJobSchema = CreatePrintJobSchema.partial();
export type UpdatePrintJobInput = z.infer<typeof UpdatePrintJobSchema>;

export const ReadPrintJobSchema = CreatePrintJobSchema.extend({
  id: z.number().int(),
  public_id: z.string().uuid(),
  requested_at: z.string(),
  completed_at: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string().optional(),
});
export type ReadPrintJob = z.infer<typeof ReadPrintJobSchema>;

export const ListPrintJobsQuerySchema = ListQueryBaseSchema.extend({
  document_id: z.coerce.number().int().optional(),
  status: z.string().optional(),
});
export type ListPrintJobsQuery = z.infer<typeof ListPrintJobsQuerySchema>;
