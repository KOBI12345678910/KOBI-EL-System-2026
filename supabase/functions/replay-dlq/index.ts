// ============================================================
// FILE: supabase/functions/replay-dlq/index.ts
// Dead Letter Queue replay — retries failed domain events + webhooks
// ============================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getAdminClient } from "../_shared/supabase-admin.ts";
import { getCorrelationId } from "../_shared/correlation.ts";
import { optionsResponse, ok, failFromAppError } from "../_shared/response.ts";
import { logInfo, logError } from "../_shared/logger.ts";
import { normalizeError } from "../_shared/errors.ts";

const MAX_RETRIES = 5;
const BATCH_SIZE = 25;

serve(async (req: Request) => {
  const correlationId = getCorrelationId(req);
  const admin = getAdminClient();

  if (req.method === "OPTIONS") return optionsResponse();

  try {
    // 1) Find failed events that haven't exceeded max retries
    const { data: failedEvents, error: fetchError } = await admin
      .schema("governance")
      .from("domain_events")
      .select("*")
      .eq("processed_state", "failed")
      .order("emitted_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchError) throw fetchError;

    let replayed = 0;
    let permanentlyFailed = 0;

    if (failedEvents && failedEvents.length > 0) {
      logInfo("replay_dlq.started", {
        correlation_id: correlationId,
        failed_events_count: failedEvents.length,
      });

      for (const event of failedEvents) {
        const retryCount = (event.retry_count ?? 0) + 1;

        if (retryCount > MAX_RETRIES) {
          // Mark as dead — no more retries
          await admin
            .schema("governance")
            .from("domain_events")
            .update({ processed_state: "dead" })
            .eq("id", event.id);
          permanentlyFailed++;
        } else {
          // Reset to pending for re-processing
          await admin
            .schema("governance")
            .from("domain_events")
            .update({
              processed_state: "pending",
              processed_at: null,
              retry_count: retryCount,
            })
            .eq("id", event.id);
          replayed++;
        }
      }
    }

    // 2) Retry failed webhook deliveries
    const { data: failedDeliveries } = await admin
      .schema("governance")
      .from("webhook_deliveries")
      .select("*, webhook_endpoints!inner(target_url, active, timeout_ms)")
      .eq("success", false)
      .not("next_retry_at", "is", null)
      .lt("next_retry_at", new Date().toISOString())
      .lt("delivery_attempt", MAX_RETRIES)
      .limit(BATCH_SIZE);

    let webhookRetries = 0;

    if (failedDeliveries && failedDeliveries.length > 0) {
      for (const delivery of failedDeliveries) {
        const endpoint = (delivery as Record<string, unknown>).webhook_endpoints as {
          target_url: string;
          active: boolean;
          timeout_ms: number;
        };

        if (!endpoint?.active) continue;

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), endpoint.timeout_ms ?? 10_000);

          const response = await fetch(endpoint.target_url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Retry-Attempt": String(delivery.delivery_attempt + 1),
              "X-Correlation-Id": correlationId,
            },
            body: JSON.stringify(delivery.payload),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          await admin
            .schema("governance")
            .from("webhook_deliveries")
            .update({
              http_status: response.status,
              delivery_attempt: delivery.delivery_attempt + 1,
              delivered_at: new Date().toISOString(),
              success: response.ok,
              error_message: response.ok ? null : `HTTP ${response.status}`,
              next_retry_at: response.ok ? null : new Date(Date.now() + 300_000).toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", delivery.id);

          webhookRetries++;
        } catch (retryErr) {
          await admin
            .schema("governance")
            .from("webhook_deliveries")
            .update({
              delivery_attempt: delivery.delivery_attempt + 1,
              error_message: String(retryErr),
              next_retry_at: new Date(Date.now() + 600_000).toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", delivery.id);
        }
      }
    }

    logInfo("replay_dlq.completed", {
      correlation_id: correlationId,
      events_replayed: replayed,
      permanently_failed: permanentlyFailed,
      webhook_retries: webhookRetries,
    });

    return ok({
      events_replayed: replayed,
      permanently_failed: permanentlyFailed,
      webhook_retries: webhookRetries,
    }, correlationId);
  } catch (error) {
    return failFromAppError(normalizeError(error), correlationId);
  }
});
