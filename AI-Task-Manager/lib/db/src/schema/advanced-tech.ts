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
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/**
 * BASH44 Advanced Technology Tables
 *
 * DB schemas for cutting-edge features:
 * - Vector embeddings (pgvector compatible structure)
 * - Real-time events log
 * - Graph relationships
 * - Time-series data
 * - Digital twin telemetry
 * - NL query history
 * - Blockchain audit trail
 * - IoT sensor data
 * - ML model registry
 * - Auto-ML experiments
 */

// ═══════════════════════════════════════════════════════════════
// VECTOR EMBEDDINGS — for RAG / semantic search
// ═══════════════════════════════════════════════════════════════
export const vectorEmbeddingsTable = pgTable(
  "vector_embeddings",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id"),
    documentId: varchar("document_id", { length: 100 }).notNull(),
    entityType: varchar("entity_type", { length: 100 }).notNull(),
    entityId: integer("entity_id"),
    content: text("content").notNull(),
    contentHash: varchar("content_hash", { length: 64 }),
    embedding: jsonb("embedding").$type<number[]>().notNull(),
    embeddingModel: varchar("embedding_model", { length: 100 }).notNull().default("text-embedding-3-small"),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_vector_entity").on(table.entityType, table.entityId),
    index("idx_vector_tenant").on(table.tenantId),
    uniqueIndex("uq_vector_doc").on(table.tenantId, table.documentId),
  ]
);

// ═══════════════════════════════════════════════════════════════
// REAL-TIME EVENTS LOG
// ═══════════════════════════════════════════════════════════════
export const realtimeEventsTable = pgTable(
  "realtime_events",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id"),
    eventId: varchar("event_id", { length: 64 }).notNull().unique(),
    eventType: varchar("event_type", { length: 100 }).notNull(),
    source: varchar("source", { length: 100 }).notNull(),
    userId: integer("user_id"),
    payload: jsonb("payload").notNull(),
    correlationId: varchar("correlation_id", { length: 100 }),
    processedAt: timestamp("processed_at"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_events_type").on(table.eventType),
    index("idx_events_created").on(table.createdAt),
    index("idx_events_correlation").on(table.correlationId),
  ]
);

// ═══════════════════════════════════════════════════════════════
// GRAPH RELATIONSHIPS (for business graph analytics)
// ═══════════════════════════════════════════════════════════════
export const graphNodesTable = pgTable("graph_nodes", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  nodeId: varchar("node_id", { length: 100 }).notNull().unique(),
  nodeType: varchar("node_type", { length: 50 }).notNull(),
  entityType: varchar("entity_type", { length: 100 }),
  entityId: integer("entity_id"),
  label: varchar("label", { length: 255 }),
  properties: jsonb("properties").default({}),
  pageRankScore: doublePrecision("page_rank_score").default(0),
  communityId: integer("community_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const graphEdgesTable = pgTable(
  "graph_edges",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id"),
    fromNode: varchar("from_node", { length: 100 }).notNull(),
    toNode: varchar("to_node", { length: 100 }).notNull(),
    edgeType: varchar("edge_type", { length: 50 }).notNull(),
    weight: doublePrecision("weight").default(1.0),
    properties: jsonb("properties").default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_edges_from").on(table.fromNode),
    index("idx_edges_to").on(table.toNode),
    index("idx_edges_type").on(table.edgeType),
  ]
);

// ═══════════════════════════════════════════════════════════════
// TIME-SERIES DATA (forecasting, KPIs)
// ═══════════════════════════════════════════════════════════════
export const timeSeriesDataTable = pgTable(
  "time_series_data",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id"),
    seriesKey: varchar("series_key", { length: 100 }).notNull(),
    entityType: varchar("entity_type", { length: 100 }),
    entityId: integer("entity_id"),
    timestamp: timestamp("timestamp").notNull(),
    value: doublePrecision("value").notNull(),
    dimensions: jsonb("dimensions").default({}),
    tags: jsonb("tags").default([]),
  },
  (table) => [
    index("idx_ts_series").on(table.seriesKey),
    index("idx_ts_time").on(table.timestamp),
    index("idx_ts_entity").on(table.entityType, table.entityId),
  ]
);

