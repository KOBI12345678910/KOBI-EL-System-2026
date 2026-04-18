import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getAdminClient } from "../_shared/supabase-admin.ts";
import { requireInternalUser } from "../_shared/auth.ts";
import { getCorrelationId } from "../_shared/correlation.ts";
import { optionsResponse, ok, failFromAppError } from "../_shared/response.ts";
import { normalizeError, ConflictError } from "../_shared/errors.ts";

serve(async (req: Request) => {
  const correlationId = getCorrelationId(req);
  const admin = getAdminClient();
  if (req.method === "OPTIONS") return optionsResponse();

  try {
    if (req.method !== "POST") throw new Error("METHOD_NOT_ALLOWED");
    const actor = await requireInternalUser(req, admin);
    const body = await req.json();

    const queueName = String(body.queue_name || "").trim();
    const jobType = String(body.job_type || "").trim();
    const parentEntityType = body.parent_entity_type ? String(body.parent_entity_type) : null;
    const parentEntityId = body.parent_entity_id ? Number(body.parent_entity_id) : null;
    const workflowRunId = body.workflow_run_id ? Number(body.workflow_run_id) : null;
    const payload = body.payload ?? {};
    const maxAttempts = body.max_attempts ? Number(body.max_attempts) : 5;

    if (!queueName || !jobType) throw new ConflictError("queue_name and job_type are required");

    const { data, error } = await admin.schema("orchestration").from("job_queue").insert({
      queue_name: queueName, job_type: jobType, parent_entity_type: parentEntityType,
      parent_entity_id: parentEntityId, workflow_run_id: workflowRunId,
      payload, max_attempts: maxAttempts, state: "queued",
    }).select("*").single();

    if (error || !data) throw error ?? new Error("JOB_ENQUEUE_FAILED");
    return ok(data, correlationId);
  } catch (error) { return failFromAppError(normalizeError(error), correlationId); }
});
