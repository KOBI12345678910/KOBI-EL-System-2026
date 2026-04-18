// Zod schemas for execution.drawings
import { z } from "zod";
import { AuditColumns, IdSchema, PaginationQuery } from "./_shared";

export const DRAWING_TYPES = ["mechanical", "electrical", "structural", "assembly", "detail", "isometric", "schematic", "piping", "layout", "other"] as const;
export const APPROVAL_STATES = ["draft", "in_review", "approved", "rejected", "superseded", "archived"] as const;
export const FILE_FORMATS = ["dwg", "dxf", "pdf", "step", "iges", "ifc", "png", "jpg", "svg", "other"] as const;

export const CreateDrawingSchema = z.object({
  drawing_number: z.string().min(1).max(64),
  title: z.string().min(1).max(300),
  description: z.string().max(8000).optional().nullable(),
  project_id: z.coerce.number().int().positive().optional().nullable(),
  work_order_id: z.coerce.number().int().positive().optional().nullable(),
  drawing_type: z.enum(DRAWING_TYPES),
  discipline: z.string().max(100).optional().nullable(),
  current_revision: z.string().max(32).optional().default("A"),
  file_url: z.string().max(2000).optional().nullable(),
  file_format: z.enum(FILE_FORMATS).optional().nullable(),
  file_size_bytes: z.coerce.number().int().nonnegative().optional().nullable(),
  scale: z.string().max(50).optional().nullable(),
  drawn_by_user_id: z.coerce.number().int().positive().optional().nullable(),
  checked_by_user_id: z.coerce.number().int().positive().optional().nullable(),
  approved_by_user_id: z.coerce.number().int().positive().optional().nullable(),
  approval_state: z.enum(APPROVAL_STATES).optional().default("draft"),
  ...AuditColumns,
});
export type CreateDrawingInput = z.infer<typeof CreateDrawingSchema>;

export const UpdateDrawingSchema = CreateDrawingSchema.partial();

export const ReadDrawingSchema = z.object({
  id: IdSchema,
  drawing_number: z.string(),
  title: z.string(),
  drawing_type: z.string(),
  current_revision: z.string(),
  approval_state: z.string(),
});
export type ReadDrawing = z.infer<typeof ReadDrawingSchema>;

export const ListDrawingsQuerySchema = z.object({
  project_id: z.coerce.number().int().optional(),
  drawing_type: z.enum(DRAWING_TYPES).optional(),
  approval_state: z.enum(APPROVAL_STATES).optional(),
  ...PaginationQuery,
});
