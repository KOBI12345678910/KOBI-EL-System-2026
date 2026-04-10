from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.websocket_hub import websocket_hub

router = APIRouter(tags=["ws"])


@router.websocket("/ws/{tenant_id}")
async def ws_live(websocket: WebSocket, tenant_id: str):
    await websocket_hub.connect(tenant_id, websocket)

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        websocket_hub.disconnect(tenant_id, websocket)
