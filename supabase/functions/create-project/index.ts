// ============================================================
// FILE: supabase/functions/create-project/index.ts
// ============================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getAdminClient } from "../_shared/supabase-admin.ts";
import { requireInternalUser } from "../_shared/auth.ts";
import { requirePermission } from "../_shared/permissions.ts";
import { getCorrelationId } from "../_shared/correlation.ts";
import { optionsResponse, ok, failFromAppError } from "../_shared/response.ts";
import { logInfo, logError } from "../_shared/logger.ts";
import { writeAudit } from "../_shared/audit.ts";
import { writeDomainEvent } from "../_shared/events.ts";
import { requireString, optionalString, optionalNumber } from "../_shared/validators.ts";
import { normalizeError } from "../_shared/errors.ts";

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
    await requirePermission(actor, "projects.create", admin);

    const body = await req.json();
    const payload = {
      project_name: requireString(body.project_name, "project_name"),
      customer_id: Number(body.customer_id),
      quote_id: body.quote_id ? Number(body.quote_id) : null,
      project_type: optionalString(body.project_type),
      location_name: optionalString(body.location_name),
      address_line_1: optionalString(body.address_line_1),
      city: optionalString(body.city),
      region: optionalString(body.region),
      budget_amount: optionalNumber(body.budget_amount) ?? 0,
      priority: optionalString(body.priority),
      planned_start_date: optionalString(body.planned_start_date),
      planned_end_date: optionalString(body.planned_end_date),
      internal_notes: optionalString(body.internal_notes),
    };

    const projectNumber = buildProjectNumber();

    const { data: project, error } = await admin
      .schema("execution")
      .from("projects")
      .insert({
        project_number: projectNumber,
        project_name: payload.project_name,
        customer_id: payload.customer_id,
        quote_id: payload.quote_id,
        project_type: payload.project_type,
        location_name: payload.location_name,
        address_line_1: payload.address_line_1,
        city: payload.city,
        region: payload.region,
        owner_user_id: actor.userProfileId,
        budget_amount: payload.budget_amount,
        priority: payload.priority,
        planned_start_date: payload.planned_start_date,
        planned_end_date: payload.planned_end_date,
        state: "Planning",
        internal_notes: payload.internal_notes,
        created_by: actor.userProfileId,
        updated_by: actor.userProfileId,
      })
      .select("*")
      .single();

    if (error || !project) throw error ?? new Error("PROJECT_CREATE_FAILED");

    await writeAudit(admin, {
      entityType: "Project",
      entityId: project.id,
      actionName: "project.create",
      oldValues: null,
      newValues: project,
      sourceService: "TECHNO_KOL_OPS",
      sourceModule: "projects",
      sourcePage: "ProjectCreate",
      performedByUserId: actor.userProfileId,
      correlationId,
    });

    await writeDomainEvent(admin, {
      eventName: "project.created",
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
        customer_id: project.customer_id,
        state: project.state,
      },
      metadata: null,
    });

    logInfo("create_project.succeeded", { correlationId, projectId: project.id });
    return ok(project, correlationId, 201);
  } catch (error) {
    const normalized = normalizeError(error);
    logError("create_project.failed", { correlationId, code: normalized.code, message: normalized.message });
    return failFromAppError(normalized, correlationId);
  }
});
