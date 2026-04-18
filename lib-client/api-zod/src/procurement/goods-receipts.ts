// Zod schemas for procurement.goods_receipts + goods_receipt_lines
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const GR_STATES = [
  "draft",
  "received",
  "partial",
  "inspected",
  "accepted",
  "rejected",
  "closed",
] as const;
export const GrStateSchema = z.enum(GR_STATES);

export const INSPECTION_STATUSES = ["pending", "passed", "failed", "partial"] as const;
export const InspectionStatusSchema = z.enum(INSPECTION_STATUSES);

export const CreateGoodsReceiptLineSchema = z.object({
  po_line_id: z.number().int().optional().nullable(),
  line_number: z.number().int().min(1),
  material_id: z.number().int().optional().nullable(),
  description: z.string().min(1).max(2000),
  quantity_expected: z.number().min(0).optional().default(0),
  quantity_received: z.number().min(0),
  quantity_accepted: z.number().min(0).optional().default(0),
  quantity_rejected: z.number().min(0).optional().default(0),
  unit_of_measure: z.string().max(20).optional().nullable(),
  unit_cost: z.number().min(0).optional().nullable(),
  line_total: z.number().min(0).optional().default(0),
  reject_reason: z.string().max(500).optional().nullable(),
  lot_number: z.string().max(100).optional().nullable(),
  expiry_date: z.string().optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateGoodsReceiptLineInput = z.infer<typeof CreateGoodsReceiptLineSchema>;

export const CreateGoodsReceiptSchema = z.object({
  gr_number: z.string().min(1).max(64),
  po_id: z.number().int().positive(),
  supplier_id: z.number().int().positive(),
  project_id: z.number().int().optional().nullable(),
  warehouse_id: z.number().int().optional().nullable(),
  receipt_date: z.string().optional(),
  delivery_note_ref: z.string().max(100).optional().nullable(),
  carrier: z.string().max(100).optional().nullable(),
  state: GrStateSchema.optional().default("draft"),
  inspection_status: InspectionStatusSchema.optional().default("pending"),
  inspection_notes: z.string().optional().nullable(),
  internal_notes: z.string().optional().nullable(),
  metadata: MetadataSchema,
  lines: z.array(CreateGoodsReceiptLineSchema).min(1, "At least one line is required"),
  trigger_three_way_match: z.boolean().optional().default(true),
});
export type CreateGoodsReceiptInput = z.infer<typeof CreateGoodsReceiptSchema>;

export const UpdateGoodsReceiptSchema = CreateGoodsReceiptSchema.partial().omit({ lines: true });
export type UpdateGoodsReceiptInput = z.infer<typeof UpdateGoodsReceiptSchema>;

export const ReadGoodsReceiptSchema = z.object({
  id: z.number().int(),
  public_id: z.string().uuid(),
  gr_number: z.string(),
  po_id: z.number().int(),
  supplier_id: z.number().int(),
  project_id: z.number().int().nullable(),
  warehouse_id: z.number().int().nullable(),
  receipt_date: z.string(),
  received_by_user_id: z.number().int().nullable(),
  delivery_note_ref: z.string().nullable(),
  carrier: z.string().nullable(),
  state: GrStateSchema,
  inspection_status: InspectionStatusSchema,
  inspection_notes: z.string().nullable(),
  internal_notes: z.string().nullable(),
  is_active: z.boolean(),
  is_deleted: z.boolean(),
  metadata: z.record(z.unknown()).optional(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ReadGoodsReceipt = z.infer<typeof ReadGoodsReceiptSchema>;

export const ListGoodsReceiptsQuerySchema = ListQueryBaseSchema.extend({
  state: GrStateSchema.optional(),
  po_id: z.coerce.number().int().optional(),
  supplier_id: z.coerce.number().int().optional(),
  warehouse_id: z.coerce.number().int().optional(),
  receipt_date_from: z.string().optional(),
  receipt_date_to: z.string().optional(),
});
export type ListGoodsReceiptsQuery = z.infer<typeof ListGoodsReceiptsQuerySchema>;
