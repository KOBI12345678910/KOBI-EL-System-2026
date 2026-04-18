"""
Timeline Playback — "scrub through time" over the event store.

Lets an operator play back a sequence of events between any two
timestamps and see how the company state evolved minute-by-minute.

Uses the ReplayEngine to reconstruct state at regular intervals and
produces a TimelineSeries: an ordered list of state snapshots that
can be rendered as an animation in a UI.

Metrics tracked per frame:
  - total_objects
  - by_entity_type counts
  - at_risk / blocked counts
  - risk_score distribution
  - event count since previous frame
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models.events import DomainEventModel
from app.models.ontology import OntologyObject


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class TimelineFrame:
    frame_index: int
    timestamp: datetime
    cumulative_events: int
    delta_events: int
    total_objects_seen: int
    by_entity_type: Dict[str, int]
    by_severity: Dict[str, int]
    event_types_in_frame: Dict[str, int]


@dataclass
class TimelineSeries:
    tenant_id: str
    start_time: datetime
    end_time: datetime
    interval_seconds: int
    frame_count: int
    frames: List[TimelineFrame]
    total_events: int


class TimelinePlayback:
    def __init__(self, db: Session) -> None:
        self.db = db

    def build_series(
        self,
        tenant_id: str,
        *,
        start_time: datetime,
        end_time: datetime,
        interval_seconds: int = 60,
        max_frames: int = 200,
    ) -> TimelineSeries:
        # Normalize tz
        if start_time.tzinfo is None:
            start_time = start_time.replace(tzinfo=timezone.utc)
        if end_time.tzinfo is None:
            end_time = end_time.replace(tzinfo=timezone.utc)

        # Query all events in the window
        events = (
            self.db.query(DomainEventModel)
            .filter(DomainEventModel.tenant_id == tenant_id)
            .filter(DomainEventModel.created_at >= start_time)
            .filter(DomainEventModel.created_at <= end_time)
            .order_by(DomainEventModel.created_at.asc())
            .all()
        )

        # Generate frame boundaries
        frames: List[TimelineFrame] = []
        total_seconds = (end_time - start_time).total_seconds()
        # Cap number of frames so we never produce 10,000 frames
        ideal_frames = int(total_seconds / interval_seconds) + 1
        if ideal_frames > max_frames:
            interval_seconds = int(total_seconds / max_frames)
            ideal_frames = max_frames

        entities_seen: set = set()
        by_type_cumulative: Dict[str, int] = {}
        cumulative_events = 0
        prev_cumulative = 0

        event_iter = iter(events)
        next_event = next(event_iter, None)

        for i in range(ideal_frames):
            frame_end = start_time + timedelta(seconds=interval_seconds * (i + 1))
            if frame_end > end_time:
                frame_end = end_time

            delta_count = 0
            frame_severities: Dict[str, int] = {}
            frame_event_types: Dict[str, int] = {}
            frame_entities_new: set = set()

            while next_event is not None:
                ts = next_event.created_at
                if ts is None:
                    next_event = next(event_iter, None)
                    continue
                ts_aware = ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc)
                if ts_aware > frame_end:
                    break
                cumulative_events += 1
                delta_count += 1
                frame_severities[next_event.severity] = frame_severities.get(next_event.severity, 0) + 1
                frame_event_types[next_event.event_type] = frame_event_types.get(next_event.event_type, 0) + 1
                if next_event.canonical_entity_id not in entities_seen:
                    entities_seen.add(next_event.canonical_entity_id)
                    by_type_cumulative[next_event.entity_type] = by_type_cumulative.get(next_event.entity_type, 0) + 1
                next_event = next(event_iter, None)

            frames.append(TimelineFrame(
                frame_index=i,
                timestamp=frame_end,
                cumulative_events=cumulative_events,
                delta_events=delta_count,
                total_objects_seen=len(entities_seen),
                by_entity_type=dict(by_type_cumulative),
                by_severity=frame_severities,
                event_types_in_frame=frame_event_types,
            ))
            prev_cumulative = cumulative_events

            if frame_end >= end_time:
                break

        return TimelineSeries(
            tenant_id=tenant_id,
            start_time=start_time,
            end_time=end_time,
            interval_seconds=interval_seconds,
            frame_count=len(frames),
            frames=frames,
            total_events=cumulative_events,
        )

    def span_of_entity(
        self,
        tenant_id: str,
        entity_id: str,
    ) -> Dict[str, Any]:
        """Return first/last/duration of an entity's lifetime in the event stream."""
        events = (
            self.db.query(DomainEventModel)
            .filter(DomainEventModel.tenant_id == tenant_id)
            .filter(DomainEventModel.canonical_entity_id == entity_id)
            .order_by(DomainEventModel.created_at.asc())
            .all()
        )
        if not events:
            return {"entity_id": entity_id, "event_count": 0}
        first = events[0].created_at
        last = events[-1].created_at
        first_aware = first if first and first.tzinfo else (first.replace(tzinfo=timezone.utc) if first else None)
        last_aware = last if last and last.tzinfo else (last.replace(tzinfo=timezone.utc) if last else None)
        duration_sec = 0
        if first_aware and last_aware:
            duration_sec = int((last_aware - first_aware).total_seconds())
        by_type: Dict[str, int] = {}
        for e in events:
            by_type[e.event_type] = by_type.get(e.event_type, 0) + 1
        return {
            "entity_id": entity_id,
            "event_count": len(events),
            "first_event_at": first_aware.isoformat() if first_aware else None,
            "last_event_at": last_aware.isoformat() if last_aware else None,
            "duration_seconds": duration_sec,
            "event_types": by_type,
        }
