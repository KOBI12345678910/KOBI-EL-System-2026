/**
 * BASH44 Data Fabric — Seed Data
 *
 * Registers 18 data sources across the company, canonical entities,
 * field mappings, pipelines, quality rules, lineage, and seed identity clusters.
 */

import { dataFabric, type SourceType } from "./data-fabric-engine";

let seeded = false;

export function seedDataFabric() {
  if (seeded) return;
  seeded = true;

  seedSources();
  seedCanonicalEntities();
  seedDatasets();
  seedMappings();
  seedPipelines();
  seedQualityRules();
  seedLineage();
  seedIdentityClusters();
  seedDataProducts();
  seedChangeEvents();
  startSimulator();
}

function seedSources() {
  const sources: Array<{
    key: string;
    name: string;
    type: SourceType;
    category: string;
    vendor: string;
    desc: string;
    health: number;
    sens?: "internal" | "confidential" | "pii";
  }> = [
    { key: "erp-main", name: "ERP Main DB (Postgres)", type: "postgres", category: "erp_legacy", vendor: "Internal", desc: "מסד הנתונים הראשי של ה-ERP", health: 98 },
    { key: "crm-salesforce", name: "Salesforce CRM", type: "crm", category: "crm", vendor: "Salesforce", desc: "מערכת CRM ראשית", health: 95, sens: "pii" },
    { key: "finance-priority", name: "Priority Finance", type: "erp_legacy", category: "finance", vendor: "Priority", desc: "מערכת פיננסים", health: 92, sens: "confidential" },
    { key: "production-mes", name: "MES Production", type: "postgres", category: "production", vendor: "Internal", desc: "Manufacturing Execution System", health: 88 },
    { key: "warehouse-wms", name: "Warehouse WMS", type: "mssql", category: "inventory", vendor: "SAP", desc: "Warehouse Management", health: 85 },
    { key: "iot-sensors", name: "IoT Sensors (OPC-UA)", type: "iot", category: "production", vendor: "Siemens", desc: "חיישני ייצור זרם", health: 91 },
    { key: "plc-machines", name: "PLC Machines", type: "plc", category: "production", vendor: "Allen-Bradley", desc: "Programmable Logic Controllers", health: 87 },
    { key: "supplier-api", name: "Supplier Portal API", type: "rest_api", category: "external", vendor: "Hydro Aluminium", desc: "REST API ספק ראשי", health: 93 },
    { key: "stripe-payments", name: "Stripe Payments", type: "rest_api", category: "finance", vendor: "Stripe", desc: "Payment processing", health: 99, sens: "confidential" },
    { key: "quickbooks", name: "QuickBooks", type: "rest_api", category: "finance", vendor: "Intuit", desc: "Accounting system", health: 94 },
    { key: "shipping-track", name: "Shipping Tracking API", type: "rest_api", category: "external", vendor: "FedEx", desc: "Delivery tracking webhooks", health: 96 },
    { key: "customer-excel", name: "Customer Spreadsheets", type: "spreadsheet", category: "crm", vendor: "Excel", desc: "קבצי Excel היסטוריים", health: 70 },
    { key: "quotes-drop", name: "Quotes File Drop", type: "file_drop", category: "sales", vendor: "SFTP", desc: "קבצי הצעות נכנסים", health: 82 },
    { key: "kafka-events", name: "Kafka Event Bus", type: "kafka", category: "external", vendor: "Confluent", desc: "Cross-system event streaming", health: 97 },
    { key: "webhook-ingest", name: "Webhook Ingest", type: "webhook", category: "external", vendor: "Internal", desc: "Incoming webhooks", health: 100 },
    { key: "hr-bamboohr", name: "BambooHR", type: "rest_api", category: "hr", vendor: "BambooHR", desc: "Employee records", health: 96, sens: "pii" },
    { key: "docs-sharepoint", name: "SharePoint Documents", type: "rest_api", category: "external", vendor: "Microsoft", desc: "Document metadata", health: 90 },
    { key: "support-zendesk", name: "Zendesk Support", type: "rest_api", category: "external", vendor: "Zendesk", desc: "Service tickets", health: 93 },
  ];

  for (const s of sources) {
    dataFabric.connectors.register({
      sourceKey: s.key,
      name: s.name,
      description: s.desc,
      sourceType: s.type,
      category: s.category,
      vendor: s.vendor,
      status: "active",
      healthScore: s.health,
      sensitivityLevel: s.sens ?? "internal",
      lastSyncAt: new Date(Date.now() - Math.random() * 600_000),
      tags: [s.category, s.vendor.toLowerCase()],
    });
  }
}

