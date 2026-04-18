// ============================================================
// FILE: supabase/functions/register-payment/index.ts
// ============================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getAdminClient } from "../_shared/supabase-admin.ts";
import { requireInternalUser } from "../_shared/auth.ts";
import { requirePermission } from "../_shared/permissions.ts";
import { getCorrelationId } from "../_shared/correlation.ts";
import { optionsResponse, ok, failFromAppError } from "../_shared/response.ts";
import { writeAudit } from "../_shared/audit.ts";
import { writeDomainEvent } from "../_shared/events.ts";
import { requirePositiveNumber, requireDateString, optionalString } from "../_shared/validators.ts";
import { normalizeError, NotFoundError, ConflictError } from "../_shared/errors.ts";

function buildPaymentNumber(): string {
  const year = new Date().getUTCFullYear();
  const rand = crypto.randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase();
  return `PAY-${year}-${rand}`;
}

serve(async (req: Request) => {
  const correlationId = getCorrelationId(req);
  const admin = getAdminClient();

  if (req.method === "OPTIONS") return optionsResponse();

  try {
    if (req.method !== "POST") throw new Error("METHOD_NOT_ALLOWED");

    const actor = await requireInternalUser(req, admin);
    await requirePermission(actor, "payments.create", admin);

    const body = await req.json();
    const invoiceId = Number(body.invoice_id);

    const { data: invoice, error: invoiceError } = await admin
      .schema("finance")
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .single();

    if (invoiceError || !invoice) throw new NotFoundError("Invoice not found");

    const amount = requirePositiveNumber(body.amount, "amount");

    if (amount > Number(invoice.balance_due)) {
      throw new ConflictError("Payment exceeds remaining balance", {
        balance_due: invoice.balance_due,
        attempted_amount: amount,
      });
    }

    const { data: payment, error: paymentError } = await admin
      .schema("finance")
      .from("payments")
      .insert({
        payment_number: buildPaymentNumber(),
        invoice_id: invoiceId,
        customer_id: invoice.customer_id,
        payment_date: requireDateString(body.payment_date, "payment_date"),
        payment_method: optionalString(body.payment_method),
        amount,
        currency: invoice.currency,
        bank_match_status: "unmatched",
        gl_status: "pending",
        state: "Posted",
        reference_number: optionalString(body.reference_number),
        notes: optionalString(body.notes),
        created_by: actor.userProfileId,
        updated_by: actor.userProfileId,
      })
      .select("*")
      .single();

    if (paymentError || !payment) throw paymentError ?? new Error("PAYMENT_CREATE_FAILED");

    const newPaidTotal = Number(invoice.paid_total) + amount;
    const newBalanceDue = Number(invoice.grand_total) - newPaidTotal;
    const newState = newBalanceDue <= 0 ? "Paid" : "PartiallyPaid";

    const { error: invoiceUpdateError } = await admin
      .schema("finance")
      .from("invoices")
      .update({
        paid_total: newPaidTotal,
        balance_due: newBalanceDue,
        state: newState,
        updated_by: actor.userProfileId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoiceId);

    if (invoiceUpdateError) throw invoiceUpdateError;

    await writeAudit(admin, {
      entityType: "Payment",
      entityId: payment.id,
      actionName: "payment.register",
      oldValues: null,
      newValues: payment,
      sourceService: "ONYX_PROCUREMENT",
      sourceModule: "payments",
      sourcePage: "Finance360",
      performedByUserId: actor.userProfileId,
      correlationId,
    });

    await writeDomainEvent(admin, {
      eventName: "payment.registered",
      topicName: "finance.payments",
      sourceService: "ONYX_PROCUREMENT",
      sourceModule: "payments",
      entityType: "Payment",
      entityId: payment.id,
      partitionKey: `Payment:${payment.id}`,
      correlationId,
      causationId: null,
      actorType: "user",
      actorId: actor.userProfileId,
      payload: {
        payment_id: payment.id,
        payment_number: payment.payment_number,
        invoice_id: payment.invoice_id,
        amount: payment.amount,
        payment_date: payment.payment_date,
        state: payment.state,
      },
      metadata: null,
    });

    return ok({
      payment,
      invoice_state: newState,
      balance_due: newBalanceDue,
    }, correlationId, 201);
  } catch (error) {
    return failFromAppError(normalizeError(error), correlationId);
  }
});
