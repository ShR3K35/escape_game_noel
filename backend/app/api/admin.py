"""Commandes du maître du jeu. Toutes nécessitent une session admin."""

import asyncio
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from app.api.deps import command, hub, require_admin, services
from app.core.game_config import PHASES
from app.services.common import log_event
from app.services.relay import RelayError, pulse_relay

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_admin)])


class Confirm(BaseModel):
    confirm: bool = False


class PhaseBody(BaseModel):
    phase: Literal[PHASES]  # type: ignore[valid-type]
    confirm: bool = False


class CountdownBody(BaseModel):
    seconds: int = Field(ge=5, le=4 * 3600)


class TeamBody(BaseModel):
    status: Literal["NON_COMMENCE", "EN_COURS", "VALIDEE"]


class BonusBody(BaseModel):
    delta: Literal[1, -1]


class PlayBody(BaseModel):
    video_id: str = Field(min_length=1, max_length=60)


class MessageBody(BaseModel):
    message_id: str | None = Field(None, max_length=40)
    title: str | None = Field(None, max_length=120)
    text: str | None = Field(None, max_length=600)
    duration: int | None = Field(None, ge=3, le=600)


class AmbientBody(BaseModel):
    ambient: str = Field(max_length=20)


class ProgressBody(BaseModel):
    visible: bool


class DifficultyBody(BaseModel):
    level: str = Field(pattern=r"^[a-z0-9_-]{1,20}$")


class MemoryDifficultyBody(BaseModel):
    kind: Literal["placement", "paires"]
    level: int = Field(ge=1, le=99)


class EmergencyBody(BaseModel):
    authorized: bool


