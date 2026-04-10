"""
SQLAlchemy 2.0 ORM models mirroring schema.sql.

These models provide a production-grade persistence layer. They can be
used directly via the Repository layer (see app/db/repositories.py) or
bypassed when running the in-memory demo.

All tables live in the `platform` schema. Every table is multi-tenant.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    metadata = DeclarativeBase.metadata


# ─── Tenants ──────────────────────────────────────────────────
class Tenant(Base):
    __tablename__ = "tenants"
    __table_args__ = {"schema": "platform"}

    tenant_id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    tier: Mapped[str] = mapped_column(String, default="standard", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    metadata_: Mapped[Dict[str, Any]] = mapped_column("metadata", JSONB, default=dict)


# ─── Users + Roles ────────────────────────────────────────────
class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("tenant_id", "email", name="uq_user_tenant_email"),
        Index("idx_users_tenant", "tenant_id"),
        {"schema": "platform"},
    )

    user_id: Mapped[str] = mapped_column(String, primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String, ForeignKey("platform.tenants.tenant_id"), nullable=False)
    email: Mapped[str] = mapped_column(String, nullable=False)
    display_name: Mapped[Optional[str]] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, default="active", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class Role(Base):
    __tablename__ = "roles"
    __table_args__ = (
        UniqueConstraint("tenant_id", "name", name="uq_role_tenant_name"),
        {"schema": "platform"},
    )

    role_id: Mapped[str] = mapped_column(String, primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String, ForeignKey("platform.tenants.tenant_id"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    permissions: Mapped[List[str]] = mapped_column(JSONB, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class UserRole(Base):
    __tablename__ = "user_roles"
    __table_args__ = {"schema": "platform"}

    user_id: Mapped[str] = mapped_column(String, ForeignKey("platform.users.user_id"), primary_key=True)
    role_id: Mapped[str] = mapped_column(String, ForeignKey("platform.roles.role_id"), primary_key=True)
    granted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    granted_by: Mapped[Optional[str]] = mapped_column(String)


# ─── Source descriptors ───────────────────────────────────────
class SourceDescriptor(Base):
    __tablename__ = "source_descriptors"
    __table_args__ = (
        Index("idx_source_tenant", "tenant_id"),
        Index("idx_source_type", "source_type"),
        {"schema": "platform"},
    )

    source_id: Mapped[str] = mapped_column(String, primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String, ForeignKey("platform.tenants.tenant_id"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    source_type: Mapped[str] = mapped_column(String, nullable=False)
    ingestion_mode: Mapped[str] = mapped_column(String, nullable=False)
    owner: Mapped[Optional[str]] = mapped_column(String)
    freshness_sla_sec: Mapped[Optional[int]] = mapped_column(Integer)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    status: Mapped[str] = mapped_column(String, default="active", nullable=False)
    last_sync_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    health_score: Mapped[Optional[float]] = mapped_column(Numeric)
    config: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict)
    metadata_: Mapped[Dict[str, Any]] = mapped_column("metadata", JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ─── Schema registry ──────────────────────────────────────────
class SchemaEntry(Base):
    __tablename__ = "schemas"
    __table_args__ = (
        UniqueConstraint("tenant_id", "name", "version", name="uq_schema_tenant_name_version"),
        Index("idx_schema_name", "name"),
        {"schema": "platform"},
    )

    schema_id: Mapped[str] = mapped_column(String, primary_key=True)
    tenant_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("platform.tenants.tenant_id"))
    name: Mapped[str] = mapped_column(String, nullable=False)
    version: Mapped[str] = mapped_column(String, nullable=False)
    fields: Mapped[List[Dict[str, Any]]] = mapped_column(JSONB, nullable=False)
    primary_key: Mapped[Optional[str]] = mapped_column(String)
    compatibility: Mapped[str] = mapped_column(String, default="backward")
    owner: Mapped[Optional[str]] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, default="active")
    registered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    retired_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


# ─── Raw ingestion (append-only) ──────────────────────────────
class RawIngestion(Base):
    __tablename__ = "raw_ingestion"
    __table_args__ = (
        Index("idx_raw_tenant_time", "tenant_id", "ingested_at"),
        Index("idx_raw_source", "source_id"),
        Index("idx_raw_batch", "batch_id"),
        {"schema": "platform"},
    )

    raw_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(String, nullable=False)
    source_id: Mapped[str] = mapped_column(String, nullable=False)
    source_record_id: Mapped[str] = mapped_column(String, nullable=False)
    schema_name: Mapped[Optional[str]] = mapped_column(String)
    schema_version: Mapped[Optional[str]] = mapped_column(String)
    payload: Mapped[Dict[str, Any]] = mapped_column(JSONB, nullable=False)
    ingested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    batch_id: Mapped[Optional[str]] = mapped_column(String)
    correlation_id: Mapped[Optional[str]] = mapped_column(String)
    delivery_attempt: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    processed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    processed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    error_message: Mapped[Optional[str]] = mapped_column(Text)


# ─── Curated entities ─────────────────────────────────────────
class CuratedEntity(Base):
    __tablename__ = "curated_entities"
    __table_args__ = (
        Index("idx_curated_tenant_type", "tenant_id", "entity_type"),
        Index("idx_curated_updated", "updated_at"),
        {"schema": "platform"},
    )

    canonical_id: Mapped[str] = mapped_column(String, primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String, nullable=False)
    entity_type: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[Optional[str]] = mapped_column(String)
    properties: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict)
    source_links: Mapped[List[Dict[str, Any]]] = mapped_column(JSONB, default=list)
    merge_confidence: Mapped[Optional[float]] = mapped_column(Numeric)
    quality_score: Mapped[Optional[float]] = mapped_column(Numeric)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    lifecycle_state: Mapped[str] = mapped_column(String, default="active", nullable=False)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ─── Ontology objects ─────────────────────────────────────────
class OntologyObjectRow(Base):
    __tablename__ = "ontology_objects"
    __table_args__ = (
        Index("idx_ontology_tenant_type", "tenant_id", "object_type"),
        {"schema": "platform"},
    )

    object_id: Mapped[str] = mapped_column(String, primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String, nullable=False)
    object_type: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[Optional[str]] = mapped_column(String)
    properties: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict)
    relationships_: Mapped[Dict[str, List[str]]] = mapped_column("relationships", JSONB, default=dict)
    status: Mapped[str] = mapped_column(String, default="active", nullable=False)
    freshness_status: Mapped[str] = mapped_column(String, default="unknown", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ─── Event store ──────────────────────────────────────────────
class EventStoreRow(Base):
    __tablename__ = "event_store"
    __table_args__ = (
        Index("idx_event_entity", "canonical_entity_id", "event_timestamp"),
        Index("idx_event_tenant_time", "tenant_id", "event_timestamp"),
        Index("idx_event_type", "event_type"),
        Index("idx_event_correlation", "correlation_id"),
        {"schema": "platform"},
    )

    event_id: Mapped[str] = mapped_column(String, primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String, nullable=False)
    event_type: Mapped[str] = mapped_column(String, nullable=False)
    canonical_entity_id: Mapped[str] = mapped_column(String, nullable=False)
    entity_type: Mapped[str] = mapped_column(String, nullable=False)
    source_id: Mapped[Optional[str]] = mapped_column(String)
    source_record_id: Mapped[Optional[str]] = mapped_column(String)
    actor: Mapped[Optional[str]] = mapped_column(String)
    payload: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict)
    severity: Mapped[str] = mapped_column(String, default="info", nullable=False)
    correlation_id: Mapped[Optional[str]] = mapped_column(String)
    causation_id: Mapped[Optional[str]] = mapped_column(String)
    schema_version: Mapped[str] = mapped_column(String, default="1.0", nullable=False)
    event_timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    sequence_number: Mapped[int] = mapped_column(BigInteger, unique=True, autoincrement=True)
    prev_hash: Mapped[Optional[str]] = mapped_column(String)
    this_hash: Mapped[Optional[str]] = mapped_column(String)


# ─── State store ──────────────────────────────────────────────
class StateStoreRow(Base):
    __tablename__ = "state_store"
    __table_args__ = (
        Index("idx_state_tenant_type", "tenant_id", "entity_type"),
        Index("idx_state_risk", "risk_score"),
        Index("idx_state_status", "current_status"),
        {"schema": "platform"},
    )

    canonical_entity_id: Mapped[str] = mapped_column(String, primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String, nullable=False)
    entity_type: Mapped[str] = mapped_column(String, nullable=False)
    current_status: Mapped[str] = mapped_column(String, default="active", nullable=False)
    risk_score: Mapped[float] = mapped_column(Numeric, default=0, nullable=False)
    freshness_status: Mapped[str] = mapped_column(String, default="fresh", nullable=False)
    blockers: Mapped[List[str]] = mapped_column(JSONB, default=list)
    dependencies: Mapped[List[str]] = mapped_column(JSONB, default=list)
    alerts: Mapped[List[str]] = mapped_column(JSONB, default=list)
    workflow_step: Mapped[Optional[str]] = mapped_column(String)
    owner: Mapped[Optional[str]] = mapped_column(String)
    sla_status: Mapped[Optional[str]] = mapped_column(String)
    financial_exposure: Mapped[Optional[float]] = mapped_column(Numeric)
    properties: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict)
    last_event_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    last_updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ─── Lineage ──────────────────────────────────────────────────
class LineageRow(Base):
    __tablename__ = "lineage"
    __table_args__ = (
        Index("idx_lineage_canonical", "canonical_id"),
        Index("idx_lineage_pipeline", "pipeline_name", "timestamp"),
        {"schema": "platform"},
    )

    lineage_id: Mapped[str] = mapped_column(String, primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String, nullable=False)
    source_id: Mapped[Optional[str]] = mapped_column(String)
    raw_id: Mapped[Optional[int]] = mapped_column(BigInteger)
    canonical_id: Mapped[Optional[str]] = mapped_column(String)
    pipeline_name: Mapped[str] = mapped_column(String, nullable=False)
    step_name: Mapped[str] = mapped_column(String, nullable=False)
    metadata_: Mapped[Dict[str, Any]] = mapped_column("metadata", JSONB, default=dict)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ─── Data quality ─────────────────────────────────────────────
class DataQualityRule(Base):
    __tablename__ = "data_quality_rules"
    __table_args__ = {"schema": "platform"}

    rule_id: Mapped[str] = mapped_column(String, primary_key=True)
    tenant_id: Mapped[Optional[str]] = mapped_column(String)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    target_type: Mapped[str] = mapped_column(String, nullable=False)
    target_key: Mapped[Optional[str]] = mapped_column(String)
    rule_type: Mapped[str] = mapped_column(String, nullable=False)
    expression: Mapped[Optional[str]] = mapped_column(Text)
    parameters: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict)
    severity: Mapped[str] = mapped_column(String, default="warning", nullable=False)
    on_failure: Mapped[str] = mapped_column(String, default="log", nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class DataQualityIssue(Base):
    __tablename__ = "data_quality_issues"
    __table_args__ = (
        Index("idx_dq_issue_tenant", "tenant_id"),
        Index("idx_dq_issue_status", "status"),
        {"schema": "platform"},
    )

    issue_id: Mapped[str] = mapped_column(String, primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String, nullable=False)
    rule_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("platform.data_quality_rules.rule_id"))
    source_id: Mapped[Optional[str]] = mapped_column(String)
    raw_id: Mapped[Optional[int]] = mapped_column(BigInteger)
    record_id: Mapped[Optional[str]] = mapped_column(String)
    field_name: Mapped[Optional[str]] = mapped_column(String)
    severity: Mapped[str] = mapped_column(String, nullable=False)
    rule_name: Mapped[str] = mapped_column(String, nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    expected_value: Mapped[Optional[str]] = mapped_column(Text)
    actual_value: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String, default="open", nullable=False)
    resolved_by: Mapped[Optional[str]] = mapped_column(String)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ─── Quarantine ───────────────────────────────────────────────
class QuarantineRow(Base):
    __tablename__ = "quarantine"
    __table_args__ = (
        Index("idx_quarantine_tenant", "tenant_id"),
        Index("idx_quarantine_status", "status"),
        {"schema": "platform"},
    )

    quarantine_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(String, nullable=False)
    source_id: Mapped[Optional[str]] = mapped_column(String)
    raw_id: Mapped[Optional[int]] = mapped_column(BigInteger)
    schema_name: Mapped[Optional[str]] = mapped_column(String)
    schema_version: Mapped[Optional[str]] = mapped_column(String)
    payload: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB)
    issues: Mapped[List[Dict[str, Any]]] = mapped_column(JSONB, default=list)
    status: Mapped[str] = mapped_column(String, default="quarantined", nullable=False)
    reviewed_by: Mapped[Optional[str]] = mapped_column(String)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    quarantined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ─── Identity resolution ──────────────────────────────────────
class IdentityCluster(Base):
    __tablename__ = "identity_clusters"
    __table_args__ = (
        UniqueConstraint("tenant_id", "canonical_id", name="uq_id_cluster_tenant_canonical"),
        {"schema": "platform"},
    )

    cluster_id: Mapped[str] = mapped_column(String, primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String, nullable=False)
    entity_type: Mapped[str] = mapped_column(String, nullable=False)
    canonical_id: Mapped[str] = mapped_column(String, nullable=False)
    canonical_attrs: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict)
    source_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    confidence: Mapped[Optional[float]] = mapped_column(Numeric)
    resolution_method: Mapped[Optional[str]] = mapped_column(String)
    manually_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    merge_history: Mapped[List[Dict[str, Any]]] = mapped_column(JSONB, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class IdentityLink(Base):
    __tablename__ = "identity_links"
    __table_args__ = (
        UniqueConstraint("source_id", "source_record_id", name="uq_identity_link_source"),
        Index("idx_id_link_cluster", "cluster_id"),
        {"schema": "platform"},
    )

    link_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    cluster_id: Mapped[str] = mapped_column(String, ForeignKey("platform.identity_clusters.cluster_id"), nullable=False)
    tenant_id: Mapped[str] = mapped_column(String, nullable=False)
    source_id: Mapped[str] = mapped_column(String, nullable=False)
    source_record_id: Mapped[str] = mapped_column(String, nullable=False)
    match_score: Mapped[Optional[float]] = mapped_column(Numeric)
    match_reason: Mapped[Optional[str]] = mapped_column(Text)
    linked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ─── Pipeline runs + metrics ──────────────────────────────────
class PipelineRun(Base):
    __tablename__ = "pipeline_runs"
    __table_args__ = (
        Index("idx_pipeline_run_name", "pipeline_name", "started_at"),
        Index("idx_pipeline_run_status", "status"),
        {"schema": "platform"},
    )

    run_id: Mapped[str] = mapped_column(String, primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String, nullable=False)
    pipeline_name: Mapped[str] = mapped_column(String, nullable=False)
    pipeline_version: Mapped[Optional[str]] = mapped_column(String)
    trigger_type: Mapped[Optional[str]] = mapped_column(String)
    trigger_by: Mapped[Optional[str]] = mapped_column(String)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    duration_ms: Mapped[Optional[int]] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String, nullable=False)
    records_read: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    records_accepted: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    records_quarantined: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    records_rejected: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    events_emitted: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error_message: Mapped[Optional[str]] = mapped_column(Text)
    metadata_: Mapped[Dict[str, Any]] = mapped_column("metadata", JSONB, default=dict)


class PipelineMetricsRow(Base):
    __tablename__ = "pipeline_metrics"
    __table_args__ = {"schema": "platform"}

    tenant_id: Mapped[str] = mapped_column(String, primary_key=True)
    pipeline_name: Mapped[str] = mapped_column(String, primary_key=True)
    total_runs: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    successful_runs: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    failed_runs: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    records_accepted: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    records_quarantined: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    events_emitted: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    avg_duration_ms: Mapped[Optional[int]] = mapped_column(Integer)
    p95_duration_ms: Mapped[Optional[int]] = mapped_column(Integer)
    last_run_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    last_success_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    last_failure_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[Optional[str]] = mapped_column(Text)
    health_score: Mapped[Optional[float]] = mapped_column(Numeric)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ─── Workflow runtime ─────────────────────────────────────────
class WorkflowDefinition(Base):
    __tablename__ = "workflow_definitions"
    __table_args__ = {"schema": "platform"}

    workflow_id: Mapped[str] = mapped_column(String, primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    version: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    states: Mapped[List[Dict[str, Any]]] = mapped_column(JSONB, default=list)
    transitions: Mapped[List[Dict[str, Any]]] = mapped_column(JSONB, default=list)
    entry_state: Mapped[str] = mapped_column(String, nullable=False)
    terminal_states: Mapped[List[str]] = mapped_column(JSONB, default=list)
    sla_seconds: Mapped[Optional[int]] = mapped_column(Integer)
    owner: Mapped[Optional[str]] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, default="active", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class WorkflowInstance(Base):
    __tablename__ = "workflow_instances"
    __table_args__ = (
        Index("idx_wf_instance_entity", "canonical_entity_id"),
        Index("idx_wf_instance_status", "status"),
        {"schema": "platform"},
    )

    instance_id: Mapped[str] = mapped_column(String, primary_key=True)
    workflow_id: Mapped[str] = mapped_column(String, ForeignKey("platform.workflow_definitions.workflow_id"), nullable=False)
    tenant_id: Mapped[str] = mapped_column(String, nullable=False)
    canonical_entity_id: Mapped[Optional[str]] = mapped_column(String)
    current_state: Mapped[str] = mapped_column(String, nullable=False)
    context: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict)
    owner: Mapped[Optional[str]] = mapped_column(String)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_transition_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String, default="running", nullable=False)


class WorkflowTransitionLog(Base):
    __tablename__ = "workflow_transitions_log"
    __table_args__ = {"schema": "platform"}

    log_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    instance_id: Mapped[str] = mapped_column(String, ForeignKey("platform.workflow_instances.instance_id"), nullable=False)
    tenant_id: Mapped[str] = mapped_column(String, nullable=False)
    from_state: Mapped[Optional[str]] = mapped_column(String)
    to_state: Mapped[str] = mapped_column(String, nullable=False)
    trigger_event_id: Mapped[Optional[str]] = mapped_column(String)
    actor: Mapped[Optional[str]] = mapped_column(String)
    metadata_: Mapped[Dict[str, Any]] = mapped_column("metadata", JSONB, default=dict)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ─── Audit log (immutable hash chain) ─────────────────────────
class AuditLog(Base):
    __tablename__ = "audit_log"
    __table_args__ = (
        Index("idx_audit_tenant_time", "tenant_id", "occurred_at"),
        Index("idx_audit_actor", "actor"),
        Index("idx_audit_resource", "resource_type", "resource_id"),
        {"schema": "platform"},
    )

    audit_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(String, nullable=False)
    actor: Mapped[str] = mapped_column(String, nullable=False)
    action: Mapped[str] = mapped_column(String, nullable=False)
    resource_type: Mapped[str] = mapped_column(String, nullable=False)
    resource_id: Mapped[Optional[str]] = mapped_column(String)
    payload: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict)
    ip_address: Mapped[Optional[str]] = mapped_column(String)
    user_agent: Mapped[Optional[str]] = mapped_column(String)
    prev_hash: Mapped[Optional[str]] = mapped_column(String)
    this_hash: Mapped[str] = mapped_column(String, nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ─── AI context snapshots ─────────────────────────────────────
class AIContextSnapshot(Base):
    __tablename__ = "ai_context_snapshots"
    __table_args__ = {"schema": "platform"}

    snapshot_id: Mapped[str] = mapped_column(String, primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String, nullable=False)
    context_type: Mapped[str] = mapped_column(String, nullable=False)
    target_entity_id: Mapped[Optional[str]] = mapped_column(String)
    entities: Mapped[List[Dict[str, Any]]] = mapped_column(JSONB, default=list)
    recent_events: Mapped[List[Dict[str, Any]]] = mapped_column(JSONB, default=list)
    state: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict)
    risk_context: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict)
    financial_context: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict)
    token_count: Mapped[Optional[int]] = mapped_column(Integer)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    ttl_seconds: Mapped[int] = mapped_column(Integer, default=300)


# ─── CDC offsets ──────────────────────────────────────────────
class CDCOffset(Base):
    __tablename__ = "cdc_offsets"
    __table_args__ = {"schema": "platform"}

    source_id: Mapped[str] = mapped_column(String, primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String, primary_key=True)
    slot_name: Mapped[Optional[str]] = mapped_column(String)
    last_lsn: Mapped[Optional[str]] = mapped_column(String)
    last_processed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
