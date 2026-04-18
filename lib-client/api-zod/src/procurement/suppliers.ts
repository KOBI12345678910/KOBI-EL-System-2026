// Zod schemas for procurement.suppliers
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const SUPPLIER_STATUSES = ["Active", "Inactive", "Blacklisted", "Pending"] as const;
export const SupplierStatusSchema = z.enum(SUPPLIER_STATUSES);

export const CreateSupplierSchema = z.object({
  supplier_number: z.string().min(1).max(64),
  legal_name: z.string().min(1).max(300),
  display_name: z.string().max(300).optional().nullable(),
  supplier_category: z.string().max(100).optional().nullable(),
  tax_id: z.string().max(50).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  email: z.string().email().max(200).optional().nullable(),
  website: z.string().max(300).optional().nullable(),
  address_line_1: z.string().max(300).optional().nullable(),
  address_line_2: z.string().max(300).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  region: z.string().max(100).optional().nullable(),
  postal_code: z.string().max(20).optional().nullable(),
  country: z.string().max(100).optional().nullable(),
  primary_contact_name: z.string().max(200).optional().nullable(),
  primary_contact_phone: z.string().max(50).optional().nullable(),
  primary_contact_email: z.string().email().max(200).optional().nullable(),
  payment_terms: z.string().max(100).optional().nullable(),
  delivery_terms: z.string().max(100).optional().nullable(),
  preferred_currency: z.string().max(10).optional().default("ILS"),
  status: SupplierStatusSchema.optional().default("Active"),
  risk_level: z.enum(["low", "medium", "high", "critical"]).optional().nullable(),
  preferred_supplier: z.boolean().optional().default(false),
  internal_notes: z.string().optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateSupplierInput = z.infer<typeof CreateSupplierSchema>;

export const UpdateSupplierSchema = CreateSupplierSchema.partial();
export type UpdateSupplierInput = z.infer<typeof UpdateSupplierSchema>;

export const ReadSupplierSchema = CreateSupplierSchema.extend({
  id: z.number().int(),
  public_id: z.string().uuid(),
  performance_score: z.number().nullable().optional(),
  is_active: z.boolean().optional(),
  is_deleted: z.boolean().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ReadSupplier = z.infer<typeof ReadSupplierSchema>;

export const ListSuppliersQuerySchema = ListQueryBaseSchema.extend({
  status: SupplierStatusSchema.optional(),
  supplier_category: z.string().optional(),
  risk_level: z.string().optional(),
  preferred_supplier: z.coerce.boolean().optional(),
});
export type ListSuppliersQuery = z.infer<typeof ListSuppliersQuerySchema>;
