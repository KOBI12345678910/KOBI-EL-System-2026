import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  varchar,
  doublePrecision,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * BASH44 Data Fabric — Enterprise Data Foundation
 *
 * The data layer is the heart of the platform. Every live company picture,
 * every decision, every AI reasoning depends on trustworthy, connected,
 * lineage-aware, canonical data.
 *
 * Architecture:
 *
 *   data_sources           → every system we pull from (DB, API, webhook, file, stream, IoT)
 *   source_connectors      → runtime connector instances with auth, config, status
 *   ingestion_jobs         → batch / incremental / CDC / streaming jobs
 *   ingestion_runs         → execution history with lag, rows, errors
 *   datasets               → landed datasets in raw/staging/curated/ontology layers
 *   dataset_fields         → column-level metadata
 *   data_products          → productized datasets with owner, SLA, consumers
 *   canonical_mappings     → field mappings from source → canonical model
 *   canonical_entities     → canonical entity definitions
 *   identity_clusters      → resolved identity clusters (cross-source)
 *   identity_links         → entity ↔ source record links
 *   data_pipelines_fabric  → pipeline definitions (DAG of transforms)
 *   pipeline_runs_fabric   → pipeline execution history
 *   pipeline_transforms    → individual transform steps
 *   data_lineage           → upstream/downstream lineage edges
 *   data_quality_rules     → quality rule definitions
 *   data_quality_results   → rule execution results
 *   freshness_slas         → freshness SLA per dataset/stream
 *   freshness_measurements → real-time freshness tracking
 *   schema_versions        → schema evolution history
 *   write_back_actions     → outbound actions to source systems
 *   data_subscriptions     → real-time subscriptions for live dashboards
 *   change_events          → CDC events (generic)
 */

// ════════════════════════════════════════════════════════════════
// DATA SOURCES — every system we pull from
// ════════════════════════════════════════════════════════════════
export const dataSourcesTable = pgTable(
  "data_sources",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id"),
    sourceKey: varchar("source_key", { length: 100 }).notNull(),
    name: text("name").notNull(),
    description: text("description"),
    // Source type
    sourceType: varchar("source_type", { length: 50 }).notNull(),
    // postgres|mysql|mssql|oracle|mongodb|rest_api|graphql|webhook|
    // file_drop|sftp|s3|gcs|kafka|kinesis|pubsub|iot|plc|spreadsheet|
    // erp_legacy|crm|third_party
    category: varchar("category", { length: 50 }),
    // finance|crm|production|procurement|hr|inventory|external|iot
    vendor: varchar("vendor", { length: 80 }),
    // Connection
    connectionConfig: jsonb("connection_config").default({}),
    authType: varchar("auth_type", { length: 50 }),
    // api_key|oauth|basic|jwt|iam|none|mtls
    credentialsRef: varchar("credentials_ref", { length: 200 }),
    // State
    status: varchar("status", { length: 20 }).notNull().default("configured"),
    // configured|testing|active|paused|failed|archived
    healthScore: doublePrecision("health_score"),
    // Metadata
    ownerId: integer("owner_id"),
    tags: jsonb("tags").$type<string[]>().default([]),
    sensitivityLevel: varchar("sensitivity_level", { length: 20 }).default("internal"),
    // public|internal|confidential|restricted|pii
    lastTestedAt: timestamp("last_tested_at"),
    lastSyncAt: timestamp("last_sync_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_data_source_key").on(table.tenantId, table.sourceKey),
    index("idx_data_source_type").on(table.sourceType),
    index("idx_data_source_status").on(table.status),
  ]
);

