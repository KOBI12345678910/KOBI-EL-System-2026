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
    const errorMessage = String(body.error_message || "Unknown job failure");

    const { data: job, error: jobError } = await admin.schema("orchestration").from("job_queue").select("*").eq("id", jobId).single();
    if (jobError || !job) throw new NotFoundError("Job not found");

    const nextAttempts = (job.attempts_count || 0);
    const isDeadLetter = nextAttempts >= (job.max_attempts || 5);
    const nextState = isDeadLetter ? "deadletter" : "queued";
    const nextAvailableAt = isDeadLetter ? new Date().toISOString() : new Date(Date.now() + 60_000 * Math.max(1, nextAttempts)).toISOString();

    const { data: updatedJob, error: updateError } = await admin.schema("orchestration").from("job_queue")
      .update({ state: nextState, error_message: errorMessage, finished_at: isDeadLetter ? new Date().toISOString() : null, available_at: nextAvailableAt, updated_at: new Date().toISOString() })
      .eq("id", jobId).select("*").single();
    if (updateError || !updatedJob) throw updateError ?? new Error("JOB_FAIL_UPDATE_FAILED");

    const workflowStepRunId = job.payload?.workflow_step_run_id;
    if (workflowStepRunId) {
      const stepState = isDeadLetter ? "failed" : "queued";
      const { data: stepRun } = await admin.schema("orchestration").from("workflow_step_runs")
        .update({ state: stepState, error_message: errorMessage, finished_at: isDeadLetter ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
        .eq("id", workflowStepRunId).select("*").single();
      if (isDeadLetter && stepRun) {
        await admin.schema("orchestration").from("workflow_runs").update({ state: "failed", finished_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", stepRun.workflow_run_id);
      }
    }

    await writeDomainEvent(admin, { eventName: isDeadLetter ? "job.deadletter" : "job.failed", topicName: "orchestration.jobs", sourceService: "ORCHESTRATION_CORE", sourceModule: "job_queue", entityType: "JobQueue", entityId: updatedJob.id, partitionKey: `JobQueue:${updatedJob.id}`, correlationId, causationId: null, actorType: "system", actorId: null, payload: { job_id: updatedJob.id, queue_name: updatedJob.queue_name, job_type: updatedJob.job_type, state: updatedJob.state, error_message: errorMessage }, metadata: null });
    return ok(updatedJob, correlationId);
  } catch (error) { return failFromAppError(normalizeError(error), correlationId); }
});
