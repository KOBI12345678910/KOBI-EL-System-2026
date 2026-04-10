from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.websocket_hub import ws_hub

router = APIRouter(tags=["ws"])


@router.websocket("/ws/{tenant_id}")
async def websocket_endpoint(websocket: WebSocket, tenant_id: str):
    await ws_hub.connect(tenant_id, websocket)
    try:
        await websocket.send_json(
            {
                "type": "welcome",
                "tenant_id": tenant_id,
                "connection_count": ws_hub.connection_count(tenant_id),
            }
        )
        while True:
            msg = await websocket.receive_text()
            if msg == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        await ws_hub.disconnect(tenant_id, websocket)
    except Exception:
        await ws_hub.disconnect(tenant_id, websocket)