// ════════════════════════════════════════════════════════════════
// SOURCE CONNECTORS — runtime connector instances
// ════════════════════════════════════════════════════════════════
export const sourceConnectorsTable = pgTable(
  "source_connectors",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id"),
    sourceId: integer("source_id").notNull(),
    connectorKey: varchar("connector_key", { length: 100 }).notNull(),
    connectorType: varchar("connector_type", { length: 50 }).notNull(),
    // pull|push|cdc|stream|webhook|batch|incremental|file_watch
    schedule: varchar("schedule", { length: 100 }),
    // cron expression or "streaming"
    config: jsonb("config").default({}),
    // Runtime state
    status: varchar("status", { length: 20 }).notNull().default("idle"),
    // idle|running|succeeded|failed|paused|stalled
    lastRunAt: timestamp("last_run_at"),
    nextRunAt: timestamp("next_run_at"),
    lagSeconds: integer("lag_seconds"),
    eventsPerMinute: doublePrecision("events_per_minute"),
    errorCount24h: integer("error_count_24h").default(0),
    // Schema detection
    detectedSchemaHash: varchar("detected_schema_hash", { length: 64 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_connector_key").on(table.tenantId, table.connectorKey),
    index("idx_connector_source").on(table.sourceId),
    index("idx_connector_status").on(table.status),
  ]
);

// ════════════════════════════════════════════════════════════════
// INGESTION JOBS
// ════════════════════════════════════════════════════════════════
export const ingestionJobsTable = pgTable(
  "ingestion_jobs",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id"),
    jobKey: varchar("job_key", { length: 100 }).notNull(),
    name: text("name").notNull(),
    sourceId: integer("source_id").notNull(),
    connectorId: integer("connector_id"),
    // Mode
    mode: varchar("mode", { length: 30 }).notNull(),
    // batch|incremental|cdc|streaming|webhook|file_drop
    targetDatasetId: integer("target_dataset_id"),
    targetZone: varchar("target_zone", { length: 20 }).notNull().default("raw"),
    // raw|staging|curated|ontology|realtime|historical
    // Scheduling
    schedule: varchar("schedule", { length: 100 }),
    enabled: boolean("enabled").default(true),
    // Config
    transformConfig: jsonb("transform_config").default({}),
    validationRules: jsonb("validation_rules").default([]),
    dedupeKey: varchar("dedupe_key", { length: 200 }),
    partitionStrategy: varchar("partition_strategy", { length: 30 }),
    // none|daily|hourly|tenant|region
    // Stats
    lastRunAt: timestamp("last_run_at"),
    lastSuccessAt: timestamp("last_success_at"),
    lastRowsIngested: integer("last_rows_ingested"),
    totalRowsIngested: integer("total_rows_ingested").default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_ingestion_job_key").on(table.tenantId, table.jobKey),
    index("idx_ingestion_source").on(table.sourceId),
    index("idx_ingestion_mode").on(table.mode),
  ]
);

// ════════════════════════════════════════════════════════════════
// INGESTION RUNS — execution history
// ════════════════════════════════════════════════════════════════
export const ingestionRunsTable = pgTable(
  "ingestion_runs",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id"),
    jobId: integer("job_id").notNull(),
    runKey: varchar("run_key", { length: 100 }),
    status: varchar("status", { length: 20 }).notNull(),
    // queued|running|success|failed|partial|cancelled
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
    durationMs: integer("duration_ms"),
    rowsRead: integer("rows_read").default(0),
    rowsWritten: integer("rows_written").default(0),
    rowsSkipped: integer("rows_skipped").default(0),
    rowsFailed: integer("rows_failed").default(0),
    bytesProcessed: integer("bytes_processed").default(0),
    errorMessage: text("error_message"),
    errorDetails: jsonb("error_details"),
    watermarkStart: varchar("watermark_start", { length: 200 }),
    watermarkEnd: varchar("watermark_end", { length: 200 }),
    metadata: jsonb("metadata").default({}),
  },
  (table) => [
    index("idx_ingestion_run_job").on(table.jobId),
    index("idx_ingestion_run_status").on(table.status),
    index("idx_ingestion_run_time").on(table.startedAt),
  ]
);

