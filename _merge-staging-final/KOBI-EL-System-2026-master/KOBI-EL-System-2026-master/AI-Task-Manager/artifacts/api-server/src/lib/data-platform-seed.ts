/**
 * BASH44 Data Platform Core — Seed Data
 *
 * Registers demo schemas, demo connectors, and simulates ongoing ingestion.
 */

import { dataPlatform, type RawRecord } from "./data-platform-core";

let seeded = false;

export function seedDataPlatform() {
  if (seeded) return;
  seeded = true;

  registerDemoSchemas();
  bootstrapInitialData();
  startIngestionSimulator();
}

function registerDemoSchemas() {
  // Supplier event schema
  dataPlatform.schemaRegistry.register({
    schemaId: "schema_supplier_event_v1",
    name: "supplier_event",
    version: "1.0",
    fields: [
      { name: "entity_type", fieldType: "string", nullable: false },
      { name: "canonical_external_key", fieldType: "string", nullable: false },
      { name: "name", fieldType: "string", nullable: false },
      { name: "event_type", fieldType: "string", nullable: false },
      { name: "delay_days", fieldType: "number", nullable: true },
      { name: "reliability_score", fieldType: "number", nullable: true },
    ],
    primaryKey: "canonical_external_key",
    compatibilityMode: "backward",
  });

  // Customer event schema
  dataPlatform.schemaRegistry.register({
    schemaId: "schema_customer_event_v1",
    name: "customer_event",
    version: "1.0",
    fields: [
      { name: "entity_type", fieldType: "string", nullable: false },
      { name: "canonical_external_key", fieldType: "string", nullable: false },
      { name: "name", fieldType: "string", nullable: false },
      { name: "email", fieldType: "string", nullable: true, semanticType: "email" },
      { name: "vat_number", fieldType: "string", nullable: true },
      { name: "tier", fieldType: "string", nullable: true },
      { name: "event_type", fieldType: "string", nullable: false },
    ],
    primaryKey: "canonical_external_key",
    compatibilityMode: "backward",
  });

  // Order event schema
  dataPlatform.schemaRegistry.register({
    schemaId: "schema_order_event_v1",
    name: "order_event",
    version: "1.0",
    fields: [
      { name: "entity_type", fieldType: "string", nullable: false },
      { name: "canonical_external_key", fieldType: "string", nullable: false },
      { name: "customer_id", fieldType: "string", nullable: false },
      { name: "total_amount", fieldType: "number", nullable: false, semanticType: "money" },
      { name: "status", fieldType: "string", nullable: false },
      { name: "event_type", fieldType: "string", nullable: false },
    ],
    primaryKey: "canonical_external_key",
    compatibilityMode: "backward",
  });

  // Inventory event schema
  dataPlatform.schemaRegistry.register({
    schemaId: "schema_inventory_event_v1",
    name: "inventory_event",
    version: "1.0",
    fields: [
      { name: "entity_type", fieldType: "string", nullable: false },
      { name: "canonical_external_key", fieldType: "string", nullable: false },
      { name: "sku", fieldType: "string", nullable: false },
      { name: "qty", fieldType: "number", nullable: false },
      { name: "reorder_point", fieldType: "number", nullable: true },
      { name: "event_type", fieldType: "string", nullable: false },
    ],
    primaryKey: "canonical_external_key",
    compatibilityMode: "backward",
  });

  // Production event schema
  dataPlatform.schemaRegistry.register({
    schemaId: "schema_production_event_v1",
    name: "production_event",
    version: "1.0",
    fields: [
      { name: "entity_type", fieldType: "string", nullable: false },
      { name: "canonical_external_key", fieldType: "string", nullable: false },
      { name: "line_id", fieldType: "string", nullable: false },
      { name: "oee", fieldType: "number", nullable: true, semanticType: "percent" },
      { name: "status", fieldType: "string", nullable: false },
      { name: "event_type", fieldType: "string", nullable: false },
    ],
    primaryKey: "canonical_external_key",
    compatibilityMode: "backward",
  });

  // Payment event schema
  dataPlatform.schemaRegistry.register({
    schemaId: "schema_payment_event_v1",
    name: "payment_event",
    version: "1.0",
    fields: [
      { name: "entity_type", fieldType: "string", nullable: false },
      { name: "canonical_external_key", fieldType: "string", nullable: false },
      { name: "invoice_id", fieldType: "string", nullable: false },
      { name: "amount", fieldType: "number", nullable: false, semanticType: "money" },
      { name: "event_type", fieldType: "string", nullable: false },
    ],
    primaryKey: "canonical_external_key",
    compatibilityMode: "backward",
  });
}

