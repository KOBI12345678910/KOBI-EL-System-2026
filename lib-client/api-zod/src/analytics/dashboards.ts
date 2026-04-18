// Zod schemas for analytics.dashboard_definitions / dashboard_boards
import { z } from "zod";
import {
  ListQueryBaseSchema,
  MetadataSchema,
  DashboardExportFormatSchema,
} from "./_shared";

export const CreateDashboardSchema = z.object({
  board_code: z.string().min(1).max(100),
  board_name: z.string().min(1).max(200),
  description: z.string().optional().nullable(),
  is_active: z.boolean().optional().default(true),
  metadata: MetadataSchema,
});
export type CreateDashboardInput = z.infer<typeof CreateDashboardSchema>;

export const UpdateDashboardSchema = CreateDashboardSchema.partial();
export type UpdateDashboardInput = z.infer<typeof UpdateDashboardSchema>;

export const ListDashboardsQuerySchema = ListQueryBaseSchema.extend({
  is_active: z.coerce.boolean().optional(),
});
export type ListDashboardsQuery = z.infer<typeof ListDashboardsQuerySchema>;

export const ExportDashboardSchema = z.object({
  format: DashboardExportFormatSchema.default("csv"),
  filters: z.record(z.unknown()).optional().default({}),
});
export type ExportDashboardInput = z.infer<typeof ExportDashboardSchema>;

export const AttachWidgetSchema = z.object({
  widget_id: z.number().int().positive(),
  title: z.string().min(1).max(200),
  width_units: z.number().int().min(1).max(12).optional().default(4),
  height_units: z.number().int().min(1).max(12).optional().default(2),
  order_index: z.number().int().min(0).optional().default(0),
  config_payload: z.record(z.unknown()).optional().default({}),
});
export type AttachWidgetInput = z.infer<typeof AttachWidgetSchema>;
