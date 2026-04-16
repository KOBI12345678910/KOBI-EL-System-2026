import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getAdminClient } from "../_shared/supabase-admin.ts";
import { getCorrelationId } from "../_shared/correlation.ts";
import { optionsResponse, ok, failFromAppError } from "../_shared/response.ts";
import { writeDomainEvent } from "../_shared/events.ts";
import { normalizeError, NotFoundError } from "../_shared/errors.ts";

serve(async (req: Request) => {
  const correlationId = getCorrelationId(req);
  const admin = getAdminClient();
  if (req.method === "OPTIONS") return optionsResponse();

  try {
    if (req.method !== "POST") throw new Error("METHOD_NOT_ALLOWED");
    const body = await req.json();
    const jobId = Number(body.job_id);
    const outputPayload = body.output_payload ?? {};

    const { data: job, error: jobError } = await admin.schema("orchestration").from("job_queue").select("*").eq("id", jobId).single();
    if (jobError || !job) throw new NotFoundError("Job not found");

    const { data: updatedJob, error: updateError } = await admin.schema("orchestration").from("job_queue")
      .update({ state: "completed", finished_at: new Date().toISOString(), error_message: null, updated_at: new Date().toISOString() })
      .eq("id", jobId).select("*").single();
    if (updateError || !updatedJob) throw updateError ?? new Error("JOB_COMPLETE_FAILED");

    const workflowStepRunId = job.payload?.workflow_step_run_id;
    if (workflowStepRunId) {
      const { data: stepRun, error: stepRunError } = await admin.schema("orchestration").from("workflow_step_runs")
        .update({ state: "completed", finished_at: new Date().toISOString(), output_payload: outputPayload, updated_at: new Date().toISOString() })
        .eq("id", workflowStepRunId).select("*").single();
      if (stepRunError || !stepRun) throw stepRunError ?? new Error("STEP_RUN_COMPLETE_FAILED");

      const { data: nextStep } = await admin.schema("orchestration").from("workflow_step_runs")
        .select("*").eq("workflow_run_id", stepRun.workflow_run_id).eq("sequence_order", stepRun.sequence_order + 1).maybeSingle();

      if (nextStep) {
        await admin.schema("orchestration").from("workflow_step_runs").update({ state: "queued", updated_at: new Date().toISOString() }).eq("id", nextStep.id);
        await admin.schema("orchestration").from("job_queue").insert({
          queue_name: "workflow_steps", job_type: `workflow_step:${nextStep.step_type}`,
          parent_entity_type: job.parent_entity_type, parent_entity_id: job.parent_entity_id, workflow_run_id: stepRun.workflow_run_id,
          payload: { workflow_run_id: stepRun.workflow_run_id, workflow_step_run_id: nextStep.id, step_code: nextStep.step_code }, state: "queued",
        });
      } else {
        await admin.schema("orchestration").from("workflow_runs").update({ state: "completed", finished_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", stepRun.workflow_run_id);
      }
    }

    await writeDomainEvent(admin, { eventName: "job.completed", topicName: "orchestration.jobs", sourceService: "ORCHESTRATION_CORE", sourceModule: "job_queue", entityType: "JobQueue", entityId: updatedJob.id, partitionKey: `JobQueue:${updatedJob.id}`, correlationId, causationId: null, actorType: "system", actorId: null, payload: { job_id: updatedJob.id, queue_name: updatedJob.queue_name, job_type: updatedJob.job_type, state: updatedJob.state }, metadata: null });
    return ok(updatedJob, correlationId);
  } catch (error) { return failFromAppError(normalizeError(error), correlationId); }
});
