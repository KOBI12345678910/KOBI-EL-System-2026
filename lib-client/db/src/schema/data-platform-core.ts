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
 * BASH44 Data Platform Core — production-grade tables mirroring
 * the user's reference architecture.
 *
 * These complement data-fabric.ts with the orchestration-centric
 * tables needed for a real ingestion platform:
 *
 *   - raw_ingestion          → append-only raw record log (replay/audit)
 *   - curated_entities       → canonical entities merged across sources
 *   - platform_event_store   → full domain event log
 *   - quarantine_records     → failed records with issue details
 *   - data_quality_issues    → structured quality issues (per record/rule)
 *   - source_descriptors     → universal source declarations
 *   - schema_registry_entries → versioned schemas (with evolution)
 *   - pipeline_runs_core     → orchestrated pipeline executions
 *   - pipeline_metrics       → per-pipeline running metrics
 *   - ontology_hydrations    → canonical → ontology object mappings
 *   - tenant_isolation_scopes → multi-tenant data boundaries
 *   - ai_context_snapshots   → Claude-ready context packets
 */

// ════════════════════════════════════════════════════════════════
// RAW INGESTION — append-only log of every record we received
// ════════════════════════════════════════════════════════════════
export const rawIngestionTable = pgTable(
  "raw_ingestion",
  {
    id: serial("id").primaryKey(),
    recordId: varchar("record_id", { length: 100 }).notNull(),
    tenantId: integer("tenant_id"),
    sourceId: integer("source_id").notNull(),
    sourceRecordId: varchar("source_record_id", { length: 200 }),
    schemaName: varchar("schema_name", { length: 100 }).notNull(),
    schemaVersion: varchar("schema_version", { length: 20 }).notNull(),
    payload: jsonb("payload").notNull(),
    ingestedAt: timestamp("ingested_at").notNull().defaultNow(),
    batchId: varchar("batch_id", { length: 100 }),
    correlationId: varchar("correlation_id", { length: 100 }),
    sourceTimestamp: timestamp("source_timestamp"),
    // Delivery metadata
    deliveryAttempt: integer("delivery_attempt").default(1),
    ingestionMode: varchar("ingestion_mode", { length: 30 }),
    // Identity — original source-assigned IDs
    externalKeys: jsonb("external_keys").default({}),
    // Processing state
    processed: boolean("processed").default(false),
    processingErrorMessage: text("processing_error_message"),
  },
  (table) => [
    uniqueIndex("uq_raw_record_id").on(table.recordId),
    index("idx_raw_source_time").on(table.sourceId, table.ingestedAt),
    index("idx_raw_batch").on(table.batchId),
    index("idx_raw_correlation").on(table.correlationId),
    index("idx_raw_processed").on(table.processed),
  ]
);

// ════════════════════════════════════════════════════════════════
// CURATED ENTITIES — canonical entities merged across sources
// ════════════════════════════════════════════════════════════════
export const curatedEntitiesTable = pgTable(
  "curated_entities",
  {
    id: serial("id").primaryKey(),
    canonicalId: varchar("canonical_id", { length: 200 }).notNull(),
    tenantId: integer("tenant_id"),
    entityType: varchar("entity_type", { length: 100 }).notNull(),
    // Merged data
    properties: jsonb("properties").default({}),
    sourceLinks: jsonb("source_links").$type<Array<{
      sourceId: number;
      sourceRecordId: string;
      sourceLabel?: string;
      matchScore?: number;
    }>>().default([]),
    // Confidence + quality
    mergeConfidence: doublePrecision("merge_confidence"),
    qualityScore: doublePrecision("quality_score"),
    // Versioning
    version: integer("version").default(1),
    // Lifecycle
    lifecycleState: varchar("lifecycle_state", { length: 30 }).default("active"),
    // Ontology binding
    ontologyObjectType: varchar("ontology_object_type", { length: 100 }),
    hydratedToOntology: boolean("hydrated_to_ontology").default(false),
    // Time
    firstSeenAt: timestamp("first_seen_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_curated_canonical").on(table.tenantId, table.canonicalId),
    index("idx_curated_type").on(table.entityType),
    index("idx_curated_updated").on(table.updatedAt),
    index("idx_curated_hydrated").on(table.hydratedToOntology),
  ]
);

