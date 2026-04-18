// ============================================================
// Zod schemas for commercial.lead_sources
// Generated: 2026-04-18
// ============================================================
import { z } from "zod";

export const LEAD_SOURCE_CHANNELS = [
  "website",
  "referral",
  "linkedin",
  "cold_outreach",
  "event",
  "existing_customer",
  "partner",
  "advertisement",
  "tender",
  "other",
] as const;

export const LeadSourceChannelSchema = z.enum(LEAD_SOURCE_CHANNELS);
export type LeadSourceChannel = z.infer<typeof LeadSourceChannelSchema>;

/** Payload accepted when CREATING a lead source. */
export const CreateLeadSourceSchema = z.object({
  code: z.string().min(2).max(64).regex(/^[a-z0-9_]+$/, "code must be lowercase alphanumeric + underscore"),
  name_he: z.string().min(1).max(200),
  name_en: z.string().max(200).optional().nullable(),
  channel: LeadSourceChannelSchema,
  description: z.string().max(2000).optional().nullable(),
  is_active: z.boolean().optional().default(true),
  sort_order: z.number().int().min(0).max(10000).optional().default(0),
  metadata: z.record(z.unknown()).optional().default({}),
});
export type CreateLeadSourceInput = z.infer<typeof CreateLeadSourceSchema>;

/** Payload accepted when UPDATING a lead source. All fields optional. */
export const UpdateLeadSourceSchema = CreateLeadSourceSchema.partial().extend({
  // code and channel remain updatable but validated if provided
});
export type UpdateLeadSourceInput = z.infer<typeof UpdateLeadSourceSchema>;

/** Full row shape returned by the API (read model). */
export const ReadLeadSourceSchema = z.object({
  id: z.union([z.number().int(), z.string()]),
  public_id: z.string().uuid(),
  code: z.string(),
  name_he: z.string(),
  name_en: z.string().nullable(),
  channel: LeadSourceChannelSchema,
  description: z.string().nullable(),
  is_active: z.boolean(),
  sort_order: z.number().int(),
  metadata: z.record(z.unknown()),
  created_at: z.string(),
  updated_at: z.string(),
  created_by: z.number().int().nullable(),
  updated_by: z.number().int().nullable(),
});
export type ReadLeadSource = z.infer<typeof ReadLeadSourceSchema>;

/** Pagination / filter query parameters for LIST endpoint. */
export const ListLeadSourcesQuerySchema = z.object({
  q: z.string().max(200).optional(),
  channel: LeadSourceChannelSchema.optional(),
  is_active: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
  order_by: z.enum(["sort_order", "name_he", "created_at", "updated_at"]).optional().default("sort_order"),
  order_dir: z.enum(["asc", "desc"]).optional().default("asc"),
});
export type ListLeadSourcesQuery = z.infer<typeof ListLeadSourcesQuerySchema>;
