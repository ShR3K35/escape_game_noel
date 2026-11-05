from collections.abc import Callable
from typing import Any

from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from app.core.security import SessionSigner
from app.services.container import Services
from app.services.realtime import Hub

SESSION_COOKIE = "noel_session"


def services(request: Request) -> Services:
    return request.app.state.services


def hub(request: Request) -> Hub:
    return request.app.state.hub


def signer(request: Request) -> SessionSigner:
    return request.app.state.signer


def is_admin(request: Request) -> bool:
    return request.app.state.signer.verify(request.cookies.get(SESSION_COOKIE))


def require_admin(request: Request) -> None:
    if not is_admin(request):
        raise HTTPException(status_code=401, detail="authentification requise")


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "inconnu"


async def command(request: Request, fn: Callable[[Session], Any], broadcast: bool = True) -> Any:
    """Exécute une mutation sérialisée + idempotente, puis notifie tous les écrans."""
    svc: Services = request.app.state.services
    key = request.headers.get("Idempotency-Key")
    if key is not None and not (8 <= len(key) <= 100):
        raise HTTPException(status_code=422, detail="Idempotency-Key invalide")
    async with svc.lock:
        result = svc.run(fn, key)
    if broadcast:
        await request.app.state.hub.broadcast()
    return result