// ════════════════════════════════════════════════════════════════
// PLATFORM EVENT STORE — full domain event log (time-ordered)
// ════════════════════════════════════════════════════════════════
export const platformEventStoreTable = pgTable(
  "platform_event_store",
  {
    id: serial("id").primaryKey(),
    eventId: varchar("event_id", { length: 100 }).notNull(),
    tenantId: integer("tenant_id"),
    eventType: varchar("event_type", { length: 100 }).notNull(),
    schemaVersion: varchar("schema_version", { length: 20 }).default("1.0"),
    // Entity target
    canonicalEntityId: varchar("canonical_entity_id", { length: 200 }),
    entityType: varchar("entity_type", { length: 100 }),
    // Source
    sourceId: integer("source_id"),
    sourceRecordId: varchar("source_record_id", { length: 200 }),
    actor: varchar("actor", { length: 100 }),
    // Causation chain
    correlationId: varchar("correlation_id", { length: 100 }),
    causationId: varchar("causation_id", { length: 100 }),
    // Payload
    payload: jsonb("payload"),
    severity: varchar("severity", { length: 20 }).default("info"),
    // Time
    eventTimestamp: timestamp("event_timestamp").notNull(),
    receivedAt: timestamp("received_at").notNull().defaultNow(),
    // Replay
    sequenceNumber: integer("sequence_number"),
  },
  (table) => [
    uniqueIndex("uq_platform_event").on(table.eventId),
    index("idx_event_entity").on(table.canonicalEntityId),
    index("idx_event_type_time").on(table.eventType, table.eventTimestamp),
    index("idx_event_correlation").on(table.correlationId),
    index("idx_event_tenant_time").on(table.tenantId, table.eventTimestamp),
  ]
);

// ════════════════════════════════════════════════════════════════
// QUARANTINE RECORDS — records that failed validation
// ════════════════════════════════════════════════════════════════
export const quarantineRecordsTable = pgTable(
  "quarantine_records",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id"),
    sourceId: integer("source_id").notNull(),
    rawRecordId: varchar("raw_record_id", { length: 100 }),
    schemaName: varchar("schema_name", { length: 100 }),
    schemaVersion: varchar("schema_version", { length: 20 }),
    payload: jsonb("payload"),
    // Issues
    disposition: varchar("disposition", { length: 30 }).notNull(),
    // rejected|quarantined
    issues: jsonb("issues").$type<Array<{
      ruleName: string;
      severity: string;
      message: string;
      field?: string;
    }>>().notNull().default([]),
    issueSummary: text("issue_summary"),
    // State
    status: varchar("status", { length: 20 }).notNull().default("quarantined"),
    // quarantined|reviewing|released|discarded
    reviewedBy: integer("reviewed_by"),
    reviewedAt: timestamp("reviewed_at"),
    releasedAt: timestamp("released_at"),
    // Time
    quarantinedAt: timestamp("quarantined_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_quarantine_source").on(table.sourceId),
    index("idx_quarantine_status").on(table.status),
    index("idx_quarantine_time").on(table.quarantinedAt),
  ]
);

// ════════════════════════════════════════════════════════════════
// DATA QUALITY ISSUES — structured issues per record/rule
// ════════════════════════════════════════════════════════════════
export const dataQualityIssuesTable = pgTable(
  "data_quality_issues",
  {
    id: serial("id").primaryKey(),
    issueId: varchar("issue_id", { length: 100 }).notNull(),
    tenantId: integer("tenant_id"),
    sourceId: integer("source_id"),
    datasetKey: varchar("dataset_key", { length: 200 }),
    ruleName: varchar("rule_name", { length: 100 }).notNull(),
    severity: varchar("severity", { length: 20 }).notNull(),
    // info|warning|high|critical
    message: text("message").notNull(),
    // Target
    recordId: varchar("record_id", { length: 100 }),
    fieldName: varchar("field_name", { length: 200 }),
    expectedValue: text("expected_value"),
    actualValue: text("actual_value"),
    // Lifecycle
    status: varchar("status", { length: 20 }).default("open"),
    // open|acknowledged|resolved|suppressed
    resolvedBy: integer("resolved_by"),
    resolvedAt: timestamp("resolved_at"),
    resolutionNotes: text("resolution_notes"),
    // Time
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_dq_issue_id").on(table.issueId),
    index("idx_dq_issue_source").on(table.sourceId),
    index("idx_dq_issue_rule").on(table.ruleName),
    index("idx_dq_issue_severity").on(table.severity),
    index("idx_dq_issue_status").on(table.status),
  ]
);