// ════════════════════════════════════════════════════════════════
// DATASETS — landed data across zones
// ════════════════════════════════════════════════════════════════
export const fabricDatasetsTable = pgTable(
  "fabric_datasets",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id"),
    datasetKey: varchar("dataset_key", { length: 200 }).notNull(),
    name: text("name").notNull(),
    description: text("description"),
    // Zone
    zone: varchar("zone", { length: 20 }).notNull(),
    // raw|staging|curated|ontology|realtime|historical|event_store
    layer: varchar("layer", { length: 50 }),
    domain: varchar("domain", { length: 50 }),
    // Physical storage
    storageType: varchar("storage_type", { length: 30 }),
    // table|view|file|stream|topic|s3|gcs
    location: text("location"),
    format: varchar("format", { length: 20 }),
    // parquet|avro|json|csv|delta|iceberg
    // Schema
    schemaVersion: integer("schema_version").default(1),
    schemaDefinition: jsonb("schema_definition"),
    schemaHash: varchar("schema_hash", { length: 64 }),
    // Size
    rowCount: integer("row_count"),
    sizeBytes: integer("size_bytes"),
    // Ownership
    ownerId: integer("owner_id"),
    team: varchar("team", { length: 80 }),
    // Quality
    qualityScore: doublePrecision("quality_score"),
    // Refresh
    refreshMode: varchar("refresh_mode", { length: 20 }),
    // batch|streaming|on_demand|cdc
    lastRefreshedAt: timestamp("last_refreshed_at"),
    nextRefreshAt: timestamp("next_refresh_at"),
    freshnessSlaMinutes: integer("freshness_sla_minutes"),
    // Classification
    sensitivityLevel: varchar("sensitivity_level", { length: 20 }).default("internal"),
    containsPii: boolean("contains_pii").default(false),
    // Lifecycle
    lifecycleState: varchar("lifecycle_state", { length: 20 }).default("active"),
    // draft|active|deprecated|archived|deleted
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_fabric_dataset_key").on(table.tenantId, table.datasetKey),
    index("idx_fabric_dataset_zone").on(table.zone),
    index("idx_fabric_dataset_domain").on(table.domain),
    index("idx_fabric_dataset_owner").on(table.ownerId),
  ]
);

// ════════════════════════════════════════════════════════════════
// DATASET FIELDS — column-level metadata
// ════════════════════════════════════════════════════════════════
export const datasetFieldsTable = pgTable(
  "dataset_fields",
  {
    id: serial("id").primaryKey(),
    datasetId: integer("dataset_id").notNull(),
    fieldName: varchar("field_name", { length: 200 }).notNull(),
    dataType: varchar("data_type", { length: 50 }).notNull(),
    semanticType: varchar("semantic_type", { length: 50 }),
    // id|email|phone|money|percent|date|timestamp|enum|foreign_key|pii
    description: text("description"),
    isNullable: boolean("is_nullable").default(true),
    isPrimaryKey: boolean("is_primary_key").default(false),
    isForeignKey: boolean("is_foreign_key").default(false),
    references: varchar("references", { length: 200 }),
    canonicalName: varchar("canonical_name", { length: 200 }),
    // mapping to canonical model
    nullFraction: doublePrecision("null_fraction"),
    distinctFraction: doublePrecision("distinct_fraction"),
    sampleValues: jsonb("sample_values"),
    containsPii: boolean("contains_pii").default(false),
    masked: boolean("masked").default(false),
    tags: jsonb("tags").$type<string[]>().default([]),
  },
  (table) => [
    index("idx_dataset_field_dataset").on(table.datasetId),
    index("idx_dataset_field_canonical").on(table.canonicalName),
  ]
);

// ════════════════════════════════════════════════════════════════
// DATA PRODUCTS — productized datasets with owner, SLA, consumers
// ════════════════════════════════════════════════════════════════
export const dataProductsTable = pgTable(
  "data_products",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id"),
    productKey: varchar("product_key", { length: 100 }).notNull(),
    name: text("name").notNull(),
    description: text("description"),
    domain: varchar("domain", { length: 50 }),
    ownerId: integer("owner_id"),
    teamName: varchar("team_name", { length: 80 }),
    // Bindings
    primaryDatasetId: integer("primary_dataset_id"),
    relatedDatasetIds: jsonb("related_dataset_ids").$type<number[]>().default([]),
    ontologyObjectTypes: jsonb("ontology_object_types").$type<string[]>().default([]),
    // SLA
    freshnessSla: varchar("freshness_sla", { length: 50 }),
    availabilitySla: doublePrecision("availability_sla"),
    qualitySla: doublePrecision("quality_sla"),
    // Governance
    accessPolicy: jsonb("access_policy").default({}),
    consumers: jsonb("consumers").default([]),
    // Lifecycle
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    // draft|beta|ga|deprecated
    version: varchar("version", { length: 20 }),
    tags: jsonb("tags").$type<string[]>().default([]),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_data_product_key").on(table.tenantId, table.productKey),
    index("idx_data_product_domain").on(table.domain),
    index("idx_data_product_owner").on(table.ownerId),
  ]
);