function seedCanonicalEntities() {
  const entities: Array<{
    key: string; name: string; plural: string; domain: string;
    fields: Array<{ name: string; type: string; required?: boolean; semantic?: string }>;
    primary: string; identity: string[]; ontology?: string;
  }> = [
    {
      key: "customer", name: "Customer", plural: "Customers", domain: "crm",
      fields: [
        { name: "canonical_customer_id", type: "string", required: true, semantic: "id" },
        { name: "name", type: "string", required: true },
        { name: "email", type: "string", semantic: "email" },
        { name: "phone", type: "string", semantic: "phone" },
        { name: "vat_number", type: "string" },
        { name: "country", type: "string" },
        { name: "tier", type: "enum" },
        { name: "annual_revenue", type: "decimal", semantic: "money" },
      ],
      primary: "canonical_customer_id",
      identity: ["email", "vat_number", "name"],
      ontology: "customer",
    },
    {
      key: "supplier", name: "Supplier", plural: "Suppliers", domain: "procurement",
      fields: [
        { name: "canonical_supplier_id", type: "string", required: true, semantic: "id" },
        { name: "name", type: "string", required: true },
        { name: "email", type: "string", semantic: "email" },
        { name: "country", type: "string" },
        { name: "lead_time_days", type: "int" },
        { name: "on_time_rate", type: "decimal", semantic: "percent" },
      ],
      primary: "canonical_supplier_id",
      identity: ["name", "email"],
      ontology: "supplier",
    },
    {
      key: "product", name: "Product", plural: "Products", domain: "catalog",
      fields: [
        { name: "canonical_product_id", type: "string", required: true },
        { name: "sku", type: "string", required: true },
        { name: "name", type: "string", required: true },
        { name: "category", type: "string" },
        { name: "unit_cost", type: "decimal", semantic: "money" },
        { name: "unit_price", type: "decimal", semantic: "money" },
      ],
      primary: "canonical_product_id",
      identity: ["sku"],
      ontology: "product",
    },
    {
      key: "order", name: "Order", plural: "Orders", domain: "sales",
      fields: [
        { name: "canonical_order_id", type: "string", required: true },
        { name: "customer_id", type: "string", semantic: "foreign_key" },
        { name: "order_date", type: "date" },
        { name: "total_amount", type: "decimal", semantic: "money" },
        { name: "status", type: "enum" },
      ],
      primary: "canonical_order_id",
      identity: ["canonical_order_id"],
      ontology: "order",
    },
    {
      key: "invoice", name: "Invoice", plural: "Invoices", domain: "finance",
      fields: [
        { name: "canonical_invoice_id", type: "string", required: true },
        { name: "customer_id", type: "string" },
        { name: "issue_date", type: "date" },
        { name: "due_date", type: "date" },
        { name: "amount", type: "decimal", semantic: "money" },
        { name: "status", type: "enum" },
      ],
      primary: "canonical_invoice_id",
      identity: ["canonical_invoice_id"],
      ontology: "invoice",
    },
    {
      key: "employee", name: "Employee", plural: "Employees", domain: "hr",
      fields: [
        { name: "canonical_employee_id", type: "string", required: true },
        { name: "name", type: "string", required: true },
        { name: "email", type: "string", semantic: "email" },
        { name: "department", type: "string" },
        { name: "role", type: "string" },
      ],
      primary: "canonical_employee_id",
      identity: ["email"],
      ontology: "employee",
    },
  ];

  for (const e of entities) {
    dataFabric.canonical.registerEntity({
      entityKey: e.key,
      name: e.name,
      pluralName: e.plural,
      domain: e.domain,
      fields: e.fields.map(f => ({
        name: f.name,
        type: f.type,
        required: f.required,
        semanticType: f.semantic,
      })),
      primaryKey: e.primary,
      identityFields: e.identity,
      ontologyObjectType: e.ontology,
    });
  }
}

