import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getAdminClient } from "../_shared/supabase-admin.ts";
import { requireInternalUser } from "../_shared/auth.ts";
import { getCorrelationId } from "../_shared/correlation.ts";
import { optionsResponse, ok, failFromAppError } from "../_shared/response.ts";
import { normalizeError, NotFoundError } from "../_shared/errors.ts";

function buildRunNumber(prefix: string) {
  const year = new Date().getUTCFullYear();
  const rand = crypto.randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase();
  return `${prefix}-${year}-${rand}`;
}

serve(async (req: Request) => {
  const correlationId = getCorrelationId(req);
  const admin = getAdminClient();
  if (req.method === "OPTIONS") return optionsResponse();

  try {
    if (req.method !== "POST") throw new Error("METHOD_NOT_ALLOWED");
    await requireInternalUser(req, admin);

    const body = await req.json();
    const documentId = Number(body.document_id);

    const { data: document, error: documentError } = await admin
      .schema("docs").from("documents").select("*").eq("id", documentId).single();
    if (documentError || !document) throw new NotFoundError("Document not found");

    const { data: run, error: runError } = await admin
      .schema("documents").from("extraction_runs")
      .insert({
        run_number: buildRunNumber("EXT"),
        document_id: documentId,
        extractor_name: "field-extractor",
        extractor_version: "1.0.0",
        state: "running",
        started_at: new Date().toISOString(),
      })
      .select("*").single();
    if (runError || !run) throw runError ?? new Error("EXTRACTION_RUN_CREATE_FAILED");

    const extractedEntities = [
      { document_id: documentId, extraction_run_id: run.id, entity_type: "document_number", entity_value: document.document_number || "UNKNOWN", normalized_value: document.document_number || "UNKNOWN", confidence_score: 0.99, page_number: 1, bbox_payload: null },
      { document_id: documentId, extraction_run_id: run.id, entity_type: "filename", entity_value: document.filename || "UNKNOWN", normalized_value: document.filename || "UNKNOWN", confidence_score: 0.98, page_number: 1, bbox_payload: null },
    ];

    const { error: entityError } = await admin.schema("documents").from("entity_extractions").insert(extractedEntities);
    if (entityError) throw entityError;

    const { error: runFinishError } = await admin
      .schema("documents").from("extraction_runs")
      .update({
        state: "completed",
        fields_payload: { document_number: document.document_number, filename: document.filename },
        confidence_payload: { document_number: 0.99, filename: 0.98 },
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", run.id);
    if (runFinishError) throw runFinishError;

    return ok(run, correlationId);
  } catch (error) {
    return failFromAppError(normalizeError(error), correlationId);
  }
});
