// ============================================================
// Orchestration — universal_inbox + inbox_assignments schemas
// ============================================================
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema, InboxStatusSchema } from "./_shared";

export const CreateInboxItemSchema = z.object({
  inbox_number: z.string().min(1).max(100).optional(),
  item_type: z.string().min(1).max(100),
  parent_entity_type: z.string().max(100).optional().nullable(),
  parent_entity_id: z.number().int().optional().nullable(),
  title: z.string().min(1).max(400),
  description: z.string().max(4000).optional().nullable(),
  assigned_to_user_id: z.number().int().optional().nullable(),
  priority: z.string().max(20).optional().nullable(),
  due_at: z.string().optional().nullable(),
  metadata: MetadataSchema,
});

export const ListInboxItemsQuerySchema = ListQueryBaseSchema.extend({
  assigned_to_user_id: z.coerce.number().int().optional(),
  status: InboxStatusSchema.optional(),
  item_type: z.string().optional(),
  parent_entity_type: z.string().optional(),
  parent_entity_id: z.coerce.number().int().optional(),
  priority: z.string().optional(),
  overdue: z.coerce.boolean().optional(),
});

export const ClaimInboxItemSchema = z.object({
  claim_note: z.string().max(1000).optional().nullable(),
});

export const ResolveInboxItemSchema = z.object({
  resolution_note: z.string().min(1).max(2000),
});

export const DismissInboxItemSchema = z.object({
  reason: z.string().min(1).max(1000),
});

export const ReassignInboxItemSchema = z.object({
  assigned_to_user_id: z.number().int().positive(),
  reason: z.string().max(1000).optional().nullable(),
});

// ---------- inbox_assignments ----------
export const ListInboxAssignmentsQuerySchema = ListQueryBaseSchema.extend({
  inbox_item_id: z.coerce.number().int().optional(),
  assigned_to_user_id: z.coerce.number().int().optional(),
  active_only: z.coerce.boolean().optional(),
});
