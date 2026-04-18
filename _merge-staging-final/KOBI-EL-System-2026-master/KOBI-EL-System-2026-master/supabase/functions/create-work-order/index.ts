// ============================================================
// FILE: supabase/functions/create-work-order/index.ts
// ============================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getAdminClient } from "../_shared/supabase-admin.ts";
import { requireInternalUser } from "../_shared/auth.ts";
import { requirePermission } from "../_shared/permissions.ts";
import { getCorrelationId } from "../_shared/correlation.ts";
import { optionsResponse, ok, failFromAppError } from "../_shared/response.ts";
import { writeAudit } from "../_shared/audit.ts";
import { writeDomainEvent } from "../_shared/events.ts";
import { requireString, optionalString } from "../_shared/validators.ts";
import { normalizeError } from "../_shared/errors.ts";

function buildWorkOrderNumber(): string {
  const year = new Date().getUTCFullYear();
  const rand = crypto.randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase();
  return `WO-${year}-${rand}`;
}

serve(async (req: Request) => {
  const correlationId = getCorrelationId(req);
  const admin = getAdminClient();

  if (req.method === "OPTIONS") return optionsResponse();

  try {
    if (req.method !== "POST") throw new Error("METHOD_NOT_ALLOWED");

    const actor = await requireInternalUser(req, admin);
    await requirePermission(actor, "workorders.create", admin);

    const body = await req.json();
    const projectId = Number(body.project_id);

    const { data: workOrder, error } = await admin
      .schema("execution")
      .from("work_orders")
      .insert({
        work_order_number: buildWorkOrderNumber(),
        project_id: projectId,
        title: requireString(body.title, "title"),
        description: optionalString(body.description),
        location_name: optionalString(body.location_name),
        required_start_date: optionalString(body.required_start_date),
        required_end_date: optionalString(body.required_end_date),
        state: "Open",
        owner_user_id: actor.userProfileId,
        created_by: actor.userProfileId,
        updated_by: actor.userProfileId,
      })
      .select("*")
      .single();

    if (error || !workOrder) throw error ?? new Error("WORKORDER_CREATE_FAILED");

    await writeAudit(admin, {
      entityType: "WorkOrder",
      entityId: workOrder.id,
      actionName: "workorder.create",
      oldValues: null,
      newValues: workOrder,
      sourceService: "TECHNO_KOL_OPS",
      sourceModule: "work_orders",
      sourcePage: "Project360",
      performedByUserId: actor.userProfileId,
      correlationId,
    });

    await writeDomainEvent(admin, {
      eventName: "workorder.created",
      topicName: "execution.workorders",
      sourceService: "TECHNO_KOL_OPS",
      sourceModule: "work_orders",
      entityType: "WorkOrder",
      entityId: workOrder.id,
      partitionKey: `WorkOrder:${workOrder.id}`,
      correlationId,
      causationId: null,
      actorType: "user",
      actorId: actor.userProfileId,
      payload: {
        work_order_id: workOrder.id,
        work_order_number: workOrder.work_order_number,
        project_id: workOrder.project_id,
        state: workOrder.state,
      },
      metadata: null,
    });

    return ok(workOrder, correlationId, 201);
  } catch (error) {
    return failFromAppError(normalizeError(error), correlationId);
  }
});
