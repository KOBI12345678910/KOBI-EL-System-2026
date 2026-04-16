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
    const notificationId = Number(body.notification_id ?? body.id);

    const { data: item, error: itemError } = await admin
      .schema("orchestration")
      .from("notifications")
      .select("*")
      .eq("id", notificationId)
      .single();

    if (itemError || !item) throw new NotFoundError("Notification not found");

    const { data, error } = await admin
      .schema("orchestration")
      .from("notifications")
      .update({
        state: "resolved",
        updated_at: new Date().toISOString(),
      })
      .eq("id", notificationId)
      .select("*")
      .single();

    if (error || !data) throw error ?? new Error("NOTIFICATION_RESOLVE_FAILED");
    return ok(data, correlationId);
  } catch (error) {
    return failFromAppError(normalizeError(error), correlationId);
  }
});
