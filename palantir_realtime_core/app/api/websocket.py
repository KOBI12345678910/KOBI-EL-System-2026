from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Any, Dict, Set

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter(tags=["websocket"])


class ConnectionManager:
    """
    Per-tenant WebSocket fan-out.

    Clients connect to /ws/{tenant_id} and receive every domain event
    for that tenant in real-time. Every published event on the event bus
    is broadcast to every connected client of the matching tenant.
    """

    def __init__(self) -> None:
        self._connections: Dict[str, Set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, tenant_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections[tenant_id].add(websocket)

    async def disconnect(self, tenant_id: str, websocket: WebSocket) -> None:
        async with self._lock:
            conns = self._connections.get(tenant_id)
            if conns and websocket in conns:
                conns.discard(websocket)
                if not conns:
                    self._connections.pop(tenant_id, None)

    async def broadcast(self, tenant_id: str, message: Dict[str, Any]) -> None:
        async with self._lock:
            targets = list(self._connections.get(tenant_id, set()))
        dead: list[WebSocket] = []
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


manager = ConnectionManager()


@router.websocket("/ws/{tenant_id}")
async def websocket_endpoint(websocket: WebSocket, tenant_id: str):
    await manager.connect(tenant_id, websocket)
    try:
        await websocket.send_json({
            "type": "welcome",
            "tenant_id": tenant_id,
            "connection_count": manager.connection_count(tenant_id),
        })
        while True:
            msg = await websocket.receive_text()
            # echo a ping/pong style keepalive; clients may send "ping"
            if msg == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        await manager.disconnect(tenant_id, websocket)
    except Exception:
        await manager.disconnect(tenant_id, websocket)
