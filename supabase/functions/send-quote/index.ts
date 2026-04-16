// ============================================================
// FILE: supabase/functions/send-quote/index.ts
// ============================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { requireInternalUser } from "../_shared/auth.ts";
import { requirePermission } from "../_shared/permissions.ts";
import { getCorrelationId } from "../_shared/correlation.ts";
import { optionsResponse, ok, failFromAppError } from "../_shared/response.ts";
import { logInfo, logError } from "../_shared/logger.ts";
import { writeAudit } from "../_shared/audit.ts";
import { writeStateHistory } from "../_shared/state-history.ts";
import { writeDomainEvent } from "../_shared/events.ts";
import { getAdminClient } from "../_shared/supabase-admin.ts";
import { normalizeError, NotFoundError, ConflictError } from "../_shared/errors.ts";

serve(async (req: Request) => {
  const correlationId = getCorrelationId(req);
  const admin = getAdminClient();

  if (req.method === "OPTIONS") return optionsResponse();

  try {
    if (req.method !== "POST") throw new Error("METHOD_NOT_ALLOWED");

    const actor = await requireInternalUser(req, admin);
    await requirePermission(actor, "quotes.send", admin);

    const body = await req.json();
    const quoteId = Number(body.quote_id);

    if (!quoteId || Number.isNaN(quoteId)) {
      throw new ConflictError("quote_id is required");
    }

    const { data: quote, error: quoteError } = await admin
      .schema("commercial")
      .from("quotes")
      .select(`
        id,
        quote_number,
        customer_id,
        state,
        approval_status,
        grand_total,
        valid_until
      `)
      .eq("id", quoteId)
      .single();

    if (quoteError || !quote) {
      throw new NotFoundError("Quote not found", quoteError ?? undefined);
    }

    if (quote.state !== "Draft") {
      throw new ConflictError("Only Draft quote can be sent", { current_state: quote.state });
    }

    const { count: lineCount, error: lineError } = await admin
      .schema("commercial")
      .from("quote_lines")
      .select("*", { count: "exact", head: true })
      .eq("quote_id", quoteId);

    if (lineError) throw lineError;
    if (!lineCount || lineCount <= 0) {
      throw new ConflictError("Quote must have at least one line before sending");
    }

    const beforeSnapshot = { ...quote };

    const { data: updatedQuote, error: updateError } = await admin
      .schema("commercial")
      .from("quotes")
      .update({
        state: "Sent",
        approval_status: "pending",
        updated_by: actor.userProfileId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", quoteId)
      .select(`
        id,
        quote_number,
        customer_id,
        state,
        approval_status,
        grand_total,
        valid_until
      `)
      .single();

    if (updateError || !updatedQuote) {
      throw updateError ?? new Error("Failed to update quote");
    }

    await writeStateHistory(admin, {
      entityType: "Quote",
      entityId: quoteId,
      fromState: beforeSnapshot.state,
      toState: "Sent",
      changedByUserId: actor.userProfileId,
      reason: "Quote sent",
      correlationId,
    });

    await writeAudit(admin, {
      entityType: "Quote",
      entityId: quoteId,
      actionName: "quote.send",
      oldValues: beforeSnapshot,
      newValues: updatedQuote,
      sourceService: "ONYX_PROCUREMENT",
      sourceModule: "quotes",
      sourcePage: "Quote360",
      performedByUserId: actor.userProfileId,
      correlationId,
    });

    await writeDomainEvent(admin, {
      eventName: "quote.sent",
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
        quote_id: updatedQuote.id,
        quote_number: updatedQuote.quote_number,
        customer_id: updatedQuote.customer_id,
        state: updatedQuote.state,
        approval_status: updatedQuote.approval_status,
        grand_total: updatedQuote.grand_total,
      },
      metadata: { source: "edge_function" },
    });

    logInfo("send_quote.succeeded", {
      correlation_id: correlationId,
      quote_id: updatedQuote.id,
    });

    return ok(updatedQuote, correlationId);
  } catch (error) {
    const normalized = normalizeError(error);
    logError("send_quote.failed", {
      correlation_id: correlationId,
      code: normalized.code,
      message: normalized.message,
    });
    return failFromAppError(normalized, correlationId);
  }
});
