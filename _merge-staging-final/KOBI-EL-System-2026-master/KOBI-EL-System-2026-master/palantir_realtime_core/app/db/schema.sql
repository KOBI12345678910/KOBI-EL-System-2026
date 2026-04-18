-- ================================================================
-- Palantir-Style Realtime Data Core — PostgreSQL schema
-- ================================================================
-- This is the full physical schema for the production platform.
-- All tables are multi-tenant (tenant_id). Event store is append-only.
-- Audit log is hash-chained (immutable). Identity resolution has its
-- own cluster + links tables. Workflow runtime uses state machine
-- definitions + instances. Data quality has rules + issues.
-- ================================================================

CREATE SCHEMA IF NOT EXISTS platform;
SET search_path TO platform, public;

-- ─── Tenants ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  tenant_id        TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  tier             TEXT NOT NULL DEFAULT 'standard',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata         JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- ─── Users + Roles + Permissions ───────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  user_id          TEXT PRIMARY KEY,
  tenant_id        TEXT NOT NULL REFERENCES tenants(tenant_id),
  email            TEXT NOT NULL,
  display_name     TEXT,
  status           TEXT NOT NULL DEFAULT 'active',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at    TIMESTAMPTZ,
  UNIQUE (tenant_id, email)
);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);

CREATE TABLE IF NOT EXISTS roles (
  role_id          TEXT PRIMARY KEY,
  tenant_id        TEXT NOT NULL REFERENCES tenants(tenant_id),
  name             TEXT NOT NULL,
  description      TEXT,
  permissions      JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id          TEXT NOT NULL REFERENCES users(user_id),
  role_id          TEXT NOT NULL REFERENCES roles(role_id),
  granted_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  granted_by       TEXT,
  PRIMARY KEY (user_id, role_id)
);

