import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getAdminClient } from "../_shared/supabase-admin.ts";
import { requireInternalUser } from "../_shared/auth.ts";
import { getCorrelationId } from "../_shared/correlation.ts";
import { optionsResponse, ok, failFromAppError } from "../_shared/response.ts";
import { normalizeError, ConflictError } from "../_shared/errors.ts";

serve(async (req: Request) => {
  const correlationId = getCorrelationId(req);
  const admin = getAdminClient();
  if (req.method === "OPTIONS") return optionsResponse();

  try {
    if (req.method !== "POST") throw new Error("METHOD_NOT_ALLOWED");
    await requireInternalUser(req, admin);

    const body = await req.json();

    const id = body.id ? Number(body.id) : null;
    const kpiCode = String(body.kpi_code || "").trim();
    const kpiName = String(body.kpi_name || "").trim();

    if (!kpiCode || !kpiName) {
      throw new ConflictError("kpi_code and kpi_name are required");
    }

    if (id) {
      const { data, error } = await admin
        .schema("intelligence")
        .from("kpi_definitions")
        .update({
          kpi_code: kpiCode,
          kpi_name: kpiName,
          category: body.category || null,
          formula_type: body.formula_type || "sql_scalar",
          source_ref: body.source_ref || null,
          formula_payload: body.formula_payload ?? {},
          unit_label: body.unit_label || null,
          lower_threshold: body.lower_threshold ?? null,
          upper_threshold: body.upper_threshold ?? null,
          active: body.active ?? true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select("*")
        .single();

      if (error || !data) throw error ?? new Error("KPI_DEFINITION_UPDATE_FAILED");
      return ok(data, correlationId);
    }

    const { data, error } = await admin
      .schema("intelligence")
      .from("kpi_definitions")
      .insert({
        kpi_code: kpiCode,
        kpi_name: kpiName,
        category: body.category || null,
        formula_type: body.formula_type || "sql_scalar",
        source_ref: body.source_ref || null,
        formula_payload: body.formula_payload ?? {},
        unit_label: body.unit_label || null,
        lower_threshold: body.lower_threshold ?? null,
        upper_threshold: body.upper_threshold ?? null,
        active: body.active ?? true,
      })
      .select("*")
      .single();

    if (error || !data) throw error ?? new Error("KPI_DEFINITION_CREATE_FAILED");
    return ok(data, correlationId);
  } catch (error) {
    return failFromAppError(normalizeError(error), correlationId);
  }
});
