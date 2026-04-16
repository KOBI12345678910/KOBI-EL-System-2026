// ============================================================
// FILE: supabase/functions/approve-quote/index.ts
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

  if (req.method === "OPTIONS") {
    return optionsResponse();
  }

  try {
    if (req.method !== "POST") {
      throw new Error("METHOD_NOT_ALLOWED");
    }

    const actor = await requireInternalUser(req, admin);
    await requirePermission(actor, "quotes.approve", admin);

    const url = new URL(req.url);
    const quoteIdParam = url.searchParams.get("quote_id");

    if (!quoteIdParam) {
      throw new ConflictError("quote_id is required");
    }

    const quoteId = Number(quoteIdParam);

    if (Number.isNaN(quoteId) || quoteId <= 0) {
      throw new ConflictError("quote_id must be a positive number");
    }

    logInfo("approve_quote.started", {
      correlation_id: correlationId,
      quote_id: quoteId,
      actor_user_profile_id: actor.userProfileId,
    });

    const { data: quote, error: quoteError } = await admin
      .schema("commercial")
      .from("quotes")
      .select(`
        id,
        quote_number,
        customer_id,
        quote_date,
        valid_until,
        grand_total,
        approval_status,
        state,
        converted_project_id,
        created_at,
        updated_at
      `)
      .eq("id", quoteId)
      .single();

    if (quoteError || !quote) {
      throw new NotFoundError("Quote not found", quoteError ?? undefined);
    }

    if (!["Sent", "UnderReview"].includes(quote.state)) {
      throw new ConflictError("Quote is not approvable in current state", {
        current_state: quote.state,
      });
    }

    if (quote.converted_project_id) {
      throw new ConflictError("Quote already converted to project", {
        converted_project_id: quote.converted_project_id,
      });
    }

    const beforeSnapshot = { ...quote };

    const { data: updatedQuote, error: updateError } = await admin
      .schema("commercial")
      .from("quotes")
      .update({
        approval_status: "approved",
        state: "Approved",
        updated_at: new Date().toISOString(),
        updated_by: actor.userProfileId,
      })
      .eq("id", quoteId)
      .select(`
        id,
        quote_number,
        customer_id,
        quote_date,
        valid_until,
        grand_total,
        approval_status,
        state,
        converted_project_id,
        created_at,
        updated_at
      `)
      .single();

    if (updateError || !updatedQuote) {
      throw updateError ?? new Error("Failed to update quote");
    }

    await writeStateHistory(admin, {
      entityType: "Quote",
      entityId: quoteId,
      fromState: quote.state,
      toState: "Approved",
      changedByUserId: actor.userProfileId,
      reason: "Quote approved by authorized user",
      correlationId,
    });

    await writeAudit(admin, {
      entityType: "Quote",
      entityId: quoteId,
      actionName: "quote.approve",
      oldValues: beforeSnapshot,
      newValues: updatedQuote,
      sourceService: "ONYX_PROCUREMENT",
      sourceModule: "quotes",
      sourcePage: "Quote360",
      performedByUserId: actor.userProfileId,
      correlationId,
    });

    await writeDomainEvent(admin, {
      eventName: "quote.approved",
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
        grand_total: updatedQuote.grand_total,
        state: updatedQuote.state,
        approval_status: updatedQuote.approval_status,
      },
      metadata: {
        source: "edge_function",
      },
    });

    logInfo("approve_quote.succeeded", {
      correlation_id: correlationId,
      quote_id: updatedQuote.id,
      quote_number: updatedQuote.quote_number,
    });

    return ok(updatedQuote, correlationId);
  } catch (error) {
    const normalized = normalizeError(error);

    logError("approve_quote.failed", {
      correlation_id: correlationId,
      code: normalized.code,
      message: normalized.message,
      details: normalized.details as Record<string, unknown> | undefined,
    });

    return failFromAppError(normalized, correlationId);
  }
});
