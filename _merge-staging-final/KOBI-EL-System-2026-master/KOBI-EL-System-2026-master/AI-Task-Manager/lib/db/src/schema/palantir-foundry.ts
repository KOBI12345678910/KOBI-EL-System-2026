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
 * BASH44 Palantir-Style Foundry Platform
 *
 * Replicates Palantir Foundry + Gotham + AIP core capabilities:
 *
 * FOUNDRY CORE:
 * - Ontology (Object Types, Property Types, Link Types, Action Types)
 * - Pipeline Builder (transformations, lineage)
 * - Code Workspace (notebooks, datasets)
 *
 * GOTHAM CORE:
 * - Link Analysis (entity graphs)
 * - Dossiers (investigation profiles)
 * - Timeline Analysis
 * - Map / Geospatial Analysis
 *
 * AIP CORE:
 * - Agent Studio (build & deploy AI agents)
 * - Model Orchestration
 * - LLM Gateway
 */

// ═══════════════════════════════════════════════════════════════
// ONTOLOGY — the heart of Palantir Foundry
// ═══════════════════════════════════════════════════════════════

/**
 * Object Types — the "classes" in the ontology
 * Examples: Customer, Supplier, PurchaseOrder, Project
 */
export const ontologyObjectTypesTable = pgTable(
  "ontology_object_types",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id"),
    apiName: varchar("api_name", { length: 100 }).notNull(),
    displayName: varchar("display_name", { length: 255 }).notNull(),
    displayNameHe: varchar("display_name_he", { length: 255 }),
    pluralName: varchar("plural_name", { length: 255 }),
    icon: varchar("icon", { length: 100 }),
    color: varchar("color", { length: 20 }),
    description: text("description"),
    primaryKeyField: varchar("primary_key_field", { length: 100 }).notNull(),
    titleField: varchar("title_field", { length: 100 }),
    subtitleField: varchar("subtitle_field", { length: 100 }),
    sourceEntity: varchar("source_entity", { length: 100 }),
    status: varchar("status", { length: 30 }).notNull().default("ACTIVE"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("uq_ontology_object_type").on(table.tenantId, table.apiName)]
);

/**
 * Property Types — fields on object types
 */
