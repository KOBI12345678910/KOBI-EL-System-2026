"""
Seed runner — idempotently loads every row from seed_catalog into the DB
using the same code paths the API uses (so every seeded row passes
through ingestion_service → state_engine → lineage, exactly like real data).

Two-pass strategy for entities:

  PASS 1: ingest every entity with EMPTY relationships. This populates
          the ontology_objects table so we can resolve every entity's
          real canonical object id via its (entity_type, external_key).

  PASS 2: re-ingest every entity WITH relationships, rewriting each
          "Type:ExternalKey" reference in the seed catalog to the real
          obj_ id that was assigned in Pass 1. This guarantees the graph
          traversal engine can actually walk the relationships at runtime.

Runs automatically on startup if the DB is empty (or when FORCE_SEED=true).
"""

from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.core.ids import new_id
from app.core.time_utils import utc_now
from app.db import SessionLocal
from app.models.ontology import OntologyObject
from app.models.permissions import RoleModel
from app.models.tenant import Tenant
from app.models.workflow import WorkflowDefinitionModel
from app.schemas.ingest import IngestRecordIn
from app.seed.seed_catalog import (
    POLICIES,
    ROLES,
    TECHNO_KOL_UZI_ENTITIES,
    TENANTS,
    WORKFLOW_DEFINITIONS,
)
from app.services.ingestion_service import IngestionService
from app.services.ontology_service import OntologyService


# ════════════════════════════════════════════════════════════════
# MAIN RUNNER
# ════════════════════════════════════════════════════════════════

def seed_if_needed(force: bool = False) -> Dict[str, Any]:
    """
    Seed the database if it's empty, or if force=True.
    Returns a summary of what was seeded.
    """
    session = SessionLocal()
    try:
        existing_tenants = session.query(Tenant).count()
        existing_objects = session.query(OntologyObject).count()
        if not force and (existing_tenants > 0 or existing_objects > 0):
            return {
                "status": "skipped",
                "reason": "database already contains data",
                "existing_tenants": existing_tenants,
                "existing_objects": existing_objects,
            }

        summary = {
            "status": "seeded",
            "tenants": 0,
            "entities_pass1": 0,
            "entities_pass2": 0,
            "workflow_definitions": 0,
            "roles": 0,
            "policies_registered": len(POLICIES),
        }

        # 1. Tenants
        summary["tenants"] = _seed_tenants(session)

        # 2. Entities (2-pass ingest)
        p1, p2 = _seed_entities_two_pass(session)
        summary["entities_pass1"] = p1
        summary["entities_pass2"] = p2

        # 3. Workflow definitions
        summary["workflow_definitions"] = _seed_workflow_definitions(session)

        # 4. Roles
        summary["roles"] = _seed_roles(session)

        session.commit()
        return summary
    except Exception as exc:
        session.rollback()
        return {"status": "error", "error": str(exc)}
    finally:
        session.close()


def _seed_tenants(db: Session) -> int:
    count = 0
    for t in TENANTS:
        existing = db.query(Tenant).filter(Tenant.id == t["id"]).first()
        if existing is not None:
            continue
        row = Tenant(id=t["id"], name=t["name"], is_active=t["is_active"])
        db.add(row)
        count += 1
    db.flush()
    return count


# ════════════════════════════════════════════════════════════════
# TWO-PASS ENTITY SEEDING
# ════════════════════════════════════════════════════════════════

