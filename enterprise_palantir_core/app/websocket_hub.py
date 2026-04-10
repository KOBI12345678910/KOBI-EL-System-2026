"""
Per-tenant WebSocket fan-out.

Connect to /ws/{tenant_id} — you will receive every event for that
tenant in real-time. Every ingested record → publishes a domain event
→ EventBus fans it out → WebSocketHub broadcasts to every connected
client of that tenant.
"""

from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Any, Dict, Set

from fastapi import WebSocket


class WebSocketHub:
    def __init__(self) -> None:
        self._connections: Dict[str, Set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, tenant_id: str, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._connections[tenant_id].add(ws)

    async def disconnect(self, tenant_id: str, ws: WebSocket) -> None:
        async with self._lock:
            conns = self._connections.get(tenant_id)
            if conns and ws in conns:
                conns.discard(ws)
                if not conns:
                    self._connections.pop(tenant_id, None)

    async def broadcast(self, tenant_id: str, message: Dict[str, Any]) -> None:
        async with self._lock:
            targets = list(self._connections.get(tenant_id, set()))
        dead = []
        for ws in targets:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        if dead:
            async with self._lock:
                conns = self._connections.get(tenant_id)
                if conns:
                    for ws in dead:
                        conns.discard(ws)

    def connection_count(self, tenant_id: str) -> int:
        return len(self._connections.get(tenant_id, set()))


ws_hub = WebSocketHub()
