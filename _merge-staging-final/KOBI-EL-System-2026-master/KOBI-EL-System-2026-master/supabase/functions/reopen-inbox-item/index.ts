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
    const inboxId = Number(body.inbox_id);

    const { data: item, error: itemError } = await admin
      .schema("orchestration")
      .from("universal_inbox")
      .select("*")
      .eq("id", inboxId)
      .single();

    if (itemError || !item) throw new NotFoundError("Inbox item not found");

    const { data, error } = await admin
      .schema("orchestration")
      .from("universal_inbox")
      .update({
        state: "open",
        updated_at: new Date().toISOString(),
      })
      .eq("id", inboxId)
      .select("*")
      .single();

    if (error || !data) throw error ?? new Error("INBOX_REOPEN_FAILED");
    return ok(data, correlationId);
  } catch (error) {
    return failFromAppError(normalizeError(error), correlationId);
  }
});