class ScheduleBody(BaseModel):
    at: str | None = Field(None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    enabled: bool | None = None


def _require_confirm(body: Confirm) -> None:
    if not body.confirm:
        raise HTTPException(status_code=428, detail="confirmation requise")


@router.get("/state")
async def state(request: Request, svc=Depends(services), h=Depends(hub)):
    return svc.read(lambda s: svc.admin_view(s, h.counts()))


@router.get("/events")
async def events(limit: int = Query(100, ge=1, le=500), svc=Depends(services)):
    return svc.read(lambda s: svc.events(s, limit))


# ------------------------------------------------------------------ partie
@router.post("/game/start")
async def start(request: Request, svc=Depends(services)):
    return await command(request, lambda s: svc.game.set_phase(s, "INTRO"))


@router.post("/game/countdown")
async def countdown(body: CountdownBody, request: Request, svc=Depends(services)):
    return await command(request, lambda s: svc.game.start_countdown(s, body.seconds))


@router.post("/game/countdown/cancel")
async def countdown_cancel(request: Request, svc=Depends(services)):
    return await command(request, svc.game.cancel_countdown)


@router.post("/game/phase")
async def phase(body: PhaseBody, request: Request, svc=Depends(services)):
    return await command(request, lambda s: svc.game.set_phase(s, body.phase, confirm=body.confirm))


@router.post("/game/emergency")
async def emergency(body: EmergencyBody, request: Request, svc=Depends(services)):
    """Autorise (ou verrouille) le protocole d'urgence déclenché par l'action 5 du boîtier Matter."""
    return await command(request, lambda s: svc.game.set_emergency_authorized(s, body.authorized))


@router.post("/game/reset")
async def reset(body: Confirm, request: Request, svc=Depends(services)):
    _require_confirm(body)
    return await command(request, svc.reset_all)


@router.post("/backup")
async def backup(request: Request, svc=Depends(services)):
    async with svc.lock:
        path = svc.backup()
    return {"file": path.name}


# ------------------------------------------------------------------ équipes
@router.post("/teams/{team_id}")
async def team(team_id: str, body: TeamBody, request: Request, svc=Depends(services)):
    return await command(request, lambda s: svc.game.set_team_status(s, team_id, body.status))


@router.post("/teams/{team_id}/bonus")
async def team_bonus(team_id: str, body: BonusBody, request: Request, svc=Depends(services)):
    """Point bonus : un joueur de l'équipe a réussi sa mission personnelle (+1) ou correction (-1)."""
    return await command(request, lambda s: svc.game.add_team_bonus(s, team_id, body.delta))


# ----------------------------------------------------------------------- TV
@router.post("/tv/play")
async def play(body: PlayBody, request: Request, svc=Depends(services)):
    return await command(request, lambda s: svc.game.play_video(s, body.video_id))


@router.post("/tv/stop")
async def stop(request: Request, svc=Depends(services)):
    return await command(request, svc.game.stop_video)


@router.post("/tv/message")
async def message(body: MessageBody, request: Request, svc=Depends(services)):
    return await command(request, lambda s: svc.game.show_message(
        s, message_id=body.message_id, text=body.text, title=body.title, duration=body.duration))


@router.post("/tv/message/clear")
async def clear_message(request: Request, svc=Depends(services)):
    return await command(request, svc.game.clear_message)


@router.post("/tv/ambient")
async def ambient(body: AmbientBody, request: Request, svc=Depends(services)):
    return await command(request, lambda s: svc.game.set_ambient(s, body.ambient))


@router.post("/tv/progress")
async def progress(body: ProgressBody, request: Request, svc=Depends(services)):
    return await command(request, lambda s: svc.game.set_show_progress(s, body.visible))


# ------------------------------------------------------------------ lutins
@router.post("/kids/reset")
async def kids_reset_all(body: Confirm, request: Request, svc=Depends(services)):
    _require_confirm(body)
    return await command(request, lambda s: svc.kids.reset_all(s) or {"changed": True})


@router.post("/kids/tournee/difficulty")
async def kids_difficulty(body: DifficultyBody, request: Request, svc=Depends(services)):
    return await command(request, lambda s: svc.kids.set_difficulty(s, body.level))


@router.post("/kids/machine/difficulty")
async def kids_machine_difficulty(body: DifficultyBody, request: Request, svc=Depends(services)):
    return await command(request, lambda s: svc.kids.set_machine_difficulty(s, body.level))


@router.post("/kids/constellation/difficulty")
async def kids_memory_difficulty(body: MemoryDifficultyBody, request: Request, svc=Depends(services)):
    return await command(request, lambda s: svc.kids.set_memory_difficulty(s, body.kind, body.level))


@router.post("/kids/{game_id}/complete")
async def kids_complete(game_id: str, request: Request, svc=Depends(services)):
    return await command(request, lambda s: svc.kids.admin_complete(s, game_id))


@router.post("/kids/{game_id}/reset")
async def kids_reset(game_id: str, request: Request, svc=Depends(services)):
    return await command(request, lambda s: svc.kids.reset_game(s, game_id))


# ----------------------------------------------------------------- planning
@router.post("/schedule/{item_id}")
async def schedule_update(item_id: str, body: ScheduleBody, request: Request, svc=Depends(services)):
    return await command(request, lambda s: svc.schedule.update(s, item_id, at=body.at, enabled=body.enabled))


@router.post("/schedule/{item_id}/fire")
async def schedule_fire(item_id: str, request: Request, svc=Depends(services)):
    return await command(request, lambda s: svc.schedule.fire(s, item_id))


# ------------------------------------------------------------------- relais
@router.post("/relay/pulse")
async def relay_pulse(request: Request, svc=Depends(services)):
    """Colle le relais de l'ESP8266 des capteurs de porte pendant 5 s (même effet que la bonne séquence)."""
    settings = request.app.state.settings
    if not settings.relay_url:
        raise HTTPException(status_code=503, detail="RELAY_URL non configuré sur le serveur")
    try:
        result = await asyncio.to_thread(pulse_relay, settings.relay_url, settings.device_token)
    except RelayError as exc:
        error = str(exc)
        await command(request, lambda s: log_event(
            s, svc.clock, "relay_failed", f"Relais injoignable : {error}", {"error": error}, "admin"))
        raise HTTPException(status_code=502, detail=f"relais injoignable : {error}") from exc
    await command(request, lambda s: log_event(
        s, svc.clock, "relay_pulse", "Relais déclenché depuis l'admin", result, "admin"))
    return {"changed": True} | result