-- ─── Source descriptors ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS source_descriptors (
  source_id            TEXT PRIMARY KEY,
  tenant_id            TEXT NOT NULL REFERENCES tenants(tenant_id),
  name                 TEXT NOT NULL,
  source_type          TEXT NOT NULL,   -- postgres|rest|webhook|kafka|file|iot|...
  ingestion_mode       TEXT NOT NULL,   -- batch|incremental|cdc|stream|webhook|file_drop
  owner                TEXT,
  freshness_sla_sec    INT,
  enabled              BOOLEAN NOT NULL DEFAULT TRUE,
  status               TEXT NOT NULL DEFAULT 'active',
  last_sync_at         TIMESTAMPTZ,
  health_score         NUMERIC,
  config               JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata             JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_source_tenant ON source_descriptors(tenant_id);
CREATE INDEX IF NOT EXISTS idx_source_type ON source_descriptors(source_type);

-- ─── Schema registry ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schemas (
  schema_id        TEXT PRIMARY KEY,
  tenant_id        TEXT REFERENCES tenants(tenant_id),
  name             TEXT NOT NULL,
  version          TEXT NOT NULL,
  fields           JSONB NOT NULL,              -- [{name,type,nullable,semantic}]
  primary_key      TEXT,
  compatibility    TEXT DEFAULT 'backward',
  owner            TEXT,
  status           TEXT DEFAULT 'active',
  registered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retired_at       TIMESTAMPTZ,
  UNIQUE (tenant_id, name, version)
);
CREATE INDEX IF NOT EXISTS idx_schema_name ON schemas(name);

-- ─── Raw ingestion (append-only) ───────────────────────────────
CREATE TABLE IF NOT EXISTS raw_ingestion (
  raw_id               BIGSERIAL PRIMARY KEY,
  tenant_id            TEXT NOT NULL,
  source_id            TEXT NOT NULL,
  source_record_id     TEXT NOT NULL,
  schema_name          TEXT,
  schema_version       TEXT,
  payload              JSONB NOT NULL,
  ingested_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  batch_id             TEXT,
  correlation_id       TEXT,
  delivery_attempt     INT NOT NULL DEFAULT 1,
  processed            BOOLEAN NOT NULL DEFAULT FALSE,
  processed_at         TIMESTAMPTZ,
  error_message        TEXT
);
CREATE INDEX IF NOT EXISTS idx_raw_tenant_time ON raw_ingestion(tenant_id, ingested_at);
CREATE INDEX IF NOT EXISTS idx_raw_source ON raw_ingestion(source_id);
CREATE INDEX IF NOT EXISTS idx_raw_batch ON raw_ingestion(batch_id);
CREATE INDEX IF NOT EXISTS idx_raw_processed ON raw_ingestion(processed) WHERE processed = FALSE;

-- ─── Curated entities (canonical merged entities) ──────────────
CREATE TABLE IF NOT EXISTS curated_entities (
  canonical_id         TEXT PRIMARY KEY,
  tenant_id            TEXT NOT NULL,
  entity_type          TEXT NOT NULL,
  name                 TEXT,
  properties           JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_links         JSONB NOT NULL DEFAULT '[]'::jsonb,
  merge_confidence     NUMERIC,
  quality_score        NUMERIC,
  version              INT NOT NULL DEFAULT 1,
  lifecycle_state      TEXT NOT NULL DEFAULT 'active',
  first_seen_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_curated_tenant_type ON curated_entities(tenant_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_curated_updated ON curated_entities(updated_at);

-- ─── Ontology objects (with relationships) ─────────────────────
CREATE TABLE IF NOT EXISTS ontology_objects (
  object_id            TEXT PRIMARY KEY,
  tenant_id            TEXT NOT NULL,
  object_type          TEXT NOT NULL,
  name                 TEXT,
  properties           JSONB NOT NULL DEFAULT '{}'::jsonb,
  relationships        JSONB NOT NULL DEFAULT '{}'::jsonb,
  status               TEXT NOT NULL DEFAULT 'active',
  freshness_status     TEXT NOT NULL DEFAULT 'unknown',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ontology_tenant_type ON ontology_objects(tenant_id, object_type);

-- ─── Event store (append-only, hash-chained) ───────────────────
CREATE TABLE IF NOT EXISTS event_store (
  event_id             TEXT PRIMARY KEY,
  tenant_id            TEXT NOT NULL,
  event_type           TEXT NOT NULL,
  canonical_entity_id  TEXT NOT NULL,
  entity_type          TEXT NOT NULL,
  source_id            TEXT,
  source_record_id     TEXT,
  actor                TEXT,
  payload              JSONB NOT NULL DEFAULT '{}'::jsonb,
  severity             TEXT NOT NULL DEFAULT 'info',
  correlation_id       TEXT,
  causation_id         TEXT,
  schema_version       TEXT NOT NULL DEFAULT '1.0',
  event_timestamp      TIMESTAMPTZ NOT NULL,
  received_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sequence_number      BIGSERIAL UNIQUE NOT NULL,
  prev_hash            TEXT,
  this_hash            TEXT
);
CREATE INDEX IF NOT EXISTS idx_event_entity ON event_store(canonical_entity_id, event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_event_tenant_time ON event_store(tenant_id, event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_event_type ON event_store(event_type);
CREATE INDEX IF NOT EXISTS idx_event_correlation ON event_store(correlation_id);

-- ─── State store (live per-entity state) ───────────────────────
CREATE TABLE IF NOT EXISTS state_store (
  canonical_entity_id  TEXT PRIMARY KEY,
  tenant_id            TEXT NOT NULL,
  entity_type          TEXT NOT NULL,
  current_status       TEXT NOT NULL DEFAULT 'active',
  risk_score           NUMERIC NOT NULL DEFAULT 0,
  freshness_status     TEXT NOT NULL DEFAULT 'fresh',
  blockers             JSONB NOT NULL DEFAULT '[]'::jsonb,
  dependencies         JSONB NOT NULL DEFAULT '[]'::jsonb,
  alerts               JSONB NOT NULL DEFAULT '[]'::jsonb,
  workflow_step        TEXT,
  owner                TEXT,
  sla_status           TEXT,
  financial_exposure   NUMERIC,
  properties           JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_event_at        TIMESTAMPTZ,
  last_updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_state_tenant_type ON state_store(tenant_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_state_risk ON state_store(risk_score);
CREATE INDEX IF NOT EXISTS idx_state_status ON state_store(current_status);

-- ─── Lineage ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lineage (
  lineage_id           TEXT PRIMARY KEY,
  tenant_id            TEXT NOT NULL,
  source_id            TEXT,
  raw_id               BIGINT,
  canonical_id         TEXT,
  pipeline_name        TEXT NOT NULL,
  step_name            TEXT NOT NULL,
  metadata             JSONB NOT NULL DEFAULT '{}'::jsonb,
  timestamp            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lineage_canonical ON lineage(canonical_id);
CREATE INDEX IF NOT EXISTS idx_lineage_pipeline ON lineage(pipeline_name, timestamp DESC);

-- ─── Data quality ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS data_quality_rules (
  rule_id              TEXT PRIMARY KEY,
  tenant_id            TEXT,
  name                 TEXT NOT NULL,
  description          TEXT,
  target_type          TEXT NOT NULL,      -- dataset|schema|field
  target_key           TEXT,
  rule_type            TEXT NOT NULL,      -- not_null|unique|range|pattern|freshness|...
  expression           TEXT,
  parameters           JSONB NOT NULL DEFAULT '{}'::jsonb,
  severity             TEXT NOT NULL DEFAULT 'warning',
  on_failure           TEXT NOT NULL DEFAULT 'log',
  enabled              BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS data_quality_issues (
  issue_id             TEXT PRIMARY KEY,
  tenant_id            TEXT NOT NULL,
  rule_id              TEXT REFERENCES data_quality_rules(rule_id),
  source_id            TEXT,
  raw_id               BIGINT,
  record_id            TEXT,
  field_name           TEXT,
  severity             TEXT NOT NULL,
  rule_name            TEXT NOT NULL,
  message              TEXT NOT NULL,
  expected_value       TEXT,
  actual_value         TEXT,
  status               TEXT NOT NULL DEFAULT 'open',
  resolved_by          TEXT,
  resolved_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dq_issue_tenant ON data_quality_issues(tenant_id);
CREATE INDEX IF NOT EXISTS idx_dq_issue_status ON data_quality_issues(status);

-- ─── Quarantine (records that failed validation) ───────────────
CREATE TABLE IF NOT EXISTS quarantine (
  quarantine_id        BIGSERIAL PRIMARY KEY,
  tenant_id            TEXT NOT NULL,
  source_id            TEXT,
  raw_id               BIGINT,
  schema_name          TEXT,
  schema_version       TEXT,
  payload              JSONB,
  issues               JSONB NOT NULL DEFAULT '[]'::jsonb,
  status               TEXT NOT NULL DEFAULT 'quarantined',
  reviewed_by          TEXT,
  reviewed_at          TIMESTAMPTZ,
  quarantined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_quarantine_tenant ON quarantine(tenant_id);
CREATE INDEX IF NOT EXISTS idx_quarantine_status ON quarantine(status);

-- ─── Identity resolution ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS identity_clusters (
  cluster_id           TEXT PRIMARY KEY,
  tenant_id            TEXT NOT NULL,
  entity_type          TEXT NOT NULL,
  canonical_id         TEXT NOT NULL,
  canonical_attrs      JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_count         INT NOT NULL DEFAULT 1,
  confidence           NUMERIC,
  resolution_method    TEXT,
  manually_verified    BOOLEAN NOT NULL DEFAULT FALSE,
  merge_history        JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, canonical_id)
);

CREATE TABLE IF NOT EXISTS identity_links (
  link_id              BIGSERIAL PRIMARY KEY,
  cluster_id           TEXT NOT NULL REFERENCES identity_clusters(cluster_id),
  tenant_id            TEXT NOT NULL,
  source_id            TEXT NOT NULL,
  source_record_id     TEXT NOT NULL,
  match_score          NUMERIC,
  match_reason         TEXT,
  linked_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_id, source_record_id)
);
CREATE INDEX IF NOT EXISTS idx_id_link_cluster ON identity_links(cluster_id);

-- ─── Pipeline runs + metrics ───────────────────────────────────
CREATE TABLE IF NOT EXISTS pipeline_runs (
  run_id               TEXT PRIMARY KEY,
  tenant_id            TEXT NOT NULL,
  pipeline_name        TEXT NOT NULL,
  pipeline_version     TEXT,
  trigger_type         TEXT,
  trigger_by           TEXT,
  started_at           TIMESTAMPTZ NOT NULL,
  finished_at          TIMESTAMPTZ,
  duration_ms          INT,
  status               TEXT NOT NULL,
  records_read         INT NOT NULL DEFAULT 0,
  records_accepted     INT NOT NULL DEFAULT 0,
  records_quarantined  INT NOT NULL DEFAULT 0,
  records_rejected     INT NOT NULL DEFAULT 0,
  events_emitted       INT NOT NULL DEFAULT 0,
  error_message        TEXT,
  metadata             JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_pipeline_run_name ON pipeline_runs(pipeline_name, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipeline_run_status ON pipeline_runs(status);

CREATE TABLE IF NOT EXISTS pipeline_metrics (
  tenant_id            TEXT NOT NULL,
  pipeline_name        TEXT NOT NULL,
  total_runs           INT NOT NULL DEFAULT 0,
  successful_runs      INT NOT NULL DEFAULT 0,
  failed_runs          INT NOT NULL DEFAULT 0,
  records_accepted     INT NOT NULL DEFAULT 0,
  records_quarantined  INT NOT NULL DEFAULT 0,
  events_emitted       INT NOT NULL DEFAULT 0,
  avg_duration_ms      INT,
  p95_duration_ms      INT,
  last_run_at          TIMESTAMPTZ,
  last_success_at      TIMESTAMPTZ,
  last_failure_at      TIMESTAMPTZ,
  last_error           TEXT,
  health_score         NUMERIC,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, pipeline_name)
);

-- ─── Workflow runtime ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_definitions (
  workflow_id          TEXT PRIMARY KEY,
  tenant_id            TEXT NOT NULL,
  name                 TEXT NOT NULL,
  version              TEXT NOT NULL,
  description          TEXT,
  states               JSONB NOT NULL DEFAULT '[]'::jsonb,
  transitions          JSONB NOT NULL DEFAULT '[]'::jsonb,
  entry_state          TEXT NOT NULL,
  terminal_states      JSONB NOT NULL DEFAULT '[]'::jsonb,
  sla_seconds          INT,
  owner                TEXT,
  status               TEXT NOT NULL DEFAULT 'active',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflow_instances (
  instance_id          TEXT PRIMARY KEY,
  workflow_id          TEXT NOT NULL REFERENCES workflow_definitions(workflow_id),
  tenant_id            TEXT NOT NULL,
  canonical_entity_id  TEXT,
  current_state        TEXT NOT NULL,
  context              JSONB NOT NULL DEFAULT '{}'::jsonb,
  owner                TEXT,
  started_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_transition_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at         TIMESTAMPTZ,
  status               TEXT NOT NULL DEFAULT 'running'
);
CREATE INDEX IF NOT EXISTS idx_wf_instance_entity ON workflow_instances(canonical_entity_id);
CREATE INDEX IF NOT EXISTS idx_wf_instance_status ON workflow_instances(status);

CREATE TABLE IF NOT EXISTS workflow_transitions_log (
  log_id               BIGSERIAL PRIMARY KEY,
  instance_id          TEXT NOT NULL REFERENCES workflow_instances(instance_id),
  tenant_id            TEXT NOT NULL,
  from_state           TEXT,
  to_state             TEXT NOT NULL,
  trigger_event_id     TEXT,
  actor                TEXT,
  metadata             JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Audit log (immutable + hash-chained) ──────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  audit_id             BIGSERIAL PRIMARY KEY,
  tenant_id            TEXT NOT NULL,
  actor                TEXT NOT NULL,
  action               TEXT NOT NULL,
  resource_type        TEXT NOT NULL,
  resource_id          TEXT,
  payload              JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address           TEXT,
  user_agent           TEXT,
  prev_hash            TEXT,
  this_hash            TEXT NOT NULL,
  occurred_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_tenant_time ON audit_log(tenant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_log(resource_type, resource_id);

-- ─── AI context snapshots ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_context_snapshots (
  snapshot_id          TEXT PRIMARY KEY,
  tenant_id            TEXT NOT NULL,
  context_type         TEXT NOT NULL,    -- entity|situation|forecast|explanation
  target_entity_id     TEXT,
  entities             JSONB NOT NULL DEFAULT '[]'::jsonb,
  recent_events        JSONB NOT NULL DEFAULT '[]'::jsonb,
  state                JSONB NOT NULL DEFAULT '{}'::jsonb,
  risk_context         JSONB NOT NULL DEFAULT '{}'::jsonb,
  financial_context    JSONB NOT NULL DEFAULT '{}'::jsonb,
  token_count          INT,
  generated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ttl_seconds          INT DEFAULT 300
);

-- ─── CDC / replication offsets ─────────────────────────────────
CREATE TABLE IF NOT EXISTS cdc_offsets (
  source_id            TEXT NOT NULL,
  tenant_id            TEXT NOT NULL,
  slot_name            TEXT,
  last_lsn             TEXT,
  last_processed_at    TIMESTAMPTZ,
  PRIMARY KEY (source_id, tenant_id)
);
