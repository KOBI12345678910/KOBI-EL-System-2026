import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getAdminClient } from "../_shared/supabase-admin.ts";
import { getCorrelationId } from "../_shared/correlation.ts";
import { optionsResponse, ok, failFromAppError } from "../_shared/response.ts";
import { normalizeError, NotFoundError } from "../_shared/errors.ts";

serve(async (req: Request) => {
  const correlationId = getCorrelationId(req);
  const admin = getAdminClient();
  if (req.method === "OPTIONS") return optionsResponse();

  try {
    if (req.method !== "POST") throw new Error("METHOD_NOT_ALLOWED");
    const body = await req.json();
    const queueName = String(body.queue_name || "default");

    const { data: jobs, error: jobsError } = await admin.schema("orchestration").from("job_queue")
      .select("*").eq("queue_name", queueName).eq("state", "queued")
      .lte("available_at", new Date().toISOString())
      .order("created_at", { ascending: true }).limit(1);
    if (jobsError) throw jobsError;
    const job = jobs?.[0];
    if (!job) throw new NotFoundError("No queued job available");

    const { data: updatedJob, error: updateError } = await admin.schema("orchestration").from("job_queue")
      .update({ state: "running", started_at: new Date().toISOString(), attempts_count: (job.attempts_count || 0) + 1, updated_at: new Date().toISOString() })
      .eq("id", job.id).eq("state", "queued").select("*").maybeSingle();
    if (updateError) throw updateError;
    if (!updatedJob) throw new NotFoundError("Job was claimed by another worker");

    return ok(updatedJob, correlationId);
  } catch (error) { return failFromAppError(normalizeError(error), correlationId); }
});
