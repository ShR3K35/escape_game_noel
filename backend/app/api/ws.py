import logging
from urllib.parse import urlparse

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.api.deps import SESSION_COOKIE
from app.services.realtime import CHANNELS

router = APIRouter()
log = logging.getLogger("noel2026.ws")


def _same_origin(ws: WebSocket) -> bool:
    origin = ws.headers.get("origin")
    if not origin:
        return True  # client non navigateur (tests, outils)
    return urlparse(origin).netloc == ws.headers.get("host")


@router.websocket("/ws")
async def websocket(ws: WebSocket, channel: str = "status"):
    if channel not in CHANNELS:
        await ws.close(code=4400)
        return
    if channel == "admin":
        if not _same_origin(ws) or not ws.app.state.signer.verify(ws.cookies.get(SESSION_COOKIE)):
            await ws.close(code=4401)
            return
    await ws.accept()
    hub = ws.app.state.hub
    await hub.connect(ws, channel)
    try:
        while True:
            msg = await ws.receive_text()
            if msg == "ping":
                await ws.send_json({"type": "pong"})
            else:
                log.warning("message WebSocket ignoré (canal en lecture seule)", extra={"channel": channel})
    except WebSocketDisconnect:
        pass
    finally:
        await hub.disconnect(ws, channel)
