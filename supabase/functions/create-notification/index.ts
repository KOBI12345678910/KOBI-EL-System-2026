import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getAdminClient } from "../_shared/supabase-admin.ts";
import { requireInternalUser } from "../_shared/auth.ts";
import { getCorrelationId } from "../_shared/correlation.ts";
import { optionsResponse, ok, failFromAppError } from "../_shared/response.ts";
import { normalizeError, ConflictError } from "../_shared/errors.ts";

function buildNotificationNumber(): string {
  const year = new Date().getUTCFullYear();
  const rand = crypto.randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase();
  return `NTF-${year}-${rand}`;
}

serve(async (req: Request) => {
  const correlationId = getCorrelationId(req);
  const admin = getAdminClient();
  if (req.method === "OPTIONS") return optionsResponse();

  try {
    if (req.method !== "POST") throw new Error("METHOD_NOT_ALLOWED");
    await requireInternalUser(req, admin);
    const body = await req.json();

    const recipientType = String(body.recipient_type || "").trim();
    const recipientId = body.recipient_id ? Number(body.recipient_id) : null;
    const title = String(body.title || "").trim();
    const messageText = body.message_text ? String(body.message_text) : null;
    const severity = body.severity ? String(body.severity) : "info";
    const channel = body.channel ? String(body.channel) : "in_app";

    if (!recipientType || !title) throw new ConflictError("recipient_type and title are required");

    const { data, error } = await admin.schema("orchestration").from("notifications").insert({
      notification_number: buildNotificationNumber(), recipient_type: recipientType, recipient_id: recipientId,
      title, message_text: messageText, severity, channel, state: "open",
    }).select("*").single();
    if (error || !data) throw error ?? new Error("NOTIFICATION_CREATE_FAILED");

    return ok(data, correlationId);
  } catch (error) { return failFromAppError(normalizeError(error), correlationId); }
});