function seedDatasets() {
  const datasets: Array<{
    key: string; name: string; zone: "raw" | "staging" | "curated" | "ontology" | "realtime" | "historical";
    domain: string; rows?: number; quality?: number; freshMin?: number; pii?: boolean;
  }> = [
    // Raw zone
    { key: "raw.erp.customers", name: "ERP Customers Raw", zone: "raw", domain: "crm", rows: 12450, quality: 82, freshMin: 60, pii: true },
    { key: "raw.erp.orders", name: "ERP Orders Raw", zone: "raw", domain: "sales", rows: 48200, quality: 88, freshMin: 30 },
    { key: "raw.erp.invoices", name: "ERP Invoices Raw", zone: "raw", domain: "finance", rows: 35600, quality: 90, freshMin: 30 },
    { key: "raw.crm.leads", name: "CRM Leads Raw", zone: "raw", domain: "crm", rows: 8900, quality: 75, freshMin: 15, pii: true },
    { key: "raw.crm.contacts", name: "CRM Contacts Raw", zone: "raw", domain: "crm", rows: 22100, quality: 78, freshMin: 15, pii: true },
    { key: "raw.mes.production_orders", name: "MES Production Orders", zone: "raw", domain: "production", rows: 15700, quality: 92, freshMin: 5 },
    { key: "raw.mes.machine_events", name: "MES Machine Events", zone: "raw", domain: "production", rows: 1_240_000, quality: 96, freshMin: 1 },
    { key: "raw.wms.stock_movements", name: "WMS Stock Movements", zone: "raw", domain: "inventory", rows: 89000, quality: 94, freshMin: 10 },
    { key: "raw.iot.sensor_readings", name: "IoT Sensor Readings", zone: "raw", domain: "production", rows: 5_800_000, quality: 98, freshMin: 1 },
    { key: "raw.stripe.payments", name: "Stripe Payments Raw", zone: "raw", domain: "finance", rows: 4200, quality: 99, freshMin: 5 },
    { key: "raw.hr.employees", name: "HR Employees Raw", zone: "raw", domain: "hr", rows: 145, quality: 95, freshMin: 1440, pii: true },

    // Staging zone
    { key: "stg.customers_dedupe", name: "Customers Deduplicated", zone: "staging", domain: "crm", rows: 11800, quality: 91, freshMin: 60, pii: true },
    { key: "stg.orders_enriched", name: "Orders Enriched", zone: "staging", domain: "sales", rows: 48200, quality: 93, freshMin: 30 },
    { key: "stg.production_normalized", name: "Production Normalized", zone: "staging", domain: "production", rows: 15700, quality: 96, freshMin: 5 },

    // Curated zone
    { key: "cur.customer_360", name: "Customer 360 View", zone: "curated", domain: "crm", rows: 11800, quality: 95, freshMin: 60, pii: true },
    { key: "cur.order_facts", name: "Order Facts", zone: "curated", domain: "sales", rows: 48200, quality: 97, freshMin: 30 },
    { key: "cur.supplier_performance", name: "Supplier Performance", zone: "curated", domain: "procurement", rows: 320, quality: 98, freshMin: 60 },
    { key: "cur.inventory_snapshot", name: "Inventory Snapshot", zone: "curated", domain: "inventory", rows: 8900, quality: 96, freshMin: 10 },
    { key: "cur.cashflow_weekly", name: "Cashflow Weekly", zone: "curated", domain: "finance", rows: 156, quality: 99, freshMin: 60 },

    // Ontology zone
    { key: "ont.customers", name: "Customer Objects", zone: "ontology", domain: "crm", rows: 11800, quality: 98, freshMin: 60, pii: true },
    { key: "ont.suppliers", name: "Supplier Objects", zone: "ontology", domain: "procurement", rows: 320, quality: 99, freshMin: 60 },
    { key: "ont.projects", name: "Project Objects", zone: "ontology", domain: "projects", rows: 45, quality: 98, freshMin: 15 },

    // Realtime zone
    { key: "rt.order_status", name: "Order Status Stream", zone: "realtime", domain: "sales", rows: 47, quality: 100, freshMin: 1 },
    { key: "rt.machine_health", name: "Machine Health Stream", zone: "realtime", domain: "production", rows: 32, quality: 100, freshMin: 1 },
    { key: "rt.cashflow_live", name: "Cashflow Live", zone: "realtime", domain: "finance", rows: 1, quality: 100, freshMin: 1 },

    // Historical zone
    { key: "hist.sales_2023", name: "Sales 2023 Archive", zone: "historical", domain: "sales", rows: 38000, quality: 100, freshMin: 10080 },
    { key: "hist.production_2023", name: "Production 2023 Archive", zone: "historical", domain: "production", rows: 11200, quality: 100, freshMin: 10080 },
  ];

  for (const d of datasets) {
    dataFabric.datasets.register({
      datasetKey: d.key,
      name: d.name,
      zone: d.zone,
      domain: d.domain,
      rowCount: d.rows,
      qualityScore: d.quality,
      freshnessSlaMinutes: d.freshMin,
      containsPii: d.pii,
      lifecycleState: "active",
      storageType: d.zone === "realtime" ? "stream" : d.zone === "historical" ? "s3" : "table",
      format: d.zone === "historical" ? "parquet" : d.zone === "realtime" ? "json" : "table",
      refreshMode: d.zone === "realtime" ? "streaming" : d.zone === "historical" ? "batch" : "batch",
      lastRefreshedAt: new Date(Date.now() - Math.random() * (d.freshMin ?? 60) * 30_000),
      schemaVersion: 1,
    });
  }
}

