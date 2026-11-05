"""Moteur de jeu : machine à états de la partie, équipes adultes et télévision."""

import logging
import uuid
from collections import deque
from datetime import timedelta
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.game_config import PHASES, AppConfig
from app.models import GameState, TeamProgress
from app.services.common import Clock, GameError, iso, log_event

log = logging.getLogger("noel2026.game")

PHASE_TRANSITIONS: dict[str, set[str]] = {
    "PREPARATION": {"INTRO"},
    "INTRO": {"ENQUETE"},
    "ENQUETE": {"FINALE", "VICTOIRE", "SECOURS"},
    "FINALE": {"VICTOIRE", "SECOURS"},
    "VICTOIRE": {"FIN"},
    "SECOURS": {"VICTOIRE", "FIN"},
    "FIN": set(),
}
# Transitions sensibles : le client doit envoyer confirm=true.
CRITICAL_PHASES = {"VICTOIRE", "SECOURS"}
# Fin d'une vidéo de phase -> phase suivante automatique.
AUTO_ADVANCE = {"INTRO": "ENQUETE", "VICTOIRE": "FIN", "SECOURS": "FIN"}

TEAM_STATUSES = ("NON_COMMENCE", "EN_COURS", "VALIDEE")
TEAM_TRANSITIONS: dict[str, set[str]] = {
    "NON_COMMENCE": {"EN_COURS"},
    "EN_COURS": {"VALIDEE", "NON_COMMENCE"},
    "VALIDEE": {"EN_COURS"},
}
TEAM_LABELS = {"NON_COMMENCE": "non commencée", "EN_COURS": "en cours", "VALIDEE": "validée"}

AMBIENTS = ("aucun", "neige", "etoiles", "magie")
PLAY_DEBOUNCE = timedelta(seconds=3)


def _team_path(current: str, target: str) -> list[str]:
    """Chemin le plus court dans la machine à états d'une équipe (ex. NON_COMMENCE -> VALIDEE)."""
    queue = deque([[current]])
    seen = {current}
    while queue:
        path = queue.popleft()
        if path[-1] == target:
            return path[1:]
        for nxt in sorted(TEAM_TRANSITIONS[path[-1]]):
            if nxt not in seen:
                seen.add(nxt)
                queue.append(path + [nxt])
    raise GameError(f"transition impossible {current} -> {target}")


