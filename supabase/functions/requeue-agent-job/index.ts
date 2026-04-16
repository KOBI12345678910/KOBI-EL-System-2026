import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getAdminClient } from "../_shared/supabase-admin.ts";
import { requireInternalUser } from "../_shared/auth.ts";
import { getCorrelationId } from "../_shared/correlation.ts";
import { optionsResponse, ok, failFromAppError } from "../_shared/response.ts";
import { normalizeError, NotFoundError } from "../_shared/errors.ts";

serve(async (req: Request) => {
  const correlationId = getCorrelationId(req);
  const admin = getAdminClient();
  if (req.method === "OPTIONS") return optionsResponse();

  try {
    if (req.method !== "POST") throw new Error("METHOD_NOT_ALLOWED");
    await requireInternalUser(req, admin);

    const body = await req.json();
    const jobId = Number(body.job_id);

    const { data: job, error: jobError } = await admin
      .schema("intelligence").from("agent_jobs").select("*").eq("id", jobId).single();
    if (jobError || !job) throw new NotFoundError("Agent job not found");

    const { data, error } = await admin
      .schema("intelligence").from("agent_jobs")
      .update({ state: "queued", started_at: null, finished_at: null, error_message: null, updated_at: new Date().toISOString() })
      .eq("id", jobId).select("*").single();

    if (error || !data) throw error ?? new Error("AGENT_JOB_REQUEUE_FAILED");
    return ok(data, correlationId);
  } catch (error) {
    return failFromAppError(normalizeError(error), correlationId);
  }
});