function seedMappings() {
  // Customer mappings — the same customer exists in 3 sources
  const erpSource = dataFabric.connectors.get("erp-main");
  const crmSource = dataFabric.connectors.get("crm-salesforce");
  const excelSource = dataFabric.connectors.get("customer-excel");

  if (erpSource) {
    dataFabric.canonical.registerMapping({
      sourceId: erpSource.id, sourceField: "customer_id",
      canonicalEntity: "customer", canonicalField: "canonical_customer_id",
      transformExpression: "CONCAT('erp:', value)", dataType: "string", confidence: 1,
    });
    dataFabric.canonical.registerMapping({
      sourceId: erpSource.id, sourceField: "company_name",
      canonicalEntity: "customer", canonicalField: "name",
      transformExpression: "TRIM(value)", dataType: "string", confidence: 1,
    });
    dataFabric.canonical.registerMapping({
      sourceId: erpSource.id, sourceField: "email_address",
      canonicalEntity: "customer", canonicalField: "email",
      transformExpression: "LOWER(TRIM(value))", dataType: "string", confidence: 1,
    });
  }
  if (crmSource) {
    dataFabric.canonical.registerMapping({
      sourceId: crmSource.id, sourceField: "AccountId",
      canonicalEntity: "customer", canonicalField: "canonical_customer_id",
      transformExpression: "CONCAT('sf:', value)", dataType: "string", confidence: 1,
    });
    dataFabric.canonical.registerMapping({
      sourceId: crmSource.id, sourceField: "Name",
      canonicalEntity: "customer", canonicalField: "name",
      dataType: "string", confidence: 1,
    });
    dataFabric.canonical.registerMapping({
      sourceId: crmSource.id, sourceField: "Email__c",
      canonicalEntity: "customer", canonicalField: "email",
      transformExpression: "LOWER(value)", dataType: "string", confidence: 0.95,
    });
  }
  if (excelSource) {
    dataFabric.canonical.registerMapping({
      sourceId: excelSource.id, sourceField: "customer_code",
      canonicalEntity: "customer", canonicalField: "canonical_customer_id",
      dataType: "string", confidence: 0.8, autoGenerated: true,
    });
    dataFabric.canonical.registerMapping({
      sourceId: excelSource.id, sourceField: "Company",
      canonicalEntity: "customer", canonicalField: "name",
      dataType: "string", confidence: 0.85,
    });
  }
}

