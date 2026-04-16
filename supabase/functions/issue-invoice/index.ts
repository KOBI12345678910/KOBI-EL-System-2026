// ============================================================
// FILE: supabase/functions/issue-invoice/index.ts
// ============================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getAdminClient } from "../_shared/supabase-admin.ts";
import { requireInternalUser } from "../_shared/auth.ts";
import { requirePermission } from "../_shared/permissions.ts";
import { getCorrelationId } from "../_shared/correlation.ts";
import { optionsResponse, ok, failFromAppError } from "../_shared/response.ts";
import { writeAudit } from "../_shared/audit.ts";
import { writeStateHistory } from "../_shared/state-history.ts";
import { writeDomainEvent } from "../_shared/events.ts";
import { normalizeError, ConflictError, NotFoundError } from "../_shared/errors.ts";

serve(async (req: Request) => {
  const correlationId = getCorrelationId(req);
  const admin = getAdminClient();

  if (req.method === "OPTIONS") return optionsResponse();

  try {
    if (req.method !== "POST") throw new Error("METHOD_NOT_ALLOWED");

    const actor = await requireInternalUser(req, admin);
    await requirePermission(actor, "invoices.issue", admin);

    const url = new URL(req.url);
    const invoiceId = Number(url.searchParams.get("invoice_id"));

    const { data: invoice, error: invoiceError } = await admin
      .schema("finance")
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .single();

    if (invoiceError || !invoice) throw new NotFoundError("Invoice not found");

    if (invoice.state !== "Draft") {
      throw new ConflictError("Invoice is not issuable", { current_state: invoice.state });
    }

    const { data: updatedInvoice, error: updateError } = await admin
      .schema("finance")
      .from("invoices")
      .update({
        state: "Issued",
        issue_date: new Date().toISOString().slice(0, 10),
        updated_by: actor.userProfileId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoiceId)
      .select("*")
      .single();

    if (updateError || !updatedInvoice) throw updateError ?? new Error("INVOICE_ISSUE_FAILED");

    await writeStateHistory(admin, {
      entityType: "Invoice",
      entityId: invoiceId,
      fromState: invoice.state,
      toState: "Issued",
      changedByUserId: actor.userProfileId,
      reason: "Invoice issued",
      correlationId,
    });

    await writeAudit(admin, {
      entityType: "Invoice",
      entityId: invoiceId,
      actionName: "invoice.issue",
      oldValues: invoice,
      newValues: updatedInvoice,
      sourceService: "ONYX_PROCUREMENT",
      sourceModule: "finance",
      sourcePage: "Finance360",
      performedByUserId: actor.userProfileId,
      correlationId,
    });

    await writeDomainEvent(admin, {
      eventName: "invoice.issued",
      topicName: "finance.invoices",
      sourceService: "ONYX_PROCUREMENT",
      sourceModule: "finance",
      entityType: "Invoice",
      entityId: invoiceId,
      partitionKey: `Invoice:${invoiceId}`,
      correlationId,
      causationId: null,
      actorType: "user",
      actorId: actor.userProfileId,
      payload: {
        invoice_id: updatedInvoice.id,
        invoice_number: updatedInvoice.invoice_number,
        customer_id: updatedInvoice.customer_id,
        project_id: updatedInvoice.project_id,
        due_date: updatedInvoice.due_date,
        balance_due: updatedInvoice.balance_due,
        state: updatedInvoice.state,
      },
      metadata: null,
    });

    return ok(updatedInvoice, correlationId);
  } catch (error) {
    return failFromAppError(normalizeError(error), correlationId);
  }
});
