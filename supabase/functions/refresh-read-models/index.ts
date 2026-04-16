// ============================================================
// FILE: supabase/functions/refresh-read-models/index.ts
// Refreshes materialized views + processes invalidation queue
// ============================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getAdminClient } from "../_shared/supabase-admin.ts";
import { getCorrelationId } from "../_shared/correlation.ts";
import { optionsResponse, ok, failFromAppError } from "../_shared/response.ts";
import { logInfo, logError } from "../_shared/logger.ts";
import { normalizeError } from "../_shared/errors.ts";

const MATERIALIZED_VIEWS = [
  "analytics.mv_executive_summary",
  "analytics.mv_customer_health",
  "analytics.mv_project_health",
  "analytics.mv_supplier_performance",
];

serve(async (req: Request) => {
  const correlationId = getCorrelationId(req);
  const admin = getAdminClient();

  if (req.method === "OPTIONS") return optionsResponse();

  try {
    const results: Record<string, string> = {};
    const startedAt = Date.now();

    // 1) Refresh all materialized views via SQL
    for (const viewName of MATERIALIZED_VIEWS) {
      try {
        await admin.rpc("refresh_all_materialized_views");
        results[viewName] = "refreshed";
        break; // single RPC refreshes all
      } catch (viewErr) {
        results[viewName] = `failed: ${String(viewErr)}`;
        logError("refresh_read_models.view_failed", {
          view_name: viewName,
          error: String(viewErr),
        });
      }
    }

    // 2) Process invalidation queue
    const { data: pending, error: queueError } = await admin
      .schema("analytics")
      .from("read_model_invalidations")
      .select("*")
      .eq("processed", false)
      .order("invalidated_at", { ascending: true })
      .limit(100);

    let invalidationsProcessed = 0;

    if (!queueError && pending && pending.length > 0) {
      const ids = pending.map((p: { id: number }) => p.id);
      await admin
        .schema("analytics")
        .from("read_model_invalidations")
        .update({
          processed: true,
          processed_at: new Date().toISOString(),
        })
        .in("id", ids);

      invalidationsProcessed = ids.length;
    }

    // 3) Run executive summary snapshot
    try {
      await admin.rpc("refresh_executive_summary_snapshot");
      results["executive_snapshot"] = "refreshed";
    } catch {
      results["executive_snapshot"] = "skipped";
    }

    // 4) Run overdue invoice check
    try {
      const { data: overdueCount } = await admin.rpc("mark_overdue_invoices");
      results["overdue_invoices"] = `marked ${overdueCount ?? 0}`;
    } catch {
      results["overdue_invoices"] = "skipped";
    }

    // 5) Run SLA breach check
    try {
      const { data: breachCount } = await admin.rpc("mark_breached_sla_timers");
      results["sla_breaches"] = `marked ${breachCount ?? 0}`;
    } catch {
      results["sla_breaches"] = "skipped";
    }

    const durationMs = Date.now() - startedAt;

    logInfo("refresh_read_models.completed", {
      correlation_id: correlationId,
      duration_ms: durationMs,
      invalidations_processed: invalidationsProcessed,
    });

    return ok({
      duration_ms: durationMs,
      views: results,
      invalidations_processed: invalidationsProcessed,
    }, correlationId);
  } catch (error) {
    return failFromAppError(normalizeError(error), correlationId);
  }
});
