// Zod schemas for procurement.supplier_contacts
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const CreateSupplierContactSchema = z.object({
  supplier_id: z.number().int().positive(),
  full_name: z.string().min(1).max(200),
  role_title: z.string().max(200).optional().nullable(),
  department: z.string().max(100).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  mobile: z.string().max(50).optional().nullable(),
  email: z.string().email().max(200).optional().nullable(),
  is_primary: z.boolean().optional().default(false),
  preferred_language: z.enum(["he", "en", "ar", "ru"]).optional().default("he"),
  is_active: z.boolean().optional().default(true),
  notes: z.string().optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateSupplierContactInput = z.infer<typeof CreateSupplierContactSchema>;

export const UpdateSupplierContactSchema = CreateSupplierContactSchema.partial();
export type UpdateSupplierContactInput = z.infer<typeof UpdateSupplierContactSchema>;

export const ReadSupplierContactSchema = CreateSupplierContactSchema.extend({
  id: z.number().int(),
  public_id: z.string().uuid(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ReadSupplierContact = z.infer<typeof ReadSupplierContactSchema>;

export const ListSupplierContactsQuerySchema = ListQueryBaseSchema.extend({
  supplier_id: z.coerce.number().int().positive().optional(),
  is_primary: z.coerce.boolean().optional(),
  is_active: z.coerce.boolean().optional(),
});
export type ListSupplierContactsQuery = z.infer<typeof ListSupplierContactsQuerySchema>;
