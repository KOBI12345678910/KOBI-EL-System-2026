import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getAdminClient } from "../_shared/supabase-admin.ts";
import { requireInternalUser } from "../_shared/auth.ts";
import { getCorrelationId } from "../_shared/correlation.ts";
import { optionsResponse, ok, failFromAppError } from "../_shared/response.ts";
import { normalizeError, ConflictError } from "../_shared/errors.ts";

function buildInboxNumber(): string {
  const year = new Date().getUTCFullYear();
  const rand = crypto.randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase();
  return `INB-${year}-${rand}`;
}

serve(async (req: Request) => {
  const correlationId = getCorrelationId(req);
  const admin = getAdminClient();
  if (req.method === "OPTIONS") return optionsResponse();

  try {
    if (req.method !== "POST") throw new Error("METHOD_NOT_ALLOWED");
    await requireInternalUser(req, admin);
    const body = await req.json();

    const itemType = String(body.item_type || "").trim();
    const parentEntityType = body.parent_entity_type ? String(body.parent_entity_type) : null;
    const parentEntityId = body.parent_entity_id ? Number(body.parent_entity_id) : null;
    const title = String(body.title || "").trim();
    const description = body.description ? String(body.description) : null;
    const assignedToUserId = body.assigned_to_user_id ? Number(body.assigned_to_user_id) : null;
    const priority = body.priority ? String(body.priority) : "normal";

    if (!itemType || !title) throw new ConflictError("item_type and title are required");

    const { data, error } = await admin.schema("orchestration").from("universal_inbox").insert({
      inbox_number: buildInboxNumber(), item_type: itemType, parent_entity_type: parentEntityType,
      parent_entity_id: parentEntityId, title, description, assigned_to_user_id: assignedToUserId,
      priority, state: assignedToUserId ? "assigned" : "open",
    }).select("*").single();
    if (error || !data) throw error ?? new Error("INBOX_ITEM_CREATE_FAILED");

    return ok(data, correlationId);
  } catch (error) { return failFromAppError(normalizeError(error), correlationId); }
});
