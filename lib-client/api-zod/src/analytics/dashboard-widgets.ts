// Zod schemas for analytics.dashboard_widgets
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const CreateDashboardWidgetSchema = z.object({
  widget_code: z.string().min(1).max(100),
  widget_name: z.string().min(1).max(200),
  data_source_type: z.string().min(1).max(50),
  data_source_ref: z.string().max(200).optional().nullable(),
  default_config: z.record(z.unknown()).optional().default({}),
  is_active: z.boolean().optional().default(true),
  metadata: MetadataSchema,
});
export type CreateDashboardWidgetInput = z.infer<typeof CreateDashboardWidgetSchema>;

export const UpdateDashboardWidgetSchema = CreateDashboardWidgetSchema.partial();
export type UpdateDashboardWidgetInput = z.infer<typeof UpdateDashboardWidgetSchema>;

export const ListDashboardWidgetsQuerySchema = ListQueryBaseSchema.extend({
  is_active: z.coerce.boolean().optional(),
  data_source_type: z.string().optional(),
});
export type ListDashboardWidgetsQuery = z.infer<typeof ListDashboardWidgetsQuerySchema>;
