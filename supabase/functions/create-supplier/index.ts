// ============================================================
// FILE: supabase/functions/create-supplier/index.ts
// ============================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getAdminClient } from "../_shared/supabase-admin.ts";
import { requireInternalUser } from "../_shared/auth.ts";
import { requirePermission } from "../_shared/permissions.ts";
import { getCorrelationId } from "../_shared/correlation.ts";
import { optionsResponse, ok, failFromAppError } from "../_shared/response.ts";
import { logInfo, logError } from "../_shared/logger.ts";
import { writeAudit } from "../_shared/audit.ts";
import { writeDomainEvent } from "../_shared/events.ts";
import { requireString, optionalString, optionalNumber } from "../_shared/validators.ts";
import { normalizeError, ConflictError } from "../_shared/errors.ts";

function buildSupplierNumber(): string {
  const year = new Date().getUTCFullYear();
  const rand = crypto.randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase();
  return `SUPP-${year}-${rand}`;
}

serve(async (req: Request) => {
  const correlationId = getCorrelationId(req);
  const admin = getAdminClient();

  if (req.method === "OPTIONS") return optionsResponse();

  try {
    if (req.method !== "POST") throw new Error("METHOD_NOT_ALLOWED");
    const actor = await requireInternalUser(req, admin);
    await requirePermission(actor, "suppliers.create", admin);

    const body = await req.json();

    const dto = {
      legal_name: requireString(body.legal_name, "legal_name"),
      display_name: requireString(body.display_name, "display_name"),
      supplier_type: optionalString(body.supplier_type),
      tax_id: optionalString(body.tax_id),
      phone: optionalString(body.phone),
      email: optionalString(body.email),
      address_line_1: optionalString(body.address_line_1),
      city: optionalString(body.city),
      region: optionalString(body.region),
      postal_code: optionalString(body.postal_code),
      country: optionalString(body.country),
      payment_terms: optionalString(body.payment_terms),
      preferred_currency: optionalString(body.preferred_currency),
      credit_rating: optionalString(body.credit_rating),
      internal_notes: optionalString(body.internal_notes),
    };

    logInfo("create_supplier.started", {
      correlation_id: correlationId,
      actor_user_profile_id: actor.userProfileId,
    });

    // Duplicate check by tax_id
    if (dto.tax_id) {
      const { data: existing } = await admin
        .schema("procurement")
        .from("suppliers")
        .select("id, supplier_number, legal_name")
        .eq("tax_id", dto.tax_id)
        .is("deleted_at", null)
        .limit(1);

      if (existing && existing.length > 0) {
        throw new ConflictError("Supplier with this tax_id already exists", {
          existing_supplier: existing[0],
        });
      }
    }

    const { data: supplier, error } = await admin
      .schema("procurement")
      .from("suppliers")
      .insert({
        supplier_number: buildSupplierNumber(),
        legal_name: dto.legal_name,
        display_name: dto.display_name,
        supplier_type: dto.supplier_type,
        tax_id: dto.tax_id,
        phone: dto.phone,
        email: dto.email,
        address_line_1: dto.address_line_1,
        city: dto.city,
        region: dto.region,
        postal_code: dto.postal_code,
        country: dto.country,
        payment_terms: dto.payment_terms ?? "Net30",
        preferred_currency: dto.preferred_currency ?? "ILS",
        credit_rating: dto.credit_rating,
        status: "active",
        internal_notes: dto.internal_notes,
        created_by: actor.userProfileId,
        updated_by: actor.userProfileId,
      })
      .select(`
        id, public_id, supplier_number, legal_name, display_name,
        status, preferred_currency, created_at
      `)
      .single();

    if (error || !supplier) throw error ?? new Error("SUPPLIER_CREATE_FAILED");

    await writeAudit(admin, {
      entityType: "Supplier",
      entityId: supplier.id,
      actionName: "supplier.create",
      oldValues: null,
      newValues: supplier,
      sourceService: "ONYX_PROCUREMENT",
      sourceModule: "suppliers",
      sourcePage: "SupplierCreate",
      performedByUserId: actor.userProfileId,
      correlationId,
    });

    await writeDomainEvent(admin, {
      eventName: "supplier.created",
      topicName: "procurement.suppliers",
      sourceService: "ONYX_PROCUREMENT",
      sourceModule: "suppliers",
      entityType: "Supplier",
      entityId: supplier.id,
      partitionKey: `Supplier:${supplier.id}`,
      correlationId,
      causationId: null,
      actorType: "user",
      actorId: actor.userProfileId,
      payload: {
        supplier_id: supplier.id,
        public_id: supplier.public_id,
        supplier_number: supplier.supplier_number,
        legal_name: supplier.legal_name,
        display_name: supplier.display_name,
        status: supplier.status,
      },
      metadata: { source: "edge_function" },
    });

    logInfo("create_supplier.succeeded", {
      correlation_id: correlationId,
      supplier_id: supplier.id,
      supplier_number: supplier.supplier_number,
    });

    return ok(supplier, correlationId, 201);
  } catch (error) {
    const normalized = normalizeError(error);
    logError("create_supplier.failed", { correlation_id: correlationId, code: normalized.code });
    return failFromAppError(normalized, correlationId);
  }
});
