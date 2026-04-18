// Zod schemas for execution.site_visits
import { z } from "zod";
import { AuditColumns, IdSchema, PaginationQuery } from "./_shared";

export const VISIT_TYPES = ["survey", "measurement", "delivery", "installation", "inspection", "service", "handover", "other"] as const;
export const VISIT_STATES = ["scheduled", "en_route", "on_site", "completed", "cancelled", "no_show"] as const;

export const CreateSiteVisitSchema = z.object({
  visit_number: z.string().min(1).max(64),
  project_id: z.coerce.number().int().positive().optional().nullable(),
  work_order_id: z.coerce.number().int().positive().optional().nullable(),
  installation_team_id: z.coerce.number().int().positive().optional().nullable(),
  visit_type: z.enum(VISIT_TYPES),
  scheduled_at: z.string(),
  started_at: z.string().optional().nullable(),
  completed_at: z.string().optional().nullable(),
  site_name: z.string().max(300).optional().nullable(),
  site_address: z.string().max(500).optional().nullable(),
  site_contact_name: z.string().max(200).optional().nullable(),
  site_contact_phone: z.string().max(50).optional().nullable(),
  gps_lat: z.coerce.number().optional().nullable(),
  gps_lng: z.coerce.number().optional().nullable(),
  findings: z.string().max(8000).optional().nullable(),
  photos: z.array(z.string()).optional().default([]),
  documents: z.array(z.string()).optional().default([]),
  outcome: z.enum(["success", "partial", "failed", "rescheduled"]).optional().nullable(),
  follow_up_required: z.boolean().optional().default(false),
  state: z.enum(VISIT_STATES).optional().default("scheduled"),
  ...AuditColumns,
});
export type CreateSiteVisitInput = z.infer<typeof CreateSiteVisitSchema>;

export const UpdateSiteVisitSchema = CreateSiteVisitSchema.partial();

export const ReadSiteVisitSchema = z.object({
  id: IdSchema,
  visit_number: z.string(),
  visit_type: z.string(),
  scheduled_at: z.string(),
  site_name: z.string().nullable(),
  state: z.string(),
});
export type ReadSiteVisit = z.infer<typeof ReadSiteVisitSchema>;

export const ListSiteVisitsQuerySchema = z.object({
  project_id: z.coerce.number().int().optional(),
  installation_team_id: z.coerce.number().int().optional(),
  state: z.string().optional(),
  visit_type: z.string().optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
  ...PaginationQuery,
});