// ════════════════════════════════════════════════════════════════
// CANONICAL MAPPINGS — source field → canonical field
// ════════════════════════════════════════════════════════════════
export const canonicalMappingsTable = pgTable(
  "canonical_mappings",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id"),
    sourceId: integer("source_id").notNull(),
    sourceField: varchar("source_field", { length: 200 }).notNull(),
    canonicalEntity: varchar("canonical_entity", { length: 100 }).notNull(),
    canonicalField: varchar("canonical_field", { length: 200 }).notNull(),
    transformExpression: text("transform_expression"),
    // e.g. "TO_LOWER(TRIM(value))" or "CAST(value AS decimal)"
    dataType: varchar("data_type", { length: 50 }),
    confidence: doublePrecision("confidence").default(1),
    autoGenerated: boolean("auto_generated").default(false),
    verifiedBy: integer("verified_by"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_canonical_source").on(table.sourceId),
    index("idx_canonical_entity").on(table.canonicalEntity),
  ]
);

// ════════════════════════════════════════════════════════════════
// CANONICAL ENTITIES — unified entity definitions
// ════════════════════════════════════════════════════════════════
export const canonicalEntitiesTable = pgTable(
  "canonical_entities",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id"),
    entityKey: varchar("entity_key", { length: 100 }).notNull(),
    name: text("name").notNull(),
    description: text("description"),
    pluralName: text("plural_name"),
    domain: varchar("domain", { length: 50 }),
    // Canonical fields
    fields: jsonb("fields").$type<Array<{
      name: string;
      type: string;
      description?: string;
      required?: boolean;
      semanticType?: string;
    }>>().default([]),
    primaryKey: varchar("primary_key", { length: 100 }),
    identityFields: jsonb("identity_fields").$type<string[]>().default([]),
    // Links to ontology
    ontologyObjectType: varchar("ontology_object_type", { length: 100 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_canonical_entity_key").on(table.tenantId, table.entityKey),
  ]
);

// ════════════════════════════════════════════════════════════════
// IDENTITY CLUSTERS — resolved identity clusters across sources
// ════════════════════════════════════════════════════════════════
export const identityClustersTable = pgTable(
  "identity_clusters",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id"),
    canonicalEntity: varchar("canonical_entity", { length: 100 }).notNull(),
    canonicalId: varchar("canonical_id", { length: 200 }).notNull(),
    // "master" values
    canonicalAttributes: jsonb("canonical_attributes").default({}),
    // Cluster info
    sourceCount: integer("source_count").default(1),
    confidence: doublePrecision("confidence"),
    resolutionMethod: varchar("resolution_method", { length: 30 }),
    // exact|fuzzy|ml|manual|rule
    manuallyVerified: boolean("manually_verified").default(false),
    verifiedBy: integer("verified_by"),
    mergeHistory: jsonb("merge_history").default([]),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_identity_cluster").on(table.tenantId, table.canonicalEntity, table.canonicalId),
  ]
);

// ════════════════════════════════════════════════════════════════
// IDENTITY LINKS — entity ↔ source record links
// ════════════════════════════════════════════════════════════════
export const identityLinksTable = pgTable(
  "identity_links",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id"),
    clusterId: integer("cluster_id").notNull(),
    sourceId: integer("source_id").notNull(),
    sourceRecordId: varchar("source_record_id", { length: 200 }).notNull(),
    sourceAttributes: jsonb("source_attributes").default({}),
    matchScore: doublePrecision("match_score"),
    matchReason: text("match_reason"),
    linkedAt: timestamp("linked_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_identity_link_cluster").on(table.clusterId),
    uniqueIndex("uq_identity_link_source").on(table.sourceId, table.sourceRecordId),
  ]
);

