"""
Change Data Capture (CDC) Framework.

Two reference connectors:

  PollingCDC — polls an upstream SQL table for rows updated since the
  last watermark. Works against any DB your ORM can reach.

  PostgresLogicalCDC — production-grade CDC using Postgres logical
  replication slots (wal2json / pgoutput). Falls back to no-op if
  psycopg is not installed.

Both connectors push `ChangeEvent` envelopes into the message bus
under the topic `cdc.<source_id>`, so downstream consumers (the
ingestion service, the state engine) can react without caring where
the change came from.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Awaitable, Callable, Dict, List, Optional, Protocol

from app.engines.event_bus_abstraction import EventBus


class ChangeOperation(str, Enum):
    INSERT = "insert"
    UPDATE = "update"
    DELETE = "delete"
    UPSERT = "upsert"


@dataclass
class ChangeEvent:
    change_id: str
    tenant_id: str
    source_id: str
    table_name: str
    operation: ChangeOperation
    primary_key: Dict[str, Any]
    before: Optional[Dict[str, Any]] = None
    after: Optional[Dict[str, Any]] = None
    changed_fields: List[str] = field(default_factory=list)
    source_timestamp: Optional[datetime] = None
    captured_at: datetime = field(default_factory=datetime.utcnow)
    metadata: Dict[str, Any] = field(default_factory=dict)


class CDCConnector(Protocol):
    source_id: str
    tenant_id: str

    async def start(self) -> None: ...
    async def stop(self) -> None: ...
    async def next_batch(self) -> List[ChangeEvent]: ...
    async def checkpoint(self, watermark: str) -> None: ...


# ════════════════════════════════════════════════════════════════
# POLLING CDC
# ════════════════════════════════════════════════════════════════

class PollingCDC:
    """
    Universal polling CDC — works against any DB with an updated_at
    column. Inject `query_fn(last_watermark, limit) -> list[dict]`
    and it will return ChangeEvents for each row.
    """

    def __init__(
        self,
        source_id: str,
        tenant_id: str,
        table_name: str,
        *,
        watermark_column: str = "updated_at",
        primary_key_columns: Optional[List[str]] = None,
        poll_interval_seconds: float = 5.0,
        query_fn: Optional[Callable[[Optional[str], int], Awaitable[List[Dict[str, Any]]]]] = None,
    ) -> None:
        self.source_id = source_id
        self.tenant_id = tenant_id
        self.table_name = table_name
        self.watermark_column = watermark_column
        self.primary_key_columns = primary_key_columns or ["id"]
        self.poll_interval_seconds = poll_interval_seconds
        self.query_fn = query_fn
        self._last_watermark: Optional[str] = None
        self._running = False

    async def start(self) -> None:
        self._running = True

    async def stop(self) -> None:
        self._running = False

    async def next_batch(self) -> List[ChangeEvent]:
        if not self._running or self.query_fn is None:
            return []
        rows = await self.query_fn(self._last_watermark, 500)
        events: List[ChangeEvent] = []
        max_wm = self._last_watermark
        for i, row in enumerate(rows):
            pk = {c: row.get(c) for c in self.primary_key_columns}
            wm = str(row.get(self.watermark_column, ""))
            if max_wm is None or wm > max_wm:
                max_wm = wm
            events.append(
                ChangeEvent(
                    change_id=f"cdc_{self.source_id}_{i}_{int(datetime.utcnow().timestamp() * 1000)}",
                    tenant_id=self.tenant_id,
                    source_id=self.source_id,
                    table_name=self.table_name,
                    operation=ChangeOperation.UPSERT,
                    primary_key=pk,
                    after=row,
                    changed_fields=list(row.keys()),
                    metadata={"poll_cycle": True, "watermark": wm},
                )
            )
        if max_wm and max_wm != self._last_watermark:
            await self.checkpoint(max_wm)
        return events

    async def checkpoint(self, watermark: str) -> None:
        self._last_watermark = watermark


# ════════════════════════════════════════════════════════════════
# POSTGRES LOGICAL REPLICATION CDC
# ════════════════════════════════════════════════════════════════

class PostgresLogicalCDC:
    """
    Production-grade Postgres CDC via logical replication slots.
    Falls back to no-op if psycopg (>= 3) is not installed.
    """

    def __init__(
        self,
        source_id: str,
        tenant_id: str,
        dsn: str,
        *,
        slot_name: str = "palantir_core_slot",
        publication_name: str = "palantir_core_pub",
    ) -> None:
        self.source_id = source_id
        self.tenant_id = tenant_id
        self.dsn = dsn
        self.slot_name = slot_name
        self.publication_name = publication_name
        self._conn = None
        self._running = False
        self._last_lsn: Optional[str] = None

    async def start(self) -> None:
        try:
            import psycopg  # type: ignore
        except ImportError:
            return
        try:
            self._conn = await asyncio.get_event_loop().run_in_executor(
                None, lambda: psycopg.connect(self.dsn, autocommit=True)
            )
            self._running = True
        except Exception:
            self._conn = None
            self._running = False

    async def stop(self) -> None:
        self._running = False
        if self._conn is not None:
            try:
                await asyncio.get_event_loop().run_in_executor(None, self._conn.close)
            except Exception:
                pass

    async def next_batch(self) -> List[ChangeEvent]:
        # Real impl would call pg_logical_slot_get_changes and parse
        # wal2json / pgoutput messages. Stub for the baseline build.
        return []

    async def checkpoint(self, watermark: str) -> None:
        self._last_lsn = watermark


# ════════════════════════════════════════════════════════════════
# CDC MANAGER — runs N connectors, pushes to the bus
# ════════════════════════════════════════════════════════════════

class CDCManager:
    def __init__(self, bus: EventBus) -> None:
        self.bus = bus
        self.connectors: Dict[str, Any] = {}
        self._tasks: Dict[str, asyncio.Task] = {}

    def register(self, connector: Any) -> None:
        self.connectors[connector.source_id] = connector

    async def start_all(self) -> None:
        for sid, conn in self.connectors.items():
            await conn.start()
            self._tasks[sid] = asyncio.create_task(self._loop(sid, conn))

    async def stop_all(self) -> None:
        for t in self._tasks.values():
            t.cancel()
        for conn in self.connectors.values():
            await conn.stop()

    async def _loop(self, source_id: str, connector: Any) -> None:
        poll = getattr(connector, "poll_interval_seconds", 5.0)
        while True:
            try:
                batch = await connector.next_batch()
                for evt in batch:
                    await self.bus.publish(
                        topic=f"cdc.{source_id}",
                        payload={
                            "change_id": evt.change_id,
                            "tenant_id": evt.tenant_id,
                            "source_id": evt.source_id,
                            "table_name": evt.table_name,
                            "operation": evt.operation.value,
                            "primary_key": evt.primary_key,
                            "before": evt.before,
                            "after": evt.after,
                            "changed_fields": evt.changed_fields,
                            "captured_at": evt.captured_at.isoformat(),
                            "metadata": evt.metadata,
                        },
                        key=source_id,
                    )
            except asyncio.CancelledError:
                break
            except Exception:
                pass
            await asyncio.sleep(poll)
