// ============================================================
// FILE: supabase/functions/reject-quote/index.ts
// ============================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getAdminClient } from "../_shared/supabase-admin.ts";
import { requireInternalUser } from "../_shared/auth.ts";
import { requirePermission } from "../_shared/permissions.ts";
import { getCorrelationId } from "../_shared/correlation.ts";
import { optionsResponse, ok, failFromAppError } from "../_shared/response.ts";
import { writeAudit } from "../_shared/audit.ts";
import { writeStateHistory } from "../_shared/state-history.ts";
import { writeDomainEvent } from "../_shared/events.ts";
import { optionalString } from "../_shared/validators.ts";
import { normalizeError, NotFoundError, ConflictError } from "../_shared/errors.ts";

serve(async (req: Request) => {
  const correlationId = getCorrelationId(req);
  const admin = getAdminClient();

  if (req.method === "OPTIONS") return optionsResponse();

  try {
    if (req.method !== "POST") throw new Error("METHOD_NOT_ALLOWED");
    const actor = await requireInternalUser(req, admin);
    await requirePermission(actor, "quotes.reject", admin);

    const body = await req.json();
    const quoteId = Number(body.quote_id);
    const rejectionReason = optionalString(body.rejection_reason);

    const { data: quote, error } = await admin
      .schema("commercial")
      .from("quotes")
      .select("*")
      .eq("id", quoteId)
      .single();

    if (error || !quote) throw new NotFoundError("Quote not found");

    if (!["Sent", "UnderReview"].includes(quote.state)) {
      throw new ConflictError("Quote cannot be rejected in current state", { state: quote.state });
    }

    const { data: updated, error: updateError } = await admin
      .schema("commercial")
      .from("quotes")
      .update({
        state: "Rejected",
        approval_status: "rejected",
        customer_notes: rejectionReason ?? quote.customer_notes,
        updated_by: actor.userProfileId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", quoteId)
      .select("*")
      .single();

    if (updateError || !updated) throw updateError ?? new Error("QUOTE_REJECT_FAILED");

    await writeStateHistory(admin, {
      entityType: "Quote",
      entityId: quoteId,
      fromState: quote.state,
      toState: "Rejected",
      changedByUserId: actor.userProfileId,
      reason: rejectionReason ?? "Quote rejected",
      correlationId,
    });

    await writeAudit(admin, {
      entityType: "Quote",
      entityId: quoteId,
      actionName: "quote.reject",
      oldValues: quote,
      newValues: updated,
      sourceService: "ONYX_PROCUREMENT",
      sourceModule: "quotes",
      sourcePage: "Quote360",
      performedByUserId: actor.userProfileId,
      correlationId,
    });

    await writeDomainEvent(admin, {
      eventName: "quote.rejected",
      topicName: "commercial.quotes",
      sourceService: "ONYX_PROCUREMENT",
      sourceModule: "quotes",
      entityType: "Quote",
      entityId: quoteId,
      partitionKey: `Quote:${quoteId}`,
      correlationId,
      causationId: null,
      actorType: "user",
      actorId: actor.userProfileId,
      payload: {
        quote_id: updated.id,
        quote_number: updated.quote_number,
        state: updated.state,
        rejection_reason: rejectionReason,
      },
      metadata: null,
    });

    return ok(updated, correlationId);
  } catch (error) {
    return failFromAppError(normalizeError(error), correlationId);
  }
});
