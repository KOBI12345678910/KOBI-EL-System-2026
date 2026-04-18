// Zod schemas for procurement.contracts
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const CONTRACT_STATES = [
  "draft",
  "pending_approval",
  "active",
  "expiring",
  "expired",
  "renewed",
  "cancelled",
  "terminated",
] as const;
export const ContractStateSchema = z.enum(CONTRACT_STATES);

export const CONTRACT_TYPES = [
  "supplier_framework",
  "supplier_po",
  "customer_master",
  "customer_project",
  "nda",
  "sow",
  "msa",
  "subcontractor",
  "service_agreement",
  "other",
] as const;
export const ContractTypeSchema = z.enum(CONTRACT_TYPES);

export const CreateContractSchema = z.object({
  contract_number: z.string().min(1).max(64),
  contract_type: ContractTypeSchema,
  customer_id: z.number().int().optional().nullable(),
  supplier_id: z.number().int().optional().nullable(),
  quote_id: z.number().int().optional().nullable(),
  po_id: z.number().int().optional().nullable(),
  project_id: z.number().int().optional().nullable(),
  effective_date: z.string().optional().nullable(),
  expiry_date: z.string().optional().nullable(),
  contract_value: z.number().optional().nullable(),
  currency: z.string().max(10).optional().default("ILS"),
  state: ContractStateSchema.optional().default("draft"),
  renewal_notice_days: z.number().int().min(0).optional().default(30),
  auto_renew: z.boolean().optional().default(false),
  metadata: MetadataSchema,
});
export type CreateContractInput = z.infer<typeof CreateContractSchema>;

export const UpdateContractSchema = CreateContractSchema.partial();
export type UpdateContractInput = z.infer<typeof UpdateContractSchema>;

export const ReadContractSchema = CreateContractSchema.extend({
  id: z.number().int(),
  public_id: z.string().uuid(),
  signed_at: z.string().nullable(),
  is_active: z.boolean().optional(),
  is_deleted: z.boolean().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ReadContract = z.infer<typeof ReadContractSchema>;

export const ListContractsQuerySchema = ListQueryBaseSchema.extend({
  state: ContractStateSchema.optional(),
  contract_type: ContractTypeSchema.optional(),
  supplier_id: z.coerce.number().int().optional(),
  customer_id: z.coerce.number().int().optional(),
  expiring_within_days: z.coerce.number().int().optional(),
});
export type ListContractsQuery = z.infer<typeof ListContractsQuerySchema>;
