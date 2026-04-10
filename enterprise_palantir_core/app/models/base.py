from sqlalchemy import Column, DateTime, String

from app.core.time_utils import utc_now
from app.db import Base


class TimestampMixin:
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)


class TenantScopedMixin:
    tenant_id = Column(String, index=True, nullable=False)
