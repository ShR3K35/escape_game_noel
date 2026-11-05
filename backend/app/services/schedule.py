"""Planning de la soirée : événements déclenchés automatiquement ou à la main.

- anchor « start » : décalage par rapport à `game.start_time`, appliqué à l'heure réelle de démarrage
  (si la partie démarre à 20h07, l'événement de 20h30 part à 20h37).
- anchor « clock » : heure murale fixe (ex. 23h00) dans le fuseau configuré.
- En mode démonstration, tous les décalages sont divisés par `time_scale`.
- Un événement en retard de plus de `MISSED_GRACE` (ex. après une coupure) est marqué « manqué »
  au lieu d'être joué en rattrapage ; le maître du jeu peut le relancer à la main.
"""

import logging
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.core.game_config import HHMM, AppConfig, ScheduleItemCfg
from app.models import ScheduleState
from app.services.common import Clock, GameError, iso, log_event
from app.services.game import GameService

log = logging.getLogger("noel2026.schedule")
MISSED_GRACE = timedelta(seconds=120)


def _minutes(hhmm: str) -> int:
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


class ScheduleService:
    def __init__(self, cfg: AppConfig, game: GameService, clock: Clock, time_scale: float):
        self.cfg = cfg
        self.game = game
        self.clock = clock
        self.time_scale = time_scale
        self.tz = ZoneInfo(cfg.game.timezone)

    def bootstrap(self, s: Session) -> None:
        for item in self.cfg.schedule:
            if s.get(ScheduleState, item.id) is None:
                s.add(ScheduleState(item_id=item.id, status="pending"))

    def _effective(self, item: ScheduleItemCfg, row: ScheduleState) -> tuple[str, bool]:
        at = row.at_override or item.at
        enabled = item.enabled if row.enabled_override is None else row.enabled_override
        return at, enabled

    def due_at(self, item: ScheduleItemCfg, at: str, started_at: datetime) -> datetime:
        start_min = _minutes(self.cfg.game.start_time)
        offset_min = (_minutes(at) - start_min) % (24 * 60)
        if item.anchor == "clock" and self.time_scale == 1:
            local_start = started_at.replace(tzinfo=UTC).astimezone(self.tz)
            nominal = local_start.replace(hour=start_min // 60, minute=start_min % 60, second=0, microsecond=0)
            if nominal - local_start > timedelta(hours=12):
                nominal -= timedelta(days=1)
            target = (nominal + timedelta(minutes=offset_min)).astimezone(UTC).replace(tzinfo=None)
            return target
        return started_at + timedelta(minutes=offset_min) / self.time_scale

    def view(self, s: Session) -> list[dict]:
        st = self.game.state(s)
        out = []
        for item in self.cfg.schedule:
            row = s.get(ScheduleState, item.id)
            at, enabled = self._effective(item, row)
            due = self.due_at(item, at, st.started_at) if st.started_at else None
            out.append({"id": item.id, "label": item.label, "at": at, "default_at": item.at,
                        "anchor": item.anchor, "action": item.action, "target": item.target,
                        "enabled": enabled, "status": row.status, "fired_at": iso(row.fired_at),
                        "due_at": iso(due), "note": row.note})
        return out

    def _execute(self, s: Session, item: ScheduleItemCfg, source: str) -> None:
        if item.action == "video":
            self.game.play_video(s, item.target, source=source, force=True)
        elif item.action == "message":
            self.game.show_message(s, message_id=item.target, source=source)
        else:
            self.game.set_phase(s, item.target, source=source, confirm=True)

    def fire(self, s: Session, item_id: str, source: str = "admin") -> dict:
        item = self.cfg.schedule_item(item_id)
        if item is None:
            raise GameError(f"événement inconnu : {item_id}", 404)
        row = s.get(ScheduleState, item_id)
        self._execute(s, item, source)
        row.status, row.fired_at, row.note = "done", self.clock(), "déclenché manuellement"
        log_event(s, self.clock, "schedule_fired", f"Événement « {item.label} » déclenché",
                  {"item": item_id, "manual": True}, source)
        return {"changed": True}

    def update(self, s: Session, item_id: str, at: str | None = None, enabled: bool | None = None) -> dict:
        item = self.cfg.schedule_item(item_id)
        if item is None:
            raise GameError(f"événement inconnu : {item_id}", 404)
        row = s.get(ScheduleState, item_id)
        changes = {}
        if at is not None:
            if not HHMM.match(at):
                raise GameError("horaire invalide (HH:MM)", 422)
            row.at_override = None if at == item.at else at
            row.status, row.note = "pending", None
            changes["at"] = at
        if enabled is not None:
            row.enabled_override = None if enabled == item.enabled else enabled
            changes["enabled"] = enabled
        log_event(s, self.clock, "schedule_updated", f"Planning modifié : « {item.label} »",
                  {"item": item_id} | changes, "admin")
        return {"changed": bool(changes)}

    def reset(self, s: Session) -> None:
        for row in s.query(ScheduleState).all():
            row.status, row.fired_at, row.note = "pending", None, None

    def tick(self, s: Session) -> list[str]:
        """Déclenche les événements arrivés à échéance. Retourne les identifiants traités."""
        st = self.game.state(s)
        if not st.started_at:
            return []
        now = self.clock()
        handled = []
        for item in self.cfg.schedule:
            row = s.get(ScheduleState, item.id)
            at, enabled = self._effective(item, row)
            if row.status != "pending" or not enabled:
                continue
            due = self.due_at(item, at, st.started_at)
            if due > now:
                continue
            handled.append(item.id)
            if now - due > MISSED_GRACE:
                row.status, row.note = "skipped", "manqué (serveur indisponible à l'heure prévue)"
                log_event(s, self.clock, "schedule_missed", f"Événement « {item.label} » manqué",
                          {"item": item.id, "due_at": iso(due)}, "scheduler")
                continue
            try:
                self._execute(s, item, "scheduler")
                row.status, row.fired_at, row.note = "done", now, None
                log_event(s, self.clock, "schedule_fired", f"Événement « {item.label} » déclenché",
                          {"item": item.id, "manual": False}, "scheduler")
            except GameError as exc:
                row.status, row.note = "skipped", exc.message[:200]
                log_event(s, self.clock, "schedule_skipped", f"Événement « {item.label} » ignoré : {exc.message}",
                          {"item": item.id}, "scheduler")
            log.info("schedule item handled", extra={"item": item.id, "status": row.status})
        return handled