function seedPipelines() {
  dataFabric.pipelines.register({
    pipelineKey: "pl.customer.360",
    name: "Customer 360 Pipeline",
    description: "Merges customer data from ERP, CRM, and Excel into unified Customer 360 view",
    domain: "crm",
    dag: {
      nodes: [
        { id: "src_erp", type: "source", name: "ERP Customers", params: { dataset: "raw.erp.customers" } },
        { id: "src_crm", type: "source", name: "CRM Contacts", params: { dataset: "raw.crm.contacts" } },
        { id: "src_excel", type: "source", name: "Excel Customers", params: { source: "customer-excel" } },
        { id: "dedupe", type: "transform", name: "Deduplicate", params: {} },
        { id: "identity", type: "transform", name: "Identity Resolution", params: {} },
        { id: "enrich", type: "transform", name: "Enrich with CRM", params: {} },
        { id: "quality", type: "quality_check", name: "Quality Gate", params: {} },
        { id: "output", type: "sink", name: "Customer 360", params: { dataset: "cur.customer_360" } },
      ],
      edges: [
        { from: "src_erp", to: "dedupe" },
        { from: "src_crm", to: "dedupe" },
        { from: "src_excel", to: "dedupe" },
        { from: "dedupe", to: "identity" },
        { from: "identity", to: "enrich" },
        { from: "enrich", to: "quality" },
        { from: "quality", to: "output" },
      ],
    },
    schedule: "0 */2 * * *",
    triggerType: "schedule",
    inputDatasetKeys: ["raw.erp.customers", "raw.crm.contacts"],
    outputDatasetKeys: ["cur.customer_360"],
    status: "active",
    successRate: 98,
    avgDurationMs: 45000,
    lastRunAt: new Date(Date.now() - 30 * 60 * 1000),
    lastSuccessAt: new Date(Date.now() - 30 * 60 * 1000),
  });

  dataFabric.pipelines.register({
    pipelineKey: "pl.order.facts",
    name: "Order Facts Pipeline",
    description: "Builds the order facts table from ERP orders joined with customer and product data",
    domain: "sales",
    dag: {
      nodes: [
        { id: "src", type: "source", name: "ERP Orders", params: {} },
        { id: "join_c", type: "join", name: "Join Customers", params: {} },
        { id: "join_p", type: "join", name: "Join Products", params: {} },
        { id: "agg", type: "aggregate", name: "Aggregate Metrics", params: {} },
        { id: "out", type: "sink", name: "Order Facts", params: {} },
      ],
      edges: [
        { from: "src", to: "join_c" },
        { from: "join_c", to: "join_p" },
        { from: "join_p", to: "agg" },
        { from: "agg", to: "out" },
      ],
    },
    schedule: "*/30 * * * *",
    triggerType: "schedule",
    inputDatasetKeys: ["raw.erp.orders"],
    outputDatasetKeys: ["cur.order_facts"],
    status: "active",
    successRate: 99,
    avgDurationMs: 22000,
    lastRunAt: new Date(Date.now() - 15 * 60 * 1000),
    lastSuccessAt: new Date(Date.now() - 15 * 60 * 1000),
  });

  dataFabric.pipelines.register({
    pipelineKey: "pl.production.realtime",
    name: "Production Real-Time Stream",
    description: "Streams IoT + MES data to real-time production state",
    domain: "production",
    dag: {
      nodes: [
        { id: "iot", type: "stream", name: "IoT Kafka", params: {} },
        { id: "mes", type: "stream", name: "MES CDC", params: {} },
        { id: "merge", type: "transform", name: "Merge Streams", params: {} },
        { id: "state", type: "state_store", name: "Update State", params: {} },
      ],
      edges: [
        { from: "iot", to: "merge" },
        { from: "mes", to: "merge" },
        { from: "merge", to: "state" },
      ],
    },
    triggerType: "event",
    inputDatasetKeys: ["raw.iot.sensor_readings", "raw.mes.machine_events"],
    outputDatasetKeys: ["rt.machine_health"],
    status: "active",
    successRate: 99.5,
    avgDurationMs: 50,
    lastRunAt: new Date(),
    lastSuccessAt: new Date(),
  });

  dataFabric.pipelines.register({
    pipelineKey: "pl.cashflow.daily",
    name: "Daily Cashflow Projection",
    description: "Joins invoices + payments + forecasts for daily cashflow picture",
    domain: "finance",
    dag: {
      nodes: [
        { id: "inv", type: "source", name: "Invoices", params: {} },
        { id: "pay", type: "source", name: "Payments", params: {} },
        { id: "calc", type: "transform", name: "Calculate Net", params: {} },
        { id: "forecast", type: "ml", name: "Forecast Next 30d", params: {} },
        { id: "out", type: "sink", name: "Cashflow Weekly", params: {} },
      ],
      edges: [
        { from: "inv", to: "calc" },
        { from: "pay", to: "calc" },
        { from: "calc", to: "forecast" },
        { from: "forecast", to: "out" },
      ],
    },
    schedule: "0 6 * * *",
    triggerType: "schedule",
    inputDatasetKeys: ["raw.erp.invoices", "raw.stripe.payments"],
    outputDatasetKeys: ["cur.cashflow_weekly"],
    status: "active",
    successRate: 100,
    avgDurationMs: 18000,
    lastRunAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
    lastSuccessAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
  });
}

