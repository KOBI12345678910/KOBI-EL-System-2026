import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema, TICKET_STATUSES } from "./_shared";

export const CreateTicketSchema = z.object({
  ticket_number: z.string().max(100).optional(),
  customer_id: z.number().int().positive().optional().nullable(),
  supplier_id: z.number().int().positive().optional().nullable(),
  portal_user_id: z.number().int().positive().optional().nullable(),
  title: z.string().min(1).max(500),
  description: z.string().max(10000).optional().nullable(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional().default("medium"),
  category: z.string().max(100).optional().nullable(),
  channel: z.string().max(100).optional().nullable(),
  sla_due_at: z.string().datetime().optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateTicketInput = z.infer<typeof CreateTicketSchema>;

export const UpdateTicketSchema = CreateTicketSchema.partial().extend({
  status: z.enum(TICKET_STATUSES).optional(),
  assigned_to_user_id: z.number().int().positive().optional().nullable(),
});
export type UpdateTicketInput = z.infer<typeof UpdateTicketSchema>;

export const ListTicketsQuerySchema = ListQueryBaseSchema.extend({
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.string().optional(),
  assigned_to_user_id: z.coerce.number().int().positive().optional(),
  customer_id: z.coerce.number().int().positive().optional(),
  category: z.string().optional(),
});
export type ListTicketsQuery = z.infer<typeof ListTicketsQuerySchema>;

export const AssignTicketSchema = z.object({
  assigned_to_user_id: z.number().int().positive(),
  notes: z.string().max(1000).optional().nullable(),
});
export type AssignTicketInput = z.infer<typeof AssignTicketSchema>;

export const ResolveTicketSchema = z.object({
  resolution: z.string().min(1).max(4000),
  notes: z.string().max(2000).optional().nullable(),
});
export type ResolveTicketInput = z.infer<typeof ResolveTicketSchema>;
