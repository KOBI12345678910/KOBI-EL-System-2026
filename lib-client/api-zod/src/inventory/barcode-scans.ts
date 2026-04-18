// Zod schemas for inventory.barcode_scans
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const CreateBarcodeScanSchema = z.object({
  barcode_value: z.string().min(1).max(256),
  material_id: z.number().int().optional().nullable(),
  warehouse_id: z.number().int().optional().nullable(),
  scan_type: z.string().max(64).optional().nullable(),
  scanned_by_user_id: z.number().int().optional().nullable(),
  payload: z.record(z.unknown()).optional().nullable(),
  notes: z.string().optional().nullable(),
  record_code: z.string().max(64).optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateBarcodeScanInput = z.infer<typeof CreateBarcodeScanSchema>;

export const UpdateBarcodeScanSchema = CreateBarcodeScanSchema.partial();
export type UpdateBarcodeScanInput = z.infer<typeof UpdateBarcodeScanSchema>;

export const ListBarcodeScansQuerySchema = ListQueryBaseSchema.extend({
  material_id: z.coerce.number().int().optional(),
  warehouse_id: z.coerce.number().int().optional(),
  barcode_value: z.string().optional(),
  scan_type: z.string().optional(),
});
export type ListBarcodeScansQuery = z.infer<typeof ListBarcodeScansQuerySchema>;