function seedQualityRules() {
  const rules: Array<{
    key: string; name: string; dataset: string; field?: string;
    type: "not_null" | "unique" | "range" | "freshness" | "referential_integrity" | "row_count";
    severity: "warning" | "critical" | "blocking";
  }> = [
    { key: "dq.customer.email_not_null", name: "Customer Email Not Null", dataset: "cur.customer_360", field: "email", type: "not_null", severity: "warning" },
    { key: "dq.customer.id_unique", name: "Customer ID Unique", dataset: "cur.customer_360", field: "canonical_customer_id", type: "unique", severity: "critical" },
    { key: "dq.order.amount_positive", name: "Order Amount Positive", dataset: "cur.order_facts", field: "total_amount", type: "range", severity: "critical" },
    { key: "dq.invoice.fk_customer", name: "Invoice Customer FK", dataset: "raw.erp.invoices", field: "customer_id", type: "referential_integrity", severity: "warning" },
    { key: "dq.iot.freshness", name: "IoT Freshness", dataset: "raw.iot.sensor_readings", type: "freshness", severity: "warning" },
    { key: "dq.production.row_count", name: "Production Row Count", dataset: "raw.mes.production_orders", type: "row_count", severity: "warning" },
    { key: "dq.customer.pii_masked", name: "PII Must Be Masked Downstream", dataset: "cur.customer_360", type: "not_null", severity: "blocking" },
  ];

  for (const r of rules) {
    const rule = dataFabric.quality.registerRule({
      ruleKey: r.key,
      name: r.name,
      datasetKey: r.dataset,
      fieldName: r.field,
      ruleType: r.type,
      severity: r.severity,
      onFailure: r.severity === "blocking" ? "block" : r.severity === "critical" ? "alert" : "log",
      enabled: true,
    });

    // Seed a few results
    for (let i = 0; i < 5; i++) {
      const passed = Math.random() > (r.severity === "critical" ? 0.15 : 0.08);
      dataFabric.quality.recordResult({
        ruleId: rule.id,
        datasetKey: r.dataset,
        status: passed ? "pass" : "fail",
        rowsChecked: Math.floor(Math.random() * 10000) + 1000,
        rowsFailed: passed ? 0 : Math.floor(Math.random() * 50),
        message: passed ? "OK" : "Quality check failed",
      });
    }
  }
}

function seedLineage() {
  const edges: Array<{
    fromType: "source" | "dataset" | "pipeline" | "transform" | "product" | "ontology" | "dashboard" | "model";
    fromId: string; fromLabel: string;
    toType: "source" | "dataset" | "pipeline" | "transform" | "product" | "ontology" | "dashboard" | "model";
    toId: string; toLabel: string;
    relationship: "produces" | "consumes" | "derives_from" | "joins_with" | "uses" | "feeds" | "depends_on";
  }> = [
    { fromType: "source", fromId: "erp-main", fromLabel: "ERP Main DB", toType: "dataset", toId: "raw.erp.customers", toLabel: "ERP Customers Raw", relationship: "produces" },
    { fromType: "source", fromId: "erp-main", fromLabel: "ERP Main DB", toType: "dataset", toId: "raw.erp.orders", toLabel: "ERP Orders Raw", relationship: "produces" },
    { fromType: "source", fromId: "erp-main", fromLabel: "ERP Main DB", toType: "dataset", toId: "raw.erp.invoices", toLabel: "ERP Invoices Raw", relationship: "produces" },
    { fromType: "source", fromId: "crm-salesforce", fromLabel: "Salesforce", toType: "dataset", toId: "raw.crm.contacts", toLabel: "CRM Contacts Raw", relationship: "produces" },
    { fromType: "source", fromId: "customer-excel", fromLabel: "Customer Excel", toType: "dataset", toId: "stg.customers_dedupe", toLabel: "Customers Deduped", relationship: "feeds" },

    { fromType: "dataset", fromId: "raw.erp.customers", fromLabel: "ERP Customers Raw", toType: "pipeline", toId: "pl.customer.360", toLabel: "Customer 360", relationship: "consumes" },
    { fromType: "dataset", fromId: "raw.crm.contacts", fromLabel: "CRM Contacts Raw", toType: "pipeline", toId: "pl.customer.360", toLabel: "Customer 360", relationship: "consumes" },
    { fromType: "pipeline", fromId: "pl.customer.360", fromLabel: "Customer 360", toType: "dataset", toId: "cur.customer_360", toLabel: "Customer 360 View", relationship: "produces" },
    { fromType: "dataset", fromId: "cur.customer_360", fromLabel: "Customer 360 View", toType: "ontology", toId: "customer", toLabel: "Customer Ontology", relationship: "feeds" },

    { fromType: "dataset", fromId: "raw.erp.orders", fromLabel: "ERP Orders Raw", toType: "pipeline", toId: "pl.order.facts", toLabel: "Order Facts", relationship: "consumes" },
    { fromType: "pipeline", fromId: "pl.order.facts", fromLabel: "Order Facts", toType: "dataset", toId: "cur.order_facts", toLabel: "Order Facts", relationship: "produces" },
    { fromType: "dataset", fromId: "cur.order_facts", fromLabel: "Order Facts", toType: "dashboard", toId: "sales-dashboard", toLabel: "Sales Dashboard", relationship: "feeds" },

    { fromType: "source", fromId: "iot-sensors", fromLabel: "IoT Sensors", toType: "dataset", toId: "raw.iot.sensor_readings", toLabel: "Sensor Readings", relationship: "produces" },
    { fromType: "source", fromId: "production-mes", fromLabel: "MES", toType: "dataset", toId: "raw.mes.machine_events", toLabel: "Machine Events", relationship: "produces" },
    { fromType: "dataset", fromId: "raw.iot.sensor_readings", fromLabel: "Sensor Readings", toType: "pipeline", toId: "pl.production.realtime", toLabel: "Production RT", relationship: "consumes" },
    { fromType: "dataset", fromId: "raw.mes.machine_events", fromLabel: "Machine Events", toType: "pipeline", toId: "pl.production.realtime", toLabel: "Production RT", relationship: "consumes" },
    { fromType: "pipeline", fromId: "pl.production.realtime", fromLabel: "Production RT", toType: "dataset", toId: "rt.machine_health", toLabel: "Machine Health Stream", relationship: "produces" },

    { fromType: "dataset", fromId: "raw.erp.invoices", fromLabel: "Invoices Raw", toType: "pipeline", toId: "pl.cashflow.daily", toLabel: "Cashflow Daily", relationship: "consumes" },
    { fromType: "source", fromId: "stripe-payments", fromLabel: "Stripe", toType: "dataset", toId: "raw.stripe.payments", toLabel: "Stripe Payments", relationship: "produces" },
    { fromType: "dataset", fromId: "raw.stripe.payments", fromLabel: "Stripe Payments", toType: "pipeline", toId: "pl.cashflow.daily", toLabel: "Cashflow Daily", relationship: "consumes" },
    { fromType: "pipeline", fromId: "pl.cashflow.daily", fromLabel: "Cashflow Daily", toType: "dataset", toId: "cur.cashflow_weekly", toLabel: "Cashflow Weekly", relationship: "produces" },
    { fromType: "dataset", fromId: "cur.cashflow_weekly", fromLabel: "Cashflow Weekly", toType: "model", toId: "forecast-model", toLabel: "Forecast Model", relationship: "feeds" },
  ];

  for (const e of edges) {
    dataFabric.lineage.addEdge(e);
  }
}

