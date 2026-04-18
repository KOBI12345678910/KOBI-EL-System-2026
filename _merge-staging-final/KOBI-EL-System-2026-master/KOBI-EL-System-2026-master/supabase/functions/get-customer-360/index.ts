/**
 * Edge Function: get-customer-360
 * Returns the full customer 360 view via secure RPC.
 * TechnoKol Uzi ERP 2026
 */
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { resolveAuth } from "../_shared/auth.ts";
import { requireEntityReadScope } from "../_shared/permissions.ts";
import { resolveCorrelationId } from "../_shared/correlation.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { ok, fail } from "../_shared/response.ts";
import { log } from "../_shared/logger.ts";
import { AppError } from "../_shared/errors.ts";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-correlation-id, content-type" };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const correlationId = resolveCorrelationId(req);
  try {
    const actor = await resolveAuth(req);
    const url = new URL(req.url);
    const customerId = Number(url.searchParams.get("customer_id") ?? (req.method === "POST" ? (await req.json()).customer_id : null));
    if (!customerId) throw new AppError("VALIDATION_ERROR: customer_id is required");

    await requireEntityReadScope(actor, "Customer", customerId);

    const { data, error } = await supabaseAdmin.rpc("commercial_get_customer_360", { p_customer_id: customerId });
    if (error) throw new AppError(`DB_ERROR: ${error.message}`, 500);

    log("info", "customer 360 loaded", { customerId, correlationId });
    return ok(data, correlationId);
  } catch (e) {
    const err = e as AppError;
    log("error", err.message, { correlationId });
    return fail(err.message.split(":")[0] || "INTERNAL_ERROR", err.message, correlationId, undefined, err.status || 500);
  }
});
