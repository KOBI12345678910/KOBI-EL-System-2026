from __future__ import annotations

from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.core.ids import lineage_id
from app.models.events import LineageRecord
from app.repositories.event_repo import LineageRepository


class LineageService:
    def __init__(self, session: Session):
        self.repo = LineageRepository(session)

    def record(
        self,
        *,
        tenant_id: str,
        source_system: str,
        source_record_id: Optional[str],
        canonical_entity_id: Optional[str],
        step_name: str,
        pipeline_name: str = "default",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> LineageRecord:
        return self.repo.append(
            lineage_id=lineage_id(),
            tenant_id=tenant_id,
            source_system=source_system,
            source_record_id=source_record_id,
            canonical_entity_id=canonical_entity_id,
            pipeline_name=pipeline_name,
            step_name=step_name,
            metadata=metadata,
        )

    def for_entity(self, canonical_entity_id: str) -> List[LineageRecord]:
        return self.repo.for_entity(canonical_entity_id)
