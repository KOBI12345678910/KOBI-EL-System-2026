import { z } from "zod";
import { ListQueryBaseSchema } from "./_shared";

export const ListAuditLogsQuerySchema = ListQueryBaseSchema.extend({
  table_name: z.string().optional(),
  user_id: z.coerce.number().int().optional(),
  action: z.enum(["INSERT", "UPDATE", "DELETE"]).optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
  record_id: z.coerce.number().int().optional(),
});
export type ListAuditLogsQuery = z.infer<typeof ListAuditLogsQuerySchema>;

export const ListStateHistoryQuerySchema = ListQueryBaseSchema.extend({
  entity_type: z.string().optional(),
  entity_id: z.coerce.number().int().optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
});
export type ListStateHistoryQuery = z.infer<typeof ListStateHistoryQuerySchema>;

export const ListDomainEventsQuerySchema = ListQueryBaseSchema.extend({
  event_type: z.string().optional(),
  aggregate_type: z.string().optional(),
  aggregate_id: z.coerce.number().int().optional(),
  processing_status: z.enum(["pending", "processing", "processed", "failed", "dead_letter"]).optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
});
export type ListDomainEventsQuery = z.infer<typeof ListDomainEventsQuerySchema>;