class GameService:
    def __init__(self, cfg: AppConfig, media_dir: Path, clock: Clock):
        self.cfg = cfg
        self.media_dir = media_dir
        self.clock = clock

    # ------------------------------------------------------------------ état
    def bootstrap(self, s: Session) -> None:
        if s.get(GameState, 1) is None:
            s.add(GameState(id=1, phase="PREPARATION", tv_ambient="neige", updated_at=self.clock()))
        for team in self.cfg.teams:
            if s.get(TeamProgress, team.id) is None:
                s.add(TeamProgress(team_id=team.id, status="NON_COMMENCE", updated_at=self.clock()))

    def state(self, s: Session) -> GameState:
        st = s.get(GameState, 1)
        if st is None:
            raise GameError("état de jeu non initialisé", 500)
        return st

    def _touch(self, st: GameState) -> None:
        st.updated_at = self.clock()

    # ---------------------------------------------------------------- phases
    def set_phase(self, s: Session, target: str, source: str = "admin", confirm: bool = False) -> dict:
        if target not in PHASES:
            raise GameError(f"phase inconnue : {target}", 422)
        st = self.state(s)
        if st.phase == target:
            return {"changed": False, "phase": target}
        if target not in PHASE_TRANSITIONS[st.phase]:
            raise GameError(f"transition interdite : {st.phase} -> {target}")
        if target in CRITICAL_PHASES and source == "admin" and not confirm:
            raise GameError(f"confirmation requise pour passer en {target}", 428)
        previous = st.phase
        now = self.clock()
        st.phase = target
        st.phase_changed_at = now
        if target == "INTRO":
            st.started_at = now
        if target == "FIN":
            st.ended_at = now
        self._touch(st)
        log_event(s, self.clock, "phase_changed", f"Phase {previous} → {target}",
                  {"from": previous, "to": target}, source)
        log.info("phase changed", extra={"from_phase": previous, "to_phase": target, "source": source})
        video_id = self.cfg.phase_videos.get(target)
        if video_id:
            self.play_video(s, video_id, source="system", force=True)
        return {"changed": True, "phase": target, "previous": previous}

    def reset(self, s: Session, source: str = "admin") -> None:
        st = self.state(s)
        st.phase = "PREPARATION"
        st.started_at = st.ended_at = None
        st.phase_changed_at = self.clock()
        self._clear_play(st)
        self._clear_message(st)
        st.tv_ambient = "neige"
        self._touch(st)
        for row in s.query(TeamProgress).all():
            row.status = "NON_COMMENCE"
            row.updated_at = self.clock()
        log_event(s, self.clock, "game_reset", "Partie réinitialisée", None, source)

    # ---------------------------------------------------------------- équipes
    def set_team_status(self, s: Session, team_id: str, target: str, source: str = "admin") -> dict:
        team = next((t for t in self.cfg.teams if t.id == team_id), None)
        if team is None:
            raise GameError(f"équipe inconnue : {team_id}", 404)
        if target not in TEAM_STATUSES:
            raise GameError(f"statut inconnu : {target}", 422)
        row = s.get(TeamProgress, team_id)
        if row.status == target:
            return {"changed": False, "status": target}
        for step in _team_path(row.status, target):
            previous = row.status
            row.status = step
            row.updated_at = self.clock()
            log_event(s, self.clock, "team_changed",
                      f"{team.name} : {TEAM_LABELS[previous]} → {TEAM_LABELS[step]}",
                      {"team": team_id, "from": previous, "to": step}, source)
        return {"changed": True, "status": target}

    # ----------------------------------------------------------------- vidéos
    def video_available(self, file: str) -> bool:
        return (self.media_dir / "videos" / file).is_file()

    def video_payload(self, video_id: str) -> dict:
        v = self.cfg.video(video_id)
        return {
            "id": v.id,
            "title": v.title,
            "url": f"/media/videos/{v.file}",
            "file": v.file,
            "available": self.video_available(v.file),
            "fallback_text": v.fallback_text,
            "fallback_seconds": v.fallback_seconds,
        }

    def play_video(self, s: Session, video_id: str, source: str = "admin", force: bool = False) -> dict:
        video = self.cfg.video(video_id)
        if video is None:
            raise GameError(f"vidéo inconnue : {video_id}", 404)
        if video.kind == "loop":
            raise GameError("la boucle du bureau est jouée automatiquement ; utilisez « stop »", 422)
        st = self.state(s)
        now = self.clock()
        if (not force and st.tv_video_id == video_id and st.tv_play_started_at
                and now - st.tv_play_started_at < PLAY_DEBOUNCE):
            return {"changed": False, "play_id": st.tv_play_id}
        replaced = st.tv_video_id
        st.tv_play_id = uuid.uuid4().hex
        st.tv_video_id = video_id
        st.tv_play_started_at = now
        self._touch(st)
        log_event(s, self.clock, "video_play", f"Vidéo lancée : {video.title}",
                  {"video": video_id, "play_id": st.tv_play_id, "replaced": replaced,
                   "available": self.video_available(video.file)}, source)
        return {"changed": True, "play_id": st.tv_play_id}

    def _clear_play(self, st: GameState) -> None:
        st.tv_play_id = st.tv_video_id = st.tv_play_started_at = None

    def stop_video(self, s: Session, source: str = "admin") -> dict:
        st = self.state(s)
        if not st.tv_play_id:
            return {"changed": False}
        video_id = st.tv_video_id
        self._clear_play(st)
        self._touch(st)
        log_event(s, self.clock, "video_stop", "Retour au bureau du Père Noël", {"video": video_id}, source)
        return {"changed": True}

    def video_ended(self, s: Session, play_id: str) -> dict:
        """Signalé par la TV à la fin d'une lecture. Ignoré si la lecture n'est plus la courante."""
        st = self.state(s)
        if not st.tv_play_id or st.tv_play_id != play_id:
            return {"changed": False}
        video_id = st.tv_video_id
        self._clear_play(st)
        self._touch(st)
        log_event(s, self.clock, "video_ended", f"Vidéo terminée : {video_id}", {"video": video_id}, "tv")
        nxt = AUTO_ADVANCE.get(st.phase)
        if self.cfg.game.auto_advance and nxt and self.cfg.phase_videos.get(st.phase) == video_id:
            self.set_phase(s, nxt, source="system")
        return {"changed": True}

    # --------------------------------------------------------------- messages
    def show_message(self, s: Session, message_id: str | None = None, text: str | None = None,
                     title: str | None = None, duration: int | None = None, source: str = "admin") -> dict:
        if message_id:
            msg = self.cfg.message(message_id)
            if msg is None:
                raise GameError(f"message inconnu : {message_id}", 404)
            title, text, duration = title or msg.title, msg.text, duration or msg.duration
        if not text or not text.strip():
            raise GameError("message vide", 422)
        st = self.state(s)
        st.tv_message_id = uuid.uuid4().hex
        st.tv_message_title = (title or "Message du Père Noël")[:120]
        st.tv_message_text = text.strip()[:600]
        st.tv_message_until = self.clock() + timedelta(seconds=duration or 20)
        self._touch(st)
        log_event(s, self.clock, "message_shown", f"Message : {st.tv_message_title}",
                  {"message": message_id, "text": st.tv_message_text}, source)
        return {"changed": True, "message_id": st.tv_message_id}

    def _clear_message(self, st: GameState) -> None:
        st.tv_message_id = st.tv_message_title = st.tv_message_text = st.tv_message_until = None

    def clear_message(self, s: Session, source: str = "admin") -> dict:
        st = self.state(s)
        if not st.tv_message_id:
            return {"changed": False}
        self._clear_message(st)
        self._touch(st)
        log_event(s, self.clock, "message_cleared", "Message retiré de la TV", None, source)
        return {"changed": True}

    def expire_message(self, s: Session) -> bool:
        st = self.state(s)
        if st.tv_message_until and st.tv_message_until <= self.clock():
            self._clear_message(st)
            self._touch(st)
            return True
        return False

    def set_ambient(self, s: Session, ambient: str, source: str = "admin") -> dict:
        if ambient not in AMBIENTS:
            raise GameError(f"ambiance inconnue : {ambient}", 422)
        st = self.state(s)
        if st.tv_ambient == ambient:
            return {"changed": False}
        st.tv_ambient = ambient
        self._touch(st)
        log_event(s, self.clock, "ambient_changed", f"Ambiance TV : {ambient}", {"ambient": ambient}, source)
        return {"changed": True}

    def set_show_progress(self, s: Session, visible: bool, source: str = "admin") -> dict:
        """Affiche ou masque l'avancement (équipes + lutins) par-dessus la boucle du bureau."""
        st = self.state(s)
        if bool(st.tv_show_progress) == visible:
            return {"changed": False}
        st.tv_show_progress = visible
        self._touch(st)
        log_event(s, self.clock, "tv_progress", f"Avancement sur la TV : {'affiché' if visible else 'masqué'}",
                  {"visible": visible}, source)
        return {"changed": True}

    # -------------------------------------------------------------- snapshots
    def tv_view(self, s: Session) -> dict:
        st = self.state(s)
        play = None
        if st.tv_play_id:
            play = {"play_id": st.tv_play_id, "started_at": iso(st.tv_play_started_at),
                    "video": self.video_payload(st.tv_video_id)}
        message = None
        if st.tv_message_id and st.tv_message_until and st.tv_message_until > self.clock():
            message = {"id": st.tv_message_id, "title": st.tv_message_title, "text": st.tv_message_text,
                       "until": iso(st.tv_message_until)}
        preload = [f"/media/videos/{v.file}" for v in self.cfg.videos if self.video_available(v.file)]
        return {"play": play, "message": message, "ambient": st.tv_ambient,
                "show_progress": bool(st.tv_show_progress),
                "loop": self.video_payload(self.cfg.loop_video.id), "preload": preload}

    def teams_view(self, s: Session) -> list[dict]:
        rows = {r.team_id: r for r in s.query(TeamProgress).all()}
        return [{"id": t.id, "name": t.name, "theme": t.theme, "color": t.color, "enigma": t.enigma,
                 "description": t.description, "status": rows[t.id].status,
                 "updated_at": iso(rows[t.id].updated_at)} for t in self.cfg.teams]
