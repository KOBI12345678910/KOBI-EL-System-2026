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
    if (req.method !== "GET") throw new Error("METHOD_NOT_ALLOWED");
    await requireInternalUser(req, admin);

    const { data, error } = await admin.rpc("get_sync_status");
    if (error) throw error;

    return ok(data, correlationId);
  } catch (error) {
    return failFromAppError(normalizeError(error), correlationId);
  }
});
