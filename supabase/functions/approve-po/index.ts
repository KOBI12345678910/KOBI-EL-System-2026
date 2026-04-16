// ============================================================
// FILE: supabase/functions/approve-po/index.ts
// ============================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getAdminClient } from "../_shared/supabase-admin.ts";
import { requireInternalUser } from "../_shared/auth.ts";
import { requirePermission } from "../_shared/permissions.ts";
import { getCorrelationId } from "../_shared/correlation.ts";
import { optionsResponse, ok, failFromAppError } from "../_shared/response.ts";
import { logInfo, logError } from "../_shared/logger.ts";
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
    await requirePermission(actor, "po.approve", admin);

    const body = await req.json();
    const poId = Number(body.po_id);

    logInfo("approve_po.started", {
      correlation_id: correlationId,
      po_id: poId,
      actor_user_profile_id: actor.userProfileId,
    });

    const { data: po, error: poError } = await admin
      .schema("procurement")
      .from("purchase_orders")
      .select("*")
      .eq("id", poId)
      .single();

    if (poError || !po) throw new NotFoundError("Purchase order not found");

    if (po.state !== "PendingApproval") {
      throw new ConflictError("PO is not in PendingApproval state", { state: po.state });
    }

    // Prevent self-approval
    if (po.created_by === actor.userProfileId) {
      throw new ConflictError("Cannot approve your own purchase order");
    }

    const { data: updated, error: updateError } = await admin
      .schema("procurement")
      .from("purchase_orders")
      .update({
        state: "Approved",
        approval_status: "approved",
        approved_by_user_id: actor.userProfileId,
        approved_at: new Date().toISOString(),
        updated_by: actor.userProfileId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", poId)
      .select("*")
      .single();

    if (updateError || !updated) throw updateError ?? new Error("PO_APPROVE_FAILED");

    // Record approval step
    await admin
      .schema("procurement")
      .from("approval_steps")
      .insert({
        approval_id: po.approval_id ?? poId,
        step_number: 1,
        assigned_approver_user_id: actor.userProfileId,
        decision: "approved",
        decided_at: new Date().toISOString(),
        state: "completed",
      });

    await writeStateHistory(admin, {
      entityType: "PurchaseOrder",
      entityId: poId,
      fromState: po.state,
      toState: "Approved",
      changedByUserId: actor.userProfileId,
      reason: "PO approved",
      correlationId,
    });

    await writeAudit(admin, {
      entityType: "PurchaseOrder",
      entityId: poId,
      actionName: "po.approve",
      oldValues: po,
      newValues: updated,
      sourceService: "ONYX_PROCUREMENT",
      sourceModule: "purchase_orders",
      sourcePage: "PO360",
      performedByUserId: actor.userProfileId,
      correlationId,
    });

    await writeDomainEvent(admin, {
      eventName: "po.approved",
      topicName: "procurement.purchase_orders",
      sourceService: "ONYX_PROCUREMENT",
      sourceModule: "purchase_orders",
      entityType: "PurchaseOrder",
      entityId: poId,
      partitionKey: `PO:${poId}`,
      correlationId,
      causationId: null,
      actorType: "user",
      actorId: actor.userProfileId,
      payload: {
        po_id: updated.id,
        po_number: updated.po_number,
        supplier_id: updated.supplier_id,
        grand_total: updated.grand_total,
        state: updated.state,
      },
      metadata: null,
    });

    logInfo("approve_po.succeeded", {
      correlation_id: correlationId,
      po_id: updated.id,
      po_number: updated.po_number,
    });

    return ok(updated, correlationId);
  } catch (error) {
    const normalized = normalizeError(error);
    logError("approve_po.failed", { correlation_id: correlationId, code: normalized.code });
    return failFromAppError(normalized, correlationId);
  }
});