function seedIdentityClusters() {
  // Simulate a customer that exists in all 3 sources being resolved
  const erp = dataFabric.connectors.get("erp-main");
  const crm = dataFabric.connectors.get("crm-salesforce");
  const excel = dataFabric.connectors.get("customer-excel");

  if (erp && crm && excel) {
    dataFabric.identity.resolve(
      "customer", erp.id, "ERP-12345",
      { email: "contact@elco.co.il", name: "אלקו בע״מ", vat_number: "514123456" },
      ["email", "vat_number"]
    );
    dataFabric.identity.resolve(
      "customer", crm.id, "SF-001ABCDEF",
      { email: "contact@elco.co.il", name: "Elco Ltd", vat_number: "514123456" },
      ["email", "vat_number"]
    );
    dataFabric.identity.resolve(
      "customer", excel.id, "XL-445",
      { email: "contact@elco.co.il", name: "אלקו", vat_number: "514123456" },
      ["email", "vat_number"]
    );

    // Second cluster
    dataFabric.identity.resolve(
      "customer", erp.id, "ERP-22100",
      { email: "office@phoenix.co.il", name: "פניקס בנייה", vat_number: "512999888" },
      ["email", "vat_number"]
    );
    dataFabric.identity.resolve(
      "customer", crm.id, "SF-002XYZABC",
      { email: "office@phoenix.co.il", name: "Phoenix Construction", vat_number: "512999888" },
      ["email", "vat_number"]
    );

    // Third cluster — only in ERP (no dup)
    dataFabric.identity.resolve(
      "customer", erp.id, "ERP-33500",
      { email: "info@alumpro.co.il", name: "אלום פרו", vat_number: "513555444" },
      ["email", "vat_number"]
    );
  }
}