// ════════════════════════════════════════════════════════════════
// DATA PIPELINES (FABRIC) — DAGs of transforms
// ════════════════════════════════════════════════════════════════
export const fabricPipelinesTable = pgTable(
  "fabric_pipelines",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id"),
    pipelineKey: varchar("pipeline_key", { length: 100 }).notNull(),
    name: text("name").notNull(),
    description: text("description"),
    domain: varchar("domain", { length: 50 }),
    // DAG
    dag: jsonb("dag").$type<{
      nodes: Array<{
        id: string;
        type: string;
        name: string;
        params: Record<string, unknown>;
      }>;
      edges: Array<{ from: string; to: string }>;
    }>(),
    // Execution
    schedule: varchar("schedule", { length: 100 }),
    triggerType: varchar("trigger_type", { length: 30 }),
    // schedule|event|manual|dataset_ready|webhook
    triggerConfig: jsonb("trigger_config").default({}),
    maxRuntimeMinutes: integer("max_runtime_minutes"),
    retryPolicy: jsonb("retry_policy").default({}),
    // Bindings
    inputDatasetIds: jsonb("input_dataset_ids").$type<number[]>().default([]),
    outputDatasetIds: jsonb("output_dataset_ids").$type<number[]>().default([]),
    // State
    status: varchar("status", { length: 20 }).notNull().default("active"),
    lastRunAt: timestamp("last_run_at"),
    lastSuccessAt: timestamp("last_success_at"),
    lastFailureAt: timestamp("last_failure_at"),
    successRate: doublePrecision("success_rate"),
    avgDurationMs: integer("avg_duration_ms"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_fabric_pipeline_key").on(table.tenantId, table.pipelineKey),
    index("idx_fabric_pipeline_status").on(table.status),
  ]
);

// ════════════════════════════════════════════════════════════════
// DATA LINEAGE — upstream/downstream edges
// ════════════════════════════════════════════════════════════════
export const dataLineageTable = pgTable(
  "data_lineage",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id"),
    // From → To
    fromType: varchar("from_type", { length: 30 }).notNull(),
    // source|dataset|pipeline|transform|product|ontology|dashboard|model
    fromId: varchar("from_id", { length: 200 }).notNull(),
    fromLabel: text("from_label"),
    toType: varchar("to_type", { length: 30 }).notNull(),
    toId: varchar("to_id", { length: 200 }).notNull(),
    toLabel: text("to_label"),
    // Semantics
    relationship: varchar("relationship", { length: 50 }),
    // produces|consumes|derives_from|joins_with|uses|feeds|depends_on
    transformType: varchar("transform_type", { length: 50 }),
    fieldMapping: jsonb("field_mapping"),
    // Metadata
    pipelineId: integer("pipeline_id"),
    runId: integer("run_id"),
    observedAt: timestamp("observed_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_lineage_from").on(table.fromType, table.fromId),
    index("idx_lineage_to").on(table.toType, table.toId),
  ]
);

// ════════════════════════════════════════════════════════════════
// DATA QUALITY RULES
// ════════════════════════════════════════════════════════════════
export const dataQualityRulesTable = pgTable(
  "data_quality_rules",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id"),
    ruleKey: varchar("rule_key", { length: 100 }).notNull(),
    name: text("name").notNull(),
    description: text("description"),
    datasetId: integer("dataset_id"),
    fieldName: varchar("field_name", { length: 200 }),
    // Rule type
    ruleType: varchar("rule_type", { length: 50 }).notNull(),
    // not_null|unique|range|pattern|lookup|custom|schema_match|row_count|
    // freshness|referential_integrity|distribution|anomaly
    expression: text("expression"),
    parameters: jsonb("parameters").default({}),
    // Severity
    severity: varchar("severity", { length: 20 }).notNull().default("warning"),
    // info|warning|error|critical|blocking
    // Action
    onFailure: varchar("on_failure", { length: 30 }),
    // log|alert|block|quarantine
    enabled: boolean("enabled").default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_dq_rule_key").on(table.tenantId, table.ruleKey),
    index("idx_dq_rule_dataset").on(table.datasetId),
  ]
);

// ════════════════════════════════════════════════════════════════
// DATA QUALITY RESULTS
// ════════════════════════════════════════════════════════════════
export const dataQualityResultsTable = pgTable(
  "data_quality_results",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id"),
    ruleId: integer("rule_id").notNull(),
    datasetId: integer("dataset_id"),
    runId: integer("run_id"),
    // Results
    status: varchar("status", { length: 20 }).notNull(),
    // pass|warn|fail|error
    rowsChecked: integer("rows_checked"),
    rowsFailed: integer("rows_failed"),
    failurePercent: doublePrecision("failure_percent"),
    sampleFailures: jsonb("sample_failures"),
    message: text("message"),
    executedAt: timestamp("executed_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_dq_result_rule").on(table.ruleId),
    index("idx_dq_result_dataset").on(table.datasetId),
    index("idx_dq_result_time").on(table.executedAt),
  ]
);

