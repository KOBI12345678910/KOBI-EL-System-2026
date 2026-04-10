"""
Repository layer — the only module that touches SQLAlchemy.

This layer provides async repositories for every persistence concern in
the platform. Each repository exposes a domain-oriented interface
(`upsert_ontology`, `append_event`, `get_state_for_entity`, ...) and
hides all SQL details.

The higher layers (ingestion_service, state_engine, api/*) call these
repositories through a single `Repositories` facade so they never have
to know whether the data lives in Postgres, in-memory, or any other
store.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

try:
    from sqlalchemy import select, update, delete
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    from sqlalchemy.ext.asyncio import AsyncSession
    _SA_OK = True
except ImportError:
    _SA_OK = False
    AsyncSession = None  # type: ignore

from app.db.models import (
    AuditLog,
    CDCOffset,
    CuratedEntity,
    DataQualityIssue,
    EventStoreRow,
    IdentityCluster,
    IdentityLink,
    LineageRow,
    OntologyObjectRow,
    PipelineMetricsRow,
    PipelineRun,
    QuarantineRow,
    RawIngestion,
    SchemaEntry,
    SourceDescriptor,
    StateStoreRow,
    Tenant,
    WorkflowDefinition,
    WorkflowInstance,
    WorkflowTransitionLog,
)


# ═══════════════════════════════════════════════════════════════
# ONTOLOGY REPOSITORY
# ═══════════════════════════════════════════════════════════════

class OntologyRepository:
    def __init__(self, session: "AsyncSession"):
        self.s = session

    async def upsert(
        self,
        object_id: str,
        tenant_id: str,
        object_type: str,
        name: str,
        properties: Dict[str, Any],
        relationships: Dict[str, List[str]],
    ) -> OntologyObjectRow:
        existing = await self.s.get(OntologyObjectRow, object_id)
        if existing is None:
            row = OntologyObjectRow(
                object_id=object_id,
                tenant_id=tenant_id,
                object_type=object_type,
                name=name,
                properties=properties,
                relationships_=relationships,
                freshness_status="fresh",
            )
            self.s.add(row)
            return row
        existing.name = name or existing.name
        merged_props = dict(existing.properties or {})
        merged_props.update(properties)
        existing.properties = merged_props
        merged_rels = dict(existing.relationships_ or {})
        for rel_name, targets in relationships.items():
            current = list(merged_rels.get(rel_name, []))
            for t in targets:
                if t not in current:
                    current.append(t)
            merged_rels[rel_name] = current
        existing.relationships_ = merged_rels
        existing.freshness_status = "fresh"
        return existing

    async def get(self, object_id: str) -> Optional[OntologyObjectRow]:
        return await self.s.get(OntologyObjectRow, object_id)

    async def list_by_tenant(
        self, tenant_id: str, entity_type: Optional[str] = None, limit: int = 500
    ) -> List[OntologyObjectRow]:
        stmt = select(OntologyObjectRow).where(OntologyObjectRow.tenant_id == tenant_id)
        if entity_type:
            stmt = stmt.where(OntologyObjectRow.object_type == entity_type)
        stmt = stmt.limit(limit)
        result = await self.s.execute(stmt)
        return list(result.scalars().all())


# ═══════════════════════════════════════════════════════════════
# EVENT STORE REPOSITORY (append-only)
# ═══════════════════════════════════════════════════════════════

class EventStoreRepository:
    def __init__(self, session: "AsyncSession"):
        self.s = session

    async def append(
        self,
        *,
        event_id: str,
        tenant_id: str,
        event_type: str,
        canonical_entity_id: str,
        entity_type: str,
        payload: Dict[str, Any],
        severity: str = "info",
        source_id: Optional[str] = None,
        source_record_id: Optional[str] = None,
        actor: Optional[str] = None,
        correlation_id: Optional[str] = None,
        causation_id: Optional[str] = None,
        event_timestamp: datetime,
        prev_hash: Optional[str] = None,
        this_hash: Optional[str] = None,
    ) -> EventStoreRow:
        row = EventStoreRow(
            event_id=event_id,
            tenant_id=tenant_id,
            event_type=event_type,
            canonical_entity_id=canonical_entity_id,
            entity_type=entity_type,
            payload=payload,
            severity=severity,
            source_id=source_id,
            source_record_id=source_record_id,
            actor=actor,
            correlation_id=correlation_id,
            causation_id=causation_id,
            event_timestamp=event_timestamp,
            prev_hash=prev_hash,
            this_hash=this_hash,
        )
        self.s.add(row)
        return row

    async def recent_for_entity(self, canonical_entity_id: str, limit: int = 50) -> List[EventStoreRow]:
        stmt = (
            select(EventStoreRow)
            .where(EventStoreRow.canonical_entity_id == canonical_entity_id)
            .order_by(EventStoreRow.event_timestamp.desc())
            .limit(limit)
        )
        result = await self.s.execute(stmt)
        return list(result.scalars().all())

    async def recent_for_tenant(self, tenant_id: str, limit: int = 100) -> List[EventStoreRow]:
        stmt = (
            select(EventStoreRow)
            .where(EventStoreRow.tenant_id == tenant_id)
            .order_by(EventStoreRow.event_timestamp.desc())
            .limit(limit)
        )
        result = await self.s.execute(stmt)
        return list(result.scalars().all())

    async def replay(
        self, canonical_entity_id: str, from_time: Optional[datetime] = None, to_time: Optional[datetime] = None
    ) -> List[EventStoreRow]:
        stmt = select(EventStoreRow).where(EventStoreRow.canonical_entity_id == canonical_entity_id)
        if from_time:
            stmt = stmt.where(EventStoreRow.event_timestamp >= from_time)
        if to_time:
            stmt = stmt.where(EventStoreRow.event_timestamp <= to_time)
        stmt = stmt.order_by(EventStoreRow.event_timestamp.asc())
        result = await self.s.execute(stmt)
        return list(result.scalars().all())


# ═══════════════════════════════════════════════════════════════
# STATE STORE REPOSITORY
# ═══════════════════════════════════════════════════════════════

class StateRepository:
    def __init__(self, session: "AsyncSession"):
        self.s = session

    async def get(self, canonical_entity_id: str) -> Optional[StateStoreRow]:
        return await self.s.get(StateStoreRow, canonical_entity_id)

    async def upsert(self, state: Dict[str, Any]) -> StateStoreRow:
        row = await self.s.get(StateStoreRow, state["canonical_entity_id"])
        if row is None:
            row = StateStoreRow(**state)
            self.s.add(row)
            return row
        for k, v in state.items():
            setattr(row, k, v)
        return row

    async def list_at_risk(self, tenant_id: str, threshold: float = 0.6) -> List[StateStoreRow]:
        stmt = (
            select(StateStoreRow)
            .where(StateStoreRow.tenant_id == tenant_id)
            .where(StateStoreRow.risk_score >= threshold)
            .order_by(StateStoreRow.risk_score.desc())
        )
        result = await self.s.execute(stmt)
        return list(result.scalars().all())

    async def list_by_tenant(self, tenant_id: str) -> List[StateStoreRow]:
        stmt = select(StateStoreRow).where(StateStoreRow.tenant_id == tenant_id)
        result = await self.s.execute(stmt)
        return list(result.scalars().all())


# ═══════════════════════════════════════════════════════════════
# LINEAGE REPOSITORY
# ═══════════════════════════════════════════════════════════════

class LineageRepository:
    def __init__(self, session: "AsyncSession"):
        self.s = session

    async def append(self, row: Dict[str, Any]) -> LineageRow:
        r = LineageRow(**row)
        self.s.add(r)
        return r

    async def for_canonical(self, canonical_id: str) -> List[LineageRow]:
        stmt = (
            select(LineageRow)
            .where(LineageRow.canonical_id == canonical_id)
            .order_by(LineageRow.timestamp.asc())
        )
        result = await self.s.execute(stmt)
        return list(result.scalars().all())

    async def for_pipeline(self, pipeline_name: str, limit: int = 100) -> List[LineageRow]:
        stmt = (
            select(LineageRow)
            .where(LineageRow.pipeline_name == pipeline_name)
            .order_by(LineageRow.timestamp.desc())
            .limit(limit)
        )
        result = await self.s.execute(stmt)
        return list(result.scalars().all())


# ═══════════════════════════════════════════════════════════════
# RAW INGESTION REPOSITORY
# ═══════════════════════════════════════════════════════════════

class RawIngestionRepository:
    def __init__(self, session: "AsyncSession"):
        self.s = session

    async def append(
        self,
        *,
        tenant_id: str,
        source_id: str,
        source_record_id: str,
        schema_name: Optional[str],
        schema_version: Optional[str],
        payload: Dict[str, Any],
        batch_id: Optional[str] = None,
        correlation_id: Optional[str] = None,
    ) -> RawIngestion:
        row = RawIngestion(
            tenant_id=tenant_id,
            source_id=source_id,
            source_record_id=source_record_id,
            schema_name=schema_name,
            schema_version=schema_version,
            payload=payload,
            batch_id=batch_id,
            correlation_id=correlation_id,
        )
        self.s.add(row)
        return row

    async def mark_processed(self, raw_id: int, error: Optional[str] = None) -> None:
        stmt = (
            update(RawIngestion)
            .where(RawIngestion.raw_id == raw_id)
            .values(processed=True, error_message=error, processed_at=datetime.utcnow())
        )
        await self.s.execute(stmt)


# ═══════════════════════════════════════════════════════════════
# QUARANTINE REPOSITORY
# ═══════════════════════════════════════════════════════════════

class QuarantineRepository:
    def __init__(self, session: "AsyncSession"):
        self.s = session

    async def put(
        self,
        *,
        tenant_id: str,
        source_id: Optional[str],
        raw_id: Optional[int],
        schema_name: Optional[str],
        schema_version: Optional[str],
        payload: Optional[Dict[str, Any]],
        issues: List[Dict[str, Any]],
    ) -> QuarantineRow:
        row = QuarantineRow(
            tenant_id=tenant_id,
            source_id=source_id,
            raw_id=raw_id,
            schema_name=schema_name,
            schema_version=schema_version,
            payload=payload,
            issues=issues,
        )
        self.s.add(row)
        return row

    async def recent(self, tenant_id: str, limit: int = 100) -> List[QuarantineRow]:
        stmt = (
            select(QuarantineRow)
            .where(QuarantineRow.tenant_id == tenant_id)
            .order_by(QuarantineRow.quarantined_at.desc())
            .limit(limit)
        )
        result = await self.s.execute(stmt)
        return list(result.scalars().all())


# ═══════════════════════════════════════════════════════════════
# DATA QUALITY ISSUE REPOSITORY
# ═══════════════════════════════════════════════════════════════

class DataQualityIssueRepository:
    def __init__(self, session: "AsyncSession"):
        self.s = session

    async def append(self, **kwargs) -> DataQualityIssue:
        row = DataQualityIssue(**kwargs)
        self.s.add(row)
        return row

    async def open_issues(self, tenant_id: str) -> List[DataQualityIssue]:
        stmt = (
            select(DataQualityIssue)
            .where(DataQualityIssue.tenant_id == tenant_id)
            .where(DataQualityIssue.status == "open")
        )
        result = await self.s.execute(stmt)
        return list(result.scalars().all())


# ═══════════════════════════════════════════════════════════════
# IDENTITY RESOLUTION REPOSITORY
# ═══════════════════════════════════════════════════════════════

class IdentityRepository:
    def __init__(self, session: "AsyncSession"):
        self.s = session

    async def upsert_cluster(
        self,
        cluster_id: str,
        tenant_id: str,
        entity_type: str,
        canonical_id: str,
        canonical_attrs: Dict[str, Any],
        confidence: float,
        resolution_method: str,
    ) -> IdentityCluster:
        row = await self.s.get(IdentityCluster, cluster_id)
        if row is None:
            row = IdentityCluster(
                cluster_id=cluster_id,
                tenant_id=tenant_id,
                entity_type=entity_type,
                canonical_id=canonical_id,
                canonical_attrs=canonical_attrs,
                source_count=1,
                confidence=confidence,
                resolution_method=resolution_method,
            )
            self.s.add(row)
            return row
        row.source_count += 1
        row.canonical_attrs = {**(row.canonical_attrs or {}), **canonical_attrs}
        if confidence > (row.confidence or 0):
            row.confidence = confidence
        return row

    async def add_link(
        self,
        cluster_id: str,
        tenant_id: str,
        source_id: str,
        source_record_id: str,
        match_score: float,
        match_reason: str,
    ) -> IdentityLink:
        row = IdentityLink(
            cluster_id=cluster_id,
            tenant_id=tenant_id,
            source_id=source_id,
            source_record_id=source_record_id,
            match_score=match_score,
            match_reason=match_reason,
        )
        self.s.add(row)
        return row

    async def list_clusters(self, tenant_id: str, limit: int = 200) -> List[IdentityCluster]:
        stmt = select(IdentityCluster).where(IdentityCluster.tenant_id == tenant_id).limit(limit)
        result = await self.s.execute(stmt)
        return list(result.scalars().all())


# ═══════════════════════════════════════════════════════════════
# PIPELINE RUN REPOSITORY
# ═══════════════════════════════════════════════════════════════

class PipelineRunRepository:
    def __init__(self, session: "AsyncSession"):
        self.s = session

    async def create(self, **kwargs) -> PipelineRun:
        row = PipelineRun(**kwargs)
        self.s.add(row)
        return row

    async def update_metrics(
        self,
        tenant_id: str,
        pipeline_name: str,
        success: bool,
        duration_ms: int,
        accepted: int,
        quarantined: int,
        events: int,
        error: Optional[str] = None,
    ) -> PipelineMetricsRow:
        row = await self.s.get(PipelineMetricsRow, (tenant_id, pipeline_name))
        now = datetime.utcnow()
        if row is None:
            row = PipelineMetricsRow(
                tenant_id=tenant_id,
                pipeline_name=pipeline_name,
                total_runs=0,
                successful_runs=0,
                failed_runs=0,
                records_accepted=0,
                records_quarantined=0,
                events_emitted=0,
                health_score=100,
            )
            self.s.add(row)
        row.total_runs += 1
        if success:
            row.successful_runs += 1
            row.last_success_at = now
        else:
            row.failed_runs += 1
            row.last_failure_at = now
            row.last_error = error
        row.last_run_at = now
        row.records_accepted += accepted
        row.records_quarantined += quarantined
        row.events_emitted += events
        row.avg_duration_ms = duration_ms if row.avg_duration_ms is None else (row.avg_duration_ms + duration_ms) // 2
        row.health_score = (row.successful_runs / row.total_runs) * 100 if row.total_runs > 0 else 100
        row.updated_at = now
        return row


# ═══════════════════════════════════════════════════════════════
# AUDIT LOG REPOSITORY (immutable + hash-chained)
# ═══════════════════════════════════════════════════════════════

class AuditLogRepository:
    def __init__(self, session: "AsyncSession"):
        self.s = session

    async def append(
        self,
        *,
        tenant_id: str,
        actor: str,
        action: str,
        resource_type: str,
        resource_id: Optional[str],
        payload: Dict[str, Any],
        this_hash: str,
        prev_hash: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> AuditLog:
        row = AuditLog(
            tenant_id=tenant_id,
            actor=actor,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            payload=payload,
            this_hash=this_hash,
            prev_hash=prev_hash,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        self.s.add(row)
        return row

    async def get_latest_hash(self, tenant_id: str) -> Optional[str]:
        stmt = (
            select(AuditLog.this_hash)
            .where(AuditLog.tenant_id == tenant_id)
            .order_by(AuditLog.audit_id.desc())
            .limit(1)
        )
        result = await self.s.execute(stmt)
        return result.scalar_one_or_none()


# ═══════════════════════════════════════════════════════════════
# REPOSITORIES FACADE
# ═══════════════════════════════════════════════════════════════

class Repositories:
    """One facade that owns every repository for a single session."""

    def __init__(self, session: "AsyncSession"):
        self.session = session
        self.ontology = OntologyRepository(session)
        self.events = EventStoreRepository(session)
        self.state = StateRepository(session)
        self.lineage = LineageRepository(session)
        self.raw = RawIngestionRepository(session)
        self.quarantine = QuarantineRepository(session)
        self.quality = DataQualityIssueRepository(session)
        self.identity = IdentityRepository(session)
        self.pipeline = PipelineRunRepository(session)
        self.audit = AuditLogRepository(session)
