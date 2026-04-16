import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getAdminClient } from "../_shared/supabase-admin.ts";
import { requireInternalUser } from "../_shared/auth.ts";
import { getCorrelationId } from "../_shared/correlation.ts";
import { optionsResponse, ok, failFromAppError } from "../_shared/response.ts";
import { normalizeError } from "../_shared/errors.ts";

serve(async (req: Request) => {
  const correlationId = getCorrelationId(req);
  const admin = getAdminClient();
  if (req.method === "OPTIONS") return optionsResponse();

  try {
    if (req.method !== "POST") throw new Error("METHOD_NOT_ALLOWED");
    await requireInternalUser(req, admin);

    const stuckBefore = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: stuckJobs, error: stuckJobsError } = await admin.schema("orchestration").from("job_queue")
      .select("*").eq("state", "running").lt("started_at", stuckBefore);
    if (stuckJobsError) throw stuckJobsError;
    if (!stuckJobs || stuckJobs.length === 0) return ok({ retried_count: 0, jobs: [] }, correlationId);

    const retriedIds = stuckJobs.map((j) => j.id);
    const { error: retryError } = await admin.schema("orchestration").from("job_queue")
      .update({ state: "queued", started_at: null, available_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .in("id", retriedIds);
    if (retryError) throw retryError;

    return ok({ retried_count: retriedIds.length, jobs: retriedIds }, correlationId);
  } catch (error) { return failFromAppError(normalizeError(error), correlationId); }
});
