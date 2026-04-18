// Zod schemas for procurement.subcontractors
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const SUB_STATUSES = ["active", "inactive", "on_hold", "blacklisted", "pending_review"] as const;
export const SubStatusSchema = z.enum(SUB_STATUSES);

export const RISK_LEVELS = ["low", "medium", "high", "critical"] as const;
export const RiskLevelSchema = z.enum(RISK_LEVELS);

export const CreateSubcontractorSchema = z.object({
  subcontractor_number: z.string().min(1).max(64),
  legal_name: z.string().min(1).max(300),
  display_name: z.string().max(300).optional().nullable(),
  specialty: z.string().max(100).optional().nullable(),
  trade: z.string().max(100).optional().nullable(),
  tax_id: z.string().max(50).optional().nullable(),
  license_number: z.string().max(100).optional().nullable(),
  license_expiry: z.string().optional().nullable(),
  insurance_ref: z.string().max(100).optional().nullable(),
  insurance_expiry: z.string().optional().nullable(),
  certification_level: z.string().max(100).optional().nullable(),
  primary_contact_name: z.string().max(200).optional().nullable(),
  primary_contact_phone: z.string().max(50).optional().nullable(),
  primary_contact_email: z.string().email().max(200).optional().nullable(),
  address_line_1: z.string().max(300).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  region: z.string().max(100).optional().nullable(),
  country: z.string().max(100).optional().default("IL"),
  currency: z.string().max(10).optional().default("ILS"),
  day_rate: z.number().min(0).optional().nullable(),
  hourly_rate: z.number().min(0).optional().nullable(),
  preferred_payment_terms: z.string().max(100).optional().nullable(),
  status: SubStatusSchema.optional().default("active"),
  state: z.string().max(50).optional().default("active"),
  risk_level: RiskLevelSchema.optional().nullable(),
  blacklist_reason: z.string().optional().nullable(),
  linked_supplier_id: z.number().int().optional().nullable(),
  internal_notes: z.string().optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateSubcontractorInput = z.infer<typeof CreateSubcontractorSchema>;

export const UpdateSubcontractorSchema = CreateSubcontractorSchema.partial();
export type UpdateSubcontractorInput = z.infer<typeof UpdateSubcontractorSchema>;

export const ReadSubcontractorSchema = CreateSubcontractorSchema.extend({
  id: z.number().int(),
  public_id: z.string().uuid(),
  performance_score: z.number().nullable().optional(),
  active_projects_count: z.number().int().optional(),
  total_contracts: z.number().int().optional(),
  total_spend: z.number().optional(),
  is_active: z.boolean().optional(),
  is_deleted: z.boolean().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ReadSubcontractor = z.infer<typeof ReadSubcontractorSchema>;

export const ListSubcontractorsQuerySchema = ListQueryBaseSchema.extend({
  status: SubStatusSchema.optional(),
  specialty: z.string().optional(),
  risk_level: RiskLevelSchema.optional(),
  license_expiring_within_days: z.coerce.number().int().optional(),
});
export type ListSubcontractorsQuery = z.infer<typeof ListSubcontractorsQuerySchema>;
