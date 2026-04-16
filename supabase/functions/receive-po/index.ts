/**
 * Edge Function: receive-po
 * Receives goods against a purchase order — updates inventory,
 * PO line quantities, and PO state.
 *
 * TechnoKol Uzi ERP 2026
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { resolveAuth } from "../_shared/auth.ts";
import { requirePermission } from "../_shared/permissions.ts";
import { resolveCorrelationId } from "../_shared/correlation.ts";
import { requireValid } from "../_shared/validators.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { writeAudit } from "../_shared/audit.ts";
import { emitDomainEvent } from "../_shared/events.ts";
import { writeStateHistory } from "../_shared/state-history.ts";
import { ok, fail } from "../_shared/response.ts";
import { log } from "../_shared/logger.ts";
import { AppError, NotFoundError, InvalidStateError } from "../_shared/errors.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-correlation-id, content-type",
};

const RECEIVABLE_STATES = ["SentToSupplier", "PartiallyReceived"];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fail("METHOD_NOT_ALLOWED", "POST only", undefined, undefined, 405);

  const correlationId = resolveCorrelationId(req);

  try {
    // ── Auth ──
    const actor = await resolveAuth(req);
    await requirePermission(actor, "inventory.receive");

    // ── Validate ──
    const body = await req.json();
    requireValid(body, [
      { field: "po_id", required: true, type: "number" },
      { field: "warehouse_id", required: true, type: "number" },
      { field: "receipt_lines", required: true, type: "array" },
    ]);

    // ── Load PO ──
    const { data: po, error: poErr } = await supabaseAdmin
      .from("procurement.purchase_orders")
      .select("*")
      .eq("id", body.po_id)
      .single();

    if (poErr || !po) throw new NotFoundError(`PO#${body.po_id}`);
    if (!RECEIVABLE_STATES.includes(po.state)) {
      throw new InvalidStateError("PO", po.state, RECEIVABLE_STATES);
    }

    const previousState = po.state;
    const receiptLines: { line_id: number; quantity_received: number; material_id: number }[] = body.receipt_lines;

    // ── Insert inventory receipts + update PO lines ──
    for (const line of receiptLines) {
      // Insert receipt
      await supabaseAdmin.from("inventory.inventory_receipts").insert({
        po_id: body.po_id,
        po_line_id: line.line_id,
        material_id: line.material_id,
        warehouse_id: body.warehouse_id,
        quantity_received: line.quantity_received,
        received_by_user_id: actor.profileId,
      });

      // Update inventory balance (upsert on material + warehouse)
      const { data: existingInv } = await supabaseAdmin
        .from("inventory.inventory")
        .select("id, quantity_on_hand")
        .eq("material_id", line.material_id)
        .eq("warehouse_id", body.warehouse_id)
        .maybeSingle();
      if (existingInv) {
        await supabaseAdmin.from("inventory.inventory")
          .update({ quantity_on_hand: Number(existingInv.quantity_on_hand) + line.quantity_received, updated_at: new Date().toISOString() })
          .eq("id", existingInv.id);
      } else {
        await supabaseAdmin.from("inventory.inventory")
          .insert({ material_id: line.material_id, warehouse_id: body.warehouse_id, quantity_on_hand: line.quantity_received });
      }

      // Update PO line received qty directly
      const { data: existingLine } = await supabaseAdmin
        .from("procurement.purchase_order_lines")
        .select("quantity_received")
        .eq("id", line.line_id)
        .single();
      const newQtyReceived = (Number(existingLine?.quantity_received ?? 0)) + line.quantity_received;
      await supabaseAdmin
        .from("procurement.purchase_order_lines")
        .update({ quantity_received: newQtyReceived, quantity_open: Math.max(0, (Number(existingLine?.quantity_received ?? 0)) - newQtyReceived) })
        .eq("id", line.line_id);
    }

    // ── Determine new PO state ──
    const { data: poLines } = await supabaseAdmin
      .from("procurement.purchase_order_lines")
      .select("quantity_ordered, quantity_received")
      .eq("po_id", body.po_id);

    const allFullyReceived = (poLines ?? []).every(
      (l: { quantity_ordered: number; quantity_received: number }) =>
        l.quantity_received >= l.quantity_ordered
    );

    const newState = allFullyReceived ? "FullyReceived" : "PartiallyReceived";

    // ── Update PO state ──
    await supabaseAdmin
      .from("procurement.purchase_orders")
      .update({
        state: newState,
        receiving_status: allFullyReceived ? "fully_received" : "partially_received",
        updated_at: new Date().toISOString(),
      })
      .eq("id", body.po_id);

    // ── State History (if state changed) ──
    if (newState !== previousState) {
      await writeStateHistory({
        entityType: "PurchaseOrder",
        entityId: body.po_id,
        fromState: previousState,
        toState: newState,
        changedByUserId: actor.profileId ?? undefined,
        reason: `Received ${receiptLines.length} line(s)`,
        correlationId,
      });
    }

    // ── Audit ──
    await writeAudit({
      entityType: "PurchaseOrder",
      entityId: body.po_id,
      actionName: "po.receive",
      sourceService: "PROCUREMENT",
      sourceModule: "purchase_orders",
      oldValues: { state: previousState },
      newValues: { state: newState, lines_received: receiptLines.length },
      performedByUserId: actor.profileId ?? undefined,
      correlationId,
    });

    // ── Domain Events ──
    await emitDomainEvent({
      eventName: "inventory.received_from_po",
      topicName: "inventory.stock",
      sourceService: "PROCUREMENT",
      sourceModule: "purchase_orders",
      entityType: "PurchaseOrder",
      entityId: body.po_id,
      payload: {
        po_id: body.po_id,
        warehouse_id: body.warehouse_id,
        lines_count: receiptLines.length,
        total_qty: receiptLines.reduce((s, l) => s + l.quantity_received, 0),
      },
      correlationId,
      actorType: "user",
      actorId: actor.profileId ?? undefined,
    });

    await emitDomainEvent({
      eventName: allFullyReceived ? "po.fully_received" : "po.partially_received",
      topicName: "procurement.po",
      sourceService: "PROCUREMENT",
      sourceModule: "purchase_orders",
      entityType: "PurchaseOrder",
      entityId: body.po_id,
      payload: {
        po_id: body.po_id,
        receiving_status: allFullyReceived ? "fully_received" : "partially_received",
        received_lines_count: receiptLines.length,
      },
      correlationId,
      actorType: "user",
      actorId: actor.profileId ?? undefined,
    });

    log("info", "PO received", { poId: body.po_id, newState, correlationId });

    return ok(
      { po_id: body.po_id, state: newState, lines_received: receiptLines.length },
      correlationId
    );
  } catch (e) {
    const err = e as AppError;
    log("error", err.message, { correlationId });
    return fail(
      err.message.split(":")[0] || "INTERNAL_ERROR",
      err.message,
      correlationId,
      undefined,
      err.status || 500
    );
  }
});
