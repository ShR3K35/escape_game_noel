"""Diffusion temps réel. Le WebSocket est en lecture seule : le serveur pousse des instantanés,
aucune commande n'est acceptée par ce canal (les commandes passent par l'API REST authentifiée)."""

import asyncio
import logging

from fastapi import WebSocket

from app.services.container import Services

log = logging.getLogger("noel2026.ws")
CHANNELS = ("admin", "tv", "kids", "status")


class Hub:
    def __init__(self, services: Services):
        self.services = services
        self.clients: dict[str, set[WebSocket]] = {c: set() for c in CHANNELS}

    def counts(self) -> dict[str, int]:
        return {c: len(ws) for c, ws in self.clients.items()}

    def snapshot(self, channel: str) -> dict:
        svc = self.services
        if channel == "admin":
            data = svc.read(lambda s: svc.admin_view(s, self.counts()))
        elif channel == "kids":
            data = svc.read(svc.kids_view)
        else:
            data = svc.read(svc.public_view)
        return {"type": "state", "channel": channel, "data": data}

    async def connect(self, ws: WebSocket, channel: str) -> None:
        self.clients[channel].add(ws)
        log.info("ws connected", extra={"channel": channel, "clients": len(self.clients[channel])})
        await ws.send_json(self.snapshot(channel))
        if channel != "admin":
            await self.broadcast(["admin"])  # met à jour le compteur d'écrans connectés

    async def disconnect(self, ws: WebSocket, channel: str) -> None:
        self.clients[channel].discard(ws)
        log.info("ws disconnected", extra={"channel": channel})
        if channel != "admin":
            await self.broadcast(["admin"])

    async def broadcast(self, channels: list[str] | None = None) -> None:
        for channel in channels or CHANNELS:
            if not self.clients[channel]:
                continue
            message = self.snapshot(channel)
            results = await asyncio.gather(
                *(ws.send_json(message) for ws in list(self.clients[channel])), return_exceptions=True)
            for ws, res in zip(list(self.clients[channel]), results, strict=False):
                if isinstance(res, Exception):
                    self.clients[channel].discard(ws)
