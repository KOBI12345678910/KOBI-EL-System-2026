from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt is not None else None


def seconds_since(dt: Optional[datetime]) -> Optional[float]:
    if dt is None:
        return None
    return (utc_now() - dt).total_seconds()


def is_stale(dt: Optional[datetime], max_age_seconds: int) -> bool:
    if dt is None:
        return True
    return (utc_now() - dt) > timedelta(seconds=max_age_seconds)