export const forecastResultsTable = pgTable("forecast_results", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  seriesKey: varchar("series_key", { length: 100 }).notNull(),
  modelType: varchar("model_type", { length: 50 }).notNull(),
  forecastHorizon: integer("forecast_horizon").notNull(),
  predictions: jsonb("predictions").notNull(),
  confidence: doublePrecision("confidence"),
  mae: doublePrecision("mae"),
  rmse: doublePrecision("rmse"),
  trainedAt: timestamp("trained_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ═══════════════════════════════════════════════════════════════
// DIGITAL TWIN — physical assets and IoT sensors
// ═══════════════════════════════════════════════════════════════
export const digitalTwinAssetsTable = pgTable("digital_twin_assets", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  assetId: varchar("asset_id", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  assetType: varchar("asset_type", { length: 50 }).notNull(),
  location: jsonb("location").notNull(),
  status: varchar("status", { length: 30 }).notNull().default("idle"),
  telemetry: jsonb("telemetry").default({}),
  oeeScore: doublePrecision("oee_score"),
  alertLevel: varchar("alert_level", { length: 20 }).default("green"),
  lastUpdate: timestamp("last_update").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const iotSensorReadingsTable = pgTable(
  "iot_sensor_readings",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id"),
    assetId: varchar("asset_id", { length: 100 }).notNull(),
    sensorType: varchar("sensor_type", { length: 50 }).notNull(),
    reading: doublePrecision("reading").notNull(),
    unit: varchar("unit", { length: 20 }),
    quality: varchar("quality", { length: 20 }).default("good"),
    timestamp: timestamp("timestamp").notNull().defaultNow(),
  },
  (table) => [
    index("idx_iot_asset_time").on(table.assetId, table.timestamp),
    index("idx_iot_sensor").on(table.sensorType),
  ]
);

export const predictiveMaintenanceTable = pgTable("predictive_maintenance", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  assetId: varchar("asset_id", { length: 100 }).notNull(),
  urgency: varchar("urgency", { length: 20 }).notNull(),
  predictedFailureDate: timestamp("predicted_failure_date"),
  confidenceScore: doublePrecision("confidence_score"),
  reasons: jsonb("reasons").default([]),
  recommendedAction: text("recommended_action"),
  status: varchar("status", { length: 30 }).notNull().default("active"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ═══════════════════════════════════════════════════════════════
// NATURAL LANGUAGE QUERY HISTORY
// ═══════════════════════════════════════════════════════════════
export const nlQueryHistoryTable = pgTable("nl_query_history", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  userId: integer("user_id"),
  queryText: text("query_text").notNull(),
  parsedIntent: jsonb("parsed_intent"),
  generatedSql: text("generated_sql"),
  executionMs: integer("execution_ms"),
  resultCount: integer("result_count"),
  success: boolean("success").default(true),
  errorMessage: text("error_message"),
  feedback: varchar("feedback", { length: 20 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ═══════════════════════════════════════════════════════════════
// BLOCKCHAIN AUDIT TRAIL — immutable record hashes
// ═══════════════════════════════════════════════════════════════
export const blockchainAuditTable = pgTable("blockchain_audit", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  blockNumber: integer("block_number").notNull(),
  previousHash: varchar("previous_hash", { length: 64 }),
  currentHash: varchar("current_hash", { length: 64 }).notNull(),
  recordType: varchar("record_type", { length: 100 }).notNull(),
  recordId: integer("record_id").notNull(),
  recordData: jsonb("record_data").notNull(),
  userId: integer("user_id"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  nonce: integer("nonce").default(0),
  verified: boolean("verified").default(false),
});

// ═══════════════════════════════════════════════════════════════
// ML MODEL REGISTRY
// ═══════════════════════════════════════════════════════════════
export const mlModelRegistryTable = pgTable("ml_model_registry", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  modelCode: varchar("model_code", { length: 100 }).notNull().unique(),
  modelName: varchar("model_name", { length: 255 }).notNull(),
  modelType: varchar("model_type", { length: 50 }).notNull(),
  framework: varchar("framework", { length: 50 }),
  version: varchar("version", { length: 20 }).notNull(),
  hyperparameters: jsonb("hyperparameters").default({}),
  trainMetrics: jsonb("train_metrics").default({}),
  validationMetrics: jsonb("validation_metrics").default({}),
  modelArtifactUrl: text("model_artifact_url"),
  status: varchar("status", { length: 30 }).notNull().default("training"),
  deployedAt: timestamp("deployed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const mlExperimentsTable = pgTable("ml_experiments", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  experimentId: varchar("experiment_id", { length: 100 }).notNull().unique(),
  modelCode: varchar("model_code", { length: 100 }).notNull(),
  datasetName: varchar("dataset_name", { length: 100 }),
  trainRows: integer("train_rows"),
  testRows: integer("test_rows"),
  metrics: jsonb("metrics").default({}),
  bestParams: jsonb("best_params").default({}),
  durationSec: integer("duration_sec"),
  status: varchar("status", { length: 30 }).default("running"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ═══════════════════════════════════════════════════════════════
// ANOMALY DETECTION RESULTS
// ═══════════════════════════════════════════════════════════════
export const anomalyDetectionsTable = pgTable("anomaly_detections", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  sourceEntity: varchar("source_entity", { length: 100 }).notNull(),
  entityId: integer("entity_id"),
  anomalyType: varchar("anomaly_type", { length: 50 }).notNull(),
  severity: varchar("severity", { length: 20 }).notNull(),
  anomalyScore: doublePrecision("anomaly_score").notNull(),
  expectedValue: doublePrecision("expected_value"),
  actualValue: doublePrecision("actual_value"),
  deviation: doublePrecision("deviation"),
  context: jsonb("context").default({}),
  status: varchar("status", { length: 30 }).default("new"),
  detectedAt: timestamp("detected_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
});

// ═══════════════════════════════════════════════════════════════
// COMPUTER VISION RESULTS (document OCR, defect detection)
// ═══════════════════════════════════════════════════════════════
export const computerVisionResultsTable = pgTable("computer_vision_results", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  imageUrl: text("image_url").notNull(),
  analysisType: varchar("analysis_type", { length: 50 }).notNull(),
  modelVersion: varchar("model_version", { length: 50 }),
  detections: jsonb("detections").default([]),
  extractedText: text("extracted_text"),
  confidence: doublePrecision("confidence"),
  processingMs: integer("processing_ms"),
  relatedEntityType: varchar("related_entity_type", { length: 100 }),
  relatedEntityId: integer("related_entity_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
