from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.websocket_hub import websocket_hub

router = APIRouter(tags=["ws"])


@router.websocket("/ws/{tenant_id}")
async def websocket_endpoint(websocket: WebSocket, tenant_id: str):
    await websocket_hub.connect(tenant_id, websocket)
    try:
        await websocket.send_text(
            '{"type": "welcome", "tenant_id": "' + tenant_id + '"}'
        )
        while True:
            msg = await websocket.receive_text()
            if msg == "ping":
                await websocket.send_text('{"type": "pong"}')
    except WebSocketDisconnect:
        websocket_hub.disconnect(tenant_id, websocket)
    except Exception:
        websocket_hub.disconnect(tenant_id, websocket)