function seedDataProducts() {
  dataFabric.products.register({
    productKey: "dp.customer_360",
    name: "Customer 360",
    description: "Unified view of every customer across ERP, CRM, and historical data",
    domain: "crm",
    teamName: "Customer Data",
    primaryDatasetKey: "cur.customer_360",
    relatedDatasetKeys: ["raw.erp.customers", "raw.crm.contacts"],
    ontologyObjectTypes: ["customer"],
    freshnessSla: "60 min",
    availabilitySla: 99.9,
    qualitySla: 95,
    consumers: ["Sales Dashboard", "CRM App", "AI Agents"],
    status: "ga",
    version: "2.1.0",
    tags: ["core", "pii"],
  });

  dataFabric.products.register({
    productKey: "dp.order_facts",
    name: "Order Facts",
    description: "Order-level fact table with customer and product joins",
    domain: "sales",
    teamName: "Sales Analytics",
    primaryDatasetKey: "cur.order_facts",
    ontologyObjectTypes: ["order"],
    freshnessSla: "30 min",
    availabilitySla: 99.5,
    qualitySla: 97,
    consumers: ["Sales Dashboard", "BI", "Revenue Forecast"],
    status: "ga",
    version: "3.0.0",
    tags: ["core"],
  });

  dataFabric.products.register({
    productKey: "dp.machine_health",
    name: "Machine Health Stream",
    description: "Real-time machine health from IoT + MES",
    domain: "production",
    teamName: "Operations",
    primaryDatasetKey: "rt.machine_health",
    ontologyObjectTypes: ["production_line", "machine"],
    freshnessSla: "1 min",
    availabilitySla: 99.9,
    qualitySla: 98,
    consumers: ["Production Dashboard", "Digital Twin", "Predictive Maintenance"],
    status: "ga",
    version: "1.5.0",
    tags: ["realtime", "iot"],
  });

  dataFabric.products.register({
    productKey: "dp.cashflow_weekly",
    name: "Cashflow Weekly",
    description: "Weekly cashflow with 30-day forecast",
    domain: "finance",
    teamName: "Finance",
    primaryDatasetKey: "cur.cashflow_weekly",
    freshnessSla: "24 hr",
    availabilitySla: 99.5,
    qualitySla: 99,
    consumers: ["CFO Dashboard", "Treasury", "Board Report"],
    status: "ga",
    version: "1.2.0",
    tags: ["finance"],
  });

  dataFabric.products.register({
    productKey: "dp.supplier_performance",
    name: "Supplier Performance",
    description: "Supplier on-time delivery, quality, and reliability metrics",
    domain: "procurement",
    teamName: "Procurement",
    primaryDatasetKey: "cur.supplier_performance",
    ontologyObjectTypes: ["supplier"],
    freshnessSla: "60 min",
    availabilitySla: 99.0,
    qualitySla: 96,
    consumers: ["Procurement App", "Risk Dashboard"],
    status: "beta",
    version: "0.9.0",
    tags: ["procurement"],
  });
}

function seedChangeEvents() {
  // Seed a few sample CDC events
  const erp = dataFabric.connectors.get("erp-main");
  if (!erp) return;
  for (let i = 0; i < 20; i++) {
    dataFabric.changeEvents.record({
      sourceId: erp.id,
      sourceKey: erp.sourceKey,
      datasetKey: "raw.erp.orders",
      operation: i % 5 === 0 ? "insert" : "update",
      recordId: `ORD-${1000 + i}`,
      changedFields: ["status", "updated_at"],
      sourceTimestamp: new Date(Date.now() - i * 60_000),
    });
  }
}

// ════════════════════════════════════════════════════════════════
// SIMULATOR — generates ongoing data fabric events
// ════════════════════════════════════════════════════════════════

function startSimulator() {
  // Every 12s: measure freshness + record a quality check + record a CDC event
  let tick = 0;
  setInterval(() => {
    tick++;

    // Measure freshness on a rotating dataset
    const datasets = dataFabric.datasets.all();
    if (datasets.length > 0) {
      const d = datasets[tick % datasets.length]!;
      dataFabric.freshness.measure(d.datasetKey);
      // Randomly update lastRefreshedAt for realtime zone
      if (d.zone === "realtime") {
        dataFabric.datasets.updateRefresh(d.datasetKey, d.rowCount);
      }
    }

    // Every 3rd tick: run a quality check
    if (tick % 3 === 0) {
      const rules = dataFabric.quality.allRules();
      if (rules.length > 0) {
        const rule = rules[tick % rules.length]!;
        const passed = Math.random() > 0.1;
        dataFabric.quality.recordResult({
          ruleId: rule.id,
          datasetKey: rule.datasetKey ?? "unknown",
          status: passed ? "pass" : "fail",
          rowsChecked: 1000,
          rowsFailed: passed ? 0 : 5,
        });
      }
    }

    // Every 5th tick: record a CDC event
    if (tick % 5 === 0) {
      const erp = dataFabric.connectors.get("erp-main");
      if (erp) {
        dataFabric.changeEvents.record({
          sourceId: erp.id,
          sourceKey: erp.sourceKey,
          datasetKey: "raw.erp.orders",
          operation: "update",
          recordId: `ORD-${Math.floor(Math.random() * 10000)}`,
          changedFields: ["status"],
        });
      }
    }
  }, 12_000).unref?.();
}
