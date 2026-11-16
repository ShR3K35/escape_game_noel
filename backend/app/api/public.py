"""Routes sans authentification : santé, état public (TV / statut), mini-jeux des lutins.
Aucune de ces routes ne permet de piloter la partie."""

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field

from app.api.deps import command, services

router = APIRouter(prefix="/api", tags=["public"])


class EndedBody(BaseModel):
    play_id: str = Field(min_length=1, max_length=40)


class AttemptBody(BaseModel):
    answer: dict


@router.get("/health")
async def health(svc=Depends(services)):
    return svc.health()


@router.get("/public/state")
async def public_state(svc=Depends(services)):
    return svc.read(svc.public_view)


@router.post("/tv/ended")
async def tv_ended(body: EndedBody, request: Request, svc=Depends(services)):
    """La TV signale la fin d'une lecture ; seule la lecture en cours peut être close."""
    return await command(request, lambda s: svc.game.video_ended(s, body.play_id))


@router.get("/kids/state")
async def kids_state(svc=Depends(services)):
    return svc.read(svc.kids_view)


@router.post("/kids/games/{game_id}/attempt")
async def kids_attempt(game_id: str, body: AttemptBody, request: Request, svc=Depends(services)):
    return await command(request, lambda s: svc.kids.attempt(s, game_id, body.answer))

@router.get("/kids/free/{game_id}")
async def kids_free_play(game_id: str, level: str = Query(pattern=r"^[a-z0-9_-]{1,20}$"), svc=Depends(services)):
    """Salle de jeux : une partie libre au niveau choisi par les lutins (seulement après la mission)."""
    return svc.read(lambda s: svc.kids.free_play(s, game_id, level))
