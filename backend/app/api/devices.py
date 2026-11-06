"""Routes des objets connectés (boîtier ESP32 Matter). Authentification par jeton partagé :
en-tête « X-Device-Token » = variable d'environnement DEVICE_TOKEN."""

import hmac
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field

from app.api.deps import services

DEVICE_TOKEN_HEADER = "X-Device-Token"


def require_device(request: Request, x_device_token: str | None = Header(default=None)) -> None:
    settings = request.app.state.settings
    expected = settings.device_token
    if not expected:
        if settings.is_production:
            raise HTTPException(status_code=503, detail="DEVICE_TOKEN non configuré sur le serveur")
        return  # développement / tests : jeton facultatif
    if not x_device_token or not hmac.compare_digest(x_device_token, expected):
        raise HTTPException(status_code=401, detail="jeton d'appareil invalide")


router = APIRouter(prefix="/api/devices", tags=["devices"], dependencies=[Depends(require_device)])


class ActionBody(BaseModel):
    source: Literal["matter", "bouton", "test"] = "matter"
    device: str = Field(default="esp32", min_length=1, max_length=40)


@router.get("/actions")
async def list_actions(svc=Depends(services)):
    return {"actions": svc.actions.catalog()}


@router.post("/actions/{number}")
async def trigger_action(number: int, request: Request, body: ActionBody | None = None, svc=Depends(services)):
    """Le boîtier envoie un « Idempotency-Key » par appui : une nouvelle tentative réseau ne rejoue pas l'action."""
    body = body or ActionBody()
    key = request.headers.get("Idempotency-Key")
    if key is not None and not (8 <= len(key) <= 100):
        raise HTTPException(status_code=422, detail="Idempotency-Key invalide")
    async with svc.lock:
        result = svc.run(lambda s: svc.actions.trigger(s, number, body.source, body.device), key)
    if result.get("changed") and not result.get("replayed"):
        await request.app.state.hub.broadcast()
    return result