function bootstrapInitialData() {
  const tenantId = "tenant_techno";
  const now = Date.now();

  const initialRecords: Array<{
    schemaName: string;
    sourceId: string;
    payload: Record<string, unknown>;
    offsetMs: number;
  }> = [
    {
      schemaName: "customer_event", sourceId: "src_crm", offsetMs: -600_000,
      payload: {
        entity_type: "Customer",
        canonical_external_key: "CUST-001",
        name: "אלקו בע״מ",
        email: "contact@elco.co.il",
        vat_number: "514123456",
        tier: "gold",
        event_type: "customer_created",
      },
    },
    {
      schemaName: "customer_event", sourceId: "src_erp", offsetMs: -590_000,
      payload: {
        entity_type: "Customer",
        canonical_external_key: "CUST-001",
        name: "Elco Ltd",
        email: "contact@elco.co.il",
        vat_number: "514123456",
        event_type: "customer_updated",
      },
    },
    {
      schemaName: "order_event", sourceId: "src_erp", offsetMs: -540_000,
      payload: {
        entity_type: "Order",
        canonical_external_key: "ORD-4400",
        customer_id: "CUST-001",
        total_amount: 125000,
        status: "confirmed",
        event_type: "order_created",
      },
    },
    {
      schemaName: "supplier_event", sourceId: "src_supplier_api", offsetMs: -480_000,
      payload: {
        entity_type: "Supplier",
        canonical_external_key: "SUPP-101",
        name: "Hydro Aluminium",
        reliability_score: 0.74,
        delay_days: 5,
        event_type: "supplier_delayed",
        status: "at_risk",
      },
    },
    {
      schemaName: "inventory_event", sourceId: "src_wms", offsetMs: -420_000,
      payload: {
        entity_type: "StockItem",
        canonical_external_key: "SKU-5500",
        sku: "SKU-5500",
        qty: 12,
        reorder_point: 50,
        event_type: "inventory_below_threshold",
      },
    },
    {
      schemaName: "inventory_event", sourceId: "src_wms", offsetMs: -360_000,
      payload: {
        entity_type: "StockItem",
        canonical_external_key: "SKU-5502",
        sku: "SKU-5502",
        qty: 3,
        reorder_point: 20,
        event_type: "stock.critical",
      },
    },
    {
      schemaName: "production_event", sourceId: "src_mes", offsetMs: -300_000,
      payload: {
        entity_type: "ProductionLine",
        canonical_external_key: "LINE-A",
        line_id: "LINE-A",
        oee: 82,
        status: "running",
        event_type: "production_heartbeat",
      },
    },
    {
      schemaName: "payment_event", sourceId: "src_stripe", offsetMs: -240_000,
      payload: {
        entity_type: "Payment",
        canonical_external_key: "PAY-7701",
        invoice_id: "INV-3030",
        amount: 125000,
        event_type: "payment_received",
      },
    },
    {
      schemaName: "order_event", sourceId: "src_erp", offsetMs: -180_000,
      payload: {
        entity_type: "Order",
        canonical_external_key: "ORD-4401",
        customer_id: "CUST-002",
        total_amount: 85000,
        status: "in_progress",
        event_type: "order_status_changed",
      },
    },
  ];

  const records: RawRecord[] = initialRecords.map((r, i) => ({
    recordId: `raw_${Date.now()}_${i}`,
    tenantId,
    sourceId: r.sourceId,
    sourceRecordId: `src_rec_${i}`,
    schemaName: r.schemaName,
    schemaVersion: "1.0",
    payload: r.payload,
    ingestedAt: new Date(now + r.offsetMs),
    correlationId: `corr_${i}`,
  }));

  dataPlatform.ingestBatch("bootstrap_pipeline", records);

  // Also add some malformed records to quarantine
  const badRecord: RawRecord = {
    recordId: `raw_bad_${Date.now()}`,
    tenantId,
    sourceId: "src_excel",
    sourceRecordId: "excel_row_99",
    schemaName: "customer_event",
    schemaVersion: "1.0",
    payload: {
      // Missing required fields: entity_type, canonical_external_key, name, event_type
      email: "broken@example.com",
    },
    ingestedAt: new Date(),
  };
  dataPlatform.ingestBatch("bootstrap_pipeline", [badRecord]);
}