// ════════════════════════════════════════════════════════════════
// FRESHNESS SLAs + MEASUREMENTS
// ════════════════════════════════════════════════════════════════
export const freshnessMeasurementsTable = pgTable(
  "freshness_measurements",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id"),
    datasetId: integer("dataset_id").notNull(),
    slaMinutes: integer("sla_minutes"),
    actualLagSeconds: integer("actual_lag_seconds"),
    status: varchar("status", { length: 20 }),
    // fresh|warning|stale|missing
    measuredAt: timestamp("measured_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_freshness_dataset").on(table.datasetId),
    index("idx_freshness_time").on(table.measuredAt),
  ]
);

// ════════════════════════════════════════════════════════════════
// SCHEMA VERSIONS — schema evolution history
// ════════════════════════════════════════════════════════════════
export const schemaVersionsTable = pgTable(
  "schema_versions",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id"),
    datasetId: integer("dataset_id").notNull(),
    version: integer("version").notNull(),
    schemaHash: varchar("schema_hash", { length: 64 }),
    schemaDefinition: jsonb("schema_definition"),
    changeSummary: text("change_summary"),
    // added|removed|modified|type_changed
    breakingChange: boolean("breaking_change").default(false),
    detectedAt: timestamp("detected_at").notNull().defaultNow(),
    adoptedAt: timestamp("adopted_at"),
  },
  (table) => [
    index("idx_schema_version_dataset").on(table.datasetId),
    uniqueIndex("uq_schema_version").on(table.datasetId, table.version),
  ]
);

// ════════════════════════════════════════════════════════════════
// WRITE-BACK ACTIONS — outbound actions to source systems
// ════════════════════════════════════════════════════════════════
export const writeBackActionsTable = pgTable(
  "write_back_actions",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id"),
    targetSourceId: integer("target_source_id").notNull(),
    actionType: varchar("action_type", { length: 50 }).notNull(),
    // update_record|insert_record|call_endpoint|trigger_workflow|send_message
    targetEntity: varchar("target_entity", { length: 100 }),
    targetRecordId: varchar("target_record_id", { length: 200 }),
    payload: jsonb("payload"),
    // Policy
    requiresApproval: boolean("requires_approval").default(false),
    approvedBy: integer("approved_by"),
    approvedAt: timestamp("approved_at"),
    // Execution
    status: varchar("status", { length: 20 }).notNull().default("queued"),
    // queued|running|success|failed|rolled_back
    executedAt: timestamp("executed_at"),
    result: jsonb("result"),
    errorMessage: text("error_message"),
    canRollback: boolean("can_rollback").default(false),
    rolledBackAt: timestamp("rolled_back_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_write_back_target").on(table.targetSourceId),
    index("idx_write_back_status").on(table.status),
  ]
);

// ════════════════════════════════════════════════════════════════
// CHANGE EVENTS — generic CDC event store
// ════════════════════════════════════════════════════════════════
export const changeEventsTable = pgTable(
  "change_events",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id"),
    sourceId: integer("source_id").notNull(),
    datasetId: integer("dataset_id"),
    operation: varchar("operation", { length: 20 }).notNull(),
    // insert|update|delete|upsert|truncate
    entityKey: varchar("entity_key", { length: 200 }),
    recordId: varchar("record_id", { length: 200 }),
    beforeValues: jsonb("before_values"),
    afterValues: jsonb("after_values"),
    changedFields: jsonb("changed_fields").$type<string[]>(),
    sourceTimestamp: timestamp("source_timestamp"),
    receivedAt: timestamp("received_at").notNull().defaultNow(),
    processedAt: timestamp("processed_at"),
    lsn: varchar("lsn", { length: 100 }),
    // log sequence number (for Postgres logical replication)
  },
  (table) => [
    index("idx_change_event_source").on(table.sourceId),
    index("idx_change_event_dataset").on(table.datasetId),
    index("idx_change_event_time").on(table.receivedAt),
  ]
);
