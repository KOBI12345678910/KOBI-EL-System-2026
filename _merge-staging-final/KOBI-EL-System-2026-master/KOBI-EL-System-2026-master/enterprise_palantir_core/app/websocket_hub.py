import json
from collections import defaultdict

from fastapi import WebSocket


class WebSocketHub:
    def __init__(self) -> None:
        self.connections = defaultdict(set)

    async def connect(self, tenant_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self.connections[tenant_id].add(websocket)

    def disconnect(self, tenant_id: str, websocket: WebSocket) -> None:
        if websocket in self.connections[tenant_id]:
            self.connections[tenant_id].remove(websocket)

    async def broadcast(self, tenant_id: str, payload: dict) -> None:
        dead = []
        for ws in self.connections[tenant_id]:
            try:
                await ws.send_text(json.dumps(payload, default=str))
            except Exception:
                dead.append(ws)

        for ws in dead:
            self.disconnect(tenant_id, ws)


websocket_hub = WebSocketHub()