function startIngestionSimulator() {
  let tick = 0;
  const sources = ["src_erp", "src_crm", "src_mes", "src_wms", "src_stripe", "src_supplier_api"];
  const schemas = ["customer_event", "order_event", "inventory_event", "production_event", "payment_event", "supplier_event"];

  setInterval(() => {
    tick++;
    const source = sources[tick % sources.length]!;
    const schemaName = schemas[tick % schemas.length]!;

    const record: RawRecord = {
      recordId: `raw_live_${Date.now()}_${tick}`,
      tenantId: "tenant_techno",
      sourceId: source,
      sourceRecordId: `live_${tick}`,
      schemaName,
      schemaVersion: "1.0",
      payload: buildPayload(schemaName, tick),
      ingestedAt: new Date(),
      correlationId: `corr_live_${tick}`,
    };
    dataPlatform.ingestBatch("live_pipeline", [record]).catch(() => {});
  }, 18_000).unref?.();
}

function buildPayload(schemaName: string, tick: number): Record<string, unknown> {
  switch (schemaName) {
    case "customer_event":
      return {
        entity_type: "Customer",
        canonical_external_key: `CUST-LIVE-${tick % 20}`,
        name: `לקוח חי ${tick}`,
        email: `live${tick}@demo.co.il`,
        event_type: "customer_touched",
      };
    case "order_event":
      return {
        entity_type: "Order",
        canonical_external_key: `ORD-LIVE-${tick}`,
        customer_id: `CUST-LIVE-${tick % 20}`,
        total_amount: Math.floor(Math.random() * 200000) + 10000,
        status: "confirmed",
        event_type: "order_created",
      };
    case "inventory_event":
      return {
        entity_type: "StockItem",
        canonical_external_key: `SKU-LIVE-${tick % 10}`,
        sku: `SKU-LIVE-${tick % 10}`,
        qty: Math.floor(Math.random() * 100),
        reorder_point: 30,
        event_type: Math.random() < 0.2 ? "inventory_below_threshold" : "stock_checked",
      };
    case "production_event":
      return {
        entity_type: "ProductionLine",
        canonical_external_key: `LINE-${tick % 3}`,
        line_id: `LINE-${tick % 3}`,
        oee: 70 + Math.random() * 25,
        status: "running",
        event_type: "production_heartbeat",
      };
    case "payment_event":
      return {
        entity_type: "Payment",
        canonical_external_key: `PAY-LIVE-${tick}`,
        invoice_id: `INV-${tick}`,
        amount: Math.floor(Math.random() * 80000) + 5000,
        event_type: "payment_received",
      };
    case "supplier_event":
      return {
        entity_type: "Supplier",
        canonical_external_key: `SUPP-${tick % 5}`,
        name: `ספק ${tick % 5}`,
        reliability_score: Math.random(),
        event_type: Math.random() < 0.3 ? "supplier_delayed" : "supplier_heartbeat",
      };
    default:
      return {};
  }
}