// ════════════════════════════════════════════════════════════════
// SCHEMA REGISTRY ENTRIES — versioned schemas
// ════════════════════════════════════════════════════════════════
export const schemaRegistryTable = pgTable(
  "schema_registry_entries",
  {
    id: serial("id").primaryKey(),
    schemaId: varchar("schema_id", { length: 100 }).notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    version: varchar("version", { length: 20 }).notNull(),
    // Content
    fields: jsonb("fields").$type<Array<{
      name: string;
      fieldType: string;
      nullable?: boolean;
      description?: string;
      semanticType?: string;
    }>>().notNull(),
    primaryKey: varchar("primary_key", { length: 100 }),
    // Metadata
    ownerId: integer("owner_id"),
    domain: varchar("domain", { length: 50 }),
    description: text("description"),
    // Compatibility
    compatibilityMode: varchar("compatibility_mode", { length: 30 }).default("backward"),
    // backward|forward|full|none
    isBreakingChange: boolean("is_breaking_change").default(false),
    previousVersion: varchar("previous_version", { length: 20 }),
    // Lifecycle
    status: varchar("status", { length: 20 }).default("active"),
    // draft|active|deprecated|retired
    registeredAt: timestamp("registered_at").notNull().defaultNow(),
    retiredAt: timestamp("retired_at"),
  },
  (table) => [
    uniqueIndex("uq_schema_name_version").on(table.name, table.version),
    index("idx_schema_name").on(table.name),
    index("idx_schema_status").on(table.status),
  ]
);

// ════════════════════════════════════════════════════════════════
// PIPELINE RUNS CORE — orchestrated executions
// ════════════════════════════════════════════════════════════════
export const pipelineRunsCoreTable = pgTable(
  "pipeline_runs_core",
  {
    id: serial("id").primaryKey(),
    runId: varchar("run_id", { length: 100 }).notNull(),
    tenantId: integer("tenant_id"),
    pipelineName: varchar("pipeline_name", { length: 200 }).notNull(),
    pipelineVersion: varchar("pipeline_version", { length: 20 }),
    // Trigger
    triggerType: varchar("trigger_type", { length: 30 }),
    // schedule|event|manual|backfill|replay
    triggerBy: varchar("trigger_by", { length: 100 }),
    // Time
    startedAt: timestamp("started_at").notNull(),
    finishedAt: timestamp("finished_at"),
    durationMs: integer("duration_ms"),
    // Status
    status: varchar("status", { length: 20 }).notNull(),
    // queued|running|success|failed|partial|cancelled
    // Counts
    recordsRead: integer("records_read").default(0),
    recordsAccepted: integer("records_accepted").default(0),
    recordsQuarantined: integer("records_quarantined").default(0),
    recordsRejected: integer("records_rejected").default(0),
    eventsEmitted: integer("events_emitted").default(0),
    // Watermark
    watermarkStart: varchar("watermark_start", { length: 200 }),
    watermarkEnd: varchar("watermark_end", { length: 200 }),
    // Errors
    errorMessage: text("error_message"),
    errorStack: text("error_stack"),
    // Metadata
    metadata: jsonb("metadata").default({}),
  },
  (table) => [
    uniqueIndex("uq_pipeline_run_id").on(table.runId),
    index("idx_pipeline_run_name").on(table.pipelineName),
    index("idx_pipeline_run_status").on(table.status),
    index("idx_pipeline_run_time").on(table.startedAt),
  ]
);

// ════════════════════════════════════════════════════════════════
// PIPELINE METRICS — running metrics per pipeline
// ════════════════════════════════════════════════════════════════
export const pipelineMetricsTable = pgTable(
  "pipeline_metrics",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id"),
    pipelineName: varchar("pipeline_name", { length: 200 }).notNull(),
    // Running totals
    totalRuns: integer("total_runs").default(0),
    successfulRuns: integer("successful_runs").default(0),
    failedRuns: integer("failed_runs").default(0),
    recordsAccepted: integer("records_accepted").default(0),
    recordsQuarantined: integer("records_quarantined").default(0),
    eventsEmitted: integer("events_emitted").default(0),
    // Performance
    avgDurationMs: integer("avg_duration_ms"),
    p95DurationMs: integer("p95_duration_ms"),
    // Recent
    lastRunAt: timestamp("last_run_at"),
    lastSuccessAt: timestamp("last_success_at"),
    lastFailureAt: timestamp("last_failure_at"),
    lastError: text("last_error"),
    // Health
    healthScore: doublePrecision("health_score"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_pipeline_metrics").on(table.tenantId, table.pipelineName),
    index("idx_pipeline_metrics_health").on(table.healthScore),
  ]
);

