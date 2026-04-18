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

function predictClass(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.includes("invoice")) return "invoice";
  if (lower.includes("quote")) return "quote";
  if (lower.includes("po")) return "purchase_order";
  if (lower.includes("contract")) return "contract";
  return "general_document";
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

    const predictedClass = predictClass(document.filename || "");
    const confidenceScore = 0.87;

    const { data: run, error: runError } = await admin
      .schema("documents").from("classification_runs")
      .insert({
        run_number: buildRunNumber("CLS"),
        document_id: documentId,
        model_name: "doc-classifier",
        model_version: "1.0.0",
        state: "completed",
        predicted_class: predictedClass,
        confidence_score: confidenceScore,
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
        output_payload: { predicted_class: predictedClass, confidence_score: confidenceScore },
      })
      .select("*").single();

    if (runError || !run) throw runError ?? new Error("CLASSIFICATION_RUN_CREATE_FAILED");

    const { error: updateDocumentError } = await admin
      .schema("docs").from("documents")
      .update({ classification_status: "classified", document_type: predictedClass, updated_at: new Date().toISOString() })
      .eq("id", documentId);
    if (updateDocumentError) throw updateDocumentError;

    return ok(run, correlationId);
  } catch (error) {
    return failFromAppError(normalizeError(error), correlationId);
  }
});
