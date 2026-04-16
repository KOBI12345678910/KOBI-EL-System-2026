import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getAdminClient } from "../_shared/supabase-admin.ts";
import { requireInternalUser } from "../_shared/auth.ts";
import { getCorrelationId } from "../_shared/correlation.ts";
import { optionsResponse, ok, failFromAppError } from "../_shared/response.ts";
import { writeAudit } from "../_shared/audit.ts";
import { writeDomainEvent } from "../_shared/events.ts";
import { normalizeError, NotFoundError, ConflictError } from "../_shared/errors.ts";

serve(async (req: Request) => {
  const correlationId = getCorrelationId(req);
  const admin = getAdminClient();
  if (req.method === "OPTIONS") return optionsResponse();

  try {
    if (req.method !== "POST") throw new Error("METHOD_NOT_ALLOWED");
    const actor = await requireInternalUser(req, admin);
    const body = await req.json();

    const workflowCode = String(body.workflow_code || "").trim();
    const parentEntityType = body.parent_entity_type ? String(body.parent_entity_type) : null;
    const parentEntityId = body.parent_entity_id ? Number(body.parent_entity_id) : null;
    if (!workflowCode) throw new ConflictError("workflow_code is required");

    const { data: definition, error: definitionError } = await admin
      .schema("orchestration").from("workflow_definitions")
      .select("*").eq("workflow_code", workflowCode).eq("active", true).single();
    if (definitionError || !definition) throw new NotFoundError("Workflow definition not found");

    const { data: existingRunning } = await admin
      .schema("orchestration").from("workflow_runs").select("id")
      .eq("workflow_code", workflowCode).eq("parent_entity_type", parentEntityType)
      .eq("parent_entity_id", parentEntityId).in("state", ["queued", "running", "pending"])
      .limit(1).maybeSingle();
    if (existingRunning) throw new ConflictError("Active workflow already exists for parent entity", { workflow_code: workflowCode, parent_entity_type: parentEntityType, parent_entity_id: parentEntityId, workflow_run_id: existingRunning.id });

    const { data: run, error: runError } = await admin
      .schema("orchestration").from("workflow_runs").insert({
        workflow_definition_id: definition.id, workflow_code: definition.workflow_code,
        workflow_name: definition.workflow_name, parent_entity_type: parentEntityType,
        parent_entity_id: parentEntityId, correlation_id: correlationId,
        triggered_by_user_id: actor.userProfileId, state: "queued", started_at: new Date().toISOString(),
      }).select("*").single();
    if (runError || !run) throw runError ?? new Error("WORKFLOW_RUN_CREATE_FAILED");

    const { data: steps, error: stepsError } = await admin
      .schema("orchestration").from("workflow_steps").select("*")
      .eq("workflow_definition_id", definition.id).eq("active", true)
      .order("sequence_order", { ascending: true });
    if (stepsError) throw stepsError;

    if (steps && steps.length > 0) {
      const stepRunsPayload = steps.map((step) => ({
        workflow_run_id: run.id, workflow_step_id: step.id, step_code: step.step_code,
        step_name: step.step_name, step_type: step.step_type, sequence_order: step.sequence_order,
        state: step.sequence_order === 1 ? "queued" : "waiting",
      }));
      const { error: stepRunsError } = await admin.schema("orchestration").from("workflow_step_runs").insert(stepRunsPayload);
      if (stepRunsError) throw stepRunsError;
    }

    const { data: firstStep } = await admin.schema("orchestration").from("workflow_step_runs")
      .select("*").eq("workflow_run_id", run.id).eq("sequence_order", 1).maybeSingle();

    if (firstStep) {
      await admin.schema("orchestration").from("job_queue").insert({
        queue_name: "workflow_steps", job_type: `workflow_step:${firstStep.step_type}`,
        parent_entity_type: parentEntityType, parent_entity_id: parentEntityId, workflow_run_id: run.id,
        payload: { workflow_run_id: run.id, workflow_step_run_id: firstStep.id, workflow_code: definition.workflow_code, step_code: firstStep.step_code },
        state: "queued",
      });
    }

    await writeAudit(admin, { entityType: "WorkflowRun", entityId: run.id, actionName: "workflow.start", oldValues: null, newValues: run, sourceService: "ORCHESTRATION_CORE", sourceModule: "workflow_runs", sourcePage: "CommandCenter", performedByUserId: actor.userProfileId, correlationId });
    await writeDomainEvent(admin, { eventName: "workflow.started", topicName: "orchestration.workflows", sourceService: "ORCHESTRATION_CORE", sourceModule: "workflow_runs", entityType: "WorkflowRun", entityId: run.id, partitionKey: `WorkflowRun:${run.id}`, correlationId, causationId: null, actorType: "user", actorId: actor.userProfileId, payload: { workflow_run_id: run.id, workflow_code: run.workflow_code, parent_entity_type: run.parent_entity_type, parent_entity_id: run.parent_entity_id, state: run.state }, metadata: null });

    return ok(run, correlationId);
  } catch (error) { return failFromAppError(normalizeError(error), correlationId); }
});
