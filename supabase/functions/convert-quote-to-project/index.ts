// ============================================================
// FILE: supabase/functions/convert-quote-to-project/index.ts
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
import { normalizeError, ConflictError, NotFoundError } from "../_shared/errors.ts";

function buildProjectNumber(): string {
  const year = new Date().getUTCFullYear();
  const rand = crypto.randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase();
  return `PROJ-${year}-${rand}`;
}

serve(async (req: Request) => {
  const correlationId = getCorrelationId(req);
  const admin = getAdminClient();

  if (req.method === "OPTIONS") return optionsResponse();

  try {
    if (req.method !== "POST") throw new Error("METHOD_NOT_ALLOWED");
    const actor = await requireInternalUser(req, admin);
    await requirePermission(actor, "quotes.convert_to_project", admin);

    const body = await req.json();
    const quoteId = Number(body.quote_id);

    const { data: quote, error } = await admin
      .schema("commercial")
      .from("quotes")
      .select("*")
      .eq("id", quoteId)
      .single();

    if (error || !quote) throw new NotFoundError("Quote not found");

    if (quote.state !== "Approved") {
      throw new ConflictError("Only approved quotes can be converted", { state: quote.state });
    }

    if (quote.converted_project_id) {
      throw new ConflictError("Quote already converted", {
        converted_project_id: quote.converted_project_id,
      });
    }

    const { data: project, error: createProjectError } = await admin
      .schema("execution")
      .from("projects")
      .insert({
        project_number: buildProjectNumber(),
        project_name: `Project from ${quote.quote_number}`,
        customer_id: quote.customer_id,
        quote_id: quote.id,
        budget_amount: quote.grand_total ?? 0,
        actual_cost: 0,
        billed_amount: 0,
        collected_amount: 0,
        progress_percent: 0,
        billable: true,
        state: "Planning",
        owner_user_id: actor.userProfileId,
        created_by: actor.userProfileId,
        updated_by: actor.userProfileId,
      })
      .select("*")
      .single();

    if (createProjectError || !project) {
      throw createProjectError ?? new Error("PROJECT_CREATE_FROM_QUOTE_FAILED");
    }

    const { data: updatedQuote, error: updateQuoteError } = await admin
      .schema("commercial")
      .from("quotes")
      .update({
        state: "ConvertedToProject",
        converted_project_id: project.id,
        updated_by: actor.userProfileId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", quoteId)
      .select("*")
      .single();

    if (updateQuoteError || !updatedQuote) {
      throw updateQuoteError ?? new Error("QUOTE_CONVERSION_UPDATE_FAILED");
    }

    await writeStateHistory(admin, {
      entityType: "Quote",
      entityId: quoteId,
      fromState: quote.state,
      toState: "ConvertedToProject",
      changedByUserId: actor.userProfileId,
      reason: `Converted to project ${project.id}`,
      correlationId,
    });

    await writeAudit(admin, {
      entityType: "Quote",
      entityId: quoteId,
      actionName: "quote.convert_to_project",
      oldValues: quote,
      newValues: updatedQuote,
      sourceService: "ONYX_PROCUREMENT",
      sourceModule: "quotes",
      sourcePage: "Quote360",
      performedByUserId: actor.userProfileId,
      correlationId,
    });

    await writeAudit(admin, {
      entityType: "Project",
      entityId: project.id,
      actionName: "project.create_from_quote",
      oldValues: null,
      newValues: project,
      sourceService: "TECHNO_KOL_OPS",
      sourceModule: "projects",
      sourcePage: "Quote360",
      performedByUserId: actor.userProfileId,
      correlationId,
    });

    await writeDomainEvent(admin, {
      eventName: "quote.converted_to_project",
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
        quote_id: quote.id,
        quote_number: quote.quote_number,
        project_id: project.id,
        project_number: project.project_number,
      },
      metadata: null,
    });

    await writeDomainEvent(admin, {
      eventName: "project.created_from_quote",
      topicName: "execution.projects",
      sourceService: "TECHNO_KOL_OPS",
      sourceModule: "projects",
      entityType: "Project",
      entityId: project.id,
      partitionKey: `Project:${project.id}`,
      correlationId,
      causationId: null,
      actorType: "user",
      actorId: actor.userProfileId,
      payload: {
        project_id: project.id,
        project_number: project.project_number,
        quote_id: quote.id,
        customer_id: quote.customer_id,
        state: project.state,
      },
      metadata: null,
    });

    return ok({ project, quote: updatedQuote }, correlationId);
  } catch (error) {
    return failFromAppError(normalizeError(error), correlationId);
  }
});
