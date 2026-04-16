// ============================================================
// FILE: supabase/functions/create-customer/index.ts
// ============================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { requireInternalUser } from "../_shared/auth.ts";
import { requirePermission } from "../_shared/permissions.ts";
import { getCorrelationId } from "../_shared/correlation.ts";
import { optionsResponse, ok, failFromAppError } from "../_shared/response.ts";
import { logInfo, logError } from "../_shared/logger.ts";
import { writeAudit } from "../_shared/audit.ts";
import { writeDomainEvent } from "../_shared/events.ts";
import { getAdminClient } from "../_shared/supabase-admin.ts";
import { requireString, optionalString, optionalNumber } from "../_shared/validators.ts";
import { normalizeError, ConflictError } from "../_shared/errors.ts";

type CreateCustomerDto = {
  legal_name: string;
  display_name: string;
  customer_type?: string | null;
  tax_id?: string | null;
  phone?: string | null;
  email?: string | null;
  address_line_1?: string | null;
  city?: string | null;
  region?: string | null;
  postal_code?: string | null;
  country?: string | null;
  billing_contact_name?: string | null;
  billing_contact_phone?: string | null;
  billing_contact_email?: string | null;
  credit_limit?: number | null;
  preferred_currency?: string | null;
  internal_notes?: string | null;
};

function parseDto(body: unknown): CreateCustomerDto {
  const b = body as Record<string, unknown>;

  return {
    legal_name: requireString(b.legal_name, "legal_name"),
    display_name: requireString(b.display_name, "display_name"),
    customer_type: optionalString(b.customer_type),
    tax_id: optionalString(b.tax_id),
    phone: optionalString(b.phone),
    email: optionalString(b.email),
    address_line_1: optionalString(b.address_line_1),
    city: optionalString(b.city),
    region: optionalString(b.region),
    postal_code: optionalString(b.postal_code),
    country: optionalString(b.country),
    billing_contact_name: optionalString(b.billing_contact_name),
    billing_contact_phone: optionalString(b.billing_contact_phone),
    billing_contact_email: optionalString(b.billing_contact_email),
    credit_limit: optionalNumber(b.credit_limit),
    preferred_currency: optionalString(b.preferred_currency),
    internal_notes: optionalString(b.internal_notes),
  };
}

function buildCustomerNumber(): string {
  const year = new Date().getUTCFullYear();
  const rand = crypto.randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase();
  return `CUST-${year}-${rand}`;
}

serve(async (req: Request) => {
  const correlationId = getCorrelationId(req);
  const admin = getAdminClient();

  if (req.method === "OPTIONS") {
    return optionsResponse();
  }

  try {
    if (req.method !== "POST") {
      throw normalizeError(new Error("METHOD_NOT_ALLOWED"));
    }

    const actor = await requireInternalUser(req, admin);
    await requirePermission(actor, "customers.create", admin);

    const body = await req.json();
    const dto = parseDto(body);

    logInfo("create_customer.started", {
      correlation_id: correlationId,
      actor_user_profile_id: actor.userProfileId,
    });

    if (dto.tax_id) {
      const { data: existingByTaxId, error: existingByTaxIdError } = await admin
        .schema("commercial")
        .from("customers")
        .select("id, customer_number, legal_name")
        .eq("tax_id", dto.tax_id)
        .is("deleted_at", null)
        .limit(1);

      if (existingByTaxIdError) {
        throw existingByTaxIdError;
      }

      if (existingByTaxId && existingByTaxId.length > 0) {
        throw new ConflictError("Customer with this tax_id already exists", {
          existing_customer: existingByTaxId[0],
        });
      }
    }

    const customerNumber = buildCustomerNumber();

    const insertPayload = {
      customer_number: customerNumber,
      legal_name: dto.legal_name,
      display_name: dto.display_name,
      customer_type: dto.customer_type,
      tax_id: dto.tax_id,
      phone: dto.phone,
      email: dto.email,
      address_line_1: dto.address_line_1,
      city: dto.city,
      region: dto.region,
      postal_code: dto.postal_code,
      country: dto.country,
      billing_contact_name: dto.billing_contact_name,
      billing_contact_phone: dto.billing_contact_phone,
      billing_contact_email: dto.billing_contact_email,
      account_manager_user_id: actor.userProfileId,
      status: "active",
      credit_limit: dto.credit_limit ?? 0,
      current_balance: 0,
      preferred_currency: dto.preferred_currency ?? "ILS",
      risk_level: "normal",
      internal_notes: dto.internal_notes,
      created_by: actor.userProfileId,
      updated_by: actor.userProfileId,
    };

    const { data: createdCustomer, error: createError } = await admin
      .schema("commercial")
      .from("customers")
      .insert(insertPayload)
      .select(`
        id,
        public_id,
        customer_number,
        legal_name,
        display_name,
        status,
        preferred_currency,
        created_at
      `)
      .single();

    if (createError || !createdCustomer) {
      throw createError ?? new Error("Failed to create customer");
    }

    await writeAudit(admin, {
      entityType: "Customer",
      entityId: createdCustomer.id,
      actionName: "customer.create",
      oldValues: null,
      newValues: createdCustomer,
      sourceService: "ONYX_PROCUREMENT",
      sourceModule: "customers",
      sourcePage: "CustomerCreate",
      performedByUserId: actor.userProfileId,
      correlationId,
    });

    await writeDomainEvent(admin, {
      eventName: "customer.created",
      topicName: "commercial.customers",
      sourceService: "ONYX_PROCUREMENT",
      sourceModule: "customers",
      entityType: "Customer",
      entityId: createdCustomer.id,
      partitionKey: `Customer:${createdCustomer.id}`,
      correlationId,
      causationId: null,
      actorType: "user",
      actorId: actor.userProfileId,
      payload: {
        customer_id: createdCustomer.id,
        public_id: createdCustomer.public_id,
        customer_number: createdCustomer.customer_number,
        legal_name: createdCustomer.legal_name,
        display_name: createdCustomer.display_name,
        status: createdCustomer.status,
        preferred_currency: createdCustomer.preferred_currency,
      },
      metadata: {
        source: "edge_function",
      },
    });

    logInfo("create_customer.succeeded", {
      correlation_id: correlationId,
      customer_id: createdCustomer.id,
      customer_number: createdCustomer.customer_number,
    });

    return ok(createdCustomer, correlationId, 201);
  } catch (error) {
    const normalized = normalizeError(error);

    logError("create_customer.failed", {
      correlation_id: correlationId,
      code: normalized.code,
      message: normalized.message,
      details: normalized.details as Record<string, unknown> | undefined,
    });

    return failFromAppError(normalized, correlationId);
  }
});