def _seed_entities_two_pass(db: Session) -> Tuple[int, int]:
    """
    Pass 1 ingests with EMPTY relationships.
    Pass 2 rewrites every "Type:Key" ref to the real obj_ id and re-ingests.
    """
    service = IngestionService(db)
    ontology = OntologyService(db)

    # ─── PASS 1 ─────────────────────────────────────────────
    pass1_count = 0
    for entity in TECHNO_KOL_UZI_ENTITIES:
        record = IngestRecordIn(
            tenant_id="techno_kol_uzi",
            source_system=entity["source_system"],
            source_record_id=entity["source_record_id"],
            entity_type=entity["entity_type"],
            entity_name=entity["entity_name"],
            canonical_external_key=entity.get("canonical_external_key"),
            event_type="entity_upserted",
            severity="info",
            properties=entity.get("properties", {}),
            relationships={},  # empty in pass 1
        )
        try:
            service.ingest_record(record)
            pass1_count += 1
        except Exception as exc:
            print(f"[seed pass1] ingest failed for {entity['source_record_id']}: {exc}")

    db.flush()

    # Build index (entity_type, external_key) → real obj id
    index: Dict[Tuple[str, str], str] = {}
    for entity in TECHNO_KOL_UZI_ENTITIES:
        ext_key = entity.get("canonical_external_key")
        if not ext_key:
            continue
        obj_id = ontology.resolve_object_id(
            tenant_id="techno_kol_uzi",
            entity_type=entity["entity_type"],
            source_system=entity["source_system"],
            source_record_id=entity["source_record_id"],
            canonical_external_key=ext_key,
        )
        index[(entity["entity_type"], ext_key)] = obj_id

    # ─── PASS 2: re-ingest with resolved relationships ──────
    pass2_count = 0
    for entity in TECHNO_KOL_UZI_ENTITIES:
        rels = entity.get("relationships", {})
        if not rels:
            continue
        resolved_rels = _resolve_relationships(rels, index)
        record = IngestRecordIn(
            tenant_id="techno_kol_uzi",
            source_system=entity["source_system"],
            source_record_id=entity["source_record_id"],
            entity_type=entity["entity_type"],
            entity_name=entity["entity_name"],
            canonical_external_key=entity.get("canonical_external_key"),
            event_type=entity.get("event_type", "entity_upserted"),
            severity=entity.get("severity", "info"),
            properties=entity.get("properties", {}),
            relationships=resolved_rels,
        )
        try:
            service.ingest_record(record)
            pass2_count += 1
        except Exception as exc:
            print(f"[seed pass2] ingest failed for {entity['source_record_id']}: {exc}")

    # Demo entities for the other tenants
    for tid in ("alpha_industries", "beta_manufacturing"):
        record = IngestRecordIn(
            tenant_id=tid,
            source_system="demo_seed",
            source_record_id=f"demo_{tid}_0001",
            entity_type="Customer",
            entity_name=f"{tid.replace('_', ' ').title()} Demo Customer",
            canonical_external_key=f"{tid}_DEMO_CUST",
            event_type="entity_upserted",
            severity="info",
            properties={"status": "active", "demo": True},
            relationships={},
        )
        try:
            service.ingest_record(record)
            pass1_count += 1
        except Exception:
            pass

    return pass1_count, pass2_count


def _resolve_relationships(
    rels: Dict[str, List[str]],
    index: Dict[Tuple[str, str], str],
) -> Dict[str, List[str]]:
    """
    Walk every relationship list and replace every "Type:ExternalKey" ref
    with the real obj_ id from the index. Unresolved refs are silently
    dropped (better than leaving a dangling placeholder in the graph).
    """
    out: Dict[str, List[str]] = {}
    for rel_name, targets in rels.items():
        resolved: List[str] = []
        for t in targets:
            if isinstance(t, str) and ":" in t and not t.startswith("obj_"):
                type_name, _, ext_key = t.partition(":")
                real = index.get((type_name, ext_key))
                if real:
                    resolved.append(real)
            else:
                resolved.append(t)
        if resolved:
            out[rel_name] = resolved
    return out


# ════════════════════════════════════════════════════════════════
# OTHER SEEDERS
# ════════════════════════════════════════════════════════════════

def _seed_workflow_definitions(db: Session) -> int:
    count = 0
    for wf in WORKFLOW_DEFINITIONS:
        existing = db.query(WorkflowDefinitionModel).filter(
            WorkflowDefinitionModel.id == wf["id"]
        ).first()
        if existing is not None:
            continue
        row = WorkflowDefinitionModel(
            id=wf["id"],
            tenant_id="techno_kol_uzi",
            workflow_type=wf["workflow_type"],
            definition_json=json.dumps(wf["definition"], ensure_ascii=False),
        )
        db.add(row)
        count += 1
    db.flush()
    return count


def _seed_roles(db: Session) -> int:
    count = 0
    for r in ROLES:
        existing = db.query(RoleModel).filter(RoleModel.id == r["id"]).first()
        if existing is not None:
            continue
        row = RoleModel(
            id=r["id"],
            tenant_id="techno_kol_uzi",
            name=r["name"],
            permissions_json=json.dumps(r["permissions"]),
        )
        db.add(row)
        count += 1
    db.flush()
    return count


def register_policies_on_engine(policy_engine: Any) -> int:
    """
    Called at app startup — registers every catalog policy on the
    PolicyEngine instance used by the ActionEngine.
    """
    from app.engines.policy_engine import Policy
    count = 0
    for p in POLICIES:
        policy_engine.register(Policy(
            policy_id=p["policy_id"],
            name=p["name"],
            action_type_match=p.get("action_type_match", "*"),
            max_impact_usd=p.get("max_impact_usd"),
            max_per_minute=p.get("max_per_minute"),
            max_per_day=p.get("max_per_day"),
            requires_approval=p.get("requires_approval", False),
        ))
        count += 1
    return count
