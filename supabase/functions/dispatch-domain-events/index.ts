// ============================================================
// FILE: supabase/functions/dispatch-domain-events/index.ts
// Processes pending domain events → webhook delivery + side effects
// ============================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getAdminClient } from "../_shared/supabase-admin.ts";
import { getCorrelationId } from "../_shared/correlation.ts";
import { optionsResponse, ok, failFromAppError } from "../_shared/response.ts";
import { logInfo, logError } from "../_shared/logger.ts";
import { normalizeError } from "../_shared/errors.ts";

const BATCH_SIZE = 50;
const WEBHOOK_TIMEOUT_MS = 10_000;

serve(async (req: Request) => {
  const correlationId = getCorrelationId(req);
  const admin = getAdminClient();

  if (req.method === "OPTIONS") return optionsResponse();

  try {
    // Fetch pending events
    const { data: events, error: fetchError } = await admin
      .schema("governance")
      .from("domain_events")
      .select("*")
      .eq("processed_state", "pending")
      .order("emitted_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchError) throw fetchError;
    if (!events || events.length === 0) {
      return ok({ processed: 0, message: "No pending events" }, correlationId);
    }

    logInfo("dispatch_events.batch_started", {
      correlation_id: correlationId,
      event_count: events.length,
    });

    let processed = 0;
    let failed = 0;

    for (const event of events) {
      try {
        // Find matching webhook endpoints
        const { data: endpoints } = await admin
          .schema("governance")
          .from("webhook_endpoints")
          .select("*")
          .eq("active", true)
          .contains("subscribed_topics", [event.topic_name]);

        // Deliver to each endpoint
        if (endpoints && endpoints.length > 0) {
          for (const endpoint of endpoints) {
            try {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), endpoint.timeout_ms ?? WEBHOOK_TIMEOUT_MS);

              const response = await fetch(endpoint.target_url, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "X-Event-Name": event.event_name,
                  "X-Event-Id": String(event.id),
                  "X-Correlation-Id": event.correlation_id ?? correlationId,
                },
                body: JSON.stringify({
                  event_id: event.id,
                  event_name: event.event_name,
                  topic: event.topic_name,
                  entity_type: event.entity_type,
                  entity_id: event.entity_id,
                  payload: event.payload,
                  emitted_at: event.emitted_at,
                }),
                signal: controller.signal,
              });

              clearTimeout(timeoutId);

              await admin
                .schema("governance")
                .from("webhook_deliveries")
                .insert({
                  webhook_endpoint_id: endpoint.id,
                  domain_event_id: event.id,
                  payload: event.payload,
                  http_status: response.status,
                  delivery_attempt: 1,
                  delivered_at: new Date().toISOString(),
                  success: response.ok,
                  error_message: response.ok ? null : `HTTP ${response.status}`,
                });
            } catch (webhookErr) {
              await admin
                .schema("governance")
                .from("webhook_deliveries")
                .insert({
                  webhook_endpoint_id: endpoint.id,
                  domain_event_id: event.id,
                  payload: event.payload,
                  delivery_attempt: 1,
                  success: false,
                  error_message: String(webhookErr),
                  next_retry_at: new Date(Date.now() + 60_000).toISOString(),
                });
            }
          }
        }

        // Mark event as processed
        await admin
          .schema("governance")
          .from("domain_events")
          .update({
            processed_state: "processed",
            processed_at: new Date().toISOString(),
          })
          .eq("id", event.id);

        processed++;
      } catch (eventErr) {
        await admin
          .schema("governance")
          .from("domain_events")
          .update({
            processed_state: "failed",
            processed_at: new Date().toISOString(),
          })
          .eq("id", event.id);

        failed++;
        logError("dispatch_events.event_failed", {
          event_id: event.id,
          error: String(eventErr),
        });
      }
    }

    logInfo("dispatch_events.batch_completed", {
      correlation_id: correlationId,
      processed,
      failed,
      total: events.length,
    });

    return ok({ processed, failed, total: events.length }, correlationId);
  } catch (error) {
    return failFromAppError(normalizeError(error), correlationId);
  }
});
