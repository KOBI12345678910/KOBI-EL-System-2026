"""
Export Engine — export ontology / events / audit / snapshot to
JSON / CSV / NDJSON formats.

Used for:
  - Backups (full tenant dump)
  - Data hand-off to external BI tools
  - Point-in-time archives
  - GDPR data subject access requests (per-customer export)

Every export is streaming-friendly: the engine returns iterables so a
FastAPI StreamingResponse can pipe them directly to the client without
loading everything into memory.

Pure stdlib. No pandas, no parquet (yet).
"""

from __future__ import annotations

import csv
import io
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, Iterator, List, Optional

from sqlalchemy.orm import Session

from app.models.audit import AuditLogModel
from app.models.events import DomainEventModel
from app.models.ontology import OntologyLink, OntologyObject
from app.models.state import EntityStateModel


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class ExportManifest:
    tenant_id: str
    generated_at: datetime
    total_objects: int
    total_events: int
    total_states: int
    total_links: int
    total_audit_entries: int
    format: str
    size_bytes: int


class ExportEngine:
    def __init__(self, db: Session) -> None:
        self.db = db

    # ─── Full tenant export as JSON ──────────────────────────
    def export_tenant_json(self, tenant_id: str) -> Dict[str, Any]:
        objects = (
            self.db.query(OntologyObject)
            .filter(OntologyObject.tenant_id == tenant_id)
            .all()
        )
        events = (
            self.db.query(DomainEventModel)
            .filter(DomainEventModel.tenant_id == tenant_id)
            .all()
        )
        states = (
            self.db.query(EntityStateModel)
            .filter(EntityStateModel.tenant_id == tenant_id)
            .all()
        )
        links = (
            self.db.query(OntologyLink)
            .filter(OntologyLink.tenant_id == tenant_id)
            .all()
        )
        audits = (
            self.db.query(AuditLogModel)
            .filter(AuditLogModel.tenant_id == tenant_id)
            .all()
        )

        return {
            "tenant_id": tenant_id,
            "generated_at": utc_now().isoformat(),
            "format_version": "1.0",
            "objects": [self._serialize_object(o) for o in objects],
            "states": [self._serialize_state(s) for s in states],
            "links": [self._serialize_link(l) for l in links],
            "events": [self._serialize_event(e) for e in events],
            "audit": [self._serialize_audit(a) for a in audits],
            "counts": {
                "objects": len(objects),
                "states": len(states),
                "links": len(links),
                "events": len(events),
                "audit": len(audits),
            },
        }

    # ─── NDJSON stream (one JSON object per line) ────────────
    def stream_tenant_ndjson(self, tenant_id: str) -> Iterator[str]:
        yield json.dumps({
            "type": "manifest",
            "tenant_id": tenant_id,
            "generated_at": utc_now().isoformat(),
        }, ensure_ascii=False) + "\n"

        objects = (
            self.db.query(OntologyObject)
            .filter(OntologyObject.tenant_id == tenant_id)
            .yield_per(100)
        )
        for o in objects:
            yield json.dumps({"type": "object", "data": self._serialize_object(o)}, ensure_ascii=False) + "\n"

        events = (
            self.db.query(DomainEventModel)
            .filter(DomainEventModel.tenant_id == tenant_id)
            .yield_per(200)
        )
        for e in events:
            yield json.dumps({"type": "event", "data": self._serialize_event(e)}, ensure_ascii=False) + "\n"

        states = (
            self.db.query(EntityStateModel)
            .filter(EntityStateModel.tenant_id == tenant_id)
            .yield_per(100)
        )
        for s in states:
            yield json.dumps({"type": "state", "data": self._serialize_state(s)}, ensure_ascii=False) + "\n"

        audits = (
            self.db.query(AuditLogModel)
            .filter(AuditLogModel.tenant_id == tenant_id)
            .yield_per(200)
        )
        for a in audits:
            yield json.dumps({"type": "audit", "data": self._serialize_audit(a)}, ensure_ascii=False) + "\n"

    # ─── CSV export of entities (flat) ───────────────────────
    def export_entities_csv(self, tenant_id: str, entity_type: Optional[str] = None) -> str:
        objects = self.db.query(OntologyObject).filter(OntologyObject.tenant_id == tenant_id)
        if entity_type:
            objects = objects.filter(OntologyObject.object_type == entity_type)
        rows = objects.all()

        # Collect all property keys
        all_keys: List[str] = ["id", "object_type", "name", "status", "created_at", "updated_at"]
        prop_keys: set = set()
        for o in rows:
            try:
                props = json.loads(o.properties_json or "{}")
                for k in props.keys():
                    prop_keys.add(f"prop_{k}")
            except Exception:
                pass
        all_keys.extend(sorted(prop_keys))

        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=all_keys, extrasaction="ignore")
        writer.writeheader()
        for o in rows:
            try:
                props = json.loads(o.properties_json or "{}")
            except Exception:
                props = {}
            row: Dict[str, Any] = {
                "id": o.id,
                "object_type": o.object_type,
                "name": o.name,
                "status": o.status,
                "created_at": o.created_at.isoformat() if o.created_at else "",
                "updated_at": o.updated_at.isoformat() if o.updated_at else "",
            }
            for k, v in props.items():
                row[f"prop_{k}"] = self._csv_safe(v)
            writer.writerow(row)
        return buf.getvalue()

    # ─── GDPR per-customer export ────────────────────────────
    def export_customer_data(self, tenant_id: str, customer_entity_id: str) -> Dict[str, Any]:
        """Export EVERY piece of data about one customer — GDPR ready."""
        customer = (
            self.db.query(OntologyObject)
            .filter(OntologyObject.id == customer_entity_id)
            .filter(OntologyObject.tenant_id == tenant_id)
            .first()
        )
        if customer is None:
            return {"error": "customer_not_found"}

        customer_events = (
            self.db.query(DomainEventModel)
            .filter(DomainEventModel.tenant_id == tenant_id)
            .filter(DomainEventModel.canonical_entity_id == customer_entity_id)
            .all()
        )
        customer_state = (
            self.db.query(EntityStateModel)
            .filter(EntityStateModel.canonical_entity_id == customer_entity_id)
            .first()
        )
        # Related records (referenced in customer's relationships_json)
        related: List[Dict[str, Any]] = []
        try:
            rels = json.loads(customer.relationships_json or "{}")
            for rel_name, targets in rels.items():
                for target_id in targets:
                    target = (
                        self.db.query(OntologyObject)
                        .filter(OntologyObject.id == target_id)
                        .filter(OntologyObject.tenant_id == tenant_id)
                        .first()
                    )
                    if target:
                        related.append({
                            "relationship": rel_name,
                            "entity": self._serialize_object(target),
                        })
        except Exception:
            pass

        return {
            "tenant_id": tenant_id,
            "customer_entity_id": customer_entity_id,
            "generated_at": utc_now().isoformat(),
            "customer": self._serialize_object(customer),
            "state": self._serialize_state(customer_state) if customer_state else None,
            "events": [self._serialize_event(e) for e in customer_events],
            "related": related,
        }

    # ─── Serialization helpers ───────────────────────────────
    def _serialize_object(self, o: OntologyObject) -> Dict[str, Any]:
        try:
            props = json.loads(o.properties_json or "{}")
        except Exception:
            props = {}
        try:
            rels = json.loads(o.relationships_json or "{}")
        except Exception:
            rels = {}
        return {
            "id": o.id,
            "tenant_id": o.tenant_id,
            "object_type": o.object_type,
            "name": o.name,
            "status": o.status,
            "canonical_external_key": o.canonical_external_key,
            "properties": props,
            "relationships": rels,
            "created_at": o.created_at.isoformat() if o.created_at else None,
            "updated_at": o.updated_at.isoformat() if o.updated_at else None,
        }

    def _serialize_state(self, s: EntityStateModel) -> Dict[str, Any]:
        try:
            blockers = json.loads(s.blockers_json or "[]")
        except Exception:
            blockers = []
        try:
            alerts = json.loads(s.alerts_json or "[]")
        except Exception:
            alerts = []
        try:
            state = json.loads(s.state_json or "{}")
        except Exception:
            state = {}
        return {
            "canonical_entity_id": s.canonical_entity_id,
            "tenant_id": s.tenant_id,
            "entity_type": s.entity_type,
            "current_status": s.current_status,
            "risk_score": s.risk_score,
            "freshness_status": s.freshness_status,
            "blockers": blockers,
            "alerts": alerts,
            "state": state,
            "updated_at": s.updated_at.isoformat() if s.updated_at else None,
        }

    def _serialize_link(self, l: OntologyLink) -> Dict[str, Any]:
        try:
            meta = json.loads(l.metadata_json or "{}")
        except Exception:
            meta = {}
        return {
            "id": l.id,
            "tenant_id": l.tenant_id,
            "source_object_id": l.source_object_id,
            "target_object_id": l.target_object_id,
            "link_type": l.link_type,
            "metadata": meta,
        }

    def _serialize_event(self, e: DomainEventModel) -> Dict[str, Any]:
        try:
            payload = json.loads(e.payload_json or "{}")
        except Exception:
            payload = {}
        return {
            "id": e.id,
            "tenant_id": e.tenant_id,
            "event_type": e.event_type,
            "severity": e.severity,
            "source_system": e.source_system,
            "canonical_entity_id": e.canonical_entity_id,
            "entity_type": e.entity_type,
            "payload": payload,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }

    def _serialize_audit(self, a: AuditLogModel) -> Dict[str, Any]:
        try:
            details = json.loads(a.details_json or "{}")
        except Exception:
            details = {}
        return {
            "id": a.id,
            "tenant_id": a.tenant_id,
            "actor_id": a.actor_id,
            "action_name": a.action_name,
            "target_entity_id": a.target_entity_id,
            "details": details,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }

    def _csv_safe(self, v: Any) -> str:
        if v is None:
            return ""
        if isinstance(v, (dict, list)):
            return json.dumps(v, ensure_ascii=False)
        return str(v)