export const ontologyPropertyTypesTable = pgTable("ontology_property_types", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  objectTypeId: integer("object_type_id").notNull(),
  apiName: varchar("api_name", { length: 100 }).notNull(),
  displayName: varchar("display_name", { length: 255 }).notNull(),
  displayNameHe: varchar("display_name_he", { length: 255 }),
  dataType: varchar("data_type", { length: 50 }).notNull(),
  isRequired: boolean("is_required").notNull().default(false),
  isIndexed: boolean("is_indexed").notNull().default(false),
  isSearchable: boolean("is_searchable").notNull().default(true),
  defaultValue: text("default_value"),
  validationRules: jsonb("validation_rules").default([]),
  description: text("description"),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * Link Types — relationships between object types
 */
export const ontologyLinkTypesTable = pgTable("ontology_link_types", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  apiName: varchar("api_name", { length: 100 }).notNull(),
  displayName: varchar("display_name", { length: 255 }).notNull(),
  displayNameHe: varchar("display_name_he", { length: 255 }),
  fromObjectTypeId: integer("from_object_type_id").notNull(),
  toObjectTypeId: integer("to_object_type_id").notNull(),
  cardinality: varchar("cardinality", { length: 20 }).notNull().default("MANY_TO_MANY"),
  isSymmetric: boolean("is_symmetric").notNull().default(false),
  inverseApiName: varchar("inverse_api_name", { length: 100 }),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * Action Types — mutating operations on objects (with approval workflows)
 */
export const ontologyActionTypesTable = pgTable("ontology_action_types", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  apiName: varchar("api_name", { length: 100 }).notNull(),
  displayName: varchar("display_name", { length: 255 }).notNull(),
  displayNameHe: varchar("display_name_he", { length: 255 }),
  objectTypeId: integer("object_type_id"),
  actionKind: varchar("action_kind", { length: 30 }).notNull(),
  parameters: jsonb("parameters").default([]),
  rules: jsonb("rules").default([]),
  requiresApproval: boolean("requires_approval").notNull().default(false),
  approverRole: varchar("approver_role", { length: 100 }),
  statusOnSuccess: varchar("status_on_success", { length: 50 }),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * Action Executions — audit log of all actions run
 */
export const ontologyActionExecutionsTable = pgTable("ontology_action_executions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  actionTypeId: integer("action_type_id").notNull(),
  objectType: varchar("object_type", { length: 100 }),
  objectId: varchar("object_id", { length: 100 }),
  parameters: jsonb("parameters").notNull(),
  executedBy: integer("executed_by"),
  status: varchar("status", { length: 30 }).notNull(),
  approvedBy: integer("approved_by"),
  approvedAt: timestamp("approved_at"),
  errorMessage: text("error_message"),
  beforeState: jsonb("before_state"),
  afterState: jsonb("after_state"),
  executedAt: timestamp("executed_at").notNull().defaultNow(),
});

// ═══════════════════════════════════════════════════════════════
// DOSSIERS — investigation profiles (Gotham-style)
// ═══════════════════════════════════════════════════════════════

export const dossiersTable = pgTable("dossiers", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  subjectType: varchar("subject_type", { length: 100 }),
  subjectId: varchar("subject_id", { length: 100 }),
  status: varchar("status", { length: 30 }).notNull().default("DRAFT"),
  priority: varchar("priority", { length: 20 }).default("MEDIUM"),
  classification: varchar("classification", { length: 30 }).default("INTERNAL"),
  assignedTo: integer("assigned_to"),
  tags: jsonb("tags").default([]),
  sharedWith: jsonb("shared_with").default([]),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const dossierSectionsTable = pgTable("dossier_sections", {
  id: serial("id").primaryKey(),
  dossierId: integer("dossier_id").notNull(),
  sectionType: varchar("section_type", { length: 50 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  content: jsonb("content").notNull(),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ═══════════════════════════════════════════════════════════════
// TIMELINE ANALYSIS — events over time
// ═══════════════════════════════════════════════════════════════

export const timelineEventsTable = pgTable(
  "timeline_events",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id"),
    eventTime: timestamp("event_time").notNull(),
    eventType: varchar("event_type", { length: 100 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    entityType: varchar("entity_type", { length: 100 }),
    entityId: varchar("entity_id", { length: 100 }),
    location: jsonb("location"),
    actors: jsonb("actors").default([]),
    relatedEvents: jsonb("related_events").default([]),
    tags: jsonb("tags").default([]),
    severity: varchar("severity", { length: 20 }).default("INFO"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_timeline_time").on(table.eventTime),
    index("idx_timeline_entity").on(table.entityType, table.entityId),
  ]
);

// ═══════════════════════════════════════════════════════════════
// GEOSPATIAL — map analysis
// ═══════════════════════════════════════════════════════════════

export const geospatialEntitiesTable = pgTable(
  "geospatial_entities",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id"),
    entityType: varchar("entity_type", { length: 100 }).notNull(),
    entityId: varchar("entity_id", { length: 100 }).notNull(),
    label: varchar("label", { length: 255 }),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    altitude: doublePrecision("altitude"),
    geometry: jsonb("geometry"),
    properties: jsonb("properties").default({}),
    timestamp: timestamp("timestamp"),
    layerId: varchar("layer_id", { length: 100 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_geo_coords").on(table.latitude, table.longitude),
    index("idx_geo_entity").on(table.entityType, table.entityId),
  ]
);

// ═══════════════════════════════════════════════════════════════
// PIPELINE BUILDER — data transformations (Foundry-style)
// ═══════════════════════════════════════════════════════════════

export const dataPipelinesTable = pgTable("data_pipelines", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  pipelineType: varchar("pipeline_type", { length: 50 }).notNull().default("BATCH"),
  schedule: varchar("schedule", { length: 100 }),
  status: varchar("status", { length: 30 }).notNull().default("DRAFT"),
  graph: jsonb("graph").notNull(),
  version: integer("version").notNull().default(1),
  createdBy: integer("created_by"),
  lastRunAt: timestamp("last_run_at"),
  lastRunStatus: varchar("last_run_status", { length: 30 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const pipelineRunsTable = pgTable("pipeline_runs", {
  id: serial("id").primaryKey(),
  pipelineId: integer("pipeline_id").notNull(),
  tenantId: integer("tenant_id"),
  status: varchar("status", { length: 30 }).notNull(),
  startedAt: timestamp("started_at").notNull(),
  finishedAt: timestamp("finished_at"),
  durationMs: integer("duration_ms"),
  rowsProcessed: integer("rows_processed"),
  errorMessage: text("error_message"),
  stageResults: jsonb("stage_results").default({}),
  triggeredBy: varchar("triggered_by", { length: 100 }),
});

export const datasetsTable = pgTable("datasets", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  schema: jsonb("schema").notNull(),
  rowCount: integer("row_count").default(0),
  sizeBytes: integer("size_bytes").default(0),
  storageUrl: text("storage_url"),
  sourcePipelineId: integer("source_pipeline_id"),
  tags: jsonb("tags").default([]),
  version: integer("version").notNull().default(1),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const datasetLineageTable = pgTable("dataset_lineage", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  sourceDatasetId: integer("source_dataset_id").notNull(),
  targetDatasetId: integer("target_dataset_id").notNull(),
  pipelineId: integer("pipeline_id"),
  transformationType: varchar("transformation_type", { length: 50 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ═══════════════════════════════════════════════════════════════
// CODE WORKSPACE — notebooks (Jupyter-like)
// ═══════════════════════════════════════════════════════════════

export const codeWorkspacesTable = pgTable("code_workspaces", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  language: varchar("language", { length: 30 }).notNull().default("sql"),
  kernelType: varchar("kernel_type", { length: 50 }).default("python3"),
  ownerId: integer("owner_id"),
  sharedWith: jsonb("shared_with").default([]),
  attachedDatasets: jsonb("attached_datasets").default([]),
  lastAccessedAt: timestamp("last_accessed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const notebookCellsTable = pgTable("notebook_cells", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull(),
  cellType: varchar("cell_type", { length: 20 }).notNull().default("code"),
  content: text("content").notNull(),
  output: text("output"),
  executionCount: integer("execution_count").default(0),
  sortOrder: integer("sort_order").default(0),
  lastExecutedAt: timestamp("last_executed_at"),
  durationMs: integer("duration_ms"),
});

// ═══════════════════════════════════════════════════════════════
// AIP — AI Platform Agent Studio
// ═══════════════════════════════════════════════════════════════

export const aipAgentsTable = pgTable("aip_agents", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  name: varchar("name", { length: 255 }).notNull(),
  displayName: varchar("display_name", { length: 255 }),
  description: text("description"),
  agentType: varchar("agent_type", { length: 50 }).notNull(),
  modelProvider: varchar("model_provider", { length: 50 }).notNull().default("claude"),
  modelName: varchar("model_name", { length: 100 }).notNull(),
  systemPrompt: text("system_prompt"),
  tools: jsonb("tools").default([]),
  contextSources: jsonb("context_sources").default([]),
  guardrails: jsonb("guardrails").default([]),
  maxIterations: integer("max_iterations").default(10),
  temperature: doublePrecision("temperature").default(0.7),
  status: varchar("status", { length: 30 }).notNull().default("DRAFT"),
  deployedAt: timestamp("deployed_at"),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const aipAgentSessionsTable = pgTable("aip_agent_sessions", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull(),
  tenantId: integer("tenant_id"),
  userId: integer("user_id"),
  sessionName: varchar("session_name", { length: 255 }),
  messages: jsonb("messages").default([]),
  toolCalls: jsonb("tool_calls").default([]),
  tokensUsed: integer("tokens_used").default(0),
  status: varchar("status", { length: 30 }).default("active"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  endedAt: timestamp("ended_at"),
});

export const aipLlmGatewayLogsTable = pgTable("aip_llm_gateway_logs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  provider: varchar("provider", { length: 50 }).notNull(),
  model: varchar("model", { length: 100 }).notNull(),
  requestType: varchar("request_type", { length: 30 }),
  promptTokens: integer("prompt_tokens"),
  completionTokens: integer("completion_tokens"),
  totalTokens: integer("total_tokens"),
  latencyMs: integer("latency_ms"),
  cost: doublePrecision("cost"),
  status: varchar("status", { length: 30 }),
  userId: integer("user_id"),
  agentId: integer("agent_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ═══════════════════════════════════════════════════════════════
// SEARCH / CONTOUR — interactive data exploration
// ═══════════════════════════════════════════════════════════════

export const savedViewsTable = pgTable("saved_views", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  viewType: varchar("view_type", { length: 50 }).notNull(),
  objectTypeId: integer("object_type_id"),
  filters: jsonb("filters").default([]),
  groupBy: jsonb("group_by").default([]),
  aggregations: jsonb("aggregations").default([]),
  sortBy: jsonb("sort_by").default([]),
  visualizationConfig: jsonb("visualization_config").default({}),
  isPublic: boolean("is_public").notNull().default(false),
  ownerId: integer("owner_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ═══════════════════════════════════════════════════════════════
// ENTITY RESOLUTION — de-duplication / matching
// ═══════════════════════════════════════════════════════════════

export const entityResolutionCandidatesTable = pgTable("entity_resolution_candidates", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  entityType: varchar("entity_type", { length: 100 }).notNull(),
  sourceEntityId: varchar("source_entity_id", { length: 100 }).notNull(),
  candidateEntityId: varchar("candidate_entity_id", { length: 100 }).notNull(),
  matchScore: doublePrecision("match_score").notNull(),
  matchReasons: jsonb("match_reasons").default([]),
  status: varchar("status", { length: 30 }).notNull().default("pending"),
  resolvedBy: integer("resolved_by"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
