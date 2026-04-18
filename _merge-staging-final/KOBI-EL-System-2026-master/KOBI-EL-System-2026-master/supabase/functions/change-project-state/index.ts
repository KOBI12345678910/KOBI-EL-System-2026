// ============================================================
// FILE: supabase/functions/change-project-state/index.ts
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
import { requireString, optionalString } from "../_shared/validators.ts";
import { normalizeError, NotFoundError, ConflictError } from "../_shared/errors.ts";

// Valid project state transitions
const VALID_TRANSITIONS: Record<string, string[]> = {
  Planning: ["Active", "Cancelled"],
  Active: ["OnHold", "Blocked", "Completed", "Cancelled"],
  OnHold: ["Active", "Cancelled"],
  Blocked: ["Active", "Cancelled"],
  Completed: ["Closed"],
  Closed: [],
  Cancelled: [],
};

serve(async (req: Request) => {
  const correlationId = getCorrelationId(req);
  const admin = getAdminClient();

  if (req.method === "OPTIONS") return optionsResponse();

  try {
    if (req.method !== "POST") throw new Error("METHOD_NOT_ALLOWED");
    const actor = await requireInternalUser(req, admin);
    await requirePermission(actor, "projects.change_state", admin);

    const body = await req.json();
    const projectId = Number(body.project_id);
    const toState = requireString(body.to_state, "to_state");
    const reason = optionalString(body.reason);

    logInfo("change_project_state.started", {
      correlation_id: correlationId,
      project_id: projectId,
      to_state: toState,
    });

    const { data: project, error: projectError } = await admin
      .schema("execution")
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .single();

    if (projectError || !project) throw new NotFoundError("Project not found");

    const allowed = VALID_TRANSITIONS[project.state] ?? [];
    if (!allowed.includes(toState)) {
      throw new ConflictError(`Cannot transition from ${project.state} to ${toState}`, {
        current_state: project.state,
        to_state: toState,
        valid_transitions: allowed,
      });
    }

    // Build update payload
    const updatePayload: Record<string, unknown> = {
      state: toState,
      updated_by: actor.userProfileId,
      updated_at: new Date().toISOString(),
    };

    if (toState === "Active" && !project.actual_start_date) {
      updatePayload.actual_start_date = new Date().toISOString().slice(0, 10);
    }

    if (["Completed", "Closed"].includes(toState) && !project.actual_end_date) {
      updatePayload.actual_end_date = new Date().toISOString().slice(0, 10);
    }

    if (toState === "Completed") {
      updatePayload.progress_percent = 100;
    }

    const { data: updated, error: updateError } = await admin
      .schema("execution")
      .from("projects")
      .update(updatePayload)
      .eq("id", projectId)
      .select("*")
      .single();

    if (updateError || !updated) throw updateError ?? new Error("PROJECT_STATE_CHANGE_FAILED");

    await writeStateHistory(admin, {
      entityType: "Project",
      entityId: projectId,
      fromState: project.state,
      toState,
      changedByUserId: actor.userProfileId,
      reason: reason ?? `State changed to ${toState}`,
      correlationId,
    });

    await writeAudit(admin, {
      entityType: "Project",
      entityId: projectId,
      actionName: "project.change_state",
      oldValues: project,
      newValues: updated,
      sourceService: "TECHNO_KOL_OPS",
      sourceModule: "projects",
      sourcePage: "Project360",
      performedByUserId: actor.userProfileId,
      correlationId,
    });

    await writeDomainEvent(admin, {
      eventName: `project.state_changed_to_${toState.toLowerCase()}`,
      topicName: "execution.projects",
      sourceService: "TECHNO_KOL_OPS",
      sourceModule: "projects",
      entityType: "Project",
      entityId: projectId,
      partitionKey: `Project:${projectId}`,
      correlationId,
      causationId: null,
      actorType: "user",
      actorId: actor.userProfileId,
      payload: {
        project_id: updated.id,
        project_number: updated.project_number,
        from_state: project.state,
        to_state: toState,
        reason,
      },
      metadata: null,
    });

    logInfo("change_project_state.succeeded", {
      correlation_id: correlationId,
      project_id: updated.id,
      from_state: project.state,
      to_state: toState,
    });

    return ok(updated, correlationId);
  } catch (error) {
    const normalized = normalizeError(error);
    logError("change_project_state.failed", { correlation_id: correlationId, code: normalized.code });
    return failFromAppError(normalized, correlationId);
  }
});
