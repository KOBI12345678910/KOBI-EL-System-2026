/**
 * Edge Function: get-employee-360
 * Returns the full employee 360 view via secure RPC.
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
    const employeeId = Number(url.searchParams.get("employee_id") ?? (req.method === "POST" ? (await req.json()).employee_id : null));
    if (!employeeId) throw new AppError("VALIDATION_ERROR: employee_id is required");

    await requireEntityReadScope(actor, "Employee", employeeId);

    const { data, error } = await supabaseAdmin.rpc("workforce_get_employee_360", { p_employee_id: employeeId });
    if (error) throw new AppError(`DB_ERROR: ${error.message}`, 500);

    log("info", "employee 360 loaded", { employeeId, correlationId });
    return ok(data, correlationId);
  } catch (e) {
    const err = e as AppError;
    log("error", err.message, { correlationId });
    return fail(err.message.split(":")[0] || "INTERNAL_ERROR", err.message, correlationId, undefined, err.status || 500);
  }
});
