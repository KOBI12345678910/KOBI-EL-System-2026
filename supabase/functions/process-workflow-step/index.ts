import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getAdminClient } from "../_shared/supabase-admin.ts";
import { getCorrelationId } from "../_shared/correlation.ts";
import { optionsResponse, ok, failFromAppError } from "../_shared/response.ts";
import { normalizeError, NotFoundError, ConflictError } from "../_shared/errors.ts";

async function enqueueNotification(admin: any, title: string, messageText: string, recipientType = "role", recipientId: number | null = null) {
  const year = new Date().getUTCFullYear();
  const rand = crypto.randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase();
  const { error } = await admin.schema("orchestration").from("notifications").insert({
    notification_number: `NTF-${year}-${rand}`, recipient_type: recipientType, recipient_id: recipientId,
    title, message_text: messageText, severity: "info", channel: "in_app", state: "open",
  });
  if (error) throw error;
}

serve(async (req: Request) => {
  const correlationId = getCorrelationId(req);
  const admin = getAdminClient();
  if (req.method === "OPTIONS") return optionsResponse();

  try {
    if (req.method !== "POST") throw new Error("METHOD_NOT_ALLOWED");
    const body = await req.json();
    const workflowStepRunId = Number(body.workflow_step_run_id);

    const { data: stepRun, error: stepRunError } = await admin.schema("orchestration").from("workflow_step_runs").select("*").eq("id", workflowStepRunId).single();
    if (stepRunError || !stepRun) throw new NotFoundError("Workflow step run not found");
    if (!["queued", "waiting", "pending"].includes(stepRun.state)) throw new ConflictError("Step run is not executable in current state", { state: stepRun.state });

    await admin.schema("orchestration").from("workflow_step_runs")
      .update({ state: "running", started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", workflowStepRunId);

    let outputPayload: Record<string, unknown> = {};
    if (stepRun.step_type === "validation") {
      outputPayload = { validation_status: "passed", step_code: stepRun.step_code };
    } else if (stepRun.step_type === "notification") {
      await enqueueNotification(admin, `Workflow step completed: ${stepRun.step_name}`, `Workflow run #${stepRun.workflow_run_id} completed notification step ${stepRun.step_code}`);
      outputPayload = { notification_status: "sent" };
    } else if (stepRun.step_type === "action") {
      outputPayload = { action_status: "executed", action_code: stepRun.step_code };
    } else {
      outputPayload = { step_status: "noop" };
    }

    const { data: completedStep, error: completeStepError } = await admin.schema("orchestration").from("workflow_step_runs")
      .update({ state: "completed", finished_at: new Date().toISOString(), output_payload: outputPayload, updated_at: new Date().toISOString() })
      .eq("id", workflowStepRunId).select("*").single();
    if (completeStepError || !completedStep) throw completeStepError ?? new Error("STEP_COMPLETE_FAILED");

    const { data: nextStep } = await admin.schema("orchestration").from("workflow_step_runs")
      .select("*").eq("workflow_run_id", completedStep.workflow_run_id).eq("sequence_order", completedStep.sequence_order + 1).maybeSingle();

    if (nextStep) {
      await admin.schema("orchestration").from("workflow_step_runs").update({ state: "queued", updated_at: new Date().toISOString() }).eq("id", nextStep.id);
      await admin.schema("orchestration").from("job_queue").insert({
        queue_name: "workflow_steps", job_type: `workflow_step:${nextStep.step_type}`, workflow_run_id: completedStep.workflow_run_id,
        payload: { workflow_run_id: completedStep.workflow_run_id, workflow_step_run_id: nextStep.id, step_code: nextStep.step_code }, state: "queued",
      });
    } else {
      await admin.schema("orchestration").from("workflow_runs")
        .update({ state: "completed", finished_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", completedStep.workflow_run_id);
    }

    return ok(completedStep, correlationId);
  } catch (error) { return failFromAppError(normalizeError(error), correlationId); }
});