// ════════════════════════════════════════════════════════════════
// ONTOLOGY HYDRATIONS — canonical → ontology object mappings
// ════════════════════════════════════════════════════════════════
export const ontologyHydrationsTable = pgTable(
  "ontology_hydrations",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id"),
    canonicalId: varchar("canonical_id", { length: 200 }).notNull(),
    ontologyObjectType: varchar("ontology_object_type", { length: 100 }).notNull(),
    ontologyObjectId: varchar("ontology_object_id", { length: 200 }).notNull(),
    // Operation
    operation: varchar("operation", { length: 20 }).notNull(),
    // create|update|link|unlink|state_change
    propertiesSet: jsonb("properties_set").default({}),
    relationshipsSet: jsonb("relationships_set").default([]),
    stateSet: varchar("state_set", { length: 60 }),
    // Success tracking
    status: varchar("status", { length: 20 }).notNull().default("success"),
    errorMessage: text("error_message"),
    // Source
    sourceEventId: varchar("source_event_id", { length: 100 }),
    pipelineRunId: varchar("pipeline_run_id", { length: 100 }),
    // Time
    hydratedAt: timestamp("hydrated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_hydration_canonical").on(table.canonicalId),
    index("idx_hydration_object_type").on(table.ontologyObjectType),
    index("idx_hydration_status").on(table.status),
    index("idx_hydration_time").on(table.hydratedAt),
  ]
);

// ════════════════════════════════════════════════════════════════
// TENANT ISOLATION SCOPES — multi-tenant data boundaries
// ════════════════════════════════════════════════════════════════
export const tenantIsolationScopesTable = pgTable(
  "tenant_isolation_scopes",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull(),
    resourceType: varchar("resource_type", { length: 50 }).notNull(),
    // source|dataset|pipeline|object_type|canonical_entity
    resourceKey: varchar("resource_key", { length: 200 }).notNull(),
    // Access policy
    readRoles: jsonb("read_roles").$type<string[]>().default([]),
    writeRoles: jsonb("write_roles").$type<string[]>().default([]),
    adminRoles: jsonb("admin_roles").$type<string[]>().default([]),
    // Classification
    sensitivityLevel: varchar("sensitivity_level", { length: 20 }).default("internal"),
    // public|internal|confidential|restricted|pii
    containsPii: boolean("contains_pii").default(false),
    // Audit
    lastAccessedBy: integer("last_accessed_by"),
    lastAccessedAt: timestamp("last_accessed_at"),
    accessCount: integer("access_count").default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_tenant_scope").on(table.tenantId, table.resourceType, table.resourceKey),
    index("idx_tenant_scope_type").on(table.resourceType),
    index("idx_tenant_scope_sens").on(table.sensitivityLevel),
  ]
);

// ════════════════════════════════════════════════════════════════
// AI CONTEXT SNAPSHOTS — Claude-ready context packets
// ════════════════════════════════════════════════════════════════
export const aiContextSnapshotsTable = pgTable(
  "ai_context_snapshots",
  {
    id: serial("id").primaryKey(),
    snapshotId: varchar("snapshot_id", { length: 100 }).notNull(),
    tenantId: integer("tenant_id"),
    // Target
    contextType: varchar("context_type", { length: 50 }).notNull(),
    // entity|query|situation|forecast|explanation
    targetEntityType: varchar("target_entity_type", { length: 100 }),
    targetEntityId: varchar("target_entity_id", { length: 200 }),
    // Content
    entities: jsonb("entities").default([]),
    relationships: jsonb("relationships").default([]),
    recentEvents: jsonb("recent_events").default([]),
    currentState: jsonb("current_state").default({}),
    workflowContext: jsonb("workflow_context").default({}),
    riskContext: jsonb("risk_context").default({}),
    financialContext: jsonb("financial_context").default({}),
    lineageContext: jsonb("lineage_context").default({}),
    // Freshness & security
    dataFreshness: jsonb("data_freshness").default({}),
    permissionScope: jsonb("permission_scope").default({}),
    // Size metrics
    tokenCount: integer("token_count"),
    entityCount: integer("entity_count"),
    // Time
    generatedAt: timestamp("generated_at").notNull().defaultNow(),
    ttlSeconds: integer("ttl_seconds").default(300),
    expiresAt: timestamp("expires_at"),
  },
  (table) => [
    uniqueIndex("uq_ai_context_snapshot").on(table.snapshotId),
    index("idx_ai_context_entity").on(table.targetEntityType, table.targetEntityId),
    index("idx_ai_context_time").on(table.generatedAt),
  ]
);
