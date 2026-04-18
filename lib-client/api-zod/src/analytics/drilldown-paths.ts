// Zod schemas for analytics.drilldown_paths
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const CreateDrilldownPathSchema = z.object({
  path_code: z.string().min(1).max(100),
  path_label_he: z.string().max(200).optional().nullable(),
  from_entity: z.string().min(1).max(100),
  to_entity: z.string().min(1).max(100),
  link_field: z.string().max(100).optional().nullable(),
  filter_template: z.record(z.unknown()).optional().default({}),
  is_active: z.boolean().optional().default(true),
  notes: z.string().optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateDrilldownPathInput = z.infer<typeof CreateDrilldownPathSchema>;

export const UpdateDrilldownPathSchema = CreateDrilldownPathSchema.partial();
export type UpdateDrilldownPathInput = z.infer<typeof UpdateDrilldownPathSchema>;

export const ListDrilldownPathsQuerySchema = ListQueryBaseSchema.extend({
  from_entity: z.string().optional(),
  to_entity: z.string().optional(),
  is_active: z.coerce.boolean().optional(),
});
export type ListDrilldownPathsQuery = z.infer<typeof ListDrilldownPathsQuerySchema>;
