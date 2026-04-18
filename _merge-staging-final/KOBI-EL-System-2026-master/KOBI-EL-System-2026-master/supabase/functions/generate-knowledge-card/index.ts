import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getAdminClient } from "../_shared/supabase-admin.ts";
import { requireInternalUser } from "../_shared/auth.ts";
import { getCorrelationId } from "../_shared/correlation.ts";
import { optionsResponse, ok, failFromAppError } from "../_shared/response.ts";
import { normalizeError, NotFoundError } from "../_shared/errors.ts";

function buildCardNumber() {
  const year = new Date().getUTCFullYear();
  const rand = crypto.randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase();
  return `KC-${year}-${rand}`;
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

    const { data: extractionRun } = await admin
      .schema("documents").from("extraction_runs").select("*")
      .eq("document_id", documentId).order("created_at", { ascending: false }).limit(1).maybeSingle();

    const { data: classificationRun } = await admin
      .schema("documents").from("classification_runs").select("*")
      .eq("document_id", documentId).order("created_at", { ascending: false }).limit(1).maybeSingle();

    const summaryText = [
      `Document: ${document.filename}`,
      `Type: ${classificationRun?.predicted_class || document.document_type || "unknown"}`,
      `Document Number: ${document.document_number}`,
      `Extraction Status: ${extractionRun?.state || "unknown"}`,
    ].join(" | ");

    const { data: card, error: cardError } = await admin
      .schema("documents").from("knowledge_cards")
      .insert({
        card_number: buildCardNumber(),
        document_id: documentId,
        title: document.filename || "Knowledge Card",
        summary_text: summaryText,
        tags: [document.document_type || "general"],
        classification: classificationRun?.predicted_class || document.document_type || "general_document",
        confidence_score: classificationRun?.confidence_score || 0.75,
        published: true,
      })
      .select("*").single();

    if (cardError || !card) throw cardError ?? new Error("KNOWLEDGE_CARD_CREATE_FAILED");
    return ok(card, correlationId);
  } catch (error) {
    return failFromAppError(normalizeError(error), correlationId);
  }
});
