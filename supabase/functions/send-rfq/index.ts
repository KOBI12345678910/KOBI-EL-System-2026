// ============================================================
// FILE: supabase/functions/send-rfq/index.ts
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
import { normalizeError, NotFoundError, ConflictError } from "../_shared/errors.ts";

serve(async (req: Request) => {
  const correlationId = getCorrelationId(req);
  const admin = getAdminClient();

  if (req.method === "OPTIONS") return optionsResponse();

  try {
    if (req.method !== "POST") throw new Error("METHOD_NOT_ALLOWED");
    const actor = await requireInternalUser(req, admin);
    await requirePermission(actor, "rfq.send", admin);

    const body = await req.json();
    const rfqId = Number(body.rfq_id);

    const { data: rfq, error: rfqError } = await admin
      .schema("procurement")
      .from("rfqs")
      .select("*")
      .eq("id", rfqId)
      .single();

    if (rfqError || !rfq) throw new NotFoundError("RFQ not found");

    if (rfq.state !== "Draft") {
      throw new ConflictError("RFQ can only be sent from Draft", { state: rfq.state });
    }

    const { data: invites, error: inviteError } = await admin
      .schema("procurement")
      .from("rfq_supplier_invites")
      .select("id")
      .eq("rfq_id", rfqId);

    if (inviteError) throw inviteError;
    if (!invites || invites.length === 0) {
      throw new ConflictError("Cannot send RFQ without invited suppliers");
    }

    const { data: updated, error: updateError } = await admin
      .schema("procurement")
      .from("rfqs")
      .update({
        state: "Sent",
        updated_by: actor.userProfileId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", rfqId)
      .select("*")
      .single();

    if (updateError || !updated) throw updateError ?? new Error("RFQ_SEND_FAILED");

    await writeStateHistory(admin, {
      entityType: "RFQ",
      entityId: rfqId,
      fromState: rfq.state,
      toState: "Sent",
      changedByUserId: actor.userProfileId,
      reason: "RFQ sent to suppliers",
      correlationId,
    });

    await writeAudit(admin, {
      entityType: "RFQ",
      entityId: rfqId,
      actionName: "rfq.send",
      oldValues: rfq,
      newValues: updated,
      sourceService: "ONYX_PROCUREMENT",
      sourceModule: "rfq",
      sourcePage: "RFQ360",
      performedByUserId: actor.userProfileId,
      correlationId,
    });

    await writeDomainEvent(admin, {
      eventName: "rfq.sent",
      topicName: "procurement.rfq",
      sourceService: "ONYX_PROCUREMENT",
      sourceModule: "rfq",
      entityType: "RFQ",
      entityId: rfqId,
      partitionKey: `RFQ:${rfqId}`,
      correlationId,
      causationId: null,
      actorType: "user",
      actorId: actor.userProfileId,
      payload: {
        rfq_id: updated.id,
        rfq_number: updated.rfq_number,
        invited_suppliers_count: invites.length,
        state: updated.state,
      },
      metadata: null,
    });

    return ok(updated, correlationId);
  } catch (error) {
    return failFromAppError(normalizeError(error), correlationId);
  }
});
